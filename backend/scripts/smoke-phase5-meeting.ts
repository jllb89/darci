import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

if (!process.env.OTEL_SDK_DISABLED) {
  process.env.OTEL_SDK_DISABLED = "1";
}

const apiBaseUrl = process.env.API_BASE_URL?.replace(/\/$/, "");
const configuredMemberAccessToken = process.env.MEMBER_ACCESS_TOKEN ?? process.env.ACCESS_TOKEN;
const configuredNotaryAccessToken = process.env.NOTARY_ACCESS_TOKEN;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

const requiredEnv = [
  ["API_BASE_URL", apiBaseUrl],
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceRoleKey],
  [
    "MEMBER_ACCESS_TOKEN or ACCESS_TOKEN or SUPABASE_JWT_SECRET",
    configuredMemberAccessToken ?? supabaseJwtSecret,
  ],
  ["SUPABASE_JWT_SECRET or NOTARY_ACCESS_TOKEN", supabaseJwtSecret ?? configuredNotaryAccessToken],
] as const;

const missingEnv = requiredEnv.filter(([, value]) => !value).map(([name]) => name);

if (missingEnv.length > 0) {
  console.error("Missing required env vars", { missingEnv });
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceRoleKey!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type UploadSession = {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
};

type DocumentResponse = {
  document: {
    id: string;
    idn: string | null;
    status: string;
    documentType: string | null;
    jurisdiction: string | null;
    createdAt: string;
  };
  version: {
    id: string;
    version: number;
    storagePath: string | null;
    fileName: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    isFinal: boolean | null;
    createdAt: string;
  };
  upload?: UploadSession;
};

type ReviewApprovalResponse = {
  document: {
    id: string;
    idn: string | null;
    status: string;
  };
  reviewApproval: {
    approvedAt: string;
    signingReady: boolean;
  } | null;
};

type DocumentSigningResponse = {
  document: {
    id: string;
    status: string;
  };
  signing: {
    state: string;
    outputs: Array<{
      outputKey: string;
      generationRunId: string | null;
      mimeType: string | null;
    }>;
    missingOutputKeys: string[];
    allOutputsReady: boolean;
  };
};

type NotarizationWorkflowResponse = {
  id: string;
  status: string;
  workflowKind: string;
  selectedNotaryUserId: string | null;
  assignedNotaryUserId: string | null;
  currentLegacyRequestId: string | null;
};

type NotarizationSubmitResponse = {
  request: {
    id: string;
    documentId: string;
    workflowId: string | null;
    status: string;
    submittedAt: string | null;
  };
  document: {
    id: string;
    status: string;
  };
  code: {
    id: string;
    code: string;
    status: string;
    expiresAt: string | null;
  };
  workflow: NotarizationWorkflowResponse | null;
};

type NotaryCodeResolveResponse = {
  request: {
    id: string;
    documentId: string;
    workflowId: string | null;
    status: string;
  };
  code: {
    id: string;
    code: string;
    status: string;
    expiresAt: string | null;
  };
  workflow: NotarizationWorkflowResponse | null;
};

type MeetingApiParticipant = {
  id: string;
  userId: string | null;
  participantRole: string;
  status: string;
  arrivedAt: string | null;
  departedAt: string | null;
};

type MeetingApiResponse = {
  meeting: {
    id: string;
    requestId: string;
    workflowId: string | null;
    scheduledAt: string | null;
    timezone: string | null;
    location: string | null;
    status: string | null;
    samePlaceRequired: boolean;
    samePlaceStatus: string | null;
    evidenceRetentionUntil: string | null;
    participants: MeetingApiParticipant[];
  };
  participant?: MeetingApiParticipant;
  checkin?: {
    id: string;
    checkinKind: string;
    geolocation?: {
      id: string;
    } | null;
  };
  identityVerification?: {
    id: string;
    status: string;
  };
  evaluation?: {
    id: string;
    status: string;
    observedDistanceMeters: number | null;
  };
  artifact?: {
    id: string;
    artifactKind: string;
  };
};

type FallbackAuthUserRecord = {
  id: string;
  supabase_user_id: string;
  email: string | null;
};

type RuntimeAuthContext = {
  accessToken: string;
  internalUserId: string;
  supabaseUserId: string;
  source: "env_token" | "jwt_fallback";
  role: "member" | "notary";
};

type DecodedAccessToken = {
  sub?: string;
  email?: string;
  exp?: number;
  role?: string;
  app_metadata?: {
    role?: string;
  };
  user_metadata?: {
    role?: string;
  };
};

type MeetingRow = {
  id: string;
  request_id: string;
  workflow_id: string | null;
  scheduled_at: string | null;
  timezone: string | null;
  location: string | null;
  status: string | null;
  same_place_required: boolean;
  same_place_status: string | null;
  evidence_retention_until: string | null;
};

type MeetingParticipantRow = {
  id: string;
  meeting_id: string;
  user_id: string | null;
  participant_role: string;
  status: string;
  arrived_at: string | null;
  departed_at: string | null;
};

type MeetingCheckinRow = {
  id: string;
  meeting_id: string;
  meeting_participant_id: string;
  checkin_kind: string;
  recorded_at: string;
};

type GeolocationSampleRow = {
  id: string;
  meeting_id: string;
  meeting_participant_id: string | null;
  meeting_checkin_id: string | null;
  latitude: number | string;
  longitude: number | string;
  accuracy_meters: number | string | null;
  captured_at: string;
};

type ProximityEvaluationRow = {
  id: string;
  meeting_id: string;
  member_sample_id: string | null;
  notary_sample_id: string | null;
  status: string;
  observed_distance_meters: number | string | null;
};

type IdentityVerificationEventRow = {
  id: string;
  meeting_id: string;
  meeting_participant_id: string;
  verification_method: string;
  status: string;
  verified_at: string | null;
};

type MeetingArtifactRow = {
  id: string;
  meeting_id: string;
  meeting_checkin_id: string | null;
  identity_verification_event_id: string | null;
  artifact_kind: string;
  storage_path: string | null;
};

type NotificationJobRow = {
  id: string;
  dedupe_key: string | null;
  status: string | null;
};

type NotificationDeliveryRow = {
  id: string;
  notification_job_id: string;
  recipient_address: string | null;
  status: string | null;
};

type MeetingSnapshot = {
  meeting: MeetingRow | null;
  participants: MeetingParticipantRow[];
  checkins: MeetingCheckinRow[];
  geolocationSamples: GeolocationSampleRow[];
  proximityEvaluations: ProximityEvaluationRow[];
  identityVerificationEvents: IdentityVerificationEventRow[];
  artifacts: MeetingArtifactRow[];
  notificationJobs: NotificationJobRow[];
  notificationDeliveries: NotificationDeliveryRow[];
};

type BootstrappedRequest = {
  label: string;
  documentId: string;
  requestId: string;
  workflowId: string;
  codeId: string;
  selectedNotaryUserId: string;
};

type ActiveRoleSnapshot = {
  userId: string;
  previousUserRole: string | null;
  previousActiveRoleIds: string[];
};

const jsonHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
});

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertTruthy = (value: unknown, message: string) => {
  if (!value) {
    throw new Error(message);
  }
};

const assertStatus = (
  response: Response,
  payload: unknown,
  expectedStatus: number,
  message: string,
) => {
  if (response.status !== expectedStatus) {
    console.error("Unexpected status", {
      expectedStatus,
      actualStatus: response.status,
      payload,
    });
    throw new Error(message);
  }
};

const decodeAccessToken = (accessToken: string): DecodedAccessToken => {
  const [, payloadSegment] = accessToken.split(".");
  assertTruthy(payloadSegment, "Access token payload is missing");

  const normalized = payloadSegment!
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(payloadSegment!.length / 4) * 4, "=");
  const decoded = Buffer.from(normalized, "base64").toString("utf8");

  return JSON.parse(decoded) as DecodedAccessToken;
};

const getTokenRole = (decoded: DecodedAccessToken) => {
  return decoded.app_metadata?.role ?? decoded.user_metadata?.role ?? decoded.role ?? null;
};

const isAccessTokenExpired = (accessToken: string) => {
  const decoded = decodeAccessToken(accessToken);
  if (!decoded.exp) {
    return false;
  }

  return decoded.exp <= Math.floor(Date.now() / 1000) + 60;
};

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
};

const captureAndSetActiveRole = async (
  userId: string,
  role: "member" | "notary",
): Promise<ActiveRoleSnapshot> => {
  const [{ data: userData, error: userError }, { data: activeRoleRows, error: activeRoleError }] =
    await Promise.all([
      supabaseAdmin.from("users").select("role").eq("id", userId).limit(1).maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("is_active_profile", true),
    ]);

  if (userError) {
    throw new Error(userError.message);
  }

  if (activeRoleError) {
    throw new Error(activeRoleError.message);
  }

  const snapshot: ActiveRoleSnapshot = {
    userId,
    previousUserRole: (userData?.role as string | undefined) ?? null,
    previousActiveRoleIds: (activeRoleRows ?? []).map((row) => row.id as string),
  };

  const { error: clearActiveRoleError } = await supabaseAdmin
    .from("user_roles")
    .update({ is_active_profile: false })
    .eq("user_id", userId)
    .eq("is_active_profile", true);

  if (clearActiveRoleError) {
    throw new Error(clearActiveRoleError.message);
  }

  const { data: selectedRoleRow, error: selectedRoleError } = await supabaseAdmin
    .from("user_roles")
    .update({ is_active_profile: true })
    .eq("user_id", userId)
    .eq("role", role)
    .eq("status", "active")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (selectedRoleError) {
    throw new Error(selectedRoleError.message);
  }

  assertTruthy(selectedRoleRow?.id, `Unable to activate the ${role} profile for ${userId}`);

  const { error: updateUserError } = await supabaseAdmin
    .from("users")
    .update({ role })
    .eq("id", userId);

  if (updateUserError) {
    throw new Error(updateUserError.message);
  }

  return snapshot;
};

const restoreActiveRole = async (snapshot: ActiveRoleSnapshot) => {
  const { error: clearActiveRoleError } = await supabaseAdmin
    .from("user_roles")
    .update({ is_active_profile: false })
    .eq("user_id", snapshot.userId)
    .eq("is_active_profile", true);

  if (clearActiveRoleError) {
    throw new Error(clearActiveRoleError.message);
  }

  if (snapshot.previousActiveRoleIds.length > 0) {
    const { error: restoreActiveRoleError } = await supabaseAdmin
      .from("user_roles")
      .update({ is_active_profile: true })
      .in("id", snapshot.previousActiveRoleIds);

    if (restoreActiveRoleError) {
      throw new Error(restoreActiveRoleError.message);
    }
  }

  if (snapshot.previousUserRole) {
    const { error: restoreUserRoleError } = await supabaseAdmin
      .from("users")
      .update({ role: snapshot.previousUserRole })
      .eq("id", snapshot.userId);

    if (restoreUserRoleError) {
      throw new Error(restoreUserRoleError.message);
    }
  }
};

const apiPost = async <TResponse>(
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as TResponse;
  return { response, payload };
};

const apiGet = async <TResponse>(accessToken: string, path: string) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: jsonHeaders(accessToken),
  });
  const payload = (await response.json().catch(() => ({}))) as TResponse;
  return { response, payload };
};

const createPdfBuffer = (byteLength: number) => {
  const header = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 120 Td (DARCi Phase 5) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
    "utf8",
  );

  if (byteLength <= header.length) {
    return header;
  }

  const padding = Buffer.alloc(byteLength - header.length, 0x20);
  return Buffer.concat([header, padding]);
};

const uploadToSignedUrl = async (
  signedUrl: string,
  buffer: Buffer,
  contentType: string,
) => {
  const response = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: new Uint8Array(buffer),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Signed upload failed: ${response.status} ${body}`);
  }
};

const getInternalUserIdForAccessToken = async (accessToken: string) => {
  const decoded = decodeAccessToken(accessToken);
  assertTruthy(decoded.sub, "Access token sub claim is missing");

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("supabase_user_id", decoded.sub)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  assertTruthy(data?.id, "Unable to resolve internal user id from access token");
  return data!.id as string;
};

const resolveFallbackMemberUser = async () => {
  let memberUserId = process.env.MEMBER_USER_ID ?? null;

  if (!memberUserId) {
    const { data: memberRoleRow, error: memberRoleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "member")
      .eq("status", "active")
      .order("is_active_profile", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memberRoleError) {
      throw new Error(memberRoleError.message);
    }

    memberUserId = memberRoleRow?.user_id ?? null;
  }

  assertTruthy(
    memberUserId,
    "Unable to find a staging user with an active member role assignment for fallback token minting",
  );

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email")
    .eq("id", memberUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  assertTruthy(data?.id, "Fallback member user record is missing");
  assertTruthy(
    data?.supabase_user_id,
    "Fallback member user is missing a supabase_user_id",
  );

  return data as FallbackAuthUserRecord;
};

const resolveFallbackNotaryUser = async () => {
  let notaryUserId = process.env.NOTARY_USER_ID ?? null;

  if (!notaryUserId) {
    const { data: notaryRoleRow, error: notaryRoleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "notary")
      .eq("status", "active")
      .order("is_active_profile", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (notaryRoleError) {
      throw new Error(notaryRoleError.message);
    }

    notaryUserId = notaryRoleRow?.user_id ?? null;
  }

  assertTruthy(
    notaryUserId,
    "Unable to find a staging user with an active notary role assignment for fallback token minting",
  );

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email")
    .eq("id", notaryUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  assertTruthy(data?.id, "Fallback notary user record is missing");
  assertTruthy(
    data?.supabase_user_id,
    "Fallback notary user is missing a supabase_user_id",
  );

  return data as FallbackAuthUserRecord;
};

const resolveMemberAuthContext = async (): Promise<RuntimeAuthContext> => {
  if (configuredMemberAccessToken && !isAccessTokenExpired(configuredMemberAccessToken)) {
    const decoded = decodeAccessToken(configuredMemberAccessToken);
    if (getTokenRole(decoded) === "member") {
      return {
        accessToken: configuredMemberAccessToken,
        internalUserId: await getInternalUserIdForAccessToken(configuredMemberAccessToken),
        supabaseUserId: decoded.sub!,
        source: "env_token",
        role: "member",
      };
    }

    console.warn("Configured member token is not member-scoped; minting fallback JWT", {
      tokenRole: getTokenRole(decoded),
    });
  }

  assertTruthy(
    supabaseJwtSecret,
    "SUPABASE_JWT_SECRET is required when a live member access token is not provided",
  );

  const memberUser = await resolveFallbackMemberUser();
  const fallbackToken = jwt.sign(
    {
      sub: memberUser.supabase_user_id,
      email: memberUser.email ?? undefined,
      role: "member",
      aud: "authenticated",
      iss: `${supabaseUrl}/auth/v1`,
      app_metadata: {
        role: "member",
      },
    },
    supabaseJwtSecret!,
    {
      expiresIn: "1h",
      algorithm: "HS256",
    },
  );

  return {
    accessToken: fallbackToken,
    internalUserId: memberUser.id,
    supabaseUserId: memberUser.supabase_user_id,
    source: "jwt_fallback",
    role: "member",
  };
};

const resolveNotaryAuthContext = async (): Promise<RuntimeAuthContext> => {
  if (configuredNotaryAccessToken && !isAccessTokenExpired(configuredNotaryAccessToken)) {
    const decoded = decodeAccessToken(configuredNotaryAccessToken);
    if (getTokenRole(decoded) === "notary") {
      return {
        accessToken: configuredNotaryAccessToken,
        internalUserId: await getInternalUserIdForAccessToken(configuredNotaryAccessToken),
        supabaseUserId: decoded.sub!,
        source: "env_token",
        role: "notary",
      };
    }

    console.warn("Configured notary token is not notary-scoped; minting fallback JWT", {
      tokenRole: getTokenRole(decoded),
    });
  }

  assertTruthy(
    supabaseJwtSecret,
    "SUPABASE_JWT_SECRET is required when NOTARY_ACCESS_TOKEN is not provided",
  );

  const notaryUser = await resolveFallbackNotaryUser();
  const fallbackToken = jwt.sign(
    {
      sub: notaryUser.supabase_user_id,
      email: notaryUser.email ?? undefined,
      role: "notary",
      aud: "authenticated",
      iss: `${supabaseUrl}/auth/v1`,
      app_metadata: {
        role: "notary",
      },
    },
    supabaseJwtSecret!,
    {
      expiresIn: "1h",
      algorithm: "HS256",
    },
  );

  return {
    accessToken: fallbackToken,
    internalUserId: notaryUser.id,
    supabaseUserId: notaryUser.supabase_user_id,
    source: "jwt_fallback",
    role: "notary",
  };
};

let activeNotaryAuthContext: RuntimeAuthContext | null = null;
let activeMemberAuthContext: RuntimeAuthContext | null = null;

const createDocument = async (label: string) => {
  const pdfBuffer = createPdfBuffer(512 * 1024);
  const createResult = await apiPost<DocumentResponse>(activeMemberAuthContext!.accessToken, "/documents", {
    fileName: `${label}.pdf`,
    fileSize: pdfBuffer.length,
    mimeType: "application/pdf",
    documentType: "generic",
    jurisdiction: "US-OH",
  });

  assertStatus(createResult.response, createResult.payload, 201, "Document create should return 201");
  assertTruthy(createResult.payload.upload?.signedUrl, "Document upload URL is missing");

  await uploadToSignedUrl(createResult.payload.upload!.signedUrl, pdfBuffer, "application/pdf");

  const finalizeResult = await apiPost<DocumentResponse>(
    activeMemberAuthContext!.accessToken,
    `/documents/${createResult.payload.document.id}/upload-finalize`,
    {
      documentVersionId: createResult.payload.version.id,
    },
  );

  assertStatus(finalizeResult.response, finalizeResult.payload, 200, "Document finalize should return 200");
  assert(
    finalizeResult.payload.document.status === "pending_review",
    "Document should be in pending_review after upload finalize",
  );

  const reviewApprovalResult = await apiPost<ReviewApprovalResponse>(
    activeMemberAuthContext!.accessToken,
    `/documents/${createResult.payload.document.id}/review-approval`,
    {
      agreed: true,
    },
  );

  assertStatus(
    reviewApprovalResult.response,
    reviewApprovalResult.payload,
    200,
    "Document review approval should return 200",
  );
  assert(
    reviewApprovalResult.payload.reviewApproval?.signingReady === true,
    "Uploaded-document signing should be ready after review approval",
  );
  assert(
    reviewApprovalResult.payload.document.status === "pending_signature",
    "Document should be in pending_signature before notarization submit",
  );

  const signingResult = await apiGet<DocumentSigningResponse>(
    activeMemberAuthContext!.accessToken,
    `/documents/${createResult.payload.document.id}/signing`,
  );

  assertStatus(
    signingResult.response,
    signingResult.payload,
    200,
    "Document signing state should return 200 after review approval",
  );
  assert(
    signingResult.payload.signing.allOutputsReady === true,
    "Uploaded-document signing outputs should be ready after review approval",
  );
  assert(
    signingResult.payload.signing.missingOutputKeys.length === 0,
    "Uploaded-document signing state should not report missing outputs",
  );

  return createResult.payload.document.id;
};

const submitNotarization = async (input: {
  documentId: string;
  selectedNotaryUserId: string;
}) => {
  const result = await apiPost<NotarizationSubmitResponse>(
    activeMemberAuthContext!.accessToken,
    `/documents/${input.documentId}/submit-notarization`,
    {
      selectedNotaryUserId: input.selectedNotaryUserId,
    },
  );

  assertStatus(result.response, result.payload, 201, "Submit notarization should return 201");
  assertTruthy(result.payload.request.id, "Notarization request id is missing");
  assertTruthy(result.payload.code.id, "Notarization code id is missing");
  assertTruthy(result.payload.workflow?.id, "Workflow response is missing");
  assert(
    result.payload.document.status === "pending_notary",
    "Document should move to pending_notary after submit",
  );
  assert(
    result.payload.workflow?.status === "code_delivered",
    "Workflow should be in code_delivered after submit",
  );

  return result.payload;
};

const resolveCode = async (code: string) => {
  const result = await apiPost<NotaryCodeResolveResponse>(
    activeNotaryAuthContext!.accessToken,
    "/notary/code/resolve",
    { code },
  );

  assertStatus(result.response, result.payload, 200, "Resolve code should return 200");
  assert(result.payload.request.status === "in_review", "Resolved request should be in_review");
  assert(result.payload.code.status === "consumed", "Resolved code should be consumed");
  assert(
    result.payload.workflow?.status === "in_review",
    "Workflow should be in_review after resolve",
  );

  return result.payload;
};

const fetchMeetingSnapshot = async (requestId: string): Promise<MeetingSnapshot> => {
  const { data: meetingData, error: meetingError } = await supabaseAdmin
    .from("meetings")
    .select(
      "id, request_id, workflow_id, scheduled_at, timezone, location, status, same_place_required, same_place_status, evidence_retention_until",
    )
    .eq("request_id", requestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (meetingError) {
    throw new Error(meetingError.message);
  }

  const { data: notificationJobsData, error: notificationJobsError } = await supabaseAdmin
    .from("notification_jobs")
    .select("id, dedupe_key, status")
    .eq("notarization_request_id", requestId)
    .like("dedupe_key", `meeting_scheduled:${requestId}:%`)
    .order("created_at", { ascending: true });

  if (notificationJobsError) {
    throw new Error(notificationJobsError.message);
  }

  const notificationJobs = (notificationJobsData ?? []) as unknown as NotificationJobRow[];
  const notificationJobIds = notificationJobs.map((job) => job.id);

  let notificationDeliveries: NotificationDeliveryRow[] = [];
  if (notificationJobIds.length > 0) {
    const { data: notificationDeliveriesData, error: notificationDeliveriesError } = await supabaseAdmin
      .from("notification_deliveries")
      .select("id, notification_job_id, recipient_address, status")
      .in("notification_job_id", notificationJobIds)
      .order("created_at", { ascending: true });

    if (notificationDeliveriesError) {
      throw new Error(notificationDeliveriesError.message);
    }

    notificationDeliveries =
      (notificationDeliveriesData ?? []) as unknown as NotificationDeliveryRow[];
  }

  const meeting = (meetingData as unknown as MeetingRow | null) ?? null;
  if (!meeting) {
    return {
      meeting: null,
      participants: [],
      checkins: [],
      geolocationSamples: [],
      proximityEvaluations: [],
      identityVerificationEvents: [],
      artifacts: [],
      notificationJobs,
      notificationDeliveries,
    };
  }

  const [
    participantsResult,
    checkinsResult,
    geolocationSamplesResult,
    proximityEvaluationsResult,
    identityVerificationEventsResult,
    artifactsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("meeting_participants")
      .select("id, meeting_id, user_id, participant_role, status, arrived_at, departed_at")
      .eq("meeting_id", meeting.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("meeting_checkins")
      .select("id, meeting_id, meeting_participant_id, checkin_kind, recorded_at")
      .eq("meeting_id", meeting.id)
      .order("recorded_at", { ascending: true }),
    supabaseAdmin
      .from("geolocation_samples")
      .select(
        "id, meeting_id, meeting_participant_id, meeting_checkin_id, latitude, longitude, accuracy_meters, captured_at",
      )
      .eq("meeting_id", meeting.id)
      .order("captured_at", { ascending: true }),
    supabaseAdmin
      .from("proximity_evaluations")
      .select("id, meeting_id, member_sample_id, notary_sample_id, status, observed_distance_meters")
      .eq("meeting_id", meeting.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("identity_verification_events")
      .select("id, meeting_id, meeting_participant_id, verification_method, status, verified_at")
      .eq("meeting_id", meeting.id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("meeting_artifacts")
      .select(
        "id, meeting_id, meeting_checkin_id, identity_verification_event_id, artifact_kind, storage_path",
      )
      .eq("meeting_id", meeting.id)
      .order("created_at", { ascending: true }),
  ]);

  for (const result of [
    participantsResult,
    checkinsResult,
    geolocationSamplesResult,
    proximityEvaluationsResult,
    identityVerificationEventsResult,
    artifactsResult,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  return {
    meeting,
    participants: (participantsResult.data ?? []) as unknown as MeetingParticipantRow[],
    checkins: (checkinsResult.data ?? []) as unknown as MeetingCheckinRow[],
    geolocationSamples:
      (geolocationSamplesResult.data ?? []) as unknown as GeolocationSampleRow[],
    proximityEvaluations:
      (proximityEvaluationsResult.data ?? []) as unknown as ProximityEvaluationRow[],
    identityVerificationEvents:
      (identityVerificationEventsResult.data ?? []) as unknown as IdentityVerificationEventRow[],
    artifacts: (artifactsResult.data ?? []) as unknown as MeetingArtifactRow[],
    notificationJobs,
    notificationDeliveries,
  };
};

const findParticipant = (snapshot: MeetingSnapshot, participantRole: "member" | "notary") => {
  return snapshot.participants.find((participant) => participant.participant_role === participantRole) ?? null;
};

const bootstrapResolvedRequest = async (label: string): Promise<BootstrappedRequest> => {
  const documentId = await createDocument(label);
  const submitPayload = await submitNotarization({
    documentId,
    selectedNotaryUserId: activeNotaryAuthContext!.internalUserId,
  });

  const workflowId = submitPayload.workflow?.id;
  assertTruthy(workflowId, "Workflow id is missing from submit response");

  await resolveCode(submitPayload.code.code);

  return {
    label,
    documentId,
    requestId: submitPayload.request.id,
    workflowId: workflowId!,
    codeId: submitPayload.code.id,
    selectedNotaryUserId: activeNotaryAuthContext!.internalUserId,
  };
};

const scenarioAnchor = Date.now() + 60 * 60 * 1000;
const minutesFromAnchor = (minutes: number) => {
  return new Date(scenarioAnchor + minutes * 60 * 1000).toISOString();
};

const runHappyPathScenario = async (runId: string) => {
  const label = `phase5-meeting-${runId}-happy`;
  const location = `DARCi Smoke Room ${runId}`;
  const scenario = await bootstrapResolvedRequest(label);
  const proposedAt = minutesFromAnchor(60);
  const rescheduledAt = minutesFromAnchor(90);
  const memberArrivalAt = minutesFromAnchor(91);
  const notaryArrivalAt = minutesFromAnchor(92);
  const identityVerifiedAt = minutesFromAnchor(93);
  const proximityEvaluatedAt = minutesFromAnchor(94);
  const artifactCapturedAt = minutesFromAnchor(95);
  const retentionUntil = minutesFromAnchor(60 * 24 * 30);

  const proposeResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/propose`,
    {
      proposedSlots: [proposedAt, rescheduledAt],
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(proposeResult.response, proposeResult.payload, 200, "Meeting propose should return 200");
  assert(
    proposeResult.payload.meeting.participants.length >= 2,
    "Meeting proposal should seed default participants",
  );

  let snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assertTruthy(snapshot.meeting, "Meeting row is missing after proposal");
  assert(
    snapshot.meeting?.workflow_id === scenario.workflowId,
    "Meeting workflow_id should match the Phase 4 workflow",
  );
  assert(findParticipant(snapshot, "member") !== null, "Meeting member participant is missing");
  assert(findParticipant(snapshot, "notary") !== null, "Meeting notary participant is missing");

  const confirmResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/confirm`,
    {
      scheduledAt: proposedAt,
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(confirmResult.response, confirmResult.payload, 200, "Meeting confirm should return 200");
  assert(confirmResult.payload.meeting.status === "scheduled", "Meeting should be scheduled after confirm");

  snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(snapshot.meeting?.status === "scheduled", "Meeting row should be scheduled after confirm");
  assert(
    findParticipant(snapshot, "notary")?.status === "confirmed",
    "Notary participant should be confirmed after confirm",
  );
  assert(
    snapshot.notificationJobs.length === 1,
    "Initial confirm should queue one meeting scheduled notification",
  );
  assert(
    snapshot.notificationDeliveries.length >= 1,
    "Initial confirm should fan out at least one delivery",
  );

  const rescheduleResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/reschedule`,
    {
      scheduledAt: rescheduledAt,
      timezone: "America/New_York",
      location,
      rescheduleReason: "Smoke test reschedule",
    },
  );

  assertStatus(
    rescheduleResult.response,
    rescheduleResult.payload,
    200,
    "Meeting reschedule should return 200",
  );
  assert(
    rescheduleResult.payload.meeting.status === "rescheduled",
    "Meeting should be rescheduled after reschedule",
  );

  snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(snapshot.meeting?.status === "rescheduled", "Meeting row should be rescheduled");
  assert(
    findParticipant(snapshot, "notary")?.status === "expected",
    "Reschedule should reset the notary participant confirmation",
  );
  assert(
    snapshot.notificationJobs.length === 2,
    "Reschedule should queue a second meeting scheduled notification",
  );

  const confirmRescheduledResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/confirm`,
    {
      scheduledAt: rescheduledAt,
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(
    confirmRescheduledResult.response,
    confirmRescheduledResult.payload,
    200,
    "Meeting reconfirm should return 200",
  );

  snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(snapshot.meeting?.status === "scheduled", "Meeting should be scheduled after reconfirm");
  assert(
    findParticipant(snapshot, "notary")?.status === "confirmed",
    "Reconfirm should mark the notary participant confirmed again",
  );
  assert(
    snapshot.notificationJobs.length === 2,
    "Reconfirm for the same slot should reuse the reschedule dedupe key",
  );

  const memberCheckinResult = await apiPost<MeetingApiResponse>(
    activeMemberAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/check-in`,
    {
      participantRole: "member",
      checkinKind: "arrival",
      recordedAt: memberArrivalAt,
      notes: "Member arrived for smoke validation",
      geolocation: {
        latitude: 41.4993,
        longitude: -81.6944,
        accuracyMeters: 8,
      },
    },
  );

  assertStatus(
    memberCheckinResult.response,
    memberCheckinResult.payload,
    201,
    "Member arrival check-in should return 201",
  );

  const notaryCheckinResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/check-in`,
    {
      participantRole: "notary",
      checkinKind: "arrival",
      recordedAt: notaryArrivalAt,
      notes: "Notary arrived for smoke validation",
      geolocation: {
        latitude: 41.49935,
        longitude: -81.69435,
        accuracyMeters: 7,
      },
    },
  );

  assertStatus(
    notaryCheckinResult.response,
    notaryCheckinResult.payload,
    201,
    "Notary arrival check-in should return 201",
  );

  snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(
    snapshot.checkins.filter((checkin) => checkin.checkin_kind === "arrival").length >= 2,
    "Happy-path scenario should persist two arrival check-ins",
  );
  assert(
    snapshot.geolocationSamples.length >= 2,
    "Happy-path scenario should persist two geolocation samples",
  );
  assert(
    findParticipant(snapshot, "member")?.status === "checked_in",
    "Member participant should be checked_in after member arrival",
  );
  assert(
    findParticipant(snapshot, "notary")?.status === "checked_in",
    "Notary participant should be checked_in after notary arrival",
  );

  const identityResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/identity-verification`,
    {
      participantRole: "member",
      verificationMethod: "in_person_document",
      subjectName: "Phase Five Member",
      documentType: "passport",
      documentLast4: "1234",
      issuingJurisdiction: "US",
      verifiedAt: identityVerifiedAt,
      notes: "Passport verified during staging smoke",
    },
  );

  assertStatus(
    identityResult.response,
    identityResult.payload,
    201,
    "Identity verification should return 201",
  );
  assert(
    identityResult.payload.identityVerification?.status === "verified",
    "Identity verification response should be verified",
  );
  assert(
    identityResult.payload.checkin?.checkinKind === "identity",
    "Identity verification should create an identity check-in",
  );

  const identityEventId = identityResult.payload.identityVerification?.id;
  const identityCheckinId = identityResult.payload.checkin?.id;
  assertTruthy(identityEventId, "Identity verification event id is missing");
  assertTruthy(identityCheckinId, "Identity verification check-in id is missing");

  snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(
    snapshot.identityVerificationEvents.some(
      (event) => event.id === identityEventId && event.status === "verified",
    ),
    "Identity verification event row is missing after identity verification",
  );
  assert(
    snapshot.checkins.some((checkin) => checkin.id === identityCheckinId && checkin.checkin_kind === "identity"),
    "Identity verification check-in row is missing after identity verification",
  );

  const proximityResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/proximity-evaluation`,
    {
      thresholdMeters: 100,
      evaluatedAt: proximityEvaluatedAt,
      notes: "Within same-place threshold during smoke validation",
    },
  );

  assertStatus(
    proximityResult.response,
    proximityResult.payload,
    201,
    "Proximity evaluation should return 201",
  );
  assert(
    proximityResult.payload.evaluation?.status === "passed",
    "Proximity evaluation should pass for nearby samples",
  );

  snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(
    snapshot.meeting?.same_place_status === "passed",
    "Meeting same_place_status should be passed after proximity evaluation",
  );
  assert(
    snapshot.proximityEvaluations.some((evaluation) => evaluation.status === "passed"),
    "Proximity evaluation row is missing after proximity evaluation",
  );
  assert(
    (snapshot.proximityEvaluations[0] ? toNumber(snapshot.proximityEvaluations[0].observed_distance_meters) : null) !== null,
    "Proximity evaluation should record an observed distance",
  );

  const artifactResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/artifacts`,
    {
      participantRole: "member",
      meetingCheckinId: identityCheckinId,
      identityVerificationEventId: identityEventId,
      artifactKind: "identity_document",
      storageBucket: "documents",
      storagePath: `meeting-evidence/${runId}/identity-document.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 2048,
      capturedAt: artifactCapturedAt,
      retentionUntil,
      notes: "Artifact captured during staging smoke",
    },
  );

  assertStatus(
    artifactResult.response,
    artifactResult.payload,
    201,
    "Meeting artifact creation should return 201",
  );
  assert(
    artifactResult.payload.artifact?.artifactKind === "identity_document",
    "Meeting artifact response should expose the identity_document kind",
  );

  snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(
    snapshot.artifacts.some(
      (artifact) =>
        artifact.meeting_checkin_id === identityCheckinId &&
        artifact.identity_verification_event_id === identityEventId &&
        artifact.artifact_kind === "identity_document",
    ),
    "Meeting artifact row is missing after artifact creation",
  );

  console.log("Happy-path Phase 5 meeting smoke scenario complete", {
    requestId: scenario.requestId,
    workflowId: scenario.workflowId,
    meetingId: snapshot.meeting?.id,
    participantCount: snapshot.participants.length,
    checkinCount: snapshot.checkins.length,
    geolocationCount: snapshot.geolocationSamples.length,
    evaluationCount: snapshot.proximityEvaluations.length,
    identityEventCount: snapshot.identityVerificationEvents.length,
    artifactCount: snapshot.artifacts.length,
    meetingNotificationJobCount: snapshot.notificationJobs.length,
  });
};

const runCancellationScenario = async (runId: string) => {
  const label = `phase5-meeting-${runId}-cancel`;
  const location = `DARCi Smoke Room ${runId} Cancel`;
  const scenario = await bootstrapResolvedRequest(label);
  const scheduledAt = minutesFromAnchor(120);

  const proposeResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/propose`,
    {
      proposedSlots: [scheduledAt],
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(proposeResult.response, proposeResult.payload, 200, "Cancel scenario proposal should return 200");

  const confirmResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/confirm`,
    {
      scheduledAt,
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(confirmResult.response, confirmResult.payload, 200, "Cancel scenario confirm should return 200");

  const cancelResult = await apiPost<MeetingApiResponse>(
    activeMemberAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/cancel`,
    {
      cancelledBy: "member",
      cancellationReason: "Smoke test cancellation",
    },
  );

  assertStatus(cancelResult.response, cancelResult.payload, 200, "Meeting cancel should return 200");
  assert(cancelResult.payload.meeting.status === "cancelled", "Cancel response should set meeting status to cancelled");

  const snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(snapshot.meeting?.status === "cancelled", "Meeting row should be cancelled");
  assert(
    snapshot.participants.every((participant) => participant.status === "canceled"),
    "Cancel should mark unresolved participants canceled",
  );

  console.log("Cancellation Phase 5 meeting smoke scenario complete", {
    requestId: scenario.requestId,
    workflowId: scenario.workflowId,
    meetingId: snapshot.meeting?.id,
  });
};

const runNoShowScenario = async (runId: string) => {
  const label = `phase5-meeting-${runId}-no-show`;
  const location = `DARCi Smoke Room ${runId} No Show`;
  const scenario = await bootstrapResolvedRequest(label);
  const scheduledAt = minutesFromAnchor(180);
  const recordedAt = minutesFromAnchor(181);

  const proposeResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/propose`,
    {
      proposedSlots: [scheduledAt],
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(proposeResult.response, proposeResult.payload, 200, "No-show scenario proposal should return 200");

  const confirmResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/confirm`,
    {
      scheduledAt,
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(confirmResult.response, confirmResult.payload, 200, "No-show scenario confirm should return 200");

  const noShowResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${scenario.requestId}/meeting/no-show`,
    {
      noShowParty: "member",
      recordedAt,
      notes: "Member absent during staging smoke",
    },
  );

  assertStatus(noShowResult.response, noShowResult.payload, 200, "Meeting no-show should return 200");
  assert(noShowResult.payload.meeting.status === "no_show", "No-show response should set meeting status to no_show");

  const snapshot = await fetchMeetingSnapshot(scenario.requestId);
  assert(snapshot.meeting?.status === "no_show", "Meeting row should be no_show");
  assert(
    findParticipant(snapshot, "member")?.status === "no_show",
    "No-show should mark the member participant as no_show",
  );

  console.log("No-show Phase 5 meeting smoke scenario complete", {
    requestId: scenario.requestId,
    workflowId: scenario.workflowId,
    meetingId: snapshot.meeting?.id,
  });
};

const main = async () => {
  const runId = randomUUID().slice(0, 8);
  const activeRoleSnapshots: ActiveRoleSnapshot[] = [];

  console.log("Running Phase 5 meeting staging smoke test...", {
    apiBaseUrl,
    runId,
  });

  try {
    activeMemberAuthContext = await resolveMemberAuthContext();
    activeNotaryAuthContext = await resolveNotaryAuthContext();

    activeRoleSnapshots.push(
      await captureAndSetActiveRole(activeMemberAuthContext.internalUserId, "member"),
    );
    activeRoleSnapshots.push(
      await captureAndSetActiveRole(activeNotaryAuthContext.internalUserId, "notary"),
    );

    console.log("Using member auth context", {
      source: activeMemberAuthContext.source,
      memberUserId: activeMemberAuthContext.internalUserId,
    });
    console.log("Using notary auth context", {
      source: activeNotaryAuthContext.source,
      notaryUserId: activeNotaryAuthContext.internalUserId,
    });

    await runHappyPathScenario(runId);
    await runCancellationScenario(runId);
    await runNoShowScenario(runId);
  } finally {
    for (const snapshot of activeRoleSnapshots.reverse()) {
      await restoreActiveRole(snapshot);
    }
  }

  console.log("Phase 5 meeting staging smoke test complete.", {
    runId,
  });
};

main().catch((error) => {
  console.error("Phase 5 meeting staging smoke test failed", error);
  process.exit(1);
});