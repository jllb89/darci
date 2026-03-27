"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const vitest_1 = require("vitest");
const mocks = vitest_1.vi.hoisted(() => ({
    getNotarizationCodeByValueMock: vitest_1.vi.fn(),
    getNotarizationRequestByIdMock: vitest_1.vi.fn(),
    getOrCreateUserIdMock: vitest_1.vi.fn(),
    updateNotarizationCodeMock: vitest_1.vi.fn(),
    updateNotarizationRequestMock: vitest_1.vi.fn(),
    recordAuditEventMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../../src/services/documentService", () => ({
    getNotarizationCodeByValue: mocks.getNotarizationCodeByValueMock,
    getNotarizationRequestById: mocks.getNotarizationRequestByIdMock,
    getOrCreateUserId: mocks.getOrCreateUserIdMock,
    updateNotarizationCode: mocks.updateNotarizationCodeMock,
    updateNotarizationRequest: mocks.updateNotarizationRequestMock,
}));
vitest_1.vi.mock("../../src/services/auditService", () => ({
    recordAuditEvent: mocks.recordAuditEventMock,
}));
const index_1 = require("../../src/index");
const signToken = (payload) => {
    const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn: "1h" });
};
const logResponse = (label, response) => {
    console.log(label, {
        status: response.status,
        body: response.body,
    });
};
const postWithLog = async (path, payload, label, token) => {
    console.log("request", { method: "POST", path, payload });
    let req = (0, supertest_1.default)(index_1.app).post(path).send(payload);
    if (token) {
        req = req.set("Authorization", `Bearer ${token}`);
    }
    const response = await req;
    logResponse(label, response);
    return response;
};
(0, vitest_1.describe)("POST /notary/code/resolve", () => {
    (0, vitest_1.beforeEach)(() => {
        process.env.SUPABASE_JWT_SECRET = "test-secret";
        mocks.getNotarizationCodeByValueMock.mockReset();
        mocks.getNotarizationRequestByIdMock.mockReset();
        mocks.getOrCreateUserIdMock.mockReset();
        mocks.updateNotarizationCodeMock.mockReset();
        mocks.updateNotarizationRequestMock.mockReset();
        mocks.recordAuditEventMock.mockReset();
    });
    (0, vitest_1.it)("resolves code and assigns notary", async () => {
        mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
        mocks.getNotarizationCodeByValueMock.mockResolvedValue({
            id: "code-1",
            request_id: "req-1",
            code: "NTR-1234",
            status: "active",
            expires_at: "2099-03-05T00:30:00.000Z",
            consumed_at: null,
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.getNotarizationRequestByIdMock.mockResolvedValue({
            id: "req-1",
            document_id: "doc-1",
            assigned_notary_id: null,
            status: "pending",
            submitted_at: "2026-03-05T00:00:00.000Z",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.updateNotarizationCodeMock.mockResolvedValue({
            id: "code-1",
            request_id: "req-1",
            code: "NTR-1234",
            status: "consumed",
            expires_at: "2099-03-05T00:30:00.000Z",
            consumed_at: "2026-03-05T00:01:00.000Z",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.updateNotarizationRequestMock.mockResolvedValue({
            id: "req-1",
            document_id: "doc-1",
            assigned_notary_id: "notary-1",
            status: "in_review",
            submitted_at: "2026-03-05T00:00:00.000Z",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        const token = signToken({
            sub: "notary-user-1",
            app_metadata: { role: "notary" },
        });
        const response = await postWithLog("/notary/code/resolve", { code: "NTR-1234" }, "resolves code and assigns notary", token);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body).toEqual({
            request: {
                id: "req-1",
                documentId: "doc-1",
                status: "in_review",
            },
            code: {
                id: "code-1",
                code: "NTR-1234",
                status: "consumed",
                expiresAt: "2099-03-05T00:30:00.000Z",
            },
        });
        (0, vitest_1.expect)(mocks.recordAuditEventMock).toHaveBeenCalledTimes(3);
    });
    (0, vitest_1.it)("requires auth", async () => {
        const response = await postWithLog("/notary/code/resolve", { code: "NTR-1234" }, "requires auth");
        (0, vitest_1.expect)(response.status).toBe(401);
    });
    (0, vitest_1.it)("returns 404 for unknown code", async () => {
        mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
        mocks.getNotarizationCodeByValueMock.mockResolvedValue(null);
        const token = signToken({
            sub: "notary-user-1",
            app_metadata: { role: "notary" },
        });
        const response = await postWithLog("/notary/code/resolve", { code: "NTR-0000" }, "returns 404 for unknown code", token);
        (0, vitest_1.expect)(response.status).toBe(404);
    });
    (0, vitest_1.it)("rejects expired code", async () => {
        mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
        mocks.getNotarizationCodeByValueMock.mockResolvedValue({
            id: "code-1",
            request_id: "req-1",
            code: "NTR-1234",
            status: "active",
            expires_at: "2020-03-05T00:30:00.000Z",
            consumed_at: null,
            created_at: "2020-03-05T00:00:00.000Z",
        });
        const token = signToken({
            sub: "notary-user-1",
            app_metadata: { role: "notary" },
        });
        const response = await postWithLog("/notary/code/resolve", { code: "NTR-1234" }, "rejects expired code", token);
        (0, vitest_1.expect)(response.status).toBe(400);
    });
    (0, vitest_1.it)("rejects consumed code", async () => {
        mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
        mocks.getNotarizationCodeByValueMock.mockResolvedValue({
            id: "code-1",
            request_id: "req-1",
            code: "NTR-1234",
            status: "consumed",
            expires_at: "2026-03-05T00:30:00.000Z",
            consumed_at: "2026-03-05T00:00:10.000Z",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        const token = signToken({
            sub: "notary-user-1",
            app_metadata: { role: "notary" },
        });
        const response = await postWithLog("/notary/code/resolve", { code: "NTR-1234" }, "rejects consumed code", token);
        (0, vitest_1.expect)(response.status).toBe(409);
    });
    (0, vitest_1.it)("rejects assigned request", async () => {
        mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
        mocks.getNotarizationCodeByValueMock.mockResolvedValue({
            id: "code-1",
            request_id: "req-1",
            code: "NTR-1234",
            status: "active",
            expires_at: "2099-03-05T00:30:00.000Z",
            consumed_at: null,
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.getNotarizationRequestByIdMock.mockResolvedValue({
            id: "req-1",
            document_id: "doc-1",
            assigned_notary_id: "notary-2",
            status: "pending",
            submitted_at: "2026-03-05T00:00:00.000Z",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        const token = signToken({
            sub: "notary-user-1",
            app_metadata: { role: "notary" },
        });
        const response = await postWithLog("/notary/code/resolve", { code: "NTR-1234" }, "rejects assigned request", token);
        (0, vitest_1.expect)(response.status).toBe(409);
    });
    (0, vitest_1.it)("rejects non-notary role", async () => {
        const token = signToken({
            sub: "member-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/notary/code/resolve", { code: "NTR-1234" }, "rejects non-notary role", token);
        (0, vitest_1.expect)(response.status).toBe(403);
    });
});
//# sourceMappingURL=notary-code-resolve.test.js.map