import React from "react";

export type PublicVerificationDocument = {id: string; fileName: string; label: string; isFinal: boolean; downloadUrl: string};
export type PublicVerificationPayload = { idn: string; hash: string | null; status: "verified" | "unverified"; documents?: PublicVerificationDocument[] };

// Only verified final PDFs from this environment's Storage origin are previewable.
export function parsePublicVerification(value: unknown): PublicVerificationPayload | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.idn !== "string" || !input.idn.trim() || !["verified", "unverified"].includes(String(input.status))) return null;
  const documents: PublicVerificationDocument[] = [];
  if (input.status === "verified" && typeof input.hash === "string" && /^[a-f0-9]{64}$/i.test(input.hash) && Array.isArray(input.documents)) {
    for (const document of input.documents) {
      if (!document || typeof document !== "object" || document.isFinal !== true || typeof document.id !== "string"
        || typeof document.fileName !== "string" || typeof document.label !== "string" || typeof document.downloadUrl !== "string") continue;
      try {
        const url = new URL(document.downloadUrl);
        const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
        if (url.protocol !== "https:" || url.origin !== storage.origin || !url.pathname.startsWith("/storage/v1/object/sign/")) continue;
        documents.push({id:document.id,fileName:document.fileName,label:document.label,isFinal:true,downloadUrl:url.toString()});
      } catch { /* Reject malformed/untrusted links rather than embedding them. */ }
    }
  }
  return { idn: input.idn,
    ...(documents.length ? {documents} : {}),
    hash: typeof input.hash === "string" && /^[a-f0-9]{64}$/i.test(input.hash) ? input.hash : null,
    status: input.status as PublicVerificationPayload["status"] };
}

export function PublicVerificationSummary({ payload, idn, isLoading, errorMessage }: {
  payload: PublicVerificationPayload | null; idn: string; isLoading: boolean; errorMessage: string | null;
}) {
  const verified = payload?.status === "verified" && Boolean(payload.hash);
  return (
    <div className="mx-auto w-full max-w-xl" aria-live="polite" aria-busy={isLoading}>
      <p className="text-sm text-Color-Neutral">Verification record</p>
      <p className="mt-3 break-all font-display text-2xl font-normal">{payload?.idn ?? idn}</p>
      <div className="my-8 border-t border-black/15" />
      {isLoading ? <p>Checking verification…</p> : errorMessage ? (
        <p role="alert" className="text-sm leading-6 text-red-700">{errorMessage}</p>
      ) : payload ? (
        <>
          <span className={`inline-flex px-3 py-2 text-sm ${verified ? "bg-Green text-black" : "bg-white text-Color-Neutral-Darkest"}`}>
            {verified ? "Hash verified" : "Not verified"}
          </span>
          <p className="mt-5 text-sm leading-6 text-Color-Neutral">
            {verified ? "The stored final package passed DARCi’s file-integrity checks. Its SHA-256 fingerprint is shown below."
              : "DARCi cannot currently confirm this package’s integrity. Do not rely on this page as proof of verification."}
          </p>
          {verified ? <dl className="mt-8">
            <dt className="text-xs text-Color-Neutral">SHA-256 fingerprint</dt>
            <dd className="mt-3 break-all font-mono text-sm leading-6">{payload.hash}</dd>
          </dl> : null}
          <p className="mt-8 text-xs leading-5 text-Color-Neutral">
            This confirms recorded file integrity, not the accuracy of the document’s contents. No external-ledger verification is claimed.
          </p>
        </>
      ) : <p className="text-sm">No verification record available.</p>}
    </div>
  );
}
