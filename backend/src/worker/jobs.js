"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueWebhook = exports.enqueueLedgerAnchor = exports.enqueueHashing = void 0;
const queues_1 = require("./queues");
const enqueueHashing = async (input) => {
    if (!queues_1.hashingQueue) {
        throw new Error("Hashing queue is not configured. Set REDIS_URL.");
    }
    const job = await queues_1.hashingQueue.add("hash-document", input);
    return job.id;
};
exports.enqueueHashing = enqueueHashing;
const enqueueLedgerAnchor = async (input) => {
    if (!queues_1.ledgerQueue) {
        throw new Error("Ledger queue is not configured. Set REDIS_URL.");
    }
    const job = await queues_1.ledgerQueue.add("anchor-ledger", input);
    return job.id;
};
exports.enqueueLedgerAnchor = enqueueLedgerAnchor;
const enqueueWebhook = async (input) => {
    if (!queues_1.webhookQueue) {
        throw new Error("Webhook queue is not configured. Set REDIS_URL.");
    }
    const job = await queues_1.webhookQueue.add("deliver-webhook", input);
    return job.id;
};
exports.enqueueWebhook = enqueueWebhook;
//# sourceMappingURL=jobs.js.map