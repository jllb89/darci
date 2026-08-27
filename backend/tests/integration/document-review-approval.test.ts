import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  getOrCreateUserIdMock: vi.fn(),
  getUserIdBySupabaseIdMock: vi.fn(),
  listDocumentSystemValuesMock: vi.fn(),
  listDocumentVersionsMock: vi.fn(),
  listDocumentGenerationRunsMock: vi.fn(),
  listDocumentOutputSignersMock: vi.fn(),
  listDocumentPartiesMock: vi.fn(),
  getDocumentIntakeDraftMock: vi.fn(),
  getActiveTemplateRegistryForOutputMock: vi.fn(),
  getActiveTemplateArtifactMock: vi.fn(),
  createDocumentGenerationRunMock: vi.fn(),
  updateDocumentVersionMock: vi.fn(),
  replaceDocumentOutputSignersMock: vi.fn(),
  upsertDocumentSystemValuesMock: vi.fn(),
  updateDocumentMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  createDocumentDownloadUrlMock: vi.fn(),
  prepareGenerationRunMock: vi.fn(),
  deriveMemberFormRulesByJurisdictionMock: vi.fn(),
  buildMemberFormDocumentExtractionPayloadMock: vi.fn(),
  queueDocumentSigningPreparedNotificationMock: vi.fn(),
  consumeMemberDocumentWorkflowMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentService")>();

  return {
    ...actual,
    getDocumentById: mocks.getDocumentByIdMock,
    getOrCreateUserId: mocks.getOrCreateUserIdMock,
    getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
    listDocumentSystemValues: mocks.listDocumentSystemValuesMock,
    listDocumentVersions: mocks.listDocumentVersionsMock,
    listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
    listDocumentOutputSigners: mocks.listDocumentOutputSignersMock,
    listDocumentParties: mocks.listDocumentPartiesMock,
    getDocumentIntakeDraft: mocks.getDocumentIntakeDraftMock,
    getActiveTemplateRegistryForOutput: mocks.getActiveTemplateRegistryForOutputMock,
    getActiveTemplateArtifact: mocks.getActiveTemplateArtifactMock,
    createDocumentGenerationRun: mocks.createDocumentGenerationRunMock,
    updateDocumentVersion: mocks.updateDocumentVersionMock,
    replaceDocumentOutputSigners: mocks.replaceDocumentOutputSignersMock,
    upsertDocumentSystemValues: mocks.upsertDocumentSystemValuesMock,
    updateDocument: mocks.updateDocumentMock,
  };
});

vi.mock("../../src/services/documentGenerationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/documentGenerationService")>();

  return {
    ...actual,
    prepareGenerationRun: mocks.prepareGenerationRunMock,
  };
});

vi.mock("../../src/services/memberFormRulesService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/memberFormRulesService")>();

  return {
    ...actual,
    deriveMemberFormRulesByJurisdiction: mocks.deriveMemberFormRulesByJurisdictionMock,
  };
});

vi.mock("../../src/services/memberFormDocumentExtractionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/memberFormDocumentExtractionService")>();

  return {
    ...actual,
    buildMemberFormDocumentExtractionPayload: mocks.buildMemberFormDocumentExtractionPayloadMock,
  };
});

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/notificationService", () => ({
  queueDocumentReadyForReviewNotification: vi.fn().mockResolvedValue(null),
  queueDocumentSigningPreparedNotification: mocks.queueDocumentSigningPreparedNotificationMock,
  queueMemberSignaturesRecordedNotification: vi.fn().mockResolvedValue(null),
  queueNotarizationSubmissionConfirmationNotification: vi.fn().mockResolvedValue(null),
  queueNotaryNextStepNotification: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../src/services/storageService", () => ({
  createDocumentDownloadUrl: mocks.createDocumentDownloadUrlMock,
}));

vi.mock("../../src/services/billingPolicyService", () => ({
  assertMemberCanCreateWorkflow: vi.fn().mockResolvedValue(null),
  BillingPolicyError: class BillingPolicyError extends Error {},
  canViewerAccessFinalPackage: vi.fn().mockResolvedValue(true),
  consumeMemberDocumentWorkflow: mocks.consumeMemberDocumentWorkflowMock,
  isFinalPackageDocumentVersion: vi.fn().mockReturnValue(false),
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

describe("document review approval", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getDocumentByIdMock.mockReset();
    mocks.getOrCreateUserIdMock.mockReset();
    mocks.getUserIdBySupabaseIdMock.mockReset();
    mocks.listDocumentSystemValuesMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
    mocks.listDocumentGenerationRunsMock.mockReset();
    mocks.listDocumentOutputSignersMock.mockReset();
    mocks.listDocumentPartiesMock.mockReset();
    mocks.getDocumentIntakeDraftMock.mockReset();
    mocks.getActiveTemplateRegistryForOutputMock.mockReset();
    mocks.getActiveTemplateArtifactMock.mockReset();
    mocks.createDocumentGenerationRunMock.mockReset();
    mocks.updateDocumentVersionMock.mockReset();
    mocks.replaceDocumentOutputSignersMock.mockReset();
    mocks.upsertDocumentSystemValuesMock.mockReset();
    mocks.updateDocumentMock.mockReset();
    mocks.recordAuditEventMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockReset();
    mocks.prepareGenerationRunMock.mockReset();
    mocks.deriveMemberFormRulesByJurisdictionMock.mockReset();
    mocks.buildMemberFormDocumentExtractionPayloadMock.mockReset();
    mocks.queueDocumentSigningPreparedNotificationMock.mockReset();
    mocks.consumeMemberDocumentWorkflowMock.mockReset();
    mocks.consumeMemberDocumentWorkflowMock.mockResolvedValue({
      transitionHandled: false,
      decision: null,
      usage: null,
    });
    mocks.getOrCreateUserIdMock.mockResolvedValue("owner-1");
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
        {
          outputKey: "trust_certificate",
          outputLabel: "Certificate of Trust",
          isRequired: true,
          sortOrder: 1,
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
        intake_revision: 7,
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
    mocks.getDocumentIntakeDraftMock.mockResolvedValue({
      id: "draft-1",
      document_id: "doc-1",
      jurisdiction: "US-CA",
      product_flow_mode: "trust_bundle",
      rules_snapshot_version: "2026.03.05",
      revision: 7,
      canonical_answers_json: {},
      created_at: "2026-03-05T00:00:00.000Z",
      updated_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.deriveMemberFormRulesByJurisdictionMock.mockResolvedValue({
      availabilityConflict: null,
      contract: {},
      missing: [],
    });
    mocks.buildMemberFormDocumentExtractionPayloadMock.mockResolvedValue({
      generatedAt: "2026-03-05T00:10:00.000Z",
    });
    mocks.getActiveTemplateRegistryForOutputMock.mockResolvedValue(null);
    mocks.getActiveTemplateArtifactMock.mockResolvedValue(null);
    mocks.prepareGenerationRunMock.mockImplementation(async ({ outputKey }: { outputKey: string }) => ({
      document: {
        id: "doc-1",
        owner_id: "owner-1",
      },
      documentKey: `${outputKey}_document`,
      status: "blocked",
      blockingRequirements: [
        {
          code: "deferred_generation",
          message: "Deferred in test",
          blocking: true,
        },
      ],
      resolvedSources: {},
      renderContext: {},
      extractionDocument: null,
      signerObligations: [
        {
          output_key: outputKey,
          document_key: `${outputKey}_document`,
          party_role: "trustee",
          party_name: "Taylor Trustee",
          obligation_type: "signer",
          is_required: true,
          resolution_source: "template",
          sort_order: 0,
          metadata: {},
        },
      ],
      errorMessage: "Deferred in test",
    }));
    mocks.createDocumentGenerationRunMock.mockImplementation(async (payload: { outputKey: string; documentKey: string }) => ({
      id: `run-2-${payload.outputKey}`,
      document_id: "doc-1",
      intake_revision: 7,
      output_key: payload.outputKey,
      document_key: payload.documentKey,
      template_key: "unresolved_template",
      template_version: "unresolved",
      template_hash: "unresolved",
      template_artifact_id: null,
      payload_json: {},
      coverage_json: {},
      render_context_json: {},
      blocking_requirements_json: [],
      resolved_sources_json: {},
      status: "blocked",
      renderer_job_id: null,
      document_version_id: null,
      blocked_at: "2026-03-05T00:10:00.000Z",
      started_at: null,
      rendered_at: null,
      failed_at: null,
      canceled_at: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
      error_message: "Deferred in test",
      created_at: "2026-03-05T00:10:00.000Z",
    }));
    mocks.replaceDocumentOutputSignersMock.mockResolvedValue([]);
    mocks.queueDocumentSigningPreparedNotificationMock.mockResolvedValue(null);
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
        {
          outputKey: "trust_certificate",
          outputLabel: "Certificate of Trust",
          isRequired: true,
          sortOrder: 1,
          metadata: {},
        },
      ],
      intake_status: updates.intake_status,
      intake_submitted_at: updates.intake_submitted_at,
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
    expect(response.body.document.idn).toMatch(/^[A-Z0-9]{12}$/);
    expect(response.body.reviewApproval.signingReady).toBe(true);
    expect(response.body.reviewApproval.approvedOutputKeys).toEqual([
      "trust_rrr",
      "trust_certificate",
    ]);
    expect(response.body.reviewApproval.approvedVersionIds).toEqual(["ver-1"]);
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
          expect.objectContaining({
            systemKey: "review_approval",
            value: expect.objectContaining({
              approvedOutputKeys: ["trust_rrr", "trust_certificate"],
              approvedVersionIds: ["ver-1"],
            }),
          }),
          expect.objectContaining({ systemKey: "registry_number" }),
          expect.objectContaining({ systemKey: "verification_url" }),
          expect.objectContaining({ systemKey: "idn_record" }),
        ]),
      }),
    );
    expect(mocks.prepareGenerationRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ outputKey: "trust_rrr" }),
    );
    expect(mocks.prepareGenerationRunMock).toHaveBeenCalledWith(
      expect.objectContaining({ outputKey: "trust_certificate" }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledTimes(5);
  });

  it("approves uploaded PDFs by provisioning a synthetic uploaded-document signing run", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: null,
      status: "pending_review",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: null,
      output_bundle: [],
      intake_status: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentSystemValuesMock.mockResolvedValue([]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
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
    ]);
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([]);
    mocks.listDocumentPartiesMock.mockResolvedValue([]);
    mocks.updateDocumentMock
      .mockImplementationOnce(async (_documentId: string, updates: Record<string, unknown>) => ({
        id: "doc-1",
        owner_id: "owner-1",
        idn: updates.idn,
        status: updates.status,
        document_type: "generic",
        jurisdiction: "US-OH",
        product_flow_mode: null,
        output_bundle: [],
        intake_status: updates.intake_status,
        intake_submitted_at: updates.intake_submitted_at,
        created_at: "2026-03-05T00:00:00.000Z",
      }))
      .mockImplementationOnce(async (_documentId: string, updates: Record<string, unknown>) => ({
        id: "doc-1",
        owner_id: "owner-1",
        idn: typeof updates.idn === "string" ? updates.idn : null,
        status: "pending_signature",
        document_type: "generic",
        jurisdiction: "US-OH",
        product_flow_mode: null,
        output_bundle: Array.isArray(updates.output_bundle) ? updates.output_bundle : [],
        intake_status: "submitted",
        intake_submitted_at: "2026-03-05T00:10:00.000Z",
        created_at: "2026-03-05T00:00:00.000Z",
      }));
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
    expect(response.body.reviewApproval.signingReady).toBe(true);
    expect(mocks.createDocumentGenerationRunMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        outputKey: "uploaded_document",
        documentKey: "uploaded_document",
        documentVersionId: "ver-1",
        status: "rendered",
      }),
    );
    expect(mocks.updateDocumentVersionMock).toHaveBeenCalledWith(
      "ver-1",
      expect.objectContaining({
        generation_run_id: "run-uploaded",
      }),
    );
    expect(mocks.replaceDocumentOutputSignersMock).not.toHaveBeenCalled();
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
