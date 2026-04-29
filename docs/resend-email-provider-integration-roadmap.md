# Resend Email Provider Integration Roadmap

Last updated: 2026-04-29

## Objective

Move DARCI notification delivery from the internal adapter to production-grade email delivery using Resend, while preserving the current outbox architecture, idempotency, dedupe, retries, and observability.

## Current Status Summary

1. Phase 0 scope lock is complete.
2. Phase 1 domain verification is complete for `darciregistry.com`.
3. Phase 2 adapter runtime is complete.
4. Phase 3 webhook ingestion is complete.
5. Phase 4 template rendering is complete through DB-backed server rendering and admin preview.
6. Phase 5 observability and contract completion is materially complete.
7. Phase 6 test coverage is complete.
8. Phase 7 rollout controls and Phase 8 incident/runbook coverage are complete.
9. Remaining work is operational rollout: keep staging stable, then run the production canary under the documented controls.

## Scope

1. Covers notification outbox email delivery runtime.
2. Covers webhook-driven delivery lifecycle updates.
3. Covers invite and non-invite email families.
4. Covers admin template-management and preview support for future ops UI work.
5. Does not replace SMS providers.
6. Does not change invite business logic, signer orchestration logic, or claim semantics.

## Phase 0: Scope Lock

Duration: 0.5 day

Execution artifact:

1. docs/resend-phase-0-scope-lock.md

Tasks:

1. Confirm all email notification families will route through Resend.
2. Confirm environment strategy.
3. Confirm local dev fallback behavior.
4. Confirm staging sending-domain strategy.
5. Confirm production sending-domain strategy.
6. Confirm sender identities by email family.

Exit criteria:

1. Environment and sender matrix is approved.
2. Rollout ownership and escalation owners are named.

Current status:

1. Complete.
2. Domain and sender matrix are locked in `docs/resend-phase-0-scope-lock.md`.

## Phase 1: Domain and Deliverability Setup

Duration: 0.5 to 1 day

Tasks:

1. Verify domain in Resend.
2. Configure SPF, DKIM, and DMARC.
3. Configure environment-specific domains or subdomains as needed.
4. Run inbox seed tests for Gmail, Outlook, and Apple Mail.
5. Define initial volume warm-up plan for production.

Exit criteria:

1. Resend domain status is verified.
2. DNS checks pass.
3. Initial inbox placement is acceptable.

Current status:

1. `darciregistry.com` is verified in Resend.
2. Staging and production currently share the same verified domain for cost reasons.
3. SPF, DKIM, and DMARC still need owner-side DNS confirmation as an operational step before production ramp.

## Phase 2: Backend Resend Adapter Runtime

Duration: 1 day

Primary files:

1. backend/src/services/notificationOutboxService.ts
2. backend/src/services/notificationTemplateRenderService.ts
3. backend/src/services/notificationService.ts

Tasks:

1. Implement `resend` adapter in provider adapter layer.
2. Add environment-driven provider selection with safe fallback.
3. Keep `internal` for local or disabled provider mode.
4. Use `resend` when explicitly enabled.
5. Map outbox payload to Resend send API.
6. Persist provider message id in notification delivery row.
7. Preserve current retry and job-status derivation behavior.

Exit criteria:

1. Outbox can send through Resend in staging mode.
2. Provider message ids are persisted.
3. Existing outbox state machine behavior remains unchanged.

Current status:

1. Complete.
2. `NOTIFICATION_PROVIDER=resend` now routes email deliveries through Resend.
3. Provider message ids are persisted on `notification_deliveries.provider_message_id`.
4. Runtime rendering now comes from `notification_templates` in the database rather than hardcoded service copy.

## Phase 3: Webhook Ingestion and Event Mapping

Duration: 1 day

Primary files:

1. backend/src/controllers/notificationWebhookController.ts
2. backend/src/routes/webhooks.ts
3. backend/src/services/notificationOutboxService.ts
4. backend/src/index.ts

Tasks:

1. Add webhook endpoint for Resend delivery events.
2. Validate webhook signature and reject unsigned or invalid payloads.
3. Map Resend events to canonical outbound events.
4. Patch delivery statuses based on mapped events.
5. Recompute and patch notification job status from delivery states.
6. Enforce event idempotency using provider event id while preserving provider message id.

Exit criteria:

1. Webhooks are authenticated and idempotent.
2. Delivery rows reflect provider lifecycle events.
3. Job status tracks true aggregate delivery state.

Current status:

1. Complete.
2. `POST /webhooks/resend` is mounted before auth and before JSON parsing so raw-body signature verification works.
3. Resend Svix signatures are verified with `RESEND_WEBHOOK_SECRET`.
4. Webhook events resolve deliveries by tagged `delivery_id` first and by `provider_message_id` fallback second.

## Phase 4: Template and Payload Hardening

Duration: 1 day

Primary files:

1. backend/src/services/notificationTemplateRenderService.ts
2. backend/src/services/notificationTemplateAdminService.ts
3. backend/src/controllers/notificationTemplateAdminController.ts
4. backend/src/services/notificationService.ts

Tasks:

1. Ensure required template variables are validated before send.
2. Ensure html and text fallback behavior is explicit.
3. Harden payload validation with clear error codes.
4. Validate invite, notary, and status email template rendering.

Exit criteria:

1. No critical template fails rendering at runtime.
2. Variable-missing failures are explicit and observable.

Current status:

1. Complete for server-side rendering and operator preview.
2. Notification copy is no longer hardcoded in services.
3. `POST /admin/notification-templates/{id}/preview` uses the same render path as live delivery.

## Phase 5: Observability and Contract Completion

Duration: 0.5 to 1 day

Primary files:

1. backend/src/controllers/notificationAdminController.ts
2. backend/src/controllers/notificationTemplateAdminController.ts
3. backend/src/services/notificationOutboxService.ts
4. api/openapi.yaml

Tasks:

1. Ensure provider fields are visible in admin detail payloads.
2. Keep metrics endpoint operational for notification jobs and deliveries.
3. Add missing OpenAPI docs for metrics endpoint, webhook endpoint, and template-admin surfaces.
4. Add tracking for send attempts, success rate, bounce rates, complaint rates, retry counts, and suppression counts.

Exit criteria:

1. Operators can trace queue-to-delivery lifecycle for each message.
2. OpenAPI reflects all mounted notification endpoints.

Current status:

1. Mostly complete.
2. OpenAPI now includes notification metrics, template admin endpoints, preview endpoint, internal delivery-event contract updates, and the public Resend webhook endpoint.
3. Provider traceability is exposed in job detail, delivery rows, and outbound events.

## Phase 6: Test Coverage

Duration: 1 day

Primary files:

1. backend/tests/unit/notificationOutboxService.test.ts
2. backend/tests/integration/notification-track4.test.ts

Tasks:

1. Unit tests for adapter selection and Resend send success path.
2. Unit tests for Resend failure and retry scheduling.
3. Unit tests for webhook event mapping and status patch behavior.
4. Unit tests for webhook event idempotency and duplicate-event handling.
5. Integration tests for run-due execution with provider adapter.
6. Integration tests for webhook ingestion and lifecycle progression.
7. Regression tests to protect invite idempotency and dedupe behavior.

Exit criteria:

1. New unit and integration suites pass.
2. Existing invite and outbox tests remain green.

Current status:

1. Complete.
2. Added Resend adapter send/failure tests, run-due provider execution tests, webhook ingestion tests, provider-event idempotency coverage, and invite provider-selection regression coverage.
3. Focused Phase 6 suite passed on 2026-04-29.

## Phase 7: Rollout and Safety Controls

Duration: 0.5 day

Tasks:

1. Introduce feature flag gating by environment.
2. Start with staging-only enablement.
3. Run production canary with limited traffic slice.
4. Keep instant fallback path to internal adapter.
5. Define rollback trigger thresholds.

Exit criteria:

1. Staging is stable under expected load.
2. Production canary passes without elevated failures.

Current status:

1. Complete as of 2026-04-29.
2. Shared provider policy now gates Resend by configured provider, optional environment allow-list, optional emergency enable flag, and rollout percentage.
3. Runtime notification deliveries and document invite deliveries both resolve their provider through the shared policy before rows are queued.
4. Focused unit coverage verifies default internal fallback, full Resend enablement, emergency disable, environment gating, zero percent rollout, missing canary keys, and deterministic partial rollout selection.

Rollout controls:

1. Set `NOTIFICATION_PROVIDER=resend` to allow the Resend adapter to be selected. Any other value falls back to `internal`.
2. Set `NOTIFICATION_PROVIDER_ALLOWED_ENVS=staging` for staging-only enablement, or `staging,production` once production canary begins. `NOTIFICATION_RESEND_ALLOWED_ENVS` is supported as an alias.
3. Set `NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT=100` for full rollout, `0` for full internal fallback, or a canary value such as `5` or `10` for production. `NOTIFICATION_RESEND_ROLLOUT_PERCENT` is supported as an alias.
4. Set `NOTIFICATION_PROVIDER_RESEND_ENABLED=false` for an emergency off switch without changing the main provider value. `NOTIFICATION_RESEND_ENABLED` is supported as an alias.
5. Rollback path: set `NOTIFICATION_PROVIDER=internal` or `NOTIFICATION_PROVIDER_RESEND_ENABLED=false`, then force a fresh API and worker deployment so the task environment is reloaded.

Production canary policy:

1. Start production at `NOTIFICATION_PROVIDER_ALLOWED_ENVS=staging,production` and `NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT=5`.
2. Promote to 25%, 50%, and 100% only after one normal traffic window without elevated send failures, webhook lag, bounces, or complaints.
3. Roll back immediately if send failures exceed the internal baseline, webhook reconciliation lags beyond the retry window, complaint rate increases materially, or user-visible invite/signing delivery issues appear.

## Phase 8: Runbook and Incident Response

Duration: 0.5 day

Execution artifact:

1. docs/resend-email-incident-runbook.md

Tasks:

1. Document incident playbooks for Resend API outage, bounce spike, complaint spike, webhook delivery lag or failure, and DNS or sender-domain regressions.
2. Document reconciliation flow between Resend and outbox tables.
3. Verify recovery and fallback steps.

Exit criteria:

1. On-call playbook is documented and shared.
2. Recovery and fallback steps are verified.

Current status:

1. Complete as of 2026-04-29.
2. `docs/resend-email-incident-runbook.md` now documents first response, rollback controls, reconciliation flow, SQL checks, incident playbooks, recovery verification, and staging smoke steps.
3. Covered incident classes include Resend API outage, webhook lag or failure, bounce spike, complaint spike, DNS or sender-domain regression, and template rendering or payload regression.
4. Recovery guidance preserves existing outbox state and uses provider fallback for newly queued deliveries.

## Definition of Done

1. Email sends via Resend for configured environments.
2. Delivery lifecycle is webhook-driven and persisted.
3. Retry behavior remains correct and observable.
4. Admin endpoints show full provider traceability and template preview.
5. OpenAPI is synchronized with mounted endpoints.
6. Rollback switch is tested.
7. End-to-end signer flow validates owner sign, invite issuance, delivery, and claim path success.

## Recommended Execution Order From Here

1. Deploy Phase 7 and Phase 8 changes to staging.
2. Keep staging at full Resend rollout while monitoring webhook reconciliation and failed deliveries.
3. Start production canary at the documented percentage only after staging is stable.

## Immediate Next Step

After deployment, verify staging with a real outbox-backed invite or notification, then confirm the delivery row, Resend message id, and webhook event ledger reconcile end to end.

## Webhook Activation Checklist (Operator)

1. Set `RESEND_WEBHOOK_SECRET` in each deployed backend environment.
2. Configure a Resend webhook endpoint pointing to your backend URL plus `/webhooks/resend`.
3. Subscribe the webhook to lifecycle events used by the outbox reconciliation flow:
4. `email.sent`
5. `email.scheduled`
6. `email.delivered`
7. `email.delivery_delayed`
8. `email.bounced`
9. `email.complained`
10. `email.opened`
11. `email.clicked`
12. `email.failed`
13. `email.suppressed`
