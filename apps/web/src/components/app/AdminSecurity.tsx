"use client";

import { useState } from "react";
import { getStoredAuth, setStoredAuth } from "@/lib/auth";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

// Deliberately explicit: successful MFA never automatically replays a mutation.
export function AdminSecurity() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [setupKey, setSetupKey] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function clientWithSession() {
    const stored = getStoredAuth();
    if (!stored.accessToken || !stored.refreshToken) throw new Error("Sign in again before verifying administrator access.");
    const client = getSupabaseBrowserClient();
    const { data, error } = await client.auth.setSession({ access_token: stored.accessToken, refresh_token: stored.refreshToken });
    if (error || !data.session) throw new Error("Your session could not be verified. Sign in again.");
    setStoredAuth({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, user: stored.user });
    return client;
  }

  async function begin() {
    setBusy(true); setMessage(""); setCode(""); setSetupKey(null);
    try {
      const client = await clientWithSession();
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw new Error("Unable to load your authenticator factors. Please try again.");
      const verified = data.totp.find(factor => factor.status === "verified");
      if (verified) { setFactorId(verified.id); return; }
      // Reuse the in-memory enrollment instead of leaving another unverified
      // factor on every failed code submission. Never remove verified factors.
      const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `DARCi Admin ${Date.now()}` });
      if (enrolled.error) throw new Error("Unable to enroll an authenticator. Contact the operator if you have an unfinished enrollment.");
      setFactorId(enrolled.data.id); setSetupKey(enrolled.data.totp.secret);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verification is unavailable."); }
    finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true); setMessage("");
    try {
      const client = await clientWithSession();
      const result = await client.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) throw new Error("That code could not be verified. Try the current code from your authenticator.");
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) throw new Error("Verification succeeded but the session could not be updated. Sign in again.");
      const stored = getStoredAuth();
      setStoredAuth({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, user: stored.user });
      setCode(""); setSetupKey(null); setFactorId(null);
      setMessage("Authenticator verified. You can now retry your action; sensitive changes require a code verified within 15 minutes.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Verification failed."); }
    finally { setBusy(false); }
  }

  return <section aria-label="Admin security" className="space-y-3 border border-black/15 p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-medium">Admin security</h2><p className="text-Color-Neutral">Verify your authenticator before making administrative changes.</p></div>
      {!factorId && <button type="button" disabled={busy} onClick={() => void begin()} className="border border-black px-4 py-2 disabled:opacity-50">{busy ? "Loading…" : "Set up / verify authenticator"}</button>}
    </div>
    {factorId && <form onSubmit={verify} className="space-y-3">
      {setupKey && <label className="block space-y-1"><span>Add this setup key to your authenticator app. Keep it private.</span><input aria-label="Authenticator setup key" readOnly value={setupKey} className="block w-full max-w-md border p-2 font-mono" autoComplete="off" /></label>}
      <label className="block space-y-1"><span>Six-digit authenticator code</span><input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="block w-40 border p-2" /></label>
      <button disabled={busy || code.length !== 6} className="bg-black px-4 py-2 text-white disabled:opacity-50">{busy ? "Verifying…" : "Verify code"}</button>
    </form>}
    {message && <p role="status" className="max-w-2xl">{message}</p>}
  </section>;
}
