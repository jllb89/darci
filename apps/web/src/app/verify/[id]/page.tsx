"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";
const previewPanelHeightClass = "h-[72vh] min-h-[560px]";

type PublicVerificationDocument = {
  id: string;
  versionId: string;
  label: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isFinal: boolean;
  downloadUrl: string | null;
  createdAt: string;
};

type PublicVerificationPayload = {
  idn: string;
  hash: string | null;
  ledgerTxId: string | null;
  anchoredAt: string | null;
  status: "verified" | "unverified";
  documents?: PublicVerificationDocument[];
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

export default function PublicVerifyPage() {
  const params = useParams<{ id: string }>();
  const idn = typeof params?.id === "string" ? params.id : "";
  const [payload, setPayload] = useState<PublicVerificationPayload | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadVerification = useCallback(async () => {
    if (!idn) {
      setPayload(null);
      setSelectedDocumentId(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/verify/${encodeURIComponent(idn)}`, {
        cache: "no-store",
      });
      const nextPayload = (await response.json().catch(() => null)) as PublicVerificationPayload | null;

      if (!response.ok || !nextPayload?.idn) {
        throw new Error("Verification record not found.");
      }

      const nextDocuments = nextPayload.documents ?? [];
      setPayload({ ...nextPayload, documents: nextDocuments });
      setSelectedDocumentId((currentDocumentId) => {
        if (currentDocumentId && nextDocuments.some((document) => document.id === currentDocumentId)) {
          return currentDocumentId;
        }

        return nextDocuments.find((document) => document.downloadUrl)?.id ?? nextDocuments[0]?.id ?? null;
      });
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Verification record not found.");
      setPayload(null);
      setSelectedDocumentId(null);
    } finally {
      setIsLoading(false);
    }
  }, [idn]);

  useEffect(() => {
    void loadVerification();
  }, [loadVerification]);

  const documents = payload?.documents ?? [];
  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) ??
    documents.find((document) => document.downloadUrl) ??
    documents[0] ??
    null;
  const headingIdn = payload?.idn ?? idn;

  return (
    <main className="min-h-screen bg-white text-Color-Scheme-1-Text">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
        <section className="relative flex min-h-[420px] flex-col justify-between bg-white px-8 py-8 md:px-12 md:py-12">
          <div>
            <Link href="/" aria-label="DARCi home" className="inline-flex">
              <Image
                src="/icons/navbar/darci_black.svg"
                alt="DARCi"
                width={91}
                height={20}
                className="h-5 w-auto"
                priority
              />
            </Link>

            <div className="mt-20 max-w-md md:mt-28">
              <h1 className="font-display text-4xl font-medium md:text-5xl">
                {headingIdn} verification
              </h1>
              <p className="mt-4 text-sm leading-6 text-Color-Neutral">
                DARCi notarizes digital documents and preserves tamper-evident proof with identity checks, secure seals, and public verification.
              </p>
              <Link
                className="mt-8 inline-flex bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95"
                href="/start"
              >
                Sign up
              </Link>
            </div>
          </div>

          <div className="mt-10 text-xs leading-5 text-Color-Neutral">
            <div>{payload?.idn ?? idn}</div>
            <div>© 2024 DARCi</div>
          </div>
        </section>

        <section className="flex min-h-screen flex-col justify-center bg-Color-Neutral-Lightest px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-5xl">
            {errorMessage ? (
              <div className={`flex ${previewPanelHeightClass} items-center justify-center rounded-[20px] bg-white px-6 text-center text-sm leading-6 text-red-700 shadow-[inset_0_0_0_1px_rgba(185,28,28,0.18)]`}>
                {errorMessage}
              </div>
            ) : selectedDocument?.downloadUrl ? (
              <object
                className={`${previewPanelHeightClass} w-full rounded-[20px] bg-[#f3f6f8] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]`}
                data={selectedDocument.downloadUrl}
                type="application/pdf"
              >
                <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-Color-Neutral">
                  <a
                    className="rounded-lg border border-Color-Scheme-1-Border/40 bg-white px-4 py-3 text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest"
                    href={selectedDocument.downloadUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open PDF in a new tab
                  </a>
                </div>
              </object>
            ) : (
              <div className={`flex ${previewPanelHeightClass} items-center justify-center rounded-[20px] bg-white px-6 text-center text-sm leading-6 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]`}>
                {isLoading ? "Loading verification." : "The verified PDF is not available yet."}
              </div>
            )}

            {documents.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
                {documents.map((document, index) => {
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
          </div>
        </section>
      </div>
    </main>
  );
}