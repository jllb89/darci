import type { FinalizationStatusHistoryRecord } from "./documentFinalizationService";
import type { DocumentRecord, DocumentSystemValueRecord } from "./documentService";
import type { IlluminotarizationWorkflowStatusHistoryRecord } from "./illuminotarizationWorkflowService";

export type DocumentTimelineEvent = {
  action: string;
  timestamp: string;
  actorId?: string;
};

type TimelineRequestRecord = {
  created_at: string;
  submitted_at: string | null;
};

type BuildDocumentTimelineInput = {
  document: Pick<DocumentRecord, "created_at" | "intake_submitted_at">;
  systemValues: DocumentSystemValueRecord[];
  request: TimelineRequestRecord | null;
  workflowStatusHistory: Array<
    Pick<
      IlluminotarizationWorkflowStatusHistoryRecord,
      "created_at" | "changed_by_user_id" | "next_status"
    >
  >;
  finalizationStatusHistory: Array<
    Pick<FinalizationStatusHistoryRecord, "created_at" | "changed_by_user_id" | "status">
  >;
};

type MutableTimelineEvent = DocumentTimelineEvent & {
  order: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readTimestamp = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (normalized.length === 0 || Number.isNaN(Date.parse(normalized))) {
    return null;
  }

  return normalized;
};

const readActorId = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const mapWorkflowStatusAction = (
  status: IlluminotarizationWorkflowStatusHistoryRecord["next_status"],
) => {
  switch (status) {
    case "draft":
      return "Workflow created";
    case "submitted":
      return "Notarization submitted";
    case "code_delivered":
      return "Illuminotary code delivered";
    case "in_review":
      return "Illuminotary review started";
    case "changes_requested":
      return "Changes requested";
    case "approved":
      return "Approved for meeting";
    case "rejected":
      return "Notarization rejected";
    case "completed":
      return "Workflow completed";
    case "canceled":
      return "Workflow canceled";
    case "expired":
      return "Workflow expired";
  }
};

const mapFinalizationStatusAction = (status: FinalizationStatusHistoryRecord["status"]) => {
  switch (status) {
    case "acknowledgment_appended":
      return "Acknowledgment appended";
    case "watermark_applied":
      return "Watermark applied";
    case "hash_recorded":
      return "Document hash recorded";
    case "ledger_anchored":
      return "Ledger anchored";
    case "verification_checked":
      return "Verification checked";
    case "failed":
      return "Finalization failed";
  }
};

const readSystemValueByKey = (systemValues: DocumentSystemValueRecord[], key: string) => {
  return systemValues.find((value) => value.system_key === key)?.value_json;
};

export const buildDocumentTimeline = (input: BuildDocumentTimelineInput) => {
  const events: MutableTimelineEvent[] = [];
  let order = 0;

  const pushEvent = (event: {
    action: string;
    timestamp: string | null;
    actorId?: string | null;
  }) => {
    if (!event.timestamp) {
      return;
    }

    events.push({
      action: event.action,
      timestamp: event.timestamp,
      ...(event.actorId ? { actorId: event.actorId } : {}),
      order,
    });
    order += 1;
  };

  pushEvent({
    action: "Document created",
    timestamp: readTimestamp(input.document.created_at),
  });

  pushEvent({
    action: "Intake submitted",
    timestamp: readTimestamp(input.document.intake_submitted_at),
  });

  const reviewApproval = readSystemValueByKey(input.systemValues, "review_approval");
  if (isRecord(reviewApproval)) {
    pushEvent({
      action: "Review approved",
      timestamp: readTimestamp(reviewApproval.approvedAt),
      actorId: readActorId(reviewApproval.actorSupabaseId),
    });
  }

  const signatureExecution = readSystemValueByKey(input.systemValues, "signature_execution");
  if (isRecord(signatureExecution)) {
    pushEvent({
      action: "Signatures confirmed",
      timestamp: readTimestamp(signatureExecution.confirmedAt),
      actorId: readActorId(signatureExecution.confirmedBySupabaseId),
    });
  }

  const hasWorkflowSubmission = input.workflowStatusHistory.some(
    (entry) => entry.next_status === "submitted",
  );
  if (!hasWorkflowSubmission) {
    pushEvent({
      action: "Notarization submitted",
      timestamp: readTimestamp(input.request?.submitted_at ?? input.request?.created_at ?? null),
    });
  }

  for (const entry of input.workflowStatusHistory) {
    pushEvent({
      action: mapWorkflowStatusAction(entry.next_status),
      timestamp: readTimestamp(entry.created_at),
      actorId: readActorId(entry.changed_by_user_id),
    });
  }

  for (const entry of input.finalizationStatusHistory) {
    pushEvent({
      action: mapFinalizationStatusAction(entry.status),
      timestamp: readTimestamp(entry.created_at),
      actorId: readActorId(entry.changed_by_user_id),
    });
  }

  const seen = new Set<string>();

  return events
    .sort((left, right) => {
      const leftTime = Date.parse(left.timestamp);
      const rightTime = Date.parse(right.timestamp);
      if (leftTime === rightTime) {
        return left.order - right.order;
      }

      return leftTime - rightTime;
    })
    .filter((event) => {
      const dedupeKey = `${event.action}|${event.timestamp}|${event.actorId ?? ""}`;
      if (seen.has(dedupeKey)) {
        return false;
      }

      seen.add(dedupeKey);
      return true;
    })
    .map(({ action, timestamp, actorId }) => ({
      action,
      timestamp,
      ...(actorId ? { actorId } : {}),
    } satisfies DocumentTimelineEvent));
};