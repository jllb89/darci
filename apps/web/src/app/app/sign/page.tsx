"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProcessBand from "@/app/app/start/ProcessBand";
import { useAppToast } from "@/components/app/AppToastContext";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

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
  };
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [payload, setPayload] = useState<SigningPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingCapture, setIsSavingCapture] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [activeSignerId, setActiveSignerId] = useState<string | null>(null);
  const [activeOutputKey, setActiveOutputKey] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<"upload" | "type" | "draw">("type");
  const [typedValues, setTypedValues] = useState<Record<string, string>>({});
  const [typedKinds, setTypedKinds] = useState<Record<string, "name" | "initials">>({});

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

    void fetchSigning();
  }, [accessToken, documentId, fetchSigning]);

  useEffect(() => {
    const signatures = payload?.signing?.signatures ?? [];
    if (signatures.length === 0) {
      setActiveSignerId(null);
      return;
    }

    if (!activeSignerId || !signatures.some((signature) => signature.outputSignerId === activeSignerId)) {
      setActiveSignerId(signatures[0]?.outputSignerId ?? null);
    }
  }, [activeSignerId, payload?.signing?.signatures]);

  const activeSignature =
    payload?.signing?.signatures.find((signature) => signature.outputSignerId === activeSignerId) ??
    payload?.signing?.signatures[0] ??
    null;

  useEffect(() => {
    if (!activeSignature) {
      return;
    }

    setActiveOutputKey(activeSignature.outputKey);
    setCaptureMode(activeSignature.captureMethod ?? "type");
  }, [activeSignature]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#111111";
    hasInkRef.current = false;
  }, [activeSignature?.outputSignerId]);

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
  const signingStateLabel = payload?.signing?.state === "confirmed"
    ? "All required signatures are captured and confirmed."
    : payload?.signing?.state === "preparing"
      ? "DARCi is preparing the official signing PDF set."
      : "Capture each required signature, then confirm the signing set.";

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    hasInkRef.current = false;
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
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }, []);

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
    lastPointRef.current = point;
  }, []);

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

      showToast({ tone: "success", message: "Typed signature saved." });
      await refreshAfterCapture();
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
    documentId,
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

    const imageDataUrl = canvas.toDataURL("image/png");
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

      clearCanvas();
      showToast({ tone: "success", message: "Drawn signature saved." });
      await refreshAfterCapture();
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
    clearCanvas,
    documentId,
    isSavingCapture,
    refreshAfterCapture,
    showToast,
  ]);

  const handleUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = "";

      if (!file || !accessToken || !documentId || !activeSignature || isSavingCapture) {
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

        showToast({ tone: "success", message: "Uploaded signature saved." });
        await refreshAfterCapture();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload signature image.";
        setErrorMessage(message);
        showToast({ tone: "error", message });
      } finally {
        setIsSavingCapture(false);
      }
    },
    [
      accessToken,
      activeSignature,
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

  const renderPreviewPanel = () => {
    if (isLoading && !payload) {
      return (
        <div className="flex h-[72vh] min-h-[560px] items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral">
          Loading the signing set...
        </div>
      );
    }

    if (selectedOutput) {
      return (
        <object
          className="h-[72vh] min-h-[560px] w-full rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f3f6f8]"
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
        <div className="flex h-[72vh] min-h-[560px] flex-col items-center justify-center rounded-[20px] border border-Color-Scheme-1-Border/35 bg-[#f7f9fb] px-6 text-center">
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
      <div className="flex h-[72vh] min-h-[560px] items-center justify-center rounded-[20px] border border-dashed border-Color-Scheme-1-Border/50 bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral">
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
        <div className="sticky top-[-4rem] z-[500]" data-process-band-sticky-host>
          <ProcessBand currentStep={3} />
        </div>

        {errorMessage ? (
          <div className="rounded-xl border border-red-200 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
            <div className="rounded-[20px] border border-Color-Scheme-1-Border bg-white px-5 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-Color-Scheme-1-Text">
                    Required signatures
                  </div>
                  <div className="mt-2 text-sm leading-6 text-Color-Neutral">
                    {payload?.signing?.completion.requiredSignatureCount ?? 0} required directly. Confirm unlocks when every required signer and group rule is satisfied.
                  </div>
                </div>
                <div className="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                  {payload?.signing?.completion.capturedRequiredSignatureCount ?? 0}/
                  {payload?.signing?.completion.requiredSignatureCount ?? 0}
                </div>
              </div>

              {payload?.signing?.signingExecution?.confirmedAt ? (
                <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  Confirmed {formatDateLabel(payload.signing.signingExecution.confirmedAt) ?? "just now"}.
                </div>
              ) : null}
            </div>

            {payload?.signing?.groups.length ? (
              <div className="rounded-[20px] border border-Color-Scheme-1-Border bg-white px-5 py-5">
                <div className="text-sm font-medium text-Color-Scheme-1-Text">Signing groups</div>
                <div className="mt-4 space-y-3">
                  {payload.signing.groups.map((group) => (
                    <div
                      key={`${group.generationRunId}-${group.signingGroup}`}
                      className="rounded-xl border border-Color-Scheme-1-Border px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-Color-Scheme-1-Text">{group.label}</div>
                        <div className={`text-xs ${group.isSatisfied ? "text-emerald-700" : "text-Color-Neutral"}`}>
                          {group.capturedCount}/{group.minimumRequired} complete
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-Color-Neutral">{group.outputLabel}</div>
                      <div className="mt-2 text-xs leading-5 text-Color-Neutral">
                        {group.minimumRequired} of {group.totalCount} signatures are needed from this group.
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-3">
              {(payload?.signing?.signatures ?? []).map((signature) => {
                const isActive = signature.outputSignerId === activeSignature?.outputSignerId;

                return (
                  <button
                    key={signature.outputSignerId}
                    className={`w-full rounded-[20px] border px-5 py-4 text-left transition ${
                      isActive
                        ? "border-Color-Scheme-1-Text bg-white"
                        : "border-Color-Scheme-1-Border bg-white hover:border-Color-Scheme-1-Text"
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
                          {signature.partyName}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.08em] text-Color-Neutral">
                          {signature.partyRole.replace(/_/g, " ")}
                        </div>
                      </div>
                      <div className={`text-xs ${signature.status === "captured" ? "text-emerald-700" : "text-Color-Neutral"}`}>
                        {getCaptureStatusLabel(signature)}
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-Color-Neutral">{signature.outputLabel}</div>
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
            </div>

            {activeSignature ? (
              <div className="rounded-[20px] border border-Color-Scheme-1-Border bg-white px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-Color-Scheme-1-Text">
                      {activeSignature.partyName}
                    </div>
                    <div className="mt-1 text-sm text-Color-Neutral">{activeSignature.outputLabel}</div>
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
                  {(["upload", "type", "draw"] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition ${
                        captureMode === mode
                          ? "bg-black text-white"
                          : "border border-Color-Scheme-1-Border text-Color-Scheme-1-Text"
                      }`}
                      onClick={() => {
                        setCaptureMode(mode);
                      }}
                      type="button"
                    >
                      {mode === "upload" ? "Upload" : mode === "type" ? "Type" : "Draw"}
                    </button>
                  ))}
                </div>

                {captureMode === "upload" ? (
                  <div className="mt-5 space-y-4">
                    <div className="text-sm leading-6 text-Color-Neutral">
                      Upload a PNG or JPG image of this signature.
                    </div>
                    <input
                      ref={fileInputRef}
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleUploadChange}
                      type="file"
                    />
                    <button
                      className={`inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm font-medium ${
                        isSavingCapture ? "cursor-wait border border-Color-Scheme-1-Border text-Color-Neutral" : "platform-btn-primary"
                      }`}
                      disabled={isSavingCapture || payload?.signing?.state === "confirmed"}
                      onClick={() => {
                        fileInputRef.current?.click();
                      }}
                      type="button"
                    >
                      {isSavingCapture ? "Uploading..." : "Choose signature image"}
                    </button>
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
                      className={`inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm font-medium ${
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
                        className="inline-flex min-h-10 items-center justify-center border border-Color-Scheme-1-Border px-4 py-2 text-sm font-medium text-Color-Scheme-1-Text"
                        onClick={clearCanvas}
                        type="button"
                      >
                        Clear
                      </button>
                      <button
                        className={`inline-flex min-h-10 items-center justify-center px-4 py-2 text-sm font-medium ${
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

                {activeSignature.status === "captured" ? (
                  <div className="mt-5 rounded-[18px] border border-Color-Scheme-1-Border bg-Color-Neutral-Lightest px-4 py-4">
                    <div className="text-xs uppercase tracking-[0.08em] text-Color-Neutral">
                      Saved capture
                    </div>
                    {activeSignature.captureMethod === "type" ? (
                      <div className="mt-3 text-3xl italic text-Color-Scheme-1-Text" style={{ fontFamily: '"Times New Roman", serif' }}>
                        {activeSignature.typedValue}
                      </div>
                    ) : activeSignature.assetDownloadUrl ? (
                      <object
                        className="mt-3 max-h-28 rounded-lg border border-Color-Scheme-1-Border bg-white p-2"
                        data={activeSignature.assetDownloadUrl}
                        type={activeSignature.mimeType ?? "image/png"}
                      >
                        Saved signature image
                      </object>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-[20px] border border-Color-Scheme-1-Border bg-white px-5 py-5">
              <div className="text-sm font-medium text-Color-Scheme-1-Text">Confirm signing set</div>
              <div className="mt-3 text-sm leading-6 text-Color-Neutral">
                Confirm stays disabled until every required signature and signing group is complete.
              </div>
              <button
                className={`mt-5 inline-flex min-h-11 w-full items-center justify-center px-4 py-2 text-sm font-medium transition ${
                  payload?.signing?.state === "confirmed"
                    ? "bg-emerald-50 text-emerald-700"
                    : payload?.signing?.completion.canConfirm && !isConfirming
                      ? "platform-btn-primary"
                      : "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                }`}
                disabled={
                  payload?.signing?.state === "confirmed"
                    ? true
                    : !payload?.signing?.completion.canConfirm || isConfirming
                }
                onClick={() => {
                  void handleConfirm();
                }}
                type="button"
              >
                {payload?.signing?.state === "confirmed"
                  ? "Signing confirmed"
                  : isConfirming
                    ? "Confirming..."
                    : "Confirm signatures"}
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[20px] border border-Color-Scheme-1-Border bg-white p-5">
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
                <div className="mt-5 rounded-[18px] border border-Color-Scheme-1-Border bg-Color-Neutral-Lightest px-4 py-4">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}