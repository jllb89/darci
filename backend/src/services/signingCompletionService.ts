import {
  getDocumentById,
  listDocumentGenerationRuns,
  listDocumentOutputSigners,
  listDocumentSignatures,
  listDocumentSystemValues,
  updateDocument,
  upsertDocumentSystemValues,
  type DocumentGenerationRunRecord,
  type DocumentOutputSignerRecord,
  type DocumentRecord,
  type SignatureRecord,
} from "./documentService";
import {
  completeDocumentSignerInvitesForOutputSigners,
  type DocumentInviteDetail,
} from "./documentInviteService";
import {
  queueAllSignaturesCompleteNotification,
  queueSignerCompletionConfirmationNotification,
  queueSignerSignedUpdateNotification,
} from "./notificationService";
import { runDueNotificationJobs } from "./notificationOutboxService";

type SigningCompletionExecutionValue = {
  confirmedAt: string | null;
  confirmedBySupabaseId: string | null;
  confirmedByRole: string | null;
  generationRunIds: string[];
  completedOutputSignerIds: string[];
  completedSignatureIds: string[];
};

type CapturedSignerTask = {
  signer: DocumentOutputSignerRecord;
  capturedSignature: SignatureRecord | null;
  captured: boolean;
  groupMinimumRequired: number | null;
  groupSatisfied: boolean;
};

export type SigningCompletionWorkflowResult = {
  documentId: string;
  completedOutputSignerId: string;
  completedSignatureId: string;
  allSignerRequirementsSatisfied: boolean;
  remainingSignerCount: number;
  completedInviteIds: string[];
  notifications: {
    signerCompletionConfirmationJobIds: string[];
    signerSignedUpdateJobId: string | null;
    allSignaturesCompleteJobId: string | null;
  };
  signingExecution: {
    alreadyConfirmed: boolean;
    persisted: boolean;
    confirmedAt: string | null;
  };
  documentStatus: {
    previousStatus: string | null;
    nextStatus: string | null;
    updated: boolean;
    requiresNotarization: boolean;
  };
};

const activeProductFlowModesRequiringNotarization = new Set([
  "poa_only",
  "trust_bundle",
  "notarize_document",
]);

const notarialOutputKeys = new Set([
  "acknowledgment",
  "authentic_act",
  "public_instrument",
  "uploaded_document_with_seal",
]);

const collectNotificationJobIds = (notification: { jobId?: string | null; jobIds?: string[] } | null | undefined) =>
  Array.from(
    new Set(
      [
        ...(notification?.jobIds ?? []),
        notification?.jobId ?? null,
      ].filter((jobId): jobId is string => Boolean(jobId && jobId.trim())),
    ),
  );

const toTimestamp = (value?: string | null) => {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const parseSigningExecutionValue = (
  value: unknown,
): SigningCompletionExecutionValue | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    confirmedAt: typeof value.confirmedAt === "string" ? value.confirmedAt : null,
    confirmedBySupabaseId:
      typeof value.confirmedBySupabaseId === "string"
        ? value.confirmedBySupabaseId
        : null,
    confirmedByRole:
      typeof value.confirmedByRole === "string" ? value.confirmedByRole : null,
    generationRunIds: Array.isArray(value.generationRunIds)
      ? value.generationRunIds.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    completedOutputSignerIds: Array.isArray(value.completedOutputSignerIds)
      ? value.completedOutputSignerIds.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    completedSignatureIds: Array.isArray(value.completedSignatureIds)
      ? value.completedSignatureIds.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
  };
};

const getSignatureGroupMinimumRequired = (metadata: Record<string, unknown>) => {
  const candidate = metadata.groupMinimumRequired;

  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return 1;
  }

  return Math.max(1, Math.floor(candidate));
};

const getLatestRunIdsByOutput = (generationRuns: DocumentGenerationRunRecord[]) => {
  const latestRunIdsByOutput = new Map<string, string>();

  for (const run of generationRuns) {
    if (!latestRunIdsByOutput.has(run.output_key)) {
      latestRunIdsByOutput.set(run.output_key, run.id);
    }
  }

  return new Set(latestRunIdsByOutput.values());
};

const filterCurrentSignerObligations = (input: {
  signers: DocumentOutputSignerRecord[];
  generationRuns: DocumentGenerationRunRecord[];
}) => {
  const latestRunIds = getLatestRunIdsByOutput(input.generationRuns);
  if (latestRunIds.size === 0) {
    return input.signers;
  }

  const currentSigners = input.signers.filter((signer) =>
    latestRunIds.has(signer.generation_run_id),
  );

  return currentSigners.length > 0 ? currentSigners : input.signers;
};

const mergeSignatureRecords = (input: {
  signatures: SignatureRecord[];
  signatureRecord: SignatureRecord;
}) => {
  const signaturesById = new Map<string, SignatureRecord>();

  for (const signature of input.signatures) {
    signaturesById.set(signature.id, signature);
  }
  signaturesById.set(input.signatureRecord.id, input.signatureRecord);

  return Array.from(signaturesById.values());
};

const buildCapturedSignatureByOutputSignerId = (signatures: SignatureRecord[]) => {
  const capturedByOutputSignerId = new Map<string, SignatureRecord>();

  for (const signature of signatures) {
    if (signature.status !== "captured" || !signature.document_output_signer_id) {
      continue;
    }

    const existing = capturedByOutputSignerId.get(signature.document_output_signer_id);
    if (!existing) {
      capturedByOutputSignerId.set(signature.document_output_signer_id, signature);
      continue;
    }

    const existingTimestamp = Math.max(
      toTimestamp(existing.captured_at),
      toTimestamp(existing.created_at),
    );
    const candidateTimestamp = Math.max(
      toTimestamp(signature.captured_at),
      toTimestamp(signature.created_at),
    );

    if (candidateTimestamp >= existingTimestamp) {
      capturedByOutputSignerId.set(signature.document_output_signer_id, signature);
    }
  }

  return capturedByOutputSignerId;
};

const getGroupKey = (signer: DocumentOutputSignerRecord) => {
  return signer.signing_group ? `${signer.generation_run_id}:${signer.signing_group}` : null;
};

const buildCapturedSignerTasks = (input: {
  signers: DocumentOutputSignerRecord[];
  capturedSignatureByOutputSignerId: Map<string, SignatureRecord>;
}) => {
  const tasks = input.signers
    .filter((signer) => signer.obligation_type === "signer")
    .map((signer) => ({
      signer,
      capturedSignature: input.capturedSignatureByOutputSignerId.get(signer.id) ?? null,
      captured: input.capturedSignatureByOutputSignerId.has(signer.id),
      groupMinimumRequired:
        !signer.is_required && signer.signing_group
          ? getSignatureGroupMinimumRequired(signer.metadata ?? {})
          : null,
      groupSatisfied: signer.is_required,
    }));

  const groupStats = new Map<
    string,
    {
      minimumRequired: number;
      capturedCount: number;
    }
  >();

  for (const task of tasks) {
    if (task.signer.is_required || !task.signer.signing_group || !task.groupMinimumRequired) {
      continue;
    }

    const groupKey = getGroupKey(task.signer);
    if (!groupKey) {
      continue;
    }

    const existing = groupStats.get(groupKey);
    groupStats.set(groupKey, {
      minimumRequired: existing
        ? Math.max(existing.minimumRequired, task.groupMinimumRequired)
        : task.groupMinimumRequired,
      capturedCount: (existing?.capturedCount ?? 0) + (task.captured ? 1 : 0),
    });
  }

  const groupSatisfaction = new Map(
    Array.from(groupStats.entries()).map(([groupKey, group]) => [
      groupKey,
      group.capturedCount >= group.minimumRequired,
    ]),
  );

  for (const task of tasks) {
    if (task.signer.is_required || !task.signer.signing_group) {
      continue;
    }

    const groupKey = getGroupKey(task.signer);
    task.groupSatisfied = groupKey ? groupSatisfaction.get(groupKey) ?? false : true;
  }

  return tasks;
};

const areSignerRequirementsSatisfied = (tasks: CapturedSignerTask[]) => {
  if (tasks.length === 0) {
    return false;
  }

  return tasks.every((task) => {
    if (task.signer.is_required) {
      return task.captured;
    }

    if (!task.signer.signing_group || !task.groupMinimumRequired) {
      return true;
    }

    return task.groupSatisfied;
  });
};

const countRemainingSignerObligations = (tasks: CapturedSignerTask[]) => {
  let remainingSignerCount = 0;
  const countedGroups = new Set<string>();

  for (const task of tasks) {
    if (task.signer.is_required) {
      if (!task.captured) {
        remainingSignerCount += 1;
      }
      continue;
    }

    const groupKey = getGroupKey(task.signer);
    if (!groupKey || !task.groupMinimumRequired || countedGroups.has(groupKey)) {
      continue;
    }

    countedGroups.add(groupKey);
    const groupTasks = tasks.filter((candidate) => getGroupKey(candidate.signer) === groupKey);
    const capturedCount = groupTasks.filter((candidate) => candidate.captured).length;
    remainingSignerCount += Math.max(0, task.groupMinimumRequired - capturedCount);
  }

  return remainingSignerCount;
};

const uniqueStrings = (values: Array<string | null | undefined>) => {
  return Array.from(
    new Set(
      values.filter((value): value is string => Boolean(value && value.trim().length > 0)),
    ),
  );
};

const getPrimaryInviteEmailRecipient = (invite: DocumentInviteDetail) => {
  return (
    invite.recipients.find(
      (recipient) => recipient.channel === "email" && recipient.isPrimary && recipient.deliveryAddress,
    ) ??
    invite.recipients.find(
      (recipient) => recipient.channel === "email" && recipient.deliveryAddress,
    ) ??
    null
  );
};

const parseOutputBundleKeys = (outputBundle: unknown) => {
  if (!Array.isArray(outputBundle)) {
    return [];
  }

  return outputBundle
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      return typeof entry.outputKey === "string" ? entry.outputKey : null;
    })
    .filter((outputKey): outputKey is string => Boolean(outputKey));
};

const requiresNotarizationAfterSigning = (document: DocumentRecord) => {
  const productFlowMode = document.product_flow_mode?.trim() ?? "";
  if (activeProductFlowModesRequiringNotarization.has(productFlowMode)) {
    return true;
  }

  if (document.selected_families?.includes("idn")) {
    return true;
  }

  const outputKeys = parseOutputBundleKeys(document.output_bundle);
  return outputKeys.some((outputKey) => notarialOutputKeys.has(outputKey));
};

const resolveNextDocumentStatus = (input: {
  document: DocumentRecord;
  requiresNotarization: boolean;
}) => {
  if (input.document.status !== "pending_signature") {
    return null;
  }

  return input.requiresNotarization ? "pending_notary" : "completed";
};

export const resolveCompletedSigningDocumentStatus = (document: DocumentRecord) => {
  const requiresNotarization = requiresNotarizationAfterSigning(document);

  return {
    previousStatus: document.status,
    nextStatus: resolveNextDocumentStatus({ document, requiresNotarization }),
    requiresNotarization,
  };
};

export const completeSigningWorkflowAfterSignatureCapture = async (input: {
  documentId: string;
  completedOutputSignerId: string;
  completedSignatureId: string;
  signatureRecord: SignatureRecord;
  actorSupabaseId?: string | null;
  actorRole?: string | null;
}): Promise<SigningCompletionWorkflowResult | null> => {
  const document = await getDocumentById(input.documentId);
  if (!document) {
    return null;
  }

  const [generationRuns, outputSigners, signatureRecords, systemValues] = await Promise.all([
    listDocumentGenerationRuns(document.id),
    listDocumentOutputSigners({ documentId: document.id }),
    listDocumentSignatures({ documentId: document.id }),
    listDocumentSystemValues(document.id),
  ]);

  const currentSigners = filterCurrentSignerObligations({
    signers: outputSigners,
    generationRuns,
  });
  const mergedSignatures = mergeSignatureRecords({
    signatures: signatureRecords,
    signatureRecord: input.signatureRecord,
  });
  const capturedSignatureByOutputSignerId = buildCapturedSignatureByOutputSignerId(mergedSignatures);
  const tasks = buildCapturedSignerTasks({
    signers: currentSigners,
    capturedSignatureByOutputSignerId,
  });
  const completedSignerTask = tasks.find(
    (task) => task.signer.id === input.completedOutputSignerId,
  ) ?? null;
  const allSignerRequirementsSatisfied = areSignerRequirementsSatisfied(tasks);
  const remainingSignerCount = countRemainingSignerObligations(tasks);
  const completedAt = input.signatureRecord.captured_at ?? new Date().toISOString();
  const signerCompletionConfirmationJobIds: string[] = [];
  const signerSignedUpdateJobId = { value: null as string | null };
  const allSignaturesCompleteJobId = { value: null as string | null };
  const queuedNotificationJobIds: string[] = [];

  const completedInvites = await completeDocumentSignerInvitesForOutputSigners({
    documentId: document.id,
    documentOutputSignerIds: [input.completedOutputSignerId],
    completedAt,
  });

  for (const invite of completedInvites) {
    const recipient = getPrimaryInviteEmailRecipient(invite);
    if (!recipient?.deliveryAddress) {
      continue;
    }

    const notification = await queueSignerCompletionConfirmationNotification({
      documentId: document.id,
      documentOutputSignerId: input.completedOutputSignerId,
      signatureId: input.completedSignatureId,
      signerUserId: invite.claimedUserId ?? recipient.targetUserId ?? null,
      signerEmail: recipient.deliveryAddress,
      signerName:
        recipient.displayName ?? invite.recipientName ?? completedSignerTask?.signer.party_name ?? null,
      requestedBySupabaseUserId: input.actorSupabaseId ?? undefined,
    });

    if (notification?.jobId) {
      signerCompletionConfirmationJobIds.push(notification.jobId);
    }
    queuedNotificationJobIds.push(...collectNotificationJobIds(notification));
  }

  if (completedSignerTask && input.signatureRecord.signer_id !== document.owner_id) {
    const notification = await queueSignerSignedUpdateNotification({
      documentId: document.id,
      documentOutputSignerId: input.completedOutputSignerId,
      signatureId: input.completedSignatureId,
      signerName: completedSignerTask.signer.party_name,
      remainingSignerCount,
      requestedBySupabaseUserId: input.actorSupabaseId ?? undefined,
    });

    signerSignedUpdateJobId.value = notification?.jobId ?? null;
    queuedNotificationJobIds.push(...collectNotificationJobIds(notification));
  }

  let allCompletedInvites: DocumentInviteDetail[] = [];
  let signingExecutionPersisted = false;
  const rawSigningExecutionValue =
    systemValues.find((value) => value.system_key === "signature_execution")?.value_json ?? null;
  const existingSigningExecution = parseSigningExecutionValue(rawSigningExecutionValue);
  const signingExecutionAlreadyConfirmed = Boolean(existingSigningExecution?.confirmedAt);
  const completedStatus = resolveCompletedSigningDocumentStatus(document);
  const requiresNotarization = completedStatus.requiresNotarization;
  const nextDocumentStatus = allSignerRequirementsSatisfied ? completedStatus.nextStatus : null;
  let documentStatusUpdated = false;

  if (allSignerRequirementsSatisfied) {
    const completedOutputSignerIds = uniqueStrings(
      tasks.filter((task) => task.captured).map((task) => task.signer.id),
    );
    const completedSignatureIds = uniqueStrings(
      tasks.map((task) => task.capturedSignature?.id ?? null),
    );
    const generationRunIds = uniqueStrings(tasks.map((task) => task.signer.generation_run_id));
    allCompletedInvites = await completeDocumentSignerInvitesForOutputSigners({
      documentId: document.id,
      documentOutputSignerIds: completedOutputSignerIds,
      completedAt,
    });

    if (!signingExecutionAlreadyConfirmed) {
      await upsertDocumentSystemValues({
        documentId: document.id,
        values: [
          {
            systemKey: "signature_execution",
            source: "signature_execution",
            value: {
              ...(isRecord(rawSigningExecutionValue) ? rawSigningExecutionValue : {}),
              confirmedAt: completedAt,
              confirmedBySupabaseId: input.actorSupabaseId ?? null,
              confirmedByRole: input.actorRole ?? null,
              generationRunIds,
              completedOutputSignerIds,
              completedSignatureIds,
              completedByOutputSignerId: input.completedOutputSignerId,
              completedBySignatureId: input.completedSignatureId,
              completionSource: "automatic_signature_capture",
              remainingSignerCount,
              requiresNotarization,
              nextDocumentStatus,
            },
            metadata: {
              source: "signingCompletionService",
              completedByOutputSignerId: input.completedOutputSignerId,
              completedBySignatureId: input.completedSignatureId,
            },
          },
        ],
      });
      signingExecutionPersisted = true;
    }

    if (nextDocumentStatus && nextDocumentStatus !== document.status) {
      await updateDocument(document.id, { status: nextDocumentStatus });
      documentStatusUpdated = true;
    }

    const notification = await queueAllSignaturesCompleteNotification({
      documentId: document.id,
      completedAt,
      requiresNotarization,
      nextDocumentStatus,
      requestedBySupabaseUserId: input.actorSupabaseId ?? undefined,
    });
    allSignaturesCompleteJobId.value = notification?.jobId ?? null;
    queuedNotificationJobIds.push(...collectNotificationJobIds(notification));
  }

  const notificationJobIds = Array.from(new Set(queuedNotificationJobIds));
  if (notificationJobIds.length > 0) {
    try {
      await runDueNotificationJobs({
        limit: notificationJobIds.length,
        workerId: "signing-completion-inline",
        documentId: document.id,
        notificationJobIds,
      });
    } catch (error) {
      console.warn("Signing completion notification inline processing failed", {
        documentId: document.id,
        notificationJobIds,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const completedInviteIds = uniqueStrings([
    ...completedInvites.map((invite) => invite.id),
    ...allCompletedInvites.map((invite) => invite.id),
  ]);

  return {
    documentId: document.id,
    completedOutputSignerId: input.completedOutputSignerId,
    completedSignatureId: input.completedSignatureId,
    allSignerRequirementsSatisfied,
    remainingSignerCount,
    completedInviteIds,
    notifications: {
      signerCompletionConfirmationJobIds,
      signerSignedUpdateJobId: signerSignedUpdateJobId.value,
      allSignaturesCompleteJobId: allSignaturesCompleteJobId.value,
    },
    signingExecution: {
      alreadyConfirmed: signingExecutionAlreadyConfirmed,
      persisted: signingExecutionPersisted,
      confirmedAt:
        existingSigningExecution?.confirmedAt ?? (signingExecutionPersisted ? completedAt : null),
    },
    documentStatus: {
      previousStatus: document.status,
      nextStatus: nextDocumentStatus,
      updated: documentStatusUpdated,
      requiresNotarization,
    },
  };
};