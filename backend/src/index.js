"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
require("./instrument");
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const Sentry = __importStar(require("@sentry/node"));
const cors_1 = __importDefault(require("cors"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yamljs_1 = __importDefault(require("yamljs"));
const auth_1 = require("./middleware/auth");
const auth_2 = __importDefault(require("./routes/auth"));
const admin_1 = __importDefault(require("./routes/admin"));
const documents_1 = __importDefault(require("./routes/documents"));
const notary_1 = __importDefault(require("./routes/notary"));
const ledger_1 = __importDefault(require("./routes/ledger"));
const verify_1 = __importDefault(require("./routes/verify"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const rules_1 = __importDefault(require("./routes/rules"));
const usersController_1 = require("./controllers/usersController");
exports.app = (0, express_1.default)();
const isDevelopment = process.env.NODE_ENV !== "production";
const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
];
exports.app.use((0, cors_1.default)({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
}));
exports.app.use(express_1.default.json());
if (isDevelopment) {
    exports.app.use((req, res, next) => {
        const startedAt = Date.now();
        res.on("finish", () => {
            const durationMs = Date.now() - startedAt;
            console.log(`[api] ${req.method} ${req.originalUrl} -> ${res.statusCode} ${durationMs}ms`);
        });
        next();
    });
}
const openapiPath = path_1.default.resolve(__dirname, "../../api/openapi.yaml");
const openapiSpec = yamljs_1.default.load(openapiPath);
exports.app.use("/docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapiSpec));
exports.app.get("/openapi.yaml", (_req, res) => {
    res.sendFile(openapiPath);
});
exports.app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});
if (process.env.ENABLE_SENTRY_DEBUG_ROUTE === "true") {
    exports.app.get("/debug-sentry", (_req, _res) => {
        throw new Error("Sentry debug error");
    });
}
exports.app.use(auth_1.requireAuth);
exports.app.use("/auth", auth_2.default);
exports.app.use("/admin", admin_1.default);
exports.app.get("/users/me", usersController_1.getMe);
exports.app.use("/dashboard", dashboard_1.default);
exports.app.use("/rules", rules_1.default);
exports.app.use("/documents", documents_1.default);
exports.app.use("/notary", notary_1.default);
exports.app.use("/ledger", ledger_1.default);
exports.app.use("/verify", verify_1.default);
exports.app.use((_req, res) => {
    res.status(404).json({
        error: "not_found",
        message: "Route not found",
    });
});
if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(exports.app);
}
exports.app.use((err, _req, res, _next) => {
    res.status(500).json({ error: "internal_error", message: err.message });
});
if (require.main === module) {
    const port = process.env.PORT ? Number(process.env.PORT) : 4000;
    exports.app.listen(port, () => {
        console.log(`DARCI API listening on ${port} (pid ${process.pid}, env ${process.env.NODE_ENV ?? "development"})`);
    });
}
//# sourceMappingURL=index.js.map