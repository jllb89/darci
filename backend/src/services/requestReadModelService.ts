import {
  getDocumentById,
  getNotarizationRequestById,
  listDocuments as listDocumentsFromDb,
  listDocumentGenerationRuns,
  listDocumentSystemValues,
  listDocumentVersions,
  listNotarizationRequests,
  type DocumentGenerationRunRecord,
  type DocumentVersionRecord,
  type DocumentRecord,
  type NotarizationRequestRecord,
} from "./documentService";
import {
  buildDocumentWorkspaceSummary,
  type DocumentWorkspaceSummary,
} from "./documentWorkspaceReadModelService";
import { listFinalizationStatusHistory } from "./documentFinalizationService";
import { buildDocumentTimeline } from "./documentTimelineService";
import {
  getVisibleDocumentIdn,
  shouldExposeDocumentReviewOutput,
} from "./documentVisibilityService";
import {
  getIlluminotarizationWorkflowById,
  getLatestCodeDeliveryForRequest,
  listWorkflowStatusHistory,
  type CodeDeliveryRecord,
  type IlluminotarizationWorkflowRecord,
  type IlluminotarizationWorkflowStatus,
  type IlluminotarizationWorkflowStatusHistoryRecord,
} from "./illuminotarizationWorkflowService";
import {
  getMeetingByRequestId,
  listIdentityVerificationEvents,
  listMeetingArtifacts,
  listMeetingParticipants,
  listMeetingsByRequestIds,
  listProximityEvaluations,
  type IdentityVerificationEventRecord,
  type MeetingArtifactRecord,
  type MeetingParticipantRecord,
  type MeetingRecord,
  type MeetingStatus,
  type ProximityEvaluationRecord,
} from "./meetingService";
import type { RequestRole } from "./userRoleService";
import {
  getWorkspaceIdentitySummaryByUserId,
  type WorkspaceIdentitySummary,
} from "./workspaceIdentitySummaryService";
import { createDocumentDownloadUrl } from "./storageService";

export class RequestReadModelServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "RequestReadModelServiceError";
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
    console.warn("Request read model enrichment fallback used", {
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
  return readModelFallback({
    operation: "finalization_status_history",
    fallback: [],
    details: {
      requestId: input.requestId,
      documentId: input.documentId,
    },
    run: () => listFinalizationStatusHistory(input.documentId),
  });
};

type SharedRequestResponse = {
  id: string;
  documentId: string;
  workflowId: string | null;
  status: string | null;
  submittedAt: string | null;
  meetingId: string | null;
  meetingStatus: string | null;
  meetingScheduledAt: string | null;
  meetingTimezone: string | null;
  meetingLocation: string | null;
};

type SharedMeetingParticipantResponse = {
  id: string;
  userId: string | null;
  participantRole: string;
  status: string;
  presenceRequired: boolean;
  participantLabel: string | null;
  arrivedAt: string | null;
  departedAt: string | null;
};

type SharedIdentityVerificationResponse = {
  id: string;
  participantRole: string;
  verificationMethod: string;
  status: string;
  verifiedAt: string | null;
};

type SharedProximityEvaluationResponse = {
  id: string;
  evaluationKind: string;
  status: string;
  observedDistanceMeters: number | null;
  evaluatedAt: string;
};

type SharedMeetingArtifactResponse = {
  id: string;
  artifactKind: string;
  status: string;
  capturedAt: string | null;
};

type SharedMeetingResponse = {
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
  participants: SharedMeetingParticipantResponse[];
  identityVerifications: SharedIdentityVerificationResponse[];
  proximityEvaluations: SharedProximityEvaluationResponse[];
  artifacts: SharedMeetingArtifactResponse[];
};

type SharedRequestDocumentResponse = {
  id: string;
  idn: string | null;
  status: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  createdAt: string;
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
  productFlowMode?: string;
  selectedFamilies?: string[];
  outputBundle?: Array<Record<string, unknown>>;
  summary: DocumentWorkspaceSummary;
};

type SharedRequestWorkflowResponse = {
  id: string | null;
  status: string | null;
  latestStatus: string | null;
  latestStatusAt: string | null;
  reviewStartedAt: string | null;
  closedAt: string | null;
  selectedNotaryUserId: string | null;
  assignedNotaryUserId: string | null;
  lastCodeGeneratedAt: string | null;
};

type SharedRequestCodeDeliveryResponse = {
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
};

type SharedRequestCapabilities = {
  canViewDocument: boolean;
  canViewTimeline: boolean;
  canManageMeeting: boolean;
  canReviewRequest: boolean;
  canFinalizeDocument: boolean;
  canOpenVerification: boolean;
};

type SharedRequestWarning = {
  code: string;
  severity: "info" | "warning";
  message: string;
};

type SharedRequestDetailResponse = {
  request: SharedRequestResponse;
  document: SharedRequestDocumentResponse;
  workflow: SharedRequestWorkflowResponse | null;
  latestCodeDelivery: SharedRequestCodeDeliveryResponse | null;
  owner: WorkspaceIdentitySummary | null;
  notary: WorkspaceIdentitySummary | null;
  meeting: SharedMeetingResponse | null;
  capabilities: SharedRequestCapabilities;
  warnings: SharedRequestWarning[];
  nextAction: string | null;
};

const isPrivilegedRole = (role: RequestRole) => {
  return role === "admin" || role === "service_role";
};

const requireViewerUserId = (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  const viewerUserId = input.viewerUserId?.trim() ?? "";
  if (viewerUserId.length > 0) {
    return viewerUserId;
  }

  throw new RequestReadModelServiceError(
    403,
    `${input.role === "notary" ? "Notary" : "User"} is not registered`,
  );
};

const mapSharedRequestResponse = (
  request: NotarizationRequestRecord,
  meeting: MeetingRecord | null,
): SharedRequestResponse => {
  return {
    id: request.id,
    documentId: request.document_id,
    workflowId: request.workflow_id,
    status: request.status,
    submittedAt: request.submitted_at,
    meetingId: meeting?.id ?? null,
    meetingStatus: meeting?.status ?? null,
    meetingScheduledAt: meeting?.scheduled_at ?? null,
    meetingTimezone: meeting?.timezone ?? null,
    meetingLocation: meeting?.location ?? null,
  };
};

const mapSharedMeetingResponse = (
  meeting: MeetingRecord,
  participants: MeetingParticipantRecord[],
  identityVerifications: IdentityVerificationEventRecord[],
  proximityEvaluations: ProximityEvaluationRecord[],
  artifacts: MeetingArtifactRecord[],
): SharedMeetingResponse => {
  const proposedSlots = Array.isArray(meeting.metadata.proposedSlots)
    ? meeting.metadata.proposedSlots.filter((value): value is string => typeof value === "string")
    : [];
  const participantsById = new Map(participants.map((participant) => [participant.id, participant]));

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
    participants: participants.map((participant) => ({
      id: participant.id,
      userId: participant.user_id,
      participantRole: participant.participant_role,
      status: participant.status,
      presenceRequired: participant.presence_required,
      participantLabel: participant.participant_label,
      arrivedAt: participant.arrived_at,
      departedAt: participant.departed_at,
    })),
    identityVerifications: identityVerifications.map((event) => ({
      id: event.id,
      participantRole: participantsById.get(event.meeting_participant_id)?.participant_role ?? "observer",
      verificationMethod: event.verification_method,
      status: event.status,
      verifiedAt: event.verified_at,
    })),
    proximityEvaluations: proximityEvaluations.map((evaluation) => ({
      id: evaluation.id,
      evaluationKind: evaluation.evaluation_kind,
      status: evaluation.status,
      observedDistanceMeters: evaluation.observed_distance_meters,
      evaluatedAt: evaluation.evaluated_at,
    })),
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      artifactKind: artifact.artifact_kind,
      status: artifact.status,
      capturedAt: artifact.captured_at,
    })),
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

const buildOutputMetadataByKey = (document: Pick<DocumentRecord, "output_bundle">) => {
  const outputMetadataByKey = new Map<string, Record<string, unknown>>();

  for (const rawOutput of document.output_bundle ?? []) {
    const outputKey = asTrimmedString(rawOutput.outputKey);
    const metadata = rawOutput.metadata;
    if (outputKey && metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      outputMetadataByKey.set(outputKey, metadata as Record<string, unknown>);
    }
  }

  return outputMetadataByKey;
};

const buildOutputOrderByKey = (document: Pick<DocumentRecord, "output_bundle">) => {
  const outputOrderByKey = new Map<string, number>();

  for (const [index, rawOutput] of (document.output_bundle ?? []).entries()) {
    const outputKey = asTrimmedString(rawOutput.outputKey);
    if (outputKey && !outputOrderByKey.has(outputKey)) {
      outputOrderByKey.set(outputKey, index);
    }
  }

  return outputOrderByKey;
};

const buildGenerationRunById = (generationRuns: DocumentGenerationRunRecord[]) => {
  return new Map(generationRuns.map((run) => [run.id, run]));
};

const getReviewDocumentGroupKey = (input: {
  version: DocumentVersionRecord;
  generationRunById: Map<string, DocumentGenerationRunRecord>;
}) => {
  const run = input.version.generation_run_id
    ? input.generationRunById.get(input.version.generation_run_id)
    : null;

  return run?.output_key ?? input.version.generation_run_id ?? input.version.file_name ?? input.version.id;
};

const isVisibleReviewVersion = (input: {
  version: DocumentVersionRecord;
  generationRunById: Map<string, DocumentGenerationRunRecord>;
  outputMetadataByKey: Map<string, Record<string, unknown>>;
  viewerRole: RequestRole;
}) => {
  const run = input.version.generation_run_id
    ? input.generationRunById.get(input.version.generation_run_id)
    : null;
  if (!run?.output_key) {
    return true;
  }

  const metadata = input.outputMetadataByKey.get(run.output_key) ?? {};
  return shouldExposeDocumentReviewOutput({
    outputKey: run.output_key,
    documentKey: asTrimmedString(metadata.documentKey) || run.document_key,
    baseOutputKey: asTrimmedString(metadata.baseOutputKey),
    viewerRole: input.viewerRole,
  });
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

const isUploadedDocumentReviewSource = (input: {
  document: Pick<DocumentRecord, "document_type" | "product_flow_mode">;
  version: DocumentVersionRecord;
}) => {
  const documentType = input.document.document_type?.trim().toLowerCase() ?? "";
  const productFlowMode = input.document.product_flow_mode?.trim().toLowerCase() ?? "";
  const storagePath = input.version.storage_path?.trim().toLowerCase() ?? "";

  return Boolean(
    (documentType === "notarize_document" || productFlowMode === "notarize_document") &&
      storagePath.endsWith("/source.pdf"),
  );
};

const buildReviewDocuments = async (
  input: {
    document: Pick<DocumentRecord, "document_type" | "output_bundle" | "product_flow_mode">;
    versions: DocumentVersionRecord[];
    generationRuns: DocumentGenerationRunRecord[];
    viewerRole: RequestRole;
  },
): Promise<SharedRequestDocumentResponse["reviewDocuments"]> => {
  const outputLabelByGenerationRunId = buildOutputLabelByGenerationRunId({
    document: input.document,
    generationRuns: input.generationRuns,
  });
  const outputMetadataByKey = buildOutputMetadataByKey(input.document);
  const outputOrderByKey = buildOutputOrderByKey(input.document);
  const generationRunById = buildGenerationRunById(input.generationRuns);
  const pdfVersions = input.versions
    .filter((version) =>
      isPdfDocumentVersion(version) &&
        (isReviewableDocumentVersion(version) ||
          isUploadedDocumentReviewSource({ document: input.document, version })) &&
        isVisibleReviewVersion({
          version,
          generationRunById,
          outputMetadataByKey,
          viewerRole: input.viewerRole,
        }),
    )
    .sort((left, right) => right.version - left.version);
  const latestByOutput = new Map<string, DocumentVersionRecord>();

  for (const version of pdfVersions) {
    const key = getReviewDocumentGroupKey({ version, generationRunById });
    if (!latestByOutput.has(key)) {
      latestByOutput.set(key, version);
    }
  }

  const reviewVersions = Array.from(latestByOutput.values()).sort((left, right) => {
    const leftOrder = outputOrderByKey.get(getReviewDocumentGroupKey({ version: left, generationRunById }))
      ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = outputOrderByKey.get(getReviewDocumentGroupKey({ version: right, generationRunById }))
      ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

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

const mapRequestDocumentResponse = (input: {
  document: DocumentRecord;
  viewerRole: RequestRole;
  reviewDocuments: SharedRequestDocumentResponse["reviewDocuments"];
  summary: DocumentWorkspaceSummary;
}): SharedRequestDocumentResponse => {
  const response: SharedRequestDocumentResponse = {
    id: input.document.id,
    idn: getVisibleDocumentIdn({
      idn: input.document.idn,
      status: input.document.status,
      viewerRole: input.viewerRole,
    }),
    status: input.document.status,
    documentType: input.document.document_type,
    jurisdiction: input.document.jurisdiction,
    createdAt: input.document.created_at,
    reviewDocuments: input.reviewDocuments,
    summary: input.summary,
  };

  if (typeof input.document.product_flow_mode === "string" && input.document.product_flow_mode) {
    response.productFlowMode = input.document.product_flow_mode;
  }

  if (Array.isArray(input.document.selected_families) && input.document.selected_families.length > 0) {
    response.selectedFamilies = input.document.selected_families;
  }

  if (Array.isArray(input.document.output_bundle) && input.document.output_bundle.length > 0) {
    response.outputBundle = input.document.output_bundle.filter((output) => {
      const outputKey = asTrimmedString(output.outputKey);
      const metadata = output.metadata;
      const metadataRecord = metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : {};

      return Boolean(
        outputKey &&
          shouldExposeDocumentReviewOutput({
            outputKey,
            documentKey: asTrimmedString(metadataRecord.documentKey),
            baseOutputKey: asTrimmedString(metadataRecord.baseOutputKey),
            viewerRole: input.viewerRole,
          }),
      );
    });
  }

  return response;
};

const getLatestWorkflowStatusEntry = (
  workflowStatusHistory: Array<
    Pick<IlluminotarizationWorkflowStatusHistoryRecord, "next_status" | "created_at">
  >,
) => {
  return workflowStatusHistory.at(-1) ?? null;
};

const mapWorkflowResponse = (input: {
  request: NotarizationRequestRecord;
  workflow: IlluminotarizationWorkflowRecord | null;
  workflowStatusHistory: Array<
    Pick<IlluminotarizationWorkflowStatusHistoryRecord, "next_status" | "created_at">
  >;
}) => {
  if (!input.request.workflow_id && !input.workflow) {
    return null as SharedRequestWorkflowResponse | null;
  }

  const latestStatusEntry = getLatestWorkflowStatusEntry(input.workflowStatusHistory);
  const latestStatus = latestStatusEntry?.next_status ?? input.workflow?.status ?? input.request.status ?? null;

  return {
    id: input.request.workflow_id ?? input.workflow?.id ?? null,
    status: input.workflow?.status ?? latestStatus,
    latestStatus,
    latestStatusAt: latestStatusEntry?.created_at ?? null,
    reviewStartedAt: input.workflow?.review_started_at ?? null,
    closedAt: input.workflow?.closed_at ?? null,
    selectedNotaryUserId: input.workflow?.selected_notary_user_id ?? null,
    assignedNotaryUserId:
      input.workflow?.assigned_notary_user_id ?? input.request.assigned_notary_id ?? null,
    lastCodeGeneratedAt: input.workflow?.last_code_generated_at ?? null,
  } satisfies SharedRequestWorkflowResponse;
};

const mapLatestCodeDeliveryResponse = (delivery: CodeDeliveryRecord | null) => {
  if (!delivery) {
    return null as SharedRequestCodeDeliveryResponse | null;
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
  } satisfies SharedRequestCodeDeliveryResponse;
};

const isPrivilegedMeetingRole = (role: RequestRole) => {
  return role === "notary" || role === "admin" || role === "service_role";
};

const isTerminalWorkflowStatus = (status: IlluminotarizationWorkflowStatus | string | null) => {
  return (
    status === "completed" ||
    status === "rejected" ||
    status === "canceled" ||
    status === "expired"
  );
};

const canFinalizeFromState = (input: {
  role: RequestRole;
  requestStatus: string | null;
  meetingStatus: MeetingStatus | null;
  workflowStatus: string | null;
  documentSummary: DocumentWorkspaceSummary;
}) => {
  if (!isPrivilegedMeetingRole(input.role) || input.documentSummary.finalization.isAnchored) {
    return false;
  }

  return (
    input.meetingStatus === "completed" ||
    input.workflowStatus === "completed" ||
    input.requestStatus === "completed" ||
    input.documentSummary.finalization.latestStatus !== null
  );
};

const buildCapabilities = (input: {
  role: RequestRole;
  requestStatus: string | null;
  workflowStatus: string | null;
  meeting: MeetingRecord | null;
  documentSummary: DocumentWorkspaceSummary;
}) => {
  const canManageMeeting =
    isPrivilegedMeetingRole(input.role) && !isTerminalWorkflowStatus(input.workflowStatus);
  const canReviewRequest =
    isPrivilegedMeetingRole(input.role) &&
    (input.workflowStatus === "in_review" || input.workflowStatus === "changes_requested");

  return {
    canViewDocument: true,
    canViewTimeline: true,
    canManageMeeting,
    canReviewRequest,
    canFinalizeDocument: canFinalizeFromState({
      role: input.role,
      requestStatus: input.requestStatus,
      meetingStatus: input.meeting?.status ?? null,
      workflowStatus: input.workflowStatus,
      documentSummary: input.documentSummary,
    }),
    canOpenVerification: input.documentSummary.verification.verifyPath !== null,
  } satisfies SharedRequestCapabilities;
};

const buildWarnings = (input: {
  requestStatus: string | null;
  workflowStatus: string | null;
  meeting: MeetingRecord | null;
  latestCodeDelivery: CodeDeliveryRecord | null;
  documentSummary: DocumentWorkspaceSummary;
}) => {
  const warnings: SharedRequestWarning[] = [];

  if (!input.meeting && input.requestStatus && !isTerminalWorkflowStatus(input.workflowStatus)) {
    warnings.push({
      code: "meeting_not_scheduled",
      severity: "info",
      message: "No meeting has been scheduled for this request yet.",
    });
  }

  if (
    input.latestCodeDelivery?.status === "expired" ||
    input.documentSummary.workflow.latestCodeStatus === "expired"
  ) {
    warnings.push({
      code: "code_expired",
      severity: "warning",
      message: "The latest access code has expired and may need to be regenerated or resent.",
    });
  } else if (input.latestCodeDelivery?.status === "failed") {
    warnings.push({
      code: "code_delivery_failed",
      severity: "warning",
      message: "The latest access code delivery failed.",
    });
  }

  if (input.workflowStatus === "changes_requested") {
    warnings.push({
      code: "changes_requested",
      severity: "warning",
      message: "The request is waiting on requested changes before it can continue.",
    });
  } else if (input.workflowStatus === "in_review") {
    warnings.push({
      code: "awaiting_review",
      severity: "info",
      message: "The request is currently in review.",
    });
  }

  if (
    (input.workflowStatus === "completed" || input.meeting?.status === "completed") &&
    !input.documentSummary.finalization.isAnchored
  ) {
    warnings.push({
      code: "finalization_incomplete",
      severity: "warning",
      message: "Meeting work is complete, but document finalization is still pending.",
    });
  }

  return warnings;
};

const buildNextAction = (input: {
  role: RequestRole;
  meeting: MeetingRecord | null;
  workflowStatus: string | null;
  latestCodeDelivery: CodeDeliveryRecord | null;
  documentSummary: DocumentWorkspaceSummary;
  capabilities: SharedRequestCapabilities;
}) => {
  if (input.workflowStatus === "changes_requested") {
    return input.role === "member"
      ? "Review the requested changes and resubmit the document package."
      : "Wait for the member to address the requested changes before continuing review.";
  }

  if (
    input.latestCodeDelivery?.status === "expired" ||
    input.latestCodeDelivery?.status === "failed"
  ) {
    return isPrivilegedMeetingRole(input.role)
      ? "Resend or regenerate the access code before continuing the request."
      : "Wait for an updated access code delivery before continuing this request.";
  }

  if (input.capabilities.canReviewRequest) {
    return "Complete the review decision to move the request forward.";
  }

  if (!input.meeting) {
    return input.capabilities.canManageMeeting
      ? "Schedule or propose a meeting to keep the request moving."
      : "Wait for a meeting to be scheduled for this request.";
  }

  if (input.meeting.status === "scheduled" || input.meeting.status === "rescheduled") {
    return isPrivilegedMeetingRole(input.role)
      ? "Prepare for the scheduled meeting and collect any remaining evidence."
      : "Attend the scheduled meeting to continue notarization.";
  }

  if (input.meeting.status === "in_progress") {
    return isPrivilegedMeetingRole(input.role)
      ? "Finish the active meeting and capture the remaining evidence."
      : "Complete the active meeting session to continue notarization.";
  }

  if (
    !input.documentSummary.finalization.isAnchored &&
    (input.workflowStatus === "completed" || input.meeting.status === "completed")
  ) {
    return isPrivilegedMeetingRole(input.role)
      ? "Finish document finalization so verification can move to ready."
      : "Wait for document finalization to complete so verification can move to ready.";
  }

  if (input.capabilities.canOpenVerification) {
    return "Open the verification record to confirm the final public verification result.";
  }

  return null;
};

const canAccessRequest = (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
  request: Pick<NotarizationRequestRecord, "assigned_notary_id">;
  document: Pick<DocumentRecord, "owner_id">;
}) => {
  if (isPrivilegedRole(input.role)) {
    return true;
  }

  if (input.role === "member") {
    return Boolean(input.viewerUserId) && input.document.owner_id === input.viewerUserId;
  }

  if (input.role === "notary") {
    return Boolean(input.viewerUserId) && input.request.assigned_notary_id === input.viewerUserId;
  }

  return false;
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

  const document = await getDocumentById(request.document_id);
  if (!document) {
    return null;
  }

  if (
    !canAccessRequest({
      role: input.role,
      viewerUserId: input.viewerUserId,
      request,
      document,
    })
  ) {
    return null;
  }

  return {
    request,
    document,
  };
};

export const listSharedRequests = async (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
  status?: string | null | undefined;
  memberId?: string | null | undefined;
  notaryId?: string | null | undefined;
  limit: number;
  offset: number;
}) => {
  const memberId = input.memberId?.trim() ?? "";
  const notaryId = input.notaryId?.trim() ?? "";
  const status = input.status?.trim() ?? "";

  if (!isPrivilegedRole(input.role) && (memberId.length > 0 || notaryId.length > 0)) {
    throw new RequestReadModelServiceError(
      403,
      "Only admin and service users can filter requests by memberId or notaryId",
    );
  }

  let documentIds: string[] | undefined;
  let assignedNotaryId: string | undefined;

  if (input.role === "member") {
    const viewerUserId = requireViewerUserId(input);
    const documents = await listDocumentsFromDb(viewerUserId);
    documentIds = documents.map((document) => document.id);
  } else if (input.role === "notary") {
    assignedNotaryId = requireViewerUserId(input);
  } else {
    if (memberId.length > 0) {
      const documents = await listDocumentsFromDb(memberId);
      documentIds = documents.map((document) => document.id);
    }

    if (notaryId.length > 0) {
      assignedNotaryId = notaryId;
    }
  }

  if (documentIds && documentIds.length === 0) {
    return [] as SharedRequestResponse[];
  }

  const requests = await listNotarizationRequests({
    ...(documentIds ? { documentIds } : {}),
    ...(assignedNotaryId ? { assignedNotaryId } : {}),
    ...(status.length > 0 ? { status } : {}),
    limit: input.limit,
    offset: input.offset,
  });
  const meetings = await listMeetingsByRequestIds(requests.map((request) => request.id));
  const meetingsByRequestId = new Map<string, MeetingRecord>();

  for (const meeting of meetings) {
    if (!meetingsByRequestId.has(meeting.request_id)) {
      meetingsByRequestId.set(meeting.request_id, meeting);
    }
  }

  return requests.map((request) => {
    return mapSharedRequestResponse(request, meetingsByRequestId.get(request.id) ?? null);
  });
};

export const getSharedRequestDetail = async (input: {
  requestId: string;
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  const resource = await getAuthorizedRequestResource(input);
  if (!resource) {
    return null as SharedRequestDetailResponse | null;
  }

  const [meeting, documentSummary, reviewDocuments, workflow, latestCodeDelivery] = await Promise.all([
    getMeetingByRequestId(resource.request.id),
    buildDocumentWorkspaceSummary({
      document: resource.document,
      viewerRole: input.role,
    }),
    readModelFallback({
      operation: "document_review_documents",
      fallback: [] as SharedRequestDocumentResponse["reviewDocuments"],
      details: {
        requestId: resource.request.id,
        documentId: resource.document.id,
      },
      run: async () => {
        const [versions, generationRuns] = await Promise.all([
          listDocumentVersions(resource.document.id),
          listDocumentGenerationRuns(resource.document.id),
        ]);
        return buildReviewDocuments({
          document: resource.document,
          versions,
          generationRuns,
          viewerRole: input.role,
        });
      },
    }),
    resource.request.workflow_id
      ? safelyGetWorkflowById({
          workflowId: resource.request.workflow_id,
          requestId: resource.request.id,
        })
      : Promise.resolve(null),
    getLatestCodeDeliveryForRequest(resource.request.id),
  ]);
  const [participants, identityVerifications, proximityEvaluations, artifacts, workflowStatusHistory] = await Promise.all([
    meeting ? listMeetingParticipants(meeting.id) : Promise.resolve([]),
    meeting
      ? readModelFallback({
          operation: "meeting_identity_verifications",
          fallback: [] as IdentityVerificationEventRecord[],
          details: {
            requestId: resource.request.id,
            meetingId: meeting.id,
          },
          run: () => listIdentityVerificationEvents(meeting.id),
        })
      : Promise.resolve([] as IdentityVerificationEventRecord[]),
    meeting
      ? readModelFallback({
          operation: "meeting_proximity_evaluations",
          fallback: [] as ProximityEvaluationRecord[],
          details: {
            requestId: resource.request.id,
            meetingId: meeting.id,
          },
          run: () => listProximityEvaluations(meeting.id),
        })
      : Promise.resolve([] as ProximityEvaluationRecord[]),
    meeting
      ? readModelFallback({
          operation: "meeting_artifacts",
          fallback: [] as MeetingArtifactRecord[],
          details: {
            requestId: resource.request.id,
            meetingId: meeting.id,
          },
          run: () => listMeetingArtifacts(meeting.id),
        })
      : Promise.resolve([] as MeetingArtifactRecord[]),
    resource.request.workflow_id
      ? safelyListWorkflowStatusHistory({
          workflowId: resource.request.workflow_id,
          requestId: resource.request.id,
        })
      : Promise.resolve([]),
  ]);
  const workflowStatus =
    getLatestWorkflowStatusEntry(workflowStatusHistory)?.next_status ??
    workflow?.status ??
    resource.request.status ??
    null;
  const notaryUserId =
    workflow?.assigned_notary_user_id ??
    workflow?.selected_notary_user_id ??
    resource.request.assigned_notary_id ??
    null;
  const [owner, notary] = await Promise.all([
    getWorkspaceIdentitySummaryByUserId(resource.document.owner_id),
    getWorkspaceIdentitySummaryByUserId(notaryUserId),
  ]);
  const capabilities = buildCapabilities({
    role: input.role,
    requestStatus: resource.request.status,
    workflowStatus,
    meeting,
    documentSummary,
  });
  const warnings = buildWarnings({
    requestStatus: resource.request.status,
    workflowStatus,
    meeting,
    latestCodeDelivery,
    documentSummary,
  });

  return {
    request: mapSharedRequestResponse(resource.request, meeting),
    document: mapRequestDocumentResponse({
      document: resource.document,
      viewerRole: input.role,
      reviewDocuments,
      summary: documentSummary,
    }),
    workflow: mapWorkflowResponse({
      request: resource.request,
      workflow,
      workflowStatusHistory,
    }),
    latestCodeDelivery: mapLatestCodeDeliveryResponse(latestCodeDelivery),
    owner,
    notary,
    meeting: meeting
      ? mapSharedMeetingResponse(
          meeting,
          participants,
          identityVerifications,
          proximityEvaluations,
          artifacts,
        )
      : null,
    capabilities,
    warnings,
    nextAction: buildNextAction({
      role: input.role,
      meeting,
      workflowStatus,
      latestCodeDelivery,
      documentSummary,
      capabilities,
    }),
  } satisfies SharedRequestDetailResponse;
};

export const getSharedRequestTimeline = async (input: {
  requestId: string;
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  const resource = await getAuthorizedRequestResource(input);
  if (!resource) {
    return null;
  }

  const [systemValues, finalizationStatusHistory] = await Promise.all([
    listDocumentSystemValues(resource.document.id),
    safelyListFinalizationStatusHistory({
      documentId: resource.document.id,
      requestId: resource.request.id,
    }),
  ]);
  const workflowStatusHistory = resource.request.workflow_id
    ? await safelyListWorkflowStatusHistory({
        workflowId: resource.request.workflow_id,
        requestId: resource.request.id,
      })
    : [];

  return buildDocumentTimeline({
    document: resource.document,
    systemValues,
    request: resource.request,
    workflowStatusHistory,
    finalizationStatusHistory,
  });
};