# Reviewer sign-in, OTP and address-lookup acceptance

Prepared October 15, 2026. This release is for TestFlight acceptance only.
Do not submit to App Review until Jorge explicitly approves the exact build.

## Reviewed fixes

- Native OTP entry preserves leading zeros and existing digits when the last
  digits are typed, a box is retapped, or excess digits are entered. Complete
  paste/AutoFill replaces the partial code atomically. Six/eight-digit challenges
  use the server-provided length. One blue Done button dismisses the keyboard.
- The restricted reviewer may call only the read-only CA/OH address autocomplete
  and details POST endpoints. Unrelated rule writes, purchases, client records
  and real notarization remain blocked. This requires a backend deployment.
- Reviewer provisioning derives its 30-day allowance boundaries from one clock
  reading. The separately approved production fixture correction moved only its
  start forward eight milliseconds; expiry, allowance, usage and documents were
  preserved. No schema migration is needed.

## Completed checks

- 147 native unit tests passed, including five OTP editing/coordinator tests.
- Three focused simulator UI tests passed: OTP retyping/backspace/overflow,
  full-width login with one keyboard dismissal button, and no-charge reviewer
  POA entry without a subscription prompt.
- 54 backend tests passed across reviewer access/isolation, address fallback,
  billing policy and creation enforcement.
- Three provisioning-window tests passed, including the single-clock regression.
- 41 isolated database assertions passed and rolled back: the eight-millisecond
  failure, exact correction, ownership, allowed transitions, idempotency,
  allowance limits, expiry and direct-API isolation.
- The existing production allowance RPC passed a non-mutating window check using
  a nonexistent document; no document, signature, usage or charge was created.
- Real production reviewer login succeeded in the signed production-configured
  Simulator and survived termination/relaunch.
- The earlier Simulator-only login failure was caused by launching an unsigned
  build without Keychain identity entitlements. Rebuilding with ad-hoc Simulator
  signing fixed it; no authentication/storage bypass was added to app code.

Native evidence: `/private/tmp/darci-review-final-unit.xcresult` and
`/private/tmp/darci-review-otp-address-signing-v2.xcresult`.
Private production evidence remains under ignored `.recovery-private/`.

## Physical-device acceptance after production deployment

1. Install the new production TestFlight build. Sign in using the existing
   privately supplied reviewer email/code; preserve both leading zeros.
2. Type all digits slowly, retap the boxes, backspace/retype the last digit and
   paste the complete code. Confirm earlier digits are never lost. Check the
   single blue Done button hides the keyboard.
3. Confirm no paid subscription is required for this restricted account. Verify
   its temporary TEST allowance appears rather than a Checkout prompt.
4. Use fictional TEST details for CA and OH address search, select a suggestion
   and inspect the populated address. Manual address entry must still work.
5. Reopen the existing generated TEST POA, review every page and complete its
   permitted member signing step. Confirm no membership-period error occurs.
6. Reopen Documents and the generated PDFs, then close/reopen the app and confirm
   the session and document remain available.
7. Open Terms and Privacy; confirm the approved text is present and the old legal
   review-only placeholder wording is absent.

Do not purchase a plan, use client documents, submit real notarial completion or
delete the persistent reviewer account. Its notary queue is deliberately empty;
the supplied in-person-session video remains the notary demonstration.

Actual SMS/email delivery, device AutoFill, signing and address completion on the
new physical-device build require Jorge's confirmation; unit/mock UI coverage is
not a substitute for those acceptance steps. This checklist does not approve an
App Review submission.
