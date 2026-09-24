# Production SMS: carrier reports delivered, recipient reports absent

Status: **open — end-to-end delivery acceptance failed**. Investigation is read-only;
no resend, new sender, carrier/provider change, support submission or support-plan purchase.

## Verified evidence

- AWS account `427057633951`, region `us-east-1`, production Supabase SMS hook.
- Request accepted at **2026-09-23 21:31:40.123 UTC / 15:31:40 Mexico City**.
- Message ID: `3e73580d-6420-489c-bfe5-c83c86140c55`.
- Hook correlation: `c2e68beb7adc8b4af6b2088897abdb8d`.
- Destination fingerprint matches the operator's exact approved +52 number ending
  0675. No middle-digit mismatch was found for this attempt.
- Events: `SUCCESSFUL` at 21:31:41 and 21:31:44; final `DELIVERED` at 21:31:45.
  These share one message ID: they are status observations, not three messages.
- Jorge reports no recent message, including after checking filtered messages.
  His last visible message was approximately 90 minutes earlier.
- Earlier production email/SMS at 19:55 UTC had been confirmed received. Earlier
  staging message `22f3fc51-a705-419f-b056-156df6945227` at 20:14 UTC was also
  confirmed received. Staging and production are distinct environments.
- Production API task 8 versus 12: same configured sender, region, transactional
  message type and default-template selection. The newer task adds a production
  event configuration set. Secret version references differ; do not claim the
  full deployment or all secret values were identical. Both attempts reached
  the signed SMS hook, and the recent attempt reached the provider.
- Exact sender `phone-441bd84199c549d2879f293084fef7c2`: ACTIVE, SMS-capable,
  US toll-free, international sending enabled. Registration
  `registration-3088f0d5977843f1af061fa909c3ce96` is COMPLETE.
- Account tier is PRODUCTION, not SMS sandbox. The exact recipient was not on
  the sender's `Default` opt-out list. No opt-out record was changed.
- An earlier 21:24 request failed AWS authorization before handoff; that separate
  configuration-set permission defect was fixed. It is not the explanation for
  the 21:31 request's post-handoff non-receipt.

Private detailed evidence remains in
`.recovery-private/production-operator-sms-receipt-20260923.json`. It contains no
OTP. Do not request or log a current authentication code.

## What remains unknown

The available logs cannot prove what happened after the provider's handoff or why
the final delivery report conflicts with the recipient's observation. Do not
diagnose an iOS bug, user settings, or a particular carrier's filtering as proven.

AWS documents internationally enabled toll-free delivery as **best effort**, with
possible downstream replacement of the sender identity. This is relevant to this
US-to-Mexico route, but does not establish the cause of this specific failure.
[AWS country/routing guidance](https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html).

The privacy-preserving event handler intentionally does not retain raw events,
message bodies or downstream carrier fields. Those absent historical details
cannot be reconstructed from this log stream; AWS must trace the message ID.

## Prepared AWS escalation — not submitted

Subject: End User Messaging SMS: final DELIVERED but recipient did not receive OTP

Please trace message `3e73580d-6420-489c-bfe5-c83c86140c55`, AWS account
`427057633951`, us-east-1, sent 2026-09-23 at 21:31:40 UTC to our authorized
operator in Mexico. Final DELIVERED was recorded approximately five seconds later,
but the recipient confirms the message is absent, including filtered messages.
The exact destination can be supplied privately in the approved AWS support case;
do not put a full number or OTP in a public issue.

Originator: `phone-441bd84199c549d2879f293084fef7c2`; configuration set:
`darci-production-auth-sms`. Sender ACTIVE, registration COMPLETE, international
sending enabled, production account, recipient not opted out.

Please identify the terminating carrier/route and any originator rewriting,
validate the final downstream delivery report, investigate filtering or a
misreported DLR, and advise the supported reliable OTP origination path to Mexico.
Earlier operator messages did arrive; this is intermittent, not proof that all
international delivery is unsupported. No message body or OTP is required for
the initial trace.

Read-only `support:DescribeServices` returned `SubscriptionRequiredException`.
The technical Support API is unavailable under current account access/plan.
No support plan was purchased and no case was created. Review Support Center
options with the account owner; any paid plan or alternate paid sender/provider
requires explicit approval before activation.

## Acceptance gate

- Receipt infrastructure remains verified; user-visible delivery does not.
- Keep SMS end-to-end acceptance open until an approved controlled test actually
  reaches the operator and can complete the intended login flow.
- Do not automatically resend ambiguous deliveries or weaken authentication.
- Preserve the existing email sign-in option; this investigation does not change
  linked-account ownership or waive any required email/MFA step-up.
