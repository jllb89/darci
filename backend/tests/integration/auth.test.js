"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const vitest_1 = require("vitest");
const index_1 = require("../../src/index");
const signToken = (payload) => {
    const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: "1h" });
};
(0, vitest_1.describe)("auth middleware", () => {
    (0, vitest_1.it)("rejects requests without a token", async () => {
        const response = await (0, supertest_1.default)(index_1.app).get("/documents");
        (0, vitest_1.expect)(response.status).toBe(401);
        (0, vitest_1.expect)(response.body.error).toBe("unauthorized");
    });
    (0, vitest_1.it)("rejects requests with invalid role", async () => {
        process.env.SUPABASE_JWT_SECRET = "test-secret";
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await (0, supertest_1.default)(index_1.app)
            .post("/notary/requests/req-1/sign")
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(response.status).toBe(403);
        (0, vitest_1.expect)(response.body.error).toBe("forbidden");
    });
    (0, vitest_1.it)("allows notary role for notary endpoints", async () => {
        process.env.SUPABASE_JWT_SECRET = "test-secret";
        const token = signToken({
            sub: "notary-1",
            app_metadata: { role: "notary" },
        });
        const response = await (0, supertest_1.default)(index_1.app)
            .post("/notary/requests/req-1/sign")
            .set("Authorization", `Bearer ${token}`);
        (0, vitest_1.expect)(response.status).toBe(200);
    });
});
//# sourceMappingURL=auth.test.js.map