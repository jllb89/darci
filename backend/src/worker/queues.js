"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookQueue = exports.ledgerQueue = exports.hashingQueue = exports.connection = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const redisUrl = process.env.REDIS_URL;
exports.connection = redisUrl ? new ioredis_1.default(redisUrl) : undefined;
exports.hashingQueue = exports.connection
    ? new bullmq_1.Queue("hashing", { connection: exports.connection })
    : null;
exports.ledgerQueue = exports.connection
    ? new bullmq_1.Queue("ledger", { connection: exports.connection })
    : null;
exports.webhookQueue = exports.connection
    ? new bullmq_1.Queue("webhooks", { connection: exports.connection })
    : null;
//# sourceMappingURL=queues.js.map