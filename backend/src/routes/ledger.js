"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ledgerController_1 = require("../controllers/ledgerController");
const roles_1 = require("../middleware/roles");
const router = (0, express_1.Router)();
router.post("/anchor", (0, roles_1.requireRole)(["admin", "service_role"]), ledgerController_1.anchorLedger);
exports.default = router;
//# sourceMappingURL=ledger.js.map