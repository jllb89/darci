# Resend Phase 0 Scope Lock

Last updated: 2026-04-23
Status: In progress

## Goal

Lock environment strategy, sender identities, rollout ownership, and non-goals before coding provider runtime.

## Current Backend Reality

1. Notification queueing already exists and is live through the outbox model.
2. Notification provider delivery in runtime currently defaults to internal provider behavior.
3. Invite orchestration idempotency and dedupe are already in place and are out of scope for this phase.
4. No Resend environment variables are currently defined in backend env example.

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
| staging | resend | staging subdomain | enabled | Validate delivery lifecycle and webhook mapping. |
| production | resend | production domain | enabled | Full rollout with canary and fallback. |

## Sender Identity Matrix

| Email Family | From Name | From Address | Reply-To | Owner |
| --- | --- | --- | --- | --- |
| invite and signer | DARCI Signatures | no-reply@<domain> | support@<domain> | Product + Eng |
| notarization and meeting | DARCI Notarization | no-reply@<domain> | support@<domain> | Product + Ops |
| verification and completion | DARCI Registry | no-reply@<domain> | support@<domain> | Product + Ops |
| billing and payment request | DARCI Billing | billing@<domain> | support@<domain> | Product + Finance |

Pending approvals:

1. Confirm production domain.
2. Confirm staging subdomain.
3. Confirm billing sender alias.

## Rollout Ownership and Escalation

| Function | Primary | Backup | Escalation Trigger |
| --- | --- | --- | --- |
| Resend account and DNS | Platform | DevOps | Domain verification delays or DNS mismatch |
| Backend adapter and webhook code | Backend | Platform | Delivery failures above threshold |
| Template rendering and payloads | Backend | Product | Runtime variable failures |
| Operations monitoring | Ops | Backend | Bounce or complaint spike |

## Phase 0 Exit Checklist

- [ ] Domain and subdomain strategy approved.
- [ ] Sender identity matrix approved.
- [ ] Rollout owner table approved.
- [ ] Escalation path approved.
- [ ] Non-goals acknowledged.

## Immediate Next Action

Once checklist is approved, implement Phase 1 domain setup and add required backend environment variables in a dedicated config pass before adapter coding.
