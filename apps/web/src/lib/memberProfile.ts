"use client";

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getStoredAuth, setStoredAuth, syncStoredAuthFromSession } from "./auth";

export type ContactKind = "email" | "phone";
export type ProfileChange = {
  client: SupabaseClient;
  accountId: string;
  authUserId: string;
  kind?: ContactKind;
  value?: string;
  currentEmail: string;
};

export function normalizeProfileContact(kind: ContactKind, value: string) {
  const trimmed = value.trim();
  if (kind === "email") {
    if (trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      throw new Error("Enter a valid email address.");
    }
    return trimmed.toLowerCase();
  }
  const phone = trimmed.startsWith("+") ? parsePhoneNumberFromString(trimmed) : undefined;
  if (!phone?.isValid()) throw new Error("Enter a valid phone number including its country code, such as +52 or +1.");
  return phone.number;
}

export function profileErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (["email_exists", "phone_exists", "user_already_exists"].includes(code ?? "")) {
    return "That contact is already associated with another account. Use a different one.";
  }
  if (["over_email_send_rate_limit", "over_sms_send_rate_limit", "over_request_rate_limit"].includes(code ?? "")) {
    return "Please wait a minute before requesting another code.";
  }
  if (code === "otp_expired") return "That code is invalid or expired. Check the code or request a new one.";
  if (error instanceof Error && error.message) return error.message;
  return "We couldn’t update your profile. Please try again.";
}

function assertCurrentAccount(change: ProfileChange) {
  const stored = getStoredAuth();
  if (stored.user?.id !== change.accountId || !stored.accessToken) {
    throw new Error("Your account changed. Reload Settings before continuing.");
  }
  return stored;
}

function preserveSession(change: ProfileChange, session: Session) {
  if (session.user.id !== change.authUserId) throw new Error("The verification does not belong to this account.");
  const stored = assertCurrentAccount(change);
  setStoredAuth({ accessToken: session.access_token, refreshToken: session.refresh_token, user: stored.user });
}

async function authenticatedProfileChange(): Promise<ProfileChange> {
  const stored = getStoredAuth();
  if (!stored.accessToken || !stored.refreshToken || !stored.user) throw new Error("Please sign in again before editing your profile.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Profile verification is not configured. Please contact support.");
  // Do not use the OAuth client's persisted session: DARCi can have a newer session/active role.
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data, error } = await client.auth.setSession({ access_token: stored.accessToken, refresh_token: stored.refreshToken });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error("Please sign in again before editing your profile.");
  const change = { client, accountId: stored.user.id, authUserId: data.user.id, currentEmail: data.user.email ?? "" };
  preserveSession(change, data.session);
  return change;
}

// Retryable after a verified change: never ask users to re-enter an already consumed OTP.
export async function syncProfileChange(change: ProfileChange) {
  const stored = assertCurrentAccount(change);
  if (!stored.refreshToken) throw new Error("Please sign in again to refresh your updated profile.");
  const { data, error } = await change.client.auth.refreshSession({ refresh_token: stored.refreshToken });
  if (error) throw error;
  if (!data.session) throw new Error("Please sign in again to refresh your updated profile.");
  preserveSession(change, data.session);
  return syncStoredAuthFromSession({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, force: true, expectedUserId: change.accountId });
}

export async function saveProfileName(firstName: string, lastName: string) {
  const first = firstName.trim(), last = lastName.trim();
  if (!first || !last || first.length > 120 || last.length > 120) throw new Error("Enter your first and last name (up to 120 characters each).");
  const change = await authenticatedProfileChange();
  const { data, error } = await change.client.auth.updateUser({ data: { first_name: first, last_name: last } });
  if (error) throw error;
  if (data.user.id !== change.authUserId) throw new Error("The update does not belong to this account.");
  // Return the operation so the UI can retry backend synchronization without repeating the update.
  return change;
}

export async function requestProfileContactChange(kind: ContactKind, rawValue: string) {
  const value = normalizeProfileContact(kind, rawValue);
  const change = await authenticatedProfileChange();
  const { data: current, error: currentError } = await change.client.auth.getUser();
  if (currentError) throw currentError;
  if (current.user.id !== change.authUserId) throw new Error("The update does not belong to this account.");
  assertCurrentAccount(change);
  const existing = kind === "email" ? current.user.email?.toLowerCase() : current.user.phone?.replace(/^\+?/, "+");
  if (existing === value) throw new Error("Enter a different contact to make a change.");
  const { error } = await change.client.auth.updateUser({ [kind]: value });
  if (error) throw error;
  assertCurrentAccount(change);
  return { ...change, kind, value };
}

export async function resendProfileContactCode(change: ProfileChange) {
  assertCurrentAccount(change);
  if (!change.kind || !change.value) throw new Error("No contact change is pending.");
  const { error } = await change.client.auth.resend(change.kind === "email"
    ? { type: "email_change", email: change.value }
    : { type: "phone_change", phone: change.value });
  if (error) throw error;
}

export async function verifyProfileContactCode(change: ProfileChange, token: string, emailInbox: "current" | "new" = "new") {
  assertCurrentAccount(change);
  if (!change.kind || !change.value) throw new Error("No contact change is pending.");
  if (!/^\d{6,8}$/.test(token)) throw new Error("Enter the complete 6–8 digit verification code.");
  const { data, error } = await change.client.auth.verifyOtp(change.kind === "phone"
    ? { type: "phone_change", phone: change.value, token }
    : { type: "email_change", email: emailInbox === "current" ? change.currentEmail : change.value, token });
  if (error) throw error;
  if (!data.session) {
    if (change.kind === "email") return false; // Secure email change needs confirmation from both inboxes.
    throw new Error("Phone verification did not return a session. Please sign in again to check your profile.");
  }
  if (data.session.user.id !== change.authUserId) throw new Error("The verification does not belong to this account.");
  const contact = change.kind === "email" ? data.session.user.email?.toLowerCase() : data.session.user.phone?.replace(/^\+?/, "+");
  if (contact !== change.value) throw new Error("The confirmed contact does not match the requested change.");
  preserveSession(change, data.session);
  return true;
}
