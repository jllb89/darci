import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;
export const bullMqPrefix = process.env.BULLMQ_KEY_PREFIX ?? "{darci}:bull";

export const connection = redisUrl
  ? new IORedis(redisUrl, { maxRetriesPerRequest: null })
  : undefined;

export const hashingQueue = connection
  ? new Queue("hashing", { connection, prefix: bullMqPrefix })
  : null;
export const ledgerQueue = connection
  ? new Queue("ledger", { connection, prefix: bullMqPrefix })
  : null;
export const webhookQueue = connection
  ? new Queue("webhooks", { connection, prefix: bullMqPrefix })
  : null;
export const generationQueue = connection
  ? new Queue("generation-runs", { connection, prefix: bullMqPrefix })
  : null;

