import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  getUserIdBySupabaseIdMock: vi.fn(),
  getActiveNotarizationRequestMock: vi.fn(),
  createNotarizationRequestMock: vi.fn(),
  createNotarizationCodeMock: vi.fn(),
  updateDocumentMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  enqueueWebhookMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
  getActiveNotarizationRequest: mocks.getActiveNotarizationRequestMock,
  createNotarizationRequest: mocks.createNotarizationRequestMock,
  createNotarizationCode: mocks.createNotarizationCodeMock,
  updateDocument: mocks.updateDocumentMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/worker/jobs", () => ({
  enqueueWebhook: mocks.enqueueWebhookMock,
}));

import { app } from "../../src/index";

type TokenPayload = {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string };
};

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

const logResponse = (label: string, response: request.Response) => {
  console.log(label, {
    status: response.status,
    body: response.body,
  });
};

const postWithLog = async (
  path: string,
  token: string,
  payload: Record<string, unknown>,
  label: string
) => {
  console.log("request", { method: "POST", path, payload });
  const response = await request(app)
    .post(path)
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
  logResponse(label, response);
  return response;
};

describe("submit notarization", () => {
  beforeEach(() => {
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates request and code", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "creates request and code"
    );

    expect(response.status).toBe(201);
    expect(response.body.request.id).toBe("req-1");
    expect(response.body.code.id).toBe("code-1");
    expect(response.body.document.status).toBe("pending_notary");
  });

  it("returns 404 when document is missing", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue(null);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-404/submit-notarization",
      token,
      {},
      "returns 404 when document is missing"
    );

    expect(response.status).toBe(404);
  });

  it("uses TTL minutes for code expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T00:00:00.000Z"));
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

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "uses TTL minutes for code expiry"
    );

    expect(response.status).toBe(201);
    expect(mocks.createNotarizationCodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-1",
        expiresAt: "2026-03-05T00:45:00.000Z",
      })
    );
  });

  it("retries on code collision", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "retries on code collision"
    );

    expect(response.status).toBe(201);
    expect(mocks.createNotarizationCodeMock).toHaveBeenCalledTimes(2);
    expect(response.body.code.code).toBe("NTR-5678");
  });

  it("rejects wrong status", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "rejects wrong status"
    );

    expect(response.status).toBe(400);
  });

  it("rejects existing request", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/submit-notarization",
      token,
      {},
      "rejects existing request"
    );

    expect(response.status).toBe(409);
  });
});
