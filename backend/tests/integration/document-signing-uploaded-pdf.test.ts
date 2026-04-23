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
  listDocumentSignaturesMock: vi.fn(),
  listDocumentPartiesMock: vi.fn(),
  createDocumentGenerationRunMock: vi.fn(),
  updateDocumentMock: vi.fn(),
  updateDocumentVersionMock: vi.fn(),
  replaceDocumentOutputSignersMock: vi.fn(),
  createDocumentDownloadUrlMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentService")>();

  return {
    ...actual,
    getDocumentById: mocks.getDocumentByIdMock,
    getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
    listDocumentSystemValues: mocks.listDocumentSystemValuesMock,
    listDocumentVersions: mocks.listDocumentVersionsMock,
    listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
    listDocumentOutputSigners: mocks.listDocumentOutputSignersMock,
    listDocumentSignatures: mocks.listDocumentSignaturesMock,
    listDocumentParties: mocks.listDocumentPartiesMock,
    createDocumentGenerationRun: mocks.createDocumentGenerationRunMock,
    updateDocument: mocks.updateDocumentMock,
    updateDocumentVersion: mocks.updateDocumentVersionMock,
    replaceDocumentOutputSigners: mocks.replaceDocumentOutputSignersMock,
  };
});

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
  return jwt.sign(
    {
      ...payload,
      sub:
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          payload.sub ?? "",
        )
          ? payload.sub
          : "00000000-0000-4000-8000-000000000001",
    },
    secret,
    { expiresIn: "1h" },
  );
};

describe("uploaded-pdf signing state", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getDocumentByIdMock.mockReset();
    mocks.getUserIdBySupabaseIdMock.mockReset();
    mocks.listDocumentSystemValuesMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
    mocks.listDocumentGenerationRunsMock.mockReset();
    mocks.listDocumentOutputSignersMock.mockReset();
    mocks.listDocumentSignaturesMock.mockReset();
    mocks.listDocumentPartiesMock.mockReset();
    mocks.createDocumentGenerationRunMock.mockReset();
    mocks.updateDocumentMock.mockReset();
    mocks.updateDocumentVersionMock.mockReset();
    mocks.replaceDocumentOutputSignersMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockResolvedValue({
      bucket: "documents",
      path: "owner-1/doc-1/generated/original.pdf",
      signedUrl: "https://example.test/signing.pdf",
      expiresInSeconds: 3600,
    });
  });

  it("repairs uploaded-pdf approvals into a ready signing state", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: null,
      output_bundle: [],
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:10:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentSystemValuesMock
      .mockResolvedValueOnce([
        {
          id: "sys-review",
          document_id: "doc-1",
          system_key: "review_approval",
          value_json: {
            approvedAt: "2026-03-05T00:10:00.000Z",
            reviewSource: "uploaded_pdf",
            latestVersionId: "ver-1",
            latestRenderedRunId: null,
            approvedOutputKeys: ["uploaded_document"],
            approvedVersionIds: ["ver-1"],
          },
          source: "review_approval",
          metadata: {},
          created_at: "2026-03-05T00:10:00.000Z",
          updated_at: "2026-03-05T00:10:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "sys-review",
          document_id: "doc-1",
          system_key: "review_approval",
          value_json: {
            approvedAt: "2026-03-05T00:10:00.000Z",
            reviewSource: "uploaded_pdf",
            latestVersionId: "ver-1",
            latestRenderedRunId: null,
            approvedOutputKeys: ["uploaded_document"],
            approvedVersionIds: ["ver-1"],
          },
          source: "review_approval",
          metadata: {},
          created_at: "2026-03-05T00:10:00.000Z",
          updated_at: "2026-03-05T00:10:00.000Z",
        },
      ]);
    mocks.listDocumentVersionsMock
      .mockResolvedValueOnce([
        {
          id: "ver-1",
          document_id: "doc-1",
          version: 1,
          storage_path: "owner-1/doc-1/uploads/original.pdf",
          file_name: "original.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
          is_final: false,
          generation_run_id: null,
          created_by: "owner-1",
          created_at: "2026-03-05T00:00:10.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "ver-1",
          document_id: "doc-1",
          version: 1,
          storage_path: "owner-1/doc-1/uploads/original.pdf",
          file_name: "original.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
          is_final: false,
          generation_run_id: null,
          created_by: "owner-1",
          created_at: "2026-03-05T00:00:10.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "ver-1",
          document_id: "doc-1",
          version: 1,
          storage_path: "owner-1/doc-1/uploads/original.pdf",
          file_name: "original.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024,
          is_final: false,
          generation_run_id: "run-uploaded",
          created_by: "owner-1",
          created_at: "2026-03-05T00:00:10.000Z",
        },
      ]);
    mocks.listDocumentGenerationRunsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "run-uploaded",
          document_id: "doc-1",
          intake_revision: 1,
          output_key: "uploaded_document",
          document_key: "uploaded_document",
          template_key: "uploaded_pdf",
          template_version: "uploaded_pdf",
          template_hash: "uploaded_pdf",
          template_artifact_id: null,
          payload_json: {},
          coverage_json: {},
          render_context_json: {},
          blocking_requirements_json: [],
          resolved_sources_json: {},
          status: "rendered",
          renderer_job_id: null,
          document_version_id: "ver-1",
          blocked_at: null,
          started_at: "2026-03-05T00:10:00.000Z",
          rendered_at: "2026-03-05T00:10:00.000Z",
          failed_at: null,
          canceled_at: null,
          failure_code: null,
          failure_details_json: {},
          cancellation_reason: null,
          error_message: null,
          created_at: "2026-03-05T00:10:00.000Z",
        },
      ]);
    mocks.listDocumentOutputSignersMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.listDocumentSignaturesMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.listDocumentPartiesMock.mockResolvedValue([]);
    mocks.updateDocumentMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: null,
      output_bundle: [
        {
          outputKey: "uploaded_document",
          outputLabel: "generic",
          isRequired: true,
          sortOrder: 0,
          metadata: {
            source: "uploaded_pdf",
            synthetic: true,
          },
        },
      ],
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:10:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.createDocumentGenerationRunMock.mockResolvedValue({
      id: "run-uploaded",
      document_id: "doc-1",
      intake_revision: 1,
      output_key: "uploaded_document",
      document_key: "uploaded_document",
      template_key: "uploaded_pdf",
      template_version: "uploaded_pdf",
      template_hash: "uploaded_pdf",
      template_artifact_id: null,
      payload_json: {},
      coverage_json: {},
      render_context_json: {},
      blocking_requirements_json: [],
      resolved_sources_json: {},
      status: "rendered",
      renderer_job_id: null,
      document_version_id: "ver-1",
      blocked_at: null,
      started_at: "2026-03-05T00:10:00.000Z",
      rendered_at: "2026-03-05T00:10:00.000Z",
      failed_at: null,
      canceled_at: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
      error_message: null,
      created_at: "2026-03-05T00:10:00.000Z",
    });
    mocks.updateDocumentVersionMock.mockResolvedValue({
      id: "ver-1",
      document_id: "doc-1",
      version: 1,
      storage_path: "owner-1/doc-1/uploads/original.pdf",
      file_name: "original.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      is_final: false,
      generation_run_id: "run-uploaded",
      created_by: "owner-1",
      created_at: "2026-03-05T00:00:10.000Z",
    });

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/documents/doc-1/signing")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.signing.state).toBe("ready");
    expect(response.body.signing.reviewApproval.reviewSource).toBe("uploaded_pdf");
    expect(response.body.signing.allOutputsReady).toBe(true);
    expect(response.body.signing.missingOutputKeys).toEqual([]);
    expect(response.body.signing.outputs).toEqual([
      expect.objectContaining({
        outputKey: "uploaded_document",
        generationRunId: "run-uploaded",
        mimeType: "application/pdf",
      }),
    ]);
    expect(mocks.updateDocumentMock).toHaveBeenCalledWith(
      "doc-1",
      expect.objectContaining({
        output_bundle: [
          expect.objectContaining({
            outputKey: "uploaded_document",
          }),
        ],
      }),
    );
    expect(mocks.createDocumentGenerationRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        outputKey: "uploaded_document",
        documentVersionId: "ver-1",
      }),
    );
    expect(mocks.updateDocumentVersionMock).toHaveBeenCalledWith(
      "ver-1",
      expect.objectContaining({
        generation_run_id: "run-uploaded",
      }),
    );
  });
});