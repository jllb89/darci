# Production Resend configuration and acceptance — 23 September 2026

## Result

**Production email infrastructure and operator delivery acceptance passed. Jorge confirmed inbox receipt.** This is not approval to send client messages, open signup, activate payments or expose application routes publicly.

- Sender: `DARCi <notifications@notify.illuminotary.com>`.
- Support/Reply-To: `lopezb.jl@gmail.com`.
- Jorge verified the sending-domain DNS and supplied a dedicated restricted sending key plus a separate production webhook signing secret through ignored `.env.production`.
- The credentials were merged into a new pinned `/darci/production/app` secret version, preserving all existing values. Neither credentials nor key fingerprints are in this document.
- The API and worker received the production sender/Reply-To configuration. `RESEND_FAILURE_MODE=strict`; the notification outbox runner and payment activation remain **false**.
- CloudFormation reached **UPDATE_COMPLETE** at 18:15 UTC. Temporary listener/security-group permissions were removed. Application image digests remain those from accepted release `442baee`; this was a configuration-only deployment.
- Final readback at **18:17:12 UTC** matched the reviewed template and exact accepted image digests: API revision **6** (2 healthy), worker revision **5** (1 healthy), web revision **4** (2 healthy). Zero pending tasks, completed deployments, API/web HTTP **200**, and all **ten** production alarms **OK** with actions enabled.

## Public callback boundary

HTTPS 443 now accepts connections needed by Resend, with exactly one public forward rule: **POST `api.illuminotary.com/webhooks/resend`**. The rule requires the exact host, path and method. The app/API host rules still require Jorge's operator IP; default HTTPS behavior is **403**. HTTP port 80 remains operator-IP-only.

The backend validates the raw-body signature using the distinct production signing secret and timestamp. No Stripe/Supabase callback or other API path was made public. This does not constitute WAF/rate-limit/load acceptance; broader edge-abuse controls remain a production-roadmap item.

## Actual acceptance evidence

An approved short-lived ECS task used the **deployed API image and injected production configuration**, from outside the operator IP allowlist. It did not start the general notification runner.

1. Public requests to the app root, API readiness, auth OTP endpoint, callback GET and a callback subpath returned **403**, even with a spoofed operator `X-Forwarded-For` header.
2. An unsigned callback POST returned **400**. Invalid and expired signatures also returned **400**.
3. One labeled test email was sent only to Jorge. Provider message ID: `01a0cf7b-51dd-748b-b195-09a41e099a81`.
4. Real Resend **sent** and **delivered** signed callbacks reached production and were persisted against the isolated test delivery.
5. A synthetic, newly signed replay using the same delivered-event ID returned **200**, retained exactly **one** event row for that ID and preserved `delivered` status. This was a logical-event replay test, not a provider-dashboard replay or a second send.
6. Jorge explicitly confirmed receipt of **[DARCi TEST] Production email delivery verification**.
7. The acceptance task exited **0** and stopped. No clients were messaged; no PDFs, signatures, billing records, user accounts or legal acts were modified.

Retained synthetic records: notification job `53641811-64f3-4bcb-b17f-7dcaf911fdd9`, delivery `5d1c9e9c-cbed-40e8-91fd-bbf7698157ed`. They are explicitly labeled production acceptance evidence; they are not client jobs.

Private deployment evidence: `.recovery-private/production-email-xbTinz`.
Private delivery evidence: `.recovery-private/production-email-acceptance-0ykywl`.
These directories and `.env.production` are Git-ignored. Do not distribute operational artifacts or secrets.

## Local verification and handoff

- **73** production infrastructure tests passed, including three new email-overlay checks for exact callback routing, private application boundaries, pinned credentials/images, closed payment/runner gates and repeatable configuration.
- **7** webhook integration tests passed with Node 24 (matching CI). Initial local attempts were blocked by sandbox listener permissions and then the shell's Node 20 runtime; rerunning with Node 24 and local-test networking passed without application changes.
- New operator tooling: `infra/production/email-setup.mjs`, `deploy-email.mjs`, `email-acceptance.cjs`, `run-email-acceptance.mjs` and overlay tests. These files/docs remain local until committed; the AWS configuration itself is already deployed.
- Normal GitHub image releases preserve the current deployed template and non-image parameters, including this email overlay. Original bootstrap deployment intentionally refuses provider-bearing secrets.

## Still deliberately closed / outside this acceptance

Client messaging and signup, general notification-runner activation, actual client invitation/OTP/recovery end-to-end acceptance, SMS/APNs/Maps, live Stripe merchant/catalog/webhooks/taxes, selected tester IPs and the broader launch gates remain separate. Domain verification and successful operator delivery do not close those items. Before enabling the runner, inspect queued jobs and approve the intended cohort; do not indiscriminately drain old work.

References: [Resend signed webhook setup](https://resend.com/docs/api-reference/webhooks/create-webhook), [email sender/Reply-To API](https://resend.com/docs/api-reference/emails/send-email).
