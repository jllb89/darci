import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const connection = redisUrl
  ? new IORedis(redisUrl, { maxRetriesPerRequest: null })
  : undefined;

export const hashingQueue = connection
  ? new Queue("hashing", { connection })
  : null;
export const ledgerQueue = connection
  ? new Queue("ledger", { connection })
  : null;
export const webhookQueue = connection
  ? new Queue("webhooks", { connection })
  : null;
export const generationQueue = connection
  ? new Queue("generation-runs", { connection })
  : null;
