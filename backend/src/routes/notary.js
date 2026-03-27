"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notaryController_1 = require("../controllers/notaryController");
const roles_1 = require("../middleware/roles");
const router = (0, express_1.Router)();
router.post("/code/resolve", (0, roles_1.requireRole)(["notary", "admin", "service_role"]), notaryController_1.resolveCode);
router.post("/code/resend", (0, roles_1.requireRole)(["notary", "admin", "service_role"]), notaryController_1.resendCode);
router.post("/code/regenerate", (0, roles_1.requireRole)(["notary", "admin", "service_role"]), notaryController_1.regenerateCode);
router.get("/requests/:id/context", (0, roles_1.requireRole)(["notary", "admin", "service_role"]), notaryController_1.getNotaryContext);
router.post("/requests/:id/sign", (0, roles_1.requireRole)(["notary", "admin", "service_role"]), notaryController_1.signRequest);
router.post("/requests/:id/submit", (0, roles_1.requireRole)(["notary", "admin", "service_role"]), notaryController_1.submitRequest);
exports.default = router;
//# sourceMappingURL=notary.js.map