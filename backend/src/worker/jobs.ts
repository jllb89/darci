import { hashingQueue, ledgerQueue, webhookQueue } from "./queues";

type HashingJobInput = {
  documentId: string;
  content?: string;
  idn?: string;
};

type LedgerJobInput = {
  idn: string;
  hash: string;
};

type WebhookJobInput = {
  url: string;
  payload: Record<string, unknown>;
};

export const enqueueHashing = async (input: HashingJobInput) => {
  if (!hashingQueue) {
    throw new Error("Hashing queue is not configured. Set REDIS_URL.");
  }
  const job = await hashingQueue.add("hash-document", input);
  return job.id;
};

export const enqueueLedgerAnchor = async (input: LedgerJobInput) => {
  if (!ledgerQueue) {
    throw new Error("Ledger queue is not configured. Set REDIS_URL.");
  }
  const job = await ledgerQueue.add("anchor-ledger", input);
  return job.id;
};

export const enqueueWebhook = async (input: WebhookJobInput) => {
  if (!webhookQueue) {
    throw new Error("Webhook queue is not configured. Set REDIS_URL.");
  }
  const job = await webhookQueue.add("deliver-webhook", input);
  return job.id;
};
