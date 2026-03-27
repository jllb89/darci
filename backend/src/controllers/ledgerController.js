"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anchorLedger = void 0;
const zod_1 = require("zod");
const jobs_1 = require("../worker/jobs");
const validation_1 = require("../utils/validation");
const anchorSchema = zod_1.z.object({
    idn: zod_1.z.string().min(1),
    hash: zod_1.z.string().min(1),
}).passthrough();
const anchorLedger = async (req, res) => {
    const parsed = anchorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
    }
    const { idn, hash } = parsed.data;
    const jobId = idn && hash ? await (0, jobs_1.enqueueLedgerAnchor)({ idn, hash }) : null;
    res.status(200).json({
        status: "ok",
        message: jobId
            ? `TODO: hash and anchor IDN + hash to ledger (job ${jobId})`
            : "TODO: hash and anchor IDN + hash to ledger",
    });
};
exports.anchorLedger = anchorLedger;
//# sourceMappingURL=ledgerController.js.map