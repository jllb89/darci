# First-attempt signing / notary authorization failure

## Evidence

- Reported in staging, TestFlight `0.1.0 (20)` on September 23, 2026.
- Shared Sentry issue: https://darci.sentry.io/share/issue/5152a36d89f44bd9aeae05b652488e19/
- iOS event `ios.auth.document_request.server_failed` has HTTP 503 and request ID `62DC84DA-4EC4-43A7-9E04-6DDA8EC112ED`.
- Staging API CloudWatch recorded an auth critical signal with that exact ID at `2026-09-23T18:45:33.689Z`, then another at `18:46:06.464Z` with ID `CF43516B-D59B-4FC0-8F8A-CF27AC6FFC10`. The related iOS trace includes notary-submission HTTP 503 failures.
- The displayed message is the backend `identity_unavailable` response, issued before the downstream controller executes. The catch covers session liveness, app identity and role reads; it is not a PDF preview or signature-rendering error.
- Previous code imposed a 2.5-second session-liveness timeout with no retry, discarded the provider failure details, and labeled all such failures `identity_lookup`. Existing CloudWatch records retain only the auth category and correlation ID. These records do **not** establish whether the incident was a timeout, network interruption, pool exhaustion or another provider failure.
- Eight subsequent read-only liveness probes against nonexistent synthetic IDs returned false successfully (189–546 ms). No real session, document or account was modified. Healthy probes do not reproduce the earlier intermittent incident.

## Local remediation

- Session, identity and role dependency reads may retry **once**, only for classified transient transport/timeout, capacity or gateway errors. Each attempt has its own 2.5-second abort deadline; retry spacing is 100 ms.
- Only the read queries are retried. No signing, review approval, invitation, notary submission or other mutation is replayed.
- No positive authorization cache or permissive fallback was added. A revoked session, suspended account or revoked role remains denied. Persistent dependency failures remain HTTP 503; permission/schema failures are not repeatedly retried.
- Preserve existing optional-column compatibility handling within the identity read.
- Add sanitized operation, failure classification, attempts, elapsed time and provider status to existing Sentry reporting, and a structured CloudWatch diagnostic correlated with the request ID. No tokens, provider messages, emails, phone numbers or query details are included. Recovered transient reads emit informational logs, not critical alerts.
- No schema migration, runtime secret, infrastructure change or iOS code change is required.

## Validation and release boundary

- Local backend typecheck passes.
- Full backend suite passes: 790 tests across 107 files. This includes real middleware + dependency-reader tests with simulated transient failures: controller called once after recovery, zero calls on persistent failure, and no resurrection of revoked sessions or roles.
- This is tested resilience remediation plus better diagnostics, **not** a claim that the precise historical provider fault has been proved or that the deployed incident is closed.
- Pending: deploy the backend through the normal workflow, then test the first tap on Continue to sign and Send to selected notary in the existing TestFlight build. Check `auth_dependency_recovered` / `auth_dependency_failed` logs if it recurs. Do not disable authorization or add blanket mobile POST retries.
- No deployment, commit or push was performed in this pass.

## Separate observation

The supplied iOS Sentry event also reports missing app debug symbols. That limits native stack symbolication but does not explain the backend 503. Symbol upload should be handled separately; no release workflow changes were made for this incident.
