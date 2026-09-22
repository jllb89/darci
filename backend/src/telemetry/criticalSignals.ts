import { randomUUID } from "node:crypto";

export const criticalCategories = ["auth", "notification", "document", "audit", "billing", "retention", "platform"] as const;
export type CriticalCategory = typeof criticalCategories[number];
type Context = {
  level?: string;
  tags?: Record<string, unknown>;
  fingerprint?: string[];
  diagnostic?: { reason: string; probe?: string; checks?: string[]; consecutive?: number };
};

const watchdogReasons = new Set(['dependency_unready', 'queue_probe_failed', 'probe_failed']);
const watchdogChecks = new Set(['database', 'configuration', 'identityProtection', 'redis', 'worker']);
const watchdogProbes = new Set(['notificationOverdue', 'notificationFailed', 'stripeOverdue', 'generationOverdue']);
function safeDiagnostic(value: Context['diagnostic']) {
  if (!value || !watchdogReasons.has(value.reason)) return undefined;
  return {
    reason: value.reason,
    ...(value.probe && watchdogProbes.has(value.probe) ? { probe: value.probe } : {}),
    ...(Array.isArray(value.checks) ? { checks: [...new Set(value.checks.filter(check => watchdogChecks.has(check)))] } : {}),
    ...(Number.isSafeInteger(value.consecutive) && value.consecutive! > 0 && value.consecutive! <= 100 ? { consecutive: value.consecutive } : {}),
  };
}

// Deliberately do not serialize messages, stacks, provider errors, arbitrary tags,
// URLs, identifiers or context objects. These logs feed the independent AWS route.
export function buildCriticalSignal(category: CriticalCategory, context?: Context) {
  const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
  return {
    kind: "darci_critical_signal",
    category,
    environment: process.env.APP_ENV === "production" ? "production" : process.env.APP_ENV === "staging" ? "staging" : "local",
    correlationId: uuid(context?.tags?.request_id) ?? randomUUID(),
    ...(uuid(context?.tags?.document_id) ? { documentId: uuid(context?.tags?.document_id) } : {}),
    ...(safeDiagnostic(context?.diagnostic) ? { diagnostic: safeDiagnostic(context?.diagnostic) } : {}),
    at: new Date().toISOString(),
  };
}

export function classifyCriticalSignal(context?: Context): CriticalCategory | null {
  const level = context?.level ?? "error";
  const fields = [context?.tags?.telemetry_area, context?.tags?.error_family, context?.tags?.operation,
    context?.tags?.worker_queue, ...(context?.fingerprint ?? [])].filter(v => typeof v === "string").join(" ").toLowerCase();
  // Bad credentials, expired sessions and user cancellations are not outages.
  if (!["error", "fatal"].includes(level)) {
    if (!(fields.includes("billing-reconciliation") && fields.includes("blocking-drift"))) return null;
  }
  if (/retention/.test(fields)) return "retention";
  if (/audit/.test(fields)) return "audit";
  if (/stripe|billing/.test(fields)) return "billing";
  if (/auth|token|session/.test(fields)) return "auth";
  if (/notification|outbox|email|sms/.test(fields)) return "notification";
  if (/pdf|storage|generation|template|signing|notarization|finalization/.test(fields)) return "document";
  return "platform";
}

export function emitCriticalSignal(category: CriticalCategory, context?: Context) {
  const signal = buildCriticalSignal(category, context);
  if (process.env.NODE_ENV !== "test") console.error(JSON.stringify(signal));
  return signal;
}

export function emitCapturedCriticalSignal(context?: Context) {
  const category = classifyCriticalSignal(context);
  if (category) emitCriticalSignal(category, context);
}
