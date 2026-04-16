"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ProcessBand from "@/app/app/start/ProcessBand";
import { formatLabel } from "@/app/app/start/startPageUtils";
import { useAppToast } from "@/components/app/AppToastContext";
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
    case "not_started":
      return "Waiting to start";
    default:
      return value
        .split("_")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
  }
};

const getStatusToneClasses = (value: string) => {
  if (value === "failed" || value === "blocked" || value === "canceled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (value === "unsupported_format") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (value === "rendered") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-700";
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
  return value === "queued" || value === "rendering" || value === "not_started";
};

const formatProductFlowModeLabel = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value === "poa_only") {
    return "POA Only";
  }

  return formatLabel(value).replace(/\bPoa\b/g, "POA");
};

export default function ReviewPage() {
  const searchParams = useSearchParams();
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const documentId = searchParams.get("documentId")?.trim() ?? "";
  const justSubmitted = searchParams.get("submitted") === "1";
  const generationAttemptRef = useRef<string | null>(null);
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [selectedOutputKey, setSelectedOutputKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnsuringGeneration, setIsEnsuringGeneration] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewErrorMessage, setPreviewErrorMessage] = useState<string | null>(null);

  const fetchReview = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!accessToken || !documentId) {
        return null;
      }

      if (!options?.silent) {
        setIsLoading(true);
      }

      try {
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/documents/${documentId}/review`,
          accessToken,
          {
            cache: "no-store",
          },
        );
        const nextPayload = (await response.json().catch(() => null)) as
          | ReviewPayload
          | null;

        if (!response.ok || !nextPayload?.document || !nextPayload.review) {
          throw new Error(nextPayload?.message ?? "Failed to load review documents.");
        }

        setPayload(nextPayload);
        setErrorMessage(null);
        return nextPayload;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load review documents.";
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
        const responsePayload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;

        if (!response.ok && response.status !== 409) {
          throw new Error(
            responsePayload?.message ?? "Failed to start review PDF generation.",
          );
        }

        await fetchReview({ silent: true });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to start review PDF generation.";
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
      await fetchReview({ silent: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to approve document review.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setIsApproving(false);
    }
  }, [accessToken, documentId, fetchReview, payload?.review?.canApprove, showToast]);

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
    if (payload?.review?.state !== "generating") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void fetchReview({ silent: true });
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [fetchReview, payload?.review?.state]);

  const selectedOutput =
    payload?.review?.outputs.find((output) => output.outputKey === selectedOutputKey) ??
    payload?.review?.outputs[0] ??
    null;

  useEffect(() => {
    if (!selectedOutput) {
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
        const response = await fetch(selectedOutput.downloadUrl, {
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
  }, [selectedOutput]);

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
  const selectedProductLabel = formatProductFlowModeLabel(
    payload?.document?.productFlowMode ?? payload?.document?.documentType,
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
    "w-full rounded-xl border border-Color-Scheme-1-Border bg-white px-5 py-5 text-left transition-[opacity,transform,border-color,background-color,box-shadow] duration-200 ease-out";
  const reviewActionButtonBaseClass =
    "inline-flex min-h-10 min-w-[11rem] items-center justify-center px-4 py-2 text-center text-sm font-medium";

  const renderPreviewPanel = () => {
    if (isLoading && !payload) {
      return (
        <div className="flex h-[72vh] min-h-[560px] items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral">
          Loading review documents...
        </div>
      );
    }

    if (selectedOutput) {
      if (isLoadingPreview && !previewSourceUrl) {
        return (
          <div className="flex h-[72vh] min-h-[560px] flex-col items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center">
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
            className="h-[72vh] min-h-[560px] w-full rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f3f6f8]"
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
        <div className="flex h-[72vh] min-h-[560px] flex-col items-center justify-center rounded-[20px] border border-dashed border-amber-200 bg-[#f7f9fb] px-6 text-center">
          <p className="text-sm font-medium text-Color-Scheme-1-Text">
            {previewErrorMessage ?? "The PDF preview is unavailable right now."}
          </p>
          <p className="mt-2 text-sm leading-6 text-Color-Neutral">
            Use the Open PDF action above while DARCi refreshes the inline preview.
          </p>
        </div>
      );
    }

    if (isWaitingForRenderableOutputs) {
      return (
        <div className="flex h-[72vh] min-h-[560px] flex-col items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center">
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
        <div className="flex h-[72vh] min-h-[560px] items-center justify-center rounded-[20px] border border-dashed border-red-200 bg-[#fdf6f6] px-6 text-center text-sm leading-6 text-red-700">
          One or more review outputs are blocked. Check the blocker details in the left column to resolve them before approval.
        </div>
      );
    }

    return (
      <div className="flex h-[72vh] min-h-[560px] items-center justify-center rounded-[20px] border border-dashed border-Color-Scheme-1-Border/50 bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral">
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

        <div
          className="relative z-[500]"
          style={{ animation: "darciContentFadeIn 220ms ease-out both", animationDelay: "60ms" }}
        >
          <ProcessBand currentStep={payload?.review?.reviewApproval ? 3 : 2} />
        </div>

        <div
          className="relative z-0 grid gap-6 lg:grid-cols-[1fr_2fr]"
          style={{ animation: "darciContentFadeIn 220ms ease-out both", animationDelay: "120ms" }}
        >
          <div className="relative z-0 space-y-6 overflow-visible lg:sticky lg:top-20 lg:self-start">
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

              {isEnsuringGeneration ? (
                <div className="rounded-xl border border-sky-200 px-4 py-3 text-xs text-sky-700">
                  Starting generation for any missing review PDFs.
                </div>
              ) : null}

              {payload?.review?.outputs.map((output) => {
                const isSelected = output.outputKey === selectedOutput?.outputKey;

                return (
                  <button
                    key={`${output.outputKey}-${output.versionId}`}
                    className={`${reviewCardBaseClass} ${
                      isSelected
                        ? "border-Color-Scheme-1-Text bg-Color-Neutral-Lightest/70 shadow-[0_12px_32px_rgba(15,23,42,0.08)]"
                        : "hover:border-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest/55 hover:opacity-90 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                    }`}
                    onClick={() => {
                      setSelectedOutputKey(output.outputKey);
                    }}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-display text-sm font-medium text-Color-Scheme-1-Text">
                        {output.outputLabel}
                      </div>
                      <div className="flex items-center gap-3 text-Color-Scheme-1-Text">
                        <span className="font-medium text-emerald-700">Ready</span>
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
                    </div>
                  </button>
                );
              })}

              {payload?.review?.outputs.length === 0 && isWaitingForRenderableOutputs ? (
                <div className="rounded-xl border border-Color-Scheme-1-Border px-5 py-8 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center border border-Color-Scheme-1-Border/35">
                    <span
                      className="block h-5 w-5 rounded-full border-2 border-slate-300 border-t-Color-Scheme-1-Text"
                      style={{ animation: "darciSpinnerSpin 900ms linear infinite" }}
                    />
                  </div>
                  <p className="mt-4 text-sm font-medium text-Color-Scheme-1-Text">
                    Preparing your review PDFs.
                  </p>
                </div>
              ) : null}

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
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-display text-sm font-medium text-Color-Scheme-1-Text">
                              {output.outputLabel}
                            </div>
                            <div className="mt-1 text-xs text-Color-Neutral">
                              {output.mimeType ?? "PDF not ready yet"}
                            </div>
                          </div>
                          <span
                            className={`border px-2 py-1 text-[0.7rem] font-medium ${getStatusToneClasses(output.status)}`}
                          >
                            {formatStatusLabel(output.status)}
                          </span>
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
            <div id="contract-container" className="relative z-0 space-y-4 bg-white p-4">
              <div className="space-y-4 p-4">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium">
                      {selectedOutput?.outputLabel ?? "Document preview"}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedOutput ? (
                        <a
                          className={`${reviewActionButtonBaseClass} bg-black text-white transition hover:bg-neutral-800`}
                          href={selectedOutput.downloadUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open PDF
                        </a>
                      ) : null}
                      <button
                        className={`${reviewActionButtonBaseClass} transition ${
                          payload?.review?.reviewApproval
                            ? "cursor-default bg-emerald-50 text-emerald-700"
                            : payload?.review?.canApprove && !isApproving
                              ? "platform-btn-primary"
                              : "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                        }`}
                        disabled={Boolean(payload?.review?.reviewApproval) || !payload?.review?.canApprove || isApproving}
                        onClick={() => {
                          void approveReview();
                        }}
                        type="button"
                      >
                        {payload?.review?.reviewApproval
                          ? "Review approved"
                          : isApproving
                            ? "Approving review..."
                            : "Continue to signing"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-[24px] border border-Color-Scheme-1-Border/35 bg-[linear-gradient(180deg,#f4f7fb,#eef3f9)] p-4 md:p-5">
                  {renderPreviewPanel()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
