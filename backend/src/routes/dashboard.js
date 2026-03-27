"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboardController_1 = require("../controllers/dashboardController");
const roles_1 = require("../middleware/roles");
const router = (0, express_1.Router)();
router.get("/member", (0, roles_1.requireRole)(["member", "admin", "service_role"]), dashboardController_1.getMemberDashboard);
exports.default = router;
//# sourceMappingURL=dashboard.js.map