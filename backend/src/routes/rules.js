"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const poaController_1 = require("../controllers/poaController");
const roles_1 = require("../middleware/roles");
const router = (0, express_1.Router)();
router.get("/poa", (0, roles_1.requireRole)(["member", "notary", "admin", "service_role"]), poaController_1.listPoaJurisdictionsForType);
router.get("/poa/:jurisdiction", (0, roles_1.requireRole)(["member", "notary", "admin", "service_role"]), poaController_1.getPoaRequirementByJurisdiction);
exports.default = router;
//# sourceMappingURL=rules.js.map