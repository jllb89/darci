import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { sendValidationError } from "../utils/validation";
import { recordAuditEvent } from "../services/auditService";
import {
  identityDocumentPolicyVersion,
  validateIdentityDocument,
} from "../services/identityDocumentPolicy";
import {
  queueInPersonSessionStartedNotification,
  queueMeetingScheduledConfirmationNotification,
  queueNotaryApprovalReceivedNotification,
  queueNotaryChangesRequestedNotification,
  queueNotaryNextStepNotification,
  queueNotaryRequestClaimedNotification,
} from "../services/notificationService";
import { runDueNotificationJobs } from "../services/notificationOutboxService";
import { getNotaryProfileByUserId } from "../services/notaryProfileService";
import { getUserIdentityContextByUserId } from "../services/userRoleService";
import {
  createNotarizationCode,
  getDocumentById,
  getLatestNotarizationCodeForRequest,
  getNotarizationCodeByValue,
  getNotarizationRequestById,
  getOrCreateUserId,
  updateNotarizationCode,
  updateNotarizationRequest,
} from "../services/documentService";
import {
  createIdentityVerificationEvent,
  createGeolocationSample,
  createMeeting,
  createMeetingArtifact,
  createMeetingCheckin,
  createMeetingParticipant,
  createProximityEvaluation,
  getGeolocationSampleById,
  getIdentityVerificationEventById,
  getMeetingByRequestId,
  getMeetingCheckinById,
  listIdentityVerificationEvents,
  listMeetingParticipants,
  listMeetingGeolocationSamples,
  updateMeeting,
  updateMeetingParticipant,
  type GeolocationCaptureStage,
  type GeolocationSampleKind,
  type GeolocationSampleRecord,
  type IdentityVerificationEventRecord,
  type IdentityVerificationMethod,
  type IdentityVerificationStatus,
  type MeetingArtifactKind,
  type MeetingArtifactRecord,
  type MeetingCheckinKind,
  type MeetingCheckinRecord,
  type MeetingParticipantRecord,
  type MeetingParticipantRole,
  type MeetingRecord,
  type MeetingStatus,
  type ProximityEvaluationRecord,
} from "../services/meetingService";
import {
  createIlluminotaryReviewDecisionRecord,
  createCodeDeliveryRecord,
  getIlluminotarizationWorkflowById,
  getIlluminotarizationWorkflowByLegacyRequestId,
  getLatestCodeDeliveryForCode,
  getLatestCodeDeliveryForRequest,
  invalidateOpenCodeDeliveriesForRequest,
  markCodeDeliveriesConsumed,
  recordAccessCodeAttempt,
  transitionIlluminotarizationWorkflowStatus,
  upsertIlluminotarizationWorkflowAssignment,
  type IlluminotaryReviewDecision,
  type IlluminotarizationWorkflowRecord,
} from "../services/illuminotarizationWorkflowService";
import {
  appendAcknowledgmentPage as appendAcknowledgmentPageToDocument,
  DocumentFinalizationConflictError,
  DocumentFinalizationForbiddenError,
  DocumentFinalizationNotFoundError,
  watermarkWithNotice as finalizeDocumentWithWatermark,
} from "../services/documentFinalizationService";

const resolveCodeSchema = z.object({
  code: z.string().min(1),
}).passthrough();

const codeRequestSchema = z.object({
  requestId: z.string().min(1),
}).passthrough();

const reviewDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  summary: z.string().trim().max(1000).optional(),
  decisionNotes: z.string().trim().max(5000).optional(),
}).passthrough();

const meetingParticipantRoleSchema = z.enum([
  "member",
  "notary",
  "signer",
  "trusted_person",
  "witness",
  "observer",
]);

const meetingProposalSchema = z.object({
  proposedSlots: z.array(z.string().datetime()).min(1),
  timezone: z.string().trim().min(1),
  location: z.string().trim().min(1).optional(),
}).passthrough();

const meetingGeolocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().nonnegative().optional(),
  altitudeMeters: z.number().optional(),
  sampleKind: z.enum(["device_gps", "network", "manual_pin", "derived"]).optional(),
  captureStage: z.enum([
    "checkin",
    "checkin_confirmation",
    "proximity_validation",
    "meeting_start",
    "meeting_end",
  ]).optional(),
});

const meetingCheckinSchema = z.object({
  participantRole: z.enum(["member", "notary"]).optional(),
  checkinKind: z.enum([
    "arrival",
    "proximity",
    "identity",
    "meeting_start",
    "meeting_end",
    "manual",
  ]),
  recordedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  geolocation: meetingGeolocationSchema.optional(),
}).passthrough();

const startInPersonSessionSchema = z.object({
  participantRole: z.enum(["notary"]).optional(),
  recordedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
  geolocation: meetingGeolocationSchema.optional(),
}).passthrough();

const meetingConfirmSchema = z.object({
  scheduledAt: z.string().datetime(),
  timezone: z.string().trim().min(1),
  location: z.string().trim().min(1).optional(),
}).passthrough();

const meetingRescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  timezone: z.string().trim().min(1),
  location: z.string().trim().min(1).optional(),
  rescheduleReason: z.string().trim().max(2000).optional(),
}).passthrough();

const meetingCancelSchema = z.object({
  cancelledBy: z.enum(["member", "notary", "system"]),
  cancellationReason: z.string().trim().max(2000).optional(),
}).passthrough();

const meetingNoShowSchema = z.object({
  noShowParty: z.enum(["member", "notary"]),
  recordedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
}).passthrough();

const identityVerificationSchema = z.object({
  participantRole: meetingParticipantRoleSchema.optional(),
  verificationMethod: z.enum([
    "in_person_document",
    "credential_scan",
    "manual_attestation",
    "knowledge_based",
    "biometric",
    "other",
  ]),
  status: z.enum(["pending", "verified", "failed", "manual_review"]).optional(),
  subjectName: z.string().trim().min(1).max(255).optional(),
  documentType: z.string().trim().min(1).max(255).optional(),
  documentLast4: z.string().trim().min(2).max(4).optional(),
  documentNumberTail: z.string().trim().min(2).max(4).optional(),
  maskedIdentifier: z.string().trim().min(4).max(64).optional(),
  issuingJurisdiction: z.string().trim().min(1).max(255).optional(),
  documentExpirationDate: z.string().trim().min(10).max(10).optional(),
  evidenceArtifactIds: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
  verifiedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
}).passthrough();

const proximityEvaluationSchema = z.object({
  memberSampleId: z.string().trim().min(1).optional(),
  notarySampleId: z.string().trim().min(1).optional(),
  thresholdMeters: z.number().positive().max(10000).optional(),
  evaluatedAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
}).passthrough();

const defaultSamePlaceThresholdMeters = 100;
const samePlaceSampleFreshnessMs = 15 * 60 * 1000;
const samePlaceSampleFreshnessMinutes = samePlaceSampleFreshnessMs / 60_000;

const meetingArtifactSchema = z.object({
  participantRole: meetingParticipantRoleSchema.optional(),
  meetingCheckinId: z.string().trim().min(1).optional(),
  identityVerificationEventId: z.string().trim().min(1).optional(),
  artifactKind: z.enum([
    "identity_document",
    "identity_selfie",
    "consent_capture",
    "location_photo",
    "verification_summary",
    "seal_preview",
    "meeting_note",
    "other",
  ]),
  storageBucket: z.string().trim().min(1).optional(),
  storagePath: z.string().trim().min(1).optional(),
  mimeType: z.string().trim().min(1).max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  capturedAt: z.string().datetime().optional(),
  retentionUntil: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
}).passthrough();

const notaryVenueSchema = z.object({
  state: z.string().trim().min(2).max(80),
  county: z.string().trim().min(1).max(120),
  city: z.string().trim().max(120).optional(),
  addressLine1: z.string().trim().max(255).optional(),
  locationLabel: z.string().trim().max(255).optional(),
  completedAt: z.string().datetime().optional(),
});

const notarySignSchema = z.object({
  venue: notaryVenueSchema,
  acknowledgment: z.object({
    signerAppeared: z.literal(true),
    signerAcknowledged: z.literal(true),
  }),
  notarialFields: z.record(z.string(), z.unknown()).optional(),
  sealLabel: z.string().trim().max(255).optional(),
  signatureLabel: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(2000).optional(),
}).passthrough();

const notarySubmitSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
}).passthrough();

const sendNotImplemented = (res: Response, message: string) => {
  return res.status(501).json({
    error: "not_implemented",
    message,
  });
};

const sendDocumentFinalizationError = (res: Response, error: unknown) => {
  if (error instanceof DocumentFinalizationNotFoundError) {
    return res.status(404).json({ error: "not_found", message: error.message });
  }

  if (error instanceof DocumentFinalizationForbiddenError) {
    return res.status(403).json({ error: "forbidden", message: error.message });
  }

  if (error instanceof DocumentFinalizationConflictError) {
    return res.status(409).json({ error: "conflict", message: error.message });
  }

  throw error;
};

const mapFinalizationExecutionSummary = (execution: {
  id: string;
  execution_kind: string;
  status: string;
  source_document_version_id: string;
  output_document_version_id: string | null;
  template_id: string | null;
  template_version: string | null;
  watermark_text: string | null;
  completed_at: string | null;
}) => ({
  id: execution.id,
  kind: execution.execution_kind,
  status: execution.status,
  sourceVersionId: execution.source_document_version_id,
  outputVersionId: execution.output_document_version_id,
  templateId: execution.template_id,
  templateVersion: execution.template_version,
  watermarkText: execution.watermark_text,
  completedAt: execution.completed_at,
});

const mapFinalizationVersionSummary = (version: {
  id: string;
  document_id: string;
  version: number;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  is_final: boolean | null;
  created_at: string;
}) => ({
  id: version.id,
  documentId: version.document_id,
  version: version.version,
  storagePath: version.storage_path,
  fileName: version.file_name,
  mimeType: version.mime_type,
  sizeBytes: version.size_bytes,
  isFinal: version.is_final ?? false,
  createdAt: version.created_at,
});

const buildFinalPackageStatusSummary = (input: {
  ledgerStatus: string;
  hashCompletedAt: string | null;
  anchoredAt: string | null;
}) => {
  const ledgerAnchored = input.ledgerStatus === "anchored";

  return {
    watermarked: true,
    hashRecorded: Boolean(input.hashCompletedAt),
    ledgerAnchored,
    verificationReady: ledgerAnchored,
    recoveryAction: ledgerAnchored ? null : "retry_final_package_submission",
  };
};

const buildAuditActorContext = (req: Request) => {
  const actorContext: {
    actorSupabaseId?: string;
    actorRole?: string;
    requestId?: string | null;
  } = {};
  if (req.user?.id) {
    actorContext.actorSupabaseId = req.user.id;
  }
  if (req.user?.role) {
    actorContext.actorRole = req.user.role;
  }
  actorContext.requestId = req.requestId ?? null;
  return actorContext;
};

const buildIlluminotarizationWorkflowResponse = (
  workflow: IlluminotarizationWorkflowRecord | null,
) => {
  if (!workflow) {
    return null;
  }

  return {
    id: workflow.id,
    status: workflow.status,
    workflowKind: workflow.workflow_kind,
    selectedNotaryUserId: workflow.selected_notary_user_id,
    assignedNotaryUserId: workflow.assigned_notary_user_id,
    currentLegacyRequestId: workflow.current_legacy_request_id,
  };
};

const resolveWorkflowForRequest = async (input: {
  requestId: string;
  workflowId?: string | null | undefined;
}) => {
  if (input.workflowId) {
    const workflow = await getIlluminotarizationWorkflowById(input.workflowId);
    if (workflow) {
      return workflow;
    }
  }

  return getIlluminotarizationWorkflowByLegacyRequestId(input.requestId);
};

const buildNotarizationCodeExpiry = () => {
  const ttlMinutes = Number(process.env.NOTARIZATION_CODE_TTL_MINUTES ?? 30);
  return new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
};

const isExpiredTimestamp = (value: string | null) => {
  if (!value) {
    return true;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now();
};

const ensureRequestAwaitingCodeResolution = (input: {
  assigned_notary_id: string | null;
  status: string | null;
}) => {
  return !input.assigned_notary_id && input.status === "pending";
};

const reviewDecisionAuditActionMap: Record<IlluminotaryReviewDecision, string> = {
  approved: "notary.request_approved",
  rejected: "notary.request_rejected",
  changes_requested: "notary.request_changes_requested",
};

const reviewDecisionReasonMap: Record<IlluminotaryReviewDecision, string> = {
  approved: "Illuminotary approved the request for the next execution step",
  rejected: "Illuminotary rejected the request",
  changes_requested: "Illuminotary requested document changes before approval",
};

const isMeetingClosedStatus = (status: MeetingStatus | null) => {
  return status === "completed" || status === "cancelled" || status === "no_show";
};

const isMeetingLifecycleEditable = (status: MeetingStatus | null) => {
  return !isMeetingClosedStatus(status) && status !== "in_progress";
};

const resolveActorUserId = async (req: Request) => {
  if (req.user?.dbUserId) {
    return req.user.dbUserId;
  }

  if (!req.user?.id || req.user.role === "service_role") {
    return null;
  }

  return getOrCreateUserId(req.user.id, req.user.email, req.user.role, req.user.phone);
};

const buildUserDisplayName = (identity: Awaited<ReturnType<typeof getUserIdentityContextByUserId>>) => {
  if (!identity) {
    return "Illuminotary";
  }

  const name = [identity.firstName, identity.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return name || identity.email || "Illuminotary";
};

const buildIdentityMethodSummary = (event: IdentityVerificationEventRecord) => {
  return [
    event.verification_method,
    event.document_type,
    event.issuing_jurisdiction,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("; ");
};

const isRequestReadyForReviewDecision = (status: string | null) => {
  return status === "in_review";
};

const isWorkflowReadyForReviewDecision = (status: string) => {
  return status === "in_review" || status === "changes_requested";
};

const buildMeetingResponse = (meeting: MeetingRecord, participants: MeetingParticipantRecord[]) => {
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
  };
};

const buildMeetingGeolocationResponse = (geolocation: GeolocationSampleRecord) => {
  return {
    id: geolocation.id,
    meetingParticipantId: geolocation.meeting_participant_id,
    capturedByUserId: geolocation.captured_by_user_id,
    latitude: geolocation.latitude,
    longitude: geolocation.longitude,
    accuracyMeters: geolocation.accuracy_meters,
    altitudeMeters: geolocation.altitude_meters,
    sampleKind: geolocation.sample_kind,
    captureStage: geolocation.capture_stage,
    capturedAt: geolocation.captured_at,
    expiresAt: geolocation.expires_at,
  };
};

const buildMeetingCheckinResponse = (
  checkin: MeetingCheckinRecord,
  participant: MeetingParticipantRecord,
  geolocation: GeolocationSampleRecord | null,
) => {
  return {
    id: checkin.id,
    meetingId: checkin.meeting_id,
    meetingParticipantId: checkin.meeting_participant_id,
    participantRole: participant.participant_role,
    checkinKind: checkin.checkin_kind,
    status: checkin.status,
    recordedAt: checkin.recorded_at,
    notes: checkin.notes,
    geolocation: geolocation ? buildMeetingGeolocationResponse(geolocation) : null,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

const getIdentityDocumentMetadata = (metadata: Record<string, unknown>) => {
  const identityDocument = isRecord(metadata.identityDocument) ? metadata.identityDocument : {};
  const evidenceArtifactIds = Array.isArray(identityDocument.evidenceArtifactIds)
    ? identityDocument.evidenceArtifactIds.filter((item): item is string => typeof item === "string")
    : [];

  return {
    documentExpirationDate:
      typeof identityDocument.documentExpirationDate === "string"
        ? identityDocument.documentExpirationDate
        : null,
    documentNumberTail:
      typeof identityDocument.documentNumberTail === "string"
        ? identityDocument.documentNumberTail
        : null,
    maskedIdentifier:
      typeof identityDocument.maskedIdentifier === "string"
        ? identityDocument.maskedIdentifier
        : null,
    evidenceArtifactIds,
  };
};

const buildIdentityVerificationResponse = (
  verificationEvent: IdentityVerificationEventRecord,
  participant: MeetingParticipantRecord,
  checkin: MeetingCheckinRecord,
) => {
  const identityDocumentMetadata = getIdentityDocumentMetadata(verificationEvent.metadata);

  return {
    id: verificationEvent.id,
    meetingId: verificationEvent.meeting_id,
    meetingParticipantId: verificationEvent.meeting_participant_id,
    participantRole: participant.participant_role,
    verificationMethod: verificationEvent.verification_method,
    status: verificationEvent.status,
    subjectName: verificationEvent.subject_name_snapshot,
    documentType: verificationEvent.document_type,
    documentLast4: verificationEvent.document_last4,
    issuingJurisdiction: verificationEvent.issuing_jurisdiction,
    documentExpirationDate: identityDocumentMetadata.documentExpirationDate,
    documentNumberTail: identityDocumentMetadata.documentNumberTail,
    maskedIdentifier: identityDocumentMetadata.maskedIdentifier,
    evidenceArtifactIds: identityDocumentMetadata.evidenceArtifactIds,
    verifiedAt: verificationEvent.verified_at,
    notes: verificationEvent.notes,
    meetingCheckinId: checkin.id,
  };
};

const buildProximityEvaluationResponse = (
  evaluation: ProximityEvaluationRecord,
  memberSample: GeolocationSampleRecord,
  notarySample: GeolocationSampleRecord,
) => {
  return {
    id: evaluation.id,
    meetingId: evaluation.meeting_id,
    evaluationKind: evaluation.evaluation_kind,
    status: evaluation.status,
    thresholdMeters: evaluation.threshold_meters,
    observedDistanceMeters: evaluation.observed_distance_meters,
    evaluatedAt: evaluation.evaluated_at,
    notes: evaluation.notes,
    memberSample: buildMeetingGeolocationResponse(memberSample),
    notarySample: buildMeetingGeolocationResponse(notarySample),
  };
};

const buildMeetingArtifactResponse = (artifact: MeetingArtifactRecord) => {
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
  };
};

const calculateDistanceMeters = (
  left: Pick<GeolocationSampleRecord, "latitude" | "longitude">,
  right: Pick<GeolocationSampleRecord, "latitude" | "longitude">,
) => {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return Math.round(earthRadiusMeters * arc * 100) / 100;
};

const calculateSampleAgeSeconds = (sampleCapturedAt: string, evaluatedAt: string) => {
  const capturedAtMs = new Date(sampleCapturedAt).getTime();
  const evaluatedAtMs = new Date(evaluatedAt).getTime();
  if (!Number.isFinite(capturedAtMs) || !Number.isFinite(evaluatedAtMs)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.round((evaluatedAtMs - capturedAtMs) / 1000));
};

const isSampleFresh = (sample: GeolocationSampleRecord, evaluatedAt: string) => {
  const ageSeconds = calculateSampleAgeSeconds(sample.captured_at, evaluatedAt);
  if (!Number.isFinite(ageSeconds)) {
    return false;
  }

  if (ageSeconds > samePlaceSampleFreshnessMs / 1000) {
    return false;
  }

  if (!sample.expires_at) {
    return true;
  }

  return new Date(sample.expires_at).getTime() >= new Date(evaluatedAt).getTime();
};

const resolveRequestIdParam = (req: Request) => {
  const value = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  return typeof value === "string" && value.length > 0 ? value : null;
};

const ensureMeetingRequestEligible = (input: {
  requestStatus: string | null;
  workflowStatus: string | null;
}) => {
  if (input.requestStatus === "rejected" || input.requestStatus === "completed") {
    return false;
  }

  if (!input.workflowStatus) {
    return true;
  }

  return !["rejected", "completed", "canceled", "expired"].includes(input.workflowStatus);
};

const ensureMeetingActorAuthorized = (input: {
  role: string | undefined;
  actorUserId: string | null;
  ownerUserId: string;
  assignedNotaryUserId: string | null;
}) => {
  if (input.role === "member") {
    return input.actorUserId === input.ownerUserId;
  }

  if (input.role === "notary") {
    return !!input.actorUserId && input.assignedNotaryUserId === input.actorUserId;
  }

  return true;
};

const inferParticipantRoleFromRequestUser = (input: {
  role: string | undefined;
  bodyParticipantRole?: MeetingParticipantRole | undefined;
}) => {
  if (input.role === "member") {
    return input.bodyParticipantRole && input.bodyParticipantRole !== "member" ? null : "member";
  }

  if (input.role === "notary") {
    return input.bodyParticipantRole ?? "notary";
  }

  return input.bodyParticipantRole ?? null;
};

const deriveGeolocationCaptureStage = (checkinKind: MeetingCheckinKind): GeolocationCaptureStage => {
  if (checkinKind === "proximity") {
    return "proximity_validation";
  }

  if (checkinKind === "meeting_start") {
    return "meeting_start";
  }

  if (checkinKind === "meeting_end") {
    return "meeting_end";
  }

  if (checkinKind === "identity") {
    return "checkin_confirmation";
  }

  return "checkin";
};

const syncDefaultMeetingParticipants = async (input: {
  meeting: MeetingRecord;
  ownerUserId: string;
  assignedNotaryUserId: string;
}) => {
  const existingParticipants = await listMeetingParticipants(input.meeting.id);
  const nextParticipants: MeetingParticipantRecord[] = [];

  const syncParticipant = async (participantRole: MeetingParticipantRole, userId: string) => {
    const existing = existingParticipants.find(
      (participant) => participant.participant_role === participantRole,
    );

    if (!existing) {
      nextParticipants.push(
        await createMeetingParticipant({
          meetingId: input.meeting.id,
          userId,
          participantRole,
          status: "expected",
          presenceRequired: true,
        }),
      );
      return;
    }

    if (existing.user_id !== userId) {
      nextParticipants.push(
        await updateMeetingParticipant(existing.id, {
          user_id: userId,
          status: "expected",
          arrived_at: null,
          departed_at: null,
        }),
      );
      return;
    }

    nextParticipants.push(existing);
  };

  await syncParticipant("member", input.ownerUserId);
  await syncParticipant("notary", input.assignedNotaryUserId);

  return nextParticipants.sort((left, right) => left.participant_role.localeCompare(right.participant_role));
};

const ensureNotaryCompletionReady = async (input: {
  requestId: string;
  requireMeetingCompleted?: boolean;
}) => {
  const meeting = await getMeetingByRequestId(input.requestId);
  if (!meeting) {
    throw new DocumentFinalizationConflictError(
      "Meeting must be started before notarial completion",
    );
  }

  if (input.requireMeetingCompleted && meeting.status !== "completed") {
    throw new DocumentFinalizationConflictError(
      "Meeting must be completed before final submission",
    );
  }

  if (meeting.same_place_status !== "passed") {
    throw new DocumentFinalizationConflictError(
      "Same-place evidence must pass before notarial completion",
    );
  }

  const identityVerifications = await listIdentityVerificationEvents(meeting.id);
  const verifiedIdentity = identityVerifications.find((event) => event.status === "verified");
  if (!verifiedIdentity) {
    throw new DocumentFinalizationConflictError(
      "Member identity must be verified before notarial completion",
    );
  }

  return {
    meeting,
    verifiedIdentity,
  };
};

const resolveMeetingActorContext = async (req: Request, requestId: string) => {
  const request = await getNotarizationRequestById(requestId);
  if (!request) {
    return { request: null, document: null, workflow: null, actorUserId: null };
  }

  const document = await getDocumentById(request.document_id);
  const workflow = await resolveWorkflowForRequest({
    requestId: request.id,
    workflowId: request.workflow_id,
  });
  const actorUserId = await resolveActorUserId(req);

  return {
    request,
    document,
    workflow,
    actorUserId,
  };
};

export const resolveCode = async (_req: Request, res: Response) => {
  const parsed = resolveCodeSchema.safeParse(_req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (!_req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const notaryId = await getOrCreateUserId(
    _req.user.id,
    _req.user.email,
    _req.user.role,
    _req.user.phone,
  );

  const codeRecord = await getNotarizationCodeByValue(parsed.data.code);
  if (!codeRecord) {
    await recordAccessCodeAttempt({
      attemptedByUserId: notaryId,
      attemptedCodeValue: parsed.data.code,
      result: "not_found",
      resultMessage: "Code not found",
      metadata: {
        source: "notary.resolve-code",
      },
    });

    return res.status(404).json({
      error: "not_found",
      message: "Code not found",
    });
  }

  const workflow = await resolveWorkflowForRequest({
    requestId: codeRecord.request_id,
    workflowId: codeRecord.workflow_id,
  });
  const latestCodeDelivery = await getLatestCodeDeliveryForCode(codeRecord.id);

  if (codeRecord.status !== "active" || codeRecord.consumed_at) {
    await recordAccessCodeAttempt({
      workflowId: workflow?.id ?? null,
      legacyRequestId: codeRecord.request_id,
      illuminotarizationCodeId: codeRecord.id,
      matchedCodeDeliveryId: latestCodeDelivery?.id ?? null,
      attemptedByUserId: notaryId,
      attemptedCodeValue: parsed.data.code,
      result: "already_consumed",
      resultMessage: "Code already consumed",
      metadata: {
        source: "notary.resolve-code",
      },
    });

    return res.status(409).json({
      error: "conflict",
      message: "Code already consumed",
    });
  }

  if (codeRecord.expires_at) {
    const expiresAt = new Date(codeRecord.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      await recordAccessCodeAttempt({
        workflowId: workflow?.id ?? null,
        legacyRequestId: codeRecord.request_id,
        illuminotarizationCodeId: codeRecord.id,
        matchedCodeDeliveryId: latestCodeDelivery?.id ?? null,
        attemptedByUserId: notaryId,
        attemptedCodeValue: parsed.data.code,
        result: "expired",
        resultMessage: "Code expired",
        metadata: {
          source: "notary.resolve-code",
        },
      });

      return res.status(400).json({
        error: "validation_error",
        message: "Code expired",
        details: [
          {
            path: "code",
            message: "Code expired",
          },
        ],
      });
    }
  }

  const request = await getNotarizationRequestById(codeRecord.request_id);
  if (!request) {
    await recordAccessCodeAttempt({
      workflowId: workflow?.id ?? null,
      legacyRequestId: codeRecord.request_id,
      illuminotarizationCodeId: codeRecord.id,
      matchedCodeDeliveryId: latestCodeDelivery?.id ?? null,
      attemptedByUserId: notaryId,
      attemptedCodeValue: parsed.data.code,
      result: "request_missing",
      resultMessage: "Notarization request not found",
      metadata: {
        source: "notary.resolve-code",
      },
    });

    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const requestWorkflow = workflow ??
    (await resolveWorkflowForRequest({
      requestId: request.id,
      workflowId: request.workflow_id,
    }));

  if (request.assigned_notary_id) {
    await recordAccessCodeAttempt({
      workflowId: requestWorkflow?.id ?? null,
      legacyRequestId: request.id,
      illuminotarizationCodeId: codeRecord.id,
      matchedCodeDeliveryId: latestCodeDelivery?.id ?? null,
      attemptedByUserId: notaryId,
      attemptedCodeValue: parsed.data.code,
      result: "already_assigned",
      resultMessage: "Request already assigned",
      metadata: {
        source: "notary.resolve-code",
        assignedNotaryUserId: request.assigned_notary_id,
      },
    });

    return res.status(409).json({
      error: "conflict",
      message: "Request already assigned",
    });
  }

  if (request.status !== "pending") {
    await recordAccessCodeAttempt({
      workflowId: requestWorkflow?.id ?? null,
      legacyRequestId: request.id,
      illuminotarizationCodeId: codeRecord.id,
      matchedCodeDeliveryId: latestCodeDelivery?.id ?? null,
      attemptedByUserId: notaryId,
      attemptedCodeValue: parsed.data.code,
      result: "request_ineligible",
      resultMessage: "Request is not eligible for review",
      metadata: {
        source: "notary.resolve-code",
        requestStatus: request.status,
      },
    });

    return res.status(409).json({
      error: "conflict",
      message: "Request is not eligible for review",
    });
  }

  if (
    requestWorkflow?.selected_notary_user_id &&
    requestWorkflow.selected_notary_user_id !== notaryId
  ) {
    await recordAccessCodeAttempt({
      workflowId: requestWorkflow.id,
      legacyRequestId: request.id,
      illuminotarizationCodeId: codeRecord.id,
      matchedCodeDeliveryId: latestCodeDelivery?.id ?? null,
      attemptedByUserId: notaryId,
      attemptedCodeValue: parsed.data.code,
      result: "notary_mismatch",
      resultMessage: "Request is reserved for a different selected notary",
      metadata: {
        source: "notary.resolve-code",
      },
    });

    return res.status(409).json({
      error: "conflict",
      message: "Request is reserved for a different selected notary",
    });
  }

  const consumedAt = new Date().toISOString();
  const updatedCode = await updateNotarizationCode(codeRecord.id, {
    status: "consumed",
    consumed_at: consumedAt,
  });
  const updatedRequest = await updateNotarizationRequest(request.id, {
    assigned_notary_id: notaryId,
    status: "in_review",
  });
  await recordAccessCodeAttempt({
    workflowId: requestWorkflow?.id ?? null,
    legacyRequestId: updatedRequest.id,
    illuminotarizationCodeId: updatedCode.id,
    matchedCodeDeliveryId: latestCodeDelivery?.id ?? null,
    attemptedByUserId: notaryId,
    attemptedCodeValue: parsed.data.code,
    result: "matched",
    resultMessage: "Code resolved successfully",
    metadata: {
      source: "notary.resolve-code",
    },
  });

  let workflowAfterResolve = requestWorkflow;
  if (requestWorkflow) {
    await markCodeDeliveriesConsumed({
      illuminotarizationCodeId: updatedCode.id,
      consumedAt,
    });

    await upsertIlluminotarizationWorkflowAssignment({
      workflowId: requestWorkflow.id,
      assignmentKind: "assigned_notary",
      userId: notaryId,
      assignedByUserId: notaryId,
      assignmentSource: "code_resolution",
      metadata: {
        requestId: updatedRequest.id,
        codeId: updatedCode.id,
      },
    });

    workflowAfterResolve = await transitionIlluminotarizationWorkflowStatus({
      workflowId: requestWorkflow.id,
      nextStatus: "in_review",
      changedByUserId: notaryId,
      changeSource: "code_resolution",
      changeReason: "Notary resolved illuminotarization code and claimed the request",
      legacyRequestId: updatedRequest.id,
      metadata: {
        codeId: updatedCode.id,
      },
      workflowUpdates: {
        assignedNotaryUserId: notaryId,
        currentLegacyRequestId: updatedRequest.id,
        reviewStartedAt: consumedAt,
      },
    });
  }

  const actorContext = buildAuditActorContext(_req);

  await recordAuditEvent({
    ...actorContext,
    entityType: "illuminotarization_code",
    entityId: updatedCode.id,
    action: "notary.code_resolved",
    metadata: {
      code_id: updatedCode.id,
      request_id: updatedRequest.id,
      document_id: updatedRequest.document_id,
      workflow_id: requestWorkflow?.id ?? null,
      notary_id: notaryId,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "illuminotarization_code",
    entityId: updatedCode.id,
    action: "system.code_consumed",
    metadata: {
      code_id: updatedCode.id,
      request_id: updatedRequest.id,
      workflow_id: requestWorkflow?.id ?? null,
      consumed_at: consumedAt,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "notarization_request",
    entityId: updatedRequest.id,
    action: "system.request_assigned_to_notary",
    metadata: {
      request_id: updatedRequest.id,
      document_id: updatedRequest.document_id,
      workflow_id: requestWorkflow?.id ?? null,
      notary_id: notaryId,
    },
  });

  await queueNotaryRequestClaimedNotification({
    documentId: updatedRequest.document_id,
    requestId: updatedRequest.id,
    notaryUserId: notaryId,
    requestedBySupabaseUserId: _req.user?.id,
  });

  res.status(200).json({
    request: {
      id: updatedRequest.id,
      documentId: updatedRequest.document_id,
      workflowId: updatedRequest.workflow_id,
      status: updatedRequest.status,
    },
    code: {
      id: updatedCode.id,
      code: updatedCode.code,
      status: updatedCode.status,
      expiresAt: updatedCode.expires_at,
    },
    workflow: buildIlluminotarizationWorkflowResponse(workflowAfterResolve),
  });
};

export const resendCode = async (req: Request, res: Response) => {
  const parsed = codeRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const request = await getNotarizationRequestById(parsed.data.requestId);
  if (!request) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  if (!ensureRequestAwaitingCodeResolution(request)) {
    return res.status(409).json({
      error: "conflict",
      message: "Request is not eligible for code resend",
    });
  }

  const currentCode = await getLatestNotarizationCodeForRequest(request.id);
  if (!currentCode) {
    return res.status(404).json({
      error: "not_found",
      message: "Active code not found for notarization request",
    });
  }

  if (currentCode.consumed_at || currentCode.status === "consumed") {
    return res.status(409).json({
      error: "conflict",
      message: "Code has already been consumed",
    });
  }

  if (currentCode.status !== "active" || isExpiredTimestamp(currentCode.expires_at)) {
    return res.status(409).json({
      error: "conflict",
      message: "Code has expired. Regenerate a new code instead.",
    });
  }

  const document = await getDocumentById(request.document_id);
  if (!document) {
    return res.status(404).json({
      error: "not_found",
      message: "Document not found",
    });
  }

  const workflow = await resolveWorkflowForRequest({
    requestId: request.id,
    workflowId: request.workflow_id,
  });
  const previousDelivery = workflow
    ? await getLatestCodeDeliveryForRequest(request.id)
    : null;
  const deliveredAt = new Date().toISOString();

  const notificationJob = await queueNotaryNextStepNotification({
    documentId: document.id,
    requestId: request.id,
    codeId: currentCode.id,
    codeValue: currentCode.code,
    expiresAt: currentCode.expires_at,
    deliveryReason: "resent",
    requestedBySupabaseUserId: req.user?.id,
  });

  let workflowAfterResend = workflow;
  if (workflow) {
    await createCodeDeliveryRecord({
      workflowId: workflow.id,
      legacyRequestId: request.id,
      illuminotarizationCodeId: currentCode.id,
      notificationJobId: notificationJob?.jobId ?? null,
      previousCodeDeliveryId: previousDelivery?.id ?? null,
      recipientUserId: document.owner_id,
      channel: "email",
      deliveryMethod: "notification_outbox",
      deliveryReason: "resent",
      status: "delivered",
      codeValueSnapshot: currentCode.code,
      expiresAt: currentCode.expires_at,
      deliveredAt,
      metadata: {
        source: "notary.resend-code",
      },
    });

    workflowAfterResend = await transitionIlluminotarizationWorkflowStatus({
      workflowId: workflow.id,
      nextStatus: "code_delivered",
      changedByUserId: null,
      changeSource: "code_delivery",
      changeReason: "Illuminotarization code resent to document owner",
      legacyRequestId: request.id,
      metadata: {
        codeId: currentCode.id,
        deliveryReason: "resent",
      },
      workflowUpdates: {
        currentLegacyRequestId: request.id,
      },
    });
  }

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "illuminotarization_code",
    entityId: currentCode.id,
    action: "system.code_delivered",
    metadata: {
      code_id: currentCode.id,
      request_id: request.id,
      workflow_id: workflow?.id ?? null,
      delivery_method: "notification_outbox_email",
      delivery_reason: "resent",
      delivered_at: deliveredAt,
    },
  });

  res.status(200).json({
    code: currentCode.code,
    status: "resent",
    expiresAt: currentCode.expires_at,
    workflow: buildIlluminotarizationWorkflowResponse(workflowAfterResend),
  });
};

export const regenerateCode = async (req: Request, res: Response) => {
  const parsed = codeRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const request = await getNotarizationRequestById(parsed.data.requestId);
  if (!request) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  if (!ensureRequestAwaitingCodeResolution(request)) {
    return res.status(409).json({
      error: "conflict",
      message: "Request is not eligible for code regeneration",
    });
  }

  const currentCode = await getLatestNotarizationCodeForRequest(request.id);
  const workflow = await resolveWorkflowForRequest({
    requestId: request.id,
    workflowId: request.workflow_id,
  });
  if (
    currentCode &&
    !currentCode.consumed_at &&
    (currentCode.status === "active" ||
      currentCode.status === "resent" ||
      currentCode.status === "regenerated")
  ) {
    await updateNotarizationCode(currentCode.id, {
      status: "revoked",
    });

    if (workflow) {
      await invalidateOpenCodeDeliveriesForRequest({
        legacyRequestId: request.id,
        invalidatedAt: new Date().toISOString(),
        status: "revoked",
      });
    }
  }

  const expiresAt = buildNotarizationCodeExpiry();
  const regeneratedCode = await createNotarizationCode({
    requestId: request.id,
    workflowId: workflow?.id ?? request.workflow_id,
    code: `NTR-${randomUUID().slice(0, 8).toUpperCase()}`,
    expiresAt,
  });

  const document = await getDocumentById(request.document_id);
  if (!document) {
    return res.status(404).json({
      error: "not_found",
      message: "Document not found",
    });
  }

  const previousDelivery = workflow
    ? await getLatestCodeDeliveryForRequest(request.id)
    : null;
  const deliveredAt = new Date().toISOString();

  const actorContext = buildAuditActorContext(req);
  await recordAuditEvent({
    ...actorContext,
    entityType: "illuminotarization_code",
    entityId: regeneratedCode.id,
    action: "system.code_generated",
    metadata: {
      code_id: regeneratedCode.id,
      request_id: request.id,
      workflow_id: workflow?.id ?? null,
      previous_code_id: currentCode?.id ?? null,
      expires_at: regeneratedCode.expires_at,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "illuminotarization_code",
    entityId: regeneratedCode.id,
    action: "system.code_delivered",
    metadata: {
      code_id: regeneratedCode.id,
      request_id: request.id,
      workflow_id: workflow?.id ?? null,
      previous_code_id: currentCode?.id ?? null,
      delivery_method: "notification_outbox_email",
      delivery_reason: "regenerated",
      delivered_at: deliveredAt,
    },
  });

  const notificationJob = await queueNotaryNextStepNotification({
    documentId: document.id,
    requestId: request.id,
    codeId: regeneratedCode.id,
    codeValue: regeneratedCode.code,
    expiresAt: regeneratedCode.expires_at,
    deliveryReason: "regenerated",
    requestedBySupabaseUserId: req.user?.id,
  });

  let workflowAfterRegenerate = workflow;
  if (workflow) {
    await createCodeDeliveryRecord({
      workflowId: workflow.id,
      legacyRequestId: request.id,
      illuminotarizationCodeId: regeneratedCode.id,
      notificationJobId: notificationJob?.jobId ?? null,
      previousCodeDeliveryId: previousDelivery?.id ?? null,
      recipientUserId: document.owner_id,
      channel: "email",
      deliveryMethod: "notification_outbox",
      deliveryReason: "regenerated",
      status: "delivered",
      codeValueSnapshot: regeneratedCode.code,
      expiresAt: regeneratedCode.expires_at,
      deliveredAt,
      metadata: {
        source: "notary.regenerate-code",
        previousCodeId: currentCode?.id ?? null,
      },
    });

    workflowAfterRegenerate = await transitionIlluminotarizationWorkflowStatus({
      workflowId: workflow.id,
      nextStatus: "code_delivered",
      changedByUserId: null,
      changeSource: "code_delivery",
      changeReason: "Illuminotarization code regenerated and delivered to document owner",
      legacyRequestId: request.id,
      metadata: {
        codeId: regeneratedCode.id,
        previousCodeId: currentCode?.id ?? null,
        deliveryReason: "regenerated",
      },
      workflowUpdates: {
        currentLegacyRequestId: request.id,
        lastCodeGeneratedAt: regeneratedCode.created_at,
      },
    });
  }

  res.status(200).json({
    code: regeneratedCode.code,
    status: "regenerated",
    expiresAt: regeneratedCode.expires_at,
    workflow: buildIlluminotarizationWorkflowResponse(workflowAfterRegenerate),
  });
};

export const reviewRequestDecision = async (req: Request, res: Response) => {
  const parsed = reviewDecisionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const request = await getNotarizationRequestById(requestId);
  if (!request) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const workflow = await resolveWorkflowForRequest({
    requestId: request.id,
    workflowId: request.workflow_id,
  });
  if (!workflow) {
    return res.status(409).json({
      error: "conflict",
      message: "Notarization workflow is not available for this request",
    });
  }

  if (!isRequestReadyForReviewDecision(request.status)) {
    return res.status(409).json({
      error: "conflict",
      message: "Request is not eligible for a review decision",
    });
  }

  if (!isWorkflowReadyForReviewDecision(workflow.status)) {
    return res.status(409).json({
      error: "conflict",
      message: "Workflow is not eligible for a review decision",
    });
  }

  const actorUserId = await resolveActorUserId(req);
  const assignedNotaryId = request.assigned_notary_id ?? workflow.assigned_notary_user_id;

  if (req.user?.role === "notary") {
    if (!actorUserId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Missing user context",
      });
    }

    if (!assignedNotaryId || assignedNotaryId !== actorUserId) {
      return res.status(403).json({
        error: "forbidden",
        message: "Request is assigned to a different illuminotary",
      });
    }
  }

  const decidedByUserId = actorUserId ?? assignedNotaryId;
  if (!decidedByUserId) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned before a review decision can be recorded",
    });
  }

  const decidedAt = new Date().toISOString();
  const summary = parsed.data.summary?.trim() || null;
  const decisionNotes = parsed.data.decisionNotes?.trim() || null;
  const decision = await createIlluminotaryReviewDecisionRecord({
    workflowId: workflow.id,
    legacyRequestId: request.id,
    decidedByUserId,
    decision: parsed.data.decision,
    summary,
    decisionNotes,
    decidedAt,
    metadata: {
      source: "notary.review-decision",
    },
  });

  const requestUpdates: {
    workflow_id?: string;
    status?: "pending" | "in_review" | "completed" | "rejected";
  } = {};
  if (request.workflow_id !== workflow.id) {
    requestUpdates.workflow_id = workflow.id;
  }
  if (parsed.data.decision === "rejected") {
    requestUpdates.status = "rejected";
  }

  const updatedRequest = Object.keys(requestUpdates).length
    ? await updateNotarizationRequest(request.id, requestUpdates)
    : request;

  const updatedWorkflow = await transitionIlluminotarizationWorkflowStatus({
    workflowId: workflow.id,
    nextStatus: parsed.data.decision,
    changedByUserId: actorUserId,
    changeSource: "review_decision",
    changeReason: reviewDecisionReasonMap[parsed.data.decision],
    legacyRequestId: request.id,
    metadata: {
      requestId: request.id,
      decisionId: decision.id,
      summary,
    },
    workflowUpdates: {
      assignedNotaryUserId: assignedNotaryId,
      currentLegacyRequestId: request.id,
    },
  });

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "notarization_request",
    entityId: updatedRequest.id,
    action: reviewDecisionAuditActionMap[parsed.data.decision],
    metadata: {
      request_id: updatedRequest.id,
      document_id: updatedRequest.document_id,
      workflow_id: workflow.id,
      decision_id: decision.id,
      decided_by_user_id: decidedByUserId,
      decision: parsed.data.decision,
      summary,
    },
  });

  if (assignedNotaryId) {
    if (parsed.data.decision === "approved") {
      const contactExchangeNotification = await queueNotaryApprovalReceivedNotification({
        documentId: updatedRequest.document_id,
        requestId: updatedRequest.id,
        notaryUserId: assignedNotaryId,
        summary,
        requestedBySupabaseUserId: req.user?.id,
      });

      const notificationJobIds = Array.from(
        new Set(
          [
            ...(contactExchangeNotification?.jobIds ?? []),
            contactExchangeNotification?.jobId ?? null,
          ].filter((jobId): jobId is string => Boolean(jobId && jobId.trim())),
        ),
      );

      if (notificationJobIds.length > 0) {
        try {
          await runDueNotificationJobs({
            limit: notificationJobIds.length,
            notificationJobIds,
          });
        } catch (error) {
          console.warn("Approval contact exchange inline notification processing failed", {
            requestId: updatedRequest.id,
            notificationJobIds,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else if (parsed.data.decision === "changes_requested") {
      await queueNotaryChangesRequestedNotification({
        documentId: updatedRequest.document_id,
        requestId: updatedRequest.id,
        notaryUserId: assignedNotaryId,
        summary,
        requestedBySupabaseUserId: req.user?.id,
      });
    }
  }

  res.status(200).json({
    request: {
      id: updatedRequest.id,
      documentId: updatedRequest.document_id,
      workflowId: workflow.id,
      status: updatedRequest.status,
    },
    decision: {
      id: decision.id,
      decision: decision.decision,
      summary: decision.summary,
      decisionNotes: decision.decision_notes,
      decidedAt: decision.decided_at,
      decidedByUserId: decision.decided_by_user_id,
    },
    workflow: buildIlluminotarizationWorkflowResponse(updatedWorkflow),
  });
};

export const proposeMeeting = async (req: Request, res: Response) => {
  const parsed = meetingProposalSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before meeting proposal",
    });
  }

  if (
    !ensureMeetingRequestEligible({
      requestStatus: request.status,
      workflowStatus: workflow?.status ?? null,
    })
  ) {
    return res.status(409).json({
      error: "conflict",
      message: "Request is not eligible for meeting proposal",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Meeting proposal is not allowed for this request",
    });
  }

  const proposedSlots = parsed.data.proposedSlots;
  const existingMeeting = await getMeetingByRequestId(request.id);
  const meetingStatus: MeetingStatus = existingMeeting ? "rescheduled" : "scheduled";
  const nextMetadata = {
    ...(existingMeeting?.metadata ?? {}),
    proposalState: "proposed",
    proposedSlots,
    lastProposedByRole: req.user?.role ?? null,
    lastProposedByUserId: actorUserId,
  };

  const meeting = existingMeeting
    ? await updateMeeting(existingMeeting.id, {
        workflow_id: workflow?.id ?? request.workflow_id,
        scheduled_at: proposedSlots[0] ?? existingMeeting.scheduled_at,
        timezone: parsed.data.timezone,
        location: parsed.data.location?.trim() ?? null,
        status: meetingStatus,
        metadata: nextMetadata,
      })
    : await createMeeting({
        requestId: request.id,
        workflowId: workflow?.id ?? request.workflow_id,
        scheduledAt: proposedSlots[0] ?? null,
        timezone: parsed.data.timezone,
        location: parsed.data.location?.trim() ?? null,
        status: meetingStatus,
        samePlaceRequired: true,
        samePlaceStatus: "not_started",
        metadata: nextMetadata,
      });

  const participants = await syncDefaultMeetingParticipants({
    meeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "notarization_request",
    entityId: request.id,
    action:
      req.user?.role === "member"
        ? "member.meeting_time_proposed"
        : "notary.meeting_time_proposed",
    metadata: {
      request_id: request.id,
      document_id: request.document_id,
      workflow_id: workflow?.id ?? request.workflow_id,
      meeting_id: meeting.id,
      proposed_slots: proposedSlots,
      timezone: parsed.data.timezone,
      location: parsed.data.location?.trim() ?? null,
    },
  });

  res.status(200).json({
    meeting: buildMeetingResponse(meeting, participants),
  });
};

export const confirmMeeting = async (req: Request, res: Response) => {
  const parsed = meetingConfirmSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const meeting = await getMeetingByRequestId(request.id);
  if (!meeting) {
    return res.status(404).json({
      error: "not_found",
      message: "Meeting not found for this request",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before meeting confirmation",
    });
  }

  if (!isMeetingLifecycleEditable(meeting.status)) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting can no longer be confirmed",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Meeting confirmation is not allowed for this request",
    });
  }

  const confirmedAt = new Date().toISOString();
  const nextMetadata: Record<string, unknown> = {
    ...meeting.metadata,
    proposalState: "confirmed",
    lastConfirmedByRole: req.user?.role ?? null,
    lastConfirmedByUserId: actorUserId,
  };

  if (req.user?.role === "member") {
    nextMetadata.memberConfirmedAt = confirmedAt;
    nextMetadata.memberConfirmedByUserId = actorUserId;
  }

  if (req.user?.role === "notary") {
    nextMetadata.notaryConfirmedAt = confirmedAt;
    nextMetadata.notaryConfirmedByUserId = actorUserId;
  }

  const updatedMeeting = await updateMeeting(meeting.id, {
    workflow_id: workflow?.id ?? request.workflow_id,
    scheduled_at: parsed.data.scheduledAt,
    timezone: parsed.data.timezone,
    location: parsed.data.location?.trim() ?? null,
    status: "scheduled",
    metadata: nextMetadata,
  });

  const participants = await syncDefaultMeetingParticipants({
    meeting: updatedMeeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });

  let responseParticipants = participants;
  if (req.user?.role === "member" || req.user?.role === "notary") {
    const participant = participants.find((item) => item.participant_role === req.user?.role);
    if (participant && ["expected", "invited"].includes(participant.status)) {
      const confirmedParticipant = await updateMeetingParticipant(participant.id, {
        status: "confirmed",
      });
      responseParticipants = participants.map((item) => {
        return item.id === confirmedParticipant.id ? confirmedParticipant : item;
      });
    }
  }

  const auditMetadata = {
    request_id: request.id,
    document_id: request.document_id,
    workflow_id: workflow?.id ?? request.workflow_id,
    meeting_id: updatedMeeting.id,
    scheduled_at: updatedMeeting.scheduled_at,
    meeting_timezone: updatedMeeting.timezone,
    meeting_location: updatedMeeting.location,
  };

  if (req.user?.role === "member") {
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "notarization_request",
      entityId: request.id,
      action: "member.meeting_time_confirmed",
      metadata: auditMetadata,
    });
  } else if (req.user?.role === "notary") {
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "notarization_request",
      entityId: request.id,
      action: "notary.meeting_time_confirmed",
      metadata: auditMetadata,
    });
  }

  if (req.user?.role !== "member") {
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "notarization_request",
      entityId: request.id,
      action: "notary.meeting_scheduled",
      metadata: {
        ...auditMetadata,
        meeting_type: "in_person",
        member_confirmed_at:
          typeof nextMetadata.memberConfirmedAt === "string" ? nextMetadata.memberConfirmedAt : null,
        notary_confirmed_at:
          typeof nextMetadata.notaryConfirmedAt === "string" ? nextMetadata.notaryConfirmedAt : null,
      },
    });

    await queueMeetingScheduledConfirmationNotification({
      documentId: request.document_id,
      requestId: request.id,
      scheduledAt: parsed.data.scheduledAt,
      meetingLocation: parsed.data.location?.trim() ?? updatedMeeting.location,
      requestedBySupabaseUserId: req.user?.id,
    });
  }

  res.status(200).json({
    meeting: buildMeetingResponse(updatedMeeting, responseParticipants),
  });
};

export const rescheduleMeeting = async (req: Request, res: Response) => {
  const parsed = meetingRescheduleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const meeting = await getMeetingByRequestId(request.id);
  if (!meeting) {
    return res.status(404).json({
      error: "not_found",
      message: "Meeting not found for this request",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before meeting reschedule",
    });
  }

  if (!isMeetingLifecycleEditable(meeting.status)) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting can no longer be rescheduled",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Meeting reschedule is not allowed for this request",
    });
  }

  const {
    memberConfirmedAt: _memberConfirmedAt,
    memberConfirmedByUserId: _memberConfirmedByUserId,
    notaryConfirmedAt: _notaryConfirmedAt,
    notaryConfirmedByUserId: _notaryConfirmedByUserId,
    ...remainingMetadata
  } = meeting.metadata;
  const updatedMeeting = await updateMeeting(meeting.id, {
    workflow_id: workflow?.id ?? request.workflow_id,
    scheduled_at: parsed.data.scheduledAt,
    timezone: parsed.data.timezone,
    location: parsed.data.location?.trim() ?? null,
    status: "rescheduled",
    metadata: {
      ...remainingMetadata,
      proposalState: "rescheduled",
      proposedSlots: [parsed.data.scheduledAt],
      lastRescheduledByUserId: actorUserId,
      lastRescheduleReason: parsed.data.rescheduleReason?.trim() ?? null,
    },
  });

  const participants = await syncDefaultMeetingParticipants({
    meeting: updatedMeeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });

  let responseParticipants = participants;
  const confirmedParticipants = participants.filter((participant) => participant.status === "confirmed");
  if (confirmedParticipants.length > 0) {
    const updatedParticipants = await Promise.all(
      confirmedParticipants.map(async (participant) => {
        return updateMeetingParticipant(participant.id, {
          status: "expected",
        });
      }),
    );
    responseParticipants = participants.map((participant) => {
      return updatedParticipants.find((item) => item.id === participant.id) ?? participant;
    });
  }

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "notarization_request",
    entityId: request.id,
    action: "notary.meeting_rescheduled",
    metadata: {
      request_id: request.id,
      document_id: request.document_id,
      workflow_id: workflow?.id ?? request.workflow_id,
      meeting_id: updatedMeeting.id,
      previous_scheduled_at: meeting.scheduled_at,
      scheduled_at: updatedMeeting.scheduled_at,
      meeting_timezone: updatedMeeting.timezone,
      meeting_location: updatedMeeting.location,
      reschedule_reason: parsed.data.rescheduleReason?.trim() ?? null,
    },
  });

  await queueMeetingScheduledConfirmationNotification({
    documentId: request.document_id,
    requestId: request.id,
    scheduledAt: parsed.data.scheduledAt,
    meetingLocation: parsed.data.location?.trim() ?? updatedMeeting.location,
    requestedBySupabaseUserId: req.user?.id,
  });

  res.status(200).json({
    meeting: buildMeetingResponse(updatedMeeting, responseParticipants),
  });
};

export const cancelMeeting = async (req: Request, res: Response) => {
  const parsed = meetingCancelSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const meeting = await getMeetingByRequestId(request.id);
  if (!meeting) {
    return res.status(404).json({
      error: "not_found",
      message: "Meeting not found for this request",
    });
  }

  if (!isMeetingLifecycleEditable(meeting.status)) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting can no longer be cancelled",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before meeting cancellation",
    });
  }

  if (
    req.user?.role === "member" && parsed.data.cancelledBy !== "member"
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Member can only cancel as the member party",
    });
  }

  if (
    req.user?.role === "notary" && parsed.data.cancelledBy !== "notary"
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Illuminotary can only cancel as the notary party",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Meeting cancellation is not allowed for this request",
    });
  }

  const cancelledAt = new Date().toISOString();
  const updatedMeeting = await updateMeeting(meeting.id, {
    status: "cancelled",
    metadata: {
      ...meeting.metadata,
      proposalState: "cancelled",
      cancelledBy: parsed.data.cancelledBy,
      cancelledAt,
      cancellationReason: parsed.data.cancellationReason?.trim() ?? null,
    },
  });

  const participants = await syncDefaultMeetingParticipants({
    meeting: updatedMeeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });

  const updatedParticipants = await Promise.all(
    participants.map(async (participant) => {
      if (["completed", "no_show", "canceled"].includes(participant.status)) {
        return participant;
      }

      return updateMeetingParticipant(participant.id, {
        status: "canceled",
      });
    }),
  );

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "notarization_request",
    entityId: request.id,
    action: "notary.meeting_cancelled",
    metadata: {
      request_id: request.id,
      document_id: request.document_id,
      workflow_id: workflow?.id ?? request.workflow_id,
      meeting_id: updatedMeeting.id,
      scheduled_at: meeting.scheduled_at,
      cancelled_by: parsed.data.cancelledBy,
      cancelled_at: cancelledAt,
      cancellation_reason: parsed.data.cancellationReason?.trim() ?? null,
    },
  });

  res.status(200).json({
    meeting: buildMeetingResponse(updatedMeeting, updatedParticipants),
  });
};

export const recordMeetingNoShow = async (req: Request, res: Response) => {
  const parsed = meetingNoShowSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const meeting = await getMeetingByRequestId(request.id);
  if (!meeting) {
    return res.status(404).json({
      error: "not_found",
      message: "Meeting not found for this request",
    });
  }

  if (!isMeetingLifecycleEditable(meeting.status)) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting can no longer record a no-show",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before recording a no-show",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Meeting no-show is not allowed for this request",
    });
  }

  const participants = await syncDefaultMeetingParticipants({
    meeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });
  const noShowParticipant = participants.find(
    (participant) => participant.participant_role === parsed.data.noShowParty,
  );

  if (!noShowParticipant) {
    return res.status(409).json({
      error: "conflict",
      message: "No-show participant could not be resolved",
    });
  }

  const recordedAt = parsed.data.recordedAt ?? new Date().toISOString();
  const updatedMeeting = await updateMeeting(meeting.id, {
    status: "no_show",
    metadata: {
      ...meeting.metadata,
      noShowParty: parsed.data.noShowParty,
      noShowRecordedAt: recordedAt,
      noShowNotes: parsed.data.notes?.trim() ?? null,
    },
  });
  const updatedParticipant = await updateMeetingParticipant(noShowParticipant.id, {
    status: "no_show",
  });

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "notarization_request",
    entityId: request.id,
    action: "system.meeting_no_show_recorded",
    metadata: {
      request_id: request.id,
      document_id: request.document_id,
      workflow_id: workflow?.id ?? request.workflow_id,
      meeting_id: updatedMeeting.id,
      scheduled_at: meeting.scheduled_at,
      no_show_party: parsed.data.noShowParty,
      recorded_at: recordedAt,
      notes: parsed.data.notes?.trim() ?? null,
    },
  });

  res.status(200).json({
    meeting: buildMeetingResponse(updatedMeeting, participants.map((participant) => {
      return participant.id === updatedParticipant.id ? updatedParticipant : participant;
    })),
  });
};

export const startInPersonSession = async (req: Request, res: Response) => {
  const parsed = startInPersonSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before starting the session",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Starting the in-person session is not allowed for this request",
    });
  }

  const existingMeeting = await getMeetingByRequestId(request.id);
  if (isMeetingClosedStatus(existingMeeting?.status ?? null)) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting can no longer be started",
    });
  }

  if (!existingMeeting && request.status !== "approved" && workflow?.status !== "approved") {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be approved before starting the in-person session",
    });
  }

  const participantRole = inferParticipantRoleFromRequestUser({
    role: req.user?.role,
    bodyParticipantRole: parsed.data.participantRole,
  });

  if (participantRole !== "notary") {
    return res.status(400).json({
      error: "validation_error",
      message: "Only the assigned illuminotary can start the in-person session",
    });
  }

  const recordedAt = parsed.data.recordedAt ?? new Date().toISOString();
  const meeting = existingMeeting ?? await createMeeting({
    requestId: request.id,
    workflowId: workflow?.id ?? request.workflow_id,
    scheduledAt: recordedAt,
    timezone: null,
    location: null,
    status: "scheduled",
    samePlaceRequired: true,
    samePlaceStatus: "not_started",
    metadata: {
      createdFor: "in_person_session_start",
      contactExchangeCompleted: true,
      createdAt: recordedAt,
    },
  });

  const participants = await syncDefaultMeetingParticipants({
    meeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });
  const participant = participants.find((item) => item.participant_role === "notary");

  if (!participant) {
    return res.status(409).json({
      error: "conflict",
      message: "Notary meeting participant could not be resolved",
    });
  }

  const nextParticipant = await updateMeetingParticipant(participant.id, {
    status: "checked_in",
    arrived_at: participant.arrived_at ?? recordedAt,
  });

  const checkin = await createMeetingCheckin({
    meetingId: meeting.id,
    meetingParticipantId: participant.id,
    recordedByUserId: actorUserId,
    checkinKind: "meeting_start",
    recordedAt,
    notes: parsed.data.notes?.trim() ?? null,
    metadata: {
      requestId: request.id,
      actorRole: req.user?.role ?? null,
    },
  });

  let geolocation: GeolocationSampleRecord | null = null;
  if (parsed.data.geolocation) {
    geolocation = await createGeolocationSample({
      meetingId: meeting.id,
      meetingParticipantId: participant.id,
      meetingCheckinId: checkin.id,
      capturedByUserId: actorUserId,
      sampleKind: parsed.data.geolocation.sampleKind as GeolocationSampleKind | undefined,
      captureStage:
        (parsed.data.geolocation.captureStage as GeolocationCaptureStage | undefined) ??
        "meeting_start",
      latitude: parsed.data.geolocation.latitude,
      longitude: parsed.data.geolocation.longitude,
      accuracyMeters: parsed.data.geolocation.accuracyMeters,
      altitudeMeters: parsed.data.geolocation.altitudeMeters,
      capturedAt: recordedAt,
      metadata: {
        requestId: request.id,
      },
    });
  }

  const refreshedMeeting = await updateMeeting(meeting.id, {
    status: "in_progress",
    ...(geolocation && (!meeting.same_place_status || meeting.same_place_status === "not_started")
      ? { same_place_status: "pending" as const }
      : {}),
    metadata: {
      ...meeting.metadata,
      lastCheckinAt: recordedAt,
      startedAt: recordedAt,
    },
  });

  const sessionNotification = await queueInPersonSessionStartedNotification({
    documentId: document.id,
    requestId: request.id,
    notaryUserId: request.assigned_notary_id,
    requestedBySupabaseUserId: req.user?.id,
  });

  if (sessionNotification?.jobId) {
    try {
      await runDueNotificationJobs({
        limit: 1,
        notificationJobIds: [sessionNotification.jobId],
      });
    } catch (error) {
      console.warn("In-person session start inline notification processing failed", {
        requestId: request.id,
        notificationJobId: sessionNotification.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "notarization_request",
    entityId: request.id,
    action: "notary.meeting_started",
    metadata: {
      request_id: request.id,
      document_id: request.document_id,
      workflow_id: workflow?.id ?? request.workflow_id,
      meeting_id: meeting.id,
      meeting_checkin_id: checkin.id,
      participant_role: participantRole,
    },
  });

  res.status(existingMeeting ? 200 : 201).json({
    meeting: buildMeetingResponse(refreshedMeeting, [
      ...participants.filter((item) => item.id !== nextParticipant.id),
      nextParticipant,
    ]),
    participant: {
      id: nextParticipant.id,
      userId: nextParticipant.user_id,
      participantRole: nextParticipant.participant_role,
      status: nextParticipant.status,
      arrivedAt: nextParticipant.arrived_at,
      departedAt: nextParticipant.departed_at,
    },
    checkin: buildMeetingCheckinResponse(checkin, nextParticipant, geolocation),
  });
};

export const recordMeetingCheckin = async (req: Request, res: Response) => {
  const parsed = meetingCheckinSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const meeting = await getMeetingByRequestId(request.id);
  if (!meeting) {
    return res.status(404).json({
      error: "not_found",
      message: "Meeting not found for this request",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before check-in",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Check-in is not allowed for this request",
    });
  }

  const participantRole = inferParticipantRoleFromRequestUser({
    role: req.user?.role,
    bodyParticipantRole: parsed.data.participantRole,
  });

  if (!participantRole) {
    return res.status(400).json({
      error: "validation_error",
      message: "Participant role is required and must match the authenticated actor",
    });
  }

  if (
    req.user?.role === "member" &&
    ["identity", "meeting_start", "meeting_end"].includes(parsed.data.checkinKind)
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Member cannot record that check-in type",
    });
  }

  if (req.user?.role === "notary" && participantRole === "member" && parsed.data.geolocation) {
    return res.status(403).json({
      error: "forbidden",
      message: "Member geolocation check-in must be captured from the member account",
    });
  }

  const participants = await syncDefaultMeetingParticipants({
    meeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });
  const participant = participants.find((item) => item.participant_role === participantRole);

  if (!participant) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting participant could not be resolved",
    });
  }

  const recordedAt = parsed.data.recordedAt ?? new Date().toISOString();
  const nextParticipant = await updateMeetingParticipant(participant.id, {
    status:
      parsed.data.checkinKind === "meeting_end"
        ? "completed"
        : "checked_in",
    arrived_at:
      parsed.data.checkinKind === "arrival" || !participant.arrived_at
        ? recordedAt
        : participant.arrived_at,
    departed_at:
      parsed.data.checkinKind === "meeting_end" ? recordedAt : participant.departed_at,
  });

  const checkin = await createMeetingCheckin({
    meetingId: meeting.id,
    meetingParticipantId: participant.id,
    recordedByUserId: actorUserId,
    checkinKind: parsed.data.checkinKind,
    recordedAt,
    notes: parsed.data.notes?.trim() ?? null,
    metadata: {
      requestId: request.id,
      actorRole: req.user?.role ?? null,
    },
  });

  let geolocation: GeolocationSampleRecord | null = null;
  if (parsed.data.geolocation) {
    geolocation = await createGeolocationSample({
      meetingId: meeting.id,
      meetingParticipantId: participant.id,
      meetingCheckinId: checkin.id,
      capturedByUserId: actorUserId,
      sampleKind: parsed.data.geolocation.sampleKind as GeolocationSampleKind | undefined,
      captureStage:
        (parsed.data.geolocation.captureStage as GeolocationCaptureStage | undefined) ??
        deriveGeolocationCaptureStage(parsed.data.checkinKind),
      latitude: parsed.data.geolocation.latitude,
      longitude: parsed.data.geolocation.longitude,
      accuracyMeters: parsed.data.geolocation.accuracyMeters,
      altitudeMeters: parsed.data.geolocation.altitudeMeters,
      capturedAt: recordedAt,
      metadata: {
        requestId: request.id,
      },
    });
  }

  let meetingUpdates: {
    status?: MeetingStatus | null;
    same_place_status?: "pending" | null;
    metadata?: Record<string, unknown>;
  } = {};

  if (parsed.data.checkinKind === "meeting_start") {
    meetingUpdates.status = "in_progress";
  } else if (parsed.data.checkinKind === "meeting_end") {
    meetingUpdates.status = "completed";
  }

  if (geolocation && (!meeting.same_place_status || meeting.same_place_status === "not_started")) {
    meetingUpdates.same_place_status = "pending";
  }

  if (Object.keys(meetingUpdates).length > 0) {
    await updateMeeting(meeting.id, {
      ...meetingUpdates,
      metadata: {
        ...meeting.metadata,
        lastCheckinAt: recordedAt,
      },
    });
  }

  const auditAction =
    parsed.data.checkinKind === "meeting_start"
      ? "notary.meeting_started"
      : parsed.data.checkinKind === "meeting_end"
        ? "notary.meeting_completed"
        : null;

  if (auditAction) {
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "notarization_request",
      entityId: request.id,
      action: auditAction,
      metadata: {
        request_id: request.id,
        document_id: request.document_id,
        workflow_id: workflow?.id ?? request.workflow_id,
        meeting_id: meeting.id,
        meeting_checkin_id: checkin.id,
        participant_role: participantRole,
      },
    });
  }

  const refreshedMeeting =
    Object.keys(meetingUpdates).length > 0
      ? await getMeetingByRequestId(request.id)
      : meeting;

  res.status(201).json({
    meeting: buildMeetingResponse(refreshedMeeting ?? meeting, [
      ...participants.filter((item) => item.id !== nextParticipant.id),
      nextParticipant,
    ]),
    participant: {
      id: nextParticipant.id,
      userId: nextParticipant.user_id,
      participantRole: nextParticipant.participant_role,
      status: nextParticipant.status,
      arrivedAt: nextParticipant.arrived_at,
      departedAt: nextParticipant.departed_at,
    },
    checkin: buildMeetingCheckinResponse(checkin, nextParticipant, geolocation),
  });
};

export const recordIdentityVerification = async (req: Request, res: Response) => {
  const parsed = identityVerificationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const identityDocument = validateIdentityDocument({
    documentType: parsed.data.documentType,
    documentLast4: parsed.data.documentLast4,
    documentNumberTail: parsed.data.documentNumberTail,
    maskedIdentifier: parsed.data.maskedIdentifier,
    issuingJurisdiction: parsed.data.issuingJurisdiction,
    documentExpirationDate: parsed.data.documentExpirationDate,
    evidenceArtifactIds: parsed.data.evidenceArtifactIds,
  });
  if (!identityDocument.ok) {
    return res.status(400).json({
      error: "validation_error",
      message: identityDocument.message,
      field: identityDocument.field,
    });
  }

  const normalizedIdentityDocument = identityDocument.value;
  const identityDocumentMetadata = {
    policyVersion: identityDocumentPolicyVersion,
    documentType: normalizedIdentityDocument.documentType,
    documentLabel: normalizedIdentityDocument.documentLabel,
    documentNumberTail: normalizedIdentityDocument.documentNumberTail,
    maskedIdentifier: normalizedIdentityDocument.maskedIdentifier,
    issuingJurisdiction: normalizedIdentityDocument.issuingJurisdiction,
    documentExpirationDate: normalizedIdentityDocument.documentExpirationDate,
    evidenceArtifactIds: normalizedIdentityDocument.evidenceArtifactIds,
  };

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const meeting = await getMeetingByRequestId(request.id);
  if (!meeting) {
    return res.status(404).json({
      error: "not_found",
      message: "Meeting not found for this request",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before identity verification",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Identity verification is not allowed for this request",
    });
  }

  const participantRole = parsed.data.participantRole ?? "member";
  const participants = await syncDefaultMeetingParticipants({
    meeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });
  const participant = participants.find((item) => item.participant_role === participantRole);

  if (!participant) {
    return res.status(409).json({
      error: "conflict",
      message: "Identity-verification participant could not be resolved",
    });
  }

  const verificationStatus: IdentityVerificationStatus = parsed.data.status ?? "verified";
  const recordedAt = parsed.data.verifiedAt ?? new Date().toISOString();
  const checkin = await createMeetingCheckin({
    meetingId: meeting.id,
    meetingParticipantId: participant.id,
    recordedByUserId: actorUserId,
    checkinKind: "identity",
    recordedAt,
    notes: parsed.data.notes?.trim() ?? null,
    metadata: {
      requestId: request.id,
      verificationMethod: parsed.data.verificationMethod,
      identityDocument: identityDocumentMetadata,
    },
  });
  const verificationEvent = await createIdentityVerificationEvent({
    meetingId: meeting.id,
    meetingParticipantId: participant.id,
    verifiedByUserId: actorUserId,
    verificationMethod: parsed.data.verificationMethod as IdentityVerificationMethod,
    status: verificationStatus,
    subjectNameSnapshot: parsed.data.subjectName?.trim() ?? null,
    documentType: normalizedIdentityDocument.documentType,
    documentLast4: normalizedIdentityDocument.documentNumberTail,
    issuingJurisdiction: normalizedIdentityDocument.issuingJurisdiction,
    verifiedAt: verificationStatus === "verified" ? recordedAt : null,
    notes: parsed.data.notes?.trim() ?? null,
    metadata: {
      requestId: request.id,
      meetingCheckinId: checkin.id,
      identityDocument: identityDocumentMetadata,
    },
  });

  if (verificationStatus === "verified") {
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "notarization_request",
      entityId: request.id,
      action: "notary.identity_verified",
      metadata: {
        request_id: request.id,
        document_id: request.document_id,
        workflow_id: workflow?.id ?? request.workflow_id,
        meeting_id: meeting.id,
        meeting_checkin_id: checkin.id,
        verification_method: parsed.data.verificationMethod,
        doc_type: normalizedIdentityDocument.documentType,
        doc_number_tail: normalizedIdentityDocument.documentNumberTail,
        issuing_jurisdiction: normalizedIdentityDocument.issuingJurisdiction,
        document_expiration_date: normalizedIdentityDocument.documentExpirationDate,
        evidence_artifact_count: normalizedIdentityDocument.evidenceArtifactIds.length,
      },
    });
  }

  res.status(201).json({
    meeting: buildMeetingResponse(meeting, participants),
    participant: {
      id: participant.id,
      userId: participant.user_id,
      participantRole: participant.participant_role,
      status: participant.status,
      arrivedAt: participant.arrived_at,
      departedAt: participant.departed_at,
    },
    checkin: buildMeetingCheckinResponse(checkin, participant, null),
    identityVerification: buildIdentityVerificationResponse(
      verificationEvent,
      participant,
      checkin,
    ),
  });
};

export const recordProximityEvaluation = async (req: Request, res: Response) => {
  const parsed = proximityEvaluationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, workflow, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const meeting = await getMeetingByRequestId(request.id);
  if (!meeting) {
    return res.status(404).json({
      error: "not_found",
      message: "Meeting not found for this request",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before proximity evaluation",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Proximity evaluation is not allowed for this request",
    });
  }

  const participants = await syncDefaultMeetingParticipants({
    meeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });
  const memberParticipant = participants.find((participant) => participant.participant_role === "member");
  const notaryParticipant = participants.find((participant) => participant.participant_role === "notary");

  if (!memberParticipant || !notaryParticipant) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting participants required for proximity evaluation are missing",
    });
  }

  const memberSample = parsed.data.memberSampleId
    ? await getGeolocationSampleById(parsed.data.memberSampleId)
    : (await listMeetingGeolocationSamples({
        meetingId: meeting.id,
        meetingParticipantId: memberParticipant.id,
      }))[0] ?? null;
  const notarySample = parsed.data.notarySampleId
    ? await getGeolocationSampleById(parsed.data.notarySampleId)
    : (await listMeetingGeolocationSamples({
        meetingId: meeting.id,
        meetingParticipantId: notaryParticipant.id,
      }))[0] ?? null;

  if (
    !memberSample ||
    memberSample.meeting_id !== meeting.id ||
    memberSample.meeting_participant_id !== memberParticipant.id ||
    !notarySample ||
    notarySample.meeting_id !== meeting.id ||
    notarySample.meeting_participant_id !== notaryParticipant.id
  ) {
    return res.status(409).json({
      error: "conflict",
      message: "Usable member and illuminotary geolocation samples are required",
    });
  }

  const evaluatedAt = parsed.data.evaluatedAt ?? new Date().toISOString();

  if (memberSample.captured_by_user_id !== document.owner_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Member geolocation sample must be captured by the member account",
    });
  }

  if (notarySample.captured_by_user_id !== request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Illuminotary geolocation sample must be captured by the assigned illuminotary",
    });
  }

  const memberSampleAgeSeconds = calculateSampleAgeSeconds(memberSample.captured_at, evaluatedAt);
  const notarySampleAgeSeconds = calculateSampleAgeSeconds(notarySample.captured_at, evaluatedAt);
  if (!isSampleFresh(memberSample, evaluatedAt) || !isSampleFresh(notarySample, evaluatedAt)) {
    return res.status(409).json({
      error: "conflict",
      message: `Same-place samples must be captured within ${samePlaceSampleFreshnessMinutes} minutes of evaluation`,
      details: {
        freshnessWindowSeconds: samePlaceSampleFreshnessMs / 1000,
        memberSampleAgeSeconds,
        notarySampleAgeSeconds,
      },
    });
  }

  const thresholdMeters = parsed.data.thresholdMeters ?? defaultSamePlaceThresholdMeters;
  const observedDistanceMeters = calculateDistanceMeters(memberSample, notarySample);
  const evaluationStatus = observedDistanceMeters <= thresholdMeters ? "passed" : "failed";
  const evaluation = await createProximityEvaluation({
    meetingId: meeting.id,
    evaluatedByUserId: actorUserId,
    memberSampleId: memberSample.id,
    notarySampleId: notarySample.id,
    status: evaluationStatus,
    thresholdMeters,
    observedDistanceMeters,
    evaluatedAt,
    notes: parsed.data.notes?.trim() ?? null,
    metadata: {
      requestId: request.id,
      policy: {
        policyVersion: "same_place_v1",
        thresholdMeters,
        freshnessWindowSeconds: samePlaceSampleFreshnessMs / 1000,
        requiredActors: {
          memberUserId: document.owner_id,
          notaryUserId: request.assigned_notary_id,
        },
      },
      sampleAgesSeconds: {
        member: memberSampleAgeSeconds,
        notary: notarySampleAgeSeconds,
      },
      sampleAccuracyMeters: {
        member: memberSample.accuracy_meters,
        notary: notarySample.accuracy_meters,
      },
      sampleCaptureStages: {
        member: memberSample.capture_stage,
        notary: notarySample.capture_stage,
      },
    },
  });
  const updatedMeeting = await updateMeeting(meeting.id, {
    same_place_status: evaluationStatus,
    metadata: {
      ...meeting.metadata,
      lastProximityEvaluationAt: evaluatedAt,
      lastProximityEvaluationStatus: evaluationStatus,
      lastProximityDistanceMeters: observedDistanceMeters,
      lastProximityThresholdMeters: thresholdMeters,
      lastProximitySampleAgesSeconds: {
        member: memberSampleAgeSeconds,
        notary: notarySampleAgeSeconds,
      },
    },
  });

  res.status(201).json({
    meeting: buildMeetingResponse(updatedMeeting, participants),
    evaluation: buildProximityEvaluationResponse(evaluation, memberSample, notarySample),
  });
};

export const createMeetingArtifactRecord = async (req: Request, res: Response) => {
  const parsed = meetingArtifactSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (Boolean(parsed.data.storageBucket) !== Boolean(parsed.data.storagePath)) {
    return res.status(400).json({
      error: "validation_error",
      message: "storageBucket and storagePath must be provided together",
    });
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  const meeting = await getMeetingByRequestId(request.id);
  if (!meeting) {
    return res.status(404).json({
      error: "not_found",
      message: "Meeting not found for this request",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before meeting artifact capture",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Meeting artifact capture is not allowed for this request",
    });
  }

  const participants = await syncDefaultMeetingParticipants({
    meeting,
    ownerUserId: document.owner_id,
    assignedNotaryUserId: request.assigned_notary_id,
  });
  const participant = parsed.data.participantRole
    ? participants.find((item) => item.participant_role === parsed.data.participantRole)
    : null;
  if (parsed.data.participantRole && !participant) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting participant could not be resolved for the artifact",
    });
  }

  const meetingCheckin = parsed.data.meetingCheckinId
    ? await getMeetingCheckinById(parsed.data.meetingCheckinId)
    : null;
  if (meetingCheckin && meetingCheckin.meeting_id !== meeting.id) {
    return res.status(409).json({
      error: "conflict",
      message: "Meeting check-in does not belong to this meeting",
    });
  }

  const identityVerificationEvent = parsed.data.identityVerificationEventId
    ? await getIdentityVerificationEventById(parsed.data.identityVerificationEventId)
    : null;
  if (identityVerificationEvent && identityVerificationEvent.meeting_id !== meeting.id) {
    return res.status(409).json({
      error: "conflict",
      message: "Identity-verification event does not belong to this meeting",
    });
  }

  const resolvedParticipant =
    participant ??
    participants.find((item) => item.id === meetingCheckin?.meeting_participant_id) ??
    participants.find((item) => item.id === identityVerificationEvent?.meeting_participant_id) ??
    null;

  const artifact = await createMeetingArtifact({
    meetingId: meeting.id,
    meetingParticipantId: resolvedParticipant?.id ?? null,
    meetingCheckinId: meetingCheckin?.id ?? null,
    identityVerificationEventId: identityVerificationEvent?.id ?? null,
    uploadedByUserId: actorUserId,
    artifactKind: parsed.data.artifactKind as MeetingArtifactKind,
    storageBucket: parsed.data.storageBucket?.trim() ?? null,
    storagePath: parsed.data.storagePath?.trim() ?? null,
    mimeType: parsed.data.mimeType?.trim() ?? null,
    sizeBytes: parsed.data.sizeBytes ?? null,
    capturedAt: parsed.data.capturedAt ?? null,
    retentionUntil:
      parsed.data.retentionUntil ?? meeting.evidence_retention_until ?? null,
    metadata: {
      requestId: request.id,
      notes: parsed.data.notes?.trim() ?? null,
    },
  });

  res.status(201).json({
    meeting: buildMeetingResponse(meeting, participants),
    artifact: buildMeetingArtifactResponse(artifact),
  });
};

export const getNotaryContext = async (req: Request, res: Response) => {
  return sendNotImplemented(
    res,
    "Notary context is not mounted on this compatibility route. Use the workflow, meeting, and document finalization surfaces instead.",
  );
};

export const signRequest = async (req: Request, res: Response) => {
  const parsed = notarySignSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before signing",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Notarial signing is not allowed for this request",
    });
  }

  try {
    const { meeting, verifiedIdentity } = await ensureNotaryCompletionReady({ requestId: request.id });
    const participants = await syncDefaultMeetingParticipants({
      meeting,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    });
    const notaryParticipant = participants.find((participant) => participant.participant_role === "notary");
    const [notaryProfile, notaryIdentity] = await Promise.all([
      getNotaryProfileByUserId(request.assigned_notary_id),
      getUserIdentityContextByUserId(request.assigned_notary_id),
    ]);

    if (!notaryProfile) {
      throw new DocumentFinalizationConflictError(
        "Assigned illuminotary profile must be completed before acknowledgment append",
      );
    }

    const notaryName = buildUserDisplayName(notaryIdentity);
    const result = await appendAcknowledgmentPageToDocument({
      documentId: document.id,
      actorSupabaseId: req.user?.id,
      actorRole: req.user?.role ?? null,
      venue: parsed.data.venue,
      meetingId: meeting.id,
      identityMethodSummary: buildIdentityMethodSummary(verifiedIdentity),
      notaryProfile: {
        jurisdiction: notaryProfile.jurisdiction,
        serviceAreaKind: notaryProfile.serviceAreaKind,
        serviceAreaName: notaryProfile.serviceAreaName,
        commissionNumber: notaryProfile.commissionNumber,
        commissionExpiresAt: notaryProfile.commissionExpiresAt,
        signatureDataUrl: notaryProfile.signatureDataUrl,
        sealDataUrl: notaryProfile.sealDataUrl,
        notaryName,
      },
    });
    const acknowledgmentRender = result.execution.metadata.acknowledgmentRender ?? null;
    const artifact = await createMeetingArtifact({
      meetingId: meeting.id,
      meetingParticipantId: notaryParticipant?.id ?? null,
      uploadedByUserId: actorUserId,
      artifactKind: "seal_preview",
      capturedAt: new Date().toISOString(),
      metadata: {
        requestId: request.id,
        acknowledgmentPageId: result.acknowledgmentPage.id,
        acknowledgmentRender,
        venue: parsed.data.venue,
        acknowledgment: parsed.data.acknowledgment,
        notarialFields: parsed.data.notarialFields ?? {},
        sealLabel: parsed.data.sealLabel?.trim() ?? null,
        signatureLabel: parsed.data.signatureLabel?.trim() ?? null,
        notes: parsed.data.notes?.trim() ?? null,
      },
    });

    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "notarization_request",
      entityId: request.id,
      action: "notary.notarial_acknowledgment_signed",
      metadata: {
        request_id: request.id,
        document_id: document.id,
        meeting_id: meeting.id,
        acknowledgment_page_id: result.acknowledgmentPage.id,
        document_version_id: result.version.id,
        seal_artifact_id: artifact.id,
        acknowledgment_render: acknowledgmentRender,
      },
    });

    return res.status(200).json({
      status: "ok",
      documentId: result.document.id,
      requestId: result.request.id,
      acknowledgmentPage: {
        id: result.acknowledgmentPage.id,
        jurisdiction: result.acknowledgmentPage.jurisdiction,
        content: result.acknowledgmentPage.content,
        renderSummary: acknowledgmentRender,
        createdAt: result.acknowledgmentPage.created_at,
      },
      execution: mapFinalizationExecutionSummary(result.execution),
      version: mapFinalizationVersionSummary(result.version),
      sealArtifact: buildMeetingArtifactResponse(artifact),
    });
  } catch (error) {
    return sendDocumentFinalizationError(res, error);
  }
};

export const submitRequest = async (req: Request, res: Response) => {
  const parsed = notarySubmitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requestId = resolveRequestIdParam(req);
  if (!requestId) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing notarization request id",
    });
  }

  const { request, document, actorUserId } = await resolveMeetingActorContext(req, requestId);
  if (!request || !document) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  if (!request.assigned_notary_id) {
    return res.status(409).json({
      error: "conflict",
      message: "Request must be assigned to an illuminotary before final submission",
    });
  }

  if (
    !ensureMeetingActorAuthorized({
      role: req.user?.role,
      actorUserId,
      ownerUserId: document.owner_id,
      assignedNotaryUserId: request.assigned_notary_id,
    })
  ) {
    return res.status(403).json({
      error: "forbidden",
      message: "Final submission is not allowed for this request",
    });
  }

  try {
    const { meeting } = await ensureNotaryCompletionReady({
      requestId: request.id,
      requireMeetingCompleted: true,
    });
    const result = await finalizeDocumentWithWatermark({
      documentId: document.id,
      actorSupabaseId: req.user?.id,
      actorRole: req.user?.role ?? null,
    });
    const ledgerStatus = result.ledgerAnchorAttempt?.status ?? "anchored";
    const finalPackageStatus = buildFinalPackageStatusSummary({
      ledgerStatus,
      hashCompletedAt: result.hashRecord.completed_at,
      anchoredAt: result.ledgerEntry.anchored_at,
    });

    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "notarization_request",
      entityId: request.id,
      action: "notary.final_package_submitted",
      metadata: {
        request_id: request.id,
        document_id: document.id,
        meeting_id: meeting.id,
        document_version_id: result.version.id,
        ledger_entry_id: result.ledgerEntry.id,
        ledger_status: ledgerStatus,
        notes: parsed.data.notes?.trim() ?? null,
      },
    });

    const responseBody = {
      status: "ok",
      documentId: result.document.id,
      documentStatus: result.document.status,
      requestId: result.request.id,
      requestStatus: result.request.status,
      execution: mapFinalizationExecutionSummary(result.execution),
      version: mapFinalizationVersionSummary(result.version),
      hashRecord: {
        id: result.hashRecord.id,
        algorithm: result.hashRecord.algorithm,
        hash: result.hashRecord.hash,
        status: result.hashRecord.status,
        completedAt: result.hashRecord.completed_at,
      },
      ledger: {
        id: result.ledgerEntry.id,
        ledgerTxId: result.ledgerEntry.ledger_tx_id,
        anchoredAt: result.ledgerEntry.anchored_at,
        status: ledgerStatus,
        errorMessage: result.ledgerAnchorAttempt?.error_message ?? null,
      },
      finalizationStatus: finalPackageStatus,
    };

    if (ledgerStatus !== "anchored") {
      return res.status(409).json({
        ...responseBody,
        status: "ledger_anchor_failed",
        error: "ledger_anchor_failed",
        message:
          "Ledger anchoring failed. The final package was watermarked and hashed, but verification is not ready. Retry final package submission after resolving the ledger provider issue.",
      });
    }

    return res.status(200).json(responseBody);
  } catch (error) {
    return sendDocumentFinalizationError(res, error);
  }
};
