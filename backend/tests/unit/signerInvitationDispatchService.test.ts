import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

const mocks = vi.hoisted(() => ({
  resolveRemainingSignerInvitationsAfterCreatorSignatureMock: vi.fn(),
  createDocumentInviteMock: vi.fn(),
  resendDocumentInviteMock: vi.fn(),
  runDueNotificationJobsMock: vi.fn(),
}));

vi.mock("../../src/services/signerInvitationResolverService", () => ({
  resolveRemainingSignerInvitationsAfterCreatorSignature:
    mocks.resolveRemainingSignerInvitationsAfterCreatorSignatureMock,
}));

vi.mock("../../src/services/documentInviteService", () => ({
  createDocumentInvite: mocks.createDocumentInviteMock,
  resendDocumentInvite: mocks.resendDocumentInviteMock,
}));

vi.mock("../../src/services/notificationOutboxService", () => ({
  runDueNotificationJobs: mocks.runDueNotificationJobsMock,
}));

import {
  queueRemainingSignerInvitesAfterCreatorSignature,
} from "../../src/services/signerInvitationDispatchService";

const baseTrigger = {
  actorIsDocumentOwner: true,
  creatorResolutionStrategy: "actor_email_match",
  creatorPartyIds: ["party-owner"],
  creatorOutputSignerIds: ["creator-signer"],
  completedOutputSignerId: "creator-signer",
  completedOutputSignerIsCreator: true,
  creatorSigningCompleteBefore: false,
  creatorSigningCompleteAfter: true,
  creatorSigningJustCompleted: true,
  shouldQueueInvites: true,
  blockedReason: null,
};

const buildCandidate = (overrides: Record<string, unknown> = {}) => ({
  documentId: "doc-1",
  documentOutputSignerId: "signer-1",
  documentPartyId: "party-1",
  generationRunId: "run-1",
  outputKey: "trust_rrr",
  documentKey: "trust_rrr",
  partyRole: "trustee",
  obligationType: "signer",
  recipientEmail: "signer@example.com",
  recipientName: "Sara Signer",
  claimMode: "required_signup",
  idempotencyKey: "signing-remaining:doc-1:signer-1",
  ...overrides,
});

describe("signer invitation dispatcher", () => {
  beforeEach(() => {
    mocks.resolveRemainingSignerInvitationsAfterCreatorSignatureMock.mockReset();
    mocks.createDocumentInviteMock.mockReset();
    mocks.resendDocumentInviteMock.mockReset();
    mocks.runDueNotificationJobsMock.mockReset();
    mocks.runDueNotificationJobsMock.mockResolvedValue({
      scannedCount: 0,
      claimedCount: 0,
      processedCount: 0,
      jobs: [],
    });
  });

  it("does not queue invites when the resolver says the trigger is blocked", async () => {
    mocks.resolveRemainingSignerInvitationsAfterCreatorSignatureMock.mockResolvedValue({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      trigger: {
        ...baseTrigger,
        shouldQueueInvites: false,
        blockedReason: "creator_signing_incomplete",
      },
      candidates: [buildCandidate()],
      skipped: [],
    });

    const result = await queueRemainingSignerInvitesAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "creator-signer",
      completedSignatureId: "sig-1",
    });

    expect(result.invited).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(mocks.createDocumentInviteMock).not.toHaveBeenCalled();
  });

  it("queues invite candidates through the existing document invite service", async () => {
    mocks.resolveRemainingSignerInvitationsAfterCreatorSignatureMock.mockResolvedValue({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      trigger: baseTrigger,
      candidates: [buildCandidate()],
      skipped: [],
    });
    mocks.createDocumentInviteMock.mockResolvedValue({
      invite: { id: "invite-1" },
      notification: {
        jobId: "job-1",
        deliveryId: "delivery-1",
        templateId: "template-1",
        templateKey: "signer_signup_required_email",
      },
      access: {
        token: "raw-token",
        accessUrl: "https://app.example.com/app/invite?token=raw-token",
        expiresAt: "2026-04-30T00:00:00.000Z",
      },
      existing: false,
    });

    const result = await queueRemainingSignerInvitesAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "creator-signer",
      completedSignatureId: "sig-1",
    });

    expect(mocks.createDocumentInviteMock).toHaveBeenCalledWith({
      role: "service_role",
      viewerUserId: "owner-1",
      documentId: "doc-1",
      documentOutputSignerId: "signer-1",
      recipientEmail: "signer@example.com",
      recipientName: "Sara Signer",
      inviteLabel: null,
      claimMode: "required_signup",
      expiresAt: null,
      idempotencyKey: "signing-remaining:doc-1:signer-1",
    });
    expect(result.invited).toEqual([
      {
        documentOutputSignerId: "signer-1",
        documentPartyId: "party-1",
        recipientEmail: "signer@example.com",
        recipientName: "Sara Signer",
        inviteId: "invite-1",
        existing: false,
        notificationJobId: "job-1",
        notificationDeliveryId: "delivery-1",
        idempotencyKey: "signing-remaining:doc-1:signer-1",
      },
    ]);
    expect(result.failures).toEqual([]);
    expect(mocks.runDueNotificationJobsMock).toHaveBeenCalledWith({
      limit: 1,
      workerId: "signer-invite-immediate",
      documentId: "doc-1",
      notificationJobIds: ["job-1"],
    });
  });

  it("resends stale existing invite candidates and flushes the new reminder job", async () => {
    mocks.resolveRemainingSignerInvitationsAfterCreatorSignatureMock.mockResolvedValue({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      trigger: baseTrigger,
      candidates: [buildCandidate()],
      skipped: [],
    });
    mocks.createDocumentInviteMock.mockResolvedValue({
      invite: { id: "invite-1", status: "queued" },
      notification: null,
      access: null,
      existing: true,
    });
    mocks.resendDocumentInviteMock.mockResolvedValue({
      invite: { id: "invite-1", status: "queued" },
      notification: {
        jobId: "job-reminder-1",
        deliveryId: "delivery-reminder-1",
        templateId: "template-reminder-1",
        templateKey: "signer_reminder_email",
      },
      access: {
        token: "raw-token",
        accessUrl: "https://app.example.com/app/invite?token=raw-token",
        expiresAt: "2026-04-30T00:00:00.000Z",
      },
      existing: true,
    });

    const result = await queueRemainingSignerInvitesAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      completedOutputSignerId: "creator-signer",
      completedSignatureId: "sig-1",
    });

    expect(mocks.resendDocumentInviteMock).toHaveBeenCalledWith({
      role: "service_role",
      viewerUserId: "owner-1",
      inviteId: "invite-1",
    });
    expect(result.invited).toEqual([
      expect.objectContaining({
        inviteId: "invite-1",
        existing: true,
        notificationJobId: "job-reminder-1",
        notificationDeliveryId: "delivery-reminder-1",
      }),
    ]);
    expect(mocks.runDueNotificationJobsMock).toHaveBeenCalledWith({
      limit: 1,
      workerId: "signer-invite-immediate",
      documentId: "doc-1",
      notificationJobIds: ["job-reminder-1"],
    });
  });

  it("continues queuing other candidates when one invite fails", async () => {
    mocks.resolveRemainingSignerInvitationsAfterCreatorSignatureMock.mockResolvedValue({
      documentId: "doc-1",
      actorUserId: "owner-1",
      actorEmail: "owner@example.com",
      trigger: baseTrigger,
      candidates: [
        buildCandidate({ documentOutputSignerId: "signer-fail" }),
        buildCandidate({
          documentOutputSignerId: "signer-ok",
          documentPartyId: "party-ok",
          recipientEmail: "ok@example.com",
          recipientName: "Olive Ok",
          idempotencyKey: "signing-remaining:doc-1:signer-ok",
        }),
      ],
      skipped: [],
    });
    mocks.createDocumentInviteMock
      .mockRejectedValueOnce(new Error("template missing"))
      .mockResolvedValueOnce({
        invite: { id: "invite-ok" },
        notification: null,
        access: null,
        existing: true,
      });

    const result = await queueRemainingSignerInvitesAfterCreatorSignature({
      documentId: "doc-1",
      actorUserId: "owner-1",
    });

    expect(result.invited).toEqual([
      expect.objectContaining({
        documentOutputSignerId: "signer-ok",
        inviteId: "invite-ok",
        existing: true,
      }),
    ]);
    expect(result.failures).toEqual([
      expect.objectContaining({
        documentOutputSignerId: "signer-fail",
        errorMessage: "template missing",
      }),
    ]);
  });
});
