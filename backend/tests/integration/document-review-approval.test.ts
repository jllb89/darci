import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  getUserIdBySupabaseIdMock: vi.fn(),
  listDocumentSystemValuesMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
  listDocumentGenerationRunsMock: vi.fn(),
  listDocumentOutputSignersMock: vi.fn(),
  listDocumentPartiesMock: vi.fn(),
  upsertDocumentSystemValuesMock: vi.fn(),
  updateDocumentMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  createDocumentDownloadUrlMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
  listDocumentSystemValues: mocks.listDocumentSystemValuesMock,
  listDocumentVersions: mocks.listDocumentVersionsMock,
  listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
  listDocumentOutputSigners: mocks.listDocumentOutputSignersMock,
  listDocumentParties: mocks.listDocumentPartiesMock,
  upsertDocumentSystemValues: mocks.upsertDocumentSystemValuesMock,
  updateDocument: mocks.updateDocumentMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/storageService", () => ({
  createDocumentDownloadUrl: mocks.createDocumentDownloadUrlMock,
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

describe("document review approval", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getDocumentByIdMock.mockReset();
    mocks.getUserIdBySupabaseIdMock.mockReset();
    mocks.listDocumentSystemValuesMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
    mocks.listDocumentGenerationRunsMock.mockReset();
    mocks.listDocumentOutputSignersMock.mockReset();
    mocks.listDocumentPartiesMock.mockReset();
    mocks.upsertDocumentSystemValuesMock.mockReset();
    mocks.updateDocumentMock.mockReset();
    mocks.recordAuditEventMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockResolvedValue({
      bucket: "documents",
      path: "owner-1/doc-1/generated/ver-1.pdf",
      signedUrl: "https://example.test/review.pdf",
      expiresInSeconds: 3600,
    });
  });

  it("approves review and prepares signing", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: null,
      status: "pending_review",
      document_type: "trust_bundle",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      output_bundle: [
        {
          outputKey: "trust_rrr",
          outputLabel: "Trust Registration Amendment",
          isRequired: true,
          sortOrder: 0,
          metadata: {},
        },
      ],
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentSystemValuesMock.mockResolvedValue([]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "ver-1",
        document_id: "doc-1",
        version: 1,
        storage_path: "owner-1/doc-1/generated/ver-1.pdf",
        file_name: "trust-rrr.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        is_final: false,
        generation_run_id: "run-1",
        created_by: "owner-1",
        created_at: "2026-03-05T00:00:10.000Z",
      },
    ]);
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      {
        id: "run-1",
        document_id: "doc-1",
        output_key: "trust_rrr",
        status: "rendered",
      },
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      {
        id: "signer-1",
        document_id: "doc-1",
        generation_run_id: "run-1",
        party_name: "Taylor Trustee",
        obligation_type: "signer",
      },
    ]);
    mocks.listDocumentPartiesMock.mockResolvedValue([]);
    mocks.updateDocumentMock.mockImplementation(async (_documentId: string, updates: Record<string, unknown>) => ({
      id: "doc-1",
      owner_id: "owner-1",
      idn: updates.idn,
      status: updates.status,
      document_type: "trust_bundle",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      output_bundle: [
        {
          outputKey: "trust_rrr",
          outputLabel: "Trust Registration Amendment",
          isRequired: true,
          sortOrder: 0,
          metadata: {},
        },
      ],
      created_at: "2026-03-05T00:00:00.000Z",
    }));
    mocks.upsertDocumentSystemValuesMock.mockResolvedValue([]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/documents/doc-1/review-approval")
      .set("Authorization", `Bearer ${token}`)
      .send({ agreed: true });

    expect(response.status).toBe(200);
    expect(response.body.document.status).toBe("pending_signature");
    expect(response.body.document.idn).toBeNull();
    expect(response.body.reviewApproval.signingReady).toBe(true);
    expect(mocks.updateDocumentMock).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({
        status: "pending_signature",
        idn: expect.stringMatching(/^[A-Z0-9]{12}$/),
      }),
    );
    expect(mocks.upsertDocumentSystemValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        values: expect.arrayContaining([
          expect.objectContaining({ systemKey: "review_approval" }),
          expect.objectContaining({ systemKey: "registry_number" }),
          expect.objectContaining({ systemKey: "verification_url" }),
          expect.objectContaining({ systemKey: "idn_record" }),
        ]),
      }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledTimes(3);
  });

  it("returns existing approval idempotently", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentSystemValuesMock.mockResolvedValue([
      {
        id: "sys-1",
        document_id: "doc-1",
        system_key: "review_approval",
        value_json: {
          approvedAt: "2026-03-05T00:10:00.000Z",
          reviewSource: "generated_output",
          latestVersionId: "ver-1",
          latestRenderedRunId: "run-1",
        },
        source: "review_approval",
        metadata: {},
        created_at: "2026-03-05T00:10:00.000Z",
        updated_at: "2026-03-05T00:10:00.000Z",
      },
    ]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/documents/doc-1/review-approval")
      .set("Authorization", `Bearer ${token}`)
      .send({ agreed: true });

    expect(response.status).toBe(200);
    expect(response.body.reviewApproval.approvedAt).toBe("2026-03-05T00:10:00.000Z");
    expect(mocks.updateDocumentMock).not.toHaveBeenCalled();
    expect(mocks.upsertDocumentSystemValuesMock).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects approval when nothing is ready for review", async () => {
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
    mocks.listDocumentSystemValuesMock.mockResolvedValue([]);
    mocks.listDocumentVersionsMock.mockResolvedValue([]);
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/documents/doc-1/review-approval")
      .set("Authorization", `Bearer ${token}`)
      .send({ agreed: true });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Document is not ready for review approval yet");
  });

  it("requires every visible review output before approval", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: null,
      status: "pending_review",
      document_type: "trust_bundle",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      output_bundle: [
        {
          outputKey: "trust_rrr",
          outputLabel: "Trust Registration Amendment",
          isRequired: true,
          sortOrder: 10,
          metadata: {},
        },
        {
          outputKey: "trust_certificate",
          outputLabel: "Certificate of Trust",
          isRequired: true,
          sortOrder: 20,
          metadata: {},
        },
        {
          outputKey: "poa_document",
          outputLabel: "Power of Attorney",
          isRequired: true,
          sortOrder: 30,
          metadata: {},
        },
      ],
      intake_status: "submitted",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentSystemValuesMock.mockResolvedValue([]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "ver-1",
        document_id: "doc-1",
        version: 1,
        storage_path: "owner-1/doc-1/generated/ver-1.pdf",
        file_name: "trust-rrr.pdf",
        mime_type: "application/pdf",
        size_bytes: 1024,
        is_final: false,
        generation_run_id: "run-rrr",
        created_by: "owner-1",
        created_at: "2026-03-05T00:00:10.000Z",
      },
    ]);
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      {
        id: "run-poa",
        document_id: "doc-1",
        output_key: "poa_document",
        status: "queued",
        created_at: "2026-03-05T00:00:12.000Z",
      },
      {
        id: "run-rrr",
        document_id: "doc-1",
        output_key: "trust_rrr",
        status: "rendered",
        created_at: "2026-03-05T00:00:10.000Z",
      },
      {
        id: "run-cert",
        document_id: "doc-1",
        output_key: "trust_certificate",
        status: "rendered",
        created_at: "2026-03-05T00:00:09.000Z",
      },
    ]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/documents/doc-1/review-approval")
      .set("Authorization", `Bearer ${token}`)
      .send({ agreed: true });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Document is not ready for review approval yet");
    expect(mocks.updateDocumentMock).not.toHaveBeenCalled();
  });
});