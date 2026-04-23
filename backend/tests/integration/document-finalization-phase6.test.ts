import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  appendAcknowledgmentPageMock: vi.fn(),
  watermarkWithNoticeMock: vi.fn(),
  verifyDocumentByIdnMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
}));

vi.mock("../../src/services/userRoleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/userRoleService")>();
  return {
    ...actual,
    getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
  };
});

vi.mock("../../src/services/documentFinalizationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentFinalizationService")>();
  return {
    ...actual,
    appendAcknowledgmentPage: mocks.appendAcknowledgmentPageMock,
    watermarkWithNotice: mocks.watermarkWithNoticeMock,
    verifyDocumentByIdn: mocks.verifyDocumentByIdnMock,
  };
});

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

import { app } from "../../src/index";
import { DocumentFinalizationConflictError } from "../../src/services/documentFinalizationService";

const signToken = (payload: { sub: string; app_metadata?: { role?: string } }) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

const notaryToken = () => {
  return signToken({
    sub: "notary-sub",
    app_metadata: { role: "notary" },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue({
    id: "notary-user-1",
    role: "notary",
    availableRoles: ["notary"],
    status: "active",
  });
});

describe("Phase 6 document finalization endpoints", () => {
  it("records acknowledgment execution details", async () => {
    mocks.appendAcknowledgmentPageMock.mockResolvedValue({
      document: {
        id: "doc-1",
      },
      request: {
        id: "req-1",
      },
      acknowledgmentPage: {
        id: "ack-1",
        jurisdiction: "US-OH",
        content: "DARCi Notarial Acknowledgment",
        created_at: "2026-04-20T16:00:00.000Z",
      },
      execution: {
        id: "exec-ack-1",
        execution_kind: "acknowledgment_append",
        status: "completed",
        source_document_version_id: "ver-1",
        output_document_version_id: "ver-2",
        template_id: "darci_acknowledgment_v1",
        template_version: "2026.04.20.v1",
        watermark_text: null,
        completed_at: "2026-04-20T16:00:05.000Z",
      },
      version: {
        id: "ver-2",
        version: 2,
        storage_path: "owner-1/doc-1/finalization/acknowledgment/file.pdf",
        file_name: "document-acknowledged-v2.pdf",
        mime_type: "application/pdf",
        size_bytes: 12345,
        is_final: false,
        created_at: "2026-04-20T16:00:05.000Z",
      },
    });

    const response = await request(app)
      .post("/documents/doc-1/append-acknowledgment")
      .set("Authorization", `Bearer ${notaryToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      documentId: "doc-1",
      requestId: "req-1",
      acknowledgmentPage: {
        id: "ack-1",
        jurisdiction: "US-OH",
      },
      execution: {
        id: "exec-ack-1",
        kind: "acknowledgment_append",
        status: "completed",
      },
      version: {
        id: "ver-2",
        version: 2,
      },
    });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledTimes(3);
  });

  it("returns conflict details when watermark preconditions fail", async () => {
    mocks.watermarkWithNoticeMock.mockRejectedValue(
      new DocumentFinalizationConflictError(
        "Acknowledgment must be appended before the document can be watermarked",
      ),
    );

    const response = await request(app)
      .post("/documents/doc-1/watermark")
      .set("Authorization", `Bearer ${notaryToken()}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "conflict",
      message: "Acknowledgment must be appended before the document can be watermarked",
    });
  });

  it("returns a public verification result for finalized documents", async () => {
    mocks.verifyDocumentByIdnMock.mockResolvedValue({
      verificationCheck: {
        id: "verify-check-1",
      },
      result: {
        idn: "AB12CD34EF56",
        hash: "abc123",
        ledgerTxId: "ledger_AB12CD34EF56",
        anchoredAt: "2026-04-20T16:15:00.000Z",
        status: "verified",
      },
    });

    const response = await request(app).get("/verify/AB12CD34EF56");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      idn: "AB12CD34EF56",
      hash: "abc123",
      ledgerTxId: "ledger_AB12CD34EF56",
      anchoredAt: "2026-04-20T16:15:00.000Z",
      status: "verified",
    });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledTimes(2);
  });

  it("returns not found when verification data is missing", async () => {
    mocks.verifyDocumentByIdnMock.mockResolvedValue({
      verificationCheck: {
        id: "verify-check-2",
      },
      result: null,
    });

    const response = await request(app).get("/verify/MISSINGIDN01");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: "not_found",
      message: "Document verification record not found",
    });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledTimes(2);
  });
});