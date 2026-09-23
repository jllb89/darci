import "../instrument";
import { Worker } from "bullmq";
import { bullMqPrefix, connection } from "./queues";
import { processDocumentGenerationRun } from "../services/documentGenerationRenderService";
import { hashDocument } from "../services/hashingService";
import { anchorToLedger } from "../services/ledgerService";
import { runDueNotificationJobs } from "../services/notificationOutboxService";
import { deliverWebhook } from "../services/webhookService";
import { captureException, flushSentry } from "../utils/sentry";
import { runDueStripeWebhookEvents } from "../services/stripeWebhookService";
import { publishWorkerHeartbeat } from "../services/operationalHealthService";
import { getSafetyRedis } from "../middleware/productionSafety";
import { runOperationalWatchdog } from "../services/operationalWatchdogService";
import { reconcileQueuedGenerationRuns } from "../services/generationQueueRecoveryService";
import { isRecoveryQuarantined } from "./recoveryQuarantine";
import {
  getBillingOperationsReport,
  runStripeWebhookRetentionCleanup,
} from "../services/billingOperationsService";

type HashingJobData = {
  documentId: string;
  requestId?: string | null;
  content?: string;
  idn?: string;
};

type LedgerJobData = {
  idn: string;
  hash: string;
  requestId?: string | null;
};

type WebhookJobData = {
  url: string;
  payload: Record<string, unknown>;
  requestId?: string | null;
};

type GenerationRunJobData = {
  runId: string;
  requestId?: string | null;
};

const redisConnection = connection;
let heartbeatAlertAt = 0;
const heartbeat = async () => {
  try { await publishWorkerHeartbeat(); }
  catch (error) {
    if (Date.now() - heartbeatAlertAt > 60_000) {
      heartbeatAlertAt = Date.now();
      captureException(new Error("Worker heartbeat could not be published"), { tags: { service: "worker", operation: "heartbeat" } });
    }
  }
};
const heartbeatInterval = process.env.REDIS_URL ? setInterval(() => { void heartbeat(); }, 30_000) : null;
if (heartbeatInterval) void heartbeat();

const workers: Array<Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>> = [];
let watchdogInFlight = false;
const watchdog = async () => {
  if (watchdogInFlight) return;
  watchdogInFlight = true;
  try { await runOperationalWatchdog(); } finally { watchdogInFlight = false; }
};
const watchdogInterval = process.env.NODE_ENV === "production" ? setInterval(() => { void watchdog(); }, 60_000) : null;
if (watchdogInterval) void watchdog();
let notificationOutboxInterval: NodeJS.Timeout | null = null;
let notificationOutboxRunInFlight = false;
let stripeWebhookInterval: NodeJS.Timeout | null = null;
let stripeWebhookRunInFlight = false;
let billingReconciliationInterval: NodeJS.Timeout | null = null;
let billingReconciliationRunInFlight = false;
let stripeRetentionInterval: NodeJS.Timeout | null = null;
let stripeRetentionRunInFlight = false;
let generationRecoveryInterval: NodeJS.Timeout | null = null;
let generationRecoveryInFlight = false;
const recoveryQuarantined = isRecoveryQuarantined();

const parsePositiveInt = (value: string | undefined, fallback: number, max: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const notificationOutboxRunnerEnabled = !recoveryQuarantined && process.env.NOTIFICATION_OUTBOX_RUNNER_ENABLED !== "false";
const notificationOutboxIntervalMs = parsePositiveInt(
  process.env.NOTIFICATION_OUTBOX_RUNNER_INTERVAL_SECONDS,
  60,
  60 * 60,
) * 1000;
const notificationOutboxRunLimit = parsePositiveInt(
  process.env.NOTIFICATION_OUTBOX_RUN_LIMIT,
  25,
  100,
);
const stripeWebhookRunnerEnabled = !recoveryQuarantined && process.env.STRIPE_WEBHOOK_RUNNER_ENABLED !== "false";
const stripeWebhookIntervalMs = parsePositiveInt(
  process.env.STRIPE_WEBHOOK_RUNNER_INTERVAL_SECONDS,
  30,
  60 * 60,
) * 1000;
const stripeWebhookRunLimit = parsePositiveInt(
  process.env.STRIPE_WEBHOOK_RUN_LIMIT,
  25,
  100,
);
const billingReconciliationRunnerEnabled = !recoveryQuarantined && process.env.BILLING_RECONCILIATION_RUNNER_ENABLED !== "false";
const billingReconciliationIntervalMs = parsePositiveInt(
  process.env.BILLING_RECONCILIATION_INTERVAL_SECONDS,
  15 * 60,
  24 * 60 * 60,
) * 1000;
const stripeRetentionRunnerEnabled = !recoveryQuarantined && process.env.STRIPE_WEBHOOK_RETENTION_RUNNER_ENABLED !== "false";
const stripeRetentionIntervalMs = parsePositiveInt(
  process.env.STRIPE_WEBHOOK_RETENTION_INTERVAL_SECONDS,
  24 * 60 * 60,
  7 * 24 * 60 * 60,
) * 1000;
const stripeRetentionRunLimit = parsePositiveInt(
  process.env.STRIPE_WEBHOOK_RETENTION_RUN_LIMIT,
  100,
  500,
);

const summarizeJobData = (data: unknown) => {
  if (!data || typeof data !== "object") {
    return null;
  }

  const record = data as Record<string, unknown>;
  return {
    keys: Object.keys(record),
    documentId: typeof record.documentId === "string" ? record.documentId : null,
    generationRunId: typeof record.runId === "string" ? record.runId : null,
    requestId: typeof record.requestId === "string" ? record.requestId : null,
    idn: typeof record.idn === "string" ? record.idn : null,
    urlHost:
      typeof record.url === "string"
        ? (() => {
            try {
              return new URL(record.url).host;
            } catch {
              return null;
            }
          })()
        : null,
  };
};

const attachWorkerTelemetry = (
  worker: Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>,
) => {
  worker.on("failed", (job, error) => {
    captureException(error, {
      level: "error",
      tags: {
        service: "worker",
        worker_queue: worker.name,
        job_name: job?.name,
      },
      contexts: {
        bullmq_job: {
          id: job?.id ?? null,
          name: job?.name ?? null,
          queueName: worker.name,
          attemptsMade: job?.attemptsMade ?? null,
          attemptsStarted: job?.attemptsStarted ?? null,
          failedReason: job?.failedReason ?? null,
          data: summarizeJobData(job?.data),
        },
      },
      fingerprint: ["worker", worker.name, job?.name ?? "unknown"],
    });
  });

  worker.on("error", (error) => {
    captureException(error, {
      level: "error",
      tags: {
        service: "worker",
        worker_queue: worker.name,
      },
      contexts: {
        bullmq_worker: {
          queueName: worker.name,
        },
      },
      fingerprint: ["worker", worker.name, "worker_error"],
    });
  });
};

if (!redisConnection) {
  console.warn("REDIS_URL is not set; background workers are disabled.");
} else {
  const workerOptions = { connection: redisConnection, prefix: bullMqPrefix };

  workers.push(
    new Worker<HashingJobData>(
      "hashing",
      async (job) => {
        const { documentId, content, idn } = job.data;
        const result = await hashDocument(documentId, content);

        return {
          jobId: job.id,
          documentId: result.documentId,
          hash: result.hash,
          idn,
        };
      },
      workerOptions,
    ) as Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>,
  );

  workers.push(
    new Worker<LedgerJobData>(
      "ledger",
      async (job) => {
        const { idn, hash } = job.data;
        const result = await anchorToLedger(idn, hash);

        return {
          jobId: job.id,
          idn: result.idn,
          hash: result.hash,
          ledgerTxId: result.ledgerTxId,
          status: result.status,
        };
      },
      workerOptions,
    ) as Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>,
  );

  workers.push(
    new Worker<WebhookJobData>(
      "webhooks",
      async (job) => {
        const { url, payload } = job.data;
        const result = await deliverWebhook(url, payload);

        return {
          jobId: job.id,
          url: result.url,
          status: result.status,
        };
      },
      workerOptions,
    ) as Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>,
  );

  workers.push(
    new Worker<GenerationRunJobData>(
      "generation-runs",
      async (job) => {
        return processDocumentGenerationRun({
          runId: job.data.runId,
          requestId: typeof job.data.requestId === "string" ? job.data.requestId : null,
          rendererJobId: `${job.queueName}:${String(job.id ?? job.data.runId)}`,
        });
      },
      workerOptions,
    ) as Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>,
  );

  workers.forEach(attachWorkerTelemetry);
}

// A Redis restart/restore must not strand a durably queued document. This only
// reconstructs delivery for queued runs; interrupted rendering requires review.
if (redisConnection && !recoveryQuarantined && process.env.GENERATION_RECOVERY_RUNNER_ENABLED !== "false") {
  const recover = async () => {
    if (generationRecoveryInFlight) return;
    generationRecoveryInFlight = true;
    try {
      const result = await reconcileQueuedGenerationRuns();
      if (result.enqueued) console.log("Generation delivery reconstructed", result);
    } catch {
      captureException(new Error("Generation delivery reconstruction failed"), {
        level: "error", tags: { service: "worker", worker_queue: "generation-runs" },
        fingerprint: ["worker", "generation-runs", "recovery"],
      });
    } finally { generationRecoveryInFlight = false; }
  };
  generationRecoveryInterval = setInterval(() => { void recover(); }, 60_000);
  void recover();
}

const runNotificationOutboxOnce = async () => {
  if (notificationOutboxRunInFlight) {
    return;
  }

  notificationOutboxRunInFlight = true;
  try {
    const result = await runDueNotificationJobs({
      limit: notificationOutboxRunLimit,
      workerId: process.env.NOTIFICATION_OUTBOX_WORKER_ID ?? "worker-scheduled",
    });
    if (result.processedCount > 0) {
      console.log("Notification outbox scheduled run complete", {
        scannedCount: result.scannedCount,
        claimedCount: result.claimedCount,
        processedCount: result.processedCount,
      });
    }
  } catch (error) {
    captureException(error, {
      level: "error",
      tags: {
        service: "worker",
        worker_queue: "notification-outbox",
      },
      fingerprint: ["worker", "notification-outbox", "scheduled-run"],
    });
    console.error("Notification outbox scheduled run failed", error instanceof Error ? error.message : error);
  } finally {
    notificationOutboxRunInFlight = false;
  }
};

if (notificationOutboxRunnerEnabled) {
  notificationOutboxInterval = setInterval(() => {
    void runNotificationOutboxOnce();
  }, notificationOutboxIntervalMs);
  void runNotificationOutboxOnce();
  console.log("Notification outbox scheduled runner started", {
    intervalSeconds: notificationOutboxIntervalMs / 1000,
    limit: notificationOutboxRunLimit,
  });
}

const runStripeWebhookInboxOnce = async () => {
  if (stripeWebhookRunInFlight) return;
  stripeWebhookRunInFlight = true;
  try {
    const result = await runDueStripeWebhookEvents({
      limit: stripeWebhookRunLimit,
      workerId: process.env.STRIPE_WEBHOOK_WORKER_ID ?? "worker-scheduled",
    });
    if (result.scannedCount > 0) {
      console.log("Stripe webhook inbox scheduled run complete", {
        scannedCount: result.scannedCount,
      });
    }
  } catch (error) {
    captureException(error, {
      level: "error",
      tags: { service: "worker", worker_queue: "stripe-webhook-inbox" },
      fingerprint: ["worker", "stripe-webhook-inbox", "scheduled-run"],
    });
    console.error("Stripe webhook inbox scheduled run failed", error instanceof Error ? error.message : error);
  } finally {
    stripeWebhookRunInFlight = false;
  }
};

if (stripeWebhookRunnerEnabled) {
  stripeWebhookInterval = setInterval(() => {
    void runStripeWebhookInboxOnce();
  }, stripeWebhookIntervalMs);
  void runStripeWebhookInboxOnce();
  console.log("Stripe webhook inbox scheduled runner started", {
    intervalSeconds: stripeWebhookIntervalMs / 1000,
    limit: stripeWebhookRunLimit,
  });
}

const runBillingReconciliationOnce = async () => {
  if (billingReconciliationRunInFlight) return;
  billingReconciliationRunInFlight = true;
  try {
    const report = await getBillingOperationsReport({ includeProvider: true, webhookLimit: 500 });
    if (report.readiness.blockingIssueCount > 0) {
      const error = new Error(`Billing reconciliation found ${report.readiness.blockingIssueCount} blocking issue(s)`);
      captureException(error, {
        level: report.counts.critical > 0 ? "error" : "warning",
        tags: { service: "worker", worker_queue: "billing-reconciliation" },
        contexts: {
          billing_reconciliation: {
            generatedAt: report.generatedAt,
            critical: report.counts.critical,
            high: report.counts.high,
            medium: report.counts.medium,
            issueCodes: [...new Set(report.issues.slice(0, 25).map((issue) => issue.code))],
          },
        },
        fingerprint: ["worker", "billing-reconciliation", "blocking-drift"],
      });
      console.error("Billing reconciliation found blocking drift", {
        critical: report.counts.critical,
        high: report.counts.high,
        issueCodes: [...new Set(report.issues.slice(0, 25).map((issue) => issue.code))],
      });
    }
  } catch (error) {
    captureException(error, {
      level: "error",
      tags: { service: "worker", worker_queue: "billing-reconciliation" },
      fingerprint: ["worker", "billing-reconciliation", "runner-failed"],
    });
    console.error("Billing reconciliation runner failed", error instanceof Error ? error.message : error);
  } finally {
    billingReconciliationRunInFlight = false;
  }
};

if (billingReconciliationRunnerEnabled) {
  billingReconciliationInterval = setInterval(() => {
    void runBillingReconciliationOnce();
  }, billingReconciliationIntervalMs);
  void runBillingReconciliationOnce();
  console.log("Billing reconciliation runner started", {
    intervalSeconds: billingReconciliationIntervalMs / 1000,
  });
}

const runStripeRetentionOnce = async () => {
  if (stripeRetentionRunInFlight) return;
  stripeRetentionRunInFlight = true;
  try {
    const result = await runStripeWebhookRetentionCleanup({ limit: stripeRetentionRunLimit });
    if (result.redactedCount > 0) {
      console.log("Stripe webhook retention cleanup complete", result);
    }
  } catch (error) {
    captureException(error, {
      level: "error",
      tags: { service: "worker", worker_queue: "stripe-webhook-retention" },
      fingerprint: ["worker", "stripe-webhook-retention", "runner-failed"],
    });
    console.error("Stripe webhook retention cleanup failed", error instanceof Error ? error.message : error);
  } finally {
    stripeRetentionRunInFlight = false;
  }
};

if (stripeRetentionRunnerEnabled) {
  stripeRetentionInterval = setInterval(() => {
    void runStripeRetentionOnce();
  }, stripeRetentionIntervalMs);
  void runStripeRetentionOnce();
  console.log("Stripe webhook retention runner started", {
    intervalSeconds: stripeRetentionIntervalMs / 1000,
    limit: stripeRetentionRunLimit,
  });
}

const shutdown = async () => {
  if (generationRecoveryInterval) clearInterval(generationRecoveryInterval);
  if (watchdogInterval) clearInterval(watchdogInterval);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  if (notificationOutboxInterval) {
    clearInterval(notificationOutboxInterval);
    notificationOutboxInterval = null;
  }
  if (stripeWebhookInterval) {
    clearInterval(stripeWebhookInterval);
    stripeWebhookInterval = null;
  }
  if (billingReconciliationInterval) {
    clearInterval(billingReconciliationInterval);
    billingReconciliationInterval = null;
  }
  if (stripeRetentionInterval) {
    clearInterval(stripeRetentionInterval);
    stripeRetentionInterval = null;
  }

  await Promise.all(workers.map((worker) => worker.close()));
  await flushSentry();

  if (redisConnection) {
    await redisConnection.quit();
  }
  if (process.env.REDIS_URL) getSafetyRedis().disconnect();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
