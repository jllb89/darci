"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminController_1 = require("../controllers/adminController");
const roles_1 = require("../middleware/roles");
const router = (0, express_1.Router)();
router.patch("/users/:id/role", (0, roles_1.requireRole)(["admin", "service_role"]), adminController_1.updateUserRole);
exports.default = router;
//# sourceMappingURL=admin.js.map