"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const vitest_1 = require("vitest");
const mocks = vitest_1.vi.hoisted(() => ({
    getDocumentByIdMock: vitest_1.vi.fn(),
    getUserIdBySupabaseIdMock: vitest_1.vi.fn(),
    getActiveNotarizationRequestMock: vitest_1.vi.fn(),
    createNotarizationRequestMock: vitest_1.vi.fn(),
    createNotarizationCodeMock: vitest_1.vi.fn(),
    updateDocumentMock: vitest_1.vi.fn(),
    recordAuditEventMock: vitest_1.vi.fn(),
    enqueueWebhookMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../../src/services/documentService", () => ({
    getDocumentById: mocks.getDocumentByIdMock,
    getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
    getActiveNotarizationRequest: mocks.getActiveNotarizationRequestMock,
    createNotarizationRequest: mocks.createNotarizationRequestMock,
    createNotarizationCode: mocks.createNotarizationCodeMock,
    updateDocument: mocks.updateDocumentMock,
}));
vitest_1.vi.mock("../../src/services/auditService", () => ({
    recordAuditEvent: mocks.recordAuditEventMock,
}));
vitest_1.vi.mock("../../src/worker/jobs", () => ({
    enqueueWebhook: mocks.enqueueWebhookMock,
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
const postWithLog = async (path, token, payload, label) => {
    console.log("request", { method: "POST", path, payload });
    const response = await (0, supertest_1.default)(index_1.app)
        .post(path)
        .set("Authorization", `Bearer ${token}`)
        .send(payload);
    logResponse(label, response);
    return response;
};
(0, vitest_1.describe)("submit notarization", () => {
    (0, vitest_1.beforeEach)(() => {
        process.env.SUPABASE_JWT_SECRET = "test-secret";
        process.env.NOTARIZATION_CODE_TTL_MINUTES = "30";
        mocks.getDocumentByIdMock.mockReset();
        mocks.getUserIdBySupabaseIdMock.mockReset();
        mocks.getActiveNotarizationRequestMock.mockReset();
        mocks.createNotarizationRequestMock.mockReset();
        mocks.createNotarizationCodeMock.mockReset();
        mocks.updateDocumentMock.mockReset();
        mocks.recordAuditEventMock.mockReset();
        mocks.enqueueWebhookMock.mockReset();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)("creates request and code", async () => {
        mocks.getDocumentByIdMock.mockResolvedValue({
            id: "doc-1",
            owner_id: "owner-1",
            idn: "IDN-123",
            status: "pending_signature",
            document_type: "generic",
            jurisdiction: "US-OH",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
        mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
        mocks.createNotarizationRequestMock.mockResolvedValue({
            id: "req-1",
            document_id: "doc-1",
            assigned_notary_id: null,
            status: "pending",
            submitted_at: "2026-03-05T00:00:10.000Z",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        mocks.createNotarizationCodeMock.mockResolvedValue({
            id: "code-1",
            request_id: "req-1",
            code: "NTR-1234",
            status: "active",
            expires_at: "2026-03-05T00:30:00.000Z",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/submit-notarization", token, {}, "creates request and code");
        (0, vitest_1.expect)(response.status).toBe(201);
        (0, vitest_1.expect)(response.body.request.id).toBe("req-1");
        (0, vitest_1.expect)(response.body.code.id).toBe("code-1");
        (0, vitest_1.expect)(response.body.document.status).toBe("pending_notary");
    });
    (0, vitest_1.it)("returns 404 when document is missing", async () => {
        mocks.getDocumentByIdMock.mockResolvedValue(null);
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-404/submit-notarization", token, {}, "returns 404 when document is missing");
        (0, vitest_1.expect)(response.status).toBe(404);
    });
    (0, vitest_1.it)("uses TTL minutes for code expiry", async () => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date("2026-03-05T00:00:00.000Z"));
        process.env.NOTARIZATION_CODE_TTL_MINUTES = "45";
        mocks.getDocumentByIdMock.mockResolvedValue({
            id: "doc-1",
            owner_id: "owner-1",
            idn: "IDN-123",
            status: "pending_signature",
            document_type: "generic",
            jurisdiction: "US-OH",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
        mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
        mocks.createNotarizationRequestMock.mockResolvedValue({
            id: "req-1",
            document_id: "doc-1",
            assigned_notary_id: null,
            status: "pending",
            submitted_at: "2026-03-05T00:00:10.000Z",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        mocks.createNotarizationCodeMock.mockResolvedValue({
            id: "code-1",
            request_id: "req-1",
            code: "NTR-1234",
            status: "active",
            expires_at: "2026-03-05T00:45:00.000Z",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/submit-notarization", token, {}, "uses TTL minutes for code expiry");
        (0, vitest_1.expect)(response.status).toBe(201);
        (0, vitest_1.expect)(mocks.createNotarizationCodeMock).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
            requestId: "req-1",
            expiresAt: "2026-03-05T00:45:00.000Z",
        }));
    });
    (0, vitest_1.it)("retries on code collision", async () => {
        mocks.getDocumentByIdMock.mockResolvedValue({
            id: "doc-1",
            owner_id: "owner-1",
            idn: "IDN-123",
            status: "pending_signature",
            document_type: "generic",
            jurisdiction: "US-OH",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
        mocks.getActiveNotarizationRequestMock.mockResolvedValue(null);
        mocks.createNotarizationRequestMock.mockResolvedValue({
            id: "req-1",
            document_id: "doc-1",
            assigned_notary_id: null,
            status: "pending",
            submitted_at: "2026-03-05T00:00:10.000Z",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        mocks.createNotarizationCodeMock
            .mockRejectedValueOnce(new Error("duplicate key"))
            .mockResolvedValueOnce({
            id: "code-1",
            request_id: "req-1",
            code: "NTR-5678",
            status: "active",
            expires_at: "2026-03-05T00:30:00.000Z",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/submit-notarization", token, {}, "retries on code collision");
        (0, vitest_1.expect)(response.status).toBe(201);
        (0, vitest_1.expect)(mocks.createNotarizationCodeMock).toHaveBeenCalledTimes(2);
        (0, vitest_1.expect)(response.body.code.code).toBe("NTR-5678");
    });
    (0, vitest_1.it)("rejects wrong status", async () => {
        mocks.getDocumentByIdMock.mockResolvedValue({
            id: "doc-1",
            owner_id: "owner-1",
            idn: null,
            status: "draft",
            document_type: "generic",
            jurisdiction: "US-OH",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/submit-notarization", token, {}, "rejects wrong status");
        (0, vitest_1.expect)(response.status).toBe(400);
    });
    (0, vitest_1.it)("rejects existing request", async () => {
        mocks.getDocumentByIdMock.mockResolvedValue({
            id: "doc-1",
            owner_id: "owner-1",
            idn: null,
            status: "pending_signature",
            document_type: "generic",
            jurisdiction: "US-OH",
            created_at: "2026-03-05T00:00:00.000Z",
        });
        mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
        mocks.getActiveNotarizationRequestMock.mockResolvedValue({
            id: "req-1",
            document_id: "doc-1",
            assigned_notary_id: null,
            status: "pending",
            submitted_at: "2026-03-05T00:00:10.000Z",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/submit-notarization", token, {}, "rejects existing request");
        (0, vitest_1.expect)(response.status).toBe(409);
    });
});
//# sourceMappingURL=notarization-submit.test.js.map