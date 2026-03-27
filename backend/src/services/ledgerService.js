"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anchorToLedger = void 0;
const anchorToLedger = async (idn, hash) => {
    return {
        idn,
        hash,
        status: "anchored",
        ledgerTxId: `ledger_${idn}`,
    };
};
exports.anchorToLedger = anchorToLedger;
//# sourceMappingURL=ledgerService.js.map