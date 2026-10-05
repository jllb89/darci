import Link from "next/link";
import { formatDateTime, formatStatusLabel, type NotaryQueueRequestSummary } from "@/lib/notaryWorkspace";

export function RequestRow({ request, tab }: { request: NotaryQueueRequestSummary; tab: "review" | "in_review" | "ready" | "completed" }) {
  const memberName = request.owner?.displayName ?? request.owner?.email ?? "Member pending";
  const queueStatus = request.request.queueStatus ?? request.workflow?.latestStatus ?? request.workflow?.status ?? request.request.status;
  const rowStatus = formatStatusLabel(queueStatus);
  const showSelectedBadge = Boolean(request.workflow?.selectedNotaryUserId && !request.workflow?.assignedNotaryUserId);
  const meetingStatus = request.meeting?.status ? formatStatusLabel(request.meeting.status) : "No meeting";
  const finalizationStatus = formatStatusLabel(request.finalization.latestStatus);
  const nextAction = request.nextAction ? formatStatusLabel(request.nextAction) : null;

  const rowContent = (
    <>
      <div className="min-w-0">
        <div className="truncate font-medium text-Color-Scheme-1-Text">{memberName}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-Color-Neutral-Lightest px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-Color-Neutral-Darkest">
            {rowStatus}
          </span>
          {showSelectedBadge ? (
            <span className="inline-flex rounded-full border border-Color-Scheme-1-Border/60 bg-Color-White px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-Color-Scheme-1-Text">
              Selected
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-Color-Neutral">
          <span>{meetingStatus}</span>
          <span>{finalizationStatus}</span>
          {nextAction ? <span>{nextAction}</span> : null}
        </div>
      </div>
      <div className="min-w-0 lg:text-right">
        <div className="truncate font-mono font-medium text-Color-Scheme-1-Text">{request.document.idn ?? "Pending"}</div>
        <div className="mt-1 text-xs text-Color-Neutral">{request.document.documentTypeLabel ?? formatStatusLabel(request.document.documentType)}</div>
      </div>
      <div className="min-w-0 lg:text-right">
        <div className="truncate text-xs text-Color-Neutral">Submitted {formatDateTime(request.request.submittedAt)}</div>
        <div className="mt-1 truncate text-xs text-Color-Neutral">Anchored {formatDateTime(request.finalization.anchoredAt)}</div>
      </div>
    </>
  );

  const rowClassName = "grid gap-3 px-3 py-4 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(10rem,0.5fr)_minmax(12rem,0.7fr)]";

  if (tab === "completed") {
    return <div className={rowClassName}>{rowContent}</div>;
  }

  return (
    <Link
      className={`${rowClassName} transition hover:bg-Color-Neutral-Lightest`}
      href={`/app/notary/requests/${encodeURIComponent(request.request.id)}`}
    >
      {rowContent}
    </Link>
  );
}
