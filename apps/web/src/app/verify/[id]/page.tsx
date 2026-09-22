"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicVerificationSummary, parsePublicVerification } from "./verificationSummary";
import type { PublicVerificationPayload } from "./verificationSummary";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:4000";

export default function PublicVerifyPage() {
  const params = useParams<{ id: string }>();
  const idn = typeof params?.id === "string" ? params.id : "";
  const [payload, setPayload] = useState<PublicVerificationPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setIsLoading(true);
      setPayload(null);
      setErrorMessage(null);
      try {
        if (!idn) throw new Error("Verification record not found.");
        const response = await fetch(`${apiBaseUrl}/verify/${encodeURIComponent(idn)}`, {
          cache: "no-store", credentials: "omit", signal: controller.signal,
        });
        if (!response.ok) throw new Error(response.status === 404
          ? "Verification record not found or not publicly available."
          : "Verification is temporarily unavailable. Please try again later.");
        const next = parsePublicVerification(await response.json());
        if (!next || next.idn !== idn.trim()) throw new Error("Verification record not found.");
        if (!controller.signal.aborted) setPayload(next);
      } catch (error) {
        if (!controller.signal.aborted) setErrorMessage(error instanceof Error ? error.message : "Verification is unavailable.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [idn]);

  return (
    <main className="min-h-screen bg-white text-Color-Scheme-1-Text">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
        <section className="flex flex-col justify-between px-8 py-8 md:px-12 md:py-12">
          <div>
            <Link href="/" aria-label="DARCi home" className="inline-flex">
              <Image src="/icons/navbar/darci_black.svg" alt="DARCi" width={91} height={20} className="h-5 w-auto" priority />
            </Link>
            <div className="my-16 max-w-md md:my-28">
              <h1 className="font-display text-3xl font-normal md:text-4xl">Document verification</h1>
              <p className="mt-4 text-sm leading-6 text-Color-Neutral">
                Check the recorded integrity of a DARCi digital original without exposing its contents.
              </p>
              <Link className="mt-8 inline-flex bg-Green px-5 py-3 text-sm text-Color-Neutral-Darkest transition hover:brightness-95" href="/app">
                Sign in to DARCi
              </Link>
              <p className="mt-4 text-sm leading-6 text-Color-Neutral">
                Document previews and downloads are available only inside your account, when you have permission to access the document.
              </p>
            </div>
          </div>
          <p className="text-xs text-Color-Neutral">DARCi · Public verification</p>
        </section>
        <section className="flex flex-col justify-center bg-Color-Neutral-Lightest px-8 py-12 md:px-12">
          <PublicVerificationSummary payload={payload} idn={idn} isLoading={isLoading} errorMessage={errorMessage} />
        </section>
      </div>
    </main>
  );
}
