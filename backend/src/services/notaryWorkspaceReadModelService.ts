import {
  getDocumentById,
  getNotarizationRequestById,
  listDocumentsByIds,
  listDocumentGenerationRuns,
  listDocumentVersions,
  listNotarizationRequests,
  type DocumentGenerationRunRecord,
  type DocumentRecord,
  type DocumentVersionRecord,
  type NotarizationRequestRecord,
} from "./documentService";
import {
  buildDocumentWorkspaceSummary,
  type DocumentWorkspaceSummary,
} from "./documentWorkspaceReadModelService";
import {
  getLatestPublicVerificationCheckByIdn,
  getVerificationSnapshotForDocument,
  listFinalizationStatusHistory,
  resolvePublicVerificationStatus,
  type FinalizationStatusHistoryRecord,
  type PublicVerificationCheckRecord,
  type PublicVerificationStatus,
  type VerificationSnapshot,
} from "./documentFinalizationService";
import { getVisibleDocumentIdn } from "./documentVisibilityService";
import {
  getIlluminotarizationWorkflowById,
  getIlluminotarizationWorkflowByLegacyRequestId,
  getLatestCodeDeliveryForRequest,
  listWorkflowStatusHistory,
  type CodeDeliveryRecord,
  type IlluminotarizationWorkflowRecord,
  type IlluminotarizationWorkflowStatusHistoryRecord,
} from "./illuminotarizationWorkflowService";
import {
  getMeetingByRequestId,
  listIdentityVerificationEvents,
  listMeetingArtifacts,
  listMeetingCheckins,
  listMeetingGeolocationSamples,
  listMeetingParticipants,
  listProximityEvaluations,
  type GeolocationSampleRecord,
  type IdentityVerificationEventRecord,
  type MeetingArtifactRecord,
  type MeetingCheckinRecord,
  type MeetingParticipantRecord,
  type MeetingRecord,
  type ProximityEvaluationRecord,
} from "./meetingService";
import type { RequestRole } from "./userRoleService";
import { resolveDocumentTypeLabel } from "./documentActionService";
import {
  getWorkspaceIdentitySummaryByUserId,
  type WorkspaceIdentitySummary,
} from "./workspaceIdentitySummaryService";
import { createDocumentDownloadUrl } from "./storageService";

export type NotaryQueueRequestSummary = {
  request: {
    id: string;
    documentId: string;
    workflowId: string | null;
    status: string | null;
    queueStatus: string | null;
    submittedAt: string | null;
  };
  document: {
    id: string;
    idn: string | null;
    status: string | null;
    documentType: string | null;
    documentTypeLabel: string;
    jurisdiction: string | null;
    createdAt: string;
    summary: DocumentWorkspaceSummary;
  };
  owner: WorkspaceIdentitySummary | null;
  workflow: {
    id: string | null;
    status: string | null;
    latestStatus: string | null;
    latestStatusAt: string | null;
    reviewStartedAt: string | null;
    closedAt: string | null;
    selectedNotaryUserId: string | null;
    assignedNotaryUserId: string | null;
    lastCodeGeneratedAt: string | null;
  } | null;
  latestCodeDelivery: {
    id: string;
    channel: CodeDeliveryRecord["channel"];
    deliveryMethod: CodeDeliveryRecord["delivery_method"];
    deliveryReason: CodeDeliveryRecord["delivery_reason"];
    status: CodeDeliveryRecord["status"];
    expiresAt: string | null;
    deliveredAt: string | null;
    consumedAt: string | null;
    invalidatedAt: string | null;
    createdAt: string;
  } | null;
  meeting: {
    id: string;
    requestId: string;
    documentId: string;
    documentType: string | null;
    documentTypeLabel: string;
    ownerName: string | null;
    scheduledAt: string | null;
    timezone: string | null;
    location: string | null;
    status: string | null;
  } | null;
  finalization: {
    latestStatus: string | null;
    latestStatusAt: string | null;
    isAnchored: boolean;
    isVerificationChecked: boolean;
    isWatermarked: boolean;
    isHashRecorded: boolean;
    verificationStatus: PublicVerificationStatus | null;
    anchoredAt: string | null;
    lastCheckedAt: string | null;
    publicVerifyPath: string | null;
  };
  nextAction: string | null;
};

export type NotaryQueueResponse = {
  requests: NotaryQueueRequestSummary[];
  meetings: Array<{
    id: string;
    requestId: string;
    documentId: string;
    documentType: string | null;
    documentTypeLabel: string;
    ownerName: string | null;
    scheduledAt: string | null;
    timezone: string | null;
    location: string | null;
    status: string | null;
  }>;
  counts: {
    pending: number;
    scheduled: number;
    readyForInPerson: number;
    completed: number;
    total: number;
  };
};

export type NotaryRequestContext = {
  request: NotaryQueueRequestSummary["request"];
  document: NotaryQueueRequestSummary["document"] & {
    versions: Array<{
      id: string;
      version: number;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      isFinal: boolean;
      createdAt: string;
    }>;
    reviewDocuments: Array<{
      id: string;
      versionId: string;
      label: string;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      isFinal: boolean;
      downloadUrl: string | null;
      createdAt: string;
    }>;
  };
  owner: WorkspaceIdentitySummary | null;
  notary: WorkspaceIdentitySummary | null;
  workflow: NotaryQueueRequestSummary["workflow"];
  latestCodeDelivery: NotaryQueueRequestSummary["latestCodeDelivery"];
  meeting: {
    meetingId: string;
    requestId: string;
    workflowId: string | null;
    scheduledAt: string | null;
    timezone: string | null;
    location: string | null;
    status: string | null;
    samePlaceRequired: boolean;
    samePlaceStatus: string | null;
    proposedSlots: string[];
    participants: Array<{
      id: string;
      userId: string | null;
      participantRole: string;
      status: string;
      presenceRequired: boolean;
      participantLabel: string | null;
      arrivedAt: string | null;
      departedAt: string | null;
    }>;
  } | null;
  evidence: {
    checkins: Array<{
      id: string;
      meetingId: string;
      meetingParticipantId: string;
      participantRole: string;
      checkinKind: string;
      status: string;
      recordedAt: string;
      notes: string | null;
      geolocation:
        | {
            id: string;
            latitude: number;
            longitude: number;
            accuracyMeters: number | null;
            altitudeMeters: number | null;
            sampleKind: string;
            captureStage: string;
            capturedAt: string;
          }
        | null;
    }>;
    geolocationSamples: Array<{
      id: string;
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      altitudeMeters: number | null;
      sampleKind: string;
      captureStage: string;
      capturedAt: string;
    }>;
    identityVerifications: Array<{
      id: string;
      meetingId: string;
      meetingParticipantId: string;
      participantRole: string;
      verificationMethod: string;
      status: string;
      subjectName: string | null;
      documentType: string | null;
      documentLast4: string | null;
      issuingJurisdiction: string | null;
      verifiedAt: string | null;
      notes: string | null;
      meetingCheckinId: string | null;
    }>;
    proximityEvaluations: Array<{
      id: string;
      meetingId: string;
      evaluationKind: string;
      status: string;
      thresholdMeters: number;
      observedDistanceMeters: number | null;
      evaluatedAt: string;
      notes: string | null;
      memberSample:
        | {
            id: string;
            latitude: number;
            longitude: number;
            accuracyMeters: number | null;
            altitudeMeters: number | null;
            sampleKind: string;
            captureStage: string;
            capturedAt: string;
          }
        | null;
      notarySample:
        | {
            id: string;
            latitude: number;
            longitude: number;
            accuracyMeters: number | null;
            altitudeMeters: number | null;
            sampleKind: string;
            captureStage: string;
            capturedAt: string;
          }
        | null;
    }>;
    artifacts: Array<{
      id: string;
      meetingId: string;
      meetingParticipantId: string | null;
      meetingCheckinId: string | null;
      identityVerificationEventId: string | null;
      artifactKind: string;
      status: string;
      storageBucket: string | null;
      storagePath: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      capturedAt: string | null;
      retentionUntil: string | null;
      metadata: Record<string, unknown>;
    }>;
  };
  finalization: NotaryQueueRequestSummary["finalization"] & {
    hash: string | null;
    ledgerTxId: string | null;
    anchorAttempt:
      | {
          id: string;
          status: string;
          attemptNumber: number;
          requestedAt: string;
          completedAt: string | null;
          failedAt: string | null;
          errorMessage: string | null;
        }
      | null;
    history: Array<{
      id: string;
      status: string;
      changeSource: string;
      changeReason: string | null;
      createdAt: string;
    }>;
  };
  capabilities: {
    canReviewRequest: boolean;
    canManageMeeting: boolean;
    canRecordEvidence: boolean;
    canFinalizeDocument: boolean;
    canOpenVerification: boolean;
  };
  warnings: Array<{
    code: string;
    severity: "info" | "warning";
    message: string;
  }>;
  nextAction: string | null;
};

export class NotaryWorkspaceReadModelServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "NotaryWorkspaceReadModelServiceError";
  }
}

const readModelFallback = async <T>(input: {
  operation: string;
  fallback: T;
  details: Record<string, unknown>;
  run: () => Promise<T>;
}) => {
  try {
    return await input.run();
  } catch (error) {
    console.warn("Notary workspace read model enrichment fallback used", {
      operation: input.operation,
      ...input.details,
      error: error instanceof Error ? error.message : error,
    });
    return input.fallback;
  }
};

const safelyGetWorkflowById = (input: { workflowId: string; requestId: string }) => {
  return readModelFallback<IlluminotarizationWorkflowRecord | null>({
    operation: "workflow_lookup",
    fallback: null,
    details: {
      requestId: input.requestId,
      workflowId: input.workflowId,
    },
    run: () => getIlluminotarizationWorkflowById(input.workflowId),
  });
};

const safelyGetWorkflowByLegacyRequestId = (requestId: string) => {
  return readModelFallback<IlluminotarizationWorkflowRecord | null>({
    operation: "workflow_legacy_lookup",
    fallback: null,
    details: { requestId },
    run: () => getIlluminotarizationWorkflowByLegacyRequestId(requestId),
  });
};

const safelyListWorkflowStatusHistory = (input: { workflowId: string; requestId: string }) => {
  return readModelFallback<IlluminotarizationWorkflowStatusHistoryRecord[]>({
    operation: "workflow_status_history",
    fallback: [],
    details: {
      requestId: input.requestId,
      workflowId: input.workflowId,
    },
    run: () => listWorkflowStatusHistory(input.workflowId),
  });
};

const safelyListFinalizationStatusHistory = (input: { documentId: string; requestId: string }) => {
  return readModelFallback<FinalizationStatusHistoryRecord[]>({
    operation: "finalization_status_history",
    fallback: [],
    details: {
      requestId: input.requestId,
      documentId: input.documentId,
    },
    run: () => listFinalizationStatusHistory(input.documentId),
  });
};

const safelyListDocumentsByIds = (documentIds: string[]) => {
  return readModelFallback<DocumentRecord[]>({
    operation: "document_lookup",
    fallback: [],
    details: { documentCount: documentIds.length },
    run: () => listDocumentsByIds(documentIds),
  });
};

const isPrivilegedRole = (role: RequestRole) => role === "admin" || role === "service_role";

const requireViewerUserId = (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  const viewerUserId = input.viewerUserId?.trim() ?? "";
  if (viewerUserId.length > 0) {
    return viewerUserId;
  }

  throw new NotaryWorkspaceReadModelServiceError(403, "Notary is not registered");
};

const resolveWorkflowForRequest = async (request: NotarizationRequestRecord) => {
  if (request.workflow_id) {
    const workflow = await safelyGetWorkflowById({
      workflowId: request.workflow_id,
      requestId: request.id,
    });
    if (workflow) {
      return workflow;
    }
  }

  return safelyGetWorkflowByLegacyRequestId(request.id);
};

const getLatestWorkflowStatusEntry = (
  workflowStatusHistory: Array<
    Pick<IlluminotarizationWorkflowStatusHistoryRecord, "next_status" | "created_at">
  >,
) => {
  return workflowStatusHistory.at(-1) ?? null;
};

const resolveQueueStatus = (input: {
  request: NotarizationRequestRecord;
  workflow: IlluminotarizationWorkflowRecord | null;
  workflowStatusHistory: IlluminotarizationWorkflowStatusHistoryRecord[];
}) => {
  return (
    getLatestWorkflowStatusEntry(input.workflowStatusHistory)?.next_status ??
    input.workflow?.status ??
    input.request.status
  );
};

const canAccessRequest = (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
  request: NotarizationRequestRecord;
  workflow: IlluminotarizationWorkflowRecord | null;
}) => {
  if (isPrivilegedRole(input.role)) {
    return true;
  }

  if (input.role !== "notary") {
    return false;
  }

  const viewerUserId = requireViewerUserId(input);
  return [
    input.request.assigned_notary_id,
    input.workflow?.assigned_notary_user_id ?? null,
  ].includes(viewerUserId);
};

const notaryReviewableDocumentStatuses = new Set(["pending_notary", "completed"]);

const canAccessRequestDocument = (input: {
  role: RequestRole;
  document: DocumentRecord;
}) => {
  if (isPrivilegedRole(input.role)) {
    return true;
  }

  if (input.role !== "notary") {
    return false;
  }

  return notaryReviewableDocumentStatuses.has(input.document.status?.trim().toLowerCase() ?? "");
};

const mapWorkflowResponse = (input: {
  workflow: IlluminotarizationWorkflowRecord | null;
  workflowStatusHistory: IlluminotarizationWorkflowStatusHistoryRecord[];
}) => {
  if (!input.workflow) {
    return null;
  }

  const latestStatusEntry = getLatestWorkflowStatusEntry(input.workflowStatusHistory);
  return {
    id: input.workflow.id,
    status: input.workflow.status,
    latestStatus: latestStatusEntry?.next_status ?? input.workflow.status,
    latestStatusAt: latestStatusEntry?.created_at ?? input.workflow.updated_at,
    reviewStartedAt: input.workflow.review_started_at,
    closedAt: input.workflow.closed_at,
    selectedNotaryUserId: input.workflow.selected_notary_user_id,
    assignedNotaryUserId: input.workflow.assigned_notary_user_id,
    lastCodeGeneratedAt: input.workflow.last_code_generated_at,
  };
};

const mapLatestCodeDeliveryResponse = (delivery: CodeDeliveryRecord | null) => {
  if (!delivery) {
    return null;
  }

  return {
    id: delivery.id,
    channel: delivery.channel,
    deliveryMethod: delivery.delivery_method,
    deliveryReason: delivery.delivery_reason,
    status: delivery.status,
    expiresAt: delivery.expires_at,
    deliveredAt: delivery.delivered_at,
    consumedAt: delivery.consumed_at,
    invalidatedAt: delivery.invalidated_at,
    createdAt: delivery.created_at,
  };
};

const mapMeetingParticipant = (participant: MeetingParticipantRecord) => {
  return {
    id: participant.id,
    userId: participant.user_id,
    participantRole: participant.participant_role,
    status: participant.status,
    presenceRequired: participant.presence_required,
    participantLabel: participant.participant_label,
    arrivedAt: participant.arrived_at,
    departedAt: participant.departed_at,
  };
};

const mapMeetingResponse = (meeting: MeetingRecord, participants: MeetingParticipantRecord[]) => {
  const proposedSlots = Array.isArray(meeting.metadata.proposedSlots)
    ? meeting.metadata.proposedSlots.filter((value): value is string => typeof value === "string")
    : [];

  return {
    meetingId: meeting.id,
    requestId: meeting.request_id,
    workflowId: meeting.workflow_id,
    scheduledAt: meeting.scheduled_at,
    timezone: meeting.timezone,
    location: meeting.location,
    status: meeting.status,
    samePlaceRequired: meeting.same_place_required,
    samePlaceStatus: meeting.same_place_status,
    proposedSlots,
    participants: participants.map(mapMeetingParticipant),
  };
};

const mapMeetingSummary = (input: {
  meeting: MeetingRecord;
  request: NotarizationRequestRecord;
  document: DocumentRecord;
  owner: WorkspaceIdentitySummary | null;
}) => {
  return {
    id: input.meeting.id,
    requestId: input.request.id,
    documentId: input.document.id,
    documentType: input.document.document_type,
    documentTypeLabel: resolveDocumentTypeLabel(input.document),
    ownerName: input.owner?.displayName ?? null,
    scheduledAt: input.meeting.scheduled_at,
    timezone: input.meeting.timezone,
    location: input.meeting.location,
    status: input.meeting.status,
  };
};

const mapDocumentResponse = (input: {
  document: DocumentRecord;
  viewerRole: RequestRole;
  summary: DocumentWorkspaceSummary;
}) => {
  return {
    id: input.document.id,
    idn: getVisibleDocumentIdn({
      idn: input.document.idn,
      status: input.document.status,
      viewerRole: input.viewerRole,
    }),
    status: input.document.status,
    documentType: input.document.document_type,
    documentTypeLabel: resolveDocumentTypeLabel(input.document),
    jurisdiction: input.document.jurisdiction,
    createdAt: input.document.created_at,
    summary: input.summary,
  };
};

const buildPublicVerifyPath = (idn: string | null) => {
  return idn ? `/verify/${encodeURIComponent(idn)}` : null;
};

const getLastCheckedAt = (input: {
  latestCheck: PublicVerificationCheckRecord | null;
  snapshot: VerificationSnapshot;
  document: DocumentRecord;
}) => {
  return (
    input.latestCheck?.created_at ??
    input.snapshot.ledgerEntry?.anchored_at ??
    input.document.updated_at ??
    input.document.created_at
  );
};

const mapFinalizationHistory = (entry: FinalizationStatusHistoryRecord) => {
  return {
    id: entry.id,
    status: entry.status,
    changeSource: entry.change_source,
    changeReason: entry.change_reason,
    createdAt: entry.created_at,
  };
};

const mapFinalizationSummary = (input: {
  documentSummary: DocumentWorkspaceSummary;
  snapshot: VerificationSnapshot;
  latestCheck: PublicVerificationCheckRecord | null;
  document: DocumentRecord;
  visibleIdn: string | null;
}) => {
  return {
    latestStatus: input.documentSummary.finalization.latestStatus,
    latestStatusAt: input.documentSummary.finalization.latestStatusAt,
    isAnchored: input.documentSummary.finalization.isAnchored,
    isVerificationChecked: input.documentSummary.finalization.isVerificationChecked,
    isWatermarked: input.documentSummary.finalization.isWatermarked,
    isHashRecorded: input.documentSummary.finalization.isHashRecorded,
    verificationStatus: input.visibleIdn ? resolvePublicVerificationStatus(input.snapshot) : null,
    anchoredAt: input.snapshot.ledgerEntry?.anchored_at ?? null,
    lastCheckedAt: getLastCheckedAt({
      latestCheck: input.latestCheck,
      snapshot: input.snapshot,
      document: input.document,
    }),
    publicVerifyPath: buildPublicVerifyPath(input.visibleIdn),
  };
};

const mapDocumentVersionSummary = (version: DocumentVersionRecord) => {
  return {
    id: version.id,
    version: version.version,
    fileName: version.file_name,
    mimeType: version.mime_type,
    sizeBytes: version.size_bytes,
    isFinal: Boolean(version.is_final),
    createdAt: version.created_at,
  };
};

const asTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const buildOutputLabelByGenerationRunId = (input: {
  document: Pick<DocumentRecord, "output_bundle">;
  generationRuns: DocumentGenerationRunRecord[];
}) => {
  const outputLabelByKey = new Map<string, string>();

  for (const rawOutput of input.document.output_bundle ?? []) {
    const outputKey = asTrimmedString(rawOutput.outputKey);
    const outputLabel = asTrimmedString(rawOutput.outputLabel);

    if (outputKey && outputLabel) {
      outputLabelByKey.set(outputKey, outputLabel);
    }
  }

  const outputLabelByGenerationRunId = new Map<string, string>();

  for (const run of input.generationRuns) {
    const outputLabel = outputLabelByKey.get(run.output_key);
    if (outputLabel) {
      outputLabelByGenerationRunId.set(run.id, outputLabel);
    }
  }

  return outputLabelByGenerationRunId;
};

const buildReviewDocumentLabel = (input: {
  version: DocumentVersionRecord;
  index: number;
  outputLabelByGenerationRunId: Map<string, string>;
}) => {
  const generationRunLabel = input.version.generation_run_id
    ? input.outputLabelByGenerationRunId.get(input.version.generation_run_id)
    : null;
  const fileNameLabel = input.version.file_name?.trim() || null;

  return generationRunLabel ?? fileNameLabel ?? `Document ${input.index + 1}`;
};

const isPdfDocumentVersion = (version: DocumentVersionRecord) => {
  const mimeType = version.mime_type?.trim().toLowerCase() ?? "";
  const fileName = version.file_name?.trim().toLowerCase() ?? "";

  return Boolean(version.storage_path && (mimeType === "application/pdf" || fileName.endsWith(".pdf")));
};

const isReviewableDocumentVersion = (version: DocumentVersionRecord) => {
  const fileName = version.file_name?.trim().toLowerCase() ?? "";
  const storagePath = version.storage_path?.trim().toLowerCase() ?? "";

  return Boolean(
    version.is_final ||
      fileName.endsWith("-signed.pdf") ||
      storagePath.endsWith("-signed.pdf") ||
      /-acknowledged-v\d+\.pdf$/.test(fileName) ||
      /-acknowledged-v\d+\.pdf$/.test(storagePath) ||
      /-finalized-v\d+\.pdf$/.test(fileName) ||
      /-finalized-v\d+\.pdf$/.test(storagePath),
  );
};

const buildReviewDocuments = async (input: {
  document: Pick<DocumentRecord, "output_bundle">;
  versions: DocumentVersionRecord[];
  generationRuns: DocumentGenerationRunRecord[];
}) => {
  const outputLabelByGenerationRunId = buildOutputLabelByGenerationRunId({
    document: input.document,
    generationRuns: input.generationRuns,
  });
  const pdfVersions = input.versions
    .filter((version) => isPdfDocumentVersion(version) && isReviewableDocumentVersion(version))
    .sort((left, right) => right.version - left.version);
  const latestByOutput = new Map<string, DocumentVersionRecord>();

  for (const version of pdfVersions) {
    const key = version.generation_run_id ?? version.file_name ?? version.id;
    if (!latestByOutput.has(key)) {
      latestByOutput.set(key, version);
    }
  }

  const reviewVersions = Array.from(latestByOutput.values()).sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);
    return leftTime - rightTime;
  });

  return Promise.all(
    reviewVersions.map(async (version, index) => {
      let downloadUrl: string | null = null;

      if (version.storage_path) {
        try {
          downloadUrl = (await createDocumentDownloadUrl(version.storage_path)).signedUrl;
        } catch {
          downloadUrl = null;
        }
      }

      return {
        id: version.id,
        versionId: version.id,
        label: buildReviewDocumentLabel({
          version,
          index,
          outputLabelByGenerationRunId,
        }),
        fileName: version.file_name,
        mimeType: version.mime_type,
        sizeBytes: version.size_bytes,
        isFinal: Boolean(version.is_final),
        downloadUrl,
        createdAt: version.created_at,
      };
    }),
  );
};

const mapMeetingGeolocation = (sample: GeolocationSampleRecord) => {
  return {
    id: sample.id,
    meetingParticipantId: sample.meeting_participant_id,
    capturedByUserId: sample.captured_by_user_id,
    latitude: sample.latitude,
    longitude: sample.longitude,
    accuracyMeters: sample.accuracy_meters,
    altitudeMeters: sample.altitude_meters,
    sampleKind: sample.sample_kind,
    captureStage: sample.capture_stage,
    capturedAt: sample.captured_at,
    expiresAt: sample.expires_at,
  };
};

const mapMeetingCheckin = (input: {
  checkin: MeetingCheckinRecord;
  participants: Map<string, MeetingParticipantRecord>;
  geolocationByCheckinId: Map<string, GeolocationSampleRecord>;
}) => {
  const geolocation = input.geolocationByCheckinId.get(input.checkin.id) ?? null;

  return {
    id: input.checkin.id,
    meetingId: input.checkin.meeting_id,
    meetingParticipantId: input.checkin.meeting_participant_id,
    participantRole:
      input.participants.get(input.checkin.meeting_participant_id)?.participant_role ?? "observer",
    checkinKind: input.checkin.checkin_kind,
    status: input.checkin.status,
    recordedAt: input.checkin.recorded_at,
    notes: input.checkin.notes,
    geolocation: geolocation ? mapMeetingGeolocation(geolocation) : null,
  };
};

const mapIdentityVerification = (input: {
  event: IdentityVerificationEventRecord;
  participants: Map<string, MeetingParticipantRecord>;
  checkins: MeetingCheckinRecord[];
}) => {
  const matchingCheckin = input.checkins.find(
    (checkin) =>
      checkin.meeting_participant_id === input.event.meeting_participant_id &&
      checkin.checkin_kind === "identity",
  );

  return {
    id: input.event.id,
    meetingId: input.event.meeting_id,
    meetingParticipantId: input.event.meeting_participant_id,
    participantRole:
      input.participants.get(input.event.meeting_participant_id)?.participant_role ?? "observer",
    verificationMethod: input.event.verification_method,
    status: input.event.status,
    subjectName: input.event.subject_name_snapshot,
    documentType: input.event.document_type,
    documentLast4: input.event.document_last4,
    issuingJurisdiction: input.event.issuing_jurisdiction,
    verifiedAt: input.event.verified_at,
    notes: input.event.notes,
    meetingCheckinId: matchingCheckin?.id ?? null,
  };
};

const mapProximityEvaluation = (input: {
  evaluation: ProximityEvaluationRecord;
  geolocationById: Map<string, GeolocationSampleRecord>;
}) => {
  const memberSample = input.evaluation.member_sample_id
    ? input.geolocationById.get(input.evaluation.member_sample_id) ?? null
    : null;
  const notarySample = input.evaluation.notary_sample_id
    ? input.geolocationById.get(input.evaluation.notary_sample_id) ?? null
    : null;

  return {
    id: input.evaluation.id,
    meetingId: input.evaluation.meeting_id,
    evaluationKind: input.evaluation.evaluation_kind,
    status: input.evaluation.status,
    thresholdMeters: input.evaluation.threshold_meters,
    observedDistanceMeters: input.evaluation.observed_distance_meters,
    evaluatedAt: input.evaluation.evaluated_at,
    notes: input.evaluation.notes,
    memberSample: memberSample ? mapMeetingGeolocation(memberSample) : null,
    notarySample: notarySample ? mapMeetingGeolocation(notarySample) : null,
    metadata: input.evaluation.metadata,
  };
};

const mapMeetingArtifact = (artifact: MeetingArtifactRecord) => {
  return {
    id: artifact.id,
    meetingId: artifact.meeting_id,
    meetingParticipantId: artifact.meeting_participant_id,
    meetingCheckinId: artifact.meeting_checkin_id,
    identityVerificationEventId: artifact.identity_verification_event_id,
    artifactKind: artifact.artifact_kind,
    status: artifact.status,
    storageBucket: artifact.storage_bucket,
    storagePath: artifact.storage_path,
    mimeType: artifact.mime_type,
    sizeBytes: artifact.size_bytes,
    capturedAt: artifact.captured_at,
    retentionUntil: artifact.retention_until,
    metadata: artifact.metadata,
  };
};

const isExpiredTimestamp = (value: string | null) => {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now();
};

const buildNextAction = (input: {
  queueStatus: string | null;
  meeting: MeetingRecord | null;
  documentSummary: DocumentWorkspaceSummary;
}) => {
  if (input.queueStatus === "in_review" || input.queueStatus === "changes_requested") {
    return "record_review_decision";
  }

  if ((input.queueStatus === "approved" || input.queueStatus === "completed") && !input.meeting) {
    return "ready_for_in_person_session";
  }

  if (
    input.meeting &&
    input.meeting.status !== "completed" &&
    input.meeting.status !== "cancelled" &&
    input.meeting.status !== "no_show"
  ) {
    return "continue_meeting";
  }

  if (input.meeting?.status === "completed" && !input.documentSummary.finalization.isAnchored) {
    return "complete_finalization";
  }

  if (input.documentSummary.verification.status === "ready") {
    return "verification_ready";
  }

  return null;
};

const buildWarnings = (input: {
  queueStatus: string | null;
  meeting: MeetingRecord | null;
  latestCodeDelivery: CodeDeliveryRecord | null;
  documentSummary: DocumentWorkspaceSummary;
}) => {
  const warnings: NotaryRequestContext["warnings"] = [];

  if (
    input.latestCodeDelivery &&
    input.latestCodeDelivery.status !== "consumed" &&
    isExpiredTimestamp(input.latestCodeDelivery.expires_at)
  ) {
    warnings.push({
      code: "code_expired",
      severity: "warning",
      message: "The latest access code is expired and should be regenerated before reuse.",
    });
  }

  if ((input.queueStatus === "approved" || input.queueStatus === "completed") && !input.meeting) {
    warnings.push({
      code: "meeting_missing",
      severity: "info",
      message: "This request is ready for the in-person session after approval contact emails are sent.",
    });
  }

  if (input.meeting?.status === "cancelled" || input.meeting?.status === "no_show") {
    warnings.push({
      code: "meeting_incomplete",
      severity: "warning",
      message: "The latest meeting did not complete successfully, so evidence and finalization cannot proceed yet.",
    });
  }

  if (input.meeting?.status === "completed" && !input.documentSummary.finalization.isAnchored) {
    warnings.push({
      code: "finalization_pending",
      severity: "info",
      message: "Meeting execution is complete, but finalization and ledger anchoring are still pending.",
    });
  }

  return warnings;
};

const buildCapabilities = (input: {
  queueStatus: string | null;
  meeting: MeetingRecord | null;
  documentSummary: DocumentWorkspaceSummary;
  identityVerifications: IdentityVerificationEventRecord[];
  proximityEvaluations: ProximityEvaluationRecord[];
}) => {
  const hasPassedSamePlace =
    input.meeting?.same_place_status === "passed" ||
    input.proximityEvaluations.some((evaluation) => evaluation.status === "passed");
  const hasVerifiedIdentity = input.identityVerifications.some((event) => event.status === "verified");

  return {
    canReviewRequest: input.queueStatus === "in_review" || input.queueStatus === "changes_requested",
    canManageMeeting:
      input.queueStatus === "approved" ||
      (!!input.meeting && input.meeting.status !== "completed" && input.meeting.status !== "cancelled" && input.meeting.status !== "no_show"),
    canRecordEvidence: Boolean(input.meeting),
    canFinalizeDocument:
      input.meeting?.status === "completed" &&
      hasPassedSamePlace &&
      hasVerifiedIdentity &&
      !input.documentSummary.finalization.isAnchored,
    canOpenVerification: input.documentSummary.verification.status === "ready",
  };
};

const buildBaseQueueSummary = async (input: {
  request: NotarizationRequestRecord;
  document: DocumentRecord;
  role: RequestRole;
  workflow: IlluminotarizationWorkflowRecord | null;
}) => {
  const [workflowStatusHistory, documentSummary, latestCodeDelivery, meeting, owner] = await Promise.all([
    input.workflow
      ? safelyListWorkflowStatusHistory({
          workflowId: input.workflow.id,
          requestId: input.request.id,
        })
      : Promise.resolve([]),
    buildDocumentWorkspaceSummary({ document: input.document, viewerRole: input.role }),
    getLatestCodeDeliveryForRequest(input.request.id),
    getMeetingByRequestId(input.request.id),
    getWorkspaceIdentitySummaryByUserId(input.document.owner_id),
  ]);
  const visibleIdn = getVisibleDocumentIdn({
    idn: input.document.idn,
    status: input.document.status,
    viewerRole: input.role,
  });
  const [snapshot, latestCheck] = await Promise.all([
    getVerificationSnapshotForDocument(input.document),
    visibleIdn ? getLatestPublicVerificationCheckByIdn(visibleIdn) : Promise.resolve(null),
  ]);

  const queueStatus = resolveQueueStatus({
    request: input.request,
    workflow: input.workflow,
    workflowStatusHistory,
  });
  const workflowResponse = mapWorkflowResponse({
    workflow: input.workflow,
    workflowStatusHistory,
  });
  const finalization = mapFinalizationSummary({
    documentSummary,
    snapshot,
    latestCheck,
    document: input.document,
    visibleIdn,
  });

  return {
    request: {
      id: input.request.id,
      documentId: input.request.document_id,
      workflowId: input.request.workflow_id,
      status: input.request.status,
      queueStatus,
      submittedAt: input.request.submitted_at,
    },
    document: mapDocumentResponse({
      document: input.document,
      viewerRole: input.role,
      summary: documentSummary,
    }),
    owner,
    workflow: workflowResponse,
    latestCodeDelivery: mapLatestCodeDeliveryResponse(latestCodeDelivery),
    meeting: meeting
      ? mapMeetingSummary({
          meeting,
          request: input.request,
          document: input.document,
          owner,
        })
      : null,
    finalization,
    nextAction: buildNextAction({
      queueStatus,
      meeting,
      documentSummary,
    }),
    documentSummary,
    latestCodeDeliveryRecord: latestCodeDelivery,
    meetingRecord: meeting,
    snapshot,
    latestCheck,
    workflowStatusHistory,
  };
};

const buildQueueCounts = (requests: NotaryQueueRequestSummary[]) => {
  const total = requests.length;
  const scheduled = requests.filter((request) =>
    ["scheduled", "rescheduled", "in_progress"].includes(request.meeting?.status ?? ""),
  ).length;
  const readyForInPerson = requests.filter(
    (request) => request.request.queueStatus === "approved" || request.meeting?.status === "in_progress",
  ).length;
  const completed = requests.filter((request) => {
    return (
      request.finalization.isAnchored ||
      request.request.queueStatus === "completed" ||
      request.request.status === "completed"
    );
  }).length;

  return {
    pending: Math.max(total - scheduled - completed, 0),
    scheduled,
    readyForInPerson,
    completed,
    total,
  };
};

const compareBySubmittedAt = (left: NotaryQueueRequestSummary, right: NotaryQueueRequestSummary) => {
  const leftTime = Date.parse(left.request.submittedAt ?? "1970-01-01T00:00:00.000Z");
  const rightTime = Date.parse(right.request.submittedAt ?? "1970-01-01T00:00:00.000Z");
  return rightTime - leftTime;
};

const compareMeetingsByScheduledAt = (
  left: NotaryQueueResponse["meetings"][number],
  right: NotaryQueueResponse["meetings"][number],
) => {
  const leftTime = Date.parse(left.scheduledAt ?? "9999-12-31T00:00:00.000Z");
  const rightTime = Date.parse(right.scheduledAt ?? "9999-12-31T00:00:00.000Z");
  return leftTime - rightTime;
};

const getAuthorizedRequestResource = async (input: {
  requestId: string;
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  const request = await getNotarizationRequestById(input.requestId);
  if (!request) {
    return null;
  }

  const [document, workflow] = await Promise.all([
    getDocumentById(request.document_id),
    resolveWorkflowForRequest(request),
  ]);
  if (!document) {
    return null;
  }

  if (!canAccessRequest({
    role: input.role,
    viewerUserId: input.viewerUserId,
    request,
    workflow,
  })) {
    return null;
  }

  if (!canAccessRequestDocument({ role: input.role, document })) {
    return null;
  }

  return {
    request,
    document,
    workflow,
  };
};

export const listNotaryQueue = async (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
  status?: string | null | undefined;
  limit: number;
  offset: number;
}) => {
  if (!isPrivilegedRole(input.role)) {
    requireViewerUserId(input);
  }

  const requests = await listNotarizationRequests({
    limit: 500,
    offset: 0,
  });
  const documents = await safelyListDocumentsByIds(requests.map((request) => request.document_id));
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const summaries: Array<NotaryQueueRequestSummary | null> = await Promise.all(
    requests.map(async (request): Promise<NotaryQueueRequestSummary | null> => {
      const document = documentsById.get(request.document_id) ?? null;
      if (!document) {
        return null;
      }

      const workflow = await resolveWorkflowForRequest(request);

      if (
        !canAccessRequest({
          role: input.role,
          viewerUserId: input.viewerUserId,
          request,
          workflow,
        })
      ) {
        return null;
      }

      if (!canAccessRequestDocument({ role: input.role, document })) {
        return null;
      }

      const summary = await buildBaseQueueSummary({
        request,
        document,
        role: input.role,
        workflow,
      });

      return {
        request: summary.request,
        document: summary.document,
        owner: summary.owner,
        workflow: summary.workflow,
        latestCodeDelivery: summary.latestCodeDelivery,
        meeting: summary.meeting,
        finalization: summary.finalization,
        nextAction: summary.nextAction,
      } satisfies NotaryQueueRequestSummary;
    }),
  );

  const normalizedStatus = input.status?.trim() ?? "";
  const filtered = summaries
    .filter((summary): summary is NotaryQueueRequestSummary => summary !== null)
    .filter((summary) =>
      normalizedStatus.length > 0 ? summary.request.queueStatus === normalizedStatus : true,
    )
    .sort(compareBySubmittedAt);

  const meetings = filtered
    .map((summary) => summary.meeting)
    .filter(
      (
        meeting,
      ): meeting is NonNullable<NotaryQueueRequestSummary["meeting"]> => meeting !== null,
    )
    .sort(compareMeetingsByScheduledAt)
    .slice(0, 10);

  return {
    requests: filtered.slice(input.offset, input.offset + input.limit),
    meetings,
    counts: buildQueueCounts(filtered),
  } satisfies NotaryQueueResponse;
};

export const getNotaryRequestContext = async (input: {
  requestId: string;
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  const resource = await getAuthorizedRequestResource(input);
  if (!resource) {
    return null as NotaryRequestContext | null;
  }

  const base = await buildBaseQueueSummary({
    request: resource.request,
    document: resource.document,
    role: input.role,
    workflow: resource.workflow,
  });
  const [versions, generationRuns, notary, finalizationHistory, participants] = await Promise.all([
    listDocumentVersions(resource.document.id),
    listDocumentGenerationRuns(resource.document.id),
    getWorkspaceIdentitySummaryByUserId(
      resource.workflow?.assigned_notary_user_id ??
        resource.workflow?.selected_notary_user_id ??
        resource.request.assigned_notary_id,
    ),
    safelyListFinalizationStatusHistory({
      documentId: resource.document.id,
      requestId: resource.request.id,
    }),
    base.meetingRecord ? listMeetingParticipants(base.meetingRecord.id) : Promise.resolve([]),
  ]);
  const reviewDocuments = await buildReviewDocuments({
    document: resource.document,
    versions,
    generationRuns,
  });

  const [checkins, geolocationSamples, identityVerifications, proximityEvaluations, artifacts] =
    base.meetingRecord
      ? await Promise.all([
          listMeetingCheckins(base.meetingRecord.id),
          listMeetingGeolocationSamples({ meetingId: base.meetingRecord.id }),
          listIdentityVerificationEvents(base.meetingRecord.id),
          listProximityEvaluations(base.meetingRecord.id),
          listMeetingArtifacts(base.meetingRecord.id),
        ])
      : [[], [], [], [], []];

  const participantMap = new Map(participants.map((participant) => [participant.id, participant]));
  const geolocationById = new Map(geolocationSamples.map((sample) => [sample.id, sample]));
  const geolocationByCheckinId = new Map(
    geolocationSamples
      .filter((sample) => sample.meeting_checkin_id)
      .map((sample) => [sample.meeting_checkin_id as string, sample]),
  );

  return {
    request: base.request,
    document: {
      ...base.document,
      versions: versions.map(mapDocumentVersionSummary),
      reviewDocuments,
    },
    owner: base.owner,
    notary,
    workflow: base.workflow,
    latestCodeDelivery: base.latestCodeDelivery,
    meeting: base.meetingRecord ? mapMeetingResponse(base.meetingRecord, participants) : null,
    evidence: {
      checkins: checkins.map((checkin) =>
        mapMeetingCheckin({
          checkin,
          participants: participantMap,
          geolocationByCheckinId,
        }),
      ),
      geolocationSamples: geolocationSamples.map(mapMeetingGeolocation),
      identityVerifications: identityVerifications.map((event) =>
        mapIdentityVerification({
          event,
          participants: participantMap,
          checkins,
        }),
      ),
      proximityEvaluations: proximityEvaluations.map((evaluation) =>
        mapProximityEvaluation({
          evaluation,
          geolocationById,
        }),
      ),
      artifacts: artifacts.map(mapMeetingArtifact),
    },
    finalization: {
      ...base.finalization,
      hash: base.snapshot.hashRecord?.hash ?? null,
      ledgerTxId: base.snapshot.ledgerEntry?.ledger_tx_id ?? null,
      anchorAttempt: base.snapshot.ledgerAnchorAttempt
        ? {
            id: base.snapshot.ledgerAnchorAttempt.id,
            status: base.snapshot.ledgerAnchorAttempt.status,
            attemptNumber: base.snapshot.ledgerAnchorAttempt.attempt_number,
            requestedAt: base.snapshot.ledgerAnchorAttempt.requested_at,
            completedAt: base.snapshot.ledgerAnchorAttempt.completed_at,
            failedAt: base.snapshot.ledgerAnchorAttempt.failed_at,
            errorMessage: base.snapshot.ledgerAnchorAttempt.error_message,
          }
        : null,
      history: finalizationHistory.map(mapFinalizationHistory),
    },
    capabilities: buildCapabilities({
      queueStatus: base.request.queueStatus,
      meeting: base.meetingRecord,
      documentSummary: base.documentSummary,
      identityVerifications,
      proximityEvaluations,
    }),
    warnings: buildWarnings({
      queueStatus: base.request.queueStatus,
      meeting: base.meetingRecord,
      latestCodeDelivery: base.latestCodeDeliveryRecord,
      documentSummary: base.documentSummary,
    }),
    nextAction: base.nextAction,
  } satisfies NotaryRequestContext;
};