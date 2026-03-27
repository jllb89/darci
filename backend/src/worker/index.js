"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const queues_1 = require("./queues");
const hashingService_1 = require("../services/hashingService");
const ledgerService_1 = require("../services/ledgerService");
const webhookService_1 = require("../services/webhookService");
const hashingWorker = new bullmq_1.Worker("hashing", async (job) => {
    const { documentId, content, idn } = job.data;
    const result = await (0, hashingService_1.hashDocument)(documentId, content);
    return {
        jobId: job.id,
        documentId: result.documentId,
        hash: result.hash,
        idn,
    };
}, { connection: queues_1.connection });
const ledgerWorker = new bullmq_1.Worker("ledger", async (job) => {
    const { idn, hash } = job.data;
    const result = await (0, ledgerService_1.anchorToLedger)(idn, hash);
    return {
        jobId: job.id,
        idn: result.idn,
        hash: result.hash,
        ledgerTxId: result.ledgerTxId,
        status: result.status,
    };
}, { connection: queues_1.connection });
const webhookWorker = new bullmq_1.Worker("webhooks", async (job) => {
    const { url, payload } = job.data;
    const result = await (0, webhookService_1.deliverWebhook)(url, payload);
    return {
        jobId: job.id,
        url: result.url,
        status: result.status,
    };
}, { connection: queues_1.connection });
const shutdown = async () => {
    await Promise.all([
        hashingWorker.close(),
        ledgerWorker.close(),
        webhookWorker.close(),
    ]);
    await queues_1.connection.quit();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
//# sourceMappingURL=index.js.map