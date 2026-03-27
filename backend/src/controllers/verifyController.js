"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDocument = void 0;
const verifyDocument = async (req, res) => {
    res.status(200).json({
        idn: req.params.idn,
        hash: "TODO_HASH",
        ledgerTxId: "TODO_LEDGER_TX",
        anchoredAt: new Date().toISOString(),
        status: "unverified",
    });
};
exports.verifyDocument = verifyDocument;
//# sourceMappingURL=verifyController.js.map