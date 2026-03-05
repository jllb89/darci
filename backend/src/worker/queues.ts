import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const connection = redisUrl ? new IORedis(redisUrl) : undefined;

export const hashingQueue = connection
  ? new Queue("hashing", { connection })
  : null;
export const ledgerQueue = connection
  ? new Queue("ledger", { connection })
  : null;
export const webhookQueue = connection
  ? new Queue("webhooks", { connection })
  : null;
