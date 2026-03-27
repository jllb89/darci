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
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const signOutMock = vitest_1.vi.fn();
const setSessionMock = vitest_1.vi.fn();
const createClientMock = vitest_1.vi.fn();
vitest_1.vi.mock("@supabase/supabase-js", () => ({
    createClient: (...args) => createClientMock(...args),
}));
(0, vitest_1.describe)("logout", () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.resetModules();
        vitest_1.vi.clearAllMocks();
        process.env.SUPABASE_URL = "https://example.supabase.co";
        process.env.SUPABASE_ANON_KEY = "anon-key";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
        createClientMock
            .mockReturnValueOnce({ auth: {} })
            .mockReturnValueOnce({ auth: {} })
            .mockReturnValue({
            auth: {
                setSession: setSessionMock,
                signOut: signOutMock,
            },
        });
    });
    (0, vitest_1.it)("revokes the current session when bearer and refresh token are provided", async () => {
        setSessionMock.mockResolvedValue({ error: null });
        signOutMock.mockResolvedValue({ error: null });
        const { logout } = await Promise.resolve().then(() => __importStar(require("../../src/controllers/authController.ts")));
        const json = vitest_1.vi.fn();
        const status = vitest_1.vi.fn(() => ({ json }));
        const req = {
            headers: { authorization: "Bearer access-token" },
            body: { refreshToken: "refresh-token" },
            user: { id: "user-1" },
        };
        const res = {
            status,
        };
        await logout(req, res);
        (0, vitest_1.expect)(setSessionMock).toHaveBeenCalledWith({
            access_token: "access-token",
            refresh_token: "refresh-token",
        });
        (0, vitest_1.expect)(signOutMock).toHaveBeenCalledWith({ scope: "global" });
        (0, vitest_1.expect)(status).toHaveBeenCalledWith(200);
        (0, vitest_1.expect)(json).toHaveBeenCalledWith({
            status: "ok",
            message: "Signed out",
        });
    });
    (0, vitest_1.it)("rejects logout without a refresh token", async () => {
        const { logout } = await Promise.resolve().then(() => __importStar(require("../../src/controllers/authController.ts")));
        const json = vitest_1.vi.fn();
        const status = vitest_1.vi.fn(() => ({ json }));
        const req = {
            headers: { authorization: "Bearer access-token" },
            body: {},
            user: { id: "user-1" },
        };
        const res = {
            status,
        };
        await logout(req, res);
        (0, vitest_1.expect)(setSessionMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(status).toHaveBeenCalledWith(400);
    });
});
//# sourceMappingURL=authController.logout.test.js.map