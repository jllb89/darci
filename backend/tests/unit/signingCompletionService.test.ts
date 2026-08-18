import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  listDocumentGenerationRunsMock: vi.fn(),
  listDocumentOutputSignersMock: vi.fn(),
  listDocumentSignaturesMock: vi.fn(),
  listDocumentSystemValuesMock: vi.fn(),
  updateDocumentMock: vi.fn(),
  upsertDocumentSystemValuesMock: vi.fn(),
  completeDocumentSignerInvitesForOutputSignersMock: vi.fn(),
  queueSignerCompletionConfirmationNotificationMock: vi.fn(),
  queueSignerSignedUpdateNotificationMock: vi.fn(),
  queueAllSignaturesCompleteNotificationMock: vi.fn(),
  runDueNotificationJobsMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
  listDocumentOutputSigners: mocks.listDocumentOutputSignersMock,
  listDocumentSignatures: mocks.listDocumentSignaturesMock,
  listDocumentSystemValues: mocks.listDocumentSystemValuesMock,
  updateDocument: mocks.updateDocumentMock,
  upsertDocumentSystemValues: mocks.upsertDocumentSystemValuesMock,
}));

vi.mock("../../src/services/documentInviteService", () => ({
  completeDocumentSignerInvitesForOutputSigners:
    mocks.completeDocumentSignerInvitesForOutputSignersMock,
  resolveDocumentInviteRoleLabel: ({ partyRole, obligationType }: { partyRole?: string | null; obligationType?: string | null }) => {
    const labels: Record<string, string> = {
      grantor: "Trustmaker",
      trustee: "Trustee",
      principal: "Principal",
    };
    return labels[partyRole ?? ""] ?? obligationType ?? "Signer";
  },
}));

vi.mock("../../src/services/notificationService", () => ({
  queueSignerCompletionConfirmationNotification:
    mocks.queueSignerCompletionConfirmationNotificationMock,
  queueSignerSignedUpdateNotification: mocks.queueSignerSignedUpdateNotificationMock,
  queueAllSignaturesCompleteNotification: mocks.queueAllSignaturesCompleteNotificationMock,
}));

vi.mock("../../src/services/notificationOutboxService", () => ({
  runDueNotificationJobs: mocks.runDueNotificationJobsMock,
}));

import { completeSigningWorkflowAfterSignatureCapture } from "../../src/services/signingCompletionService";

const now = "2026-04-30T12:00:00.000Z";

const buildDocument = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  owner_id: "owner-1",
  idn: "IDN-1",
  status: "pending_signature",
  document_type: "trust_rrr",
  jurisdiction: "US-PR",
  product_flow_mode: "trust_bundle",
  selected_families: null,
  output_bundle: [
    {
      outputKey: "trust_rrr",
      outputLabel: "Trust RRR",
      sortOrder: 0,
    },
  ],
  intake_status: "submitted",
  intake_schema_version: "2026-04-01",
  intake_last_saved_at: now,
  intake_submitted_at: now,
  created_at: now,
  updated_at: now,
  ...overrides,
});

const buildGenerationRun = (overrides: Record<string, unknown> = {}) => ({
  id: "run-1",
  document_id: "doc-1",
  intake_revision: 1,
  output_key: "trust_rrr",
  document_key: "trust_rrr",
  template_key: "trust_rrr",
  template_version: "1",
  template_hash: "hash",
  template_artifact_id: null,
  payload_json: {},
  coverage_json: {},
  render_context_json: {},
  blocking_requirements_json: [],
  resolved_sources_json: {},
  status: "rendered",
  renderer_job_id: null,
  document_version_id: "version-1",
  blocked_at: null,
  started_at: now,
  rendered_at: now,
  failed_at: null,
  canceled_at: null,
  failure_code: null,
  failure_details_json: {},
  cancellation_reason: null,
  error_message: null,
  created_at: now,
  ...overrides,
});

const buildSigner = (overrides: Record<string, unknown> = {}) => ({
  id: "signer-1",
  document_id: "doc-1",
  generation_run_id: "run-1",
  document_party_id: "party-1",
  output_key: "trust_rrr",
  document_key: "trust_rrr",
  party_role: "grantor",
  party_name: "Owner One",
  obligation_type: "signer",
  signing_group: null,
  is_required: true,
  resolution_source: "template",
  sort_order: 0,
  metadata: {},
  created_at: now,
  ...overrides,
});

const buildSignature = (overrides: Record<string, unknown> = {}) => ({
  id: "sig-1",
  document_id: "doc-1",
  generation_run_id: "run-1",
  document_output_signer_id: "signer-1",
  signer_id: "owner-1",
  signature_type: "member",
  storage_path: null,
  capture_method: "type",
  typed_value: "Owner One",
  typed_kind: "name",
  mime_type: null,
  size_bytes: null,
  status: "captured",
  metadata: {},
  captured_at: now,
  created_at: now,
  ...overrides,
});

const buildInvite = (overrides: Record<string, unknown> = {}) => ({
  id: "invite-1",
  documentId: "doc-1",
  documentOutputSignerId: "signer-2",
  documentPartyId: "party-2",
  createdByUserId: "owner-1",
  claimedUserId: "signer-user-1",
  templateId: "template-1",
  inviteKind: "document_signing",
  accessScope: "sign",
  claimMode: "required_signup",
  status: "completed",
  inviteLabel: "Signer invite",
  recipientName: "Sara Signer",
  partyRole: "trustee",
  obligationType: "signer",
  outputKey: "trust_rrr",
  documentKey: "trust_rrr",
  requiresAcceptance: true,
  expiresAt: null,
  sentAt: now,
  firstOpenedAt: null,
  firstClickedAt: null,
  acceptedAt: null,
  declinedAt: null,
  revokedAt: null,
  completedAt: now,
  deliveryCount: 1,
  resendCount: 0,
  context: {},
  metadata: {},
  createdAt: now,
  updatedAt: now,
  recipients: [
    {
      id: "recipient-1",
      targetUserId: "signer-user-1",
      channel: "email",
      deliveryAddress: "sara@example.com",
      displayName: "Sara Signer",
      status: "claimed",
      isPrimary: true,
      lastNotifiedAt: now,
      lastEventAt: now,
    },
  ],
  latestToken: null,
  latestClaim: null,
  ...overrides,
});

const mockBaseReads = () => {
  mocks.getDocumentByIdMock.mockResolvedValue(buildDocument());
  mocks.listDocumentGenerationRunsMock.mockResolvedValue([buildGenerationRun()]);
  mocks.listDocumentOutputSignersMock.mockResolvedValue([buildSigner()]);
  mocks.listDocumentSignaturesMock.mockResolvedValue([]);
  mocks.listDocumentSystemValuesMock.mockResolvedValue([]);
  mocks.updateDocumentMock.mockResolvedValue(buildDocument({ status: "pending_notary" }));
  mocks.upsertDocumentSystemValuesMock.mockResolvedValue([]);
  mocks.completeDocumentSignerInvitesForOutputSignersMock.mockResolvedValue([]);
  mocks.queueSignerCompletionConfirmationNotificationMock.mockResolvedValue({
    jobId: "job-signer-confirmation",
    jobIds: ["job-signer-confirmation", "job-signer-confirmation-push"],
    deliveryCount: 1,
    existing: false,
  });
  mocks.queueSignerSignedUpdateNotificationMock.mockResolvedValue({
    jobId: "job-owner-update",
    jobIds: ["job-owner-update", "job-owner-update-push"],
    deliveryCount: 1,
    existing: false,
  });
  mocks.queueAllSignaturesCompleteNotificationMock.mockResolvedValue({
    jobId: "job-all-complete",
    jobIds: ["job-all-complete", "job-all-complete-push"],
    deliveryCount: 1,
    existing: false,
  });
  mocks.runDueNotificationJobsMock.mockResolvedValue({
    scannedCount: 6,
    claimedCount: 6,
    processedCount: 6,
    jobs: [],
  });
};

describe("signing completion service", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mockBaseReads();
  });

  it("persists completion, completes invites, notifies, and advances notarization-required documents", async () => {
    const completedSignature = buildSignature({
      id: "sig-2",
      document_output_signer_id: "signer-2",
      signer_id: "signer-user-1",
      typed_value: "Sara Signer",
    });

    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({ id: "signer-1", party_name: "Owner One" }),
      buildSigner({
        id: "signer-2",
        document_party_id: "party-2",
        party_name: "Sara Signer",
        party_role: "trustee",
        sort_order: 1,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({ id: "sig-1", document_output_signer_id: "signer-1" }),
    ]);
    mocks.completeDocumentSignerInvitesForOutputSignersMock
      .mockResolvedValueOnce([buildInvite()])
      .mockResolvedValueOnce([]);

    const result = await completeSigningWorkflowAfterSignatureCapture({
      documentId: "doc-1",
      completedOutputSignerId: "signer-2",
      completedSignatureId: "sig-2",
      signatureRecord: completedSignature,
      actorSupabaseId: "supabase-signer-1",
      actorRole: "member",
    });

    expect(result?.allSignerRequirementsSatisfied).toBe(true);
    expect(result?.remainingSignerCount).toBe(0);
    expect(result?.completedInviteIds).toEqual(["invite-1"]);
    expect(mocks.upsertDocumentSystemValuesMock).toHaveBeenCalledWith({
      documentId: "doc-1",
      values: [
        expect.objectContaining({
          systemKey: "signature_execution",
          value: expect.objectContaining({
            confirmedAt: now,
            confirmedBySupabaseId: "supabase-signer-1",
            generationRunIds: ["run-1"],
            completedOutputSignerIds: ["signer-1", "signer-2"],
            completedSignatureIds: ["sig-1", "sig-2"],
            nextDocumentStatus: "pending_notary",
            requiresNotarization: true,
          }),
        }),
      ],
    });
    expect(mocks.updateDocumentMock).toHaveBeenCalledWith("doc-1", {
      status: "pending_notary",
    });
    expect(mocks.queueSignerCompletionConfirmationNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        documentOutputSignerId: "signer-2",
        signerEmail: "sara@example.com",
      }),
    );
    expect(mocks.queueSignerSignedUpdateNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        documentOutputSignerId: "signer-2",
        remainingSignerCount: 0,
      }),
    );
    expect(mocks.queueAllSignaturesCompleteNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        requiresNotarization: true,
        nextDocumentStatus: "pending_notary",
      }),
    );
    expect(mocks.runDueNotificationJobsMock).toHaveBeenCalledWith({
      limit: 6,
      workerId: "signing-completion-inline",
      documentId: "doc-1",
      notificationJobIds: [
        "job-signer-confirmation",
        "job-signer-confirmation-push",
        "job-owner-update",
        "job-owner-update-push",
        "job-all-complete",
        "job-all-complete-push",
      ],
    });
  });

  it("leaves execution open when another required signer is still pending", async () => {
    const completedSignature = buildSignature({
      id: "sig-1",
      document_output_signer_id: "signer-1",
      signer_id: "signer-user-1",
    });

    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({ id: "signer-1", party_name: "Sara Signer" }),
      buildSigner({ id: "signer-2", party_name: "Taylor Trustee", sort_order: 1 }),
    ]);
    mocks.completeDocumentSignerInvitesForOutputSignersMock.mockResolvedValueOnce([
      buildInvite({ id: "invite-1", documentOutputSignerId: "signer-1" }),
    ]);

    const result = await completeSigningWorkflowAfterSignatureCapture({
      documentId: "doc-1",
      completedOutputSignerId: "signer-1",
      completedSignatureId: "sig-1",
      signatureRecord: completedSignature,
      actorSupabaseId: "supabase-signer-1",
      actorRole: "member",
    });

    expect(result?.allSignerRequirementsSatisfied).toBe(false);
    expect(result?.remainingSignerCount).toBe(1);
    expect(mocks.upsertDocumentSystemValuesMock).not.toHaveBeenCalled();
    expect(mocks.updateDocumentMock).not.toHaveBeenCalled();
    expect(mocks.queueAllSignaturesCompleteNotificationMock).not.toHaveBeenCalled();
    expect(mocks.queueSignerSignedUpdateNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ remainingSignerCount: 1 }),
    );
  });

  it("dedupes completion notifications for same-person trustmaker trustee bundles", async () => {
    const completedSignature = buildSignature({
      id: "sig-principal",
      generation_run_id: "run-poa",
      document_output_signer_id: "principal-1",
      signer_id: "signer-user-1",
      typed_value: "Taylor Trust",
    });

    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      buildGenerationRun({ id: "run-trust-grantor", output_key: "trust_rrr", document_key: "trust_rrr" }),
      buildGenerationRun({ id: "run-trust-trustee", output_key: "trust_rrr_trustee", document_key: "trust_rrr" }),
      buildGenerationRun({ id: "run-poa", output_key: "poa_document_tm1", document_key: "poa_general" }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({
        id: "grantor-1",
        generation_run_id: "run-trust-grantor",
        output_key: "trust_rrr",
        document_key: "trust_rrr",
        party_role: "grantor",
        party_name: "Taylor Trust",
      }),
      buildSigner({
        id: "trustee-1",
        generation_run_id: "run-trust-trustee",
        output_key: "trust_rrr_trustee",
        document_key: "trust_rrr",
        party_role: "trustee",
        party_name: "Taylor Trust",
        sort_order: 1,
      }),
      buildSigner({
        id: "principal-1",
        generation_run_id: "run-poa",
        output_key: "poa_document_tm1",
        document_key: "poa_general",
        party_role: "principal",
        party_name: "Taylor Trust",
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-grantor",
        generation_run_id: "run-trust-grantor",
        document_output_signer_id: "grantor-1",
        typed_value: "Taylor Trust",
      }),
      buildSignature({
        id: "sig-trustee",
        generation_run_id: "run-trust-trustee",
        document_output_signer_id: "trustee-1",
        typed_value: "Taylor Trust",
      }),
    ]);
    mocks.completeDocumentSignerInvitesForOutputSignersMock
      .mockResolvedValueOnce([
        buildInvite({
          id: "invite-principal",
          documentOutputSignerId: "principal-1",
          claimedUserId: "signer-user-1",
          recipientName: "Taylor Trust",
        }),
      ])
      .mockResolvedValueOnce([]);

    const result = await completeSigningWorkflowAfterSignatureCapture({
      documentId: "doc-1",
      completedOutputSignerId: "principal-1",
      completedSignatureId: "sig-principal",
      signatureRecord: completedSignature,
      actorSupabaseId: "supabase-signer-1",
      actorRole: "member",
    });

    expect(result?.allSignerRequirementsSatisfied).toBe(true);
    expect(mocks.queueSignerCompletionConfirmationNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentOutputSignerId: "principal-1",
        documentOutputSignerIds: ["grantor-1", "principal-1", "trustee-1"],
        dedupeKey: "same_person_trust_bundle:grantor-1:principal-1:trustee-1",
        roleLabel: "Trustmaker, Trustee, and Principal",
      }),
    );
    expect(mocks.queueSignerSignedUpdateNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentOutputSignerId: "principal-1",
        documentOutputSignerIds: ["grantor-1", "principal-1", "trustee-1"],
        dedupeKey: "same_person_trust_bundle:grantor-1:principal-1:trustee-1",
        roleLabel: "Trustmaker, Trustee, and Principal",
      }),
    );
  });

  it("treats optional signing groups as complete when the group minimum is captured", async () => {
    const completedSignature = buildSignature({
      id: "sig-agent-1",
      document_output_signer_id: "agent-1",
      signer_id: "agent-user-1",
      typed_value: "Alex Agent",
    });

    mocks.getDocumentByIdMock.mockResolvedValue(
      buildDocument({
        product_flow_mode: null,
        selected_families: [],
        output_bundle: [],
      }),
    );
    mocks.updateDocumentMock.mockResolvedValue(buildDocument({ status: "completed" }));
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({ id: "principal", party_name: "Owner One" }),
      buildSigner({
        id: "agent-1",
        party_name: "Alex Agent",
        signing_group: "agents",
        is_required: false,
        metadata: { groupMinimumRequired: 1 },
        sort_order: 1,
      }),
      buildSigner({
        id: "agent-2",
        party_name: "Ari Agent",
        signing_group: "agents",
        is_required: false,
        metadata: { groupMinimumRequired: 1 },
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({ id: "sig-principal", document_output_signer_id: "principal" }),
    ]);

    const result = await completeSigningWorkflowAfterSignatureCapture({
      documentId: "doc-1",
      completedOutputSignerId: "agent-1",
      completedSignatureId: "sig-agent-1",
      signatureRecord: completedSignature,
      actorSupabaseId: "supabase-agent-1",
      actorRole: "member",
    });

    expect(result?.allSignerRequirementsSatisfied).toBe(true);
    expect(result?.remainingSignerCount).toBe(0);
    expect(mocks.updateDocumentMock).toHaveBeenCalledWith("doc-1", {
      status: "completed",
    });
    expect(mocks.upsertDocumentSystemValuesMock).toHaveBeenCalledWith({
      documentId: "doc-1",
      values: [
        expect.objectContaining({
          value: expect.objectContaining({
            completedOutputSignerIds: ["principal", "agent-1"],
            completedSignatureIds: ["sig-principal", "sig-agent-1"],
            nextDocumentStatus: "completed",
            requiresNotarization: false,
          }),
        }),
      ],
    });
  });

  it("advances a trust bundle to notary selection when one any-one trustee certificate signer is captured", async () => {
    const completedSignature = buildSignature({
      id: "sig-cert-trustee-1",
      generation_run_id: "run-cert",
      document_output_signer_id: "cert-trustee-1",
      signer_id: "owner-1",
      typed_value: "Alice Trustee",
    });

    mocks.getDocumentByIdMock.mockResolvedValue(
      buildDocument({
        product_flow_mode: "trust_bundle",
        output_bundle: [
          { outputKey: "trust_rrr", outputLabel: "Trust RRR", sortOrder: 0 },
          { outputKey: "trust_certificate", outputLabel: "Certificate of Trust", sortOrder: 1 },
        ],
      }),
    );
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      buildGenerationRun({ id: "run-rrr", output_key: "trust_rrr", document_key: "trust_rrr" }),
      buildGenerationRun({
        id: "run-cert",
        output_key: "trust_certificate",
        document_key: "trust_certificate",
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({
        id: "grantor-1",
        generation_run_id: "run-rrr",
        output_key: "trust_rrr",
        document_key: "trust_rrr",
        party_role: "grantor",
        party_name: "Alice Trustmaker",
      }),
      buildSigner({
        id: "cert-trustee-1",
        generation_run_id: "run-cert",
        output_key: "trust_certificate",
        document_key: "trust_certificate",
        party_role: "trustee",
        party_name: "Alice Trustee",
        signing_group: "trustees_any_one",
        is_required: false,
        metadata: { authorityMode: "any_one_trustee", groupMinimumRequired: 1 },
        sort_order: 1,
      }),
      buildSigner({
        id: "cert-trustee-2",
        generation_run_id: "run-cert",
        output_key: "trust_certificate",
        document_key: "trust_certificate",
        party_role: "trustee",
        party_name: "Bob Trustee",
        signing_group: "trustees_any_one",
        is_required: false,
        metadata: { authorityMode: "any_one_trustee", groupMinimumRequired: 1 },
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-grantor-1",
        generation_run_id: "run-rrr",
        document_output_signer_id: "grantor-1",
        typed_value: "Alice Trustmaker",
      }),
    ]);

    const result = await completeSigningWorkflowAfterSignatureCapture({
      documentId: "doc-1",
      completedOutputSignerId: "cert-trustee-1",
      completedSignatureId: "sig-cert-trustee-1",
      signatureRecord: completedSignature,
      actorSupabaseId: "supabase-owner-1",
      actorRole: "member",
    });

    expect(result?.allSignerRequirementsSatisfied).toBe(true);
    expect(result?.remainingSignerCount).toBe(0);
    expect(result?.documentStatus.nextStatus).toBe("pending_notary");
    expect(mocks.updateDocumentMock).toHaveBeenCalledWith("doc-1", {
      status: "pending_notary",
    });
  });
});
