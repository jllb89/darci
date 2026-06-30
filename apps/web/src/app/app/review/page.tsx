"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProcessBand from "@/app/app/start/ProcessBand";
import type { DocumentIntakeDraftResponsePayload } from "@/app/app/start/startPageTypes";
import { useAppToast } from "@/components/app/AppToastContext";
import {
  addFeatureBreadcrumb,
  captureAppMessage,
  captureDomainException,
  getResponseRequestId,
} from "@/lib/clientTelemetry";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

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

type ReviewPayload = {
  document?: {
    id: string;
    idn: string | null;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    createdAt: string;
    productFlowMode?: string | null;
  };
  review?: {
    state: "approved" | "ready" | "generating" | "empty";
    requiresGeneration: boolean;
    missingOutputKeys: string[];
    allVisibleOutputsReady: boolean;
    canApprove: boolean;
    reviewApproval: ReviewApproval | null;
    outputs: ReviewOutput[];
    pendingOutputs: PendingReviewOutput[];
  };
  message?: string;
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
    case "download_unavailable":
      return "Preparing secure link";
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

  if (value === "unsupported_format" || value === "download_unavailable") {
    return "text-amber-800";
  }

  if (value === "rendered") {
    return "text-emerald-700";
  }

  return "text-Color-Neutral";
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

const isBlockedStatus = (value: string) => {
  return value === "blocked" || value === "failed" || value === "canceled";
};

const isActiveGenerationStatus = (value: string) => {
  return (
    value === "queued" ||
    value === "rendering" ||
    value === "not_started" ||
    value === "download_unavailable"
  );
};

export default function ReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const documentId = searchParams.get("documentId")?.trim() ?? "";
  const justSubmitted = searchParams.get("submitted") === "1";
  const generationAttemptRef = useRef<string | null>(null);
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [selectedOutputKey, setSelectedOutputKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setIsEnsuringGeneration] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      const mainElement = document.querySelector("main");
      if (mainElement instanceof HTMLElement) {
        mainElement.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [documentId]);

  const fetchReview = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!accessToken || !documentId) {
        return null;
      }

      if (!options?.silent) {
        setIsLoading(true);
      }

      let requestId: string | null = null;
      addFeatureBreadcrumb({
        feature: "document_review",
        action: "fetch.started",
        data: { documentId, silent: Boolean(options?.silent) },
      });

      try {
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/documents/${documentId}/review`,
          accessToken,
          {
            cache: "no-store",
          },
        );
        requestId = getResponseRequestId(response);
        const nextPayload = (await response.json().catch(() => null)) as
          | ReviewPayload
          | null;

        if (!response.ok || !nextPayload?.document || !nextPayload.review) {
          throw new Error(nextPayload?.message ?? "Failed to load review documents.");
        }

        setPayload(nextPayload);
        setErrorMessage(null);
        addFeatureBreadcrumb({
          feature: "document_review",
          action: "fetch.completed",
          data: {
            documentId,
            requestId,
            state: nextPayload.review.state,
            pendingOutputCount: nextPayload.review.pendingOutputs.length,
            readyOutputCount: nextPayload.review.outputs.length,
          },
        });
        return nextPayload;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load review documents.";
        addFeatureBreadcrumb({
          feature: "document_review",
          action: "fetch.failed",
          level: "error",
          data: { documentId, requestId },
        });
        captureDomainException(error, {
          level: "error",
          operation: "document_review.fetch",
          errorCode: "WEB_REVIEW_FETCH_FAILED",
          errorFamily: "review",
          requestId,
          tags: {
            feature: "document_review",
            document_id: documentId,
          },
          contexts: {
            document_review: {
              documentId,
              stage: "fetch_review",
            },
          },
          fingerprint: ["document_review", "fetch_failed"],
        });
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

  const ensureGenerationRuns = useCallback(
    async (missingOutputKeys: string[]) => {
      if (!accessToken || !documentId || missingOutputKeys.length === 0) {
        return;
      }

      setIsEnsuringGeneration(true);
      let requestId: string | null = null;
      addFeatureBreadcrumb({
        feature: "document_generation",
        action: "ensure.started",
        data: { documentId, missingOutputKeys },
      });

      try {
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/documents/${documentId}/generation-runs`,
          accessToken,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              outputKeys: missingOutputKeys,
            }),
          },
        );
        requestId = getResponseRequestId(response);
        const responsePayload = (await response.json().catch(() => null)) as
          | {
              message?: string;
              runs?: Array<{
                id?: string;
                outputKey?: string;
                documentKey?: string;
                status?: string;
                blockedCount?: number;
                errorMessage?: string | null;
              }>;
            }
          | null;

        const blockedRuns = (responsePayload?.runs ?? []).filter(
          (run) => run.status === "blocked",
        );

        if (blockedRuns.length > 0) {
          addFeatureBreadcrumb({
            feature: "document_generation",
            action: "ensure.blocked",
            level: "warning",
            data: { documentId, requestId, blockedRuns },
          });
          captureAppMessage("Review PDF generation returned blocked runs", {
            level: "warning",
            tags: {
              feature: "document_generation",
              ...(requestId ? { request_id: requestId } : {}),
              document_id: documentId,
            },
            contexts: {
              document_generation: {
                documentId,
                requestedOutputKeys: missingOutputKeys,
                blockedRuns,
              },
            },
            fingerprint: ["review_generation", "blocked_runs"],
          });
        }

        if (!response.ok && response.status !== 409) {
          addFeatureBreadcrumb({
            feature: "document_generation",
            action: "ensure.failed_response",
            level: "error",
            data: { documentId, requestId, status: response.status },
          });
          captureAppMessage("Review PDF generation request failed", {
            level: "error",
            tags: {
              feature: "document_generation",
              ...(requestId ? { request_id: requestId } : {}),
              document_id: documentId,
            },
            contexts: {
              document_generation: {
                documentId,
                status: response.status,
                requestedOutputKeys: missingOutputKeys,
                message: responsePayload?.message ?? null,
              },
            },
            fingerprint: ["review_generation", "request_failed"],
          });

          throw new Error(
            responsePayload?.message ?? "Failed to start review PDF generation.",
          );
        }

        await fetchReview({ silent: true });
        addFeatureBreadcrumb({
          feature: "document_generation",
          action: "ensure.completed",
          data: { documentId, requestId, requestedOutputKeys: missingOutputKeys },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to start review PDF generation.";
        captureDomainException(error, {
          level: "error",
          operation: "document_generation.ensure_review_runs",
          errorCode: "WEB_GENERATION_ENSURE_FAILED",
          errorFamily: "generation",
          requestId,
          tags: {
            feature: "document_generation",
            document_id: documentId,
          },
          contexts: {
            document_generation: {
              documentId,
              requestedOutputKeys: missingOutputKeys,
              stage: "ensure_generation_runs",
            },
          },
          fingerprint: ["review_generation", "exception"],
        });
        setErrorMessage(message);
        showToast({ tone: "error", message });
      } finally {
        setIsEnsuringGeneration(false);
      }
    },
    [accessToken, documentId, fetchReview, showToast],
  );

  const approveReview = useCallback(async () => {
    if (!accessToken || !documentId || !payload?.review?.canApprove) {
      return;
    }

    setIsApproving(true);
    let requestId: string | null = null;
    addFeatureBreadcrumb({
      feature: "document_review",
      action: "approval.started",
      data: { documentId },
    });

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${documentId}/review-approval`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ agreed: true }),
        },
      );
      requestId = getResponseRequestId(response);
      const responsePayload = (await response.json().catch(() => null)) as
        | { message?: string }
        | null;

      if (!response.ok) {
        throw new Error(responsePayload?.message ?? "Failed to approve document review.");
      }

      showToast({
        tone: "success",
        message: "Review approved. Your documents are ready for signing.",
      });
      addFeatureBreadcrumb({
        feature: "document_review",
        action: "approval.completed",
        data: { documentId, requestId },
      });
      router.push(`/app/sign?documentId=${encodeURIComponent(documentId)}`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to approve document review.";
      addFeatureBreadcrumb({
        feature: "document_review",
        action: "approval.failed",
        level: "error",
        data: { documentId, requestId },
      });
      captureDomainException(error, {
        level: "error",
        operation: "document_review.approve",
        errorCode: "WEB_REVIEW_APPROVAL_FAILED",
        errorFamily: "review",
        requestId,
        tags: {
          feature: "document_review",
          document_id: documentId,
        },
        contexts: {
          document_review: {
            documentId,
            stage: "approve_review",
          },
        },
      });
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setIsApproving(false);
    }
  }, [accessToken, documentId, payload?.review?.canApprove, router, showToast]);

  const continueToSigning = useCallback(() => {
    if (!documentId) {
      return;
    }

    router.push(`/app/sign?documentId=${encodeURIComponent(documentId)}`);
  }, [documentId, router]);

  const backToForm = useCallback(() => {
    if (!documentId) {
      router.push("/app/start");
      return;
    }

    router.push(`/app/start?documentId=${encodeURIComponent(documentId)}&from=review`);
  }, [documentId, router]);

  const saveDraftSnapshot = useCallback(async () => {
    if (!accessToken || !documentId || isSavingDraft) {
      return;
    }

    setIsSavingDraft(true);

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${documentId}/intake-draft/resave`,
        accessToken,
        {
          method: "POST",
        },
      );
      const responsePayload = (await response.json().catch(() => null)) as
        | DocumentIntakeDraftResponsePayload
        | { message?: string }
        | null;
      const savedDraft =
        responsePayload && "draft" in responsePayload ? responsePayload.draft : null;

      if (!response.ok || !savedDraft) {
        throw new Error(responsePayload?.message ?? "Failed to save draft.");
      }

      const savedAt = formatDateLabel(savedDraft.updatedAt);
      showToast({
        tone: "success",
        message: savedAt ? `Draft saved at ${savedAt}.` : "Draft saved.",
      });
      router.push("/app/documents");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setIsSavingDraft(false);
    }
  }, [accessToken, documentId, isSavingDraft, router, showToast]);

  useEffect(() => {
    generationAttemptRef.current = null;
    setPayload(null);
    setSelectedOutputKey(null);
    setErrorMessage(null);

    if (!documentId || !accessToken) {
      return;
    }

    void fetchReview();
  }, [accessToken, documentId, fetchReview]);

  useEffect(() => {
    const outputs = payload?.review?.outputs ?? [];
    if (outputs.length === 0) {
      setSelectedOutputKey(null);
      return;
    }

    if (!selectedOutputKey || !outputs.some((output) => output.outputKey === selectedOutputKey)) {
      setSelectedOutputKey(outputs[0]?.outputKey ?? null);
    }
  }, [payload?.review?.outputs, selectedOutputKey]);

  const generationSignature = useMemo(() => {
    const missingOutputKeys = payload?.review?.missingOutputKeys ?? [];
    return missingOutputKeys.join(",");
  }, [payload?.review?.missingOutputKeys]);

  useEffect(() => {
    if (!payload?.review?.requiresGeneration || !generationSignature) {
      return;
    }

    if (generationAttemptRef.current === generationSignature) {
      return;
    }

    generationAttemptRef.current = generationSignature;
    void ensureGenerationRuns(payload.review.missingOutputKeys);
  }, [
    ensureGenerationRuns,
    generationSignature,
    payload?.review?.missingOutputKeys,
    payload?.review?.requiresGeneration,
  ]);

  useEffect(() => {
    const shouldPollReview = Boolean(
      payload?.review &&
        (payload.review.state === "generating" ||
          payload.review.requiresGeneration ||
          payload.review.pendingOutputs.some((output) =>
            isActiveGenerationStatus(output.status),
          )),
    );

    if (!shouldPollReview) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchReview({ silent: true });
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchReview, payload?.review]);

  const selectedOutput =
    payload?.review?.outputs.find((output) => output.outputKey === selectedOutputKey) ??
    payload?.review?.outputs[0] ??
    null;
  const review = payload?.review ?? null;

  const hasActivePendingOutputs = (review?.pendingOutputs ?? []).some((output) =>
    isActiveGenerationStatus(output.status),
  );
  const shouldDeferPreviewUntilAllReady = review
    ? !review.allVisibleOutputsReady &&
      hasActivePendingOutputs &&
      review.outputs.length + review.pendingOutputs.length > 1
    : false;
  const selectedPreviewOutputKey = shouldDeferPreviewUntilAllReady
    ? null
    : selectedOutput?.outputKey ?? null;
  const selectedPreviewDownloadUrl = shouldDeferPreviewUntilAllReady
    ? null
    : selectedOutput?.downloadUrl ?? null;

  useEffect(() => {
    if (!selectedPreviewOutputKey || !selectedPreviewDownloadUrl) {
      setPreviewUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }

        return null;
      });
      setPreviewErrorMessage(null);
      setIsLoadingPreview(false);
      return;
    }

    let isActive = true;
    const abortController = new AbortController();

    setPreviewUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }

      return null;
    });
    setPreviewErrorMessage(null);
    setIsLoadingPreview(true);

    const loadPreview = async () => {
      try {
        const response = await fetch(selectedPreviewDownloadUrl, {
          cache: "no-store",
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load the PDF preview.");
        }

        const responseBlob = await response.blob();
        const previewBlob = responseBlob.type
          ? responseBlob
          : new Blob([responseBlob], { type: "application/pdf" });
        const nextPreviewUrl = URL.createObjectURL(previewBlob);

        if (!isActive) {
          URL.revokeObjectURL(nextPreviewUrl);
          return;
        }

        setPreviewUrl(nextPreviewUrl);
      } catch (error) {
        if (!isActive || abortController.signal.aborted) {
          return;
        }

        setPreviewErrorMessage(
          error instanceof Error ? error.message : "Failed to load the PDF preview.",
        );
      } finally {
        if (isActive) {
          setIsLoadingPreview(false);
        }
      }
    };

    void loadPreview();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [selectedPreviewDownloadUrl, selectedPreviewOutputKey]);

  const readyOutputCount = payload?.review?.outputs.length ?? 0;
  const blockedOutputCount = (payload?.review?.pendingOutputs ?? []).filter((output) =>
    isBlockedStatus(output.status),
  ).length;
  const hasBlockedOutputs = blockedOutputCount > 0;
  const isWaitingForRenderableOutputs =
    readyOutputCount === 0 &&
    (payload?.review?.pendingOutputs ?? []).some((output) =>
      isActiveGenerationStatus(output.status),
    );
  const previewSourceUrl =
    previewUrl ?? (previewErrorMessage ? selectedOutput?.downloadUrl ?? null : null);

  const approvalCopy = payload?.review?.reviewApproval
    ? "Review approved. Signing can proceed on the prepared document set."
    : "Review each PDF carefully before approving for signing.";

  const secondaryApprovalCopy = payload?.review?.reviewApproval
    ? "DARCi has already assigned the registry number and prepared the signing set for this document."
    : justSubmitted
      ? null
      : "DARCi assigns the final registry number only after you approve the review set.";
  const reviewCardBaseClass =
    "w-full rounded-xl border border-Color-Scheme-1-Border px-5 py-5 text-left transition-[opacity,transform,border-color] duration-200 ease-out";
  const reviewActionButtonBaseClass =
    "inline-flex min-h-10 min-w-[11rem] items-center justify-center px-4 py-2 text-center text-sm font-medium";
  const previewPanelHeightClass = "h-[72vh] min-h-[560px]";

  const renderPreviewPanel = () => {
    if (isLoading && !payload) {
      return (
        <div className={`flex ${previewPanelHeightClass} items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral`}>
          Loading review documents...
        </div>
      );
    }

    if (selectedOutput) {
      if (shouldDeferPreviewUntilAllReady) {
        return (
          <div className={`flex ${previewPanelHeightClass} flex-col items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center`}>
            <span
              className="block h-8 w-8 rounded-full border-2 border-slate-300 border-t-Color-Scheme-1-Text"
              style={{ animation: "darciSpinnerSpin 900ms linear infinite" }}
            />
            <p className="mt-4 text-sm font-medium text-Color-Scheme-1-Text">
              Preparing your full review set.
            </p>
            <p className="mt-2 text-sm leading-6 text-Color-Neutral">
              The preview will appear once every document in this package is ready.
            </p>
          </div>
        );
      }

      if (isLoadingPreview && !previewSourceUrl) {
        return (
          <div className={`flex ${previewPanelHeightClass} flex-col items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center`}>
            <span
              className="block h-8 w-8 rounded-full border-2 border-slate-300 border-t-Color-Scheme-1-Text"
              style={{ animation: "darciSpinnerSpin 900ms linear infinite" }}
            />
            <p className="mt-4 text-sm font-medium text-Color-Scheme-1-Text">
              Loading PDF preview.
            </p>
          </div>
        );
      }

      if (previewSourceUrl) {
        return (
          <object
            className={`${previewPanelHeightClass} w-full rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f3f6f8]`}
            data={previewSourceUrl}
            type="application/pdf"
          >
            <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-Color-Neutral">
              Open the PDF in a new tab if your browser does not render inline previews here.
            </div>
          </object>
        );
      }

      return (
        <div className={`flex ${previewPanelHeightClass} flex-col items-center justify-center rounded-[20px] border border-dashed border-amber-200 bg-[#f7f9fb] px-6 text-center`}>
          <p className="text-sm font-medium text-Color-Scheme-1-Text">
            {previewErrorMessage ?? "The PDF preview is unavailable right now."}
          </p>
          <p className="mt-2 text-sm leading-6 text-Color-Neutral">
            This embedded preview uses your browser&apos;s built-in PDF viewer. Reload the page if it does not recover.
          </p>
        </div>
      );
    }

    if (isWaitingForRenderableOutputs) {
      return (
        <div className={`flex ${previewPanelHeightClass} flex-col items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center`}>
          <span
            className="block h-8 w-8 rounded-full border-2 border-slate-300 border-t-Color-Scheme-1-Text"
            style={{ animation: "darciSpinnerSpin 900ms linear infinite" }}
          />
          <p className="mt-4 text-sm font-medium text-Color-Scheme-1-Text">
            Preparing your review PDFs.
          </p>
        </div>
      );
    }

    if (hasBlockedOutputs) {
      return (
        <div className={`flex ${previewPanelHeightClass} flex-col items-center justify-center gap-4 rounded-[20px] border border-dashed border-red-200 bg-[#fdf6f6] px-6 text-center text-sm leading-6 text-red-700`}>
          <p>
            One or more review outputs are blocked. Check the blocker details in the left column to resolve them before approval.
          </p>
          <button
            type="button"
            onClick={backToForm}
            className="inline-flex items-center justify-center rounded-full border border-red-300 bg-white px-4 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50"
          >
            Back to form to fix blockers
          </button>
        </div>
      );
    }

    return (
      <div className={`flex ${previewPanelHeightClass} items-center justify-center rounded-[20px] border border-dashed border-Color-Scheme-1-Border/50 bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral`}>
        Review PDFs will appear here as soon as they are ready.
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2 pb-2">
        <div className="text-2xl font-medium">Create and secure your document</div>
        <div className="text-sm text-Color-Neutral">
          Fill in your details to generate your document. You&apos;ll review, sign and finalize it securely.
        </div>
      </div>

      <div className="space-y-6">
        <div
          className="sticky top-[-4rem] z-[500] hidden xl:block"
          data-process-band-sticky-host
          style={{ animation: "darciContentFadeIn 220ms ease-out both" }}
        >
          <ProcessBand currentStep={payload?.review?.reviewApproval ? 3 : 2} forceCompact />
        </div>

        <div
          className="relative z-0 grid gap-6 lg:grid-cols-[1fr_2fr]"
          style={{ animation: "darciContentFadeIn 220ms ease-out both", animationDelay: "60ms" }}
        >
          <div
            className="relative z-0 space-y-6 overflow-visible lg:sticky lg:self-start"
            style={{ top: "var(--darci-process-band-follow-offset, 5rem)" }}
          >
            <div className="space-y-2 pb-2">
              <div className="text-2xl font-medium">Review documents</div>
              <div className="text-sm text-Color-Neutral">{approvalCopy}</div>
            </div>

            {secondaryApprovalCopy ? (
              <div className="text-sm leading-6 text-Color-Neutral">{secondaryApprovalCopy}</div>
            ) : null}

              {errorMessage ? (
                <div className="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {payload?.review?.outputs.map((output) => {
                const isSelected = output.outputKey === selectedOutput?.outputKey;

                return (
                  <button
                    key={`${output.outputKey}-${output.versionId}`}
                    className={`${reviewCardBaseClass} ${
                      isSelected
                        ? "border-Color-Scheme-1-Text"
                        : "hover:border-Color-Scheme-1-Text"
                    }`}
                    onClick={() => {
                      setSelectedOutputKey(output.outputKey);
                    }}
                    type="button"
                  >
                    <div
                      className={`font-display text-sm font-medium ${
                        isSelected ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"
                      }`}
                    >
                        {output.outputLabel}
                    </div>
                    <div className="mt-2 text-xs text-emerald-700">Ready</div>
                    <div
                      className={`mt-2 ${
                        isSelected ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"
                      }`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20">
                        <path
                          d="m7.5 5.5 5 4.5-5 4.5"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.8"
                        />
                      </svg>
                    </div>
                  </button>
                );
              })}

              {payload?.review?.outputs.length === 0 && !isWaitingForRenderableOutputs && !hasBlockedOutputs ? (
                <div className="rounded-xl border border-dashed border-Color-Scheme-1-Border/50 px-5 py-5 text-sm leading-6 text-Color-Neutral">
                  No reviewable PDFs are available yet.
                </div>
              ) : null}

              {payload?.review?.pendingOutputs.length ? (
                <div className="space-y-3 pt-2">
                  <div className="text-sm font-medium text-Color-Scheme-1-Text">Pending outputs</div>
                  {payload.review.pendingOutputs.map((output) => {
                    const blockingMessages = (output.blockers ?? []).filter(
                      (blocker) => blocker.blocking,
                    );

                    return (
                      <div
                        key={`pending-${output.outputKey}`}
                        className={`${reviewCardBaseClass} cursor-default`}
                      >
                        <div className="font-display text-sm font-medium text-Color-Scheme-1-Text">
                          {output.outputLabel}
                        </div>
                        <div className={`mt-2 text-xs ${getStatusTextClasses(output.status)}`}>
                          {formatStatusLabel(output.status)}
                        </div>

                        {output.errorMessage ? (
                          <p className="mt-3 text-xs leading-5 text-Color-Neutral">
                            {output.errorMessage}
                          </p>
                        ) : null}

                        {blockingMessages.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {blockingMessages.map((blocker) => (
                              <div
                                key={`${output.outputKey}-${blocker.code}-${blocker.field ?? blocker.message}`}
                                className="border border-red-200 px-3 py-2 text-xs leading-5 text-red-700"
                              >
                                {blocker.message}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="space-y-3 pt-2">
                {payload?.review?.reviewApproval?.approvedAt ? (
                  <div className="text-sm font-medium text-emerald-700">
                    Approved {formatDateLabel(payload.review.reviewApproval.approvedAt) ?? "just now"}.
                  </div>
                ) : !payload?.review?.canApprove ? (
                  <div className="text-sm leading-6 text-Color-Neutral">
                    {isWaitingForRenderableOutputs
                      ? "Approval unlocks when the visible review PDFs finish rendering."
                      : hasBlockedOutputs
                        ? "Approval is blocked until every visible review PDF is ready. Check the blocker details above."
                        : "DARCi needs at least one visible review PDF before approval can proceed."}
                  </div>
                ) : null}
              </div>
          </div>

          <div className="space-y-6">
            <div id="contract-container" className="relative z-0 bg-white p-12 space-y-4">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-medium">
                    {selectedOutput?.outputLabel ?? "Document preview"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="inline-flex min-h-10 items-center justify-center px-2 py-2 text-sm font-medium text-Color-Neutral transition hover:text-Color-Scheme-1-Text"
                      onClick={backToForm}
                      type="button"
                    >
                      Back to form
                    </button>
                    <button
                      className={`${reviewActionButtonBaseClass} border border-Color-Scheme-1-Border text-Color-Scheme-1-Text transition hover:border-Color-Scheme-1-Text ${
                        isSavingDraft ? "cursor-wait" : ""
                      }`}
                      disabled={isSavingDraft}
                      onClick={() => {
                        void saveDraftSnapshot();
                      }}
                      type="button"
                    >
                      {isSavingDraft ? "Saving draft..." : "Save to drafts"}
                    </button>
                    <button
                      className={`${reviewActionButtonBaseClass} transition ${
                        payload?.review?.reviewApproval
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : payload?.review?.canApprove && !isApproving
                            ? "platform-btn-primary"
                            : "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                      }`}
                      disabled={
                        payload?.review?.reviewApproval
                          ? false
                          : !payload?.review?.canApprove || isApproving
                      }
                      onClick={() => {
                        if (payload?.review?.reviewApproval) {
                          continueToSigning();
                          return;
                        }

                        void approveReview();
                      }}
                      type="button"
                    >
                      {payload?.review?.reviewApproval
                        ? "Go to signing"
                        : isApproving
                          ? "Approving review..."
                          : "Continue to signing"}
                    </button>
                  </div>
                </div>
              </div>

              {renderPreviewPanel()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
