import {
  createDocumentInvite,
  listDocumentInvites,
  resendDocumentInvite,
  type DocumentInviteDetail,
} from "./documentInviteService";
import {
  getDocumentById,
  listDocumentGenerationRuns,
  listDocumentOutputSigners,
  listDocumentParties,
  listDocumentSignatures,
  type DocumentOutputSignerRecord,
  type DocumentPartyRecord,
  type DocumentRecord,
} from "./documentService";
import { runDueNotificationJobs } from "./notificationOutboxService";
import { recordAuditEvent } from "./auditService";
import type { RequestRole } from "./userRoleService";
import {
  buildCapturedOutputSignerIds,
  filterCurrentSignerObligations,
  getRoleLabel,
  resolveDocumentTypeLabel,
  resolvePrincipalName,
} from "./documentActionService";

const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const MAX_REMINDER_DOCUMENTS = 50;

const activeInviteStatuses = new Set([
  "draft",
  "queued",
  "sent",
  "opened",
  "claimed",
  "accepted",
  "failed",
]);

const resendableInviteStatuses = new Set([
  "draft",
  "queued",
  "sent",
  "opened",
  "claimed",
  "accepted",
  "failed",
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value?: string | null) => {
  const normalized = value?.trim().toLowerCase() ?? "";
  return emailPattern.test(normalized) ? normalized : null;
};

const getLastReminderAt = (invite: DocumentInviteDetail | null) => {
  if (!invite) {
    return null;
  }

  const recipientLastNotifiedAt = invite.recipients
    .map((recipient) => recipient.lastNotifiedAt)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort()
    .at(-1);

  return recipientLastNotifiedAt ?? invite.sentAt ?? null;
};

const getNextEligibleAt = (lastReminderAt: string | null, now: Date) => {
  if (!lastReminderAt) {
    return null;
  }

  const parsed = new Date(lastReminderAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const next = new Date(parsed.getTime() + REMINDER_COOLDOWN_MS);
  return next.getTime() > now.getTime() ? next.toISOString() : null;
};

const getPrimaryRecipientEmail = (invite: DocumentInviteDetail | null) => {
  if (!invite) {
    return null;
  }

  const primaryRecipient =
    invite.recipients.find((recipient) => recipient.channel === "email" && recipient.isPrimary) ??
    invite.recipients.find((recipient) => recipient.channel === "email") ??
    null;

  return normalizeEmail(primaryRecipient?.deliveryAddress ?? null);
};

const getActiveInviteByOutputSignerId = (invites: DocumentInviteDetail[]) => {
  const activeInviteByOutputSignerId = new Map<string, DocumentInviteDetail>();

  for (const invite of invites) {
    if (!invite.documentOutputSignerId || !activeInviteStatuses.has(invite.status)) {
      continue;
    }

    if (!activeInviteByOutputSignerId.has(invite.documentOutputSignerId)) {
      activeInviteByOutputSignerId.set(invite.documentOutputSignerId, invite);
    }
  }

  return activeInviteByOutputSignerId;
};

const getPartyById = (parties: DocumentPartyRecord[]) => {
  return new Map(parties.map((party) => [party.id, party]));
};

const listAllDocumentInvites = async (documentId: string) => {
  const invites: DocumentInviteDetail[] = [];
  const limit = 100;
  let offset = 0;
  let total = 0;

  do {
    const page = await listDocumentInvites({
      role: "service_role",
      viewerUserId: null,
      documentId,
      documentOutputSignerId: null,
      status: null,
      limit,
      offset,
    });

    invites.push(...page.invites);
    total = page.page.total;
    offset += page.page.limit;
  } while (offset < total);

  return invites;
};

export type SignatureReminderRecipientPreview = {
  signerId: string;
  name: string | null;
  role: string;
  roleLabel: string;
  deliveryHint: string | null;
  cooldownActive: boolean;
  nextEligibleAt: string | null;
  hasActiveInvite: boolean;
  canSend: boolean;
  skipReason: string | null;
};

export type SignatureReminderDocumentPreview = {
  documentId: string;
  documentTypeLabel: string;
  principalName: string | null;
  pendingRecipients: SignatureReminderRecipientPreview[];
};

export type SignatureReminderPreview = {
  documentsRequested: number;
  documentsEligible: number;
  recipientsEligible: number;
  recipientsSkippedCooldown: number;
  documents: SignatureReminderDocumentPreview[];
};

type PendingRecipient = SignatureReminderRecipientPreview & {
  documentId: string;
  signer: DocumentOutputSignerRecord;
  recipientEmail: string | null;
  activeInvite: DocumentInviteDetail | null;
};

type LoadedDocumentReminderContext = {
  document: DocumentRecord;
  documentTypeLabel: string;
  principalName: string | null;
  pendingRecipients: PendingRecipient[];
};

const loadDocumentReminderContext = async (document: DocumentRecord, now: Date) => {
  const [generationRuns, rawSigners, parties, signatures, invites] = await Promise.all([
    listDocumentGenerationRuns(document.id),
    listDocumentOutputSigners({ documentId: document.id }),
    listDocumentParties(document.id),
    listDocumentSignatures({ documentId: document.id }),
    listAllDocumentInvites(document.id),
  ]);
  const currentSigners = filterCurrentSignerObligations({
    signers: rawSigners,
    generationRuns,
  });
  const capturedOutputSignerIds = buildCapturedOutputSignerIds(signatures);
  const partyById = getPartyById(parties);
  const activeInviteByOutputSignerId = getActiveInviteByOutputSignerId(invites);
  const pendingRecipients: PendingRecipient[] = [];

  for (const signer of currentSigners) {
    if (
      signer.obligation_type !== "signer" ||
      !signer.is_required ||
      capturedOutputSignerIds.has(signer.id)
    ) {
      continue;
    }

    const party = signer.document_party_id ? partyById.get(signer.document_party_id) ?? null : null;
    const activeInvite = activeInviteByOutputSignerId.get(signer.id) ?? null;
    const recipientEmail = normalizeEmail(party?.email ?? null) ?? getPrimaryRecipientEmail(activeInvite);
    const lastReminderAt = getLastReminderAt(activeInvite);
    const nextEligibleAt = getNextEligibleAt(lastReminderAt, now);
    const cooldownActive = Boolean(nextEligibleAt);
    const inviteCanBeResent = activeInvite ? resendableInviteStatuses.has(activeInvite.status) : true;
    const canSend = Boolean(recipientEmail && inviteCanBeResent);
    const skipReason = !recipientEmail
      ? "missing_email"
      : !inviteCanBeResent
          ? "invite_status_not_resendable"
          : null;

    pendingRecipients.push({
      documentId: document.id,
      signerId: signer.id,
      signer,
      recipientEmail,
      activeInvite,
      name: party?.full_name?.trim() || signer.party_name?.trim() || null,
      role: signer.party_role,
      roleLabel: getRoleLabel(signer.party_role),
      deliveryHint: recipientEmail,
      cooldownActive,
      nextEligibleAt,
      hasActiveInvite: Boolean(activeInvite),
      canSend,
      skipReason,
    });
  }

  return {
    document,
    documentTypeLabel: resolveDocumentTypeLabel(document),
    principalName: resolvePrincipalName(parties),
    pendingRecipients,
  } satisfies LoadedDocumentReminderContext;
};

const filterContextsBySignerIds = (
  contexts: LoadedDocumentReminderContext[],
  signerIds?: string[] | null,
) => {
  const signerIdSet = new Set((signerIds ?? []).map((id) => id.trim()).filter(Boolean));
  if (signerIdSet.size === 0) {
    return contexts;
  }

  return contexts.map((context) => ({
    ...context,
    pendingRecipients: context.pendingRecipients.filter((recipient) =>
      signerIdSet.has(recipient.signerId),
    ),
  }));
};

const toDocumentPreview = (context: LoadedDocumentReminderContext) => {
  return {
    documentId: context.document.id,
    documentTypeLabel: context.documentTypeLabel,
    principalName: context.principalName,
    pendingRecipients: context.pendingRecipients.map((recipient) => ({
      signerId: recipient.signerId,
      name: recipient.name,
      role: recipient.role,
      roleLabel: recipient.roleLabel,
      deliveryHint: recipient.deliveryHint,
      cooldownActive: recipient.cooldownActive,
      nextEligibleAt: recipient.nextEligibleAt,
      hasActiveInvite: recipient.hasActiveInvite,
      canSend: recipient.canSend,
      skipReason: recipient.skipReason,
    })),
  } satisfies SignatureReminderDocumentPreview;
};

const buildPreviewFromContexts = (
  contexts: LoadedDocumentReminderContext[],
  documentsRequested: number,
) => {
  const documents = contexts.map(toDocumentPreview);
  const recipients = documents.flatMap((document) => document.pendingRecipients);

  return {
    documentsRequested,
    documentsEligible: documents.filter((document) =>
      document.pendingRecipients.some((recipient) => recipient.canSend),
    ).length,
    recipientsEligible: recipients.filter((recipient) => recipient.canSend).length,
    recipientsSkippedCooldown: 0,
    documents,
  } satisfies SignatureReminderPreview;
};

export const previewSignatureReminders = async (input: {
  documentIds: string[];
  documents?: DocumentRecord[];
  signerIds?: string[] | null;
}) => {
  const documentIds = Array.from(new Set(input.documentIds.map((id) => id.trim()).filter(Boolean)));
  if (documentIds.length === 0) {
    return buildPreviewFromContexts([], 0);
  }

  if (documentIds.length > MAX_REMINDER_DOCUMENTS) {
    throw new Error(`Cannot preview reminders for more than ${MAX_REMINDER_DOCUMENTS} documents`);
  }

  const documentById = new Map(
    (input.documents ?? []).map((document) => [document.id, document]),
  );
  const documents = await Promise.all(
    documentIds.map(async (documentId) => documentById.get(documentId) ?? getDocumentById(documentId)),
  );
  const now = new Date();
  const contexts = await Promise.all(
    documents
      .filter((document): document is DocumentRecord => document !== null)
      .map((document) => loadDocumentReminderContext(document, now)),
  );

  return buildPreviewFromContexts(filterContextsBySignerIds(contexts, input.signerIds), documentIds.length);
};

export const sendSignatureReminders = async (input: {
  documentIds: string[];
  documents?: DocumentRecord[];
  signerIds?: string[] | null;
  actorSupabaseId?: string | null;
  actorUserId: string | null;
  actorRole: RequestRole;
  idempotencyKey?: string | null;
}) => {
  const documentIds = Array.from(new Set(input.documentIds.map((id) => id.trim()).filter(Boolean)));
  if (documentIds.length === 0) {
    return {
      ok: true,
      summary: {
        documentsRequested: 0,
        documentsProcessed: 0,
        recipientsEligible: 0,
        recipientsSent: 0,
        recipientsSkippedCooldown: 0,
        recipientsFailed: 0,
      },
      results: [],
    };
  }

  if (documentIds.length > MAX_REMINDER_DOCUMENTS) {
    throw new Error(`Cannot send reminders for more than ${MAX_REMINDER_DOCUMENTS} documents`);
  }

  const documentById = new Map(
    (input.documents ?? []).map((document) => [document.id, document]),
  );
  const documents = await Promise.all(
    documentIds.map(async (documentId) => documentById.get(documentId) ?? getDocumentById(documentId)),
  );
  const now = new Date();
  const loadedContexts = await Promise.all(
    documents
      .filter((document): document is DocumentRecord => document !== null)
      .map((document) => loadDocumentReminderContext(document, now)),
  );
  const contexts = filterContextsBySignerIds(loadedContexts, input.signerIds);
  const auditActor = input.actorSupabaseId
    ? { actorSupabaseId: input.actorSupabaseId }
    : {};
  const results: Array<{
    documentId: string;
    sent: number;
    skippedCooldown: number;
    failed: number;
  }> = [];
  const notificationJobIds: string[] = [];

  for (const context of contexts) {
    let sent = 0;
    let skippedCooldown = 0;
    let failed = 0;

    for (const recipient of context.pendingRecipients) {
      if (!recipient.canSend || !recipient.recipientEmail) {
        continue;
      }

      try {
        const mutation = recipient.activeInvite
          ? await resendDocumentInvite({
              role: input.actorRole,
              viewerUserId: input.actorUserId,
              inviteId: recipient.activeInvite.id,
            })
          : await createDocumentInvite({
              role: input.actorRole,
              viewerUserId: input.actorUserId,
              documentId: context.document.id,
              documentOutputSignerId: recipient.signerId,
              recipientEmail: recipient.recipientEmail,
              recipientName: recipient.name,
              inviteLabel: null,
              claimMode: "required_signup",
              expiresAt: null,
              idempotencyKey: input.idempotencyKey?.trim()
                ? `${input.idempotencyKey.trim()}:${context.document.id}:${recipient.signerId}`
                : null,
            });

        if (mutation.notification?.jobId) {
          notificationJobIds.push(mutation.notification.jobId);
        }
        sent += 1;
        await recordAuditEvent({
          ...auditActor,
          actorRole: input.actorRole,
          entityType: "document",
          entityId: context.document.id,
          action: "member.signature_reminder_sent",
          metadata: {
            document_id: context.document.id,
            document_output_signer_id: recipient.signerId,
            invite_id: mutation.invite.id,
            notification_job_id: mutation.notification?.jobId ?? null,
            notification_delivery_id: mutation.notification?.deliveryId ?? null,
            idempotency_key: input.idempotencyKey ?? null,
          },
        });
      } catch (error) {
        failed += 1;
        await recordAuditEvent({
          ...auditActor,
          actorRole: input.actorRole,
          entityType: "document",
          entityId: context.document.id,
          action: "member.signature_reminder_failed",
          metadata: {
            document_id: context.document.id,
            document_output_signer_id: recipient.signerId,
            error_message: error instanceof Error ? error.message : String(error),
            idempotency_key: input.idempotencyKey ?? null,
          },
        });
      }
    }

    results.push({
      documentId: context.document.id,
      sent,
      skippedCooldown,
      failed,
    });
  }

  if (notificationJobIds.length > 0) {
    await runDueNotificationJobs({
      limit: notificationJobIds.length,
      workerId: "signature-reminder-immediate",
      notificationJobIds,
    });
  }

  const recipients = contexts.flatMap((context) => context.pendingRecipients);
  return {
    ok: true,
    summary: {
      documentsRequested: documentIds.length,
      documentsProcessed: contexts.length,
      recipientsEligible: recipients.filter((recipient) => recipient.canSend).length,
      recipientsSent: results.reduce((sum, result) => sum + result.sent, 0),
      recipientsSkippedCooldown: results.reduce(
        (sum, result) => sum + result.skippedCooldown,
        0,
      ),
      recipientsFailed: results.reduce((sum, result) => sum + result.failed, 0),
    },
    results,
  };
};
