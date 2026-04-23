# Resend Email Provider Integration Roadmap

Last updated: 2026-04-23

## Objective

Move DARCI notification delivery from the internal adapter to production-grade email delivery using Resend, while preserving the current outbox architecture, idempotency, dedupe, retries, and observability.

## Scope

1. Covers notification outbox email delivery runtime.
2. Covers webhook-driven delivery lifecycle updates.
3. Covers invite and non-invite email families.
4. Does not replace SMS providers.
5. Does not change invite business logic, signer orchestration logic, or claim semantics.

## Phase 0: Scope Lock

Duration: 0.5 day

Execution artifact:

1. docs/resend-phase-0-scope-lock.md

Tasks:

1. Confirm all email notification families will route through Resend.
2. Confirm environment strategy:
3. Local dev fallback behavior.
4. Staging sending domain strategy.
5. Production sending domain strategy.
6. Confirm sender identities by email family:
7. Transactional sender.
8. No-reply sender.
9. Support sender.

Exit criteria:

1. Environment and sender matrix is approved.
2. Rollout ownership and escalation owners are named.

Current status:

1. Phase 0 scope-lock artifact drafted.
2. Waiting for owner approvals on domain and sender matrix.

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

## Phase 2: Backend Resend Adapter Runtime

Duration: 1 day

Primary files:

1. backend/src/services/notificationOutboxService.ts
2. backend/src/controllers/notificationInternalController.ts
3. backend/src/routes/internal.ts

Tasks:

1. Implement `resend` adapter in provider adapter layer.
2. Add environment-driven provider selection with safe fallback:
3. Keep `internal` for local or disabled provider mode.
4. Use `resend` when explicitly enabled.
5. Map outbox payload to Resend send API:
6. from, to, subject, html or text.
7. metadata and tags for traceability.
8. Persist provider message id in notification delivery row.
9. Preserve current retry and job-status derivation behavior.

Exit criteria:

1. Outbox can send through Resend in staging mode.
2. Provider message ids are persisted.
3. Existing outbox state machine behavior remains unchanged.

## Phase 3: Webhook Ingestion and Event Mapping

Duration: 1 day

Primary files:

1. backend/src/controllers/notificationInternalController.ts
2. backend/src/routes/internal.ts
3. backend/src/services/notificationOutboxService.ts

Tasks:

1. Add webhook endpoint for Resend delivery events.
2. Validate webhook signature and reject unsigned or invalid payloads.
3. Map Resend events to canonical outbound events:
4. queued, sent, delivered, failed, bounced, complained, opened, clicked.
5. Patch delivery statuses based on mapped events.
6. Recompute and patch notification job status from delivery states.
7. Enforce event idempotency using provider event id.

Exit criteria:

1. Webhooks are authenticated and idempotent.
2. Delivery rows reflect provider lifecycle events.
3. Job status tracks true aggregate delivery state.

## Phase 4: Template and Payload Hardening

Duration: 1 day

Primary files:

1. backend/src/services/notificationOutboxService.ts
2. backend/src/services/notificationService.ts
3. docs/notification-template-wave.md

Tasks:

1. Ensure required template variables are validated before send.
2. Ensure html and text fallback behavior is explicit.
3. Harden payload validation with clear error codes.
4. Validate invite, notary, and status email template rendering.

Exit criteria:

1. No critical template fails rendering at runtime.
2. Variable-missing failures are explicit and observable.

## Phase 5: Observability and Contract Completion

Duration: 0.5 to 1 day

Primary files:

1. backend/src/controllers/notificationAdminController.ts
2. backend/src/services/notificationOutboxService.ts
3. api/openapi.yaml

Tasks:

1. Ensure provider fields are visible in admin detail payloads.
2. Keep metrics endpoint operational for notification jobs and deliveries.
3. Add missing OpenAPI docs for metrics endpoint and any webhook endpoint.
4. Add tracking for:
5. send attempts,
6. success rate,
7. bounce and complaint rates,
8. retry counts,
9. suppression counts.

Exit criteria:

1. Operators can trace queue-to-delivery lifecycle for each message.
2. OpenAPI reflects all mounted notification endpoints.

## Phase 6: Test Coverage

Duration: 1 day

Primary files:

1. backend/tests/unit/notificationOutboxService.test.ts
2. backend/tests/integration/notification-track4.test.ts

Tasks:

1. Unit tests for adapter selection and Resend send success path.
2. Unit tests for Resend failure and retry scheduling.
3. Unit tests for webhook event mapping and status patch behavior.
4. Unit tests for webhook event idempotency.
5. Integration tests for run-due execution with provider adapter.
6. Integration tests for webhook ingestion and lifecycle progression.
7. Regression tests to protect invite idempotency and dedupe behavior.

Exit criteria:

1. New unit and integration suites pass.
2. Existing invite and outbox tests remain green.

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

## Phase 8: Runbook and Incident Response

Duration: 0.5 day

Tasks:

1. Document incident playbooks for:
2. Resend API outage,
3. bounce spike,
4. complaint spike,
5. webhook delivery lag or failure,
6. DNS or sender-domain regressions.
7. Document reconciliation flow between Resend and outbox tables.

Exit criteria:

1. On-call playbook is documented and shared.
2. Recovery and fallback steps are verified.

## Definition of Done

1. Email sends via Resend for configured environments.
2. Delivery lifecycle is webhook-driven and persisted.
3. Retry behavior remains correct and observable.
4. Admin endpoints show full provider traceability.
5. OpenAPI is synchronized with mounted endpoints.
6. Rollback switch is tested.
7. End-to-end signer flow validates:
8. owner signs,
9. invites are issued once,
10. email is delivered,
11. claim path succeeds.

## Recommended Execution Order

1. Phase 0
2. Phase 1
3. Phase 2
4. Phase 3
5. Phase 6
6. Phase 5
7. Phase 7
8. Phase 8

## Immediate Next Step

Implement Phase 2 first in `backend/src/services/notificationOutboxService.ts`, then wire webhook ingestion in Phase 3 before promoting beyond staging.
