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
const REQUEST_LIMIT = 10;
const MEETING_LIMIT = 10;

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
  "id" | "owner_id" | "idn" | "status" | "document_type" | "jurisdiction" | "created_at" | "updated_at"
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
};

export type DashboardDocumentSummary = {
  id: string;
  idn: string | null;
  status: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  createdAt: string;
  updatedAt: string | null;
};

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
  metrics: DashboardMetric[];
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

const toDashboardActivity = (event: AuditEventRecord): DashboardActivity => {
  return {
    action: event.action,
    timestamp: event.created_at,
    documentId: resolveDocumentId(event),
    entityType: event.entity_type,
    entityId: event.entity_id,
  };
};

const toDashboardDocumentSummary = (
  document: DashboardDocumentRecord,
  viewerRole: RuntimeRole,
): DashboardDocumentSummary => {
  return {
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
  const includeWorkflowState = input.includeWorkflowState ?? true;
  const requests = includeWorkflowState
    ? await listNotarizationRequestsByDocumentIds(documentIds)
    : [];
  const meetings = includeWorkflowState
    ? await listMeetingsByRequestIds(requests.map((request) => request.id))
    : [];
  const auditEvents = documentIds.length
    ? await listRecentAuditEventsForDocumentIds(documentIds, ACTIVITY_LIMIT, ownerId)
    : [];

  const counts: MemberDashboardCounts = {
    draft: 0,
    pendingReview: 0,
    pendingSignature: 0,
    pendingNotary: 0,
    completed: 0,
    total: documents.length,
  };

  for (const document of documents) {
    if (document.status === "draft") {
      counts.draft += 1;
    } else if (document.status === "pending_review") {
      counts.pendingReview += 1;
    } else if (document.status === "pending_signature") {
      counts.pendingSignature += 1;
    } else if (document.status === "pending_notary") {
      counts.pendingNotary += 1;
    } else if (document.status === "completed" || document.status === "notarized") {
      counts.completed += 1;
    }
  }

  const documentsById = new Map(documents.map((document) => [document.id, document]));
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
  if (counts.pendingNotary > 0) {
    alerts.push({
      key: "awaiting-notary",
      message: `${counts.pendingNotary} document(s) are awaiting notary completion.`,
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

  return {
    counts,
    documents: documents
      .slice(0, DOCUMENT_LIMIT)
      .map((document) => toDashboardDocumentSummary(document, input.role)),
    requests: requestsSummary,
    meetings: upcomingMeetings,
    activity: auditEvents.map(toDashboardActivity),
    alerts,
    nextAction: null,
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
    activity: auditEvents.map(toDashboardActivity),
    alerts,
    nextAction: null,
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
    alerts.push({
      key: "open-documents",
      message: `${openDocuments} document(s) are still in flight across the system.`,
    });
  }
  if (verificationChecksToday > 0) {
    alerts.push({
      key: "verification-checks",
      message: `${verificationChecksToday} public verification check(s) were recorded today.`,
    });
  }

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
    activity: recentAuditEvents.map(toDashboardActivity),
    alerts,
    nextAction: "Use the Ops Console to inspect audit events, compliance exceptions, and support escalations.",
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