import { createClient } from "@supabase/supabase-js";
import { checkOperationalReadiness } from "./operationalHealthService";
import { emitCriticalSignal, type CriticalCategory } from "../telemetry/criticalSignals";

export type WatchdogSnapshot = {
  ready: boolean;
  notificationOverdue: boolean;
  notificationFailed: boolean;
  stripeOverdue: boolean;
  generationOverdue: boolean;
};

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
  for (const result of [notifications, failures, stripe, generation]) {
    if (result.error) throw new Error("Operational queue probe failed");
  }
  return { ready: health.ready, notificationOverdue: !!notifications.data?.length, notificationFailed: !!failures.data?.length,
    stripeOverdue: !!stripe.data?.length, generationOverdue: !!generation.data?.length };
}

export async function runOperationalWatchdog() {
  try {
    const snapshot = await readWatchdogSnapshot();
    for (const category of evaluateWatchdog(snapshot)) emitCriticalSignal(category);
    // Only a completed probe emits a heartbeat. AWS alarms on missing data if
    // the worker dies, hangs, or cannot inspect its durable queues.
    console.log(JSON.stringify({ kind: "darci_watchdog_heartbeat", at: new Date().toISOString() }));
  } catch {
    emitCriticalSignal("platform");
  }
}
