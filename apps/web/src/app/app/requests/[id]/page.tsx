"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAppToast } from "@/components/app/AppToastContext";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";
import { captureDomainException } from "@/lib/clientTelemetry";
import { GeolocationCaptureError, getCurrentGeolocationSample } from "@/lib/geolocation";
import {
  buildRealtimeEqualsFilter,
  requestRealtimeBroadcastEvent,
  useRequestRealtimeInvalidation,
  type RequestRealtimeTarget,
} from "@/lib/requestRealtime";
import {
  canRecordMemberSessionCheckIn,
  hasRequestSessionParticipantCheckedIn,
  shouldShowMemberSessionCheckIn,
} from "../requestSession";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";
const previewPanelHeightClass = "h-[72vh] min-h-[560px]";

type RequestDetailPayload = {
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
  };
  document: {
    id: string;
    idn: string | null;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    reviewDocuments: Array<{
      id: string;
      versionId: string;
      label: string;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      isFinal: boolean;
      downloadUrl: string | null;
      createdAt: string;
    }>;
    summary: {
      verification: {
        status: string;
        idn: string | null;
        verifyPath: string | null;
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
    };
  };
  workflow: {
    latestStatus: string | null;
    latestStatusAt: string | null;
    selectedNotaryUserId: string | null;
    assignedNotaryUserId: string | null;
  } | null;
  latestCodeDelivery: {
    status: string;
    expiresAt: string | null;
    deliveredAt: string | null;
  } | null;
  owner: {
    displayName: string | null;
  } | null;
  notary: {
    displayName: string | null;
  } | null;
  meeting: {
    meetingId: string;
    requestId: string;
    workflowId: string | null;
    scheduledAt: string | null;
    timezone: string | null;
    location: string | null;
    status: string | null;
    samePlaceRequired: boolean;
    samePlaceStatus: string | null;
    proposedSlots: string[];
    participants: Array<{
      id: string;
      userId: string | null;
      participantRole: string;
      status: string;
      presenceRequired: boolean;
      participantLabel: string | null;
      arrivedAt: string | null;
      departedAt: string | null;
    }>;
    identityVerifications: Array<{
      id: string;
      participantRole: string;
      verificationMethod: string;
      status: string;
      verifiedAt: string | null;
    }>;
    proximityEvaluations: Array<{
      id: string;
      evaluationKind: string;
      status: string;
      observedDistanceMeters: number | null;
      evaluatedAt: string;
    }>;
    artifacts: Array<{
      id: string;
      artifactKind: string;
      status: string;
      capturedAt: string | null;
    }>;
  } | null;
  warnings: Array<{
    code: string;
    severity: "info" | "warning";
    message: string;
  }>;
  nextAction: string | null;
};

const fetchWithTokenRefresh = async (
  url: string,
  accessToken: string,
  init?: RequestInit,
) => {
  const requestWithToken = (token: string) => {
    const headers = new Headers(init?.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(url, {
      ...init,
      headers,
    });
  };

  const response = await requestWithToken(accessToken);
  if (response.status !== 401) {
    return response;
  }

  try {
    const refreshed = await refreshStoredAuth();
    if (!refreshed?.accessToken) {
      return response;
    }

    return requestWithToken(refreshed.accessToken);
  } catch {
    return response;
  }
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const formatStatusLabel = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatProductLabel = (documentType: string | null | undefined) => {
  const label = formatStatusLabel(documentType);
  return label === "-" ? "Document" : label;
};

const formatCompactReviewDocumentLabel = (
  document: { label: string },
  index: number,
) => {
  return document.label.trim() || `Document ${index + 1}`;
};

const isAcknowledgedReviewDocument = (document: { fileName: string | null; label: string }) => {
  const text = `${document.fileName ?? ""} ${document.label}`.toLowerCase();
  return text.includes("acknowledged");
};

const getReviewDocumentStatusLabel = (document: { fileName: string | null; label: string; isFinal: boolean }) => {
  if (document.isFinal) {
    return "Final package";
  }

  if (isAcknowledgedReviewDocument(document)) {
    return "Acknowledgment appended";
  }

  return "Ready";
};

function CompletionStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-Color-White px-3 py-2 text-xs shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
      <span className="text-Color-Neutral-Darkest">{label}</span>
      <span className={done ? "font-medium text-emerald-700" : "text-Color-Neutral"}>{done ? "Done" : "Pending"}</span>
    </div>
  );
}

function SessionTimeline({ steps }: { steps: Array<{ description: string; done: boolean; label: string }> }) {
  const firstPendingIndex = steps.findIndex((step) => !step.done);
  const currentIndex = firstPendingIndex === -1 ? steps.length - 1 : firstPendingIndex;
  const currentStep = steps[currentIndex] ?? steps[0];
  const previousStep = currentIndex > 0 ? steps[currentIndex - 1] ?? null : null;
  const nextStep = steps.slice(currentIndex + 1, currentIndex + 2)[0] ?? null;
  const completedCount = steps.filter((step) => step.done).length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;
  const isComplete = completedCount === steps.length;

  if (!currentStep) {
    return null;
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[420px] rounded-2xl border border-white/10 bg-black py-3 text-xs text-white">
      <div className="space-y-2 px-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
              {!isComplete ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-Green opacity-30" /> : null}
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-Green" />
            </span>
            {currentStep.label}
          </span>
          <span className="min-w-0 truncate text-[11px] leading-4 text-white">{currentStep.description}</span>
          <span className="ml-auto text-[11px] font-medium text-white/70">
            {completedCount}/{steps.length}
          </span>
        </div>
        <div className="mb-3 mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-Green transition-all duration-700 ease-out" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="flex items-start justify-between gap-4">
          {previousStep ? (
            <div className="shrink-0 rounded-full bg-white/5 px-3 pb-0.5 pt-1.5 text-left text-[10px] leading-4 text-white/72">
              <div className="font-medium text-white">Previous: {previousStep.label}</div>
              <div className="text-white/58">{previousStep.description}</div>
            </div>
          ) : (
            <div />
          )}
          {nextStep ? (
            <div className="shrink-0 rounded-full bg-white/5 px-3 pb-0.5 pt-1.5 text-right text-[10px] leading-4 text-white/72">
              <div className="font-medium text-white">Next: {nextStep.label}</div>
              <div className="text-white/58">{nextStep.description}</div>
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}

const readApiErrorMessage = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null) as { message?: unknown } | null;
  return typeof payload?.message === "string" && payload.message.trim() ? payload.message : fallback;
};

export default function RequestWorkspacePage() {
  const params = useParams<{ id: string }>();
  const requestId = typeof params?.id === "string" ? params.id : "";
  const { accessToken, refreshToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const [payload, setPayload] = useState<RequestDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRequest = useCallback(async () => {
    if (!accessToken || !requestId) {
      setPayload(null);
      return;
    }

    setIsLoading(true);
    try {
      const detailResponse = await fetchWithTokenRefresh(`${apiBaseUrl}/requests/${encodeURIComponent(requestId)}`, accessToken, {
        cache: "no-store",
      });
      const detailPayload = (await detailResponse.json().catch(() => null)) as RequestDetailPayload | null;

      if (!detailResponse.ok || !detailPayload?.request) {
        throw new Error("Failed to load request.");
      }

      setPayload(detailPayload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load request.");
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, requestId]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  const realtimeTargets: RequestRealtimeTarget[] = [
    { table: "notarization_requests", filter: buildRealtimeEqualsFilter("id", requestId) },
    { table: "meetings", filter: buildRealtimeEqualsFilter("request_id", requestId) },
    { table: "workflow_status_history", filter: buildRealtimeEqualsFilter("workflow_id", payload?.request.workflowId) },
    { table: "meeting_participants", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "meeting_checkins", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "geolocation_samples", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "proximity_evaluations", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "identity_verification_events", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "meeting_artifacts", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "document_versions", filter: buildRealtimeEqualsFilter("document_id", payload?.document.id) },
    { table: "finalization_status_history", filter: buildRealtimeEqualsFilter("document_id", payload?.document.id) },
    { table: "document_hash_records", filter: buildRealtimeEqualsFilter("document_id", payload?.document.id) },
  ];

  useRequestRealtimeInvalidation({
    enabled: Boolean(accessToken && requestId),
    accessToken,
    refreshToken,
    channelName: `request:${requestId}`,
    targets: realtimeTargets,
    broadcastTargets: [{ event: requestRealtimeBroadcastEvent, private: true }],
    onInvalidate: loadRequest,
    pollIntervalMs: 30_000,
  });

  const handleMemberCheckIn = async () => {
    if (!accessToken || !requestId) {
      setErrorMessage("Sign in again to check in for the in-person session.");
      return;
    }

    setIsCheckingIn(true);
    setErrorMessage(null);

    try {
      const geolocation = await getCurrentGeolocationSample();

      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/notary/requests/${encodeURIComponent(requestId)}/meeting/check-in`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            participantRole: "member",
            checkinKind: "arrival",
            recordedAt: new Date().toISOString(),
            notes: "Member checked in from the member request workspace.",
            geolocation,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to record member check-in."));
      }

      showToast({
        tone: "success",
        message: "Location check-in recorded. Your Illuminotary can continue the session.",
      });
      await loadRequest();
    } catch (error) {
      captureDomainException(error, {
        level: "warning",
        operation: "member_request.location_checkin",
        errorCode: error instanceof GeolocationCaptureError
          ? `WEB_MEMBER_LOCATION_${error.code.toUpperCase()}`
          : "WEB_MEMBER_LOCATION_CHECKIN_FAILED",
        errorFamily: "notarization",
        tags: {
          feature: "member_request_workspace",
          notary_request_id: requestId,
        },
      });
      setErrorMessage(error instanceof Error ? error.message : "Unable to record member check-in.");
    } finally {
      setIsCheckingIn(false);
    }
  };

  const detail = payload?.request ?? null;
  const sessionMeeting = payload?.meeting ?? null;
  const liveMeeting = sessionMeeting?.status === "in_progress" ? sessionMeeting : null;
  const hasMemberCheckIn = hasRequestSessionParticipantCheckedIn(sessionMeeting, "member");
  const hasNotaryCheckIn = hasRequestSessionParticipantCheckedIn(sessionMeeting, "notary");
  const isInitialMemberCheckIn = shouldShowMemberSessionCheckIn(liveMeeting);
  const canCheckIn = canRecordMemberSessionCheckIn(liveMeeting);
  const finalization = payload?.document.summary.finalization ?? null;
  const verification = payload?.document.summary.verification ?? null;
  const reviewDocuments = payload?.document.reviewDocuments ?? [];
  const downloadableDocuments = reviewDocuments.filter((document) => Boolean(document.downloadUrl));
  const finalPackageDocument = downloadableDocuments.find((document) => document.isFinal) ?? downloadableDocuments.at(-1) ?? null;
  const selectedDocument =
    reviewDocuments.find((document) => document.id === selectedDocumentId) ??
    reviewDocuments.at(-1) ??
    null;
  const selectedDocumentIndex = selectedDocument
    ? reviewDocuments.findIndex((document) => document.id === selectedDocument.id)
    : -1;
  const selectedDocumentLabel = selectedDocument
    ? formatCompactReviewDocumentLabel(
        selectedDocument,
        Math.max(selectedDocumentIndex, 0),
      )
    : formatProductLabel(payload?.document.documentType);
  const latestPassedProximity =
    sessionMeeting?.proximityEvaluations
      .filter((evaluation) => evaluation.evaluationKind === "same_place" && evaluation.status === "passed")
      .at(-1) ?? null;
  const latestIdentityVerification =
    sessionMeeting?.identityVerifications
      .filter((event) => event.status === "verified" && (event.participantRole === "member" || event.participantRole === "signer"))
      .at(-1) ?? null;
  const latestVenueCapture =
    sessionMeeting?.artifacts
      .filter((artifact) => artifact.artifactKind === "venue_capture" && artifact.status === "active")
      .at(-1) ?? null;
  const latestAcknowledgmentDocument = reviewDocuments.filter(isAcknowledgedReviewDocument).at(-1) ?? null;
  const hasAcknowledgment = Boolean(
    latestAcknowledgmentDocument || finalization?.history.some((event) => event.status === "acknowledgment_appended"),
  );
  const isMeetingCompleted = sessionMeeting?.status === "completed";
  const isSessionStarted = Boolean(
    sessionMeeting?.status === "in_progress" || isMeetingCompleted || hasNotaryCheckIn,
  );
  const isSamePlaceConfirmed = Boolean(sessionMeeting?.samePlaceStatus === "passed" || latestPassedProximity);
  const hasVerifiedIdentity = Boolean(latestIdentityVerification);
  const hasVenueCapture = Boolean(latestVenueCapture);
  const hasFinalWatermark = Boolean(
    finalization?.isWatermarked || finalization?.history.some((event) => event.status === "watermark_applied"),
  );
  const hasHashRecorded = Boolean(
    finalization?.isHashRecorded || finalization?.hash || finalization?.history.some((event) => event.status === "hash_recorded"),
  );
  const isAnchored = Boolean(finalization?.isAnchored);
  const isVerificationReady = Boolean(isAnchored && verification?.verifyPath);
  const hasLedgerFailure = Boolean(finalization?.anchorAttempt?.status === "failed" || finalization?.latestStatus === "failed");
  const notaryName = payload?.notary?.displayName?.trim() || "Your Illuminotary";
  const statusLabel = formatStatusLabel(sessionMeeting?.status ?? detail?.status ?? payload?.workflow?.latestStatus ?? null);
  const finalPackageStatusLabel = formatStatusLabel(finalization?.latestStatus ?? (isVerificationReady ? "ready" : "pending"));
  const sessionTimelineSteps = [
    { description: "Your Illuminotary opened the live session.", done: isSessionStarted, label: "Session started" },
    { description: "Your live location has been shared.", done: hasMemberCheckIn, label: "Location shared" },
    { description: "Both live locations are together.", done: isSamePlaceConfirmed, label: "Same-place confirmed" },
    { description: "Your identity has been verified.", done: hasVerifiedIdentity, label: "Identity verified" },
    { description: "The venue details are recorded.", done: hasVenueCapture, label: "Venue recorded" },
    { description: "The notarial acknowledgment is on the document.", done: hasAcknowledgment, label: "Acknowledgment appended" },
    { description: "The in-person session is closed.", done: isMeetingCompleted, label: "Session completed" },
    { description: "The final package is verification-ready.", done: isVerificationReady, label: "Verification ready" },
  ];
  const isInitialLoading = isLoading && !payload;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link className="text-sm text-Color-Neutral transition hover:text-Color-Scheme-1-Text" href="/app/requests">
            Back to requests
          </Link>
          <h1 className="mt-3 text-2xl font-medium text-Color-Scheme-1-Text">In-person session</h1>
          <div className="mt-1 text-sm text-Color-Neutral">
            {notaryName} · {selectedDocumentLabel}
          </div>
        </div>
        <span className="w-fit rounded-full border border-Color-Scheme-1-Border/40 px-3 py-1 text-xs font-medium text-Color-Neutral-Darkest">
          {statusLabel}
        </span>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-4 py-8 text-center text-sm text-Color-Neutral">
          Loading session.
        </div>
      ) : null}

      {!isInitialLoading && payload ? (
        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.52fr)]">
          <section className="space-y-4">
            {selectedDocument?.downloadUrl ? (
              <object
                key={`${selectedDocument.id}:${selectedDocument.downloadUrl}`}
                className={`${previewPanelHeightClass} w-full rounded-[20px] bg-[#f3f6f8] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]`}
                data={selectedDocument.downloadUrl}
                type="application/pdf"
              >
                <div className={`flex ${previewPanelHeightClass} items-center justify-center px-6 text-center text-sm leading-6 text-Color-Neutral`}>
                  <a
                    className="rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest"
                    href={selectedDocument.downloadUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open PDF in a new tab
                  </a>
                </div>
              </object>
            ) : (
              <div className={`flex ${previewPanelHeightClass} items-center justify-center rounded-[20px] bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]`}>
                The document preview will appear here as the session document is prepared.
              </div>
            )}

            {reviewDocuments.length > 1 ? (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {reviewDocuments.map((document, index) => {
                  const isSelected = selectedDocument?.id === document.id;
                  return (
                    <button
                      className={`w-full rounded-md px-3 py-2 text-left text-xs transition sm:w-48 ${
                        isSelected
                          ? "bg-Color-Neutral-Lightest shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
                          : "bg-Color-White shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] hover:bg-Color-Neutral-Lightest"
                      }`}
                      key={document.id}
                      onClick={() => setSelectedDocumentId(document.id)}
                      type="button"
                    >
                      <div className="break-words font-medium text-Color-Scheme-1-Text">
                        {formatCompactReviewDocumentLabel(document, index)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-Color-Neutral">{getReviewDocumentStatusLabel(document)}</div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <div className="space-y-4">
            <SessionTimeline steps={sessionTimelineSteps} />

            {canCheckIn ? (
              <button
                className="w-full rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isCheckingIn}
                onClick={() => void handleMemberCheckIn()}
                type="button"
              >
                {isCheckingIn ? "Checking in" : isInitialMemberCheckIn ? "Share location" : "Refresh location"}
              </button>
            ) : null}

            <section className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="font-medium text-Color-Scheme-1-Text">Final package status</div>
                <div className={hasLedgerFailure ? "font-medium text-red-700" : "text-Color-Neutral"}>{finalPackageStatusLabel}</div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <CompletionStep done={hasFinalWatermark} label="Watermarked" />
                <CompletionStep done={hasHashRecorded} label="Hash recorded" />
                <CompletionStep done={isAnchored} label="Ledger anchored" />
                <CompletionStep done={isVerificationReady} label="Verification ready" />
              </div>
              <div className="mt-3 grid gap-1 break-words">
                <div>Hash: {finalization?.hash ?? "-"}</div>
                <div>Ledger TX: {finalization?.ledgerTxId ?? "-"}</div>
                <div>Anchored: {formatDateTime(finalization?.anchoredAt ?? null)}</div>
                <div>Last checked: {formatDateTime(finalization?.latestStatusAt ?? null)}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {finalPackageDocument?.downloadUrl ? (
                  <a
                    className="inline-flex rounded-lg bg-Color-Scheme-1-Text px-3 py-2 text-xs font-medium text-Color-White hover:brightness-110"
                    download={finalPackageDocument.fileName ?? undefined}
                    href={finalPackageDocument.downloadUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Download package
                  </a>
                ) : null}
              {verification?.verifyPath ? (
                <Link
                    className="inline-flex rounded-lg border border-Color-Scheme-1-Border/40 px-3 py-2 text-xs font-medium text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest"
                  href={verification.verifyPath}
                >
                  Open public verification
                </Link>
              ) : null}
              </div>

              {hasLedgerFailure ? (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                  Final verification is being retried. The document preview will keep updating here.
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
