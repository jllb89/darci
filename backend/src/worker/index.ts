import { Worker } from "bullmq";
import { connection } from "./queues";
import { processDocumentGenerationRun } from "../services/documentGenerationRenderService";
import { hashDocument } from "../services/hashingService";
import { anchorToLedger } from "../services/ledgerService";
import { deliverWebhook } from "../services/webhookService";

type HashingJobData = {
  documentId: string;
  content?: string;
  idn?: string;
};

type LedgerJobData = {
  idn: string;
  hash: string;
};

type WebhookJobData = {
  url: string;
  payload: Record<string, unknown>;
};

type GenerationRunJobData = {
  runId: string;
};

const redisConnection = connection;

const workers: Array<Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>> = [];

if (!redisConnection) {
  console.warn("REDIS_URL is not set; background workers are disabled.");
} else {
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
      { connection: redisConnection },
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
      { connection: redisConnection },
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
      { connection: redisConnection },
    ) as Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>,
  );

  workers.push(
    new Worker<GenerationRunJobData>(
      "generation-runs",
      async (job) => {
        return processDocumentGenerationRun({
          runId: job.data.runId,
          rendererJobId: `${job.queueName}:${String(job.id ?? job.data.runId)}`,
        });
      },
      { connection: redisConnection },
    ) as Worker<HashingJobData | LedgerJobData | WebhookJobData | GenerationRunJobData>,
  );
}

const shutdown = async () => {
  await Promise.all(workers.map((worker) => worker.close()));

  if (redisConnection) {
    await redisConnection.quit();
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
