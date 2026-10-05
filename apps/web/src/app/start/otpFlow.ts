type Challenge = { kind: "email" | "phone"; value: string };
type StepUp = { method: "email"; identifier: string; otpLength?: number | null; cooldownSeconds?: number | null; message?: string };
type Continuation = { kind: "link-email"; token: string; message?: string } | { kind: "verify-email"; stepUp: StepUp };

export function otpVerifyRequest(challenge: Challenge, code: string, returnTo: string, phoneLinkToken: string | null) {
  return {
    path: challenge.kind === "phone" ? "/auth/otp/phone/verify" : phoneLinkToken ? "/auth/otp/phone/link/verify" : "/auth/otp/verify",
    body: { [challenge.kind]: challenge.value, token: code, returnTo, ...(challenge.kind === "email" && phoneLinkToken ? { phoneLinkToken } : {}) },
  };
}

// Apply continuations to BOTH phone and email responses, before requiring a
// session. A phone proof is not a session and must not reach session storage.
export function otpContinuation(payload: { phoneLink?: { token: string; message?: string }; stepUp?: StepUp } | null): Continuation | null {
  if (payload?.phoneLink) {
    if (!/^[a-f0-9]{64}$/.test(payload.phoneLink.token)) throw new Error("Phone verification could not be continued. Please start again.");
    return { kind: "link-email", ...payload.phoneLink };
  }
  if (payload?.stepUp) {
    const identifier = payload.stepUp.identifier.trim().toLowerCase();
    if (payload.stepUp.method !== "email" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) throw new Error("The linked account email could not be verified. Sign in with email instead.");
    return { kind: "verify-email", stepUp: { ...payload.stepUp, identifier } };
  }
  return null;
}
