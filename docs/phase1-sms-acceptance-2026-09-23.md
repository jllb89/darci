# Phase 1 operator SMS acceptance — delivery NOT passed

One SMS request was explicitly authorized to Jorge's existing staging-linked phone, ending **0675**. No new account, phone reassignment, client message, role change or subsequent resend was performed.

## Observed

- At **02:22:23 UTC**, deployed `POST /auth/otp/phone/start` returned 200, `SMS code sent`, eight-digit-code expectation. The application wrote `auth.otp_requested` with `delivery=phone_sms`.
- Jorge subsequently reported **no SMS received**. Therefore this is request acceptance, **not recipient delivery or successful OTP verification**. No authentication code requested in chat.
- AWS account is outside the SMS sandbox. The configured origination identity is the **ACTIVE US toll-free number**, and `InternationalSendingEnabled=true`. Do not diagnose this as “Mexico unsupported” merely from its US origin.
- No AWS End User Messaging SMS configuration sets were found in us-east-1. The application send does not specify a delivery-events configuration set; `receiveSupabaseAuthSmsHook` discards the returned provider message ID. The older SNS failure-log stream predates this test and is not a delivery receipt for it.
- The SMS hook flag is enabled in the app configuration. That alone does not independently verify the hosted Supabase send-hook/test-number configuration or prove that this request reached the configured AWS transport.
- Available application logs/audit do not establish a terminal carrier result. No applicable SendTextMessage event was found in the inspected CloudTrail event history; absence there is not proof of no send.

## Diagnosis boundary and next action

Root cause remains **unconfirmed**. Possibilities include hosted Auth test-number/hook routing or downstream delivery; do not blame the device/carrier without evidence. AWS documents international toll-free routing as best effort in its [SMS country-support guidance](https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html).

Before another controlled attempt, inspect the project's actual Supabase phone-provider/hook/test-number settings and establish sanitized provider-message correlation plus delivery/failure events. Do not log OTPs, full phone numbers or message bodies. Configure/review the exact AWS event destination/IAM/cost boundary before an external change; there is no approval here to purchase another number, change account linking or switch providers.

Then perform one agreed retry, confirm receipt on Jorge's device and have him enter the code **in the app**. Wrong/expired/replayed-code and any linked-email step-up remain manual acceptance cases. Do not mark Phase 1 SMS passed from HTTP 200.

Private receipts: `/private/tmp/darci-sms-operator23-receipt.json`, `/private/tmp/darci-sms-diagnostic23-receipt.json`. The full number and credentials are not committed.
