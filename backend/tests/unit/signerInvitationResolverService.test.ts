import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

const mocks = vi.hoisted(() => ({
  getDocumentByIdMock: vi.fn(),
  listDocumentGenerationRunsMock: vi.fn(),
  listDocumentOutputSignersMock: vi.fn(),
  listDocumentPartiesMock: vi.fn(),
  listDocumentSignaturesMock: vi.fn(),
  listDocumentInvitesMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
  listDocumentOutputSigners: mocks.listDocumentOutputSignersMock,
  listDocumentParties: mocks.listDocumentPartiesMock,
  listDocumentSignatures: mocks.listDocumentSignaturesMock,
}));

vi.mock("../../src/services/documentInviteService", () => ({
  listDocumentInvites: mocks.listDocumentInvitesMock,
  resolveDocumentInviteRoleLabel: ({ partyRole, obligationType }: { partyRole?: string | null; obligationType?: string | null }) => {
    const labels: Record<string, string> = {
      grantor: "Trustmaker",
      trustee: "Trustee",
      principal: "Principal",
    };
    const role = partyRole?.trim() ?? "";
    if (role) {
      return labels[role] ?? role;
    }

    return obligationType?.trim() || "Signer";
  },
}));

import {
  resolveRemainingSignerInvitationsAfterCreatorSignature,
} from "../../src/services/signerInvitationResolverService";

const now = "2026-04-29T12:00:00.000Z";

const buildDocument = (overrides: Record<string, unknown> = {}) => ({
  id: "doc-1",
  owner_id: "owner-1",
  idn: "IDN-1",
  status: "pending_signature",
  document_type: "trust_rrr",
  jurisdiction: "US-PR",
  product_flow_mode: "trust",
  selected_families: null,
  output_bundle: [],
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

const buildParty = (overrides: Record<string, unknown> = {}) => ({
  id: "party-1",
  document_id: "doc-1",
  party_role: "grantor",
  full_name: "Owner One",
  email: "owner@example.com",
  phone_country_code: "+1",
  phone: null,
  is_signing_party: true,
  sort_order: 0,
  metadata: {},
  created_at: now,
  updated_at: now,
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
  storage_path: "signatures/doc-1/sig-1.png",
  capture_method: "draw",
  typed_value: null,
  typed_kind: null,
  mime_type: "image/png",
  size_bytes: 1000,
  status: "captured",
  metadata: {},
  captured_at: now,
  created_at: now,
  ...overrides,
});

const buildInvite = (overrides: Record<string, unknown> = {}) => ({
  id: "invite-1",
  documentId: "doc-1",
  documentOutputSignerId: "trustee-active",
  documentPartyId: "party-active",
  status: "sent",
  recipients: [
    {
      id: "recipient-active",
      channel: "email",
      deliveryAddress: "active@example.com",
      displayName: "Ari Active",
      isPrimary: true,
      status: "sent",
    },
  ],
  ...overrides,
});

const mockBaseReads = () => {
  mocks.getDocumentByIdMock.mockResolvedValue(buildDocument());
  mocks.listDocumentGenerationRunsMock.mockResolvedValue([buildGenerationRun()]);
  mocks.listDocumentInvitesMock.mockResolvedValue({
    invites: [],
    page: {
      limit: 100,
      offset: 0,
      total: 0,
    },
  });
};

describe("signer invitation resolver", () => {
  beforeEach(() => {
    mocks.getDocumentByIdMock.mockReset();
    mocks.listDocumentGenerationRunsMock.mockReset();
    mocks.listDocumentOutputSignersMock.mockReset();
    mocks.listDocumentPartiesMock.mockReset();
    mocks.listDocumentSignaturesMock.mockReset();
    mocks.listDocumentInvitesMock.mockReset();
    mockBaseReads();
  });

  it("returns remaining signer invite candidates when creator signing just completed", async () => {
    mocks.listDocumentPartiesMock.mockResolvedValue([
      buildParty({ id: "party-owner", email: "owner@example.com" }),
      buildParty({
        id: "party-trustee",
        party_role: "trustee",
        full_name: "Tina Trustee",
        email: "trustee@example.com",
        sort_order: 1,
      }),
      buildParty({
        id: "party-missing-email",
        party_role: "trustee",
        full_name: "Morgan Missing",
        email: null,
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({ id: "creator-trust", document_party_id: "party-owner" }),
      buildSigner({
        id: "creator-certificate",
        document_party_id: "party-owner",
        output_key: "trust_certificate",
        document_key: "trust_certificate",
        sort_order: 1,
      }),
      buildSigner({
        id: "trustee-signer",
        document_party_id: "party-trustee",
        party_role: "trustee",
        party_name: "Tina Trustee",
        sort_order: 2,
      }),
      buildSigner({
        id: "missing-email-signer",
        document_party_id: "party-missing-email",
        party_role: "trustee",
        party_name: "Morgan Missing",
        sort_order: 3,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-creator-trust",
        document_output_signer_id: "creator-trust",
      }),
      buildSignature({
        id: "sig-creator-certificate",
        document_output_signer_id: "creator-certificate",
      }),
    ]);

    const result = await resolveRemainingSignerInvitationsAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "OWNER@example.com",
      completedOutputSignerId: "creator-certificate",
      completedSignatureId: "sig-creator-certificate",
    });

    expect(result.trigger.shouldQueueInvites).toBe(true);
    expect(result.trigger.creatorSigningJustCompleted).toBe(true);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        documentOutputSignerId: "trustee-signer",
        recipientEmail: "trustee@example.com",
        recipientName: "Tina Trustee",
        claimMode: "required_signup",
        idempotencyKey: "signing-remaining:doc-1:trustee-signer",
      }),
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentOutputSignerId: "creator-trust",
          reason: "creator_obligation",
        }),
        expect.objectContaining({
          documentOutputSignerId: "creator-certificate",
          reason: "internal_output",
        }),
        expect.objectContaining({
          documentOutputSignerId: "missing-email-signer",
          reason: "missing_email",
        }),
      ]),
    );
  });

  it("does not return candidates while creator signing is still incomplete", async () => {
    mocks.listDocumentPartiesMock.mockResolvedValue([
      buildParty({ id: "party-owner", email: "owner@example.com" }),
      buildParty({
        id: "party-trustee",
        party_role: "trustee",
        full_name: "Tina Trustee",
        email: "trustee@example.com",
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({ id: "creator-trust", document_party_id: "party-owner" }),
      buildSigner({
        id: "creator-certificate",
        document_party_id: "party-owner",
        output_key: "trust_certificate",
        document_key: "trust_certificate",
        sort_order: 1,
      }),
      buildSigner({
        id: "trustee-signer",
        document_party_id: "party-trustee",
        party_role: "trustee",
        party_name: "Tina Trustee",
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-creator-trust",
        document_output_signer_id: "creator-trust",
      }),
    ]);

    const result = await resolveRemainingSignerInvitationsAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "creator-trust",
      completedSignatureId: "sig-creator-trust",
    });

    expect(result.trigger.shouldQueueInvites).toBe(false);
    expect(result.trigger.blockedReason).toBe("creator_signing_incomplete");
    expect(result.candidates).toEqual([]);
    expect(mocks.listDocumentInvitesMock).not.toHaveBeenCalled();
  });

  it("combines multiple signer obligations for the same recipient into one invite candidate", async () => {
    mocks.listDocumentPartiesMock.mockResolvedValue([
      buildParty({ id: "party-owner", email: "owner@example.com" }),
      buildParty({
        id: "party-trustmaker",
        party_role: "grantor",
        full_name: "Tester",
        email: "tester@example.com",
        sort_order: 1,
      }),
      buildParty({
        id: "party-trustee",
        party_role: "trustee",
        full_name: "Tester",
        email: "tester@example.com",
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({ id: "creator-trust", document_party_id: "party-owner" }),
      buildSigner({
        id: "tester-grantor",
        document_party_id: "party-trustmaker",
        party_role: "grantor",
        party_name: "Tester",
        sort_order: 1,
      }),
      buildSigner({
        id: "tester-trustee",
        document_party_id: "party-trustee",
        party_role: "trustee",
        party_name: "Tester",
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-creator-trust",
        document_output_signer_id: "creator-trust",
      }),
    ]);

    const result = await resolveRemainingSignerInvitationsAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "creator-trust",
      completedSignatureId: "sig-creator-trust",
    });

    expect(result.candidates).toEqual([
      expect.objectContaining({
        documentOutputSignerId: "tester-grantor",
        recipientEmail: "tester@example.com",
        recipientName: "Tester",
      }),
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentOutputSignerId: "tester-trustee",
          reason: "combined_recipient_invite",
        }),
      ]),
    );
  });

  it("scopes creator completion to the output that was just signed", async () => {
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      buildGenerationRun({ id: "run-trust", output_key: "trust_rrr", document_key: "trust_rrr" }),
      buildGenerationRun({ id: "run-poa", output_key: "poa_document", document_key: "poa_general" }),
    ]);
    mocks.listDocumentPartiesMock.mockResolvedValue([
      buildParty({ id: "party-grantor", party_role: "grantor", email: "owner@example.com" }),
      buildParty({
        id: "party-principal",
        party_role: "principal",
        full_name: "Owner Principal",
        email: "owner@example.com",
      }),
      buildParty({
        id: "party-trustee",
        party_role: "trustee",
        full_name: "Tina Trustee",
        email: "trustee@example.com",
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({
        id: "grantor-signer",
        generation_run_id: "run-trust",
        document_party_id: "party-grantor",
        output_key: "trust_rrr",
        document_key: "trust_rrr",
      }),
      buildSigner({
        id: "trustee-signer",
        generation_run_id: "run-trust",
        document_party_id: "party-trustee",
        party_role: "trustee",
        party_name: "Tina Trustee",
        output_key: "trust_rrr",
        document_key: "trust_rrr",
        sort_order: 1,
      }),
      buildSigner({
        id: "principal-signer",
        generation_run_id: "run-poa",
        document_party_id: "party-principal",
        party_role: "principal",
        party_name: "Owner Principal",
        output_key: "poa_document",
        document_key: "poa_general",
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-grantor",
        generation_run_id: "run-trust",
        document_output_signer_id: "grantor-signer",
      }),
    ]);

    const result = await resolveRemainingSignerInvitationsAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "grantor-signer",
      completedSignatureId: "sig-grantor",
    });

    expect(result.trigger.shouldQueueInvites).toBe(true);
    expect(result.trigger.creatorOutputSignerIds).toEqual(["grantor-signer"]);
    expect(result.candidates.map((candidate) => candidate.documentOutputSignerId)).toEqual([
      "trustee-signer",
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentOutputSignerId: "grantor-signer",
          reason: "creator_obligation",
        }),
        expect.objectContaining({
          documentOutputSignerId: "principal-signer",
          reason: "creator_obligation",
        }),
      ]),
    );
  });

  it("invites current signers across outputs after the completed output creator signs", async () => {
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      buildGenerationRun({ id: "run-trust", output_key: "trust_rrr", document_key: "trust_rrr" }),
      buildGenerationRun({ id: "run-poa", output_key: "poa_document", document_key: "poa_general" }),
    ]);
    mocks.listDocumentPartiesMock.mockResolvedValue([
      buildParty({
        id: "party-grantor",
        party_role: "grantor",
        full_name: "Alex Grantor",
        email: "grantor@example.com",
      }),
      buildParty({
        id: "party-principal",
        party_role: "principal",
        full_name: "Alex Morgan",
        email: "owner@example.com",
      }),
      buildParty({
        id: "party-trustee",
        party_role: "trustee",
        full_name: "Jordan Trustee",
        email: "trustee@example.com",
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({
        id: "grantor-signer",
        generation_run_id: "run-trust",
        document_party_id: "party-grantor",
        party_role: "grantor",
        party_name: "Alex Grantor",
        output_key: "trust_rrr",
        document_key: "trust_rrr",
      }),
      buildSigner({
        id: "trustee-signer",
        generation_run_id: "run-trust",
        document_party_id: "party-trustee",
        party_role: "trustee",
        party_name: "Jordan Trustee",
        output_key: "trust_rrr",
        document_key: "trust_rrr",
        sort_order: 1,
      }),
      buildSigner({
        id: "principal-signer",
        generation_run_id: "run-poa",
        document_party_id: "party-principal",
        party_role: "principal",
        party_name: "Alex Morgan",
        output_key: "poa_document",
        document_key: "poa_general",
        sort_order: 2,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-principal",
        generation_run_id: "run-poa",
        document_output_signer_id: "principal-signer",
      }),
    ]);

    const result = await resolveRemainingSignerInvitationsAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "principal-signer",
      completedSignatureId: "sig-principal",
    });

    expect(result.trigger.shouldQueueInvites).toBe(true);
    expect(result.trigger.creatorOutputSignerIds).toEqual(["principal-signer"]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        documentOutputSignerId: "grantor-signer",
        recipientEmail: "grantor@example.com",
      }),
      expect.objectContaining({
        documentOutputSignerId: "trustee-signer",
        recipientEmail: "trustee@example.com",
      }),
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentOutputSignerId: "principal-signer",
          reason: "creator_obligation",
        }),
      ]),
    );
  });

  it("invites the other trustmaker POA signer after the creator signs their trustmaker POA", async () => {
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      buildGenerationRun({
        id: "run-poa-1",
        output_key: "poa_document_tm1",
        document_key: "poa_general",
      }),
      buildGenerationRun({
        id: "run-poa-2",
        output_key: "poa_document_tm2",
        document_key: "poa_general",
      }),
    ]);
    mocks.listDocumentPartiesMock.mockResolvedValue([
      buildParty({
        id: "party-trustmaker-1",
        full_name: "Alice Trustmaker",
        email: "owner@example.com",
      }),
      buildParty({
        id: "party-trustmaker-2",
        full_name: "Bob Trustmaker",
        email: "bob.trustmaker@example.com",
        sort_order: 1,
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({
        id: "poa-trustmaker-1",
        generation_run_id: "run-poa-1",
        document_party_id: "party-trustmaker-1",
        output_key: "poa_document_tm1",
        document_key: "poa_general",
        party_role: "principal",
        party_name: "Alice Trustmaker",
        metadata: {
          principalSource: "grantor",
          grantorIndex: 0,
          principalEmail: "owner@example.com",
          sourcePartyRole: "grantor",
        },
      }),
      buildSigner({
        id: "poa-trustmaker-2",
        generation_run_id: "run-poa-2",
        document_party_id: "party-trustmaker-2",
        output_key: "poa_document_tm2",
        document_key: "poa_general",
        party_role: "principal",
        party_name: "Bob Trustmaker",
        metadata: {
          principalSource: "grantor",
          grantorIndex: 1,
          principalEmail: "bob.trustmaker@example.com",
          sourcePartyRole: "grantor",
        },
        sort_order: 1,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-poa-trustmaker-1",
        generation_run_id: "run-poa-1",
        document_output_signer_id: "poa-trustmaker-1",
      }),
    ]);

    const result = await resolveRemainingSignerInvitationsAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "poa-trustmaker-1",
      completedSignatureId: "sig-poa-trustmaker-1",
    });

    expect(result.trigger.shouldQueueInvites).toBe(true);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        documentOutputSignerId: "poa-trustmaker-2",
        documentPartyId: "party-trustmaker-2",
        recipientEmail: "bob.trustmaker@example.com",
      }),
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentOutputSignerId: "poa-trustmaker-1",
          reason: "creator_obligation",
        }),
      ]),
    );
  });

  it("returns active-invite signers for dispatch while skipping signed and satisfied group signers", async () => {
    mocks.listDocumentPartiesMock.mockResolvedValue([
      buildParty({ id: "party-owner", email: "owner@example.com" }),
      buildParty({
        id: "party-active",
        party_role: "trustee",
        full_name: "Ari Active",
        email: "active@example.com",
      }),
      buildParty({
        id: "party-signed",
        party_role: "trustee",
        full_name: "Sam Signed",
        email: "signed@example.com",
      }),
      buildParty({
        id: "party-group",
        party_role: "trustee",
        full_name: "Gina Group",
        email: "group@example.com",
      }),
      buildParty({
        id: "party-candidate",
        party_role: "trustee",
        full_name: "Casey Candidate",
        email: "candidate@example.com",
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({ id: "creator-signer", document_party_id: "party-owner" }),
      buildSigner({
        id: "trustee-active",
        document_party_id: "party-active",
        party_role: "trustee",
        party_name: "Ari Active",
        sort_order: 1,
      }),
      buildSigner({
        id: "trustee-signed",
        document_party_id: "party-signed",
        party_role: "trustee",
        party_name: "Sam Signed",
        sort_order: 2,
      }),
      buildSigner({
        id: "trustee-group-signed",
        document_party_id: "party-group",
        party_role: "trustee",
        party_name: "Gina Group",
        signing_group: "trustees_any_one",
        is_required: false,
        metadata: { groupMinimumRequired: 1 },
        sort_order: 3,
      }),
      buildSigner({
        id: "trustee-group-pending",
        document_party_id: "party-group",
        party_role: "trustee",
        party_name: "Gina Group",
        signing_group: "trustees_any_one",
        is_required: false,
        metadata: { groupMinimumRequired: 1 },
        sort_order: 4,
      }),
      buildSigner({
        id: "trustee-candidate",
        document_party_id: "party-candidate",
        party_role: "trustee",
        party_name: "Casey Candidate",
        sort_order: 5,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-creator",
        document_output_signer_id: "creator-signer",
      }),
      buildSignature({
        id: "sig-signed",
        document_output_signer_id: "trustee-signed",
      }),
      buildSignature({
        id: "sig-group",
        document_output_signer_id: "trustee-group-signed",
      }),
    ]);
    mocks.listDocumentInvitesMock.mockResolvedValue({
      invites: [buildInvite()],
      page: {
        limit: 100,
        offset: 0,
        total: 1,
      },
    });

    const result = await resolveRemainingSignerInvitationsAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "creator-signer",
      completedSignatureId: "sig-creator",
    });

    expect(result.candidates.map((candidate) => candidate.documentOutputSignerId)).toEqual([
      "trustee-active",
      "trustee-candidate",
    ]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentOutputSignerId: "trustee-signed",
          reason: "already_signed",
        }),
        expect.objectContaining({
          documentOutputSignerId: "trustee-group-pending",
          reason: "group_satisfied",
        }),
      ]),
    );
  });

  it("does not trigger remaining signer invitations for non-owner actors", async () => {
    mocks.listDocumentPartiesMock.mockResolvedValue([
      buildParty({ id: "party-owner", email: "owner@example.com" }),
      buildParty({
        id: "party-trustee",
        party_role: "trustee",
        full_name: "Tina Trustee",
        email: "trustee@example.com",
      }),
    ]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      buildSigner({ id: "creator-signer", document_party_id: "party-owner" }),
      buildSigner({
        id: "trustee-signer",
        document_party_id: "party-trustee",
        party_role: "trustee",
        party_name: "Tina Trustee",
        sort_order: 1,
      }),
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      buildSignature({
        id: "sig-creator",
        document_output_signer_id: "creator-signer",
      }),
    ]);

    const result = await resolveRemainingSignerInvitationsAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "external-signer-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "creator-signer",
      completedSignatureId: "sig-creator",
    });

    expect(result.trigger.shouldQueueInvites).toBe(false);
    expect(result.trigger.blockedReason).toBe("actor_not_document_owner");
    expect(result.candidates).toEqual([]);
    expect(mocks.listDocumentInvitesMock).not.toHaveBeenCalled();
  });
});
