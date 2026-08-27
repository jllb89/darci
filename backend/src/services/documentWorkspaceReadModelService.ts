import type { DocumentRecord } from "./documentService";
import {
  getLatestNotarizationCodeForRequest,
  getLatestNotarizationRequestForDocument,
} from "./documentService";
import {
  getVerificationSnapshotForDocument,
  listFinalizationStatusHistory,
} from "./documentFinalizationService";
import { getVisibleDocumentIdn } from "./documentVisibilityService";
import { listWorkflowStatusHistory } from "./illuminotarizationWorkflowService";
import {
  getDocumentReleaseControl,
  isFinalPackageReleaseUnavailable,
} from "./billingPolicyService";

export type DocumentWorkspaceSummary = {
  workflow: {
    requestId: string | null;
    workflowId: string | null;
    requestStatus: string | null;
    latestWorkflowStatus: string | null;
    latestWorkflowStatusAt: string | null;
    submittedAt: string | null;
    assignedNotaryId: string | null;
    latestCodeStatus: string | null;
    latestCodeExpiresAt: string | null;
  };
  finalization: {
    latestStatus: string | null;
    latestStatusAt: string | null;
    isAnchored: boolean;
    isVerificationChecked: boolean;
    isWatermarked: boolean;
    isHashRecorded: boolean;
    hash: string | null;
    ledgerTxId: string | null;
    anchoredAt: string | null;
    anchorAttempt: {
      id: string;
      status: string;
      attemptNumber: number;
      requestedAt: string;
      completedAt: string | null;
      failedAt: string | null;
      errorMessage: string | null;
    } | null;
    history: Array<{
      id: string;
      status: string;
      changeSource: string;
      changeReason: string | null;
      createdAt: string;
    }>;
  };
  verification: {
    status: "unavailable" | "pending_finalization" | "ready";
    idn: string | null;
    verifyPath: string | null;
  };
  release: {
    status: "unmanaged" | "pending" | "billing_held" | "released";
    reasonCode: string | null;
    heldAt: string | null;
    releasedAt: string | null;
  };
};

const buildDefaultSummary = (visibleIdn: string | null): DocumentWorkspaceSummary => ({
  workflow: {
    requestId: null,
    workflowId: null,
    requestStatus: null,
    latestWorkflowStatus: null,
    latestWorkflowStatusAt: null,
    submittedAt: null,
    assignedNotaryId: null,
    latestCodeStatus: null,
    latestCodeExpiresAt: null,
  },
  finalization: {
    latestStatus: null,
    latestStatusAt: null,
    isAnchored: false,
    isVerificationChecked: false,
    isWatermarked: false,
    isHashRecorded: false,
    hash: null,
    ledgerTxId: null,
    anchoredAt: null,
    anchorAttempt: null,
    history: [],
  },
  verification: {
    status: visibleIdn ? "pending_finalization" : "unavailable",
    idn: visibleIdn,
    verifyPath: visibleIdn ? `/verify/${encodeURIComponent(visibleIdn)}` : null,
  },
  release: {
    status: "unmanaged",
    reasonCode: null,
    heldAt: null,
    releasedAt: null,
  },
});

export const buildDocumentWorkspaceSummary = async (input: {
  document: Pick<DocumentRecord, "id" | "idn" | "status">;
  viewerRole?: string | null | undefined;
}) => {
  const visibleIdn = getVisibleDocumentIdn({
    idn: input.document.idn,
    status: input.document.status,
    viewerRole: input.viewerRole,
  });

  const summary = buildDefaultSummary(visibleIdn);
  const request = await getLatestNotarizationRequestForDocument(input.document.id);
  const latestCode = request
    ? await getLatestNotarizationCodeForRequest(request.id)
    : null;
  const [workflowStatusHistory, finalizationStatusHistory, verificationSnapshot, releaseControl] = await Promise.all([
    request?.workflow_id ? listWorkflowStatusHistory(request.workflow_id) : Promise.resolve([]),
    listFinalizationStatusHistory(input.document.id),
    getVerificationSnapshotForDocument(input.document as DocumentRecord),
    getDocumentReleaseControl(input.document.id),
  ]);
  const heldFromViewer = Boolean(
    isFinalPackageReleaseUnavailable(releaseControl) &&
      !["notary", "admin", "service_role"].includes(input.viewerRole ?? ""),
  );

  const latestWorkflowStatus = workflowStatusHistory.at(-1) ?? null;
  const latestFinalizationStatus = finalizationStatusHistory.at(-1) ?? null;
  const isAnchored = finalizationStatusHistory.some((entry) => entry.status === "ledger_anchored");
  const isWatermarked = finalizationStatusHistory.some((entry) => entry.status === "watermark_applied");
  const isHashRecorded = finalizationStatusHistory.some((entry) => entry.status === "hash_recorded");
  const isVerificationChecked = finalizationStatusHistory.some(
    (entry) => entry.status === "verification_checked",
  );

  summary.workflow = {
    requestId: request?.id ?? null,
    workflowId: request?.workflow_id ?? null,
    requestStatus: request?.status ?? null,
    latestWorkflowStatus: latestWorkflowStatus?.next_status ?? request?.status ?? null,
    latestWorkflowStatusAt: latestWorkflowStatus?.created_at ?? null,
    submittedAt: request?.submitted_at ?? null,
    assignedNotaryId: request?.assigned_notary_id ?? null,
    latestCodeStatus: latestCode?.status ?? null,
    latestCodeExpiresAt: latestCode?.expires_at ?? null,
  };

  summary.finalization = {
    latestStatus: latestFinalizationStatus?.status ?? null,
    latestStatusAt: latestFinalizationStatus?.created_at ?? null,
    isAnchored,
    isVerificationChecked,
    isWatermarked,
    isHashRecorded,
    hash: heldFromViewer ? null : verificationSnapshot.hashRecord?.hash ?? null,
    ledgerTxId: heldFromViewer ? null : verificationSnapshot.ledgerEntry?.ledger_tx_id ?? null,
    anchoredAt: heldFromViewer ? null : verificationSnapshot.ledgerEntry?.anchored_at ?? null,
    anchorAttempt: !heldFromViewer && verificationSnapshot.ledgerAnchorAttempt
      ? {
          id: verificationSnapshot.ledgerAnchorAttempt.id,
          status: verificationSnapshot.ledgerAnchorAttempt.status,
          attemptNumber: verificationSnapshot.ledgerAnchorAttempt.attempt_number,
          requestedAt: verificationSnapshot.ledgerAnchorAttempt.requested_at,
          completedAt: verificationSnapshot.ledgerAnchorAttempt.completed_at,
          failedAt: verificationSnapshot.ledgerAnchorAttempt.failed_at,
          errorMessage: verificationSnapshot.ledgerAnchorAttempt.error_message,
        }
      : null,
    history: finalizationStatusHistory.map((entry) => ({
      id: entry.id,
      status: entry.status,
      changeSource: entry.change_source,
      changeReason: entry.change_reason,
      createdAt: entry.created_at,
    })),
  };

  summary.verification = {
    status: heldFromViewer || !visibleIdn ? "unavailable" : isAnchored ? "ready" : "pending_finalization",
    idn: visibleIdn,
    verifyPath: heldFromViewer || !visibleIdn ? null : `/verify/${encodeURIComponent(visibleIdn)}`,
  };

  summary.release = {
    status: releaseControl?.release_status ?? (heldFromViewer ? "pending" : "unmanaged"),
    reasonCode: releaseControl?.release_status === "billing_held"
      ? "membership_reactivation_required"
      : heldFromViewer
        ? "final_package_release_pending"
        : null,
    heldAt: releaseControl?.held_at ?? null,
    releasedAt: releaseControl?.released_at ?? null,
  };

  return summary;
};

export const buildDocumentWorkspaceSummaries = async (input: {
  documents: Array<Pick<DocumentRecord, "id" | "idn" | "status">>;
  viewerRole?: string | null | undefined;
}) => {
  const summaryEntries = new Array<[string, DocumentWorkspaceSummary] | null>(input.documents.length).fill(null);
  const concurrency = Math.min(4, input.documents.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < input.documents.length) {
        const documentIndex = nextIndex;
        const document = input.documents[nextIndex];
        nextIndex += 1;
        if (!document) {
          continue;
        }

        try {
          const summary = await buildDocumentWorkspaceSummary({
            document,
            viewerRole: input.viewerRole,
          });
          summaryEntries[documentIndex] = [document.id, summary];
        } catch (error) {
          const visibleIdn = getVisibleDocumentIdn({
            idn: document.idn,
            status: document.status,
            viewerRole: input.viewerRole,
          });
          summaryEntries[documentIndex] = [document.id, buildDefaultSummary(visibleIdn)];
          console.warn("Document workspace summary fallback used", {
            documentId: document.id,
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    }),
  );

  const summaries = new Map<string, DocumentWorkspaceSummary>();
  for (const entry of summaryEntries) {
    if (entry) {
      summaries.set(entry[0], entry[1]);
    }
  }

  return summaries;
};
