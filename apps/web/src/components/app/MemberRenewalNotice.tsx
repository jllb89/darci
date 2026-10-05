"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getMemberRenewalNotice, type MemberRenewalNotice as Notice } from "@/lib/memberBilling";

export default function MemberRenewalNotice({ accessToken, userId }: { accessToken: string; userId: string }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    let active = true, loading = false;
    const refresh = async () => {
      if (loading || document.visibilityState === "hidden") return;
      loading = true;
      try {
        const { notice: next } = await getMemberRenewalNotice(accessToken);
        let seen = false;
        if (next) {
          const key = `darci.renewalNotice.${userId}.${next.id}`;
          try { seen = localStorage.getItem(key) === "dismissed"; } catch { /* Memory fallback below. */ }
          seen ||= dismissed.current.has(key);
        }
        if (active) setNotice(next && !seen && Date.parse(next.chargeAt) > Date.now() ? next : null);
      } catch {
        // A reminder read must never block access or invent an amount/date.
        if (active) setNotice(null);
      } finally { loading = false; }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 5 * 60_000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [accessToken, userId]);
  useEffect(() => {
    if (notice) dialog.current?.showModal();
    else dialog.current?.close();
  }, [notice]);
  const dismiss = () => {
    if (notice) {
      const key = `darci.renewalNotice.${userId}.${notice.id}`;
      dismissed.current.add(key);
      try { localStorage.setItem(key, "dismissed"); } catch { /* Memory fallback. */ }
    }
    setNotice(null);
  };
  return <dialog ref={dialog} aria-labelledby="renewal-notice-title" aria-describedby="renewal-notice-message"
    onCancel={dismiss} className="m-auto w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl bg-black p-7 text-white backdrop:bg-black/50">
    {notice && <>
      <h2 id="renewal-notice-title" className="text-2xl font-normal">{notice.title}</h2>
      <p id="renewal-notice-message" className="mt-4 text-base leading-relaxed text-white/80">{notice.message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/app/billing" onClick={dismiss} className="rounded-lg bg-[#0AFF4A] px-5 py-3 text-black">Review membership</Link>
        <button type="button" onClick={dismiss} className="rounded-lg border border-white/40 px-5 py-3">Got it</button>
      </div>
    </>}
  </dialog>;
}
