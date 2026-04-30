import { createDocumentInvite } from "./documentInviteService";
import { runDueNotificationJobs } from "./notificationOutboxService";
import {
  resolveRemainingSignerInvitationsAfterCreatorSignature,
  type RemainingSignerInvitationCandidate,
  type RemainingSignerInvitationResolution,
} from "./signerInvitationResolverService";

export type RemainingSignerInviteDispatchSuccess = {
  documentOutputSignerId: string;
  documentPartyId: string | null;
  recipientEmail: string;
  recipientName: string;
  inviteId: string;
  existing: boolean;
  notificationJobId: string | null;
  notificationDeliveryId: string | null;
  idempotencyKey: string;
};

export type RemainingSignerInviteDispatchFailure = {
  documentOutputSignerId: string;
  documentPartyId: string | null;
  recipientEmail: string;
  recipientName: string;
  idempotencyKey: string;
  errorMessage: string;
};

export type RemainingSignerInviteDispatchResult = {
  documentId: string;
  triggeredAt: string;
  resolution: RemainingSignerInvitationResolution;
  invited: RemainingSignerInviteDispatchSuccess[];
  failures: RemainingSignerInviteDispatchFailure[];
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error);
};

const queueCandidateInvite = async (input: {
  actorUserId: string | null;
  candidate: RemainingSignerInvitationCandidate;
}) => {
  const result = await createDocumentInvite({
    role: "service_role",
    viewerUserId: input.actorUserId,
    documentId: input.candidate.documentId,
    documentOutputSignerId: input.candidate.documentOutputSignerId,
    recipientEmail: input.candidate.recipientEmail,
    recipientName: input.candidate.recipientName,
    inviteLabel: null,
    claimMode: input.candidate.claimMode,
    expiresAt: null,
    idempotencyKey: input.candidate.idempotencyKey,
  });

  return {
    documentOutputSignerId: input.candidate.documentOutputSignerId,
    documentPartyId: input.candidate.documentPartyId,
    recipientEmail: input.candidate.recipientEmail,
    recipientName: input.candidate.recipientName,
    inviteId: result.invite.id,
    existing: result.existing,
    notificationJobId: result.notification?.jobId ?? null,
    notificationDeliveryId: result.notification?.deliveryId ?? null,
    idempotencyKey: input.candidate.idempotencyKey,
  } satisfies RemainingSignerInviteDispatchSuccess;
};

const flushQueuedInviteNotifications = async (input: {
  documentId: string;
  notificationJobIds: string[];
}) => {
  const notificationJobIds = Array.from(
    new Set(input.notificationJobIds.filter((jobId) => jobId.trim().length > 0)),
  );
  if (notificationJobIds.length === 0) {
    return;
  }

  try {
    await runDueNotificationJobs({
      limit: notificationJobIds.length,
      workerId: "signer-invite-immediate",
      jobKind: "invite",
      documentId: input.documentId,
      notificationJobIds,
    });
  } catch (error) {
    console.warn("Immediate signer invite notification dispatch failed", {
      documentId: input.documentId,
      notificationJobIds,
      error: getErrorMessage(error),
    });
  }
};

export const queueRemainingSignerInvitesAfterCreatorSignature = async (input: {
  documentId: string;
  actorUserId?: string | null;
  actorEmail?: string | null;
  completedOutputSignerId?: string | null;
  completedSignatureId?: string | null;
}) => {
  const resolution = await resolveRemainingSignerInvitationsAfterCreatorSignature({
    documentId: input.documentId,
    actorUserId: input.actorUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    completedOutputSignerId: input.completedOutputSignerId ?? null,
    completedSignatureId: input.completedSignatureId ?? null,
  });
  const invited: RemainingSignerInviteDispatchSuccess[] = [];
  const failures: RemainingSignerInviteDispatchFailure[] = [];

  if (!resolution.trigger.shouldQueueInvites) {
    return {
      documentId: input.documentId,
      triggeredAt: new Date().toISOString(),
      resolution,
      invited,
      failures,
    } satisfies RemainingSignerInviteDispatchResult;
  }

  for (const candidate of resolution.candidates) {
    try {
      const invite = await queueCandidateInvite({
        actorUserId: input.actorUserId ?? null,
        candidate,
      });
      invited.push(invite);
    } catch (error) {
      failures.push({
        documentOutputSignerId: candidate.documentOutputSignerId,
        documentPartyId: candidate.documentPartyId,
        recipientEmail: candidate.recipientEmail,
        recipientName: candidate.recipientName,
        idempotencyKey: candidate.idempotencyKey,
        errorMessage: getErrorMessage(error),
      });
    }
  }

  await flushQueuedInviteNotifications({
    documentId: input.documentId,
    notificationJobIds: invited
      .map((invite) => invite.notificationJobId)
      .filter((jobId): jobId is string => Boolean(jobId)),
  });

  return {
    documentId: input.documentId,
    triggeredAt: new Date().toISOString(),
    resolution,
    invited,
    failures,
  } satisfies RemainingSignerInviteDispatchResult;
};
