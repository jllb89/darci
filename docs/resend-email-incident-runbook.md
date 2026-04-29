# Resend Email Incident Runbook

Last updated: 2026-04-29

## Goal

Give operators one place to diagnose, mitigate, reconcile, and recover Resend-backed email delivery incidents without changing invite, signing, or notification business logic.

## Scope

This runbook covers email notifications sent through the persisted outbox pipeline:

1. `notification_jobs`
2. `notification_deliveries`
3. `outbound_message_events`
4. `POST /webhooks/resend`
5. Admin notification job and metrics endpoints

It does not cover SMS, in-app notifications, template copy approval, or Resend account billing issues except when they block email delivery.

## Runtime Surfaces

Primary backend surfaces:

1. `backend/src/services/notificationProviderPolicy.ts`
2. `backend/src/services/notificationService.ts`
3. `backend/src/services/documentInviteService.ts`
4. `backend/src/services/notificationOutboxService.ts`
5. `backend/src/controllers/notificationWebhookController.ts`
6. `backend/src/controllers/notificationAdminController.ts`
7. `backend/src/routes/webhooks.ts`
8. `backend/src/routes/admin.ts`
9. `backend/src/routes/internal.ts`

Operational endpoints:

1. `GET /admin/notification-jobs/metrics?windowHours=24`
2. `GET /admin/notification-jobs?channel=email&status=failed`
3. `GET /admin/notification-jobs/{id}`
4. `POST /internal/notification-jobs/run-due`
5. `POST /webhooks/resend`

## First Response Checklist

Use this checklist for every Resend incident before choosing a specific playbook.

1. Confirm blast radius: staging only, production only, or both.
2. Check whether the issue is send-side, webhook-side, DNS/domain-side, or recipient reputation-side.
3. Check recent metrics through `GET /admin/notification-jobs/metrics?windowHours=24`.
4. Check failed email jobs through `GET /admin/notification-jobs?channel=email&status=failed`.
5. Check Resend dashboard for API errors, webhook delivery failures, bounced email, complaints, suppression, or domain warnings.
6. If member signing or invite delivery is user-visible, decide whether to roll back before continuing diagnosis.
7. Preserve evidence: incident start time, affected environment, sample job id, sample delivery id, sample Resend email id, and the first failing log line.

## Rollback Controls

Use rollback when Resend delivery is causing user-visible failure or when the incident class is not isolated within one normal retry window.

Primary rollback path:

1. Set `NOTIFICATION_PROVIDER=internal` or set `NOTIFICATION_PROVIDER_RESEND_ENABLED=false`.
2. Force fresh API and worker deployments so task environments reload.
3. Confirm newly queued email deliveries have `provider = internal`.
4. Keep existing Resend deliveries intact; do not mutate historical delivery rows during rollback.

Staging ECS example:

```sh
aws ecs update-service --cluster darci-staging --service darci-staging-api --force-new-deployment
aws ecs update-service --cluster darci-staging --service darci-staging-worker --force-new-deployment
```

Production should use the matching production cluster and service names from deployment configuration.

Do not delete `RESEND_API_KEY` or `RESEND_WEBHOOK_SECRET` as the first rollback action. Removing secrets can turn a controlled provider fallback into noisy service misconfiguration.

## Reconciliation Model

The pipeline reconciles delivery state in this order:

1. Runtime code queues a `notification_jobs` row.
2. Runtime code queues one or more `notification_deliveries` rows with the selected provider already persisted.
3. Runtime code records a `queued` row in `outbound_message_events`.
4. The worker dispatches due jobs through the provider stored on each delivery.
5. Resend sends receive a `delivery_id` tag and return a Resend email id stored as `notification_deliveries.provider_message_id`.
6. Resend webhook events arrive at `POST /webhooks/resend`.
7. Webhooks verify Svix headers with `RESEND_WEBHOOK_SECRET`.
8. Webhooks match by `delivery_id` tag first and `provider_message_id` second.
9. Webhooks insert idempotent `outbound_message_events` rows using the Svix id as `provider_event_id`.
10. The outbox service maps canonical events back onto `notification_deliveries.status` and then derives `notification_jobs.status`.

Canonical Resend event mapping:

| Resend event | Outbox event | Delivery outcome |
| --- | --- | --- |
| `email.sent` | `sent` | delivery is marked sent |
| `email.scheduled` | `queued` | delivery remains queued |
| `email.delivered` | `delivered` | delivery is marked delivered |
| `email.delivery_delayed` | `deferred` | delivery records provider delay |
| `email.bounced` | `bounced` | delivery is terminally bounced |
| `email.complained` | `complained` | delivery is terminally complained |
| `email.opened` | `opened` | delivery records engagement |
| `email.clicked` | `clicked` | delivery records engagement |
| `email.failed` | `failed` | delivery is terminally failed |
| `email.suppressed` | `suppressed` | delivery is terminally suppressed |

## Reconciliation Queries

Recent provider and status mix:

```sql
select
  provider,
  status,
  count(*) as deliveries
from public.notification_deliveries
where channel = 'email'
  and created_at >= now() - interval '24 hours'
group by provider, status
order by provider, status;
```

Recent failed, bounced, complained, and suppressed deliveries:

```sql
select
  id,
  notification_job_id,
  provider,
  provider_message_id,
  recipient_address,
  status,
  error_code,
  error_message,
  created_at,
  failed_at,
  bounced_at
from public.notification_deliveries
where channel = 'email'
  and provider = 'resend'
  and status in ('failed', 'bounced', 'complained', 'suppressed')
  and created_at >= now() - interval '24 hours'
order by created_at desc
limit 100;
```

Sent deliveries waiting on webhook confirmation:

```sql
select
  id,
  notification_job_id,
  provider_message_id,
  recipient_address,
  status,
  queued_at,
  sent_at,
  created_at
from public.notification_deliveries
where channel = 'email'
  and provider = 'resend'
  and status in ('queued', 'sent')
  and coalesce(sent_at, queued_at, created_at) < now() - interval '15 minutes'
order by coalesce(sent_at, queued_at, created_at) asc
limit 100;
```

Latest event ledger for one delivery:

```sql
select
  e.notification_delivery_id,
  e.event_type,
  e.provider,
  e.provider_event_id,
  e.event_at,
  e.payload,
  e.metadata,
  e.created_at
from public.outbound_message_events e
where e.notification_delivery_id = '<delivery-id>'
order by e.event_at desc, e.created_at desc;
```

Webhook duplicate/idempotency check:

```sql
select
  provider,
  provider_event_id,
  count(*) as copies
from public.outbound_message_events
where provider = 'resend'
  and provider_event_id is not null
  and created_at >= now() - interval '24 hours'
group by provider, provider_event_id
having count(*) > 1
order by copies desc;
```

Job detail with delivery state:

```sql
select
  j.id as job_id,
  j.status as job_status,
  j.job_kind,
  j.channel,
  j.attempt_count,
  j.scheduled_for,
  d.id as delivery_id,
  d.provider,
  d.provider_message_id,
  d.status as delivery_status,
  d.recipient_address,
  d.attempt_number
from public.notification_jobs j
join public.notification_deliveries d
  on d.notification_job_id = j.id
where j.id = '<job-id>'
order by d.created_at asc;
```

## Playbook: Resend API Outage Or Send-Side Failure

Symptoms:

1. Worker logs show Resend API failures.
2. `notification_deliveries.status = failed` grows above baseline.
3. `GET /admin/notification-jobs/metrics?windowHours=1` shows failed email jobs increasing.
4. Resend status page or dashboard reports API degradation.

Mitigation:

1. If production users are affected, roll back to `internal` immediately.
2. Keep the worker running so retry scheduling and non-Resend deliveries continue.
3. Do not replay failed jobs until Resend health is confirmed or fallback has been applied.
4. Capture sample failed delivery rows and provider errors for the incident record.

Recovery:

1. Confirm Resend API health.
2. Restore canary percentage rather than jumping straight to 100%.
3. Run `POST /internal/notification-jobs/run-due` or wait for the scheduled worker cycle.
4. Confirm failed delivery growth stops and new deliveries reach `sent` or `delivered`.

## Playbook: Webhook Delivery Lag Or Failure

Symptoms:

1. Resend dashboard shows webhook retries or failures.
2. API logs show `invalid_signature`, `misconfigured`, or raw-body errors for `/webhooks/resend`.
3. Deliveries remain `sent` for more than 15 minutes while Resend shows delivered/bounced/failed.
4. Smoke webhook returns anything other than `200` or expected `202` for unmatched test messages.

Mitigation:

1. Confirm the Resend dashboard endpoint is the correct deployed URL plus `/webhooks/resend`.
2. Confirm lifecycle events are subscribed: `email.sent`, `email.scheduled`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.failed`, and `email.suppressed`.
3. Confirm `RESEND_WEBHOOK_SECRET` is present in the API task environment.
4. Force a fresh API deployment after any secret change.
5. If reconciliation lag is user-visible or persistent, roll back new sends to `internal` while preserving existing Resend rows.

Recovery:

1. Re-send a webhook event from the Resend dashboard for a known message.
2. Confirm a new `outbound_message_events` row exists with the Svix id in `provider_event_id`.
3. Confirm the matching `notification_deliveries.status` changes.
4. Confirm duplicate webhook replays do not create duplicate provider events.

## Playbook: Bounce Spike

Symptoms:

1. `email.bounced` events increase materially above normal traffic.
2. Resend dashboard shows higher bounce rate.
3. Deliveries enter `bounced` with clustered recipient domains.

Mitigation:

1. Identify whether bounces cluster by domain, template family, sender address, or invite batch.
2. Pause or reduce Resend rollout if the spike is broad.
3. If only one recipient domain is affected, keep global rollout stable and suppress manual re-sends to that domain until the cause is known.
4. Check recent template changes for malformed links, sender changes, or content that may trigger domain filtering.

Recovery:

1. Confirm domain authentication remains verified in Resend.
2. Confirm sender addresses still match the approved sender matrix.
3. Resume canary only after bounce rate returns to baseline for one normal traffic window.
4. Document whether affected recipients need manual support follow-up.

## Playbook: Complaint Spike

Symptoms:

1. `email.complained` events appear or increase.
2. Resend dashboard flags complaint rate risk.
3. Complaints map to a campaign-like batch, invite family, or template.

Mitigation:

1. Treat complaints as higher severity than bounces.
2. Roll back or reduce rollout if complaints are not isolated to a known test recipient.
3. Stop manual re-sends for the affected template family.
4. Review recipient targeting, invite authorization, template copy, reply-to, and unsubscribe/suppression expectations.

Recovery:

1. Confirm no unauthorized or duplicate recipient batch was created.
2. Confirm future sends use the correct recipient and template metadata.
3. Resume only with a small canary and heightened monitoring.

## Playbook: DNS Or Sender-Domain Regression

Symptoms:

1. Resend domain status changes from verified.
2. New sends fail with sender/domain errors.
3. Bounces or spam placement increase across many recipient domains.
4. Sender addresses no longer align with the approved matrix.

Mitigation:

1. Roll back to `internal` for production if sends are blocked.
2. Confirm DNS records in the registrar or DNS provider against the Resend dashboard.
3. Confirm `darciregistry.com` remains the production sending domain.
4. Confirm billing sender remains `billing@darciregistry.com` and non-billing senders remain `no-reply@darciregistry.com` unless explicitly approved.

Recovery:

1. Wait for Resend to show the domain as verified again.
2. Send a controlled test to an internal recipient.
3. Resume at the prior canary level, not full production, unless the outage was staging-only.

## Playbook: Template Rendering Or Payload Regression

Symptoms:

1. Resend API accepts some sends but fails for a specific template family.
2. Failed jobs share `job_kind`, `templateKey`, invite metadata, or document metadata.
3. Rendered subject or body is missing required values.

Mitigation:

1. Use `GET /admin/notification-jobs/{id}` for a failed sample.
2. Compare job payload and delivery metadata against the template requirements.
3. Reduce rollout if the template family is high-volume or user-visible.
4. Fix template data or code before replaying jobs.

Recovery:

1. Preview the affected template through the template admin preview endpoint when applicable.
2. Queue a controlled test notification.
3. Confirm `rendered`, `sent`, and final lifecycle events appear in `outbound_message_events`.

## Recovery Verification Checklist

Before closing the incident:

1. New email deliveries have the expected provider for the active rollout state.
2. `GET /admin/notification-jobs/metrics?windowHours=1` shows failures no longer increasing.
3. Resend dashboard webhook delivery is healthy.
4. Sample delivery ids show a coherent event ledger from `queued` through terminal or engagement event.
5. Any rollback or canary percentage change has been recorded with timestamp, operator, and reason.
6. If a secret changed, API and worker deployments were both refreshed.
7. If production was rolled back, a follow-up canary plan is written before re-enabling Resend.

## Staging Smoke After Recovery

1. Confirm the API health endpoint is green.
2. Send a controlled email through the outbox path or trigger a signer invite in staging.
3. Confirm the delivery row is `provider = resend` when staging rollout is enabled.
4. Confirm Resend returns a provider message id.
5. Confirm webhook reconciliation writes the final event.
6. Confirm no unexpected `failed`, `bounced`, `complained`, or `suppressed` rows were created.
