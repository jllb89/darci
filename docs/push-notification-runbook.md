# Push Notification Runbook

Last updated: 2026-08-10

Scope: native iOS APNs push notifications for `com.illuminote.darci`, Wave 1 transactional notifications, and notification outbox observability. Resend email remains the primary fallback and must stay enabled during push rollout or rollback.

## Controls

Runtime switches:

- `NOTIFICATION_PUSH_PROVIDER=apns` enables APNs provider selection when policy gates allow it.
- `NOTIFICATION_PROVIDER_APNS_ENABLED=false` disables APNs dispatch without redeploying.
- `NOTIFICATION_APNS_ALLOWED_ENVS=staging,production` limits APNs by backend runtime environment.
- `NOTIFICATION_APNS_ROLLOUT_PERCENT=0` keeps push jobs queued/internal-fallback only; increase deterministically after validation.

Apple environment split:

- Debug/dev builds use `APS_ENVIRONMENT=development` and APNs sandbox tokens.
- TestFlight and App Store builds use `APS_ENVIRONMENT=production` and APNs production tokens.
- Staging backend may send to either sandbox or production APNs based on each registered `device_push_tokens.environment` row.

## Credential Rotation

1. Create a replacement APNs Auth Key in Apple Developer for Team ID `38K3YA2857`.
2. Store the new key id and `.p8` value in the runtime secret store. Never place the `.p8` value in source, build settings, logs, or client bundles.
3. Update ECS task definitions so API and worker tasks expose `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, and `APNS_BUNDLE_ID`.
4. Deploy API and worker with `NOTIFICATION_PROVIDER_APNS_ENABLED=false` or rollout `0`.
5. Run one targeted `job_kind=custom` APNs smoke to a DARCi-owned device.
6. Re-enable the previous rollout percentage only after APNs accepts the smoke.
7. Revoke the old Apple key after the new key is confirmed in staging and production.

Expired or revoked key symptoms: APNs returns credential/auth failures such as `InvalidProviderToken`, `ExpiredProviderToken`, or `Forbidden`. Disable APNs, rotate credentials, then rerun an isolated smoke.

## Sandbox And Production Mismatch

Symptoms:

- `BadDeviceToken` for a recently registered valid-looking token.
- `DeviceTokenNotForTopic` when bundle id or topic does not match `com.illuminote.darci`.
- APNs accepts sandbox debug pushes but rejects TestFlight pushes, or vice versa.

Checks:

```sql
select environment, app_bundle_id, permission_status, is_active, count(*)
from public.device_push_tokens
group by environment, app_bundle_id, permission_status, is_active
order by environment, app_bundle_id, permission_status;
```

Expected:

- Debug physical installs register `environment = 'sandbox'`.
- TestFlight installs register `environment = 'production'`.
- Both use `app_bundle_id = 'com.illuminote.darci'`.

## Provider Failure Handling

Permanent token failures:

- `BadDeviceToken`
- `DeviceTokenNotForTopic`
- `Unregistered`

Expected behavior: the outbox marks the delivery failed, records redacted APNs metadata, and deactivates the referenced `device_push_tokens` row. Do not manually delete tokens unless cleaning up test data.

Transient failures:

- APNs 429
- APNs 5xx
- transport timeout or connection reset

Expected behavior: the outbox keeps retrying with existing retry/backoff. Do not rerun broad transactional jobs manually; use precise job ids or `job_kind=custom` for smokes.

## Redaction Rules

Never log or expose:

- raw APNs device tokens
- APNs `.p8` private key material
- OTPs, magic links, password reset links, signatures, identity documents, document contents, precise location, or private contact details

Admin APIs may expose `devicePushTokenId` and APNs status metadata, but not raw token values.

## TestFlight Wave 1 Validation

Preconditions:

1. Staging schema includes push channel support and the Wave 1 push templates.
2. Staging API and worker are deployed with APNs secrets exposed.
3. APNs rollout is enabled only for DARCi-owned test accounts.
4. A TestFlight build is installed fresh enough to register a production APNs token.
5. The tester signs in and allows notifications.

Release build prep:

```sh
cd /Users/jorge/Desktop/darci/apps/mobile
make release-config
xcodegen generate
xcodebuild -scheme DARCiMobile -configuration Release -destination 'generic/platform=iOS' archive
```

Token registration check:

```sql
select id, user_id, environment, app_bundle_id, permission_status, is_active, last_registered_at, last_seen_at
from public.device_push_tokens
where environment = 'production'
order by updated_at desc
limit 20;
```

Wave 1 events to verify:

1. `document_ready_for_review_email` routes to `document_review`.
2. `member_signing_ready_email` routes to `document_signing`.
3. `all_signatures_complete_email` routes to `member_document`.
4. `notary_request_received_email` routes to `notary_request_review`.
5. `notary_changes_requested_email` routes to `member_request`.
6. `notary_request_rejected_email` routes to `member_notary_selection`.
7. `notary_approval_received_email` routes to `member_session`.
8. `notary_member_contact_received_email` routes to `notary_request_review`.
9. `meeting_scheduled_confirmation_email` routes to `member_session`.
10. `in_person_session_started_email` routes to `member_session`.

For each event, confirm:

- email job remains queued/sent through the existing Resend path
- push companion job has a `:push` dedupe key
- push delivery references `device_push_token_id` and has `recipient_address = null`
- APNs result becomes `accepted`, not `delivered`
- tapping the notification opens the native destination and records an `opened` event

## Observability Queries

Recent push jobs and delivery status:

```sql
select j.created_at, j.template_id, j.channel, j.status, j.dedupe_key, j.metadata,
       d.provider, d.status as delivery_status, d.accepted_at, d.opened_at, d.error_code
from public.notification_jobs j
left join public.notification_deliveries d on d.notification_job_id = j.id
where j.channel = 'push'
order by j.created_at desc
limit 50;
```

Skip reasons:

```sql
select metadata->>'skipReason' as skip_reason, count(*)
from public.notification_jobs
where channel = 'push'
  and status = 'suppressed'
group by metadata->>'skipReason'
order by count(*) desc;
```

Invalidated tokens:

```sql
select environment, app_bundle_id, permission_status, invalidated_at, metadata
from public.device_push_tokens
where is_active = false
order by invalidated_at desc
limit 50;
```

App-open attribution:

```sql
select e.event_at, e.event_type, e.provider, e.payload, e.metadata
from public.outbound_message_events e
join public.notification_deliveries d on d.id = e.notification_delivery_id
where d.channel = 'push'
  and e.event_type = 'opened'
order by e.event_at desc
limit 50;
```

## Rollback

1. Set `NOTIFICATION_PROVIDER_APNS_ENABLED=false` or `NOTIFICATION_APNS_ROLLOUT_PERCENT=0`.
2. Leave token registration endpoints enabled unless registration itself is causing the incident.
3. Keep Resend enabled so email parity continues.
4. Do not delete token rows during APNs provider incidents.
5. After rollback, verify new email deliveries still process and push jobs are no longer dispatched to APNs.

## Escalation Owners

- Apple provisioning and APNs key rotation: Apple Developer account owner.
- Backend delivery, outbox, and AWS runtime configuration: backend/platform owner.
- iOS registration, entitlements, and route handling: native iOS owner.
- Notification copy/privacy review: product/security owner.
