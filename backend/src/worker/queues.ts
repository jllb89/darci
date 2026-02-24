import { Queue } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL is required for BullMQ queues");
}

export const connection = new IORedis(redisUrl);

export const hashingQueue = new Queue("hashing", { connection });
export const ledgerQueue = new Queue("ledger", { connection });
export const webhookQueue = new Queue("webhooks", { connection });
