"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useStoredUser } from "@/lib/auth";
import {
  profileErrorMessage, requestProfileContactChange, resendProfileContactCode,
  saveProfileName, syncProfileChange, verifyProfileContactCode,
  type ContactKind, type ProfileChange,
} from "@/lib/memberProfile";

const inputClass = "w-full min-w-0 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black disabled:opacity-60";
const buttonClass = "rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-40";

export function MemberProfileEditor() {
  const user = useStoredUser();
  const [editing, setEditing] = useState<"name" | ContactKind | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState<ProfileChange | null>(null);
  const [needsSync, setNeedsSync] = useState(false);
  const [code, setCode] = useState("");
  const [inbox, setInbox] = useState<"current" | "new">("new");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!pending || needsSync) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending, needsSync]);

  const startEditing = (field: "name" | ContactKind) => {
    setFirstName(user?.firstName ?? ""); setLastName(user?.lastName ?? "");
    setContact(field === "phone" ? user?.phone ?? "" : user?.email ?? "");
    setEditing(field); setPending(null); setNeedsSync(false); setCode("");
    setError(""); setMessage(""); setInbox("new");
  };
  const finishSync = async (change: ProfileChange) => {
    try {
      await syncProfileChange(change);
      setPending(null); setNeedsSync(false); setEditing(null); setCode("");
      setMessage("Your profile has been updated.");
    } catch {
      setPending(change); setNeedsSync(true);
      setError("Your change is confirmed, but we couldn’t refresh your profile. Retry the refresh—no new code is needed.");
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (pending && needsSync) await finishSync(pending);
      else if (pending) {
        const complete = await verifyProfileContactCode(pending, code, inbox);
        setCode("");
        if (complete) await finishSync(pending);
        else {
          setInbox(inbox === "new" ? "current" : "new");
          setMessage("Code accepted. Enter the separate code sent to your other email address to finish the change.");
        }
      } else if (editing === "name") {
        const change = await saveProfileName(firstName, lastName);
        await finishSync(change);
      } else if (editing) {
        const change = await requestProfileContactChange(editing, contact);
        setPending(change); setResendAt(Date.now() + 60000); setNow(Date.now());
        setMessage(editing === "phone" ? "Enter the code sent to your new phone number."
          : "Check your new email inbox. For security, you may also need the separate code sent to your current email address.");
      }
    } catch (err) { setError(profileErrorMessage(err)); }
    finally { setBusy(false); }
  };
  const resend = async () => {
    if (!pending || busy || now < resendAt) return;
    setBusy(true); setError("");
    try {
      await resendProfileContactCode(pending);
      setCode(""); setResendAt(Date.now() + 60000); setNow(Date.now());
      setMessage(pending.kind === "phone" ? "A new code was requested. Use the latest SMS code."
        : "New codes were requested. Use the latest code in each inbox.");
    } catch (err) { setError(profileErrorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 rounded-xl bg-Color-Neutral-Lightest/70 p-4 text-sm">
      {([
        ["name", "Name", [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Not provided"],
        ["email", "Email", user?.email || "Not provided"],
        ["phone", "Phone", user?.phone || "Not provided"],
      ] as const).map(([field, label, value]) => (
        <div key={field} className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0"><span className="text-Color-Neutral">{label}</span><div className="break-all">{value}</div></div>
          <button type="button" className="shrink-0 py-1 underline underline-offset-4 disabled:opacity-40"
            aria-label={`Edit ${label.toLowerCase()}`} disabled={!user || busy || editing !== null} onClick={() => startEditing(field)}>Edit</button>
        </div>
      ))}
      {editing && (
        <form onSubmit={submit} className="space-y-3 border-t border-black/10 pt-4" aria-label={`Edit ${editing}`}>
          {needsSync ? <p>Your change has been verified. Refresh your profile to display it here.</p>
            : pending ? <>
              <p className="break-all">Confirm your {pending.kind}: {pending.value}</p>
              {pending.kind === "email" && pending.currentEmail && <label className="block space-y-1">
                <span>Which inbox is this code from?</span>
                <select className={inputClass} value={inbox} disabled={busy} onChange={e => { setInbox(e.target.value as "current" | "new"); setCode(""); }}>
                  <option value="new">New email: {pending.value}</option><option value="current">Current email: {pending.currentEmail}</option>
                </select>
              </label>}
              <label className="block space-y-1"><span>Verification code</span>
                <input className={inputClass} autoFocus value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={8} required disabled={busy} />
              </label>
            </> : editing === "name" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1"><span>First name</span><input className={inputClass} value={firstName} onChange={e => setFirstName(e.target.value)} autoComplete="given-name" maxLength={120} required disabled={busy} autoFocus /></label>
                <label className="block space-y-1"><span>Last name</span><input className={inputClass} value={lastName} onChange={e => setLastName(e.target.value)} autoComplete="family-name" maxLength={120} required disabled={busy} /></label>
              </div>
            ) : <label className="block space-y-1">
              <span>New {editing === "phone" ? "phone number (with country code)" : "email address"}</span>
              <input className={inputClass} value={contact} onChange={e => setContact(e.target.value)}
                type={editing === "email" ? "email" : "tel"} autoComplete={editing === "email" ? "email" : "tel"}
                placeholder={editing === "phone" ? "+52 55 1234 5678" : "you@example.com"} maxLength={editing === "email" ? 254 : 40} required disabled={busy} autoFocus />
              <span className="block text-xs text-Color-Neutral">Your current contact stays active until verification is complete.</span>
            </label>}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className={buttonClass} disabled={busy || (!!pending && !needsSync && code.length < 6)}>
              {busy ? "Please wait…" : needsSync ? "Refresh profile" : pending ? "Verify code" : editing === "name" ? "Save name" : "Send verification code"}
            </button>
            {!needsSync && <button type="button" className="py-2 underline" disabled={busy} onClick={() => {
              setEditing(null); setPending(null); setError(""); setCode("");
              setMessage(pending ? "Verification closed. Unconfirmed changes won’t replace your current contact; any codes already sent may remain valid until they expire." : "");
            }}>{pending ? "Close verification" : "Cancel"}</button>}
            {pending && !needsSync && <button type="button" className="py-2 underline disabled:opacity-40" disabled={busy || now < resendAt} onClick={resend}>
              {now < resendAt ? `Resend in ${Math.ceil((resendAt - now) / 1000)}s` : "Resend code"}
            </button>}
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {message && <p role="status" className="text-Color-Neutral-Darkest">{message}</p>}
    </div>
  );
}
