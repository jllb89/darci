"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMemberMembershipDenialCopyForStatus } from "@/lib/billingPolicy";
import { getMemberMembership, type MemberMembershipPayload } from "@/lib/memberBilling";

export function MemberMembershipPrompt({ accessToken }: { accessToken: string }) {
  const [payload, setPayload] = useState<MemberMembershipPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void getMemberMembership(accessToken).then(result => {
      if (!cancelled) { setPayload(result); setFailed(false); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [accessToken]);

  const copy = payload ? getMemberMembershipDenialCopyForStatus(payload.eligibility) : null;
  // Keep billing discoverable even while checking, or if the status request fails.
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 border-y border-Color-Scheme-1-Border py-4 text-sm">
      <div>
        <div className="font-medium">{copy?.title ?? (failed ? "We couldn’t check your membership" : "DARCi membership")}</div>
        <p className="mt-1 max-w-2xl text-Color-Neutral">{copy?.body ?? (failed ? "Open membership to retry and check your access before creating a document." : "View your document allowance and manage your membership.")}</p>
      </div>
      <Link className="platform-btn-primary shrink-0 px-4 py-2" href="/app/billing">
        {copy?.actionLabel ?? "View membership"}
      </Link>
    </section>
  );
}
