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
const supertest_1 = __importDefault(require("supertest"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const vitest_1 = require("vitest");
const express_1 = __importDefault(require("express"));
const signOutMock = vitest_1.vi.fn();
const setSessionMock = vitest_1.vi.fn();
const createClientMock = vitest_1.vi.fn();
vitest_1.vi.mock("@supabase/supabase-js", () => ({
    createClient: (...args) => createClientMock(...args),
}));
const signToken = (payload) => {
    const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: "1h" });
};
const buildSupabaseClient = () => ({
    auth: {
        signInWithPassword: vitest_1.vi.fn(),
        setSession: setSessionMock,
        signOut: signOutMock,
    },
    from: vitest_1.vi.fn(() => ({
        select: vitest_1.vi.fn(() => ({
            eq: vitest_1.vi.fn(() => ({
                limit: vitest_1.vi.fn(() => ({
                    maybeSingle: vitest_1.vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
            })),
        })),
    })),
});
const buildTestApp = async () => {
    const { requireAuth } = await Promise.resolve().then(() => __importStar(require("../../src/middleware/auth.ts")));
    const { logout } = await Promise.resolve().then(() => __importStar(require("../../src/controllers/authController.ts")));
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    app.use(requireAuth);
    app.post("/auth/logout", logout);
    return app;
};
(0, vitest_1.describe)("POST /auth/logout", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.resetModules();
        vitest_1.vi.clearAllMocks();
        process.env.SUPABASE_URL = "https://example.supabase.co";
        process.env.SUPABASE_ANON_KEY = "anon-key";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
        process.env.SUPABASE_JWT_SECRET = "test-secret";
        createClientMock.mockImplementation(() => buildSupabaseClient());
    });
    (0, vitest_1.it)("revokes the Supabase session through the Express route", async () => {
        setSessionMock.mockResolvedValue({ error: null });
        signOutMock.mockResolvedValue({ error: null });
        const app = await buildTestApp();
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await (0, supertest_1.default)(app)
            .post("/auth/logout")
            .set("Authorization", `Bearer ${token}`)
            .send({ refreshToken: "refresh-token" });
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body).toEqual({
            status: "ok",
            message: "Signed out",
        });
        (0, vitest_1.expect)(setSessionMock).toHaveBeenCalledWith({
            access_token: token,
            refresh_token: "refresh-token",
        });
        (0, vitest_1.expect)(signOutMock).toHaveBeenCalledWith({ scope: "global" });
    });
    (0, vitest_1.it)("returns validation error when refresh token is missing", async () => {
        const app = await buildTestApp();
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await (0, supertest_1.default)(app)
            .post("/auth/logout")
            .set("Authorization", `Bearer ${token}`)
            .send({});
        (0, vitest_1.expect)(response.status).toBe(400);
        (0, vitest_1.expect)(response.body.error).toBe("validation_error");
        (0, vitest_1.expect)(setSessionMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(signOutMock).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=auth-logout.test.js.map