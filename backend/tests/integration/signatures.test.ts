import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  getUserIdBySupabaseIdMock: vi.fn(),
  createSignatureRecordMock: vi.fn(),
  getSignatureByIdMock: vi.fn(),
  createSignatureUploadUrlMock: vi.fn(),
  getSignatureObjectMetadataMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
  createSignatureRecord: mocks.createSignatureRecordMock,
  getSignatureById: mocks.getSignatureByIdMock,
}));

vi.mock("../../src/services/storageService", () => ({
  createSignatureUploadUrl: mocks.createSignatureUploadUrlMock,
  getSignatureObjectMetadata: mocks.getSignatureObjectMetadataMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
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
  payload: Record<string, unknown>,
  label: string,
  token?: string
) => {
  console.log("request", { method: "POST", path, payload });
  let req = request(app).post(path).send(payload);
  if (token) {
    req = req.set("Authorization", `Bearer ${token}`);
  }
  const response = await req;
  logResponse(label, response);
  return response;
};

describe("member signature capture", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getDocumentByIdMock.mockReset();
    mocks.getUserIdBySupabaseIdMock.mockReset();
    mocks.createSignatureRecordMock.mockReset();
    mocks.getSignatureByIdMock.mockReset();
    mocks.createSignatureUploadUrlMock.mockReset();
    mocks.getSignatureObjectMetadataMock.mockReset();
    mocks.recordAuditEventMock.mockReset();
  });

  it("requests a signature upload", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/signatures/request",
      {
        fileName: "sig.png",
        fileSize: 1024,
        mimeType: "image/png",
      },
      "requests a signature upload",
      token
    );

    expect(response.status).toBe(201);
    expect(response.body.signature.id).toBe("sig-1");
  });

  it("rejects invalid signature mime type", async () => {
    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/signatures/request",
      {
        fileName: "sig.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
      },
      "rejects invalid signature mime type",
      token
    );

    expect(response.status).toBe(400);
  });

  it("rejects oversized signature", async () => {
    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/signatures/request",
      {
        fileName: "sig.png",
        fileSize: 6 * 1024 * 1024,
        mimeType: "image/png",
      },
      "rejects oversized signature",
      token
    );

    expect(response.status).toBe(400);
  });

  it("finalizes signature upload", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/signatures/finalize",
      {
        signatureId: "sig-1",
      },
      "finalizes signature upload",
      token
    );

    expect(response.status).toBe(200);
    expect(response.body.signature.status).toBe("captured");
  });

  it("rejects missing signature upload", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/signatures/finalize",
      {
        signatureId: "sig-1",
      },
      "rejects missing signature upload",
      token
    );

    expect(response.status).toBe(404);
  });

  it("rejects invalid signature mime type on finalize", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/signatures/finalize",
      {
        signatureId: "sig-1",
      },
      "rejects invalid signature mime type on finalize",
      token
    );

    expect(response.status).toBe(400);
  });

  it("rejects oversized signature on finalize", async () => {
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

    const response = await postWithLog(
      "/documents/doc-1/signatures/finalize",
      {
        signatureId: "sig-1",
      },
      "rejects oversized signature on finalize",
      token
    );

    expect(response.status).toBe(400);
  });
});
