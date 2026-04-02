import { Worker } from "bullmq";
import { connection } from "./queues";
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

const redisConnection = connection;

if (!redisConnection) {
  throw new Error("REDIS_URL must be set to start workers");
}

const hashingWorker = new Worker<HashingJobData>(
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
  { connection: redisConnection }
);

const ledgerWorker = new Worker<LedgerJobData>(
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
  { connection: redisConnection }
);

const webhookWorker = new Worker<WebhookJobData>(
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
  { connection: redisConnection }
);

const shutdown = async () => {
  await Promise.all([
    hashingWorker.close(),
    ledgerWorker.close(),
    webhookWorker.close(),
  ]);
  await redisConnection.quit();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
