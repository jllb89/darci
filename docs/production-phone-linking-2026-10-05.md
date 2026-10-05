# Production phone and email verification repair

The October 5 web SMS failure occurred before carrier handoff. Supabase rejected
the request because production signup is disabled and the number existed only as
an application profile contact, not as a verified Auth phone. Existing verified
phone logins were unaffected. The web client also handled the existing email
step-up response in its email branch rather than its phone branch.

## Repaired flow

1. Existing Auth phone numbers keep their current Supabase OTP login.
2. When Supabase explicitly rejects an unregistered phone because signup is
   disabled, the API sends an eight-digit ownership challenge through the existing
   AWS SMS integration. This does not create a phone-only Auth account.
3. After SMS verification, web and iOS ask for the existing account email.
4. An eligible existing account receives a second code through the tracked Resend
   integration. The API checks that email proof belongs to the intended Auth user.
5. Only after both proofs succeed does the API confirm the phone on that same
   account and return its session. Documents, memberships and signatures are not
   transferred or rewritten.

Production signup remains closed. Unknown emails, inactive accounts, a different
existing Auth phone, and contacts owned by different accounts are not automatically
merged. Legacy phone-only identities retain their existing email step-up login;
this repair does not delete or migrate those identities.

## Security and operations

- The fallback SMS challenge expires after three minutes. Existing Supabase OTP
  expiration settings are unchanged by this release.
- Redis stores keyed OTP digests and short-lived phone proofs; proofs are kept
  only in client memory, never localStorage, Keychain or URLs.
- SMS has a 60-second resend cooldown, five-send hourly destination limit and
  five verification attempts. Email linking has equivalent resend limits and
  five verification attempts. The phone proof expires after ten minutes.
- Atomic Redis operations prevent concurrent code reuse, changing the bound
  email/account, and proof replay. Account updates are serialized.
- Storage/provider failures fail closed. Ambiguous SMS handoffs are not retried.
  Existing message-ID and hashed-destination correlation remains available.
- Existing origin, request-signature, CSRF, IP/rate-limit and account-status checks
  still apply. No database migration or new infrastructure is required.

## Verification

Local release checks passed: **902 backend tests, 120 web tests, 135 iOS unit
tests, and 23 workflow/bootstrap tests**. Backend and production web builds
passed. Web lint has no errors and two pre-existing warnings in unrelated pages.

Backend, web and iOS regressions cover normal login, the legacy email step-up,
the new email-entry step, canceled linking, and proof-bearing email verification.
Real disposable Redis tests cover expiry, replay, concurrent attempts, attempt
caps, destination limits, lock release and outages.

`backend/scripts/test-phone-link-local.mjs` additionally exercises genuine local
Supabase Auth and PostgREST. SMS and Resend transport are intercepted, all
recipients are synthetic, and unexpected outbound destinations are rejected. It
checks the unchanged Auth/app account IDs, verified phone persistence, valid
returned session, wrong-code rejection and replay rejection. The test runs in the
existing disposable database CI job. Local backend tests now require
`redis-server`, which CI installs alongside its other test tools.

## Release and device acceptance

The API and web changes require deployment. iOS requires a new TestFlight build
for the new phone-to-email entry screen; an already-installed binary does not
receive that UI through a server deployment.

After release, an affected tester should request a fresh SMS from the production
web login, verify it, enter the existing account email, verify that code, and
confirm that the existing membership and documents remain visible. Then sign out
and confirm that the linked phone can log in normally. Repeat in the new iOS
build. Do not paste codes into support chats. Local provider tests do not establish
actual production carrier or inbox receipt.
