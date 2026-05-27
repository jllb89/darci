import { createClient } from "@supabase/supabase-js";
import { listDocuments, getOrCreateUserId, type DocumentRecord } from "./documentService";
import { listRecentAuditEventsForDocumentIds } from "./auditService";
import { getVisibleDocumentIdn } from "./documentVisibilityService";
import { normalizeRuntimeRole, type RuntimeRole } from "./userRoleService";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ACTIVITY_LIMIT = 20;
const DOCUMENT_LIMIT = 10;
const MEMBER_TIMELINE_ACTIVITY_QUERY_LIMIT = 250;
const MEMBER_TIMELINE_LOOKBACK_DAYS = 7;
const REQUEST_LIMIT = 10;
const MEETING_LIMIT = 10;

const memberDashboardTimelineActions = new Set([
  "member.document_upload_started",
  "system.document_created",
  "member.document_upload_completed",
  "system.document_ready_for_review",
  "member.document_review_approved",
  "system.document_idn_assigned",
  "system.document_signing_prepared",
  "member.signature_capture_completed",
  "member.document_signatures_confirmed",
  "system.signature_completion_workflow_applied",
  "system.signature_completion_workflow_failed",
  "system.invites_issued_for_remaining_signers",
  "system.remaining_signer_invite_dispatch_failed",
  "member.signature_reminder_sent",
  "member.signature_reminder_failed",
  "member.notarization_submit_started",
  "member.notarization_submitted",
  "member.notary_selected",
  "notary.code_resolved",
  "system.request_assigned_to_notary",
  "notary.request_approved",
  "notary.request_rejected",
  "notary.request_changes_requested",
  "notary.meeting_started",
  "notary.meeting_completed",
  "system.meeting_no_show_recorded",
  "notary.identity_verified",
  "system.notarized_document_created",
  "system.ledger_anchor_completed",
]);

type AuditEventRecord = {
  id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DashboardDocumentRecord = Pick<
  DocumentRecord,
  | "id"
  | "owner_id"
  | "idn"
  | "status"
  | "document_type"
  | "jurisdiction"
  | "product_flow_mode"
  | "selected_families"
  | "created_at"
  | "updated_at"
>;

type DashboardRequestRecord = {
  id: string;
  document_id: string;
  assigned_notary_id: string | null;
  status: string | null;
  submitted_at: string | null;
  created_at: string;
};

type DashboardMeetingRecord = {
  id: string;
  request_id: string;
  scheduled_at: string | null;
  timezone: string | null;
  location: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
};

type DashboardUserRecord = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type DashboardMetric = {
  key: string;
  label: string;
  value: number;
};

export type DashboardActivity = {
  action: string;
  timestamp: string;
  documentId: string | null;
  entityType: string;
  entityId: string | null;
  document?: DashboardAlertDocumentSummary;
};

export type DashboardDocumentSummary = {
  id: string;
  idn: string | null;
  status: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  productFlowMode?: string;
  selectedFamilies?: string[];
  createdAt: string;
  updatedAt: string | null;
};

export type DashboardAlertDocumentSummary = Pick<
  DashboardDocumentSummary,
  "id" | "status" | "documentType" | "productFlowMode" | "selectedFamilies"
>;

export type DashboardRequestSummary = {
  id: string;
  documentId: string;
  documentType: string | null;
  jurisdiction: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: string | null;
  submittedAt: string | null;
  meetingId: string | null;
  meetingScheduledAt: string | null;
  meetingStatus: string | null;
};

export type DashboardMeetingSummary = {
  id: string;
  requestId: string;
  documentId: string | null;
  documentType: string | null;
  ownerName: string | null;
  scheduledAt: string | null;
  timezone: string | null;
  location: string | null;
  status: string | null;
};

export type DashboardAlert = {
  key: string;
  message: string;
  documentIds?: string[];
  documents?: DashboardAlertDocumentSummary[];
};

export type DashboardPrimaryAction = {
  code:
    | "continue_drafts"
    | "review_documents"
    | "collect_signatures"
    | "track_notary_queue"
    | "review_notary_requests"
    | "inspect_open_documents";
  label: string;
  description: string;
  targetPath: string;
  priority: "high" | "medium" | "low";
};

export type RoleAwareDashboardResponse = {
  role: RuntimeRole;
  metrics: DashboardMetric[];
  documents: DashboardDocumentSummary[];
  requests: DashboardRequestSummary[];
  meetings: DashboardMeetingSummary[];
  activity: DashboardActivity[];
  alerts: DashboardAlert[];
  nextAction: string | null;
  primaryAction: DashboardPrimaryAction | null;
};

export type MemberDashboardCounts = {
  draft: number;
  pendingReview: number;
  pendingSignature: number;
  pendingNotary: number;
  completed: number;
  total: number;
};

export type MemberDashboardResponse = {
  documents: DashboardDocumentSummary[];
  activity: DashboardActivity[];
  counts: MemberDashboardCounts;
};

type MemberLikeDashboardData = {
  counts: MemberDashboardCounts;
  documents: DashboardDocumentSummary[];
  requests: DashboardRequestSummary[];
  meetings: DashboardMeetingSummary[];
  activity: DashboardActivity[];
  alerts: DashboardAlert[];
  nextAction: string | null;
  primaryAction: DashboardPrimaryAction | null;
  metrics: DashboardMetric[];
};

const buildMemberPrimaryAction = (counts: MemberDashboardCounts): DashboardPrimaryAction | null => {
  if (counts.pendingSignature > 0) {
    return {
      code: "collect_signatures",
      label: "Manage signatures",
      description: `${counts.pendingSignature} ${counts.pendingSignature === 1 ? "document is" : "documents are"} waiting on signatures.`,
      targetPath: "/app/documents?status=pending_signature",
      priority: "high",
    };
  }

  if (counts.pendingReview > 0) {
    return {
      code: "review_documents",
      label: "Review documents",
      description: `${counts.pendingReview} ${counts.pendingReview === 1 ? "document is" : "documents are"} ready for review.`,
      targetPath: "/app/documents?status=pending_review",
      priority: "medium",
    };
  }

  if (counts.draft > 0) {
    return {
      code: "continue_drafts",
      label: "Continue drafts",
      description: `${counts.draft} draft ${counts.draft === 1 ? "document needs" : "documents need"} intake details.`,
      targetPath: "/app/documents?status=draft",
      priority: "medium",
    };
  }

  if (counts.pendingNotary > 0) {
    return {
      code: "track_notary_queue",
      label: "Track notary queue",
      description: `${counts.pendingNotary} ${counts.pendingNotary === 1 ? "document is" : "documents are"} waiting on notary completion.`,
      targetPath: "/app/requests",
      priority: "low",
    };
  }

  return null;
};

const normalizeDashboardStatus = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

const isDraftDocument = (document: DashboardDocumentRecord) => {
  const status = normalizeDashboardStatus(document.status);
  return status === "draft" || status.includes("intake");
};

const isPendingReviewDocument = (document: DashboardDocumentRecord) => {
  const status = normalizeDashboardStatus(document.status);
  return status === "pending_review" || status.includes("review") || status.includes("blocked");
};

const isPendingSignatureDocument = (document: DashboardDocumentRecord) => {
  const status = normalizeDashboardStatus(document.status);
  return status === "pending_signature" || status.includes("signature");
};

const isPendingNotaryDocument = (document: DashboardDocumentRecord) => {
  const status = normalizeDashboardStatus(document.status);
  return status === "pending_notary" || status.includes("notary");
};

const isCompletedDocument = (document: DashboardDocumentRecord) => {
  const status = normalizeDashboardStatus(document.status);
  return status === "completed" || status === "notarized" || status.includes("final");
};

const documentCountMessage = (count: number, message: string) => {
  return `${count} ${count === 1 ? "document" : "documents"} ${message}`;
};

const daysAgoIso = (days: number) => {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};

const isDashboardTimelineAuditEvent = (event: AuditEventRecord) => {
  if (event.entity_type === "generation_run" || event.action.includes("generation_run")) {
    return false;
  }

  return memberDashboardTimelineActions.has(event.action);
};

const resolveDocumentId = (event: {
  entity_type: string;
  entity_id: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  const metadata = event.metadata ?? undefined;
  const fromMetadata = metadata?.document_id;
  return typeof fromMetadata === "string"
    ? fromMetadata
    : event.entity_type === "document"
      ? event.entity_id
      : null;
};

const toDashboardActivity = (
  event: AuditEventRecord,
  documentsById?: Map<string, DashboardDocumentRecord>,
): DashboardActivity => {
  const documentId = resolveDocumentId(event);
  const document = documentId ? documentsById?.get(documentId) : undefined;
  const summary: DashboardActivity = {
    action: event.action,
    timestamp: event.created_at,
    documentId,
    entityType: event.entity_type,
    entityId: event.entity_id,
  };

  if (document) {
    summary.document = toDashboardAlertDocumentSummary(document);
  }

  return summary;
};

const toDashboardDocumentSummary = (
  document: DashboardDocumentRecord,
  viewerRole: RuntimeRole,
): DashboardDocumentSummary => {
  const summary: DashboardDocumentSummary = {
    id: document.id,
    idn: getVisibleDocumentIdn({
      idn: document.idn,
      status: document.status,
      viewerRole,
    }),
    status: document.status,
    documentType: document.document_type,
    jurisdiction: document.jurisdiction,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };

  if (typeof document.product_flow_mode === "string" && document.product_flow_mode.length > 0) {
    summary.productFlowMode = document.product_flow_mode;
  }

  if (Array.isArray(document.selected_families) && document.selected_families.length > 0) {
    summary.selectedFamilies = document.selected_families;
  }

  return summary;
};

const toDashboardAlertDocumentSummary = (
  document: DashboardDocumentRecord,
): DashboardAlertDocumentSummary => {
  const summary: DashboardAlertDocumentSummary = {
    id: document.id,
    status: document.status,
    documentType: document.document_type,
  };

  if (typeof document.product_flow_mode === "string" && document.product_flow_mode.length > 0) {
    summary.productFlowMode = document.product_flow_mode;
  }

  if (Array.isArray(document.selected_families) && document.selected_families.length > 0) {
    summary.selectedFamilies = document.selected_families;
  }

  return summary;
};

const toDisplayName = (user: DashboardUserRecord | undefined) => {
  if (!user) {
    return null;
  }

  const fullName = [user.first_name, user.last_name]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  if (fullName) {
    return fullName;
  }

  return user.email?.trim() ?? user.id;
};

const startOfTodayIso = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
};

const startOfWeekIso = () => {
  const now = new Date();
  const weekday = (now.getDay() + 6) % 7;
  now.setDate(now.getDate() - weekday);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
};

const listNotarizationRequestsByDocumentIds = async (documentIds: string[]) => {
  if (!documentIds.length) {
    return [] as DashboardRequestRecord[];
  }

  const { data, error } = await supabaseAdmin
    .from("notarization_requests")
    .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
    .in("document_id", documentIds)
    .order("created_at", { ascending: false })
    .limit(REQUEST_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DashboardRequestRecord[];
};

const listNotaryRequestsByAssignee = async (userId: string) => {
  const { data, error } = await supabaseAdmin
    .from("notarization_requests")
    .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
    .eq("assigned_notary_id", userId)
    .order("created_at", { ascending: false })
    .limit(REQUEST_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DashboardRequestRecord[];
};

const listMeetingsByRequestIds = async (requestIds: string[]) => {
  if (!requestIds.length) {
    return [] as DashboardMeetingRecord[];
  }

  const { data, error } = await supabaseAdmin
    .from("meetings")
    .select("id, request_id, scheduled_at, timezone, location, status, created_at, updated_at")
    .in("request_id", requestIds)
    .order("scheduled_at", { ascending: true })
    .limit(MEETING_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DashboardMeetingRecord[];
};

const listDocumentsByIds = async (documentIds: string[]) => {
  if (!documentIds.length) {
    return [] as DashboardDocumentRecord[];
  }

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("id, owner_id, idn, status, document_type, jurisdiction, created_at, updated_at")
    .in("id", documentIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DashboardDocumentRecord[];
};

const listUsersByIds = async (userIds: string[]) => {
  if (!userIds.length) {
    return [] as DashboardUserRecord[];
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, email, first_name, last_name")
    .in("id", userIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DashboardUserRecord[];
};

const listRecentAuditEvents = async (limit = ACTIVITY_LIMIT) => {
  const { data, error } = await supabaseAdmin
    .from("audit_events")
    .select("id, actor_id, entity_type, entity_id, action, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AuditEventRecord[];
};

const countRowsSince = async (table: string, column: string, sinceIso: string) => {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select(column, { count: "exact", head: true })
    .gte(column, sinceIso);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
};

const buildRequestSummaries = (input: {
  requests: DashboardRequestRecord[];
  documentsById: Map<string, DashboardDocumentRecord>;
  usersById: Map<string, DashboardUserRecord>;
  meetingsByRequestId: Map<string, DashboardMeetingRecord>;
}) => {
  return input.requests.map<DashboardRequestSummary>((request) => {
    const document = input.documentsById.get(request.document_id);
    const owner = document ? input.usersById.get(document.owner_id) : undefined;
    const meeting = input.meetingsByRequestId.get(request.id);

    return {
      id: request.id,
      documentId: request.document_id,
      documentType: document?.document_type ?? null,
      jurisdiction: document?.jurisdiction ?? null,
      ownerId: document?.owner_id ?? null,
      ownerName: toDisplayName(owner),
      status: request.status,
      submittedAt: request.submitted_at,
      meetingId: meeting?.id ?? null,
      meetingScheduledAt: meeting?.scheduled_at ?? null,
      meetingStatus: meeting?.status ?? null,
    };
  });
};

const buildMeetingSummaries = (input: {
  meetings: DashboardMeetingRecord[];
  requestsById: Map<string, DashboardRequestRecord>;
  documentsById: Map<string, DashboardDocumentRecord>;
  usersById: Map<string, DashboardUserRecord>;
}) => {
  return input.meetings.map<DashboardMeetingSummary>((meeting) => {
    const request = input.requestsById.get(meeting.request_id);
    const document = request ? input.documentsById.get(request.document_id) : undefined;
    const owner = document ? input.usersById.get(document.owner_id) : undefined;

    return {
      id: meeting.id,
      requestId: meeting.request_id,
      documentId: document?.id ?? null,
      documentType: document?.document_type ?? null,
      ownerName: toDisplayName(owner),
      scheduledAt: meeting.scheduled_at,
      timezone: meeting.timezone,
      location: meeting.location,
      status: meeting.status,
    };
  });
};

const buildMemberLikeDashboardData = async (input: {
  role: RuntimeRole;
  supabaseUserId: string;
  email?: string | null | undefined;
  ownerUserIdOverride?: string | null | undefined;
  includeWorkflowState?: boolean | undefined;
}) => {
  const ownerId = input.ownerUserIdOverride
    ? input.ownerUserIdOverride
    : await getOrCreateUserId(input.supabaseUserId, input.email ?? undefined, input.role);

  const documents = await listDocuments(ownerId);
  const documentIds = documents.map((document) => document.id);
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const recentDocuments = documents.slice(0, DOCUMENT_LIMIT);
  const includeWorkflowState = input.includeWorkflowState ?? true;
  const requests = includeWorkflowState
    ? await listNotarizationRequestsByDocumentIds(documentIds)
    : [];
  const meetings = includeWorkflowState
    ? await listMeetingsByRequestIds(requests.map((request) => request.id))
    : [];
  const auditEvents = documentIds.length
    ? (await listRecentAuditEventsForDocumentIds(
        documentIds,
        MEMBER_TIMELINE_ACTIVITY_QUERY_LIMIT,
        undefined,
        daysAgoIso(MEMBER_TIMELINE_LOOKBACK_DAYS),
        {
          excludeActionLike: ["%generation_run%"],
          excludeEntityTypes: ["generation_run"],
          includeActions: Array.from(memberDashboardTimelineActions),
        },
      )).filter(isDashboardTimelineAuditEvent)
    : [];

  const draftDocuments = documents.filter(isDraftDocument);
  const pendingReviewDocuments = documents.filter(isPendingReviewDocument);
  const pendingSignatureDocuments = documents.filter(isPendingSignatureDocument);
  const pendingNotaryDocuments = documents.filter(isPendingNotaryDocument);
  const completedDocuments = documents.filter(isCompletedDocument);
  const counts: MemberDashboardCounts = {
    draft: draftDocuments.length,
    pendingReview: pendingReviewDocuments.length,
    pendingSignature: pendingSignatureDocuments.length,
    pendingNotary: pendingNotaryDocuments.length,
    completed: completedDocuments.length,
    total: documents.length,
  };

  const meetingsByRequestId = new Map(meetings.map((meeting) => [meeting.request_id, meeting]));
  const usersById = new Map<string, DashboardUserRecord>();
  const requestsSummary = buildRequestSummaries({
    requests,
    documentsById,
    usersById,
    meetingsByRequestId,
  });

  const upcomingMeetings = buildMeetingSummaries({
    meetings,
    requestsById: new Map(requests.map((request) => [request.id, request])),
    documentsById,
    usersById,
  }).filter((meeting) => meeting.status !== "cancelled" && meeting.status !== "no_show");

  const alerts: DashboardAlert[] = [];
  if (pendingSignatureDocuments.length > 0) {
    alerts.push({
      key: "awaiting-signatures",
      message: documentCountMessage(pendingSignatureDocuments.length, "waiting on signatures."),
      documentIds: pendingSignatureDocuments.map((document) => document.id),
      documents: pendingSignatureDocuments.map(toDashboardAlertDocumentSummary),
    });
  }
  if (pendingReviewDocuments.length > 0) {
    alerts.push({
      key: "awaiting-review",
      message: documentCountMessage(pendingReviewDocuments.length, "ready for review."),
      documentIds: pendingReviewDocuments.map((document) => document.id),
      documents: pendingReviewDocuments.map(toDashboardAlertDocumentSummary),
    });
  }
  if (counts.pendingNotary > 0) {
    alerts.push({
      key: "awaiting-notary",
      message: documentCountMessage(pendingNotaryDocuments.length, "waiting on notary completion."),
      documentIds: pendingNotaryDocuments.map((document) => document.id),
      documents: pendingNotaryDocuments.map(toDashboardAlertDocumentSummary),
    });
  }
  if (upcomingMeetings.length > 0) {
    alerts.push({
      key: "upcoming-meetings",
      message: `${upcomingMeetings.length} meeting(s) are currently scheduled.`,
    });
  }

  const metrics: DashboardMetric[] = [
    {
      key: "in-progress",
      label: input.role === "pro" ? "Client work in progress" : "In progress",
      value: counts.draft + counts.pendingReview + counts.pendingSignature,
    },
    {
      key: "awaiting-notary",
      label: "Awaiting notary",
      value: counts.pendingNotary,
    },
    {
      key: "completed",
      label: "Completed",
      value: counts.completed,
    },
  ];
  const primaryAction = buildMemberPrimaryAction(counts);

  return {
    counts,
    documents: recentDocuments.map((document) => toDashboardDocumentSummary(document, input.role)),
    requests: requestsSummary,
    meetings: upcomingMeetings,
    activity: auditEvents.map((event) => toDashboardActivity(event, documentsById)),
    alerts,
    nextAction: primaryAction?.description ?? null,
    primaryAction,
    metrics,
  } satisfies MemberLikeDashboardData;
};

const buildNotaryDashboardData = async (input: {
  supabaseUserId: string;
  email?: string | null | undefined;
}) => {
  const notaryUserId = await getOrCreateUserId(input.supabaseUserId, input.email ?? undefined, "notary");
  const requests = await listNotaryRequestsByAssignee(notaryUserId);
  const requestIds = requests.map((request) => request.id);
  const meetings = await listMeetingsByRequestIds(requestIds);
  const documents = await listDocumentsByIds(requests.map((request) => request.document_id));
  const users = await listUsersByIds(documents.map((document) => document.owner_id));
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const meetingsByRequestId = new Map(meetings.map((meeting) => [meeting.request_id, meeting]));
  const requestsById = new Map(requests.map((request) => [request.id, request]));
  const auditEvents = documents.length
    ? await listRecentAuditEventsForDocumentIds(
        documents.map((document) => document.id),
        ACTIVITY_LIMIT,
        notaryUserId,
      )
    : [];

  const startOfToday = startOfTodayIso();
  const startOfWeek = startOfWeekIso();
  const pendingCount = requests.filter((request) => {
    return request.status === "pending" || request.status === "in_review";
  }).length;
  const scheduledTodayCount = meetings.filter((meeting) => {
    const scheduledAt = meeting.scheduled_at;
    return (
      scheduledAt !== null &&
      scheduledAt >= startOfToday &&
      (meeting.status === "scheduled" ||
        meeting.status === "rescheduled" ||
        meeting.status === "in_progress")
    );
  }).length;
  const completedThisWeekCount = meetings.filter((meeting) => {
    return meeting.status === "completed" && meeting.updated_at >= startOfWeek;
  }).length;

  const alerts: DashboardAlert[] = [];
  const changesRequestedCount = requests.filter((request) => request.status === "rejected").length;
  if (pendingCount > 0) {
    alerts.push({
      key: "pending-review",
      message: `${pendingCount} request(s) are waiting for notary review.`,
    });
  }
  if (scheduledTodayCount > 0) {
    alerts.push({
      key: "scheduled-today",
      message: `${scheduledTodayCount} meeting(s) are scheduled for today.`,
    });
  }
  if (changesRequestedCount > 0) {
    alerts.push({
      key: "rejected-requests",
      message: `${changesRequestedCount} request(s) were rejected and may need follow-up.`,
    });
  }
  const primaryAction: DashboardPrimaryAction | null = pendingCount > 0
    ? {
        code: "review_notary_requests",
        label: "Review notary requests",
        description: `${pendingCount} request(s) are waiting for notary review.`,
        targetPath: "/app/requests?status=pending",
        priority: "high",
      }
    : null;

  return {
    role: "notary" as const,
    metrics: [
      { key: "pending-review", label: "Pending review", value: pendingCount },
      { key: "scheduled-today", label: "Scheduled today", value: scheduledTodayCount },
      { key: "completed-this-week", label: "Completed this week", value: completedThisWeekCount },
    ],
    documents: documents.map((document) => toDashboardDocumentSummary(document, "notary")),
    requests: buildRequestSummaries({
      requests,
      documentsById,
      usersById,
      meetingsByRequestId,
    }),
    meetings: buildMeetingSummaries({
      meetings,
      requestsById,
      documentsById,
      usersById,
    }),
    activity: auditEvents.map((event) => toDashboardActivity(event, documentsById)),
    alerts,
    nextAction: primaryAction?.description ?? null,
    primaryAction,
  } satisfies RoleAwareDashboardResponse;
};

const buildAdminDashboardData = async () => {
  const [documents, recentAuditEvents, auditEventsToday, verificationChecksToday] = await Promise.all([
    listDocuments(),
    listRecentAuditEvents(),
    countRowsSince("audit_events", "created_at", startOfTodayIso()),
    countRowsSince("public_verification_checks", "created_at", startOfTodayIso()),
  ]);

  const openDocuments = documents.filter((document) => {
    return document.status !== "completed" && document.status !== "notarized" && document.status !== "rejected";
  }).length;

  const alerts: DashboardAlert[] = [];
  if (openDocuments > 0) {
    const openDocumentsMessage = `${openDocuments} ${openDocuments === 1 ? "document is" : "documents are"} still in flight across the system.`;
    alerts.push({
      key: "open-documents",
      message: openDocumentsMessage,
    });
  }
  if (verificationChecksToday > 0) {
    alerts.push({
      key: "verification-checks",
      message: `${verificationChecksToday} public verification check(s) were recorded today.`,
    });
  }
  const primaryAction: DashboardPrimaryAction | null = openDocuments > 0
    ? {
        code: "inspect_open_documents",
        label: "Inspect open documents",
        description: `${openDocuments} ${openDocuments === 1 ? "document is" : "documents are"} still in flight across the system.`,
        targetPath: "/app/documents",
        priority: "medium",
      }
    : null;

  return {
    role: "admin" as const,
    metrics: [
      { key: "open-documents", label: "Open documents", value: openDocuments },
      { key: "audit-events-today", label: "Audit events today", value: auditEventsToday },
      { key: "verification-checks", label: "Verification checks", value: verificationChecksToday },
    ],
    documents: [],
    requests: [],
    meetings: [],
    activity: recentAuditEvents.map((event) => toDashboardActivity(event)),
    alerts,
    nextAction:
      primaryAction?.description ??
      "Use the Ops Console to inspect audit events, compliance exceptions, and support escalations.",
    primaryAction,
  } satisfies RoleAwareDashboardResponse;
};

export const buildMemberDashboardResponse = async (input: {
  supabaseUserId: string;
  email?: string | null | undefined;
  role?: string | null | undefined;
  ownerUserIdOverride?: string | null | undefined;
}) => {
  const role = normalizeRuntimeRole(input.role);
  const memberDashboard = await buildMemberLikeDashboardData({
    role,
    supabaseUserId: input.supabaseUserId,
    email: input.email,
    ownerUserIdOverride: input.ownerUserIdOverride,
    includeWorkflowState: false,
  });

  return {
    documents: memberDashboard.documents,
    activity: memberDashboard.activity,
    counts: memberDashboard.counts,
  } satisfies MemberDashboardResponse;
};

export const buildRoleAwareDashboard = async (input: {
  supabaseUserId: string;
  email?: string | null | undefined;
  role?: string | null | undefined;
}) => {
  const role = normalizeRuntimeRole(input.role);

  if (role === "member" || role === "pro") {
    const dashboard = await buildMemberLikeDashboardData({
      role,
      supabaseUserId: input.supabaseUserId,
      email: input.email,
    });

    return {
      role,
      metrics: dashboard.metrics,
      documents: dashboard.documents,
      requests: dashboard.requests,
      meetings: dashboard.meetings,
      activity: dashboard.activity,
      alerts: dashboard.alerts,
      nextAction: dashboard.nextAction,
      primaryAction: dashboard.primaryAction,
    } satisfies RoleAwareDashboardResponse;
  }

  if (role === "notary") {
    return buildNotaryDashboardData({
      supabaseUserId: input.supabaseUserId,
      email: input.email,
    });
  }

  return buildAdminDashboardData();
};