import "../instrument";
import { Worker } from "bullmq";
import { bullMqPrefix, connection } from "./queues";
import { processDocumentGenerationRun } from "../services/documentGenerationRenderService";
import { hashDocument } from "../services/hashingService";
import { anchorToLedger } from "../services/ledgerService";
import { deliverWebhook } from "../services/webhookService";
import { captureException, flushSentry } from "../utils/sentry";

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

const shutdown = async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  await flushSentry();

  if (redisConnection) {
    await redisConnection.quit();
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
