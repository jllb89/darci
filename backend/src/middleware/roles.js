"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = void 0;
const requireRole = (roles) => {
    return (req, res, next) => {
        const role = req.user?.role;
        if (!role || !roles.includes(role)) {
            console.warn("Access denied", { path: req.path, role });
            return res.status(403).json({
                error: "forbidden",
                message: "Insufficient permissions",
            });
        }
        return next();
    };
};
exports.requireRole = requireRole;
//# sourceMappingURL=roles.js.map