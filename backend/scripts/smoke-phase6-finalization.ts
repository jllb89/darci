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
  ["NOTARY_ACCESS_TOKEN or SUPABASE_JWT_SECRET", configuredNotaryAccessToken ?? supabaseJwtSecret],
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
};

type AcknowledgmentResponse = {
  status: string;
  documentId: string;
  requestId: string;
  acknowledgmentPage: {
    id: string;
    jurisdiction: string | null;
    content: string | null;
    createdAt: string;
  };
  execution: {
    id: string;
    kind: string;
    status: string;
    sourceDocumentVersionId: string;
    outputDocumentVersionId: string | null;
    templateId: string | null;
    templateVersion: string | null;
    watermarkText: string | null;
    completedAt: string | null;
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
};

type WatermarkResponse = {
  status: string;
  documentId: string;
  requestId: string;
  execution: {
    id: string;
    kind: string;
    status: string;
    sourceDocumentVersionId: string;
    outputDocumentVersionId: string | null;
    templateId: string | null;
    templateVersion: string | null;
    watermarkText: string | null;
    completedAt: string | null;
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
  hashRecord: {
    id: string;
    algorithm: string;
    hash: string;
    status: string;
    completedAt: string | null;
  };
  ledger: {
    id: string;
    ledgerTxId: string | null;
    anchoredAt: string | null;
    status: string;
  };
};

type VerificationResponse = {
  idn: string;
  hash: string | null;
  ledgerTxId: string | null;
  anchoredAt: string | null;
  status: string;
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

type ActiveRoleSnapshot = {
  userId: string;
  previousUserRole: string | null;
  previousActiveRoleIds: string[];
};

type ExecutionRunRow = {
  id: string;
  document_id: string;
  source_document_version_id: string;
  output_document_version_id: string | null;
  execution_kind: string;
  status: string;
  template_id: string | null;
  template_version: string | null;
  watermark_text: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type DocumentHashRecordRow = {
  id: string;
  document_id: string;
  document_version_id: string;
  execution_run_id: string | null;
  algorithm: string;
  hash: string;
  status: string;
  created_at: string;
};

type LedgerEntryRow = {
  id: string;
  document_id: string;
  idn: string;
  hash: string;
  ledger_tx_id: string | null;
  anchored_at: string | null;
  created_at: string;
};

type LedgerAnchorAttemptRow = {
  id: string;
  document_id: string;
  document_hash_record_id: string;
  ledger_entry_id: string | null;
  status: string;
  attempt_number: number;
  response_payload: Record<string, unknown>;
  created_at: string;
};

type VerificationCheckRow = {
  id: string;
  document_id: string | null;
  document_hash_record_id: string | null;
  ledger_entry_id: string | null;
  idn: string;
  result_status: string;
  created_at: string;
};

type FinalizationStatusHistoryRow = {
  id: string;
  document_id: string;
  execution_run_id: string | null;
  document_hash_record_id: string | null;
  ledger_anchor_attempt_id: string | null;
  status: string;
  change_source: string;
  created_at: string;
};

type DocumentRow = {
  id: string;
  idn: string | null;
  status: string | null;
};

type RequestRow = {
  id: string;
  status: string | null;
  workflow_id: string | null;
};

type WorkflowRow = {
  id: string;
  status: string;
  closed_at: string | null;
};

type DocumentVersionRow = {
  id: string;
  version: number;
  is_final: boolean | null;
  storage_path: string | null;
  created_at: string;
};

type FinalizationSnapshot = {
  document: DocumentRow | null;
  request: RequestRow | null;
  workflow: WorkflowRow | null;
  finalVersions: DocumentVersionRow[];
  executionRuns: ExecutionRunRow[];
  hashRecords: DocumentHashRecordRow[];
  ledgerEntries: LedgerEntryRow[];
  ledgerAnchorAttempts: LedgerAnchorAttemptRow[];
  verificationChecks: VerificationCheckRow[];
  finalizationHistory: FinalizationStatusHistoryRow[];
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

const createPdfBuffer = (byteLength: number) => {
  const header = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 120 Td (DARCi Phase 6) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
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

const apiGet = async <TResponse>(path: string, accessToken?: string) => {
  const requestInit: RequestInit = {
    method: "GET",
  };

  if (accessToken) {
    requestInit.headers = jsonHeaders(accessToken);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, requestInit);
  const payload = (await response.json().catch(() => ({}))) as TResponse;
  return { response, payload };
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

const resolveFallbackUserForRole = async (role: "member" | "notary") => {
  const envUserId = role === "member" ? process.env.MEMBER_USER_ID : process.env.NOTARY_USER_ID;
  let userId = envUserId ?? null;

  if (!userId) {
    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", role)
      .eq("status", "active")
      .order("is_active_profile", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (roleError) {
      throw new Error(roleError.message);
    }

    userId = roleRow?.user_id ?? null;
  }

  assertTruthy(userId, `Unable to find a staging user with an active ${role} role assignment`);

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email")
    .eq("id", userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  assertTruthy(data?.id, `Fallback ${role} user record is missing`);
  assertTruthy(data?.supabase_user_id, `Fallback ${role} user is missing a supabase_user_id`);

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

  const memberUser = await resolveFallbackUserForRole("member");
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

  const notaryUser = await resolveFallbackUserForRole("notary");
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
    `/documents/${createResult.payload.document.id}/signing`,
    activeMemberAuthContext!.accessToken,
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

  return {
    documentId: createResult.payload.document.id,
    idn: reviewApprovalResult.payload.document.idn,
  };
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

const scenarioAnchor = Date.now() + 60 * 60 * 1000;
const minutesFromAnchor = (minutes: number) => {
  return new Date(scenarioAnchor + minutes * 60 * 1000).toISOString();
};

const completeMeeting = async (requestId: string, runId: string) => {
  const location = `DARCi Phase 6 Smoke Room ${runId}`;
  const proposedAt = minutesFromAnchor(60);
  const memberArrivalAt = minutesFromAnchor(61);
  const notaryArrivalAt = minutesFromAnchor(62);
  const identityVerifiedAt = minutesFromAnchor(63);
  const proximityEvaluatedAt = minutesFromAnchor(64);
  const meetingStartAt = minutesFromAnchor(65);
  const meetingEndAt = minutesFromAnchor(66);

  const proposeResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${requestId}/meeting/propose`,
    {
      proposedSlots: [proposedAt],
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(proposeResult.response, proposeResult.payload, 200, "Meeting propose should return 200");
  assert(
    proposeResult.payload.meeting.participants.length >= 2,
    "Meeting proposal should seed default participants",
  );

  const confirmResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${requestId}/meeting/confirm`,
    {
      scheduledAt: proposedAt,
      timezone: "America/New_York",
      location,
    },
  );

  assertStatus(confirmResult.response, confirmResult.payload, 200, "Meeting confirm should return 200");
  assert(confirmResult.payload.meeting.status === "scheduled", "Meeting should be scheduled");

  const memberCheckinResult = await apiPost<MeetingApiResponse>(
    activeMemberAuthContext!.accessToken,
    `/notary/requests/${requestId}/meeting/check-in`,
    {
      participantRole: "member",
      checkinKind: "arrival",
      recordedAt: memberArrivalAt,
      notes: "Member arrived for Phase 6 smoke validation",
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
    `/notary/requests/${requestId}/meeting/check-in`,
    {
      participantRole: "notary",
      checkinKind: "arrival",
      recordedAt: notaryArrivalAt,
      notes: "Notary arrived for Phase 6 smoke validation",
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

  const identityResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${requestId}/meeting/identity-verification`,
    {
      participantRole: "member",
      verificationMethod: "in_person_document",
      subjectName: "Phase Six Member",
      documentType: "passport",
      documentLast4: "1234",
      issuingJurisdiction: "US",
      verifiedAt: identityVerifiedAt,
      notes: "Passport verified during Phase 6 smoke validation",
    },
  );

  assertStatus(identityResult.response, identityResult.payload, 201, "Identity verification should return 201");
  assert(
    identityResult.payload.identityVerification?.status === "verified",
    "Identity verification should be verified",
  );

  const proximityResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${requestId}/meeting/proximity-evaluation`,
    {
      thresholdMeters: 100,
      evaluatedAt: proximityEvaluatedAt,
      notes: "Within same-place threshold during Phase 6 smoke validation",
    },
  );

  assertStatus(proximityResult.response, proximityResult.payload, 201, "Proximity evaluation should return 201");
  assert(
    proximityResult.payload.evaluation?.status === "passed",
    "Proximity evaluation should pass",
  );

  const meetingStartResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${requestId}/meeting/check-in`,
    {
      participantRole: "notary",
      checkinKind: "meeting_start",
      recordedAt: meetingStartAt,
      notes: "Meeting started for Phase 6 smoke validation",
    },
  );

  assertStatus(
    meetingStartResult.response,
    meetingStartResult.payload,
    201,
    "Meeting start check-in should return 201",
  );
  assert(
    meetingStartResult.payload.meeting.status === "in_progress",
    "Meeting should be in_progress after meeting_start",
  );

  const meetingEndResult = await apiPost<MeetingApiResponse>(
    activeNotaryAuthContext!.accessToken,
    `/notary/requests/${requestId}/meeting/check-in`,
    {
      participantRole: "notary",
      checkinKind: "meeting_end",
      recordedAt: meetingEndAt,
      notes: "Meeting completed for Phase 6 smoke validation",
    },
  );

  assertStatus(
    meetingEndResult.response,
    meetingEndResult.payload,
    201,
    "Meeting end check-in should return 201",
  );
  assert(
    meetingEndResult.payload.meeting.status === "completed",
    "Meeting should be completed after meeting_end",
  );
};

const appendAcknowledgment = async (documentId: string) => {
  const result = await apiPost<AcknowledgmentResponse>(
    activeNotaryAuthContext!.accessToken,
    `/documents/${documentId}/append-acknowledgment`,
    {},
  );

  assertStatus(result.response, result.payload, 200, "Append acknowledgment should return 200");
  assert(result.payload.status === "ok", "Append acknowledgment response should be ok");
  assert(
    result.payload.execution.kind === "acknowledgment_append",
    "Append acknowledgment should return an acknowledgment execution",
  );
  assert(
    result.payload.execution.status === "completed",
    "Append acknowledgment execution should be completed",
  );
  assert(
    result.payload.version.isFinal === false,
    "Acknowledgment output version should not be final",
  );

  return result.payload;
};

const watermarkDocument = async (documentId: string) => {
  const result = await apiPost<WatermarkResponse>(
    activeNotaryAuthContext!.accessToken,
    `/documents/${documentId}/watermark`,
    {},
  );

  assertStatus(result.response, result.payload, 200, "Watermark should return 200");
  assert(result.payload.status === "ok", "Watermark response should be ok");
  assert(
    result.payload.execution.kind === "watermark",
    "Watermark should return a watermark execution",
  );
  assert(
    result.payload.execution.status === "completed",
    "Watermark execution should be completed",
  );
  assert(result.payload.version.isFinal === true, "Watermark output version should be final");
  assert(result.payload.hashRecord.status === "completed", "Hash record should be completed");
  assert(result.payload.ledger.status === "anchored", "Ledger status should be anchored");
  assertTruthy(result.payload.ledger.ledgerTxId, "Ledger transaction id is missing");

  return result.payload;
};

const verifyDocument = async (idn: string) => {
  const result = await apiGet<VerificationResponse>(`/verify/${encodeURIComponent(idn)}`);

  assertStatus(result.response, result.payload, 200, "Public verify should return 200");
  assert(result.payload.status === "verified", "Verification result should be verified");
  assert(result.payload.idn === idn, "Verification response should echo the IDN");
  assertTruthy(result.payload.hash, "Verification hash is missing");
  assertTruthy(result.payload.ledgerTxId, "Verification ledgerTxId is missing");
  assertTruthy(result.payload.anchoredAt, "Verification anchoredAt is missing");

  return result.payload;
};

const fetchDocumentIdn = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("idn")
    .eq("id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const idn = typeof data?.idn === "string" ? data.idn.trim() : "";
  assertTruthy(idn, "Persisted document IDN is missing");
  return idn;
};

const fetchFinalizationSnapshot = async (input: {
  documentId: string;
  requestId: string;
  workflowId: string;
  idn: string;
}) => {
  const [
    documentResult,
    requestResult,
    workflowResult,
    finalVersionsResult,
    executionRunsResult,
    hashRecordsResult,
    ledgerEntriesResult,
    ledgerAnchorAttemptsResult,
    verificationChecksResult,
    finalizationHistoryResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("documents")
      .select("id, idn, status")
      .eq("id", input.documentId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("notarization_requests")
      .select("id, status, workflow_id")
      .eq("id", input.requestId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("illuminotarization_workflows")
      .select("id, status, closed_at")
      .eq("id", input.workflowId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("document_versions")
      .select("id, version, is_final, storage_path, created_at")
      .eq("document_id", input.documentId)
      .eq("is_final", true)
      .order("version", { ascending: true }),
    supabaseAdmin
      .from("document_execution_runs")
      .select(
        "id, document_id, source_document_version_id, output_document_version_id, execution_kind, status, template_id, template_version, watermark_text, metadata, created_at",
      )
      .eq("document_id", input.documentId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("document_hash_records")
      .select(
        "id, document_id, document_version_id, execution_run_id, algorithm, hash, status, created_at",
      )
      .eq("document_id", input.documentId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("ledger_entries")
      .select("id, document_id, idn, hash, ledger_tx_id, anchored_at, created_at")
      .eq("document_id", input.documentId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("ledger_anchor_attempts")
      .select(
        "id, document_id, document_hash_record_id, ledger_entry_id, status, attempt_number, response_payload, created_at",
      )
      .eq("document_id", input.documentId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("public_verification_checks")
      .select(
        "id, document_id, document_hash_record_id, ledger_entry_id, idn, result_status, created_at",
      )
      .eq("idn", input.idn)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("finalization_status_history")
      .select(
        "id, document_id, execution_run_id, document_hash_record_id, ledger_anchor_attempt_id, status, change_source, created_at",
      )
      .eq("document_id", input.documentId)
      .order("created_at", { ascending: true }),
  ]);

  for (const result of [
    documentResult,
    requestResult,
    workflowResult,
    finalVersionsResult,
    executionRunsResult,
    hashRecordsResult,
    ledgerEntriesResult,
    ledgerAnchorAttemptsResult,
    verificationChecksResult,
    finalizationHistoryResult,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  return {
    document: (documentResult.data as unknown as DocumentRow | null) ?? null,
    request: (requestResult.data as unknown as RequestRow | null) ?? null,
    workflow: (workflowResult.data as unknown as WorkflowRow | null) ?? null,
    finalVersions: (finalVersionsResult.data ?? []) as unknown as DocumentVersionRow[],
    executionRuns: (executionRunsResult.data ?? []) as unknown as ExecutionRunRow[],
    hashRecords: (hashRecordsResult.data ?? []) as unknown as DocumentHashRecordRow[],
    ledgerEntries: (ledgerEntriesResult.data ?? []) as unknown as LedgerEntryRow[],
    ledgerAnchorAttempts:
      (ledgerAnchorAttemptsResult.data ?? []) as unknown as LedgerAnchorAttemptRow[],
    verificationChecks:
      (verificationChecksResult.data ?? []) as unknown as VerificationCheckRow[],
    finalizationHistory:
      (finalizationHistoryResult.data ?? []) as unknown as FinalizationStatusHistoryRow[],
  } satisfies FinalizationSnapshot;
};

const runFinalizationScenario = async (runId: string) => {
  const label = `phase6-finalization-${runId}`;
  const createdDocument = await createDocument(label);
  const submitPayload = await submitNotarization({
    documentId: createdDocument.documentId,
    selectedNotaryUserId: activeNotaryAuthContext!.internalUserId,
  });
  const workflowId = submitPayload.workflow?.id;
  assertTruthy(workflowId, "Workflow id is missing from submit response");

  await resolveCode(submitPayload.code.code);
  await completeMeeting(submitPayload.request.id, runId);

  const acknowledgment = await appendAcknowledgment(createdDocument.documentId);
  const watermark = await watermarkDocument(createdDocument.documentId);
  const persistedIdn = await fetchDocumentIdn(createdDocument.documentId);

  const verifyResult = await verifyDocument(persistedIdn);
  const snapshot = await fetchFinalizationSnapshot({
    documentId: createdDocument.documentId,
    requestId: submitPayload.request.id,
    workflowId: workflowId!,
    idn: persistedIdn,
  });

  assertTruthy(snapshot.document, "Document row is missing after finalization");
  assert(snapshot.document?.status === "completed", "Document should be completed after watermarking");
  assert(snapshot.document?.idn === persistedIdn, "Document IDN should remain stable");

  assertTruthy(snapshot.request, "Notarization request row is missing after finalization");
  assert(snapshot.request?.status === "completed", "Notarization request should be completed");
  assert(snapshot.request?.workflow_id === workflowId, "Request should still reference the workflow");

  assertTruthy(snapshot.workflow, "Workflow row is missing after finalization");
  assert(snapshot.workflow?.status === "completed", "Workflow should be completed after finalization");
  assertTruthy(snapshot.workflow?.closed_at, "Workflow closed_at should be set on completion");

  assert(snapshot.finalVersions.length === 1, "Exactly one final version should exist after watermarking");
  assert(
    snapshot.finalVersions[0]?.id === watermark.version.id,
    "Final document version should match the watermark response",
  );

  const acknowledgmentExecution = snapshot.executionRuns.find(
    (execution) => execution.execution_kind === "acknowledgment_append",
  );
  const watermarkExecution = snapshot.executionRuns.find(
    (execution) => execution.execution_kind === "watermark",
  );

  assertTruthy(acknowledgmentExecution, "Acknowledgment execution row is missing");
  assertTruthy(watermarkExecution, "Watermark execution row is missing");
  assert(
    acknowledgmentExecution?.output_document_version_id === acknowledgment.version.id,
    "Acknowledgment execution should reference its output version",
  );
  assert(
    watermarkExecution?.output_document_version_id === watermark.version.id,
    "Watermark execution should reference its output version",
  );

  assert(snapshot.hashRecords.length >= 1, "At least one hash record should exist after watermarking");
  assert(
    snapshot.hashRecords.some(
      (hashRecord) =>
        hashRecord.id === watermark.hashRecord.id &&
        hashRecord.hash === watermark.hashRecord.hash &&
        hashRecord.status === "completed",
    ),
    "Watermark hash record should be persisted",
  );

  assert(snapshot.ledgerEntries.length >= 1, "At least one ledger entry should exist after watermarking");
  assert(
    snapshot.ledgerEntries.some(
      (ledgerEntry) =>
        ledgerEntry.id === watermark.ledger.id &&
        ledgerEntry.ledger_tx_id === watermark.ledger.ledgerTxId &&
        ledgerEntry.anchored_at === watermark.ledger.anchoredAt,
    ),
    "Watermark ledger entry should be persisted",
  );

  assert(
    snapshot.ledgerAnchorAttempts.some(
      (attempt) =>
        attempt.status === "anchored" &&
        attempt.document_hash_record_id === watermark.hashRecord.id,
    ),
    "Anchored ledger attempt should be persisted",
  );

  const latestVerificationCheck = snapshot.verificationChecks[snapshot.verificationChecks.length - 1] ?? null;
  assertTruthy(latestVerificationCheck, "Verification check row is missing after public verify");
  assert(
    latestVerificationCheck?.result_status === "verified",
    "Latest verification check should be verified",
  );
  assert(
    latestVerificationCheck?.document_id === createdDocument.documentId,
    "Verification check should reference the finalized document",
  );

  const finalizationStatuses = snapshot.finalizationHistory.map((entry) => entry.status);
  for (const expectedStatus of [
    "acknowledgment_appended",
    "watermark_applied",
    "hash_recorded",
    "ledger_anchored",
    "verification_checked",
  ]) {
    assert(
      finalizationStatuses.includes(expectedStatus),
      `Finalization history is missing ${expectedStatus}`,
    );
  }

  assert(
    verifyResult.hash === watermark.hashRecord.hash,
    "Public verification hash should match the persisted watermark hash",
  );
  assert(
    verifyResult.ledgerTxId === watermark.ledger.ledgerTxId,
    "Public verification ledgerTxId should match the persisted ledger entry",
  );

  console.log("Phase 6 finalization scenario passed", {
    documentId: createdDocument.documentId,
    requestId: submitPayload.request.id,
    workflowId,
    idn: persistedIdn,
    acknowledgmentExecutionId: acknowledgment.execution.id,
    watermarkExecutionId: watermark.execution.id,
    hashRecordId: watermark.hashRecord.id,
    ledgerEntryId: watermark.ledger.id,
    verificationCheckId: latestVerificationCheck?.id ?? null,
  });
};

const main = async () => {
  const runId = randomUUID().slice(0, 8);
  const activeRoleSnapshots: ActiveRoleSnapshot[] = [];

  console.log("Running Phase 6 finalization staging smoke test...", {
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

    await runFinalizationScenario(runId);
  } finally {
    for (const snapshot of activeRoleSnapshots.reverse()) {
      await restoreActiveRole(snapshot);
    }
  }

  console.log("Phase 6 finalization staging smoke test complete.", {
    runId,
  });
};

main().catch((error) => {
  console.error("Phase 6 finalization staging smoke test failed", error);
  process.exit(1);
});