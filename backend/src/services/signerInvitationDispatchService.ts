import { createDocumentInvite, resendDocumentInvite } from "./documentInviteService";
import { queueCreatorSigningInvitesSentNotification } from "./notificationService";
import { runDueNotificationJobs } from "./notificationOutboxService";
import { captureMessage } from "../utils/sentry";
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
  notificationJobIds: string[];
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

const existingInviteStatusesEligibleForImmediateResend = new Set([
  "draft",
  "queued",
  "failed",
]);

const collectNotificationJobIds = (notification: { jobId?: string | null; jobIds?: string[]; pushJobIds?: string[] } | null | undefined) =>
  Array.from(
    new Set(
      [
        notification?.jobId ?? null,
        ...(notification?.jobIds ?? []),
        ...(notification?.pushJobIds ?? []),
      ].filter((jobId): jobId is string => Boolean(jobId && jobId.trim())),
    ),
  );

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
  const shouldResendExistingInvite =
    result.existing &&
    !result.notification &&
    existingInviteStatusesEligibleForImmediateResend.has(result.invite.status);
  const notificationResult = shouldResendExistingInvite
    ? await resendDocumentInvite({
        role: "service_role",
        viewerUserId: input.actorUserId,
        inviteId: result.invite.id,
      })
    : result;

  return {
    documentOutputSignerId: input.candidate.documentOutputSignerId,
    documentPartyId: input.candidate.documentPartyId,
    recipientEmail: input.candidate.recipientEmail,
    recipientName: input.candidate.recipientName,
    inviteId: notificationResult.invite.id,
    existing: result.existing,
    notificationJobId: notificationResult.notification?.jobId ?? null,
    notificationJobIds: collectNotificationJobIds(notificationResult.notification),
    notificationDeliveryId: notificationResult.notification?.deliveryId ?? null,
    idempotencyKey: input.candidate.idempotencyKey,
  } satisfies RemainingSignerInviteDispatchSuccess;
};

const summarizeResolution = (resolution: RemainingSignerInvitationResolution) => ({
  actorUserId: resolution.actorUserId,
  actorEmail: resolution.actorEmail,
  trigger: resolution.trigger,
  candidateCount: resolution.candidates.length,
  skipped: resolution.skipped.map((skip) => ({
    documentOutputSignerId: skip.documentOutputSignerId,
    partyRole: skip.partyRole,
    partyName: skip.partyName,
    reason: skip.reason,
    activeInviteId: skip.activeInviteId ?? null,
  })),
});

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
    const result = await runDueNotificationJobs({
      limit: notificationJobIds.length,
      workerId: "signer-invite-immediate",
      documentId: input.documentId,
      notificationJobIds,
    });
    const failedJobs = result.jobs.filter(
      (job) => job.failedCount > 0 || job.status === "failed",
    );
    if (failedJobs.length > 0) {
      console.warn("Immediate signer invite notification delivery failed", {
        documentId: input.documentId,
        notificationJobIds,
        failedJobs,
      });
      captureMessage("Immediate signer invite notification delivery failed", {
        level: "warning",
        tags: {
          component: "signer_invitation_dispatch",
          jobKind: "invite",
        },
        contexts: {
          notification: {
            documentId: input.documentId,
            notificationJobIds,
            failedJobs,
          },
        },
      });
    }
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
    console.info("Remaining signer invite dispatch skipped", {
      documentId: input.documentId,
      blockedReason: resolution.trigger.blockedReason,
      resolution: summarizeResolution(resolution),
    });

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

  if (failures.length > 0) {
    console.warn("Remaining signer invite candidate dispatch failures", {
      documentId: input.documentId,
      failures,
    });
  }

  if (invited.length === 0) {
    console.info("Remaining signer invite dispatch found no invite candidates", {
      documentId: input.documentId,
      resolution: summarizeResolution(resolution),
    });
  }

  const creatorNotification = invited.length > 0
    ? await queueCreatorSigningInvitesSentNotification({
        documentId: input.documentId,
        completedSignatureId: input.completedSignatureId ?? null,
        invitedSignerCount: invited.length,
        invitedSignerNames: invited.map((invite) => invite.recipientName),
        requestedBySupabaseUserId: undefined,
      })
    : null;

  const notificationJobIds = [
    ...invited.flatMap((invite) => invite.notificationJobIds),
    ...collectNotificationJobIds(creatorNotification),
  ];

  if (invited.length > 0 && notificationJobIds.length === 0) {
    console.info("Remaining signer invite dispatch produced no notification jobs", {
      documentId: input.documentId,
      invited,
      resolution: summarizeResolution(resolution),
    });
  }

  await flushQueuedInviteNotifications({
    documentId: input.documentId,
    notificationJobIds,
  });

  return {
    documentId: input.documentId,
    triggeredAt: new Date().toISOString(),
    resolution,
    invited,
    failures,
  } satisfies RemainingSignerInviteDispatchResult;
};
