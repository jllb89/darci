import { createClient } from "@supabase/supabase-js";
import { checkOperationalReadiness } from "./operationalHealthService";
import { buildCriticalSignal, emitCriticalSignal, type CriticalCategory } from "../telemetry/criticalSignals";

export type WatchdogSnapshot = {
  ready: boolean;
  notificationOverdue: boolean;
  notificationFailed: boolean;
  stripeOverdue: boolean;
  generationOverdue: boolean;
  unreadyDependencies?: string[];
};

class WatchdogProbeError extends Error {
  constructor(readonly probe: string) { super('Operational queue probe failed'); }
}

export function evaluateWatchdog(snapshot: WatchdogSnapshot): CriticalCategory[] {
  const signals: CriticalCategory[] = [];
  if (!snapshot.ready) signals.push("platform");
  if (snapshot.notificationOverdue || snapshot.notificationFailed) signals.push("notification");
  if (snapshot.stripeOverdue) signals.push("billing");
  if (snapshot.generationOverdue) signals.push("document");
  return signals;
}

export function generationOverdueFilter(overdue: string) {
  // Generation runs have lifecycle timestamps, not an updated_at column.
  // An old run legitimately retried now must get a fresh rendering window.
  return `and(status.eq.queued,created_at.lt.${overdue}),and(status.eq.rendering,started_at.lt.${overdue}),and(status.eq.rendering,started_at.is.null,created_at.lt.${overdue})`;
}

export async function readWatchdogSnapshot(): Promise<WatchdogSnapshot> {
  const db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  const overdue = new Date(Date.now() - 5 * 60_000).toISOString();
  const recent = new Date(Date.now() - 10 * 60_000).toISOString();
  const [health, notifications, failures, stripe, generation] = await Promise.all([
    checkOperationalReadiness(),
    db.from("notification_jobs").select("id").in("status", ["queued", "scheduled", "processing"]).lt("scheduled_for", overdue).limit(1).abortSignal(AbortSignal.timeout(5000)),
    db.from("notification_jobs").select("id").in("status", ["failed", "partially_sent"]).gte("updated_at", recent).limit(1).abortSignal(AbortSignal.timeout(5000)),
    db.from("stripe_webhook_events").select("id").in("status", ["received", "processing", "failed", "dead_lettered"]).lt("received_at", overdue).limit(1).abortSignal(AbortSignal.timeout(5000)),
    db.from("document_generation_runs").select("id").or(generationOverdueFilter(overdue)).limit(1).abortSignal(AbortSignal.timeout(5000)),
  ]);
  for (const [probe, result] of [['notificationOverdue', notifications], ['notificationFailed', failures], ['stripeOverdue', stripe], ['generationOverdue', generation]] as const) {
    if (result.error) throw new WatchdogProbeError(probe);
  }
  return { ready: health.ready, notificationOverdue: !!notifications.data?.length, notificationFailed: !!failures.data?.length,
    stripeOverdue: !!stripe.data?.length, generationOverdue: !!generation.data?.length,
    ...(!health.ready ? { unreadyDependencies: Object.entries(health.checks ?? {}).filter(([,ready])=>!ready).map(([name])=>name) } : {}) };
}

export function createOperationalWatchdogRunner() {
  let consecutivePlatformFailures = 0;
  const platformFailure = (diagnostic: {reason:string;probe?:string;checks?:string[]}) => {
    consecutivePlatformFailures = Math.min(consecutivePlatformFailures + 1, 100);
    const context = { diagnostic: { ...diagnostic, consecutive: consecutivePlatformFailures } };
    // A single bounded dependency timeout is diagnostic, not an outage page.
    // Direct critical application errors and durable backlog alerts remain immediate.
    if (consecutivePlatformFailures >= 2) emitCriticalSignal('platform', context);
    else console.warn(JSON.stringify({ ...buildCriticalSignal('platform', context), kind:'darci_watchdog_transient' }));
  };
  return async () => {
    try {
      const snapshot = await readWatchdogSnapshot();
      if (!snapshot.ready) platformFailure({reason:'dependency_unready', checks:snapshot.unreadyDependencies ?? []});
      else consecutivePlatformFailures = 0;
      for (const category of evaluateWatchdog(snapshot)) if(category !== 'platform') emitCriticalSignal(category);
      // Only a completed probe emits a heartbeat. Five missing probes still page.
      console.log(JSON.stringify({ kind: "darci_watchdog_heartbeat", at: new Date().toISOString() }));
    } catch(error) {
      platformFailure(error instanceof WatchdogProbeError ? {reason:'queue_probe_failed',probe:error.probe} : {reason:'probe_failed'});
    }
  };
}

export const runOperationalWatchdog = createOperationalWatchdogRunner();
