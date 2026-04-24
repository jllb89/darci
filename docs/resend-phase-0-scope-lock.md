# Resend Phase 0 Scope Lock

Last updated: 2026-04-23
Status: Approved — closed

## Goal

Lock environment strategy, sender identities, rollout ownership, and non-goals before coding provider runtime.

## Current Backend Reality

1. Notification queueing already exists and is live through the outbox model.
2. Notification provider delivery now supports both `internal` and `resend`, with environment-driven selection.
3. Invite orchestration idempotency and dedupe are already in place and are out of scope for this phase.
4. Resend API key and webhook secret placeholders are now documented in `backend/.env.example`.

## Scope Decision

Approved scope for Resend rollout:

1. Route all email notification jobs through Resend in staging and production.
2. Keep internal provider fallback for local development and emergency rollback.
3. Keep sms and in-app channels unchanged.
4. Keep invite business logic, idempotency keys, and claim semantics unchanged.

## Environment Strategy Matrix

| Environment | Provider Mode | Sending Domain | Webhook Mode | Notes |
| --- | --- | --- | --- | --- |
| local | internal (default) | none | optional | Local should not require Resend credentials. |
| staging | resend | darciregistry.com | enabled | Shares production domain. Staging subdomain (staging.darciregistry.com) deferred — add when budget allows. |
| production | resend | darciregistry.com | enabled | Full rollout with canary and fallback. |

## Sender Identity Matrix

| Email Family | From Name | From Address | Reply-To | Owner |
| --- | --- | --- | --- | --- |
| invite and signer | DARCI Signatures | no-reply@darciregistry.com | support@darciregistry.com | Product + Eng |
| notarization and meeting | DARCI Notarization | no-reply@darciregistry.com | support@darciregistry.com | Product + Ops |
| verification and completion | DARCI Registry | no-reply@darciregistry.com | support@darciregistry.com | Product + Ops |
| billing and payment request | DARCI Billing | billing@darciregistry.com | support@darciregistry.com | Product + Finance |

Approved:

1. Production domain: darciregistry.com
2. Staging domain: darciregistry.com (staging.darciregistry.com deferred — requires paid Resend plan)
3. Billing sender: billing@darciregistry.com, all others no-reply@darciregistry.com

## Rollout Ownership and Escalation

| Function | Primary | Backup | Escalation Trigger |
| --- | --- | --- | --- |
| Resend account and DNS | Platform | DevOps | Domain verification delays or DNS mismatch |
| Backend adapter and webhook code | Backend | Platform | Delivery failures above threshold |
| Template rendering and payloads | Backend | Product | Runtime variable failures |
| Operations monitoring | Ops | Backend | Bounce or complaint spike |

## Phase 0 Exit Checklist

- [x] Domain and subdomain strategy approved.
- [x] Sender identity matrix approved.
- [x] Rollout owner table approved.
- [x] Escalation path approved.
- [x] Non-goals acknowledged.

## Immediate Next Action

Scope lock is complete. Remaining work has moved to focused tests, rollout controls, and incident/runbook documentation.
