"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useStoredAuth } from "@/lib/auth";
import {
  addFeatureBreadcrumb,
  captureDomainException,
  getResponseRequestId,
} from "@/lib/clientTelemetry";
import {
  fetchWithTokenRefresh,
  formatStatusLabel,
  notaryApiBaseUrl,
  readApiErrorMessage,
  type EvidenceGeolocationSample,
  type NotaryRequestContext,
} from "@/lib/notaryWorkspace";
import {
  defaultIdentityDocumentType,
  getIdentityDocumentOption,
  identityDocumentOptions,
  parseEvidenceArtifactIds,
  validateIdentityDocumentForm,
  type IdentityDocumentType,
} from "../identityDocument";

type ReviewDecision = "approved" | "changes_requested" | "rejected";
type VisibleReviewDecision = Extract<ReviewDecision, "approved">;

type ContextResponse = {
  context: NotaryRequestContext | null;
};

type ClaimByIdnResponse = {
  context?: NotaryRequestContext | null;
};

type BrowserGeolocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitudeMeters?: number;
  sampleKind: "device_gps";
};

type NotaryProfileSummary = {
  jurisdiction: string | null;
  serviceAreaKind: string | null;
  serviceAreaName: string | null;
  commissionNumber: string | null;
  commissionExpiresAt: string | null;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  updatedAt: string;
};

const visibleDecisions: VisibleReviewDecision[] = ["approved"];

const decisionLabels: Record<ReviewDecision, string> = {
  approved: "Approve",
  changes_requested: "Request corrections",
  rejected: "Reject",
};

const decisionHelp: Record<ReviewDecision, string> = {
  approved: "DARCi will share contact details with both parties for the in-person session.",
  changes_requested: "Send the package back for member-side corrections.",
  rejected: "Stop this notary request from moving forward.",
};

const resolveWorkspaceStatus = (context: NotaryRequestContext) => {
  return context.request.queueStatus ?? context.workflow?.latestStatus ?? context.workflow?.status ?? context.request.status;
};

const isUnopenedReviewStatus = (status: string | null | undefined) => {
  return status === "pending" || status === "submitted" || status === "code_delivered";
};

const previewPanelHeightClass = "h-[72vh] min-h-[560px]";

const getCurrentGeolocationSample = async (): Promise<BrowserGeolocationSample | null> => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
          altitudeMeters:
            typeof position.coords.altitude === "number" && Number.isFinite(position.coords.altitude)
              ? position.coords.altitude
              : undefined,
          sampleKind: "device_gps",
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  });
};

const formatDocumentLabel = (label: string, index: number) => {
  return label.trim() || `Document ${index + 1}`;
};

const formatProductLabel = (documentType: string | null | undefined) => {
  const label = formatStatusLabel(documentType);
  return label === "Not set" ? "Document" : label;
};

const jurisdictionToVenueState = (jurisdiction: string | null | undefined) => {
  const trimmed = jurisdiction?.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("US-") ? trimmed.slice(3) : trimmed;
};

const samePlaceFreshnessWindowSeconds = 15 * 60;
const lowAccuracyWarningMeters = 50;

const formatMeters = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Pending";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} km`;
  }

  return `${Math.round(value)} m`;
};

const formatAge = (capturedAt: string | null | undefined) => {
  if (!capturedAt) {
    return "Pending";
  }

  const capturedAtMs = new Date(capturedAt).getTime();
  if (!Number.isFinite(capturedAtMs)) {
    return "Unknown";
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - capturedAtMs) / 1000));
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }

  return `${Math.round(ageSeconds / 60)}m ago`;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const getLatestSampleForRole = (
  context: NotaryRequestContext | null,
  participantRole: "member" | "notary",
) => {
  const participantId = context?.meeting?.participants.find(
    (participant) => participant.participantRole === participantRole,
  )?.id;
  if (!participantId) {
    return null;
  }

  return context.evidence.geolocationSamples.find(
    (sample) => sample.meetingParticipantId === participantId,
  ) ?? null;
};

const getLatestProximityEvaluation = (context: NotaryRequestContext | null) => {
  return context?.evidence.proximityEvaluations.at(-1) ?? null;
};

const getSampleAgeSeconds = (sample: EvidenceGeolocationSample | null) => {
  if (!sample) {
    return null;
  }

  const capturedAtMs = new Date(sample.capturedAt).getTime();
  if (!Number.isFinite(capturedAtMs)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - capturedAtMs) / 1000));
};

const getSampleWarning = (sample: EvidenceGeolocationSample | null) => {
  if (!sample) {
    return "Missing";
  }

  const ageSeconds = getSampleAgeSeconds(sample);
  if (ageSeconds === null || ageSeconds > samePlaceFreshnessWindowSeconds) {
    return "Stale";
  }

  if (typeof sample.accuracyMeters === "number" && sample.accuracyMeters > lowAccuracyWarningMeters) {
    return "Low accuracy";
  }

  return "Ready";
};

const isSampleFreshEnoughForEvaluation = (sample: EvidenceGeolocationSample | null) => {
  const ageSeconds = getSampleAgeSeconds(sample);
  return ageSeconds !== null && ageSeconds <= samePlaceFreshnessWindowSeconds;
};

function EvidenceSampleCard({ label, sample }: { label: string; sample: EvidenceGeolocationSample | null }) {
  const warning = getSampleWarning(sample);
  const isReady = warning === "Ready";

  return (
    <div className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-Color-Scheme-1-Text">{label}</div>
        <div className={isReady ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>{warning}</div>
      </div>
      <div className="mt-2 grid gap-1">
        <div>Captured: {sample ? formatAge(sample.capturedAt) : "Pending"}</div>
        <div>Accuracy: {formatMeters(sample?.accuracyMeters)}</div>
        <div>Stage: {formatStatusLabel(sample?.captureStage)}</div>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CompletionStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-Color-White px-3 py-2 text-xs shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
      <span className="text-Color-Neutral-Darkest">{label}</span>
      <span className={done ? "font-medium text-emerald-700" : "text-Color-Neutral"}>{done ? "Done" : "Pending"}</span>
    </div>
  );
}

function ActionButton({
  active,
  children,
  disabled,
  loadingLabel,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  loadingLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full rounded-lg bg-Color-White px-4 py-3 text-left text-sm font-medium text-Color-Scheme-1-Text shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)] transition hover:bg-Color-Neutral-Lightest disabled:cursor-not-allowed disabled:opacity-55"
      disabled={disabled || active}
      onClick={onClick}
      type="button"
    >
      {active ? loadingLabel : children}
    </button>
  );
}

export default function NotaryRequestWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requestId = typeof params?.id === "string" ? params.id : "";
  const { accessToken } = useStoredAuth();
  const [context, setContext] = useState<NotaryRequestContext | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>("approved");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [identitySubjectName, setIdentitySubjectName] = useState("");
  const [identityDocumentType, setIdentityDocumentType] = useState<IdentityDocumentType>(defaultIdentityDocumentType);
  const [identityIssuingJurisdiction, setIdentityIssuingJurisdiction] = useState("");
  const [identityDocumentExpirationDate, setIdentityDocumentExpirationDate] = useState("");
  const [identityDocumentNumberTail, setIdentityDocumentNumberTail] = useState("");
  const [identityMaskedIdentifier, setIdentityMaskedIdentifier] = useState("");
  const [identityEvidenceArtifactIds, setIdentityEvidenceArtifactIds] = useState("");
  const [venueState, setVenueState] = useState("");
  const [venueCounty, setVenueCounty] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueAddressLine1, setVenueAddressLine1] = useState("");
  const [venueLocationLabel, setVenueLocationLabel] = useState("");
  const [notarialNotes, setNotarialNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notaryProfile, setNotaryProfile] = useState<NotaryProfileSummary | null>(null);

  const loadNotaryProfile = useCallback(async () => {
    if (!accessToken) {
      setNotaryProfile(null);
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/notary-profile`, accessToken, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to load notary profile."));
      }

      const payload = (await response.json()) as { profile: NotaryProfileSummary | null };
      setNotaryProfile(payload.profile ?? null);
    } catch {
      setNotaryProfile(null);
    }
  }, [accessToken]);

  const loadContext = useCallback(async () => {
    if (!accessToken || !requestId) {
      setContext(null);
      return;
    }

    setIsLoading(true);
    let requestIdHeader: string | null = null;
    addFeatureBreadcrumb({
      feature: "notary_workspace",
      action: "context.fetch_started",
      data: { requestId },
    });

    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(requestId)}/context`,
        accessToken,
        { cache: "no-store" },
      );
      requestIdHeader = getResponseRequestId(response);

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to load notary request."));
      }

      const payload = (await response.json()) as ContextResponse;
      let nextContext = payload.context;

      if (nextContext && isUnopenedReviewStatus(resolveWorkspaceStatus(nextContext)) && nextContext.document.idn) {
        const claimResponse = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/notary/idn/resolve`, accessToken, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idn: nextContext.document.idn }),
        });
        requestIdHeader = getResponseRequestId(claimResponse) ?? requestIdHeader;

        if (!claimResponse.ok) {
          throw new Error(await readApiErrorMessage(claimResponse, "Unable to open this review request."));
        }

        const claimPayload = (await claimResponse.json()) as ClaimByIdnResponse;
        nextContext = claimPayload.context ?? nextContext;
      }

      setContext(nextContext);
      setSelectedDocumentId((current) => {
        if (current && nextContext?.document.reviewDocuments.some((document) => document.id === current)) {
          return current;
        }

        return nextContext?.document.reviewDocuments[0]?.id ?? null;
      });
      setErrorMessage(null);
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "context.fetch_completed",
        data: {
          requestId,
          requestIdHeader,
          queueStatus: nextContext ? resolveWorkspaceStatus(nextContext) : null,
          reviewDocumentCount: nextContext?.document.reviewDocuments.length ?? 0,
        },
      });
    } catch (error) {
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "context.fetch_failed",
        level: "error",
        data: { requestId, requestIdHeader },
      });
      captureDomainException(error, {
        level: "error",
        operation: "notary_workspace.fetch_context",
        errorCode: "WEB_NOTARY_CONTEXT_FETCH_FAILED",
        errorFamily: "notarization",
        requestId: requestIdHeader,
        tags: {
          feature: "notary_workspace",
          notary_request_id: requestId,
        },
        contexts: {
          notary_workspace: {
            requestId,
            stage: "fetch_context",
          },
        },
      });
      setErrorMessage(error instanceof Error ? error.message : "Unable to load notary request.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, requestId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    void loadNotaryProfile();
  }, [loadNotaryProfile]);

  useEffect(() => {
    setVenueState((current) => current.trim() || jurisdictionToVenueState(notaryProfile?.jurisdiction));
  }, [notaryProfile?.jurisdiction]);

  const submitDecision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !context) {
      setErrorMessage("Sign in again to record a review decision.");
      return;
    }

    const body: {
      decision: ReviewDecision;
      summary?: string;
      decisionNotes?: string;
    } = { decision };
    if (summary.trim()) {
      body.summary = summary.trim();
      body.decisionNotes = summary.trim();
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    let requestIdHeader: string | null = null;
    addFeatureBreadcrumb({
      feature: "notary_workspace",
      action: "review_decision.started",
      data: { requestId: context.request.id, decision },
    });

    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(context.request.id)}/review-decision`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      requestIdHeader = getResponseRequestId(response);

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to record review decision."));
      }

      setSuccessMessage("Review approved. Contact details were sent to both parties.");
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "review_decision.completed",
        data: { requestId: context.request.id, requestIdHeader, decision },
      });
      router.push("/app/notary");
    } catch (error) {
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "review_decision.failed",
        level: "error",
        data: { requestId: context.request.id, requestIdHeader, decision },
      });
      captureDomainException(error, {
        level: "error",
        operation: "notary_workspace.review_decision",
        errorCode: "WEB_NOTARY_REVIEW_DECISION_FAILED",
        errorFamily: "notarization",
        requestId: requestIdHeader,
        tags: {
          feature: "notary_workspace",
          notary_request_id: context.request.id,
        },
        contexts: {
          notary_workspace: {
            requestId: context.request.id,
            decision,
          },
        },
      });
      setErrorMessage(error instanceof Error ? error.message : "Unable to record review decision.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startInPersonSession = async () => {
    if (!accessToken || !context) {
      setErrorMessage("Sign in again to start the in-person session.");
      return;
    }

    setIsStartingSession(true);
    setErrorMessage(null);
    let requestIdHeader: string | null = null;
    addFeatureBreadcrumb({
      feature: "notary_workspace",
      action: "meeting.start_started",
      data: { requestId: context.request.id },
    });

    try {
      const geolocation = await getCurrentGeolocationSample();
      if (!geolocation) {
        throw new Error("Location permission is needed to start the in-person session.");
      }

      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(context.request.id)}/meeting/start`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ geolocation }),
        },
      );
      requestIdHeader = getResponseRequestId(response);

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to start the in-person session."));
      }

      setSuccessMessage("In-person session started.");
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "meeting.start_completed",
        data: { requestId: context.request.id, requestIdHeader },
      });
      await loadContext();
    } catch (error) {
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "meeting.start_failed",
        level: "error",
        data: { requestId: context.request.id, requestIdHeader },
      });
      captureDomainException(error, {
        level: "error",
        operation: "notary_workspace.start_meeting",
        errorCode: "WEB_NOTARY_MEETING_START_FAILED",
        errorFamily: "notarization",
        requestId: requestIdHeader,
        tags: {
          feature: "notary_workspace",
          notary_request_id: context.request.id,
        },
      });
      setErrorMessage(error instanceof Error ? error.message : "Unable to start the in-person session.");
    } finally {
      setIsStartingSession(false);
    }
  };

  const postRequestAction = async (
    actionKey: string,
    path: string,
    body: Record<string, unknown>,
    fallbackMessage: string,
    success: string,
  ) => {
    if (!accessToken || !context) {
      setErrorMessage("Sign in again to continue this notary request.");
      return;
    }

    setActiveAction(actionKey);
    setErrorMessage(null);
    setSuccessMessage(null);
    let requestIdHeader: string | null = null;
    addFeatureBreadcrumb({
      feature: "notary_workspace",
      action: `${actionKey}.started`,
      data: { requestId: context.request.id, path },
    });

    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(context.request.id)}${path}`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      requestIdHeader = getResponseRequestId(response);

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, fallbackMessage));
      }

      setSuccessMessage(success);
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: `${actionKey}.completed`,
        data: { requestId: context.request.id, requestIdHeader, path },
      });
      await loadContext();
    } catch (error) {
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: `${actionKey}.failed`,
        level: "error",
        data: { requestId: context.request.id, requestIdHeader, path },
      });
      captureDomainException(error, {
        level: "error",
        operation: `notary_workspace.${actionKey}`,
        errorCode: "WEB_NOTARY_ACTION_FAILED",
        errorFamily: "notarization",
        requestId: requestIdHeader,
        tags: {
          feature: "notary_workspace",
          notary_request_id: context.request.id,
          notary_action: actionKey,
        },
        contexts: {
          notary_workspace: {
            requestId: context.request.id,
            actionKey,
            path,
          },
        },
      });
      setErrorMessage(error instanceof Error ? error.message : fallbackMessage);
      if (actionKey === "submit") {
        await loadContext();
      }
    } finally {
      setActiveAction(null);
    }
  };

  const recordProximity = async () => {
    await postRequestAction(
      "proximity",
      "/meeting/proximity-evaluation",
      {
        thresholdMeters: 100,
        evaluatedAt: new Date().toISOString(),
        notes: "Same-place evaluation recorded from in-person session samples.",
      },
      "Unable to evaluate same-place evidence.",
      "Same-place evidence recorded.",
    );
  };

  const refreshNotaryLocationSample = async () => {
    const geolocation = await getCurrentGeolocationSample();
    if (!geolocation) {
      setErrorMessage("Location permission is needed to refresh illuminotary location.");
      return;
    }

    await postRequestAction(
      "refresh-notary-location",
      "/meeting/check-in",
      {
        participantRole: "notary",
        checkinKind: "proximity",
        recordedAt: new Date().toISOString(),
        notes: "Illuminotary proximity location refreshed from the notary workspace.",
        geolocation: {
          ...geolocation,
          captureStage: "proximity_validation",
        },
      },
      "Unable to refresh illuminotary location.",
      "Illuminotary location refreshed.",
    );
  };

  const recordIdentity = async () => {
    const identityValidation = validateIdentityDocumentForm({
      documentType: identityDocumentType,
      issuingJurisdiction: identityIssuingJurisdiction,
      documentExpirationDate: identityDocumentExpirationDate,
      documentNumberTail: identityDocumentNumberTail,
      maskedIdentifier: identityMaskedIdentifier,
    });
    if (!identityValidation.isValid) {
      setErrorMessage(identityValidation.firstError ?? "Complete identity verification details.");
      return;
    }

    const subjectName = identitySubjectName.trim() || context?.owner?.displayName || undefined;
    const evidenceArtifactIds = parseEvidenceArtifactIds(identityEvidenceArtifactIds);
    await postRequestAction(
      "identity",
      "/meeting/identity-verification",
      {
        participantRole: "member",
        verificationMethod: "in_person_document",
        status: "verified",
        verifiedAt: new Date().toISOString(),
        subjectName,
        documentType: identityDocumentType,
        issuingJurisdiction: identityIssuingJurisdiction.trim(),
        documentExpirationDate: identityDocumentExpirationDate.trim(),
        ...(identityDocumentNumberTail.trim()
          ? { documentNumberTail: identityDocumentNumberTail.trim() }
          : {}),
        ...(identityMaskedIdentifier.trim()
          ? { maskedIdentifier: identityMaskedIdentifier.trim() }
          : {}),
        ...(evidenceArtifactIds.length ? { evidenceArtifactIds } : {}),
      },
      "Unable to record identity verification.",
      "Identity verification recorded.",
    );
  };

  const recordMeetingNote = async () => {
    await postRequestAction(
      "artifact-note",
      "/meeting/artifacts",
      {
        participantRole: "notary",
        artifactKind: "meeting_note",
        capturedAt: new Date().toISOString(),
        notes: notarialNotes.trim() || "Notarial session note recorded.",
      },
      "Unable to record meeting note.",
      "Meeting note recorded.",
    );
  };

  const signAcknowledgment = async () => {
    const completedAt = new Date().toISOString();
    const resolvedNotarialFields = {
      documentIdn: context?.document.idn ?? null,
      memberName: context?.owner?.displayName ?? null,
      meetingId: context?.meeting?.meetingId ?? null,
      venueState: venueState.trim(),
      venueCounty: venueCounty.trim(),
      venueCity: venueCity.trim() || null,
      venueAddressLine1: venueAddressLine1.trim() || null,
      venueLocationLabel: venueLocationLabel.trim() || null,
      venueCompletedAt: completedAt,
      notaryName: context?.notary?.displayName ?? null,
      notaryJurisdiction: notaryProfile?.jurisdiction ?? null,
      notaryServiceAreaKind: notaryProfile?.serviceAreaKind ?? null,
      notaryServiceAreaName: notaryProfile?.serviceAreaName ?? null,
      notaryCommissionNumber: notaryProfile?.commissionNumber ?? null,
      notaryCommissionExpiresAt: notaryProfile?.commissionExpiresAt ?? null,
      notaryProfileUpdatedAt: notaryProfile?.updatedAt ?? null,
      hasNotarySignature: Boolean(notaryProfile?.signatureDataUrl),
      hasNotarySeal: Boolean(notaryProfile?.sealDataUrl),
    };

    const resolvedSealLabel = notaryProfile?.jurisdiction?.trim()
      ? `${notaryProfile.jurisdiction.trim()} notary seal`
      : "DARCi illuminotary seal";
    const resolvedSignatureLabel = context?.notary?.displayName?.trim() || "Illuminotary signature";

    await postRequestAction(
      "sign",
      "/sign",
      {
        venue: {
          state: venueState.trim(),
          county: venueCounty.trim(),
          city: venueCity.trim() || undefined,
          addressLine1: venueAddressLine1.trim() || undefined,
          locationLabel: venueLocationLabel.trim() || undefined,
          completedAt,
        },
        acknowledgment: {
          signerAppeared: true,
          signerAcknowledged: true,
        },
        notarialFields: resolvedNotarialFields,
        sealLabel: resolvedSealLabel,
        signatureLabel: resolvedSignatureLabel,
        notes: notarialNotes.trim() || undefined,
      },
      "Unable to sign the notarial acknowledgment.",
      "Notarial acknowledgment appended. Final preview is now ready.",
    );
  };

  const completeMeeting = async () => {
    await postRequestAction(
      "complete-meeting",
      "/meeting/check-in",
      {
        participantRole: "notary",
        checkinKind: "meeting_end",
        recordedAt: new Date().toISOString(),
        notes: "In-person session completed by illuminotary.",
      },
      "Unable to complete the in-person session.",
      "In-person session completed.",
    );
  };

  const submitFinalPackage = async () => {
    await postRequestAction(
      "submit",
      "/submit",
      {
        notes: notarialNotes.trim() || undefined,
      },
      "Unable to submit the final notarized package.",
      "Final notarized package submitted.",
    );
  };

  const selectedDocument =
    context?.document.reviewDocuments.find((document) => document.id === selectedDocumentId) ??
    context?.document.reviewDocuments[0] ??
    null;
  const isSessionInProgress = context?.meeting?.status === "in_progress";
  const isMeetingCompleted = context?.meeting?.status === "completed";
  const hasMemberCheckin = Boolean(context?.evidence.checkins.some((checkin) => checkin.participantRole === "member"));
  const hasSessionStart = Boolean(
    context?.evidence.checkins.some(
      (checkin) => checkin.participantRole === "notary" && checkin.checkinKind === "meeting_start",
    ),
  );
  const hasVerifiedIdentity = Boolean(context?.evidence.identityVerifications.some((event) => event.status === "verified"));
  const hasPassedProximity = Boolean(
    context?.meeting?.samePlaceStatus === "passed" ||
      context?.evidence.proximityEvaluations.some((event) => event.status === "passed"),
  );
  const memberSample = getLatestSampleForRole(context, "member");
  const notarySample = getLatestSampleForRole(context, "notary");
  const latestProximityEvaluation = getLatestProximityEvaluation(context);
  const hasFreshMemberSample = isSampleFreshEnoughForEvaluation(memberSample);
  const hasFreshNotarySample = isSampleFreshEnoughForEvaluation(notarySample);
  const hasAcknowledgment = Boolean(
    context?.finalization.history.some((event) => event.status === "acknowledgment_appended"),
  );
  const hasFinalWatermark = Boolean(
    context?.finalization.isWatermarked || context?.finalization.history.some((event) => event.status === "watermark_applied"),
  );
  const hasHashRecorded = Boolean(
    context?.finalization.isHashRecorded || context?.finalization.hash || context?.finalization.history.some((event) => event.status === "hash_recorded"),
  );
  const isAnchored = Boolean(context?.finalization.isAnchored);
  const hasLedgerFailure = Boolean(
    context?.finalization.anchorAttempt?.status === "failed" || context?.finalization.latestStatus === "failed",
  );
  const isVerificationReady = Boolean(
    context?.capabilities.canOpenVerification || (context?.finalization.publicVerifyPath && isAnchored),
  );
  const recentFinalizationHistory = context?.finalization.history.slice(-4).reverse() ?? [];
  const hasRunningAction = activeAction !== null;
  const canStartSession = Boolean(context?.capabilities.canManageMeeting && !isSessionInProgress && !isMeetingCompleted);
  const hasProfileJurisdiction = Boolean(notaryProfile?.jurisdiction?.trim());
  const hasProfileServiceArea = Boolean(notaryProfile?.serviceAreaName?.trim());
  const hasProfileCommissionNumber = Boolean(notaryProfile?.commissionNumber?.trim());
  const hasProfileCommissionExpiration = Boolean(notaryProfile?.commissionExpiresAt?.trim());
  const hasProfileSignature = Boolean(notaryProfile?.signatureDataUrl);
  const hasProfileSeal = Boolean(notaryProfile?.sealDataUrl);
  const hasNotaryProfileReadyForCompletion =
    hasProfileJurisdiction &&
    hasProfileServiceArea &&
    hasProfileCommissionNumber &&
    hasProfileCommissionExpiration &&
    hasProfileSignature &&
    hasProfileSeal;
  const hasAcknowledgmentVenue = Boolean(venueState.trim() && venueCounty.trim());
  const samePlaceDisabledReason = !hasSessionStart
    ? "Start the in-person session before evaluating same-place evidence."
    : !hasMemberCheckin
      ? "Member check-in is required before evaluating same-place evidence."
      : !hasFreshMemberSample
        ? "Member location needs a fresh member-device check-in from the member request page."
        : !hasFreshNotarySample
          ? "Refresh illuminotary location before evaluating same-place evidence."
          : null;
  const canUnlockFinalPreview = Boolean(
    context?.meeting &&
      (context.meeting.status === "in_progress" || context.meeting.status === "completed") &&
      hasPassedProximity &&
      hasVerifiedIdentity,
  );
  const finalPreviewDocument =
    context?.document.reviewDocuments.find((document) => document.isFinal) ?? selectedDocument;
  const identityDocumentOption = getIdentityDocumentOption(identityDocumentType);
  const identityValidation = validateIdentityDocumentForm({
    documentType: identityDocumentType,
    issuingJurisdiction: identityIssuingJurisdiction,
    documentExpirationDate: identityDocumentExpirationDate,
    documentNumberTail: identityDocumentNumberTail,
    maskedIdentifier: identityMaskedIdentifier,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Link className="inline-flex items-center gap-1 text-sm font-medium text-Color-Neutral transition hover:text-Color-Scheme-1-Text" href="/app/notary">
            <ChevronLeftIcon />
            <span>Back to queue</span>
          </Link>
          <div className="text-2xl font-medium">Document review</div>
        </div>
        {context ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-Color-Neutral-Darkest">
            <span className="rounded-full bg-Color-Neutral-Lightest px-3 py-1 font-medium text-Color-Scheme-1-Text">
              {formatProductLabel(context.document.documentType)}
            </span>
            <span className="rounded-full bg-Color-Neutral-Lightest px-3 py-1 font-medium">
              {context.document.idn ?? "IDN pending"}
            </span>
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {successMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMessage}</div>
      ) : null}

      {!context ? (
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-4 py-8 text-sm text-Color-Neutral">
          {isLoading ? "Loading request context." : "No request context loaded."}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.52fr)]">
          <section className="space-y-4">
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-Color-Scheme-1-Text">Documents</div>
                <div className="mt-1 text-xs text-Color-Neutral">
                  {context.owner?.displayName ?? context.owner?.email ?? "Member pending"}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {context.document.reviewDocuments.length ? (
                  context.document.reviewDocuments.map((document, index) => {
                    const isSelected = selectedDocument?.id === document.id;
                    return (
                      <button
                        className={`w-full rounded-lg px-4 py-3 text-left transition ${
                          isSelected
                            ? "bg-Color-Neutral-Lightest shadow-[inset_0_0_0_1px_rgba(0,0,0,0.16)]"
                            : "bg-Color-White shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] hover:bg-Color-Neutral-Lightest"
                        }`}
                        key={document.id}
                        onClick={() => setSelectedDocumentId(document.id)}
                        type="button"
                      >
                        <div className="font-display text-sm font-medium text-Color-Scheme-1-Text">
                          {formatDocumentLabel(document.label, index)}
                        </div>
                        <div className="mt-2 text-xs text-emerald-700">Ready</div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-lg bg-Color-Neutral-Lightest px-4 py-5 text-sm leading-6 text-Color-Neutral">
                    This request is missing its generated PDF package and cannot be reviewed. Ask the member to regenerate the document and send it to the notary again.
                  </div>
                )}
              </div>
            </div>

            {selectedDocument?.downloadUrl ? (
              <object
                className={`${previewPanelHeightClass} w-full rounded-[20px] bg-[#f3f6f8] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]`}
                data={selectedDocument.downloadUrl}
                type="application/pdf"
              >
                <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-Color-Neutral">
                  Open the PDF in a new tab if your browser does not render inline previews here.
                </div>
              </object>
            ) : (
              <div className={`flex ${previewPanelHeightClass} items-center justify-center rounded-[20px] bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]`}>
                Select a document to preview it here.
              </div>
            )}
          </section>

          {context.capabilities.canReviewRequest ? (
          <section className="rounded-lg bg-Color-Neutral-Lightest p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
            <div className="text-sm font-medium text-Color-Scheme-1-Text">Review decision</div>
            <form className="mt-4 space-y-4" onSubmit={submitDecision}>
              <div className="grid gap-2">
                {visibleDecisions.map((value) => {
                  const isSelected = decision === value;
                  return (
                    <button
                      className={`rounded-lg px-4 py-3 text-left transition ${
                        isSelected
                          ? "bg-Color-White shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                          : "bg-Color-Neutral-Lightest shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] hover:bg-Color-White"
                      }`}
                      key={value}
                      onClick={() => setDecision(value)}
                      type="button"
                    >
                      <div className="text-sm font-medium text-Color-Scheme-1-Text">{decisionLabels[value]}</div>
                      <div className="mt-1 text-xs leading-5 text-Color-Neutral">{decisionHelp[value]}</div>
                    </button>
                  );
                })}
              </div>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Decision summary</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg bg-Color-White px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)] transition focus:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.32)]"
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="Optional note to include in the approval email"
                  value={summary}
                />
              </label>

              <button
                className="w-full rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Recording" : decisionLabels[decision]}
              </button>
            </form>
          </section>
          ) : (
          <section className="rounded-lg bg-Color-Neutral-Lightest p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
            <div className="text-sm font-medium text-Color-Scheme-1-Text">In-person session</div>
            <div className="mt-3 text-sm leading-6 text-Color-Neutral">
              Capture the live meeting evidence, append the notarial acknowledgment, then submit the final package.
            </div>

            <div className="mt-4 grid gap-2">
              <CompletionStep done={hasSessionStart} label="Session started" />
              <CompletionStep done={hasMemberCheckin} label="Member checked in" />
              <CompletionStep done={hasPassedProximity} label="Same-place evidence" />
              <CompletionStep done={hasVerifiedIdentity} label="Identity verified" />
              <CompletionStep done={hasAcknowledgmentVenue} label="Venue captured" />
              <CompletionStep done={hasAcknowledgment} label="Acknowledgment sealed" />
              <CompletionStep done={isMeetingCompleted} label="Session completed" />
              <CompletionStep done={isAnchored} label="Final package anchored" />
            </div>

            <div className="mt-4 rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
              <div className="font-medium text-Color-Scheme-1-Text">Notary profile data for completion</div>
              <div className="mt-1">Jurisdiction: {notaryProfile?.jurisdiction?.trim() || "Missing"}</div>
              <div>Service area: {notaryProfile?.serviceAreaName?.trim() || "Missing"}</div>
              <div>Commission number: {notaryProfile?.commissionNumber?.trim() || "Missing"}</div>
              <div>Commission expires: {notaryProfile?.commissionExpiresAt?.trim() || "Missing"}</div>
              <div>Signature: {hasProfileSignature ? "Configured" : "Missing"}</div>
              <div>Seal: {hasProfileSeal ? "Configured" : "Missing"}</div>
              {!hasNotaryProfileReadyForCompletion ? (
                <div className="mt-2 text-amber-700">
                  Update missing profile fields in /app/settings before appending the acknowledgment.
                </div>
              ) : null}
            </div>

            {!isSessionInProgress && !isMeetingCompleted ? (
              <>
                <button
                  className="mt-5 w-full rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isStartingSession || !canStartSession}
                  onClick={() => void startInPersonSession()}
                  type="button"
                >
                  {isStartingSession ? "Starting" : "Start in-person session"}
                </button>
                {!canStartSession ? (
                  <div className="mt-3 text-xs leading-5 text-Color-Neutral">
                    The in-person session can start after approval contact exchange is ready.
                  </div>
                ) : null}
              </>
            ) : null}

            {context.meeting ? (
              <div className="mt-4 rounded-lg bg-Color-White px-3 py-2 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                Status: {formatStatusLabel(context.meeting.status)} · Same place: {formatStatusLabel(context.meeting.samePlaceStatus)}
              </div>
            ) : null}

            {isSessionInProgress ? (
              <div className="mt-5 space-y-4">
                <div className="space-y-3 rounded-lg bg-Color-Neutral-Lightest p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-Color-Neutral">
                    <span>Same-place evidence</span>
                    <span>{formatStatusLabel(context.meeting?.samePlaceStatus)}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <EvidenceSampleCard label="Member sample" sample={memberSample} />
                    <EvidenceSampleCard label="Illuminotary sample" sample={notarySample} />
                  </div>
                  {latestProximityEvaluation ? (
                    <div className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                      <div className="font-medium text-Color-Scheme-1-Text">Latest evaluation</div>
                      <div className="mt-1">Distance: {formatMeters(latestProximityEvaluation.observedDistanceMeters)}</div>
                      <div>Threshold: {formatMeters(latestProximityEvaluation.thresholdMeters)}</div>
                      <div>Status: {formatStatusLabel(latestProximityEvaluation.status)}</div>
                    </div>
                  ) : null}
                  {samePlaceDisabledReason ? (
                    <div className="text-xs leading-5 text-amber-700">
                      {samePlaceDisabledReason}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <ActionButton
                    active={activeAction === "refresh-notary-location"}
                    disabled={hasRunningAction}
                    loadingLabel="Refreshing"
                    onClick={() => void refreshNotaryLocationSample()}
                  >
                    Refresh illuminotary location
                  </ActionButton>
                  <ActionButton
                    active={activeAction === "proximity"}
                    disabled={hasRunningAction || !hasMemberCheckin || !hasSessionStart || !hasFreshMemberSample || !hasFreshNotarySample}
                    loadingLabel="Evaluating"
                    onClick={() => void recordProximity()}
                  >
                    Evaluate same-place evidence
                  </ActionButton>
                </div>

                <div className="space-y-3 rounded-lg bg-Color-White p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  <div className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Identity</div>
                  <input
                    className="w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                    onChange={(event) => setIdentitySubjectName(event.target.value)}
                    placeholder={context.owner?.displayName ?? "Member name"}
                    value={identitySubjectName}
                  />
                  <select
                    className="w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                    onChange={(event) => setIdentityDocumentType(event.target.value as IdentityDocumentType)}
                    value={identityDocumentType}
                  >
                    {identityDocumentOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => setIdentityIssuingJurisdiction(event.target.value)}
                      placeholder={identityDocumentOption.jurisdictionLabel}
                      value={identityIssuingJurisdiction}
                    />
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => setIdentityDocumentExpirationDate(event.target.value)}
                      placeholder="Expiration date"
                      type="date"
                      value={identityDocumentExpirationDate}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      maxLength={4}
                      onChange={(event) => setIdentityDocumentNumberTail(event.target.value)}
                      placeholder={identityDocumentOption.identifierLabel}
                      value={identityDocumentNumberTail}
                    />
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => setIdentityMaskedIdentifier(event.target.value)}
                      placeholder="Masked identifier"
                      value={identityMaskedIdentifier}
                    />
                  </div>
                  <textarea
                    className="min-h-16 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                    onChange={(event) => setIdentityEvidenceArtifactIds(event.target.value)}
                    placeholder="Evidence artifact IDs"
                    value={identityEvidenceArtifactIds}
                  />
                  {!identityValidation.isValid ? (
                    <div className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                      {identityValidation.firstError}
                    </div>
                  ) : null}
                  <ActionButton
                    active={activeAction === "identity"}
                    disabled={hasRunningAction || !identityValidation.isValid}
                    loadingLabel="Recording identity"
                    onClick={() => void recordIdentity()}
                  >
                    Record verified identity
                  </ActionButton>
                </div>

                <div className="space-y-3 rounded-lg bg-Color-White p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  <div className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Acknowledgment venue</div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => setVenueState(event.target.value)}
                      placeholder="State"
                      value={venueState}
                    />
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => setVenueCounty(event.target.value)}
                      placeholder="County"
                      value={venueCounty}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => setVenueCity(event.target.value)}
                      placeholder="City"
                      value={venueCity}
                    />
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => setVenueAddressLine1(event.target.value)}
                      placeholder="Address or place"
                      value={venueAddressLine1}
                    />
                  </div>
                  <input
                    className="w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                    onChange={(event) => setVenueLocationLabel(event.target.value)}
                    placeholder="Location label"
                    value={venueLocationLabel}
                  />
                  {!hasAcknowledgmentVenue ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      State and county are required before sealing the acknowledgment.
                    </div>
                  ) : null}
                </div>

                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Notarial notes</span>
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-lg bg-Color-White px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)] transition focus:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.32)]"
                    onChange={(event) => setNotarialNotes(event.target.value)}
                    placeholder="Optional note for seal preview and final submission"
                    value={notarialNotes}
                  />
                </label>

                <div className="grid gap-2">
                  <ActionButton
                    active={activeAction === "artifact-note"}
                    disabled={hasRunningAction}
                    loadingLabel="Recording note"
                    onClick={() => void recordMeetingNote()}
                  >
                    Record meeting note
                  </ActionButton>
                  <ActionButton
                    active={activeAction === "sign"}
                    disabled={
                      hasRunningAction ||
                      !hasVerifiedIdentity ||
                      !hasPassedProximity ||
                      hasAcknowledgment ||
                      !hasNotaryProfileReadyForCompletion ||
                      !hasAcknowledgmentVenue
                    }
                    loadingLabel="Appending acknowledgment"
                    onClick={() => void signAcknowledgment()}
                  >
                    Seal acknowledgment
                  </ActionButton>
                  <ActionButton
                    active={activeAction === "complete-meeting"}
                    disabled={hasRunningAction || !hasAcknowledgment}
                    loadingLabel="Completing meeting"
                    onClick={() => void completeMeeting()}
                  >
                    Complete in-person session
                  </ActionButton>
                </div>
              </div>
            ) : null}

            <div className="mt-5 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Final preview</div>
              {canUnlockFinalPreview && finalPreviewDocument?.downloadUrl ? (
                <object
                  className="h-[22rem] w-full rounded-xl bg-[#f3f6f8] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
                  data={finalPreviewDocument.downloadUrl}
                  type="application/pdf"
                >
                  <div className="flex h-full items-center justify-center px-4 text-center text-xs leading-5 text-Color-Neutral">
                    Open the final preview in a new tab if your browser does not render this PDF inline.
                  </div>
                </object>
              ) : (
                <div className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  Final preview unlocks only after the in-person meeting starts and same-place plus identity checks pass.
                </div>
              )}
            </div>

            {isMeetingCompleted || hasAcknowledgment || isAnchored ? (
              <div className="mt-5 space-y-3">
                <ActionButton
                  active={activeAction === "submit"}
                  disabled={
                    hasRunningAction ||
                    !isMeetingCompleted ||
                    !hasAcknowledgment ||
                    !hasVerifiedIdentity ||
                    !hasPassedProximity ||
                    isAnchored ||
                    !context.capabilities.canFinalizeDocument
                  }
                  loadingLabel="Submitting final package"
                  onClick={() => void submitFinalPackage()}
                >
                  Submit final notarized package
                </ActionButton>
                {isAnchored ? (
                  <div className="text-xs leading-5 text-emerald-700">
                    Final package is anchored. Verification is ready for the member record.
                  </div>
                ) : null}
                {context?.finalization ? (
                  <div className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-medium text-Color-Scheme-1-Text">Final package status</div>
                      <div className={hasLedgerFailure ? "font-medium text-red-700" : "text-Color-Neutral"}>
                        {formatStatusLabel(context.finalization.latestStatus)}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <CompletionStep done={hasFinalWatermark} label="Watermarked" />
                      <CompletionStep done={hasHashRecorded} label="Hash recorded" />
                      <CompletionStep done={isAnchored} label="Ledger anchored" />
                      <CompletionStep done={isVerificationReady} label="Verification ready" />
                    </div>
                    <div className="mt-3 grid gap-1 break-words">
                      <div>Hash: {context.finalization.hash ?? "-"}</div>
                      <div>Ledger TX: {context.finalization.ledgerTxId ?? "-"}</div>
                      <div>Anchored: {formatDateTime(context.finalization.anchoredAt)}</div>
                      <div>Last checked: {formatDateTime(context.finalization.lastCheckedAt)}</div>
                    </div>
                    {context.finalization.publicVerifyPath ? (
                      <Link
                        className="mt-3 inline-flex rounded-lg border border-Color-Scheme-1-Border/40 px-3 py-2 text-xs font-medium text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest"
                        href={context.finalization.publicVerifyPath}
                      >
                        Open public verification
                      </Link>
                    ) : null}
                    {hasLedgerFailure ? (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                        Ledger anchoring failed{context.finalization.anchorAttempt?.errorMessage ? `: ${context.finalization.anchorAttempt.errorMessage}` : "."} Retry final package submission after the ledger provider is available.
                      </div>
                    ) : null}
                    {recentFinalizationHistory.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {recentFinalizationHistory.map((event) => (
                          <div key={event.id} className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2">
                            {formatStatusLabel(event.status)} · {formatDateTime(event.createdAt)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
          )}
        </div>
      )}
    </div>
  );
}