"use client";

import { useEffect, useState } from "react";

const pdfHeader = [0x25, 0x50, 0x44, 0x46, 0x2d];

export class PdfPreviewLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfPreviewLoadError";
  }
}

export const hasPdfHeader = (bytes: Uint8Array) => {
  for (let offset = 0; offset <= bytes.length - pdfHeader.length; offset += 1) {
    if (pdfHeader.every((value, index) => bytes[offset + index] === value)) {
      return true;
    }
  }

  return false;
};

export const readPdfPreviewBlob = async (response: Response) => {
  if (!response.ok) {
    throw new PdfPreviewLoadError("The PDF could not be downloaded.");
  }

  const sourceBlob = await response.blob();
  const headerBytes = new Uint8Array(
    await sourceBlob.slice(0, 1024).arrayBuffer(),
  );

  if (sourceBlob.size === 0 || !hasPdfHeader(headerBytes)) {
    throw new PdfPreviewLoadError("This file is not a readable PDF.");
  }

  return sourceBlob.type === "application/pdf"
    ? sourceBlob
    : new Blob([sourceBlob], { type: "application/pdf" });
};

type PdfDocumentPreviewProps = {
  sourceUrl: string;
  label: string;
  className?: string;
};

type PdfPreviewState = {
  requestKey: string;
  previewUrl: string | null;
  errorMessage: string | null;
};

export function PdfDocumentPreview({
  sourceUrl,
  label,
  className = "",
}: PdfDocumentPreviewProps) {
  const [previewState, setPreviewState] = useState<PdfPreviewState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const requestKey = `${sourceUrl}\u0000${reloadKey}`;
  const currentPreviewState =
    previewState?.requestKey === requestKey ? previewState : null;

  useEffect(() => {
    let isActive = true;
    let objectUrl: string | null = null;
    const abortController = new AbortController();

    const loadPreview = async () => {
      try {
        const response = await fetch(sourceUrl, {
          cache: "no-store",
          signal: abortController.signal,
        });
        const previewBlob = await readPdfPreviewBlob(response);
        objectUrl = URL.createObjectURL(previewBlob);

        if (isActive) {
          setPreviewState({
            requestKey,
            previewUrl: objectUrl,
            errorMessage: null,
          });
        }
      } catch (error) {
        if (!isActive || abortController.signal.aborted) {
          return;
        }

        setPreviewState({
          requestKey,
          previewUrl: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : "The PDF preview is unavailable.",
        });
      }
    };

    void loadPreview();

    return () => {
      isActive = false;
      abortController.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [requestKey, sourceUrl]);

  return (
    <div className={`flex flex-col overflow-hidden bg-[#f3f6f8] ${className}`}>
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-Color-Scheme-1-Border/35 bg-white px-4">
        <span className="min-w-0 truncate text-sm font-medium text-Color-Scheme-1-Text">
          {label}
        </span>
        <a
          className="shrink-0 text-sm font-medium text-Color-Scheme-1-Text underline decoration-Color-Scheme-1-Border underline-offset-4"
          href={sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open PDF
        </a>
      </div>

      <div className="relative min-h-0 flex-1">
        {currentPreviewState?.errorMessage ? (
          <div
            aria-live="polite"
            className="flex h-full flex-col items-center justify-center bg-[#f7f9fb] px-6 text-center"
            data-testid="pdf-preview-error"
          >
            <p className="text-sm font-medium text-Color-Scheme-1-Text">
              This PDF cannot be previewed.
            </p>
            <p className="mt-2 max-w-lg text-sm leading-6 text-Color-Neutral">
              {currentPreviewState.errorMessage}
            </p>
            <button
              className="platform-btn-secondary mt-4 min-h-10 px-4 py-2 text-sm font-medium"
              onClick={() => setReloadKey((currentKey) => currentKey + 1)}
              type="button"
            >
              Retry preview
            </button>
          </div>
        ) : currentPreviewState?.previewUrl ? (
          <object
            aria-label={label}
            className="h-full w-full bg-[#f3f6f8]"
            data={currentPreviewState.previewUrl}
            onError={() => setPreviewState({
              requestKey,
              previewUrl: null,
              errorMessage: "Your browser could not render this PDF inline.",
            })}
            type="application/pdf"
          >
            <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-Color-Neutral">
              The inline PDF viewer is unavailable.
            </div>
          </object>
        ) : (
          <div
            aria-live="polite"
            className="flex h-full flex-col items-center justify-center bg-[#f7f9fb] px-6 text-center"
          >
            <span
              className="block h-8 w-8 rounded-full border-2 border-slate-300 border-t-Color-Scheme-1-Text"
              style={{ animation: "darciSpinnerSpin 900ms linear infinite" }}
            />
            <p className="mt-4 text-sm font-medium text-Color-Scheme-1-Text">
              Loading PDF preview.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}