# Staging SMS delivery tracking and three-minute validity

## Scope and release boundary

Jorge approved SMS delivery tracking, message correlation and **180-second** OTP validity. Production, sender number, provider, phone linking, test-code overrides, rate limits and client records remain unchanged. No real SMS is sent by the infrastructure deployment or the synthetic receipt drill.

- Supabase staging project `oqferisuloumoojgbjde`: `sms_otp_exp` changed from 60 to 180 and read back. All other auth settings compared unchanged. This setting is already effective for new codes.
- CloudFormation stack: `darci-staging-sms-delivery`.
- AWS configuration set: `darci-staging-auth-sms`.
- Receipt logs: `/darci/staging/auth-sms-delivery`, retained for 30 days.
- Application changes are local until the normal backend release. The staging deployment workflow now supplies `SUPABASE_AUTH_SMS_CONFIGURATION_SET=darci-staging-auth-sms` to the API. No new secrets, migrations or TestFlight build are required.
- The earlier signing/notary authorization resilience patch was committed separately as `98649c4` while this pass ran. GitHub staging deployment [35909861071](https://github.com/jllb89/darci/actions/runs/35909861071) has passed exact-revision CI and image builds and is deploying as of this verification. Do not mark rollout complete before that run succeeds. The SMS application changes in this document are not included in that revision.

## What is correlated

1. Phone OTP ingress and Supabase acceptance logs share the app request ID and normalized one-way phone hash.
2. Auth audit records now pass their request ID through the audit service correctly instead of allowing metadata's `request_id` to be replaced by null.
3. The authenticated Supabase SMS hook hashes its signed webhook ID and records AWS's returned message ID as `auth_sms_handoff`, outcome `accepted`. Provider rejection logs include only controlled failure classifications, not raw messages.
4. The send request supplies the configuration set and safe `hookHash` / `phoneHash` context. AWS's later events retain the same message ID and context.
5. A private SNS-to-Lambda route validates the source and emits allowlisted delivery fields. Full destinations, originating numbers, OTPs, bodies, raw error prose and arbitrary context are not copied into its CloudWatch logs. AWS's native event is processed transiently; no raw event archive or external subscriber is configured.

The original app request ID is **not forwarded by Supabase in the hook payload**. Correlation from app request to hook uses phone hash and time; do not claim exact one-to-one matching if multiple attempts overlap. Hook → AWS message → delivery receipt is exact by message ID/context. No token or per-request value is written into user metadata to force correlation.

## Interpret statuses honestly

- `accepted` handoff: AWS accepted the API send request; not proof of delivery.
- `SUCCESSFUL`: carrier acceptance; not device delivery.
- `DELIVERED`: provider reports acceptance by the recipient device; not proof the person read it.
- `PENDING` / `QUEUED`: not delivered yet.
- `FAILED`, `CARRIER_BLOCKED`, `TTL_EXPIRED`, etc.: investigate the reported classification.
- `UNKNOWN`: unresolved; never infer success.

AWS warns final carrier events can take up to 72 hours, so receipts cannot guarantee immediate diagnosis of a missing code. Query all events for the message ID and use `eventTimestamp` / `isFinal`; events can be duplicated or arrive out of order. Logs are append-only observations, not a mutable delivery state machine.

References: [AWS SMS event format and statuses](https://docs.aws.amazon.com/sms-voice/latest/userguide/configuration-sets-event-format.html), [scoped SNS publishing policy](https://docs.aws.amazon.com/sms-voice/latest/userguide/configuration-sets-sns-creating-role.html).

## Operations

- API logs: search `auth_sms_handoff`, find `messageId`, then query that ID in the receipt log group.
- Missing handoff: inspect `request_received` / `provider_request_accepted` and hook failure records. Check hosted hook settings; do not resend automatically.
- Handoff but no receipt: check the configuration-set argument on the deployed API, SMS event destination, SNS subscription and Lambda pipeline alarms. Receipt absence is not a carrier failure by itself.
- Two pipeline-health alarms use the existing critical-email route: `darci-recovery-staging-sms-receipt-handler` and `darci-recovery-staging-sms-receipt-routing`. They do not email on every OTP or every successful receipt.
- Small pay-per-use SNS/Lambda/logging usage plus two standard alarms; no new phone number, dedicated server or database. Review actual monitoring spend against the previously approved staging budget.
- Infrastructure deployment: `node infra/monitoring/deploy-sms-delivery.mjs --approved-staging-sms-tracking`.

## Verification

- Backend suite: 795 tests / 108 files passed, including the earlier authorization changes.
- Typecheck and observability catalog validation passed.
- Receipt sanitizer / infrastructure and deployment-workflow checks: 12 tests passed.
- Tests cover privacy filtering, truthful carrier versus device status, wrong-source rejection, normalized hashes, audit request-ID propagation and no application-level automatic SMS resend.
- The AWS role permission simulation allowed `sms-voice:SendTextMessage` with the existing sender and new configuration set.
- The first stack attempt rolled back after SNS rejected missing policy statement IDs. Only that attempt's verified-empty retained log group and failed stack record were removed; no SMS data existed. The corrected template gives each policy statement a unique ID.
- Corrected AWS stack reached `CREATE_COMPLETE`; configuration-set readback confirms enabled `TEXT_ALL` delivery events to the scoped SNS topic.
- Synthetic route verification at `2026-09-23T19:39:31Z`: event `sms-tracking-drill-cfcc152d-69f6-4152-a721-075eeec699eb` reached the receipt log as `PENDING`, `deviceDelivered=false`, with hook/phone hashes preserved and test destination/body omitted. This tested SNS → Lambda → CloudWatch, not an actual SMS send or AWS carrier event emission.
- Real end-to-end acceptance requires the backend release followed by a user-authorized OTP attempt and receipt correlation. Do not mark the original missing-message incident resolved from a synthetic event test.
