import { listRecentAuditEventsForDocumentIds } from "./auditService";
import {
  getDocumentById,
  getLatestNotarizationRequestForDocument,
  listDocuments as listDocumentsFromDb,
  listNotarizationRequests,
  type DocumentRecord,
  type NotarizationRequestRecord,
} from "./documentService";
import {
  getLatestPublicVerificationCheckByIdn,
  getVerificationSnapshotByIdn,
  getVerificationSnapshotForDocument,
  resolvePublicVerificationStatus,
  type LedgerAnchorAttemptRecord,
  type PublicVerificationCheckRecord,
  type PublicVerificationStatus,
} from "./documentFinalizationService";
import { getVisibleDocumentIdn } from "./documentVisibilityService";
import {
  getIlluminotarizationWorkflowById,
  getLatestCodeDeliveryForRequest,
  listWorkflowStatusHistory,
  type CodeDeliveryRecord,
  type IlluminotarizationWorkflowRecord,
  type IlluminotarizationWorkflowStatusHistoryRecord,
} from "./illuminotarizationWorkflowService";
import { getMeetingByRequestId, type MeetingRecord } from "./meetingService";
import type { RequestRole } from "./userRoleService";
import {
  getWorkspaceIdentitySummaryByUserId,
  type WorkspaceIdentitySummary,
} from "./workspaceIdentitySummaryService";
import { canViewerAccessFinalPackage } from "./billingPolicyService";

export type VerificationWorkspaceSummary = {
  idn: string;
  documentId: string;
  status: PublicVerificationStatus;
  documentStatus: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  owner: WorkspaceIdentitySummary | null;
  notary: WorkspaceIdentitySummary | null;
  anchoredAt: string | null;
  lastCheckedAt: string | null;
  publicVerifyPath: string;
};

export type VerificationWorkspaceDetail = {
  verification: {
    idn: string;
    documentId: string;
    documentStatus: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    hash: string | null;
    ledgerTxId: string | null;
    anchoredAt: string | null;
    status: PublicVerificationStatus;
    lastCheckedAt: string | null;
    publicVerifyPath: string;
  };
  request: {
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
  } | null;
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
  latestCheck: {
    id: string;
    resultStatus: PublicVerificationStatus;
    createdAt: string;
  } | null;
  anchorAttempt: {
    id: string;
    status: LedgerAnchorAttemptRecord["status"];
    attemptNumber: number;
    requestedAt: string;
    completedAt: string | null;
    failedAt: string | null;
    errorMessage: string | null;
  } | null;
  owner: WorkspaceIdentitySummary | null;
  notary: WorkspaceIdentitySummary | null;
  documents: Array<{
    id: string;
    idn: string;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    createdAt: string;
    publicVerifyPath: string;
  }>;
  audit: Array<{
    id: string;
    action: string;
    message: string;
    timestamp: string;
    actorId: string | null;
  }>;
};

export class VerificationReadModelServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "VerificationReadModelServiceError";
  }
}

const isPrivilegedRole = (role: RequestRole) => {
  return role === "admin" || role === "service_role";
};

const isOwnerLikeRole = (role: RequestRole) => {
  return role === "member" || role === "pro";
};

const requireViewerUserId = (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  const viewerUserId = input.viewerUserId?.trim() ?? "";
  if (viewerUserId.length > 0) {
    return viewerUserId;
  }

  throw new VerificationReadModelServiceError(
    403,
    `${input.role === "notary" ? "Notary" : "User"} is not registered`,
  );
};

const buildPublicVerifyPath = (idn: string) => {
  return `/verify/${encodeURIComponent(idn)}`;
};

const resolveVisibleIdn = (input: {
  document: Pick<DocumentRecord, "idn" | "status">;
  viewerRole: RequestRole;
}) => {
  return getVisibleDocumentIdn({
    idn: input.document.idn,
    status: input.document.status,
    viewerRole: input.viewerRole,
  });
};

const resolveNotaryUserId = (request: NotarizationRequestRecord | null) => {
  return request?.assigned_notary_id ?? null;
};

const getLastCheckedAt = (input: {
  latestCheckAt: string | null;
  anchoredAt: string | null;
  document: Pick<DocumentRecord, "updated_at" | "created_at">;
}) => {
  return input.latestCheckAt ?? input.anchoredAt ?? input.document.updated_at ?? input.document.created_at;
};

const formatAuditMessage = (action: string) => {
  return action
    .split(/[._]/g)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const canAccessVerificationDocument = (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
  document: Pick<DocumentRecord, "owner_id">;
  request: NotarizationRequestRecord | null;
}) => {
  if (isPrivilegedRole(input.role)) {
    return true;
  }

  if (isOwnerLikeRole(input.role)) {
    return Boolean(input.viewerUserId) && input.document.owner_id === input.viewerUserId;
  }

  if (input.role === "notary") {
    return Boolean(input.viewerUserId) && input.request?.assigned_notary_id === input.viewerUserId;
  }

  return false;
};

const listCandidateDocuments = async (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  if (isPrivilegedRole(input.role)) {
    return listDocumentsFromDb();
  }

  if (isOwnerLikeRole(input.role)) {
    return listDocumentsFromDb(requireViewerUserId(input));
  }

  const notaryUserId = requireViewerUserId(input);
  const requests = await listNotarizationRequests({
    assignedNotaryId: notaryUserId,
    limit: 200,
    offset: 0,
  });
  const documentIds = Array.from(new Set(requests.map((request) => request.document_id)));
  const documents = await Promise.all(documentIds.map((documentId) => getDocumentById(documentId)));

  return documents.filter((document): document is DocumentRecord => document !== null);
};

const compareByMostRecentActivity = (
  left: Pick<VerificationWorkspaceSummary, "lastCheckedAt" | "anchoredAt">,
  right: Pick<VerificationWorkspaceSummary, "lastCheckedAt" | "anchoredAt">,
) => {
  const leftTime = Date.parse(left.lastCheckedAt ?? left.anchoredAt ?? "1970-01-01T00:00:00.000Z");
  const rightTime = Date.parse(right.lastCheckedAt ?? right.anchoredAt ?? "1970-01-01T00:00:00.000Z");

  return rightTime - leftTime;
};

const mapVerificationDocument = (input: {
  document: DocumentRecord;
  visibleIdn: string;
}) => {
  return {
    id: input.document.id,
    idn: input.visibleIdn,
    status: input.document.status,
    documentType: input.document.document_type,
    jurisdiction: input.document.jurisdiction,
    createdAt: input.document.created_at,
    publicVerifyPath: buildPublicVerifyPath(input.visibleIdn),
  };
};

const mapAuditEvent = (event: {
  id: string;
  action: string;
  created_at: string;
  actor_id: string | null;
}) => {
  return {
    id: event.id,
    action: event.action,
    message: formatAuditMessage(event.action),
    timestamp: event.created_at,
    actorId: event.actor_id,
  };
};

const mapVerificationRequest = (
  request: NotarizationRequestRecord,
  meeting: MeetingRecord | null,
) => {
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

const getLatestWorkflowStatusEntry = (
  workflowStatusHistory: Array<
    Pick<IlluminotarizationWorkflowStatusHistoryRecord, "next_status" | "created_at">
  >,
) => {
  return workflowStatusHistory.at(-1) ?? null;
};

const mapVerificationWorkflow = (
  workflow: IlluminotarizationWorkflowRecord,
  workflowStatusHistory: IlluminotarizationWorkflowStatusHistoryRecord[],
) => {
  const latestStatusEntry = getLatestWorkflowStatusEntry(workflowStatusHistory);

  return {
    id: workflow.id,
    status: workflow.status,
    latestStatus: latestStatusEntry?.next_status ?? workflow.status,
    latestStatusAt: latestStatusEntry?.created_at ?? workflow.updated_at,
    reviewStartedAt: workflow.review_started_at,
    closedAt: workflow.closed_at,
    selectedNotaryUserId: workflow.selected_notary_user_id,
    assignedNotaryUserId: workflow.assigned_notary_user_id,
    lastCodeGeneratedAt: workflow.last_code_generated_at,
  };
};

const mapVerificationCodeDelivery = (delivery: CodeDeliveryRecord) => {
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

const mapVerificationCheck = (check: PublicVerificationCheckRecord) => {
  return {
    id: check.id,
    resultStatus: check.result_status,
    createdAt: check.created_at,
  };
};

const mapAnchorAttempt = (attempt: LedgerAnchorAttemptRecord) => {
  return {
    id: attempt.id,
    status: attempt.status,
    attemptNumber: attempt.attempt_number,
    requestedAt: attempt.requested_at,
    completedAt: attempt.completed_at,
    failedAt: attempt.failed_at,
    errorMessage: attempt.error_message,
  };
};

const buildVerificationSummaryForDocument = async (input: {
  document: DocumentRecord;
  viewerRole: RequestRole;
}) => {
  const visibleIdn = resolveVisibleIdn({
    document: input.document,
    viewerRole: input.viewerRole,
  });
  if (!visibleIdn) {
    return null as VerificationWorkspaceSummary | null;
  }
  if (!(await canViewerAccessFinalPackage({
    documentId: input.document.id,
    viewerRole: input.viewerRole,
  }))) {
    return null;
  }

  const [snapshot, latestCheck, latestRequest, owner] = await Promise.all([
    getVerificationSnapshotForDocument(input.document),
    getLatestPublicVerificationCheckByIdn(visibleIdn),
    getLatestNotarizationRequestForDocument(input.document.id),
    getWorkspaceIdentitySummaryByUserId(input.document.owner_id),
  ]);
  const notary = await getWorkspaceIdentitySummaryByUserId(resolveNotaryUserId(latestRequest));

  return {
    idn: visibleIdn,
    documentId: input.document.id,
    status: resolvePublicVerificationStatus(snapshot),
    documentStatus: input.document.status,
    documentType: input.document.document_type,
    jurisdiction: input.document.jurisdiction,
    owner,
    notary,
    anchoredAt: snapshot.ledgerEntry?.anchored_at ?? null,
    lastCheckedAt: getLastCheckedAt({
      latestCheckAt: latestCheck?.created_at ?? null,
      anchoredAt: snapshot.ledgerEntry?.anchored_at ?? null,
      document: input.document,
    }),
    publicVerifyPath: buildPublicVerifyPath(visibleIdn),
  } satisfies VerificationWorkspaceSummary;
};

export const listSharedVerifications = async (input: {
  role: RequestRole;
  viewerUserId?: string | null | undefined;
  idn?: string | null | undefined;
  status?: PublicVerificationStatus | null | undefined;
  limit: number;
  offset: number;
}) => {
  const requestedIdn = input.idn?.trim() ?? "";
  const documents = await listCandidateDocuments({
    role: input.role,
    viewerUserId: input.viewerUserId,
  });
  const summaries = await Promise.all(
    documents.map((document) => {
      return buildVerificationSummaryForDocument({
        document,
        viewerRole: input.role,
      });
    }),
  );

  return summaries
    .filter((summary): summary is VerificationWorkspaceSummary => summary !== null)
    .filter((summary) => (requestedIdn.length > 0 ? summary.idn === requestedIdn : true))
    .filter((summary) => (input.status ? summary.status === input.status : true))
    .sort(compareByMostRecentActivity)
    .slice(input.offset, input.offset + input.limit);
};

export const getSharedVerificationDetail = async (input: {
  idn: string;
  role: RequestRole;
  viewerUserId?: string | null | undefined;
}) => {
  const normalizedIdn = input.idn.trim();
  if (normalizedIdn.length === 0) {
    return null as VerificationWorkspaceDetail | null;
  }

  const snapshot = await getVerificationSnapshotByIdn(normalizedIdn);
  if (!snapshot.document) {
    return null;
  }

  const latestRequest = await getLatestNotarizationRequestForDocument(snapshot.document.id);
  if (
    !canAccessVerificationDocument({
      role: input.role,
      viewerUserId: input.viewerUserId,
      document: snapshot.document,
      request: latestRequest,
    })
  ) {
    return null;
  }

  const visibleIdn = resolveVisibleIdn({
    document: snapshot.document,
    viewerRole: input.role,
  });
  if (!visibleIdn) {
    return null;
  }
  if (!(await canViewerAccessFinalPackage({
    documentId: snapshot.document.id,
    viewerRole: input.role,
  }))) {
    return null;
  }

  const [latestCheck, owner, notary, auditEvents] = await Promise.all([
    getLatestPublicVerificationCheckByIdn(visibleIdn),
    getWorkspaceIdentitySummaryByUserId(snapshot.document.owner_id),
    getWorkspaceIdentitySummaryByUserId(resolveNotaryUserId(latestRequest)),
    listRecentAuditEventsForDocumentIds([snapshot.document.id], 10),
  ]);

  const workflowId = latestRequest?.workflow_id ?? null;
  const [meeting, latestCodeDelivery, workflow, workflowStatusHistory] = await Promise.all([
    latestRequest ? getMeetingByRequestId(latestRequest.id) : Promise.resolve(null),
    latestRequest ? getLatestCodeDeliveryForRequest(latestRequest.id) : Promise.resolve(null),
    workflowId ? getIlluminotarizationWorkflowById(workflowId) : Promise.resolve(null),
    workflowId ? listWorkflowStatusHistory(workflowId) : Promise.resolve([]),
  ]);

  return {
    verification: {
      idn: visibleIdn,
      documentId: snapshot.document.id,
      documentStatus: snapshot.document.status,
      documentType: snapshot.document.document_type,
      jurisdiction: snapshot.document.jurisdiction,
      hash: snapshot.hashRecord?.hash ?? null,
      ledgerTxId: snapshot.ledgerEntry?.ledger_tx_id ?? null,
      anchoredAt: snapshot.ledgerEntry?.anchored_at ?? null,
      status: resolvePublicVerificationStatus(snapshot),
      lastCheckedAt: getLastCheckedAt({
        latestCheckAt: latestCheck?.created_at ?? null,
        anchoredAt: snapshot.ledgerEntry?.anchored_at ?? null,
        document: snapshot.document,
      }),
      publicVerifyPath: buildPublicVerifyPath(visibleIdn),
    },
    request: latestRequest ? mapVerificationRequest(latestRequest, meeting) : null,
    workflow: workflow ? mapVerificationWorkflow(workflow, workflowStatusHistory) : null,
    latestCodeDelivery: latestCodeDelivery ? mapVerificationCodeDelivery(latestCodeDelivery) : null,
    latestCheck: latestCheck ? mapVerificationCheck(latestCheck) : null,
    anchorAttempt: snapshot.ledgerAnchorAttempt ? mapAnchorAttempt(snapshot.ledgerAnchorAttempt) : null,
    owner,
    notary,
    documents: [
      mapVerificationDocument({
        document: snapshot.document,
        visibleIdn,
      }),
    ],
    audit: auditEvents.map(mapAuditEvent),
  } satisfies VerificationWorkspaceDetail;
};
