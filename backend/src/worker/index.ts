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

const workers: Array<Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>> = [];
let notificationOutboxInterval: NodeJS.Timeout | null = null;
let notificationOutboxRunInFlight = false;
let stripeWebhookInterval: NodeJS.Timeout | null = null;
let stripeWebhookRunInFlight = false;

const parsePositiveInt = (value: string | undefined, fallback: number, max: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
};

const notificationOutboxRunnerEnabled = process.env.NOTIFICATION_OUTBOX_RUNNER_ENABLED !== "false";
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
const stripeWebhookRunnerEnabled = process.env.STRIPE_WEBHOOK_RUNNER_ENABLED !== "false";
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

const shutdown = async () => {
  if (notificationOutboxInterval) {
    clearInterval(notificationOutboxInterval);
    notificationOutboxInterval = null;
  }
  if (stripeWebhookInterval) {
    clearInterval(stripeWebhookInterval);
    stripeWebhookInterval = null;
  }

  await Promise.all(workers.map((worker) => worker.close()));
  await flushSentry();

  if (redisConnection) {
    await redisConnection.quit();
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
