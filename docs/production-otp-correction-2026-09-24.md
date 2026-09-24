# Production OTP length correction — 24 September 2026

## Cause and scope

Jorge's production build 22 screenshots showed six-digit codes delivered by both
email and SMS, while the native login screen showed eight boxes. No message/code
values are retained in this record.

Read-only Supabase management inspection confirmed:

| Setting | Staging (unchanged) | Production before | Production after |
| --- | --- | --- | --- |
| `mailer_otp_length` | 8 | 6 | 8 |
| `sms_otp_length` | 8 | 6 | 8 |

The production project retained six-digit provider settings. The deployed SMS
endpoint advertises eight digits, native validation uses the advertised challenge
length, and the native UI draws eight boxes. Email's custom send normally reports
its actual generated length, but its fixed native presentation still showed eight;
fallback responses also use the client's default. This was a provider/app contract
mismatch, not SMS/email transport truncating the code.

## Applied fix

At **17:04:40 UTC / 11:04:40 Mexico City**, changed only those two settings in
production project `jdrgluisxhgegdsesman` using the
[Supabase auth configuration API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).
Full before/after comparison found **zero unrelated setting changes**. Signup
remains disabled. Staging, MFA, expiration/rate limits, delivery hooks, SMTP,
sessions, AWS, payment controls and existing documents were not changed.

Sanitized readback evidence:
`.recovery-private/production-otp-alignment-a10kFi/report.json`.
No codes/messages were generated or sent by this repair.

## Prevention and tests

- Production auth provisioning now explicitly sets both lengths to eight.
- `infra/production/auth-otp-policy.mjs` declares and validates that contract.
- `node infra/production/align-auth-otp.mjs --check` verifies production read-only;
  `--apply` is a guarded/idempotent repair, restricted to those two fields and a
  private-production baseline. It rejects unexpected unrelated readback changes.
- Four new policy regression tests and the full production infrastructure suite:
  **97 tests passed**, zero failures. Whitespace validation passed.
- Local prevention changes still need committing; the actual Supabase correction
  is already live and requires no new TestFlight build or AWS deployment.

## Device confirmation still required

Use existing production build **22**. Return to login, request one fresh email or
SMS code, and verify the newly issued eight-digit code. Respect the normal resend
cooldown; older six-digit messages do not change. Complete both channel checks
without pasting codes into chat. Actual device verification is not claimed yet.
