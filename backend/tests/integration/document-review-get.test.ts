import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  getUserIdBySupabaseIdMock: vi.fn(),
  listDocumentSystemValuesMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
  listDocumentGenerationRunsMock: vi.fn(),
  createDocumentDownloadUrlMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
  listDocumentSystemValues: mocks.listDocumentSystemValuesMock,
  listDocumentVersions: mocks.listDocumentVersionsMock,
  listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
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

describe("document review payload", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getDocumentByIdMock.mockReset();
    mocks.getUserIdBySupabaseIdMock.mockReset();
    mocks.listDocumentSystemValuesMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
    mocks.listDocumentGenerationRunsMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockImplementation(async (storagePath: string) => ({
      bucket: "documents",
      path: storagePath,
      signedUrl: `https://example.test/${encodeURIComponent(storagePath)}`,
      expiresInSeconds: 3600,
    }));
  });

  it("returns only member-visible review PDFs", async () => {
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
          outputKey: "trust_certificate",
          outputLabel: "Certificate of Trust",
          isRequired: true,
          sortOrder: 10,
          metadata: {},
        },
        {
          outputKey: "trust_rrr",
          outputLabel: "Trust Registration Amendment",
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
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      {
        id: "run-poa",
        document_id: "doc-1",
        output_key: "poa_document",
        status: "rendered",
        created_at: "2026-03-05T00:00:20.000Z",
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
        created_at: "2026-03-05T00:00:05.000Z",
      },
    ]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "ver-cert",
        document_id: "doc-1",
        version: 1,
        storage_path: "owner-1/doc-1/generated/run-cert/trust-certificate.pdf",
        file_name: "trust-certificate.pdf",
        mime_type: "application/pdf",
        size_bytes: 1500,
        is_final: false,
        generation_run_id: "run-cert",
        created_by: "owner-1",
        created_at: "2026-03-05T00:00:05.000Z",
      },
      {
        id: "ver-rrr",
        document_id: "doc-1",
        version: 2,
        storage_path: "owner-1/doc-1/generated/run-rrr/trust-rrr.pdf",
        file_name: "trust-rrr.pdf",
        mime_type: "application/pdf",
        size_bytes: 1800,
        is_final: false,
        generation_run_id: "run-rrr",
        created_by: "owner-1",
        created_at: "2026-03-05T00:00:10.000Z",
      },
      {
        id: "ver-poa",
        document_id: "doc-1",
        version: 3,
        storage_path: "owner-1/doc-1/generated/run-poa/poa.pdf",
        file_name: "poa.pdf",
        mime_type: "application/pdf",
        size_bytes: 1900,
        is_final: false,
        generation_run_id: "run-poa",
        created_by: "owner-1",
        created_at: "2026-03-05T00:00:20.000Z",
      },
    ]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/documents/doc-1/review")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.review.canApprove).toBe(true);
    expect(response.body.review.allVisibleOutputsReady).toBe(true);
    expect(response.body.review.outputs).toHaveLength(2);
    expect(response.body.review.outputs.map((output: { outputKey: string }) => output.outputKey)).toEqual([
      "trust_rrr",
      "poa_document",
    ]);
    expect(response.body.review.outputs[0].downloadUrl).toContain("trust-rrr.pdf");
    expect(response.body.review.outputs[1].downloadUrl).toContain("poa.pdf");
    expect(mocks.createDocumentDownloadUrlMock).toHaveBeenCalledTimes(2);
  });

  it("flags missing generation runs for the review page to queue", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: null,
      status: "draft",
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
          outputKey: "poa_document",
          outputLabel: "Power of Attorney",
          isRequired: true,
          sortOrder: 20,
          metadata: {},
        },
      ],
      intake_status: "submitted",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentSystemValuesMock.mockResolvedValue([]);
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([]);
    mocks.listDocumentVersionsMock.mockResolvedValue([]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/documents/doc-1/review")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.review.requiresGeneration).toBe(true);
    expect(response.body.review.missingOutputKeys).toEqual([
      "trust_rrr",
      "poa_document",
    ]);
    expect(response.body.review.outputs).toEqual([]);
    expect(response.body.review.pendingOutputs).toHaveLength(2);
  });

  it("treats blocked visible outputs as retryable review generation work", async () => {
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
          outputKey: "poa_document",
          outputLabel: "Power of Attorney",
          isRequired: true,
          sortOrder: 20,
          metadata: {},
        },
      ],
      intake_status: "submitted",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentSystemValuesMock.mockResolvedValue([]);
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
        status: "blocked",
        error_message: "TrustState missing",
        blocking_requirements_json: [
          {
            code: "missing_render_context_value",
            source: "member_form",
            field: "TrustState",
            message: "Required placeholder TrustState does not have a member-form value in the submitted intake.",
            blocking: true,
          },
        ],
        created_at: "2026-03-05T00:00:10.000Z",
      },
    ]);
    mocks.listDocumentVersionsMock.mockResolvedValue([]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/documents/doc-1/review")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.review.requiresGeneration).toBe(true);
    expect(response.body.review.missingOutputKeys).toEqual(["trust_rrr"]);
    expect(response.body.review.pendingOutputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outputKey: "trust_rrr",
          status: "blocked",
        }),
        expect.objectContaining({
          outputKey: "poa_document",
          status: "queued",
        }),
      ]),
    );
  });
});