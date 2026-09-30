"use client";

import { useEffect, useState } from "react";

export default function MobileBillingReturnPage() {
  const [appLink, setAppLink] = useState<string | null>(null);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("billing");
    if (result !== "success" && result !== "canceled") return;
    const host = window.location.hostname;
    const scheme = host === "app.illuminotary.com" ? "darci-production"
      : ["app.staging.darciregistry.dev", "app.darciregistry.dev", "localhost"].includes(host) ? "darci-staging" : null;
    if (!scheme) return;
    const link = `${scheme}://billing-return?billing=${result}`;
    setAppLink(link);
    // Safari can retain HTTPS redirects in-browser instead of opening a universal
    // link. A user-tappable custom-scheme fallback is retained if auto-open is blocked.
    window.location.assign(link);
  }, []);
  return <main className="flex min-h-screen items-center justify-center bg-white px-6 text-black">
    <section className="max-w-md space-y-6">
      <h1 className="font-display text-3xl font-normal">Return to DARCi</h1>
      <p>Open the app to refresh your membership status. Payment confirmation is checked securely by DARCi.</p>
      {appLink && <a href={appLink} className="inline-block bg-Green px-6 py-4">Open DARCi app</a>}
      <p className="text-sm">If the app does not open, return to DARCi manually or update to the latest build.</p>
      <a href="/app/billing" className="block underline">Continue on the web</a>
    </section>
  </main>;
}
