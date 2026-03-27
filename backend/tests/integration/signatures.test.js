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
    createSignatureRecordMock: vitest_1.vi.fn(),
    getSignatureByIdMock: vitest_1.vi.fn(),
    createSignatureUploadUrlMock: vitest_1.vi.fn(),
    getSignatureObjectMetadataMock: vitest_1.vi.fn(),
    recordAuditEventMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../../src/services/documentService", () => ({
    getDocumentById: mocks.getDocumentByIdMock,
    getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
    createSignatureRecord: mocks.createSignatureRecordMock,
    getSignatureById: mocks.getSignatureByIdMock,
}));
vitest_1.vi.mock("../../src/services/storageService", () => ({
    createSignatureUploadUrl: mocks.createSignatureUploadUrlMock,
    getSignatureObjectMetadata: mocks.getSignatureObjectMetadataMock,
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
(0, vitest_1.describe)("member signature capture", () => {
    (0, vitest_1.beforeEach)(() => {
        process.env.SUPABASE_JWT_SECRET = "test-secret";
        mocks.getDocumentByIdMock.mockReset();
        mocks.getUserIdBySupabaseIdMock.mockReset();
        mocks.createSignatureRecordMock.mockReset();
        mocks.getSignatureByIdMock.mockReset();
        mocks.createSignatureUploadUrlMock.mockReset();
        mocks.getSignatureObjectMetadataMock.mockReset();
        mocks.recordAuditEventMock.mockReset();
    });
    (0, vitest_1.it)("requests a signature upload", async () => {
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
        mocks.createSignatureRecordMock.mockResolvedValue({
            id: "sig-1",
            document_id: "doc-1",
            signer_id: "owner-1",
            signature_type: "member",
            storage_path: "signatures/doc-1/sig-1.png",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        mocks.createSignatureUploadUrlMock.mockResolvedValue({
            bucket: "signatures",
            path: "signatures/doc-1/sig-1.png",
            signedUrl: "https://upload.example.com",
            token: "token",
        });
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/signatures/request", {
            fileName: "sig.png",
            fileSize: 1024,
            mimeType: "image/png",
        }, "requests a signature upload", token);
        (0, vitest_1.expect)(response.status).toBe(201);
        (0, vitest_1.expect)(response.body.signature.id).toBe("sig-1");
    });
    (0, vitest_1.it)("rejects invalid signature mime type", async () => {
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/signatures/request", {
            fileName: "sig.pdf",
            fileSize: 1024,
            mimeType: "application/pdf",
        }, "rejects invalid signature mime type", token);
        (0, vitest_1.expect)(response.status).toBe(400);
    });
    (0, vitest_1.it)("rejects oversized signature", async () => {
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/signatures/request", {
            fileName: "sig.png",
            fileSize: 6 * 1024 * 1024,
            mimeType: "image/png",
        }, "rejects oversized signature", token);
        (0, vitest_1.expect)(response.status).toBe(400);
    });
    (0, vitest_1.it)("finalizes signature upload", async () => {
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
        mocks.getSignatureByIdMock.mockResolvedValue({
            id: "sig-1",
            document_id: "doc-1",
            signer_id: "owner-1",
            signature_type: "member",
            storage_path: "signatures/doc-1/sig-1.png",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        mocks.getSignatureObjectMetadataMock.mockResolvedValue({
            sizeBytes: 1024,
            mimeType: "image/png",
        });
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/signatures/finalize", {
            signatureId: "sig-1",
        }, "finalizes signature upload", token);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body.signature.status).toBe("captured");
    });
    (0, vitest_1.it)("rejects missing signature upload", async () => {
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
        mocks.getSignatureByIdMock.mockResolvedValue({
            id: "sig-1",
            document_id: "doc-1",
            signer_id: "owner-1",
            signature_type: "member",
            storage_path: "signatures/doc-1/sig-1.png",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        mocks.getSignatureObjectMetadataMock.mockResolvedValue(null);
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/signatures/finalize", {
            signatureId: "sig-1",
        }, "rejects missing signature upload", token);
        (0, vitest_1.expect)(response.status).toBe(404);
    });
    (0, vitest_1.it)("rejects invalid signature mime type on finalize", async () => {
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
        mocks.getSignatureByIdMock.mockResolvedValue({
            id: "sig-1",
            document_id: "doc-1",
            signer_id: "owner-1",
            signature_type: "member",
            storage_path: "signatures/doc-1/sig-1.png",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        mocks.getSignatureObjectMetadataMock.mockResolvedValue({
            sizeBytes: 1024,
            mimeType: "application/pdf",
        });
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/signatures/finalize", {
            signatureId: "sig-1",
        }, "rejects invalid signature mime type on finalize", token);
        (0, vitest_1.expect)(response.status).toBe(400);
    });
    (0, vitest_1.it)("rejects oversized signature on finalize", async () => {
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
        mocks.getSignatureByIdMock.mockResolvedValue({
            id: "sig-1",
            document_id: "doc-1",
            signer_id: "owner-1",
            signature_type: "member",
            storage_path: "signatures/doc-1/sig-1.png",
            created_at: "2026-03-05T00:00:10.000Z",
        });
        mocks.getSignatureObjectMetadataMock.mockResolvedValue({
            sizeBytes: 6 * 1024 * 1024,
            mimeType: "image/png",
        });
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await postWithLog("/documents/doc-1/signatures/finalize", {
            signatureId: "sig-1",
        }, "rejects oversized signature on finalize", token);
        (0, vitest_1.expect)(response.status).toBe(400);
    });
});
//# sourceMappingURL=signatures.test.js.map