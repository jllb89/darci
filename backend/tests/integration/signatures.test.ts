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
  listCapturedSignaturesForSignerMock: vi.fn(),
  listDocumentSignaturesMock: vi.fn(),
  listDocumentOutputSignersMock: vi.fn(),
  getDocumentOutputSignerByIdMock: vi.fn(),
  isDocumentIntakeLockedMock: vi.fn(),
  createSignatureRecordMock: vi.fn(),
  getSignatureByIdMock: vi.fn(),
  getSignatureRecordByIdMock: vi.fn(),
  updateSignatureRecordMock: vi.fn(),
  upsertDocumentSystemValuesMock: vi.fn(),
  updateDocumentMock: vi.fn(),
  createSignatureUploadUrlMock: vi.fn(),
  createDocumentDownloadUrlMock: vi.fn(),
  createSignatureDownloadUrlMock: vi.fn(),
  getSignatureObjectMetadataMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  queueMemberSignaturesRecordedNotificationMock: vi.fn(),
  applySignatureCaptureToDocumentOutputMock: vi.fn(),
  queueRemainingSignerInvitesAfterCreatorSignatureMock: vi.fn(),
  completeSigningWorkflowAfterSignatureCaptureMock: vi.fn(),
  resolveClaimedSignerInviteAccessMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getDocumentById: mocks.getDocumentByIdMock,
  getOrCreateUserId: mocks.getOrCreateUserIdMock,
  getUserIdBySupabaseId: mocks.getUserIdBySupabaseIdMock,
  listDocumentSystemValues: mocks.listDocumentSystemValuesMock,
  listDocumentVersions: mocks.listDocumentVersionsMock,
  listDocumentGenerationRuns: mocks.listDocumentGenerationRunsMock,
  listCapturedSignaturesForSigner: mocks.listCapturedSignaturesForSignerMock,
  listDocumentSignatures: mocks.listDocumentSignaturesMock,
  listDocumentOutputSigners: mocks.listDocumentOutputSignersMock,
  getDocumentOutputSignerById: mocks.getDocumentOutputSignerByIdMock,
  isDocumentIntakeLocked: mocks.isDocumentIntakeLockedMock,
  createSignatureRecord: mocks.createSignatureRecordMock,
  getSignatureById: mocks.getSignatureByIdMock,
  getSignatureRecordById: mocks.getSignatureRecordByIdMock,
  updateSignatureRecord: mocks.updateSignatureRecordMock,
  upsertDocumentSystemValues: mocks.upsertDocumentSystemValuesMock,
  updateDocument: mocks.updateDocumentMock,
}));

vi.mock("../../src/services/storageService", () => ({
  createDocumentDownloadUrl: mocks.createDocumentDownloadUrlMock,
  createSignatureUploadUrl: mocks.createSignatureUploadUrlMock,
  createSignatureDownloadUrl: mocks.createSignatureDownloadUrlMock,
  getSignatureObjectMetadata: mocks.getSignatureObjectMetadataMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/notificationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/notificationService")>(
    "../../src/services/notificationService",
  );

  return {
    ...actual,
    queueMemberSignaturesRecordedNotification:
      mocks.queueMemberSignaturesRecordedNotificationMock,
  };
});

vi.mock("../../src/services/documentGenerationRenderService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentGenerationRenderService")>(
    "../../src/services/documentGenerationRenderService",
  );

  return {
    ...actual,
    applySignatureCaptureToDocumentOutput: mocks.applySignatureCaptureToDocumentOutputMock,
  };
});

vi.mock("../../src/services/signerInvitationDispatchService", () => ({
  queueRemainingSignerInvitesAfterCreatorSignature:
    mocks.queueRemainingSignerInvitesAfterCreatorSignatureMock,
}));

vi.mock("../../src/services/signingCompletionService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/signingCompletionService")>(
    "../../src/services/signingCompletionService",
  );

  return {
    ...actual,
    completeSigningWorkflowAfterSignatureCapture:
      mocks.completeSigningWorkflowAfterSignatureCaptureMock,
  };
});

vi.mock("../../src/services/signerInviteAccessService", () => ({
  resolveClaimedSignerInviteAccess: mocks.resolveClaimedSignerInviteAccessMock,
}));

vi.mock("../../src/services/userRoleService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/userRoleService")>();

  return {
    ...actual,
    getUserIdentityContextBySupabaseId: vi.fn().mockResolvedValue(null),
  };
});

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

const generationRunId = "run-1";
const outputSignerId = "signer-1";
const signatureTargetPayload = {
  generationRunId,
  outputSignerId,
};
const outputBundle = [
  {
    outputKey: "trust_rrr",
    outputLabel: "Trust RRR",
    sortOrder: 0,
  },
];
const signerRecord = {
  id: outputSignerId,
  generation_run_id: generationRunId,
  output_key: "trust_rrr",
  document_key: "trust_rrr",
  party_name: "Owner One",
  party_role: "grantor",
  obligation_type: "signer",
  is_required: true,
  signing_group: null,
  sort_order: 0,
  metadata: {},
};

describe("member signature capture", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getDocumentByIdMock.mockReset();
    mocks.getOrCreateUserIdMock.mockReset();
    mocks.getUserIdBySupabaseIdMock.mockReset();
    mocks.listDocumentSystemValuesMock.mockReset();
    mocks.listDocumentVersionsMock.mockReset();
    mocks.listDocumentGenerationRunsMock.mockReset();
    mocks.listCapturedSignaturesForSignerMock.mockReset();
    mocks.listDocumentSignaturesMock.mockReset();
    mocks.listDocumentOutputSignersMock.mockReset();
    mocks.getDocumentOutputSignerByIdMock.mockReset();
    mocks.isDocumentIntakeLockedMock.mockReset();
    mocks.createSignatureRecordMock.mockReset();
    mocks.getSignatureByIdMock.mockReset();
    mocks.getSignatureRecordByIdMock.mockReset();
    mocks.updateSignatureRecordMock.mockReset();
    mocks.upsertDocumentSystemValuesMock.mockReset();
    mocks.updateDocumentMock.mockReset();
    mocks.createSignatureUploadUrlMock.mockReset();
    mocks.createDocumentDownloadUrlMock.mockReset();
    mocks.createSignatureDownloadUrlMock.mockReset();
    mocks.getSignatureObjectMetadataMock.mockReset();
    mocks.recordAuditEventMock.mockReset();
    mocks.queueMemberSignaturesRecordedNotificationMock.mockReset();
    mocks.applySignatureCaptureToDocumentOutputMock.mockReset();
    mocks.queueRemainingSignerInvitesAfterCreatorSignatureMock.mockReset();
    mocks.completeSigningWorkflowAfterSignatureCaptureMock.mockReset();
    mocks.resolveClaimedSignerInviteAccessMock.mockReset();
    mocks.resolveClaimedSignerInviteAccessMock.mockResolvedValue(null);
    mocks.getOrCreateUserIdMock.mockResolvedValue("owner-1");
    mocks.listCapturedSignaturesForSignerMock.mockResolvedValue([]);
    mocks.upsertDocumentSystemValuesMock.mockResolvedValue(null);
    mocks.updateDocumentMock.mockResolvedValue(null);
    mocks.queueMemberSignaturesRecordedNotificationMock.mockResolvedValue({ jobId: "job-signatures-recorded" });
    mocks.completeSigningWorkflowAfterSignatureCaptureMock.mockResolvedValue(null);
    mocks.queueRemainingSignerInvitesAfterCreatorSignatureMock.mockResolvedValue({
      documentId: "doc-1",
      triggeredAt: "2026-03-05T00:00:20.000Z",
      resolution: {
        documentId: "doc-1",
        actorUserId: "owner-1",
        actorEmail: null,
        trigger: {
          actorIsDocumentOwner: true,
          creatorResolutionStrategy: "single_grantor_fallback",
          creatorPartyIds: ["party-owner"],
          creatorOutputSignerIds: [outputSignerId],
          completedOutputSignerId: outputSignerId,
          completedOutputSignerIsCreator: true,
          creatorSigningCompleteBefore: false,
          creatorSigningCompleteAfter: false,
          creatorSigningJustCompleted: false,
          shouldQueueInvites: false,
          blockedReason: "creator_signing_incomplete",
        },
        candidates: [],
        skipped: [],
      },
      invited: [],
      failures: [],
    });
    mocks.listDocumentSystemValuesMock.mockResolvedValue([
      {
        system_key: "review_approval",
        value_json: {
          approvedAt: "2026-03-05T00:00:00.000Z",
          approvedOutputKeys: ["trust_rrr"],
        },
      },
    ]);
    mocks.listDocumentVersionsMock.mockResolvedValue([
      {
        id: "version-1",
        generation_run_id: generationRunId,
        version: 1,
        file_name: "trust_rrr.pdf",
        mime_type: "application/pdf",
        size_bytes: 2048,
        storage_path: "generated/trust_rrr.pdf",
        is_final: false,
        created_at: "2026-03-05T00:00:10.000Z",
      },
    ]);
    mocks.listDocumentGenerationRunsMock.mockResolvedValue([
      {
        id: generationRunId,
        output_key: "trust_rrr",
        status: "rendered",
        document_version_id: "version-1",
        blocking_requirements_json: [],
        error_message: null,
        created_at: "2026-03-05T00:00:10.000Z",
      },
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([]);
    mocks.listDocumentOutputSignersMock.mockResolvedValue([signerRecord]);
    mocks.getDocumentOutputSignerByIdMock.mockResolvedValue(signerRecord);
    mocks.isDocumentIntakeLockedMock.mockReturnValue(true);
    mocks.createDocumentDownloadUrlMock.mockResolvedValue({ signedUrl: "https://download.example.com" });
    mocks.createSignatureDownloadUrlMock.mockResolvedValue({ signedUrl: "https://signature.example.com" });
    mocks.applySignatureCaptureToDocumentOutputMock.mockResolvedValue(null);
  });

  it("confirms completed signing and advances notarization-required documents", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      product_flow_mode: "trust_bundle",
      selected_families: [],
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      {
        id: "sig-1",
        document_id: "doc-1",
        generation_run_id: generationRunId,
        document_output_signer_id: outputSignerId,
        signer_id: "owner-1",
        capture_method: "type",
        storage_path: null,
        status: "captured",
        mime_type: null,
        size_bytes: null,
        typed_value: "Owner One",
        typed_kind: "name",
        captured_at: "2026-03-05T00:00:20.000Z",
        created_at: "2026-03-05T00:00:20.000Z",
      },
    ]);

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/sign",
      { confirmed: true },
      "confirms completed signing",
      token,
    );

    expect(response.status).toBe(200);
    expect(mocks.updateDocumentMock).toHaveBeenCalledWith("doc-1", { status: "pending_notary" });
    expect(response.body.documentStatus).toEqual({
      previousStatus: "pending_signature",
      nextStatus: "pending_notary",
      updated: true,
      requiresNotarization: true,
    });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "member.document_signatures_confirmed",
        metadata: expect.objectContaining({
          next_status: "pending_notary",
          status_updated: true,
          requires_notarization: true,
        }),
      }),
    );
  });

  it("requests a signature upload", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.createSignatureRecordMock.mockResolvedValue({
      id: "sig-1",
      document_id: "doc-1",
      generation_run_id: generationRunId,
      document_output_signer_id: outputSignerId,
      signer_id: "owner-1",
      capture_method: "upload",
      storage_path: "signatures/doc-1/sig-1.png",
      status: "upload_pending",
      mime_type: "image/png",
      size_bytes: 1024,
      typed_value: null,
      typed_kind: null,
      captured_at: null,
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
        ...signatureTargetPayload,
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

  it("allows a claimed invite signer to load only their signing obligation", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("invited-user-1");
    mocks.getOrCreateUserIdMock.mockResolvedValue("invited-user-1");
    mocks.resolveClaimedSignerInviteAccessMock.mockResolvedValue({
      inviteId: "invite-1",
      documentId: "doc-1",
      documentOutputSignerId: outputSignerId,
      documentPartyId: "party-1",
      claimedUserId: "invited-user-1",
      partyRole: "trustee",
      obligationType: "signer",
      outputKey: "trust_rrr",
      documentKey: "trust_rrr",
      recipientEmail: "signer@example.com",
    });
    mocks.listDocumentOutputSignersMock.mockResolvedValue([
      signerRecord,
      {
        ...signerRecord,
        id: "other-signer",
        document_party_id: "other-party",
        party_name: "Other Signer",
        sort_order: 1,
      },
    ]);

    const token = signToken({
      sub: "invited-supabase-user-1",
      email: "signer@example.com",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/documents/doc-1/signing")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.signing.viewerAccess).toEqual(
      expect.objectContaining({
        kind: "invited_signer",
        inviteId: "invite-1",
        documentOutputSignerId: outputSignerId,
      }),
    );
    expect(response.body.signing.signatures).toHaveLength(1);
    expect(response.body.signing.signatures[0].outputSignerId).toBe(outputSignerId);
    expect(response.body.signing.completion.canConfirm).toBe(false);
  });

  it("keeps the signing workspace readable after completion advances to notary", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_notary",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.listDocumentSystemValuesMock.mockResolvedValue([
      {
        system_key: "review_approval",
        value_json: {
          approvedAt: "2026-03-05T00:00:00.000Z",
          approvedOutputKeys: ["trust_rrr"],
        },
      },
      {
        system_key: "signature_execution",
        value_json: {
          confirmedAt: "2026-03-05T00:00:30.000Z",
          confirmedBySupabaseId: "supabase-owner-1",
          confirmedByRole: "member",
          generationRunIds: [generationRunId],
          completedOutputSignerIds: [outputSignerId],
          completedSignatureIds: ["sig-1"],
        },
      },
    ]);
    mocks.listDocumentSignaturesMock.mockResolvedValue([
      {
        id: "sig-1",
        document_id: "doc-1",
        generation_run_id: generationRunId,
        document_output_signer_id: outputSignerId,
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
        captured_at: "2026-03-05T00:00:20.000Z",
        created_at: "2026-03-05T00:00:20.000Z",
      },
    ]);

    const token = signToken({
      sub: "supabase-owner-1",
      email: "owner@example.com",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .get("/documents/doc-1/signing")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.document.status).toBe("pending_notary");
    expect(response.body.signing.state).toBe("confirmed");
    expect(response.body.signing.signatures[0]).toEqual(
      expect.objectContaining({
        outputSignerId,
        status: "captured",
        typedValue: "Owner One",
      }),
    );
  });

  it("lists saved signatures when an older saved asset is missing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.listCapturedSignaturesForSignerMock.mockResolvedValue([
      {
        id: "saved-good",
        document_id: "doc-1",
        generation_run_id: generationRunId,
        document_output_signer_id: outputSignerId,
        signer_id: "owner-1",
        signature_type: "member",
        storage_path: "signatures/doc-1/run-1/saved-good.png",
        capture_method: "draw",
        typed_value: null,
        typed_kind: null,
        mime_type: "image/png",
        size_bytes: 1024,
        status: "captured",
        metadata: {},
        captured_at: "2026-03-05T00:00:20.000Z",
        created_at: "2026-03-05T00:00:20.000Z",
      },
      {
        id: "saved-missing",
        document_id: "old-doc-1",
        generation_run_id: null,
        document_output_signer_id: null,
        signer_id: "owner-1",
        signature_type: "member",
        storage_path: "signatures/old-doc-1/saved-missing.png",
        capture_method: "upload",
        typed_value: null,
        typed_kind: null,
        mime_type: "image/png",
        size_bytes: null,
        status: "captured",
        metadata: {},
        captured_at: "2026-03-04T00:00:20.000Z",
        created_at: "2026-03-04T00:00:20.000Z",
      },
      {
        id: "saved-deleted",
        document_id: "old-doc-2",
        generation_run_id: null,
        document_output_signer_id: null,
        signer_id: "owner-1",
        signature_type: "member",
        storage_path: null,
        capture_method: "type",
        typed_value: "Deleted Signature",
        typed_kind: "name",
        mime_type: null,
        size_bytes: null,
        status: "captured",
        metadata: { savedSignatureDeletedAt: "2026-03-04T00:05:20.000Z" },
        captured_at: "2026-03-04T00:00:20.000Z",
        created_at: "2026-03-04T00:00:20.000Z",
      },
    ]);
    mocks.createSignatureDownloadUrlMock.mockReset();
    mocks.createSignatureDownloadUrlMock
      .mockResolvedValueOnce({ signedUrl: "https://signature.example.com/good" })
      .mockRejectedValueOnce(new Error("Object not found"));

    try {
      const token = signToken({
        sub: "supabase-owner-1",
        email: "owner@example.com",
        app_metadata: { role: "member" },
      });

      const response = await request(app)
        .get("/documents/doc-1/signatures/saved")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body.savedSignatures).toEqual([
        expect.objectContaining({
          id: "saved-good",
          assetDownloadUrl: "https://signature.example.com/good",
        }),
        expect.objectContaining({
          id: "saved-missing",
          assetDownloadUrl: null,
        }),
      ]);
      expect(mocks.createSignatureDownloadUrlMock).toHaveBeenCalledTimes(2);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("removes saved signatures from the reuse picker", async () => {
    const savedSignature = {
      id: "saved-delete",
      document_id: "old-doc-1",
      generation_run_id: generationRunId,
      document_output_signer_id: outputSignerId,
      signer_id: "owner-1",
      signature_type: "member",
      storage_path: "signatures/old-doc-1/saved-delete.png",
      capture_method: "draw",
      typed_value: null,
      typed_kind: null,
      mime_type: "image/png",
      size_bytes: 1024,
      status: "captured",
      metadata: {},
      captured_at: "2026-03-05T00:00:20.000Z",
      created_at: "2026-03-05T00:00:20.000Z",
    };
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getSignatureRecordByIdMock.mockResolvedValue(savedSignature);
    mocks.updateSignatureRecordMock.mockResolvedValue({
      ...savedSignature,
      metadata: { savedSignatureDeletedAt: "2026-03-05T00:01:20.000Z" },
    });

    const token = signToken({
      sub: "supabase-owner-1",
      email: "owner@example.com",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .delete("/documents/doc-1/signatures/saved/saved-delete")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      deletedSignatureId: "saved-delete",
    });
    expect(mocks.updateSignatureRecordMock).toHaveBeenCalledWith(
      "saved-delete",
      "old-doc-1",
      expect.objectContaining({
        metadata: expect.objectContaining({
          savedSignatureDeletedAt: expect.any(String),
          savedSignatureDeletedBySupabaseId: "supabase-owner-1",
        }),
      }),
    );
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "member.saved_signature_deleted",
        entityId: "saved-delete",
      }),
    );
  });

  it("creates invited signer signature records with the claimed user id", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("invited-user-1");
    mocks.getOrCreateUserIdMock.mockResolvedValue("invited-user-1");
    mocks.resolveClaimedSignerInviteAccessMock.mockResolvedValue({
      inviteId: "invite-1",
      documentId: "doc-1",
      documentOutputSignerId: outputSignerId,
      documentPartyId: "party-1",
      claimedUserId: "invited-user-1",
      partyRole: "trustee",
      obligationType: "signer",
      outputKey: "trust_rrr",
      documentKey: "trust_rrr",
      recipientEmail: "signer@example.com",
    });
    mocks.createSignatureRecordMock.mockResolvedValue({
      id: "sig-1",
      document_id: "doc-1",
      generation_run_id: generationRunId,
      document_output_signer_id: outputSignerId,
      signer_id: "invited-user-1",
      capture_method: "type",
      storage_path: null,
      status: "captured",
      mime_type: null,
      size_bytes: null,
      typed_value: "Sara Signer",
      typed_kind: "name",
      captured_at: "2026-03-05T00:00:20.000Z",
      created_at: "2026-03-05T00:00:20.000Z",
    });

    const token = signToken({
      sub: "invited-supabase-user-1",
      email: "signer@example.com",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/signatures",
      {
        ...signatureTargetPayload,
        captureMethod: "type",
        typedValue: "Sara Signer",
        typedKind: "name",
      },
      "creates invited signer signature",
      token,
    );

    expect(response.status).toBe(201);
    expect(mocks.createSignatureRecordMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentOutputSignerId: outputSignerId,
        signerId: "invited-user-1",
      }),
    );
    expect(mocks.completeSigningWorkflowAfterSignatureCaptureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        completedOutputSignerId: outputSignerId,
        completedSignatureId: "sig-1",
      }),
    );
  });

  it("rejects signature upload before review approval", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: null,
      status: "pending_review",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");

    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/signatures/request",
      {
        ...signatureTargetPayload,
        fileName: "sig.png",
        fileSize: 1024,
        mimeType: "image/png",
      },
      "rejects signature upload before review approval",
      token
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(
      "Document review approval is required before signing"
    );
  });

  it("rejects invalid signature mime type", async () => {
    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/documents/doc-1/signatures/request",
      {
        ...signatureTargetPayload,
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
        ...signatureTargetPayload,
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
    mocks.queueRemainingSignerInvitesAfterCreatorSignatureMock.mockResolvedValueOnce({
      documentId: "doc-1",
      triggeredAt: "2026-03-05T00:00:20.000Z",
      resolution: {
        documentId: "doc-1",
        actorUserId: "owner-1",
        actorEmail: null,
        trigger: {
          actorIsDocumentOwner: true,
          creatorResolutionStrategy: "single_grantor_fallback",
          creatorPartyIds: ["party-owner"],
          creatorOutputSignerIds: [outputSignerId],
          completedOutputSignerId: outputSignerId,
          completedOutputSignerIsCreator: true,
          creatorSigningCompleteBefore: false,
          creatorSigningCompleteAfter: true,
          creatorSigningJustCompleted: true,
          shouldQueueInvites: true,
          blockedReason: null,
        },
        candidates: [],
        skipped: [],
      },
      invited: [
        {
          documentOutputSignerId: "remaining-signer-1",
          documentPartyId: "party-remaining-1",
          recipientEmail: "remaining@example.com",
          recipientName: "Remaining Signer",
          inviteId: "invite-1",
          existing: false,
          notificationJobId: "job-1",
          notificationDeliveryId: "delivery-1",
          idempotencyKey: "signing-remaining:doc-1:remaining-signer-1",
        },
      ],
      failures: [],
    });
    mocks.completeSigningWorkflowAfterSignatureCaptureMock.mockResolvedValueOnce({
      documentId: "doc-1",
      completedOutputSignerId: outputSignerId,
      completedSignatureId: "sig-1",
      allSignerRequirementsSatisfied: true,
      remainingSignerCount: 0,
      completedInviteIds: ["invite-1"],
      notifications: {
        signerCompletionConfirmationJobIds: [],
        signerSignedUpdateJobId: null,
        allSignaturesCompleteJobId: "job-all-complete",
      },
      signingExecution: {
        alreadyConfirmed: false,
        persisted: true,
        confirmedAt: "2026-03-05T00:00:20.000Z",
      },
      documentStatus: {
        previousStatus: "pending_signature",
        nextStatus: "pending_notary",
        updated: true,
        requiresNotarization: true,
      },
    });
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getSignatureByIdMock.mockResolvedValue({
      id: "sig-1",
      document_id: "doc-1",
      generation_run_id: generationRunId,
      document_output_signer_id: outputSignerId,
      signer_id: "owner-1",
      capture_method: "upload",
      storage_path: "signatures/doc-1/sig-1.png",
      status: "upload_pending",
      mime_type: "image/png",
      size_bytes: 1024,
      typed_value: null,
      typed_kind: null,
      captured_at: null,
      created_at: "2026-03-05T00:00:10.000Z",
    });
    mocks.updateSignatureRecordMock.mockResolvedValue({
      id: "sig-1",
      document_id: "doc-1",
      generation_run_id: generationRunId,
      document_output_signer_id: outputSignerId,
      signer_id: "owner-1",
      capture_method: "upload",
      storage_path: "signatures/doc-1/sig-1.png",
      status: "captured",
      mime_type: "image/png",
      size_bytes: 1024,
      typed_value: null,
      typed_kind: null,
      captured_at: "2026-03-05T00:00:20.000Z",
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
        ...signatureTargetPayload,
        signatureId: "sig-1",
      },
      "finalizes signature upload",
      token
    );

    expect(response.status).toBe(200);
    expect(response.body.signature.status).toBe("captured");
    expect(response.body.remainingSignerInvites.invited).toEqual([
      expect.objectContaining({
        documentOutputSignerId: "remaining-signer-1",
        inviteId: "invite-1",
      }),
    ]);
    expect(response.body.signingCompletion).toEqual(
      expect.objectContaining({
        allSignerRequirementsSatisfied: true,
        remainingSignerCount: 0,
        completedInviteIds: ["invite-1"],
        documentStatus: expect.objectContaining({
          nextStatus: "pending_notary",
          updated: true,
          requiresNotarization: true,
        }),
        signingExecution: expect.objectContaining({
          persisted: true,
        }),
      }),
    );
    expect(mocks.queueRemainingSignerInvitesAfterCreatorSignatureMock).toHaveBeenCalledWith({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: null,
      completedOutputSignerId: outputSignerId,
      completedSignatureId: "sig-1",
    });
    expect(mocks.completeSigningWorkflowAfterSignatureCaptureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        completedOutputSignerId: outputSignerId,
        completedSignatureId: "sig-1",
      }),
    );
  });

  it("rejects missing signature upload", async () => {
    mocks.getDocumentByIdMock.mockResolvedValue({
      id: "doc-1",
      owner_id: "owner-1",
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getSignatureByIdMock.mockResolvedValue({
      id: "sig-1",
      document_id: "doc-1",
      generation_run_id: generationRunId,
      document_output_signer_id: outputSignerId,
      signer_id: "owner-1",
      capture_method: "upload",
      storage_path: "signatures/doc-1/sig-1.png",
      status: "upload_pending",
      mime_type: "image/png",
      size_bytes: 1024,
      typed_value: null,
      typed_kind: null,
      captured_at: null,
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
        ...signatureTargetPayload,
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
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getSignatureByIdMock.mockResolvedValue({
      id: "sig-1",
      document_id: "doc-1",
      generation_run_id: generationRunId,
      document_output_signer_id: outputSignerId,
      signer_id: "owner-1",
      capture_method: "upload",
      storage_path: "signatures/doc-1/sig-1.png",
      status: "upload_pending",
      mime_type: "application/pdf",
      size_bytes: 1024,
      typed_value: null,
      typed_kind: null,
      captured_at: null,
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
        ...signatureTargetPayload,
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
      idn: "AB12CD34EF56",
      status: "pending_signature",
      document_type: "generic",
      jurisdiction: "US-OH",
      created_at: "2026-03-05T00:00:00.000Z",
      intake_status: "submitted",
      intake_submitted_at: "2026-03-05T00:00:00.000Z",
      output_bundle: outputBundle,
    });
    mocks.getUserIdBySupabaseIdMock.mockResolvedValue("owner-1");
    mocks.getSignatureByIdMock.mockResolvedValue({
      id: "sig-1",
      document_id: "doc-1",
      generation_run_id: generationRunId,
      document_output_signer_id: outputSignerId,
      signer_id: "owner-1",
      capture_method: "upload",
      storage_path: "signatures/doc-1/sig-1.png",
      status: "upload_pending",
      mime_type: "image/png",
      size_bytes: 6 * 1024 * 1024,
      typed_value: null,
      typed_kind: null,
      captured_at: null,
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
        ...signatureTargetPayload,
        signatureId: "sig-1",
      },
      "rejects oversized signature on finalize",
      token
    );

    expect(response.status).toBe(400);
  });
});
