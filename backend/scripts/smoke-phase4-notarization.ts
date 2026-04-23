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
const useSelectedNotary = (process.env.PHASE4_USE_SELECTED_NOTARY ?? "1") !== "0";

const requiredEnv = [
  ["API_BASE_URL", apiBaseUrl],
  [
    "MEMBER_ACCESS_TOKEN or ACCESS_TOKEN or SUPABASE_JWT_SECRET",
    configuredMemberAccessToken ?? supabaseJwtSecret,
  ],
  ["SUPABASE_URL", supabaseUrl],
  ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceRoleKey],
  ["NOTARY_ACCESS_TOKEN or SUPABASE_JWT_SECRET", configuredNotaryAccessToken ?? supabaseJwtSecret],
];

const missingEnv = requiredEnv
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingEnv.length > 0) {
  console.error("Missing required env vars", { missingEnv });
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl!, supabaseServiceRoleKey!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json",
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
    approvedOutputKeys: string[];
    outputs: Array<{
      outputKey: string;
      generationRunId: string | null;
      mimeType: string | null;
    }>;
    pendingOutputs: Array<{
      outputKey: string;
      status: string;
    }>;
    missingOutputKeys: string[];
    requiresGeneration: boolean;
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

type WorkflowRequestRecord = {
  id: string;
  document_id: string;
  workflow_id: string | null;
  assigned_notary_id: string | null;
  status: string | null;
};

type WorkflowCodeRecord = {
  id: string;
  request_id: string;
  workflow_id: string | null;
  status: string | null;
  consumed_at: string | null;
  expires_at: string | null;
};

type WorkflowRecord = {
  id: string;
  owner_user_id: string;
  selected_notary_user_id: string | null;
  assigned_notary_user_id: string | null;
  current_legacy_request_id: string | null;
  status: string;
};

type WorkflowDocumentRecord = {
  id: string;
  document_id: string;
  notarization_request_id: string | null;
  bundle_role: string;
  is_primary: boolean;
};

type WorkflowAssignmentRecord = {
  id: string;
  assignment_kind: string;
  user_id: string;
  assignment_source: string;
  status: string;
};

type WorkflowStatusHistoryRecord = {
  id: string;
  previous_status: string | null;
  next_status: string;
  change_source: string;
  legacy_request_id: string | null;
};

type CodeDeliveryRecord = {
  id: string;
  illuminotarization_code_id: string | null;
  notification_job_id: string | null;
  delivery_reason: string;
  status: string;
  delivered_at: string | null;
  consumed_at: string | null;
};

type AccessCodeAttemptRecord = {
  id: string;
  illuminotarization_code_id: string | null;
  matched_code_delivery_id: string | null;
  attempted_by_user_id: string | null;
  result: string;
};

type WorkflowSnapshot = {
  request: WorkflowRequestRecord;
  code: WorkflowCodeRecord;
  workflow: WorkflowRecord;
  workflowDocuments: WorkflowDocumentRecord[];
  workflowAssignments: WorkflowAssignmentRecord[];
  workflowStatusHistory: WorkflowStatusHistoryRecord[];
  codeDeliveries: CodeDeliveryRecord[];
  accessCodeAttempts: AccessCodeAttemptRecord[];
};

type FallbackAuthUserRecord = {
  id: string;
  supabase_user_id: string | null;
  email: string | null;
};

type NotaryAuthContext = {
  accessToken: string;
  internalUserId: string;
  source: "env_token" | "jwt_fallback";
};

type MemberAuthContext = NotaryAuthContext;

type DecodedAccessToken = {
  sub?: string;
  email?: string;
  exp?: number;
  role?: string;
  app_metadata?: {
    role?: string;
  };
};

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

const createPdfBuffer = (byteLength: number) => {
  const header = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 120 Td (DARCI Phase 4) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
    "utf8",
  );

  if (byteLength <= header.length) {
    return header;
  }

  const padding = Buffer.alloc(byteLength - header.length, 0x20);
  return Buffer.concat([header, padding]);
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

const createDocument = async () => {
  const pdfBuffer = createPdfBuffer(512 * 1024);
  const createResult = await apiPost<DocumentResponse>(activeMemberAuthContext!.accessToken, "/documents", {
    fileName: "phase4-smoke.pdf",
    fileSize: pdfBuffer.length,
    mimeType: "application/pdf",
    documentType: "generic",
    jurisdiction: "US-OH",
  });

  assertStatus(
    createResult.response,
    createResult.payload,
    201,
    "Document create should return 201",
  );
  assertTruthy(createResult.payload.upload?.signedUrl, "Document upload URL is missing");

  await uploadToSignedUrl(
    createResult.payload.upload!.signedUrl,
    pdfBuffer,
    "application/pdf",
  );

  const finalizeResult = await apiPost<DocumentResponse>(
    activeMemberAuthContext!.accessToken,
    `/documents/${createResult.payload.document.id}/upload-finalize`,
    {
      documentVersionId: createResult.payload.version.id,
    },
  );

  assertStatus(
    finalizeResult.response,
    finalizeResult.payload,
    200,
    "Document finalize should return 200",
  );
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
    "Document review approval should prepare uploaded-document signing state",
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
  assert(
    signingResult.payload.signing.outputs.some(
      (output) => output.outputKey === "uploaded_document" && output.generationRunId,
    ),
    "Uploaded-document signing state should expose a prepared uploaded_document output",
  );

  return {
    ...finalizeResult.payload,
    document: {
      ...finalizeResult.payload.document,
      idn: reviewApprovalResult.payload.document.idn,
      status: reviewApprovalResult.payload.document.status,
    },
  } satisfies DocumentResponse;
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

const isAccessTokenExpired = (accessToken: string) => {
  const decoded = decodeAccessToken(accessToken);
  if (!decoded.exp) {
    return false;
  }

  return decoded.exp <= Math.floor(Date.now() / 1000) + 60;
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

const resolveMemberAuthContext = async (): Promise<MemberAuthContext> => {
  if (configuredMemberAccessToken && !isAccessTokenExpired(configuredMemberAccessToken)) {
    return {
      accessToken: configuredMemberAccessToken,
      internalUserId: await getInternalUserIdForAccessToken(configuredMemberAccessToken),
      source: "env_token",
    };
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
    source: "jwt_fallback",
  };
};

const resolveNotaryAuthContext = async (): Promise<NotaryAuthContext> => {
  if (configuredNotaryAccessToken) {
    return {
      accessToken: configuredNotaryAccessToken,
      internalUserId: await getInternalUserIdForAccessToken(configuredNotaryAccessToken),
      source: "env_token",
    };
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
      role: "service_role",
      aud: "authenticated",
      iss: `${supabaseUrl}/auth/v1`,
      app_metadata: {
        role: "service_role",
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
    source: "jwt_fallback",
  };
};

const submitNotarization = async (input: {
  documentId: string;
  selectedNotaryUserId: string | null;
}) => {
  const body: Record<string, unknown> = {};
  if (input.selectedNotaryUserId) {
    body.selectedNotaryUserId = input.selectedNotaryUserId;
  }

  const result = await apiPost<NotarizationSubmitResponse>(
    activeMemberAuthContext!.accessToken,
    `/documents/${input.documentId}/submit-notarization`,
    body,
  );

  assertStatus(
    result.response,
    result.payload,
    201,
    "Submit notarization should return 201",
  );
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

  assertStatus(
    result.response,
    result.payload,
    200,
    "Resolve code should return 200",
  );
  assert(
    result.payload.request.status === "in_review",
    "Resolved request should be in_review",
  );
  assert(
    result.payload.code.status === "consumed",
    "Resolved code should be consumed",
  );
  assert(
    result.payload.workflow?.status === "in_review",
    "Workflow should be in_review after resolve",
  );

  return result.payload;
};

let activeNotaryAuthContext: NotaryAuthContext | null = null;
let activeMemberAuthContext: MemberAuthContext | null = null;

const fetchWorkflowSnapshot = async (input: {
  requestId: string;
  codeId: string;
  workflowId: string;
}) => {
  const [
    requestResult,
    codeResult,
    workflowResult,
    workflowDocumentsResult,
    workflowAssignmentsResult,
    workflowStatusHistoryResult,
    codeDeliveriesResult,
    accessCodeAttemptsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("notarization_requests")
      .select("id, document_id, workflow_id, assigned_notary_id, status")
      .eq("id", input.requestId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("illuminotarization_codes")
      .select("id, request_id, workflow_id, status, consumed_at, expires_at")
      .eq("id", input.codeId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("illuminotarization_workflows")
      .select(
        "id, owner_user_id, selected_notary_user_id, assigned_notary_user_id, current_legacy_request_id, status",
      )
      .eq("id", input.workflowId)
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from("illuminotarization_workflow_documents")
      .select("id, document_id, notarization_request_id, bundle_role, is_primary")
      .eq("workflow_id", input.workflowId)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("workflow_assignments")
      .select("id, assignment_kind, user_id, assignment_source, status")
      .eq("workflow_id", input.workflowId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("workflow_status_history")
      .select("id, previous_status, next_status, change_source, legacy_request_id")
      .eq("workflow_id", input.workflowId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("code_deliveries")
      .select(
        "id, illuminotarization_code_id, notification_job_id, delivery_reason, status, delivered_at, consumed_at",
      )
      .eq("workflow_id", input.workflowId)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("access_code_attempts")
      .select(
        "id, illuminotarization_code_id, matched_code_delivery_id, attempted_by_user_id, result",
      )
      .eq("workflow_id", input.workflowId)
      .order("created_at", { ascending: true }),
  ]);

  const queryResults = [
    requestResult,
    codeResult,
    workflowResult,
    workflowDocumentsResult,
    workflowAssignmentsResult,
    workflowStatusHistoryResult,
    codeDeliveriesResult,
    accessCodeAttemptsResult,
  ];

  for (const queryResult of queryResults) {
    if (queryResult.error) {
      throw new Error(queryResult.error.message);
    }
  }

  assertTruthy(requestResult.data, "Legacy notarization request row is missing");
  assertTruthy(codeResult.data, "Legacy illuminotarization code row is missing");
  assertTruthy(workflowResult.data, "Phase 4 workflow row is missing");

  return {
    request: requestResult.data as WorkflowRequestRecord,
    code: codeResult.data as WorkflowCodeRecord,
    workflow: workflowResult.data as WorkflowRecord,
    workflowDocuments: (workflowDocumentsResult.data ?? []) as WorkflowDocumentRecord[],
    workflowAssignments: (workflowAssignmentsResult.data ?? []) as WorkflowAssignmentRecord[],
    workflowStatusHistory: (workflowStatusHistoryResult.data ?? []) as WorkflowStatusHistoryRecord[],
    codeDeliveries: (codeDeliveriesResult.data ?? []) as CodeDeliveryRecord[],
    accessCodeAttempts: (accessCodeAttemptsResult.data ?? []) as AccessCodeAttemptRecord[],
  } satisfies WorkflowSnapshot;
};

const assertStatusesPresent = (
  workflowStatusHistory: WorkflowStatusHistoryRecord[],
  expectedStatuses: string[],
) => {
  const seenStatuses = new Set(workflowStatusHistory.map((entry) => entry.next_status));
  for (const status of expectedStatuses) {
    assert(seenStatuses.has(status), `Workflow status history missing ${status}`);
  }
};

const assertSubmitSnapshot = (input: {
  documentId: string;
  requestId: string;
  codeId: string;
  workflowId: string;
  snapshot: WorkflowSnapshot;
  selectedNotaryUserId: string | null;
}) => {
  assert(
    input.snapshot.request.workflow_id === input.workflowId,
    "Legacy request workflow_id bridge was not populated",
  );
  assert(
    input.snapshot.code.workflow_id === input.workflowId,
    "Legacy code workflow_id bridge was not populated",
  );
  assert(
    input.snapshot.workflow.current_legacy_request_id === input.requestId,
    "Workflow current_legacy_request_id does not match the request",
  );
  assert(
    input.snapshot.workflow.status === "code_delivered",
    "Workflow should be code_delivered after submit",
  );
  assert(
    input.snapshot.workflowDocuments.length === 1,
    "Workflow should contain exactly one workflow-document row for this smoke test",
  );
  assert(
    input.snapshot.workflowDocuments[0]?.document_id === input.documentId,
    "Workflow document does not point to the submitted document",
  );
  assert(
    input.snapshot.workflowDocuments[0]?.notarization_request_id === input.requestId,
    "Workflow document does not point to the legacy request",
  );
  assertStatusesPresent(input.snapshot.workflowStatusHistory, ["submitted", "code_delivered"]);
  assert(
    input.snapshot.codeDeliveries.length >= 1,
    "Expected at least one code delivery row after submit",
  );

  const initialDelivery = input.snapshot.codeDeliveries[0];
  if (!initialDelivery) {
    throw new Error("Initial code delivery row is missing after submit");
  }
  assert(
    initialDelivery.illuminotarization_code_id === input.codeId,
    "Initial code delivery is not linked to the generated code",
  );
  assert(
    initialDelivery.status === "delivered",
    "Initial code delivery should be delivered after submit",
  );
  assert(
    initialDelivery.delivery_reason === "initial_submit",
    "Initial code delivery should use the initial_submit reason",
  );
  assertTruthy(
    initialDelivery.notification_job_id,
    "Initial code delivery should be linked to a notification job",
  );
  assert(
    input.snapshot.accessCodeAttempts.length === 0,
    "No access code attempts should exist before resolve",
  );

  if (input.selectedNotaryUserId) {
    assert(
      input.snapshot.workflow.selected_notary_user_id === input.selectedNotaryUserId,
      "Workflow selected_notary_user_id was not populated",
    );
    assert(
      input.snapshot.workflowAssignments.some(
        (assignment) =>
          assignment.assignment_kind === "selected_notary" &&
          assignment.user_id === input.selectedNotaryUserId &&
          assignment.status === "active",
      ),
      "Selected-notary assignment row is missing",
    );
  }
};

const assertResolveSnapshot = (input: {
  requestId: string;
  codeId: string;
  workflowId: string;
  snapshot: WorkflowSnapshot;
  notaryUserId: string;
}) => {
  assert(
    input.snapshot.request.status === "in_review",
    "Legacy request should be in_review after resolve",
  );
  assert(
    input.snapshot.request.assigned_notary_id === input.notaryUserId,
    "Legacy request assigned_notary_id does not match the resolving notary",
  );
  assert(
    input.snapshot.code.status === "consumed",
    "Legacy code should be consumed after resolve",
  );
  assertTruthy(input.snapshot.code.consumed_at, "Legacy code consumed_at is missing");
  assert(
    input.snapshot.workflow.status === "in_review",
    "Workflow should be in_review after resolve",
  );
  assert(
    input.snapshot.workflow.assigned_notary_user_id === input.notaryUserId,
    "Workflow assigned_notary_user_id does not match the resolving notary",
  );
  assertStatusesPresent(input.snapshot.workflowStatusHistory, [
    "submitted",
    "code_delivered",
    "in_review",
  ]);
  assert(
    input.snapshot.workflowAssignments.some(
      (assignment) =>
        assignment.assignment_kind === "assigned_notary" &&
        assignment.user_id === input.notaryUserId &&
        assignment.status === "active",
    ),
    "Assigned-notary workflow assignment row is missing",
  );
  assert(
    input.snapshot.codeDeliveries.some(
      (delivery) =>
        delivery.illuminotarization_code_id === input.codeId && delivery.status === "consumed",
    ),
    "Code delivery ledger was not marked consumed after resolve",
  );
  assert(
    input.snapshot.accessCodeAttempts.some(
      (attempt) =>
        attempt.illuminotarization_code_id === input.codeId &&
        attempt.attempted_by_user_id === input.notaryUserId &&
        attempt.result === "matched",
    ),
    "Matched access-code attempt row is missing after resolve",
  );
};

const main = async () => {
  console.log("Running Phase 4 notarization smoke test...", {
    apiBaseUrl,
    useSelectedNotary,
  });

  activeMemberAuthContext = await resolveMemberAuthContext();
  activeNotaryAuthContext = await resolveNotaryAuthContext();
  console.log("Using member auth context", {
    source: activeMemberAuthContext.source,
    memberUserId: activeMemberAuthContext.internalUserId,
  });

  const notaryUserId = activeNotaryAuthContext.internalUserId;
  const selectedNotaryUserId = useSelectedNotary ? notaryUserId : null;

  console.log("Using notary auth context", {
    source: activeNotaryAuthContext.source,
    notaryUserId,
    selectedNotaryUserId,
  });

  const document = await createDocument();
  console.log("Document prepared for notarization", {
    documentId: document.document.id,
    documentVersionId: document.version.id,
    status: document.document.status,
  });

  const submitPayload = await submitNotarization({
    documentId: document.document.id,
    selectedNotaryUserId,
  });
  console.log("Submit notarization response received", {
    requestId: submitPayload.request.id,
    codeId: submitPayload.code.id,
    workflowId: submitPayload.workflow?.id,
    workflowStatus: submitPayload.workflow?.status,
  });

  const workflowId = submitPayload.workflow?.id;
  assertTruthy(workflowId, "Workflow id is missing from submit response");

  const submitSnapshot = await fetchWorkflowSnapshot({
    requestId: submitPayload.request.id,
    codeId: submitPayload.code.id,
    workflowId: workflowId!,
  });
  assertSubmitSnapshot({
    documentId: document.document.id,
    requestId: submitPayload.request.id,
    codeId: submitPayload.code.id,
    workflowId: workflowId!,
    snapshot: submitSnapshot,
    selectedNotaryUserId,
  });
  console.log("Submit snapshot verified", {
    workflowStatusHistoryCount: submitSnapshot.workflowStatusHistory.length,
    codeDeliveriesCount: submitSnapshot.codeDeliveries.length,
    workflowAssignmentsCount: submitSnapshot.workflowAssignments.length,
  });

  const resolvePayload = await resolveCode(submitPayload.code.code);
  console.log("Resolve code response received", {
    requestId: resolvePayload.request.id,
    workflowId: resolvePayload.workflow?.id,
    workflowStatus: resolvePayload.workflow?.status,
  });

  const resolveSnapshot = await fetchWorkflowSnapshot({
    requestId: submitPayload.request.id,
    codeId: submitPayload.code.id,
    workflowId: workflowId!,
  });
  assertResolveSnapshot({
    requestId: submitPayload.request.id,
    codeId: submitPayload.code.id,
    workflowId: workflowId!,
    snapshot: resolveSnapshot,
    notaryUserId,
  });
  console.log("Resolve snapshot verified", {
    workflowStatusHistoryCount: resolveSnapshot.workflowStatusHistory.length,
    codeDeliveriesCount: resolveSnapshot.codeDeliveries.length,
    accessCodeAttemptsCount: resolveSnapshot.accessCodeAttempts.length,
  });

  console.log("Phase 4 notarization smoke test complete.", {
    documentId: document.document.id,
    requestId: submitPayload.request.id,
    codeId: submitPayload.code.id,
    workflowId,
    selectedNotaryUserId,
    notaryUserId,
  });
};

main().catch((error) => {
  console.error("Phase 4 notarization smoke test failed", error);
  process.exit(1);
});