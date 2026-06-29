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
  it("rejects direct acknowledgment append without live-session structured inputs", async () => {
    const response = await request(app)
      .post("/documents/doc-1/append-acknowledgment")
      .set("Authorization", `Bearer ${notaryToken()}`);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: "conflict",
      message:
        "Acknowledgment append now requires live in-person session venue, identity, notary profile, seal, and signature data. Use POST /notary/requests/{id}/sign.",
    });
    expect(mocks.appendAcknowledgmentPageMock).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventMock).not.toHaveBeenCalled();
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
        documents: [
          {
            id: "version-1",
            versionId: "version-1",
            label: "Certificate of Trust",
            fileName: "certificate-finalized-v3.pdf",
            mimeType: "application/pdf",
            sizeBytes: 12345,
            isFinal: true,
            downloadUrl: "https://signed.example/certificate.pdf",
            createdAt: "2026-04-20T16:14:00.000Z",
          },
        ],
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
      documents: [
        {
          id: "version-1",
          versionId: "version-1",
          label: "Certificate of Trust",
          fileName: "certificate-finalized-v3.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12345,
          isFinal: true,
          downloadUrl: "https://signed.example/certificate.pdf",
          createdAt: "2026-04-20T16:14:00.000Z",
        },
      ],
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