"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const vitest_1 = require("vitest");
const mocks = vitest_1.vi.hoisted(() => ({
    getOrCreateUserIdMock: vitest_1.vi.fn(),
    listDocumentsMock: vitest_1.vi.fn(),
    listRecentAuditEventsForDocumentIdsMock: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../../src/services/documentService", () => ({
    getOrCreateUserId: mocks.getOrCreateUserIdMock,
    listDocuments: mocks.listDocumentsMock,
}));
vitest_1.vi.mock("../../src/services/auditService", () => ({
    listRecentAuditEventsForDocumentIds: mocks.listRecentAuditEventsForDocumentIdsMock,
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
const getWithLog = async (path, label, token) => {
    console.log("request", { method: "GET", path });
    let req = (0, supertest_1.default)(index_1.app).get(path);
    if (token) {
        req = req.set("Authorization", `Bearer ${token}`);
    }
    const response = await req;
    logResponse(label, response);
    return response;
};
(0, vitest_1.describe)("GET /dashboard/member", () => {
    (0, vitest_1.beforeEach)(() => {
        process.env.SUPABASE_JWT_SECRET = "test-secret";
        mocks.getOrCreateUserIdMock.mockReset();
        mocks.listDocumentsMock.mockReset();
        mocks.listRecentAuditEventsForDocumentIdsMock.mockReset();
    });
    (0, vitest_1.it)("requires auth", async () => {
        const response = await getWithLog("/dashboard/member", "requires auth");
        (0, vitest_1.expect)(response.status).toBe(401);
    });
    (0, vitest_1.it)("returns dashboard data", async () => {
        mocks.getOrCreateUserIdMock.mockResolvedValue("owner-1");
        mocks.listDocumentsMock.mockResolvedValue([
            {
                id: "doc-0",
                owner_id: "owner-1",
                idn: null,
                status: "draft",
                document_type: "generic",
                jurisdiction: "US-OH",
                created_at: "2026-03-05T00:00:00.000Z",
            },
            {
                id: "doc-1",
                owner_id: "owner-1",
                idn: "IDN-123",
                status: "pending_signature",
                document_type: "generic",
                jurisdiction: "US-OH",
                created_at: "2026-03-05T00:00:00.000Z",
            },
            {
                id: "doc-2",
                owner_id: "owner-1",
                idn: "IDN-456",
                status: "pending_notary",
                document_type: "template",
                jurisdiction: "US-OH",
                created_at: "2026-03-05T00:01:00.000Z",
            },
            {
                id: "doc-3",
                owner_id: "owner-1",
                idn: "IDN-789",
                status: "completed",
                document_type: "generic",
                jurisdiction: "US-OH",
                created_at: "2026-03-05T00:02:00.000Z",
            },
        ]);
        mocks.listRecentAuditEventsForDocumentIdsMock.mockResolvedValue([
            {
                id: "evt-1",
                actor_id: "owner-1",
                entity_type: "document",
                entity_id: "doc-1",
                action: "member.document_upload_completed",
                metadata: { document_id: "doc-1" },
                created_at: "2026-03-05T00:03:00.000Z",
            },
            {
                id: "evt-2",
                actor_id: null,
                entity_type: "signature",
                entity_id: "sig-1",
                action: "system.signature_linked_to_document",
                metadata: { document_id: "doc-2" },
                created_at: "2026-03-05T00:04:00.000Z",
            },
        ]);
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await getWithLog("/dashboard/member", "returns dashboard data", token);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body).toEqual({
            documents: [
                {
                    id: "doc-0",
                    idn: null,
                    status: "draft",
                    documentType: "generic",
                    jurisdiction: "US-OH",
                    createdAt: "2026-03-05T00:00:00.000Z",
                },
                {
                    id: "doc-1",
                    idn: "IDN-123",
                    status: "pending_signature",
                    documentType: "generic",
                    jurisdiction: "US-OH",
                    createdAt: "2026-03-05T00:00:00.000Z",
                },
                {
                    id: "doc-2",
                    idn: "IDN-456",
                    status: "pending_notary",
                    documentType: "template",
                    jurisdiction: "US-OH",
                    createdAt: "2026-03-05T00:01:00.000Z",
                },
                {
                    id: "doc-3",
                    idn: "IDN-789",
                    status: "completed",
                    documentType: "generic",
                    jurisdiction: "US-OH",
                    createdAt: "2026-03-05T00:02:00.000Z",
                },
            ],
            activity: [
                {
                    action: "member.document_upload_completed",
                    timestamp: "2026-03-05T00:03:00.000Z",
                    documentId: "doc-1",
                    entityType: "document",
                    entityId: "doc-1",
                },
                {
                    action: "system.signature_linked_to_document",
                    timestamp: "2026-03-05T00:04:00.000Z",
                    documentId: "doc-2",
                    entityType: "signature",
                    entityId: "sig-1",
                },
            ],
            counts: {
                draft: 1,
                pendingSignature: 1,
                pendingNotary: 1,
                completed: 1,
                total: 4,
            },
        });
        (0, vitest_1.expect)(mocks.listRecentAuditEventsForDocumentIdsMock).toHaveBeenCalledWith(["doc-0", "doc-1", "doc-2", "doc-3"], 20, "owner-1");
    });
    (0, vitest_1.it)("returns dashboard for admin memberId", async () => {
        mocks.listDocumentsMock.mockResolvedValue([
            {
                id: "doc-1",
                owner_id: "owner-42",
                idn: "IDN-123",
                status: "pending_signature",
                document_type: "generic",
                jurisdiction: "US-OH",
                created_at: "2026-03-05T00:00:00.000Z",
            },
        ]);
        mocks.listRecentAuditEventsForDocumentIdsMock.mockResolvedValue([]);
        const token = signToken({
            sub: "admin-1",
            app_metadata: { role: "admin" },
        });
        const response = await getWithLog("/dashboard/member?memberId=owner-42", "returns dashboard for admin memberId", token);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(mocks.getOrCreateUserIdMock).not.toHaveBeenCalled();
        (0, vitest_1.expect)(mocks.listDocumentsMock).toHaveBeenCalledWith("owner-42");
        (0, vitest_1.expect)(mocks.listRecentAuditEventsForDocumentIdsMock).toHaveBeenCalledWith(["doc-1"], 20, "owner-42");
    });
    (0, vitest_1.it)("rejects memberId for non-admin", async () => {
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await getWithLog("/dashboard/member?memberId=owner-42", "rejects memberId for non-admin", token);
        (0, vitest_1.expect)(response.status).toBe(403);
    });
    (0, vitest_1.it)("returns empty dashboard when no documents", async () => {
        mocks.getOrCreateUserIdMock.mockResolvedValue("owner-1");
        mocks.listDocumentsMock.mockResolvedValue([]);
        const token = signToken({
            sub: "user-1",
            app_metadata: { role: "member" },
        });
        const response = await getWithLog("/dashboard/member", "returns empty dashboard when no documents", token);
        (0, vitest_1.expect)(response.status).toBe(200);
        (0, vitest_1.expect)(response.body).toEqual({
            documents: [],
            activity: [],
            counts: {
                draft: 0,
                pendingSignature: 0,
                pendingNotary: 0,
                completed: 0,
                total: 0,
            },
        });
        (0, vitest_1.expect)(mocks.listRecentAuditEventsForDocumentIdsMock).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=dashboard-member.test.js.map