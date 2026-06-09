"use client";

import { useEffect } from "react";
import { captureDomainException } from "@/lib/clientTelemetry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureDomainException(error, {
      level: "fatal",
      operation: "web.global_error_boundary",
      errorCode: "WEB_GLOBAL_ERROR_BOUNDARY",
      errorFamily: "internal",
      tags: {
        feature: "global_error_boundary",
      },
      contexts: {
        global_error: {
          digest: error.digest,
        },
      },
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center text-Color-Scheme-1-Text">
          <div className="max-w-sm space-y-4">
            <h1 className="text-2xl font-semibold">Something went wrong.</h1>
            <p className="text-sm text-Color-Neutral">
              The issue has been logged. Try again once more.
            </p>
            <button
              className="inline-flex items-center justify-center border border-Color-Scheme-1-Border bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-Color-Scheme-1-Text"
              onClick={reset}
              type="button"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}