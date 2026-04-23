import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type MeetingStatus =
  | "scheduled"
  | "rescheduled"
  | "cancelled"
  | "in_progress"
  | "completed"
  | "no_show";

export type MeetingSamePlaceStatus =
  | "not_started"
  | "pending"
  | "passed"
  | "failed"
  | "manual_override";

export type MeetingParticipantRole =
  | "member"
  | "notary"
  | "signer"
  | "trusted_person"
  | "witness"
  | "observer";

export type MeetingParticipantStatus =
  | "expected"
  | "invited"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "no_show"
  | "canceled";

export type MeetingCheckinKind =
  | "arrival"
  | "proximity"
  | "identity"
  | "meeting_start"
  | "meeting_end"
  | "manual";

export type MeetingCheckinStatus = "recorded" | "verified" | "superseded" | "void";

export type GeolocationSampleKind = "device_gps" | "network" | "manual_pin" | "derived";

export type GeolocationCaptureStage =
  | "checkin"
  | "checkin_confirmation"
  | "proximity_validation"
  | "meeting_start"
  | "meeting_end";

export type ProximityEvaluationKind =
  | "same_place"
  | "arrival_window"
  | "meeting_start"
  | "meeting_end";

export type ProximityEvaluationStatus =
  | "pending"
  | "passed"
  | "failed"
  | "manual_override";

export type IdentityVerificationMethod =
  | "in_person_document"
  | "credential_scan"
  | "manual_attestation"
  | "knowledge_based"
  | "biometric"
  | "other";

export type IdentityVerificationStatus =
  | "pending"
  | "verified"
  | "failed"
  | "manual_review";

export type MeetingArtifactKind =
  | "identity_document"
  | "identity_selfie"
  | "consent_capture"
  | "location_photo"
  | "verification_summary"
  | "seal_preview"
  | "meeting_note"
  | "other";

export type MeetingArtifactStatus = "active" | "redacted" | "expired" | "deleted";

export type MeetingRecord = {
  id: string;
  request_id: string;
  workflow_id: string | null;
  scheduled_at: string | null;
  timezone: string | null;
  location: string | null;
  status: MeetingStatus | null;
  same_place_required: boolean;
  same_place_status: MeetingSamePlaceStatus | null;
  evidence_retention_until: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MeetingParticipantRecord = {
  id: string;
  meeting_id: string;
  user_id: string | null;
  document_party_id: string | null;
  participant_role: MeetingParticipantRole;
  status: MeetingParticipantStatus;
  presence_required: boolean;
  participant_label: string | null;
  arrived_at: string | null;
  departed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MeetingCheckinRecord = {
  id: string;
  meeting_id: string;
  meeting_participant_id: string;
  recorded_by_user_id: string | null;
  checkin_kind: MeetingCheckinKind;
  status: MeetingCheckinStatus;
  recorded_at: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GeolocationSampleRecord = {
  id: string;
  meeting_id: string;
  meeting_participant_id: string | null;
  meeting_checkin_id: string | null;
  captured_by_user_id: string | null;
  sample_kind: GeolocationSampleKind;
  capture_stage: GeolocationCaptureStage;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  altitude_meters: number | null;
  captured_at: string;
  expires_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ProximityEvaluationRecord = {
  id: string;
  meeting_id: string;
  evaluated_by_user_id: string | null;
  member_sample_id: string | null;
  notary_sample_id: string | null;
  evaluation_kind: ProximityEvaluationKind;
  status: ProximityEvaluationStatus;
  threshold_meters: number;
  observed_distance_meters: number | null;
  evaluated_at: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type IdentityVerificationEventRecord = {
  id: string;
  meeting_id: string;
  meeting_participant_id: string;
  verified_by_user_id: string | null;
  verification_method: IdentityVerificationMethod;
  status: IdentityVerificationStatus;
  subject_name_snapshot: string | null;
  document_type: string | null;
  document_last4: string | null;
  issuing_jurisdiction: string | null;
  verified_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MeetingArtifactRecord = {
  id: string;
  meeting_id: string;
  meeting_participant_id: string | null;
  meeting_checkin_id: string | null;
  identity_verification_event_id: string | null;
  uploaded_by_user_id: string | null;
  artifact_kind: MeetingArtifactKind;
  status: MeetingArtifactStatus;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  captured_at: string | null;
  retention_until: string | null;
  redacted_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MeetingArtifactRetentionProcessRecord = {
  artifactId: string;
  meetingId: string;
  previousStatus: MeetingArtifactStatus;
  nextStatus: MeetingArtifactStatus;
  retentionUntil: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  redactedAt: string | null;
  updatedAt: string;
};

export type MeetingArtifactRetentionProcessResult = {
  scannedCount: number;
  updatedCount: number;
  artifacts: MeetingArtifactRetentionProcessRecord[];
};

const meetingSelectColumns = [
  "id",
  "request_id",
  "workflow_id",
  "scheduled_at",
  "timezone",
  "location",
  "status",
  "same_place_required",
  "same_place_status",
  "evidence_retention_until",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const meetingParticipantSelectColumns = [
  "id",
  "meeting_id",
  "user_id",
  "document_party_id",
  "participant_role",
  "status",
  "presence_required",
  "participant_label",
  "arrived_at",
  "departed_at",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const meetingCheckinSelectColumns = [
  "id",
  "meeting_id",
  "meeting_participant_id",
  "recorded_by_user_id",
  "checkin_kind",
  "status",
  "recorded_at",
  "notes",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const geolocationSampleSelectColumns = [
  "id",
  "meeting_id",
  "meeting_participant_id",
  "meeting_checkin_id",
  "captured_by_user_id",
  "sample_kind",
  "capture_stage",
  "latitude",
  "longitude",
  "accuracy_meters",
  "altitude_meters",
  "captured_at",
  "expires_at",
  "metadata",
  "created_at",
].join(", ");

const proximityEvaluationSelectColumns = [
  "id",
  "meeting_id",
  "evaluated_by_user_id",
  "member_sample_id",
  "notary_sample_id",
  "evaluation_kind",
  "status",
  "threshold_meters",
  "observed_distance_meters",
  "evaluated_at",
  "notes",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const identityVerificationEventSelectColumns = [
  "id",
  "meeting_id",
  "meeting_participant_id",
  "verified_by_user_id",
  "verification_method",
  "status",
  "subject_name_snapshot",
  "document_type",
  "document_last4",
  "issuing_jurisdiction",
  "verified_at",
  "notes",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const meetingArtifactSelectColumns = [
  "id",
  "meeting_id",
  "meeting_participant_id",
  "meeting_checkin_id",
  "identity_verification_event_id",
  "uploaded_by_user_id",
  "artifact_kind",
  "status",
  "storage_bucket",
  "storage_path",
  "mime_type",
  "size_bytes",
  "captured_at",
  "retention_until",
  "redacted_at",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

export const getMeetingByRequestId = async (requestId: string) => {
  const { data, error } = await supabaseAdmin
    .from("meetings")
    .select(meetingSelectColumns)
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as MeetingRecord | null) ?? null;
};

export const listMeetingsByRequestIds = async (requestIds: string[]) => {
  if (!requestIds.length) {
    return [] as MeetingRecord[];
  }

  const { data, error } = await supabaseAdmin
    .from("meetings")
    .select(meetingSelectColumns)
    .in("request_id", requestIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as MeetingRecord[];
};

export const createMeeting = async (input: {
  requestId: string;
  workflowId?: string | null | undefined;
  scheduledAt?: string | null | undefined;
  timezone?: string | null | undefined;
  location?: string | null | undefined;
  status: MeetingStatus;
  samePlaceRequired?: boolean | undefined;
  samePlaceStatus?: MeetingSamePlaceStatus | null | undefined;
  evidenceRetentionUntil?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("meetings")
    .insert({
      request_id: input.requestId,
      workflow_id: input.workflowId ?? null,
      scheduled_at: input.scheduledAt ?? null,
      timezone: input.timezone ?? null,
      location: input.location ?? null,
      status: input.status,
      same_place_required: input.samePlaceRequired ?? true,
      same_place_status: input.samePlaceStatus ?? null,
      evidence_retention_until: input.evidenceRetentionUntil ?? null,
      metadata: input.metadata ?? {},
    })
    .select(meetingSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create meeting");
  }

  return data as unknown as MeetingRecord;
};

export const updateMeeting = async (meetingId: string, updates: {
  workflow_id?: string | null;
  scheduled_at?: string | null;
  timezone?: string | null;
  location?: string | null;
  status?: MeetingStatus | null;
  same_place_required?: boolean;
  same_place_status?: MeetingSamePlaceStatus | null;
  evidence_retention_until?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const { data, error } = await supabaseAdmin
    .from("meetings")
    .update(updates)
    .eq("id", meetingId)
    .select(meetingSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update meeting");
  }

  return data as unknown as MeetingRecord;
};

export const listMeetingParticipants = async (meetingId: string) => {
  const { data, error } = await supabaseAdmin
    .from("meeting_participants")
    .select(meetingParticipantSelectColumns)
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as MeetingParticipantRecord[];
};

export const createMeetingParticipant = async (input: {
  meetingId: string;
  userId?: string | null | undefined;
  documentPartyId?: string | null | undefined;
  participantRole: MeetingParticipantRole;
  status?: MeetingParticipantStatus | undefined;
  presenceRequired?: boolean | undefined;
  participantLabel?: string | null | undefined;
  arrivedAt?: string | null | undefined;
  departedAt?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("meeting_participants")
    .insert({
      meeting_id: input.meetingId,
      user_id: input.userId ?? null,
      document_party_id: input.documentPartyId ?? null,
      participant_role: input.participantRole,
      status: input.status ?? "expected",
      presence_required: input.presenceRequired ?? true,
      participant_label: input.participantLabel ?? null,
      arrived_at: input.arrivedAt ?? null,
      departed_at: input.departedAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select(meetingParticipantSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create meeting participant");
  }

  return data as unknown as MeetingParticipantRecord;
};

export const updateMeetingParticipant = async (participantId: string, updates: {
  user_id?: string | null;
  document_party_id?: string | null;
  status?: MeetingParticipantStatus;
  presence_required?: boolean;
  participant_label?: string | null;
  arrived_at?: string | null;
  departed_at?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const { data, error } = await supabaseAdmin
    .from("meeting_participants")
    .update(updates)
    .eq("id", participantId)
    .select(meetingParticipantSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update meeting participant");
  }

  return data as unknown as MeetingParticipantRecord;
};

export const createMeetingCheckin = async (input: {
  meetingId: string;
  meetingParticipantId: string;
  recordedByUserId?: string | null | undefined;
  checkinKind: MeetingCheckinKind;
  status?: MeetingCheckinStatus | undefined;
  recordedAt?: string | undefined;
  notes?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("meeting_checkins")
    .insert({
      meeting_id: input.meetingId,
      meeting_participant_id: input.meetingParticipantId,
      recorded_by_user_id: input.recordedByUserId ?? null,
      checkin_kind: input.checkinKind,
      status: input.status ?? "recorded",
      recorded_at: input.recordedAt ?? new Date().toISOString(),
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    })
    .select(meetingCheckinSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create meeting check-in");
  }

  return data as unknown as MeetingCheckinRecord;
};

export const getMeetingCheckinById = async (meetingCheckinId: string) => {
  const { data, error } = await supabaseAdmin
    .from("meeting_checkins")
    .select(meetingCheckinSelectColumns)
    .eq("id", meetingCheckinId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as MeetingCheckinRecord | null) ?? null;
};

export const listMeetingCheckins = async (meetingId: string) => {
  const { data, error } = await supabaseAdmin
    .from("meeting_checkins")
    .select(meetingCheckinSelectColumns)
    .eq("meeting_id", meetingId)
    .order("recorded_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as MeetingCheckinRecord[];
};

export const createGeolocationSample = async (input: {
  meetingId: string;
  meetingParticipantId?: string | null | undefined;
  meetingCheckinId?: string | null | undefined;
  capturedByUserId?: string | null | undefined;
  sampleKind?: GeolocationSampleKind | undefined;
  captureStage?: GeolocationCaptureStage | undefined;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null | undefined;
  altitudeMeters?: number | null | undefined;
  capturedAt?: string | undefined;
  expiresAt?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("geolocation_samples")
    .insert({
      meeting_id: input.meetingId,
      meeting_participant_id: input.meetingParticipantId ?? null,
      meeting_checkin_id: input.meetingCheckinId ?? null,
      captured_by_user_id: input.capturedByUserId ?? null,
      sample_kind: input.sampleKind ?? "device_gps",
      capture_stage: input.captureStage ?? "checkin",
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy_meters: input.accuracyMeters ?? null,
      altitude_meters: input.altitudeMeters ?? null,
      captured_at: input.capturedAt ?? new Date().toISOString(),
      expires_at: input.expiresAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select(geolocationSampleSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create geolocation sample");
  }

  return data as unknown as GeolocationSampleRecord;
};

export const getGeolocationSampleById = async (geolocationSampleId: string) => {
  const { data, error } = await supabaseAdmin
    .from("geolocation_samples")
    .select(geolocationSampleSelectColumns)
    .eq("id", geolocationSampleId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as GeolocationSampleRecord | null) ?? null;
};

export const listMeetingGeolocationSamples = async (input: {
  meetingId: string;
  meetingParticipantId?: string | null | undefined;
}) => {
  let query = supabaseAdmin
    .from("geolocation_samples")
    .select(geolocationSampleSelectColumns)
    .eq("meeting_id", input.meetingId)
    .order("captured_at", { ascending: false });

  if (input.meetingParticipantId) {
    query = query.eq("meeting_participant_id", input.meetingParticipantId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as GeolocationSampleRecord[];
};

export const createProximityEvaluation = async (input: {
  meetingId: string;
  evaluatedByUserId?: string | null | undefined;
  memberSampleId?: string | null | undefined;
  notarySampleId?: string | null | undefined;
  evaluationKind?: ProximityEvaluationKind | undefined;
  status: ProximityEvaluationStatus;
  thresholdMeters?: number | undefined;
  observedDistanceMeters?: number | null | undefined;
  evaluatedAt?: string | undefined;
  notes?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("proximity_evaluations")
    .insert({
      meeting_id: input.meetingId,
      evaluated_by_user_id: input.evaluatedByUserId ?? null,
      member_sample_id: input.memberSampleId ?? null,
      notary_sample_id: input.notarySampleId ?? null,
      evaluation_kind: input.evaluationKind ?? "same_place",
      status: input.status,
      threshold_meters: input.thresholdMeters ?? 100,
      observed_distance_meters: input.observedDistanceMeters ?? null,
      evaluated_at: input.evaluatedAt ?? new Date().toISOString(),
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    })
    .select(proximityEvaluationSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create proximity evaluation");
  }

  return data as unknown as ProximityEvaluationRecord;
};

export const createIdentityVerificationEvent = async (input: {
  meetingId: string;
  meetingParticipantId: string;
  verifiedByUserId?: string | null | undefined;
  verificationMethod?: IdentityVerificationMethod | undefined;
  status?: IdentityVerificationStatus | undefined;
  subjectNameSnapshot?: string | null | undefined;
  documentType?: string | null | undefined;
  documentLast4?: string | null | undefined;
  issuingJurisdiction?: string | null | undefined;
  verifiedAt?: string | null | undefined;
  notes?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("identity_verification_events")
    .insert({
      meeting_id: input.meetingId,
      meeting_participant_id: input.meetingParticipantId,
      verified_by_user_id: input.verifiedByUserId ?? null,
      verification_method: input.verificationMethod ?? "in_person_document",
      status: input.status ?? "verified",
      subject_name_snapshot: input.subjectNameSnapshot ?? null,
      document_type: input.documentType ?? null,
      document_last4: input.documentLast4 ?? null,
      issuing_jurisdiction: input.issuingJurisdiction ?? null,
      verified_at: input.verifiedAt ?? null,
      notes: input.notes ?? null,
      metadata: input.metadata ?? {},
    })
    .select(identityVerificationEventSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create identity verification event");
  }

  return data as unknown as IdentityVerificationEventRecord;
};

export const getIdentityVerificationEventById = async (identityVerificationEventId: string) => {
  const { data, error } = await supabaseAdmin
    .from("identity_verification_events")
    .select(identityVerificationEventSelectColumns)
    .eq("id", identityVerificationEventId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as IdentityVerificationEventRecord | null) ?? null;
};

export const listIdentityVerificationEvents = async (meetingId: string) => {
  const { data, error } = await supabaseAdmin
    .from("identity_verification_events")
    .select(identityVerificationEventSelectColumns)
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as IdentityVerificationEventRecord[];
};

export const listProximityEvaluations = async (meetingId: string) => {
  const { data, error } = await supabaseAdmin
    .from("proximity_evaluations")
    .select(proximityEvaluationSelectColumns)
    .eq("meeting_id", meetingId)
    .order("evaluated_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as ProximityEvaluationRecord[];
};

export const createMeetingArtifact = async (input: {
  meetingId: string;
  meetingParticipantId?: string | null | undefined;
  meetingCheckinId?: string | null | undefined;
  identityVerificationEventId?: string | null | undefined;
  uploadedByUserId?: string | null | undefined;
  artifactKind: MeetingArtifactKind;
  status?: MeetingArtifactStatus | undefined;
  storageBucket?: string | null | undefined;
  storagePath?: string | null | undefined;
  mimeType?: string | null | undefined;
  sizeBytes?: number | null | undefined;
  capturedAt?: string | null | undefined;
  retentionUntil?: string | null | undefined;
  redactedAt?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("meeting_artifacts")
    .insert({
      meeting_id: input.meetingId,
      meeting_participant_id: input.meetingParticipantId ?? null,
      meeting_checkin_id: input.meetingCheckinId ?? null,
      identity_verification_event_id: input.identityVerificationEventId ?? null,
      uploaded_by_user_id: input.uploadedByUserId ?? null,
      artifact_kind: input.artifactKind,
      status: input.status ?? "active",
      storage_bucket: input.storageBucket ?? null,
      storage_path: input.storagePath ?? null,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      captured_at: input.capturedAt ?? null,
      retention_until: input.retentionUntil ?? null,
      redacted_at: input.redactedAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select(meetingArtifactSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create meeting artifact");
  }

  return data as unknown as MeetingArtifactRecord;
};

export const listMeetingArtifacts = async (meetingId: string) => {
  const { data, error } = await supabaseAdmin
    .from("meeting_artifacts")
    .select(meetingArtifactSelectColumns)
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as MeetingArtifactRecord[];
};

export const enforceMeetingArtifactRetention = async (input: {
  limit: number;
  workerUserId?: string | null | undefined;
  now?: string | undefined;
}) => {
  const now = input.now ?? new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("meeting_artifacts")
    .select(meetingArtifactSelectColumns)
    .in("status", ["active", "redacted"])
    .not("retention_until", "is", null)
    .lte("retention_until", now)
    .order("retention_until", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(input.limit);

  if (error) {
    throw new Error(error.message);
  }

  const candidates = (rows ?? []) as unknown as MeetingArtifactRecord[];
  if (!candidates.length) {
    return {
      scannedCount: 0,
      updatedCount: 0,
      artifacts: [],
    } satisfies MeetingArtifactRetentionProcessResult;
  }

  const updated = await Promise.all(
    candidates.map(async (artifact) => {
      const { data: updatedRow, error: updateError } = await supabaseAdmin
        .from("meeting_artifacts")
        .update({
          status: "expired",
          redacted_at: artifact.redacted_at ?? now,
          metadata: {
            ...artifact.metadata,
            processed_by: input.workerUserId ?? null,
            retention_enforced_at: now,
          },
        })
        .eq("id", artifact.id)
        .select(meetingArtifactSelectColumns)
        .single();

      if (updateError || !updatedRow) {
        throw new Error(updateError?.message ?? "Failed to update meeting artifact retention state");
      }

      return updatedRow as unknown as MeetingArtifactRecord;
    }),
  );
  const previousStatusByArtifactId = new Map(
    candidates.map((row) => [row.id, row.status] as const),
  );

  return {
    scannedCount: candidates.length,
    updatedCount: updated.length,
    artifacts: updated.map((row) => ({
      artifactId: row.id,
      meetingId: row.meeting_id,
      previousStatus: previousStatusByArtifactId.get(row.id) ?? row.status,
      nextStatus: row.status,
      retentionUntil: row.retention_until,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      redactedAt: row.redacted_at,
      updatedAt: row.updated_at,
    })),
  } satisfies MeetingArtifactRetentionProcessResult;
};