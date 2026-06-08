"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import ProcessBand from "@/app/app/start/ProcessBand";
import { useAppToast } from "@/components/app/AppToastContext";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";
const NOTARIZE_DOCUMENT_MODE_KEY = "notarize_document";

type SigningExecution = {
  confirmedAt: string | null;
  confirmedBySupabaseId: string | null;
  confirmedByRole: string | null;
  generationRunIds: string[];
  completedOutputSignerIds: string[];
  completedSignatureIds: string[];
};

type ReviewApproval = {
  approvedAt: string | null;
  reviewSource: string | null;
  latestVersionId: string | null;
  latestRenderedRunId: string | null;
  approvedOutputKeys: string[];
  approvedVersionIds: string[];
};

type ReviewOutput = {
  outputKey: string;
  outputLabel: string;
  versionId: string;
  generationRunId: string | null;
  version: number;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  downloadUrl: string;
  isFinal: boolean;
};

type PendingReviewBlocker = {
  code: string;
  source: string | null;
  field: string | null;
  message: string;
  blocking: boolean;
};

type PendingReviewOutput = {
  outputKey: string;
  outputLabel: string;
  status: string;
  errorMessage: string | null;
  versionId: string | null;
  mimeType: string | null;
  blockers?: PendingReviewBlocker[];
};

type SigningGroup = {
  generationRunId: string;
  outputKey: string;
  outputLabel: string;
  signingGroup: string;
  label: string;
  minimumRequired: number;
  capturedCount: number;
  totalCount: number;
  isSatisfied: boolean;
};

type SigningSignature = {
  outputSignerId: string;
  generationRunId: string;
  outputKey: string;
  outputLabel: string;
  documentKey: string;
  partyName: string;
  partyRole: string;
  signingGroup: string | null;
  isRequired: boolean;
  status: "pending" | "captured";
  captureMethod: "upload" | "type" | "draw" | null;
  typedValue: string | null;
  typedKind: "name" | "initials" | null;
  signatureId: string | null;
  storagePath: string | null;
  assetDownloadUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt: string | null;
  groupMinimumRequired: number | null;
  groupSatisfied: boolean;
};

type SigningCompletion = {
  requiredSignatureCount: number;
  capturedRequiredSignatureCount: number;
  allRequiredSignaturesComplete: boolean;
  canConfirm: boolean;
};

type SigningViewerAccess = {
  kind: "owner" | "admin" | "service_role" | "invited_signer";
  inviteId: string | null;
  documentOutputSignerId: string | null;
  documentPartyId: string | null;
};

type SigningPayload = {
  document?: {
    id: string;
    idn: string | null;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    createdAt: string;
    productFlowMode?: string | null;
  };
  signing?: {
    state: "not_ready" | "preparing" | "ready" | "confirmed";
    reviewApproval: ReviewApproval | null;
    signingExecution: SigningExecution | null;
    approvedOutputKeys: string[];
    outputs: ReviewOutput[];
    pendingOutputs: PendingReviewOutput[];
    missingOutputKeys: string[];
    requiresGeneration: boolean;
    allOutputsReady: boolean;
    signatures: SigningSignature[];
    groups: SigningGroup[];
    completion: SigningCompletion;
    viewerAccess?: SigningViewerAccess;
  };
  message?: string;
};

type AvailableNotary = {
  userId: string;
  displayName: string;
  jurisdiction: string;
  serviceAreaKind: string | null;
  serviceAreaName: string | null;
  commissionExpiresAt: string | null;
};

type AvailableNotariesPayload = {
  document?: {
    id: string;
    status: string | null;
    jurisdiction: string | null;
    normalizedJurisdiction: string;
    productFlowMode: string | null;
  };
  notarization?: {
    activeRequestId: string | null;
    activeRequestStatus: string | null;
    assignedNotaryUserId: string | null;
    submittedAt: string | null;
  };
  notaries?: AvailableNotary[];
  message?: string;
};

type SignatureUploadResponse = {
  signature?: {
    id: string;
    documentId: string;
    generationRunId: string | null;
    outputSignerId: string | null;
    storagePath: string | null;
    status: string;
  };
  upload?: {
    bucket: string;
    path: string;
    signedUrl: string;
    token: string;
  };
  message?: string;
};

type SignatureResponse = {
  signature?: {
    id: string;
    status: string;
  };
  remainingSignerInvites?: RemainingSignerInviteDispatchResponse | null;
  message?: string;
};

type SavedSignature = {
  id: string;
  captureMethod: "upload" | "type" | "draw";
  typedValue: string | null;
  typedKind: "name" | "initials" | null;
  assetDownloadUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt: string | null;
  createdAt: string;
};

type SavedSignaturesPayload = {
  savedSignatures?: SavedSignature[];
  message?: string;
};

type InviteDispatchSummary = {
  status: "idle" | "running" | "done" | "partial" | "error";
  message: string | null;
};

type RemainingSignerInviteDispatchResponse = {
  trigger?: {
    shouldQueueInvites?: boolean;
    blockedReason?: string | null;
  };
  invited?: Array<{ documentOutputSignerId: string; recipientEmail: string }>;
  skipped?: Array<{ documentOutputSignerId: string; reason: string }>;
  failures?: Array<{ documentOutputSignerId: string; errorMessage: string }>;
};

type CaptureMode = "upload" | "type" | "draw" | "saved";

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

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString();
};

const formatStatusLabel = (value: string) => {
  switch (value) {
    case "queued":
      return "Queued";
    case "rendering":
      return "Rendering";
    case "rendered":
      return "Rendered";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    case "unsupported_format":
      return "Needs PDF rerender";
    case "not_started":
      return "Waiting to start";
    default:
      return value
        .split("_")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
  }
};

const getStatusTextClasses = (value: string) => {
  if (value === "failed" || value === "blocked" || value === "canceled") {
    return "text-red-700";
  }

  if (value === "unsupported_format") {
    return "text-amber-800";
  }

  if (value === "rendered") {
    return "text-emerald-700";
  }

  return "text-Color-Neutral";
};

const getCaptureStatusLabel = (signature: SigningSignature) => {
  if (signature.status === "captured") {
    return "Captured";
  }

  if (signature.isRequired) {
    return "Required";
  }

  if (signature.signingGroup && signature.groupMinimumRequired) {
    return `Group ${signature.groupMinimumRequired} needed`;
  }

  return "Optional";
};

const formatProductFlowModeLabel = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value === "poa_only") {
    return "POA Only";
  }

  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
    .replace(/\bPoa\b/g, "POA");
};

const normalizePartyName = (value: string | null | undefined) => {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
};

const buildRemainingSignerInviteMessage = (
  remainingSignerInvites: RemainingSignerInviteDispatchResponse,
) => {
  const invitedCount = remainingSignerInvites.invited?.length ?? 0;
  const skippedCount = remainingSignerInvites.skipped?.filter(
    (skipped) => skipped.reason !== "creator_obligation",
  ).length ?? 0;
  const failureCount = remainingSignerInvites.failures?.length ?? 0;
  const fragments: string[] = [];

  if (invitedCount > 0) {
    fragments.push(`${invitedCount} queued`);
  }
  if (skippedCount > 0) {
    fragments.push(`${skippedCount} skipped`);
  }
  if (failureCount > 0) {
    fragments.push(`${failureCount} failed`);
  }

  if (fragments.length === 0) {
    return "Remaining signature requests are already up to date.";
  }

  return `Remaining signature requests: ${fragments.join(", ")}.`;
};

const formatSignatureRequestCount = (count: number) => {
  return `${count} signature request${count === 1 ? "" : "s"}`;
};

const buildRemainingSignerWorkSummary = (hiddenSignatures: SigningSignature[]) => {
  const pendingHiddenSignatures = hiddenSignatures.filter(
    (signature) => signature.status !== "captured",
  );
  const pendingCount = pendingHiddenSignatures.length;

  if (pendingCount === 0) {
    return "The remaining signer workflow is already complete.";
  }

  const signerNames = Array.from(
    new Set(
      pendingHiddenSignatures
        .map((signature) => signature.partyName.trim())
        .filter((name) => name.length > 0),
    ),
  );

  if (signerNames.length === 1) {
    return `Waiting on ${signerNames[0]} to complete ${formatSignatureRequestCount(pendingCount)}.`;
  }

  return `Waiting on ${signerNames.length} signers to complete ${formatSignatureRequestCount(pendingCount)}.`;
};

const getCanvasCoordinates = (
  canvas: HTMLCanvasElement,
  event: ReactPointerEvent<HTMLCanvasElement>,
) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
};

const formatJurisdictionLabel = (value: string | null | undefined) => {
  return value?.trim().toUpperCase() || "Jurisdiction pending";
};

const formatServiceAreaLabel = (notary: AvailableNotary) => {
  const serviceAreaName = notary.serviceAreaName?.trim();
  if (serviceAreaName) {
    return serviceAreaName;
  }

  const serviceAreaKind = notary.serviceAreaKind?.trim();
  return serviceAreaKind ? formatStatusLabel(serviceAreaKind) : null;
};

const NotarySelectControl = ({
  value,
  options,
  isOpen,
  disabled,
  onChange,
  onOpenChange,
}: {
  value: string | null;
  options: AvailableNotary[];
  isOpen: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onOpenChange: (isOpen: boolean) => void;
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const selectedNotary = options.find((notary) => notary.userId === value) ?? null;

  const updatePopoverPosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return;
    }

    const popoverWidth = 360;
    const leftBoundary = 16;
    const rightBoundary = window.innerWidth - popoverWidth - leftBoundary;
    setPopoverPosition({
      left: Math.max(leftBoundary, Math.min(triggerRect.left, rightBoundary)),
      top: triggerRect.bottom + 8,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(updatePopoverPosition);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const portalTarget = typeof document === "undefined" ? null : document.body;
  const selectPopover =
    isOpen && popoverPosition && portalTarget
      ? createPortal(
          <div
            className="fixed z-[1000] max-h-80 w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-2 shadow-[0_20px_48px_rgba(0,0,0,0.14)]"
            style={{ left: popoverPosition.left, top: popoverPosition.top }}
          >
            {options.map((notary) => {
              const isSelected = notary.userId === value;
              const serviceAreaLabel = formatServiceAreaLabel(notary);

              return (
                <button
                  key={notary.userId}
                  type="button"
                  className={`flex w-full items-start justify-between gap-4 rounded-md px-3 py-3 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-Green text-Color-Neutral-Darkest"
                      : "text-Color-Scheme-1-Text hover:bg-Color-White"
                  }`}
                  onClick={() => {
                    onChange(notary.userId);
                    onOpenChange(false);
                    triggerRef.current?.blur();
                  }}
                >
                  <span>
                    <span className="block text-sm font-medium">{notary.displayName}</span>
                    <span className="mt-1 block text-[11px] leading-4 text-Color-Neutral">
                      {formatJurisdictionLabel(notary.jurisdiction)}
                      {serviceAreaLabel ? ` · ${serviceAreaLabel}` : ""}
                    </span>
                  </span>
                  {isSelected ? <span className="text-[11px] font-medium">Selected</span> : null}
                </button>
              );
            })}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <div className="space-y-3 text-xs font-medium text-Color-Neutral-Darkest">
      <span>Notary</span>
      <button
        ref={triggerRef}
        type="button"
        className={`flex min-h-11 w-full items-center justify-between rounded-md border px-3 text-left text-sm outline-none transition-colors ${
          disabled
            ? "cursor-not-allowed border-Color-Scheme-1-Border bg-Color-Neutral-Lightest text-Color-Neutral"
            : "border-Color-Scheme-1-Border/50 bg-Color-White text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text"
        }`}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => {
          if (!isOpen) {
            updatePopoverPosition();
          }
          onOpenChange(!isOpen);
        }}
      >
        <span className={selectedNotary ? undefined : "text-Color-Neutral"}>
          {selectedNotary?.displayName ?? "Choose a notary"}
        </span>
        <span aria-hidden="true" className="ml-3 h-1.5 w-1.5 rotate-45 border-b border-r border-Color-Neutral" />
      </button>
      {selectedNotary ? (
        <div className="text-xs leading-5 text-Color-Neutral">
          {formatJurisdictionLabel(selectedNotary.jurisdiction)}
          {formatServiceAreaLabel(selectedNotary) ? ` · ${formatServiceAreaLabel(selectedNotary)}` : ""}
        </div>
      ) : null}
      {selectPopover}
    </div>
  );
};

export default function SignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const documentId = searchParams.get("documentId")?.trim() ?? "";
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const inkBoundsRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [payload, setPayload] = useState<SigningPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingCapture, setIsSavingCapture] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSkippingSignature, setIsSkippingSignature] = useState(false);
  const [isSubmittingNotarization, setIsSubmittingNotarization] = useState(false);
  const [activeSignerId, setActiveSignerId] = useState<string | null>(null);
  const [activeOutputKey, setActiveOutputKey] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("type");
  const [typedValues, setTypedValues] = useState<Record<string, string>>({});
  const [typedKinds, setTypedKinds] = useState<Record<string, "name" | "initials">>({});
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [isLoadingSavedSignatures, setIsLoadingSavedSignatures] = useState(false);
  const [availableNotariesPayload, setAvailableNotariesPayload] = useState<AvailableNotariesPayload | null>(null);
  const [isLoadingAvailableNotaries, setIsLoadingAvailableNotaries] = useState(false);
  const [availableNotaryError, setAvailableNotaryError] = useState<string | null>(null);
  const [selectedNotaryUserId, setSelectedNotaryUserId] = useState<string | null>(null);
  const [isNotarySelectOpen, setIsNotarySelectOpen] = useState(false);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [selectedSavedSignatureId, setSelectedSavedSignatureId] = useState<string | null>(null);
  const [inviteDispatchSummary, setInviteDispatchSummary] = useState<InviteDispatchSummary>({
    status: "idle",
    message: null,
  });

  const applyRemainingSignerInviteDispatchSummary = useCallback(
    (remainingSignerInvites?: RemainingSignerInviteDispatchResponse | null) => {
      if (!remainingSignerInvites) {
        return;
      }

      const invitedCount = remainingSignerInvites.invited?.length ?? 0;
      const failureCount = remainingSignerInvites.failures?.length ?? 0;
      const skippedCount = remainingSignerInvites.skipped?.filter(
        (skipped) => skipped.reason !== "creator_obligation",
      ).length ?? 0;
      const message = buildRemainingSignerInviteMessage(remainingSignerInvites);
      const status: InviteDispatchSummary["status"] =
        failureCount > 0 ? "error" : skippedCount > 0 ? "partial" : "done";

      setInviteDispatchSummary({ status, message });

      if (invitedCount > 0) {
        showToast({ tone: "success", message });
      } else if (failureCount > 0) {
        showToast({ tone: "warning", message });
      }
    },
    [showToast],
  );

  const fetchSigning = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!accessToken || !documentId) {
        return null;
      }

      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/documents/${documentId}/signing`,
          accessToken,
          {
            cache: "no-store",
          },
        );
        const nextPayload = (await response.json().catch(() => null)) as
          | SigningPayload
          | null;

        if (!response.ok || !nextPayload?.document || !nextPayload.signing) {
          throw new Error(nextPayload?.message ?? "Failed to load signing workspace.");
        }

        setPayload(nextPayload);
        setErrorMessage(null);
        return nextPayload;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load signing workspace.";
        setErrorMessage(message);
        return null;
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [accessToken, documentId],
  );

  useEffect(() => {
    if (!documentId || !accessToken) {
      return;
    }

    setSavedSignatures([]);
    setSelectedSavedSignatureId(null);
    setInviteDispatchSummary({
      status: "idle",
      message: null,
    });

    void fetchSigning();
  }, [accessToken, documentId, fetchSigning]);

  const allSignatures = useMemo(
    () => payload?.signing?.signatures ?? [],
    [payload?.signing?.signatures],
  );
  const primarySelfSignature = useMemo(
    () =>
      allSignatures.find((signature) => signature.partyRole === "principal") ??
      allSignatures.find((signature) => signature.partyRole === "grantor") ??
      allSignatures[0] ??
      null,
    [allSignatures],
  );
  const primarySelfSignerName = useMemo(
    () => normalizePartyName(primarySelfSignature?.partyName),
    [primarySelfSignature?.partyName],
  );
  const visibleSignatures = useMemo(() => {
    if (!primarySelfSignerName) {
      return allSignatures;
    }

    return allSignatures.filter(
      (signature) => normalizePartyName(signature.partyName) === primarySelfSignerName,
    );
  }, [allSignatures, primarySelfSignerName]);
  const hiddenSignatures = useMemo(() => {
    if (!primarySelfSignerName) {
      return [] as SigningSignature[];
    }

    return allSignatures.filter(
      (signature) => normalizePartyName(signature.partyName) !== primarySelfSignerName,
    );
  }, [allSignatures, primarySelfSignerName]);
  const visibleRequiredSignatureCount = visibleSignatures.filter(
    (signature) => signature.isRequired,
  ).length;
  const capturedVisibleRequiredSignatureCount = visibleSignatures.filter(
    (signature) => signature.isRequired && signature.status === "captured",
  ).length;
  const principalSigningComplete =
    visibleRequiredSignatureCount > 0 &&
    capturedVisibleRequiredSignatureCount === visibleRequiredSignatureCount;
  const remainingSignerCount = Array.from(
    new Set(
      hiddenSignatures
        .map((signature) => normalizePartyName(signature.partyName))
        .filter((name) => name.length > 0),
    ),
  ).length;
  const remainingSignerWorkSummary = buildRemainingSignerWorkSummary(hiddenSignatures);
  const selectedProductLabel = formatProductFlowModeLabel(
    payload?.document?.productFlowMode ?? payload?.document?.documentType,
  );
  const signCardBaseClass =
    "w-full rounded-xl border border-Color-Scheme-1-Border px-5 py-5 text-left transition-[opacity,transform,border-color] duration-200 ease-out";
  const signActionButtonBaseClass =
    "inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm font-medium";
  const previewPanelHeightClass = "h-[68vh] min-h-[520px]";

  const fetchSavedSignatures = useCallback(async () => {
    if (!accessToken || !documentId) {
      return [] as SavedSignature[];
    }

    setIsLoadingSavedSignatures(true);

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${documentId}/signatures/saved`,
        accessToken,
        {
          cache: "no-store",
        },
      );
      const responsePayload = (await response.json().catch(() => null)) as
        | SavedSignaturesPayload
        | null;

      if (!response.ok) {
        throw new Error(responsePayload?.message ?? "Failed to load saved signatures.");
      }

      const nextSavedSignatures = responsePayload?.savedSignatures ?? [];
      setSavedSignatures(nextSavedSignatures);
      return nextSavedSignatures;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load saved signatures.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
      return [] as SavedSignature[];
    } finally {
      setIsLoadingSavedSignatures(false);
    }
  }, [accessToken, documentId, showToast]);

  const resetCanvasSurface = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#111111";
    isDrawingRef.current = false;
    hasInkRef.current = false;
    lastPointRef.current = null;
    inkBoundsRef.current = null;
  }, []);

  useEffect(() => {
    if (visibleSignatures.length === 0) {
      setActiveSignerId(null);
      return;
    }

    const preferredSignature =
      visibleSignatures.find((signature) => signature.status !== "captured") ??
      visibleSignatures[0] ??
      null;

    if (
      !activeSignerId ||
      !visibleSignatures.some((signature) => signature.outputSignerId === activeSignerId)
    ) {
      setActiveSignerId(preferredSignature?.outputSignerId ?? null);
      return;
    }

    const currentActiveSignature =
      visibleSignatures.find((signature) => signature.outputSignerId === activeSignerId) ?? null;

    if (
      currentActiveSignature?.status === "captured" &&
      preferredSignature &&
      preferredSignature.outputSignerId !== currentActiveSignature.outputSignerId
    ) {
      setActiveSignerId(preferredSignature.outputSignerId);
    }
  }, [activeSignerId, visibleSignatures]);

  const activeSignature =
    visibleSignatures.find((signature) => signature.outputSignerId === activeSignerId) ??
    visibleSignatures[0] ??
    null;

  useEffect(() => {
    if (!activeSignature) {
      return;
    }

    setActiveOutputKey(activeSignature.outputKey);
    setCaptureMode(activeSignature.captureMethod ?? "type");
  }, [activeSignature]);

  useEffect(() => {
    resetCanvasSurface();
  }, [activeSignature?.outputSignerId, resetCanvasSurface]);

  useEffect(() => {
    if (captureMode !== "saved") {
      return;
    }

    void fetchSavedSignatures();
  }, [activeSignature?.outputSignerId, captureMode, fetchSavedSignatures]);

  useEffect(() => {
    if (captureMode !== "saved") {
      setSelectedSavedSignatureId(null);
    }
  }, [captureMode]);

  useEffect(() => {
    if (
      selectedSavedSignatureId &&
      !savedSignatures.some((savedSignature) => savedSignature.id === selectedSavedSignatureId)
    ) {
      setSelectedSavedSignatureId(null);
    }
  }, [savedSignatures, selectedSavedSignatureId]);

  useEffect(() => {
    if (payload?.signing?.state !== "preparing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchSigning({ silent: true });
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchSigning, payload?.signing?.state]);

  const outputChoices = useMemo(() => {
    const readyOutputs = (payload?.signing?.outputs ?? []).map((output) => ({
      outputKey: output.outputKey,
      outputLabel: output.outputLabel,
      status: "ready",
    }));
    const pendingOutputs = (payload?.signing?.pendingOutputs ?? []).map((output) => ({
      outputKey: output.outputKey,
      outputLabel: output.outputLabel,
      status: output.status,
    }));

    return [...readyOutputs, ...pendingOutputs];
  }, [payload?.signing?.outputs, payload?.signing?.pendingOutputs]);

  const selectedOutput =
    payload?.signing?.outputs.find((output) => output.outputKey === activeOutputKey) ??
    payload?.signing?.outputs[0] ??
    null;
  const selectedPendingOutput =
    payload?.signing?.pendingOutputs.find((output) => output.outputKey === activeOutputKey) ??
    null;
  const activeGroup =
    activeSignature?.signingGroup
      ? payload?.signing?.groups.find(
          (group) =>
            group.signingGroup === activeSignature.signingGroup &&
            group.generationRunId === activeSignature.generationRunId,
        ) ??
        null
      : null;
  const typedValue = activeSignature
    ? (typedValues[activeSignature.outputSignerId] ?? activeSignature.typedValue ?? "")
    : "";
  const typedKind = activeSignature
    ? (typedKinds[activeSignature.outputSignerId] ?? activeSignature.typedKind ?? "name")
    : "name";
  const isInvitedSigner = payload?.signing?.viewerAccess?.kind === "invited_signer";
  const isDocumentNotarization = payload?.document?.productFlowMode === NOTARIZE_DOCUMENT_MODE_KEY;
  const canFinalizeSigningSet =
    !isInvitedSigner &&
    hiddenSignatures.length === 0 &&
    payload?.signing?.state !== "confirmed" &&
    Boolean(payload?.signing?.completion.canConfirm);
  const canContinueWithoutSignature =
    !isInvitedSigner &&
    isDocumentNotarization &&
    payload?.signing?.state !== "confirmed" &&
    payload?.document?.status === "pending_signature";
  const shouldShowNotarySelection =
    !isInvitedSigner &&
    Boolean(payload?.document) &&
    (payload?.document?.status === "pending_notary" || canContinueWithoutSignature);
  const shouldFetchAvailableNotaries = Boolean(accessToken && documentId && shouldShowNotarySelection);
  const availableNotaries = useMemo(
    () => availableNotariesPayload?.notaries ?? [],
    [availableNotariesPayload?.notaries],
  );
  const activeNotarizationRequestId = availableNotariesPayload?.notarization?.activeRequestId ?? null;
  const selectedAvailableNotary = availableNotaries.find(
    (notary) => notary.userId === selectedNotaryUserId,
  ) ?? null;
  const notarizationSubmitBusy = isSubmittingNotarization || isSkippingSignature;
  const canSubmitSelectedNotary = Boolean(
    selectedAvailableNotary &&
      !activeNotarizationRequestId &&
      !isLoadingAvailableNotaries &&
      !notarizationSubmitBusy,
  );
  const shouldShowCaptureContainer =
    Boolean(activeSignature) &&
    activeSignature?.status !== "captured" &&
    payload?.signing?.state !== "confirmed";
  const selectedSavedSignature = savedSignatures.find(
    (savedSignature) => savedSignature.id === selectedSavedSignatureId,
  ) ?? null;

  const fetchAvailableNotaries = useCallback(async () => {
    if (!accessToken || !documentId) {
      return null;
    }

    setIsLoadingAvailableNotaries(true);

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${documentId}/available-notaries`,
        accessToken,
        {
          cache: "no-store",
        },
      );
      const responsePayload = (await response.json().catch(() => null)) as
        | AvailableNotariesPayload
        | null;

      if (!response.ok) {
        throw new Error(responsePayload?.message ?? "Failed to load available notaries.");
      }

      setAvailableNotariesPayload(responsePayload);
      setAvailableNotaryError(null);
      return responsePayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load available notaries.";
      setAvailableNotariesPayload(null);
      setAvailableNotaryError(message);
      return null;
    } finally {
      setIsLoadingAvailableNotaries(false);
    }
  }, [accessToken, documentId]);

  useEffect(() => {
    if (!shouldFetchAvailableNotaries) {
      setAvailableNotariesPayload(null);
      setAvailableNotaryError(null);
      setSelectedNotaryUserId(null);
      setIsNotarySelectOpen(false);
      return;
    }

    void fetchAvailableNotaries();
  }, [fetchAvailableNotaries, shouldFetchAvailableNotaries]);

  useEffect(() => {
    if (!selectedNotaryUserId) {
      return;
    }

    if (!availableNotaries.some((notary) => notary.userId === selectedNotaryUserId)) {
      setSelectedNotaryUserId(null);
    }
  }, [availableNotaries, selectedNotaryUserId]);
  const signingStateLabel = (() => {
    if (payload?.signing?.state === "confirmed") {
      return "Signing is confirmed for this document set.";
    }

    if (payload?.signing?.state === "preparing") {
      return "DARCi is preparing the official signing PDF set.";
    }

    if (isInvitedSigner) {
      return principalSigningComplete
        ? "Your assigned signature is complete."
        : "Complete the signature assigned to you.";
    }

    if (principalSigningComplete) {
      return hiddenSignatures.length > 0
        ? "Your signature is complete. The remaining signers will be handled in the next workflow step."
        : "Your signature is complete and the signing set is ready to confirm.";
    }

    return "Only your signature is captured on this page right now.";
  })();

  const clearCanvas = useCallback(() => {
    resetCanvasSurface();
  }, [resetCanvasSurface]);

  const extendInkBounds = useCallback((point: { x: number; y: number }) => {
    const padding = 6;
    const nextBounds = {
      minX: point.x - padding,
      minY: point.y - padding,
      maxX: point.x + padding,
      maxY: point.y + padding,
    };

    if (!inkBoundsRef.current) {
      inkBoundsRef.current = nextBounds;
      return;
    }

    inkBoundsRef.current = {
      minX: Math.min(inkBoundsRef.current.minX, nextBounds.minX),
      minY: Math.min(inkBoundsRef.current.minY, nextBounds.minY),
      maxX: Math.max(inkBoundsRef.current.maxX, nextBounds.maxX),
      maxY: Math.max(inkBoundsRef.current.maxY, nextBounds.maxY),
    };
  }, []);

  const buildDrawSignatureDataUrl = useCallback((canvas: HTMLCanvasElement) => {
    const inkBounds = inkBoundsRef.current;
    if (!inkBounds) {
      return canvas.toDataURL("image/png");
    }

    const padding = 14;
    const left = Math.max(Math.floor(inkBounds.minX - padding), 0);
    const top = Math.max(Math.floor(inkBounds.minY - padding), 0);
    const right = Math.min(Math.ceil(inkBounds.maxX + padding), canvas.width);
    const bottom = Math.min(Math.ceil(inkBounds.maxY + padding), canvas.height);
    const width = Math.max(right - left, 1);
    const height = Math.max(bottom - top, 1);
    const croppedCanvas = document.createElement("canvas");

    croppedCanvas.width = width;
    croppedCanvas.height = height;

    const croppedContext = croppedCanvas.getContext("2d");
    if (!croppedContext) {
      return canvas.toDataURL("image/png");
    }

    croppedContext.fillStyle = "#ffffff";
    croppedContext.fillRect(0, 0, width, height);
    croppedContext.drawImage(canvas, left, top, width, height, 0, 0, width, height);

    return croppedCanvas.toDataURL("image/png");
  }, []);

  const beginDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const point = getCanvasCoordinates(canvas, event);
    isDrawingRef.current = true;
    hasInkRef.current = true;
    lastPointRef.current = point;
    extendInkBounds(point);
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }, [extendInkBounds]);

  const continueDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const point = getCanvasCoordinates(canvas, event);
    const lastPoint = lastPointRef.current;
    if (!lastPoint) {
      lastPointRef.current = point;
      return;
    }

    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    extendInkBounds(lastPoint);
    extendInkBounds(point);
    lastPointRef.current = point;
  }, [extendInkBounds]);

  const endDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture release races during rapid pointer transitions.
    }
  }, []);

  const refreshAfterCapture = useCallback(async () => {
    await fetchSigning({ silent: true });
  }, [fetchSigning]);

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!accessToken || !documentId || !activeSignature || isSavingCapture) {
        return;
      }

      setIsSavingCapture(true);

      try {
        const requestResponse = await fetchWithTokenRefresh(
          `${apiBaseUrl}/documents/${documentId}/signatures/request`,
          accessToken,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              generationRunId: activeSignature.generationRunId,
              outputSignerId: activeSignature.outputSignerId,
              fileName: file.name,
              fileSize: file.size,
              mimeType: file.type,
            }),
          },
        );
        const requestPayload = (await requestResponse.json().catch(() => null)) as
          | SignatureUploadResponse
          | null;

        if (!requestResponse.ok || !requestPayload?.signature || !requestPayload.upload) {
          throw new Error(requestPayload?.message ?? "Failed to prepare signature upload.");
        }

        const uploadResponse = await fetch(requestPayload.upload.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload signature image.");
        }

        const finalizeResponse = await fetchWithTokenRefresh(
          `${apiBaseUrl}/documents/${documentId}/signatures/finalize`,
          accessToken,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              signatureId: requestPayload.signature.id,
              generationRunId: activeSignature.generationRunId,
              outputSignerId: activeSignature.outputSignerId,
            }),
          },
        );
        const finalizePayload = (await finalizeResponse.json().catch(() => null)) as
          | SignatureResponse
          | null;

        if (!finalizeResponse.ok) {
          throw new Error(finalizePayload?.message ?? "Failed to finalize signature upload.");
        }

        applyRemainingSignerInviteDispatchSummary(finalizePayload?.remainingSignerInvites);
        showToast({ tone: "success", message: "Uploaded signature saved." });
        await refreshAfterCapture();
        void fetchSavedSignatures();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload signature image.";
        setErrorMessage(message);
        showToast({ tone: "error", message });
      } finally {
        setIsDraggingUpload(false);
        setIsSavingCapture(false);
      }
    },
    [
      accessToken,
      activeSignature,
      applyRemainingSignerInviteDispatchSummary,
      documentId,
      fetchSavedSignatures,
      isSavingCapture,
      refreshAfterCapture,
      showToast,
    ],
  );

  const handleTypedSave = useCallback(async () => {
    if (!accessToken || !documentId || !activeSignature || isSavingCapture) {
      return;
    }

    const nextTypedValue = typedValue.trim();
    if (!nextTypedValue) {
      showToast({ tone: "error", message: "Enter the typed signature first." });
      return;
    }

    setIsSavingCapture(true);

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${documentId}/signatures`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            generationRunId: activeSignature.generationRunId,
            outputSignerId: activeSignature.outputSignerId,
            captureMethod: "type",
            typedValue: nextTypedValue,
            typedKind,
          }),
        },
      );
      const responsePayload = (await response.json().catch(() => null)) as SignatureResponse | null;

      if (!response.ok) {
        throw new Error(responsePayload?.message ?? "Failed to save typed signature.");
      }

      applyRemainingSignerInviteDispatchSummary(responsePayload?.remainingSignerInvites);
      showToast({ tone: "success", message: "Typed signature saved." });
      await refreshAfterCapture();
      void fetchSavedSignatures();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save typed signature.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setIsSavingCapture(false);
    }
  }, [
    accessToken,
    activeSignature,
    applyRemainingSignerInviteDispatchSummary,
    documentId,
    fetchSavedSignatures,
    isSavingCapture,
    refreshAfterCapture,
    showToast,
    typedKind,
    typedValue,
  ]);

  const handleDrawSave = useCallback(async () => {
    if (!accessToken || !documentId || !activeSignature || isSavingCapture) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    if (!hasInkRef.current) {
      showToast({ tone: "error", message: "Draw the signature before saving it." });
      return;
    }

    const imageDataUrl = buildDrawSignatureDataUrl(canvas);
    setIsSavingCapture(true);

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${documentId}/signatures`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            generationRunId: activeSignature.generationRunId,
            outputSignerId: activeSignature.outputSignerId,
            captureMethod: "draw",
            imageDataUrl,
          }),
        },
      );
      const responsePayload = (await response.json().catch(() => null)) as SignatureResponse | null;

      if (!response.ok) {
        throw new Error(responsePayload?.message ?? "Failed to save drawn signature.");
      }

      applyRemainingSignerInviteDispatchSummary(responsePayload?.remainingSignerInvites);
      clearCanvas();
      showToast({ tone: "success", message: "Drawn signature saved." });
      await refreshAfterCapture();
      void fetchSavedSignatures();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save drawn signature.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setIsSavingCapture(false);
    }
  }, [
    accessToken,
    activeSignature,
    applyRemainingSignerInviteDispatchSummary,
    buildDrawSignatureDataUrl,
    clearCanvas,
    documentId,
    fetchSavedSignatures,
    isSavingCapture,
    refreshAfterCapture,
    showToast,
  ]);

  const handleUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";

      if (!file) {
        return;
      }

      await handleUploadFile(file);
    },
    [handleUploadFile],
  );

  const handleSavedSignatureApply = useCallback(
    async (savedSignatureId: string) => {
      if (!accessToken || !documentId || !activeSignature || isSavingCapture) {
        return;
      }

      setIsSavingCapture(true);

      try {
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/documents/${documentId}/signatures`,
          accessToken,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              generationRunId: activeSignature.generationRunId,
              outputSignerId: activeSignature.outputSignerId,
              captureMethod: "saved",
              savedSignatureId,
            }),
          },
        );
        const responsePayload = (await response.json().catch(() => null)) as SignatureResponse | null;

        if (!response.ok) {
          throw new Error(responsePayload?.message ?? "Failed to apply saved signature.");
        }

        applyRemainingSignerInviteDispatchSummary(responsePayload?.remainingSignerInvites);
        showToast({ tone: "success", message: "Saved signature applied." });
        await refreshAfterCapture();
        setSelectedSavedSignatureId(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to apply saved signature.";
        setErrorMessage(message);
        showToast({ tone: "error", message });
      } finally {
        setIsSavingCapture(false);
      }
    },
    [
      accessToken,
      activeSignature,
      applyRemainingSignerInviteDispatchSummary,
      documentId,
      isSavingCapture,
      refreshAfterCapture,
      showToast,
    ],
  );

  const handleConfirm = useCallback(async () => {
    if (!accessToken || !documentId || !payload?.signing || isConfirming) {
      return;
    }

    setIsConfirming(true);

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${documentId}/sign`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirmed: true }),
        },
      );
      const responsePayload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(responsePayload?.message ?? "Failed to confirm signatures.");
      }

      showToast({ tone: "success", message: "Signing set confirmed." });
      await refreshAfterCapture();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to confirm signatures.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setIsConfirming(false);
    }
  }, [accessToken, documentId, isConfirming, payload?.signing, refreshAfterCapture, showToast]);

  const handleSubmitToSelectedNotary = useCallback(async (options?: { signatureSkipped?: boolean }) => {
    if (!accessToken || !documentId || notarizationSubmitBusy) {
      return;
    }

    if (!selectedAvailableNotary) {
      showToast({ tone: "error", message: "Choose a notary before sending the document." });
      return;
    }

    if (activeNotarizationRequestId) {
      showToast({ tone: "warning", message: "This document already has a notarization request." });
      return;
    }

    const signatureSkipped = options?.signatureSkipped === true;
    if (signatureSkipped) {
      setIsSkippingSignature(true);
    } else {
      setIsSubmittingNotarization(true);
    }

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${documentId}/submit-notarization`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selectedNotaryUserId: selectedAvailableNotary.userId,
            ...(signatureSkipped
              ? {
                  signatureSkipped: true,
                  signatureSkipReason: "member_selected_no_signature",
                }
              : {}),
          }),
        },
      );
      const responsePayload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(responsePayload?.message ?? "Failed to continue without signature.");
      }

      showToast({
        tone: "success",
        message: "Document sent to selected notary for review.",
      });
      router.push("/app/documents?status=pending_notary");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send document to the selected notary.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setIsSkippingSignature(false);
      setIsSubmittingNotarization(false);
    }
  }, [
    activeNotarizationRequestId,
    accessToken,
    documentId,
    notarizationSubmitBusy,
    router,
    selectedAvailableNotary,
    showToast,
  ]);

  const renderNotarySelectionCard = () => {
    const submitLabel = canContinueWithoutSignature
      ? "Continue without signature"
      : "Send to selected notary";
    const busyLabel = canContinueWithoutSignature ? "Continuing..." : "Sending...";

    if (activeNotarizationRequestId) {
      return (
        <div className={`${signCardBaseClass} border-emerald-200 bg-emerald-50`}>
          <div className="text-sm font-medium text-emerald-800">Sent to notary</div>
          <div className="mt-3 text-sm leading-6 text-emerald-800/90">
            This document already has a notarization request in progress.
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-medium text-Color-Scheme-1-Text">Choose a notary</div>
          {availableNotariesPayload?.document?.normalizedJurisdiction ? (
            <div className="ml-auto inline-flex shrink-0 whitespace-nowrap rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
              {formatJurisdictionLabel(availableNotariesPayload.document.normalizedJurisdiction)}
            </div>
          ) : null}
        </div>
        <div className="mt-2 text-sm text-Color-Neutral">
              {canContinueWithoutSignature
                ? "Select a notary to review this uploaded document without applying a member signature."
                : "Select a notary in the document jurisdiction to review the confirmed document."}
        </div>

        {(isLoadingAvailableNotaries || !availableNotariesPayload) && !availableNotaryError ? (
          <div className="mt-5 rounded-xl bg-Color-Neutral-Lightest px-4 py-4 text-sm text-Color-Neutral">
            Loading available notaries...
          </div>
        ) : availableNotaryError ? (
          <div className="mt-5 space-y-3 rounded-xl border border-red-200 px-4 py-4 text-sm text-red-700">
            <div>{availableNotaryError}</div>
            <button
              type="button"
              className="inline-flex min-h-9 items-center justify-center border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
              onClick={() => {
                void fetchAvailableNotaries();
              }}
            >
              Retry
            </button>
          </div>
        ) : availableNotaries.length === 0 ? (
          <div className="mt-5 rounded-xl bg-Color-Neutral-Lightest px-4 py-4 text-sm leading-6 text-Color-Neutral">
            No active notaries are available for this document jurisdiction yet.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <NotarySelectControl
              value={selectedNotaryUserId}
              options={availableNotaries}
              isOpen={isNotarySelectOpen}
              disabled={notarizationSubmitBusy}
              onChange={setSelectedNotaryUserId}
              onOpenChange={setIsNotarySelectOpen}
            />
            <button
              type="button"
              className={`inline-flex min-h-11 w-full items-center justify-center px-4 py-2 text-sm font-medium transition ${
                canSubmitSelectedNotary
                  ? "platform-btn-primary"
                  : "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
              }`}
              disabled={!canSubmitSelectedNotary}
              onClick={() => {
                void handleSubmitToSelectedNotary({
                  signatureSkipped: canContinueWithoutSignature,
                });
              }}
            >
              {notarizationSubmitBusy ? busyLabel : submitLabel}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderPreviewPanel = () => {
    if (isLoading && !payload) {
      return (
        <div className={`flex ${previewPanelHeightClass} items-center justify-center bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral`}>
          Loading the signing set...
        </div>
      );
    }

    if (selectedOutput) {
      return (
        <object
          className={`${previewPanelHeightClass} w-full bg-[#f3f6f8]`}
          data={selectedOutput.downloadUrl}
          type="application/pdf"
        >
          <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-Color-Neutral">
            Open the PDF in a new tab if your browser does not render inline previews here.
          </div>
        </object>
      );
    }

    if (selectedPendingOutput) {
      return (
        <div className={`flex ${previewPanelHeightClass} flex-col items-center justify-center bg-[#f7f9fb] px-6 text-center`}>
          <span
            className="block h-8 w-8 rounded-full border-2 border-slate-300 border-t-Color-Scheme-1-Text"
            style={{ animation: "darciSpinnerSpin 900ms linear infinite" }}
          />
          <p className="mt-4 text-sm font-medium text-Color-Scheme-1-Text">
            {selectedPendingOutput.outputLabel} is {formatStatusLabel(selectedPendingOutput.status).toLowerCase()}.
          </p>
          {selectedPendingOutput.errorMessage ? (
            <p className="mt-2 max-w-xl text-sm leading-6 text-Color-Neutral">
              {selectedPendingOutput.errorMessage}
            </p>
          ) : null}
        </div>
      );
    }

    return (
      <div className={`flex ${previewPanelHeightClass} items-center justify-center bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral`}>
        Official signing PDFs will appear here once DARCi finishes preparing them.
      </div>
    );
  };

  if (!documentId) {
    return (
      <div className="space-y-4">
        <div className="text-2xl font-medium">Sign documents</div>
        <div className="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-700">
          A document id is required to open signing.
        </div>
        <button
          className="inline-flex min-h-10 items-center justify-center border border-Color-Scheme-1-Border px-4 py-2 text-sm font-medium text-Color-Scheme-1-Text"
          onClick={() => {
            router.push("/app/documents");
          }}
          type="button"
        >
          Back to documents
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 pb-2">
        <div className="text-2xl font-medium">Sign documents</div>
        <div className="text-sm text-Color-Neutral">{signingStateLabel}</div>
      </div>

      <div className="space-y-6">
        <div
          className="flex flex-wrap items-center gap-2"
          style={{ animation: "darciContentFadeIn 220ms ease-out both" }}
        >
          <div className="text-xs font-regular text-Color-Neutral">Selected product:</div>
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-black px-3 py-1.5">
            <div className="text-xs font-medium text-white">
              {selectedProductLabel ?? "Selected product"}
            </div>
          </div>
        </div>

        <div aria-hidden className="h-px w-full" />
        <div
          className="sticky top-[-4rem] z-[500]"
          data-process-band-sticky-host
          style={{ animation: "darciContentFadeIn 220ms ease-out both", animationDelay: "60ms" }}
        >
          <ProcessBand currentStep={3} />
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div
          className="relative z-0 grid gap-6 lg:grid-cols-[1fr_2fr]"
          style={{ animation: "darciContentFadeIn 220ms ease-out both", animationDelay: "120ms" }}
        >
          <div
            className="relative z-0 space-y-6 overflow-visible lg:sticky lg:max-h-[calc(100vh-var(--darci-process-band-follow-offset,5rem)-1.5rem)] lg:self-start lg:overflow-y-auto lg:pr-2"
            style={{ top: "var(--darci-process-band-follow-offset, 5rem)" }}
          >
            <div className="space-y-2 pb-2">
              <div className="text-2xl font-medium">Sign documents</div>
              <div className="text-sm text-Color-Neutral">
                {isInvitedSigner
                  ? "Complete the signature assigned to your invitation."
                  : hiddenSignatures.length > 0
                  ? "Complete your own signature step first. The remaining signers will follow separately."
                  : "Complete your signature on the prepared document set."}
              </div>
            </div>

            <div className="space-y-3">
              {visibleSignatures.map((signature) => {
                const isActive = signature.outputSignerId === activeSignature?.outputSignerId;

                return (
                  <button
                    key={signature.outputSignerId}
                    className={`${signCardBaseClass} ${
                      isActive
                        ? "border-Color-Scheme-1-Text"
                        : "bg-white hover:border-Color-Scheme-1-Text"
                    }`}
                    onClick={() => {
                      setActiveSignerId(signature.outputSignerId);
                      setActiveOutputKey(signature.outputKey);
                    }}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-Color-Scheme-1-Text">
                          {signature.outputLabel}
                        </div>
                        <div className="mt-1 text-xs tracking-[0.02em] text-Color-Neutral">
                          {signature.partyName} · {signature.partyRole.replace(/_/g, " ")}
                        </div>
                      </div>
                      <div className={`text-xs ${signature.status === "captured" ? "text-emerald-700" : "text-Color-Neutral"}`}>
                        {getCaptureStatusLabel(signature)}
                      </div>
                    </div>
                    {signature.signingGroup && signature.groupMinimumRequired ? (
                      <div className="mt-2 text-xs leading-5 text-Color-Neutral">
                        {signature.groupSatisfied
                          ? "Group requirement satisfied."
                          : `${signature.groupMinimumRequired} signature${signature.groupMinimumRequired > 1 ? "s" : ""} still needed in ${signature.signingGroup.replace(/_/g, " ")}.`}
                      </div>
                    ) : null}
                    {signature.capturedAt ? (
                      <div className="mt-2 text-xs text-emerald-700">
                        Captured {formatDateLabel(signature.capturedAt) ?? "just now"}
                      </div>
                    ) : null}
                  </button>
                );
              })}

              {visibleSignatures.length === 0 ? (
                <div className={`${signCardBaseClass} cursor-default`}>
                  <div className="text-sm font-medium text-Color-Scheme-1-Text">
                    No signature is available in this step yet.
                  </div>
                  <div className="mt-2 text-sm leading-6 text-Color-Neutral">
                    DARCi has prepared the signing PDFs, but there is no member-facing signature obligation available to capture here.
                  </div>
                </div>
              ) : null}
            </div>

            {shouldShowCaptureContainer ? (
              <div className={signCardBaseClass}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-Color-Scheme-1-Text">
                      Signature capture
                    </div>
                    <div className="mt-1 text-sm text-Color-Neutral">
                      {activeSignature.partyName} · {activeSignature.outputLabel}
                    </div>
                  </div>
                  <div className={`text-xs ${activeSignature.status === "captured" ? "text-emerald-700" : "text-Color-Neutral"}`}>
                    {activeSignature.status === "captured" ? "Ready" : "Pending"}
                  </div>
                </div>

                {activeGroup ? (
                  <div className="mt-4 rounded-xl bg-Color-Neutral-Lightest px-4 py-3 text-xs leading-5 text-Color-Neutral">
                    {activeGroup.label}: {activeGroup.capturedCount} of {activeGroup.minimumRequired} captured.
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  {(["upload", "type", "draw", "saved"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition ${
                        captureMode === mode
                          ? "bg-black text-white"
                          : "border border-Color-Scheme-1-Border text-Color-Neutral"
                      }`}
                      onClick={() => {
                        setCaptureMode(mode);
                        if (mode === "saved") {
                          void fetchSavedSignatures();
                        }
                      }}
                      type="button"
                    >
                      {mode === "upload"
                        ? "Upload"
                        : mode === "type"
                          ? "Type"
                          : mode === "draw"
                            ? "Draw"
                            : "My saved signatures"}
                    </button>
                  ))}
                </div>

                {captureMode === "upload" ? (
                  <div className="mt-5 space-y-4">
                    <div className="text-sm leading-6 text-Color-Neutral">
                      Drag and drop a PNG or JPG image here, or choose one manually.
                    </div>
                    <input
                      ref={fileInputRef}
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleUploadChange}
                      type="file"
                    />
                    <div
                      className={`rounded-[18px] border-2 border-dashed px-5 py-6 transition ${
                        isDraggingUpload
                          ? "border-Color-Scheme-1-Text bg-Color-Neutral-Lightest"
                          : "border-Color-Scheme-1-Border bg-white"
                      }`}
                      onDragEnter={(event: ReactDragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        if (!isSavingCapture) {
                          setIsDraggingUpload(true);
                        }
                      }}
                      onDragLeave={(event: ReactDragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        if (event.currentTarget === event.target) {
                          setIsDraggingUpload(false);
                        }
                      }}
                      onDragOver={(event: ReactDragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        if (!isSavingCapture) {
                          setIsDraggingUpload(true);
                        }
                      }}
                      onDrop={(event: ReactDragEvent<HTMLDivElement>) => {
                        event.preventDefault();
                        const file = event.dataTransfer.files?.[0] ?? null;
                        if (!file) {
                          setIsDraggingUpload(false);
                          return;
                        }

                        void handleUploadFile(file);
                      }}
                    >
                      <div className="text-sm font-medium text-Color-Scheme-1-Text">
                        {isSavingCapture ? "Uploading signature..." : "Drop your signature image here"}
                      </div>
                      <div className="mt-2 text-sm leading-6 text-Color-Neutral">
                        PNG and JPG files are supported.
                      </div>
                      <button
                        className={`mt-4 ${signActionButtonBaseClass} ${
                          isSavingCapture ? "cursor-wait border border-Color-Scheme-1-Border text-Color-Neutral" : "platform-btn-primary"
                        }`}
                        disabled={isSavingCapture || payload?.signing?.state === "confirmed"}
                        onClick={(event) => {
                          event.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        type="button"
                      >
                        {isSavingCapture ? "Uploading..." : "Choose signature image"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {captureMode === "type" ? (
                  <div className="mt-5 space-y-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
                      <input
                        className="min-h-11 rounded-xl border border-Color-Scheme-1-Border px-3 py-2 text-sm text-Color-Scheme-1-Text outline-none transition focus:border-Color-Scheme-1-Text"
                        onChange={(event) => {
                          setTypedValues((current) => ({
                            ...current,
                            [activeSignature.outputSignerId]: event.target.value,
                          }));
                        }}
                        placeholder="Enter the signature text"
                        value={typedValue}
                      />
                      <select
                        className="min-h-11 rounded-xl border border-Color-Scheme-1-Border bg-white px-3 py-2 text-sm text-Color-Scheme-1-Text outline-none transition focus:border-Color-Scheme-1-Text"
                        onChange={(event) => {
                          const nextKind = event.target.value === "initials" ? "initials" : "name";
                          setTypedKinds((current) => ({
                            ...current,
                            [activeSignature.outputSignerId]: nextKind,
                          }));
                        }}
                        value={typedKind}
                      >
                        <option value="name">Name</option>
                        <option value="initials">Initials</option>
                      </select>
                    </div>
                    <div className="rounded-[18px] border border-dashed border-Color-Scheme-1-Border bg-Color-Neutral-Lightest px-5 py-6">
                      <div className="text-xs uppercase tracking-[0.08em] text-Color-Neutral">Preview</div>
                      <div className="mt-4 min-h-12 text-3xl italic text-Color-Scheme-1-Text" style={{ fontFamily: '"Times New Roman", serif' }}>
                        {typedValue || "Signature preview"}
                      </div>
                    </div>
                    <button
                      className={`${signActionButtonBaseClass} ${
                        isSavingCapture ? "cursor-wait border border-Color-Scheme-1-Border text-Color-Neutral" : "platform-btn-primary"
                      }`}
                      disabled={isSavingCapture || payload?.signing?.state === "confirmed"}
                      onClick={() => {
                        void handleTypedSave();
                      }}
                      type="button"
                    >
                      {isSavingCapture ? "Saving..." : "Save typed signature"}
                    </button>
                  </div>
                ) : null}

                {captureMode === "draw" ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-[18px] border border-Color-Scheme-1-Border bg-white p-3">
                      <canvas
                        ref={canvasRef}
                        className="h-[220px] w-full touch-none rounded-xl bg-white"
                        height={220}
                        onPointerCancel={endDraw}
                        onPointerDown={beginDraw}
                        onPointerLeave={endDraw}
                        onPointerMove={continueDraw}
                        onPointerUp={endDraw}
                        width={640}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={`${signActionButtonBaseClass} border border-Color-Scheme-1-Border text-Color-Scheme-1-Text`}
                        onClick={clearCanvas}
                        type="button"
                      >
                        Clear
                      </button>
                      <button
                        className={`${signActionButtonBaseClass} ${
                          isSavingCapture ? "cursor-wait border border-Color-Scheme-1-Border text-Color-Neutral" : "platform-btn-primary"
                        }`}
                        disabled={isSavingCapture || payload?.signing?.state === "confirmed"}
                        onClick={() => {
                          void handleDrawSave();
                        }}
                        type="button"
                      >
                        {isSavingCapture ? "Saving..." : "Save drawn signature"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {captureMode === "saved" ? (
                  <div className="mt-5 space-y-4">
                    <div className="text-sm leading-6 text-Color-Neutral">
                      Reuse any signature you already saved in a previous signing step.
                    </div>

                    {isLoadingSavedSignatures ? (
                      <div className="rounded-[18px] border border-Color-Scheme-1-Border bg-Color-Neutral-Lightest px-5 py-6 text-sm text-Color-Neutral">
                        Loading saved signatures...
                      </div>
                    ) : savedSignatures.length > 0 ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          {savedSignatures.map((savedSignature) => (
                            <button
                              key={savedSignature.id}
                              className={`rounded-[18px] border px-4 py-4 text-left transition ${
                                selectedSavedSignatureId === savedSignature.id
                                  ? "border-Color-Scheme-1-Text bg-Color-Neutral-Lightest"
                                  : "border-Color-Scheme-1-Border bg-white hover:border-Color-Scheme-1-Text"
                              }`}
                              disabled={isSavingCapture || payload?.signing?.state === "confirmed"}
                              onClick={() => {
                                setSelectedSavedSignatureId(savedSignature.id);
                              }}
                              type="button"
                            >
                              <div className="text-[11px] leading-4 text-Color-Neutral">
                                {savedSignature.captureMethod === "type" ? "Typed signature" : "Saved signature image"}
                              </div>
                              {savedSignature.captureMethod === "type" ? (
                                <div className="mt-3 min-h-12 text-2xl italic text-Color-Scheme-1-Text" style={{ fontFamily: '"Times New Roman", serif' }}>
                                  {savedSignature.typedValue}
                                </div>
                              ) : savedSignature.assetDownloadUrl ? (
                                <img
                                  alt="Saved signature"
                                  className="mt-3 h-24 w-full rounded-lg border border-Color-Scheme-1-Border bg-white object-contain p-2"
                                  src={savedSignature.assetDownloadUrl}
                                />
                              ) : (
                                <div className="mt-3 rounded-lg border border-Color-Scheme-1-Border bg-Color-Neutral-Lightest px-3 py-4 text-sm text-Color-Neutral">
                                  Saved signature preview unavailable.
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                        <div className="flex justify-end">
                          <button
                            className={`${signActionButtonBaseClass} ${
                              selectedSavedSignature && !isSavingCapture
                                ? "platform-btn-primary"
                                : "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                            }`}
                            disabled={
                              !selectedSavedSignature ||
                              isSavingCapture ||
                              payload?.signing?.state === "confirmed"
                            }
                            onClick={() => {
                              if (!selectedSavedSignature) {
                                return;
                              }

                              void handleSavedSignatureApply(selectedSavedSignature.id);
                            }}
                            type="button"
                          >
                            {isSavingCapture ? "Using signature..." : "Use this signature"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-[18px] border border-Color-Scheme-1-Border bg-Color-Neutral-Lightest px-5 py-6 text-sm leading-6 text-Color-Neutral">
                        No saved signatures are available yet. Save a typed, drawn, or uploaded signature once and it will appear here.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {shouldShowNotarySelection ? (
              renderNotarySelectionCard()
            ) : isInvitedSigner && principalSigningComplete ? (
              <div className={`${signCardBaseClass} border-emerald-200 bg-emerald-50`}>
                <div className="text-sm font-medium text-emerald-800">
                  Signature saved
                </div>
                <div className="mt-3 text-sm leading-6 text-emerald-800/90">
                  Your assigned signature has been saved on this document.
                </div>
              </div>
            ) : payload?.signing?.state === "confirmed" || (principalSigningComplete && hiddenSignatures.length > 0) ? (
              <div className={`${signCardBaseClass} border-emerald-200 bg-emerald-50`}>
                <div className="text-sm font-medium text-emerald-800">
                  {payload?.signing?.state === "confirmed"
                    ? "Signing confirmed"
                    : "Your signature is complete"}
                </div>
                <div className="mt-3 text-sm leading-6 text-emerald-800/90">
                  {payload?.signing?.state === "confirmed"
                    ? "The prepared signing set is fully confirmed."
                    : hiddenSignatures.length > 0
                      ? remainingSignerWorkSummary
                      : "Your signature has been saved on this prepared signing set."}
                </div>
                {principalSigningComplete && hiddenSignatures.length > 0 && inviteDispatchSummary.message ? (
                  <div className="mt-3 text-sm leading-6 text-emerald-800/90">
                    {inviteDispatchSummary.message}
                  </div>
                ) : null}
              </div>
            ) : hiddenSignatures.length > 0 ? (
              <div className={signCardBaseClass}>
                <div className="text-sm font-medium text-Color-Scheme-1-Text">Next after your signature</div>
                <div className="mt-3 text-sm leading-6 text-Color-Neutral">
                  Complete your own signature first. The remaining signer workflow stays out of view on this page for now.
                </div>
              </div>
            ) : isInvitedSigner ? null : (
              <div className={signCardBaseClass}>
                <div className="text-sm font-medium text-Color-Scheme-1-Text">Confirm signing set</div>
                <div className="mt-3 text-sm leading-6 text-Color-Neutral">
                  Confirm unlocks once every signature required in this member step is complete.
                </div>
                <button
                  className={`mt-5 inline-flex min-h-11 w-full items-center justify-center px-4 py-2 text-sm font-medium transition ${
                    canFinalizeSigningSet && !isConfirming
                      ? "platform-btn-primary"
                      : "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                  }`}
                  disabled={!canFinalizeSigningSet || isConfirming}
                  onClick={() => {
                    void handleConfirm();
                  }}
                  type="button"
                >
                  {isConfirming ? "Confirming..." : "Confirm signatures"}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div id="contract-container" className="relative z-0 bg-white p-12 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-Color-Scheme-1-Text">
                    Official signing PDFs
                  </div>
                  <div className="mt-1 text-sm text-Color-Neutral">
                    Review the official PDFs that will carry these signatures.
                  </div>
                </div>
                <div className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                  {payload?.document?.idn ?? "Pending IDN"}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {outputChoices.map((output) => (
                  <button
                    key={`${output.outputKey}-${output.status}`}
                    className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition ${
                      output.outputKey === activeOutputKey
                        ? "bg-black text-white"
                        : "border border-Color-Scheme-1-Border text-Color-Scheme-1-Text"
                    }`}
                    onClick={() => {
                      setActiveOutputKey(output.outputKey);
                    }}
                    type="button"
                  >
                    {output.outputLabel}
                    {output.status !== "ready" ? ` • ${formatStatusLabel(output.status)}` : ""}
                  </button>
                ))}
              </div>

              <div className="mt-6">{renderPreviewPanel()}</div>

              {selectedPendingOutput?.blockers?.length ? (
                <div className="mt-5 space-y-2">
                  {selectedPendingOutput.blockers
                    .filter((blocker) => blocker.blocking)
                    .map((blocker) => (
                      <div
                        key={`${selectedPendingOutput.outputKey}-${blocker.code}-${blocker.message}`}
                        className="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-700"
                      >
                        {blocker.message}
                      </div>
                    ))}
                </div>
              ) : null}

              {(payload?.signing?.pendingOutputs ?? []).length > 0 ? (
                <div className="mt-5 rounded-xl border border-Color-Scheme-1-Border bg-Color-Neutral-Lightest px-4 py-4">
                  <div className="text-sm font-medium text-Color-Scheme-1-Text">Signing output status</div>
                  <div className="mt-3 space-y-3">
                    {payload?.signing?.pendingOutputs.map((output) => (
                      <div key={output.outputKey} className="flex items-start justify-between gap-4 text-sm">
                        <div>
                          <div className="font-medium text-Color-Scheme-1-Text">{output.outputLabel}</div>
                          {output.errorMessage ? (
                            <div className="mt-1 text-xs leading-5 text-Color-Neutral">
                              {output.errorMessage}
                            </div>
                          ) : null}
                        </div>
                        <div className={`text-xs ${getStatusTextClasses(output.status)}`}>
                          {formatStatusLabel(output.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {remainingSignerCount > 0 ? (
                <div className="mt-5 text-sm leading-6 text-Color-Neutral">
                  {remainingSignerWorkSummary}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}