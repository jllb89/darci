# Phase 1 operator SMS acceptance — receipt confirmed; login acceptance pending

Jorge explicitly authorized an initial SMS request and then one controlled retry to his existing staging-linked phone, ending **0675**. He confirmed receipt after the retry. No new account, phone reassignment, client message or role change was performed. Receipt is not yet evidence of completing phone login.

## Observed

- At **02:22:23 UTC**, deployed `POST /auth/otp/phone/start` returned 200, `SMS code sent`, eight-digit-code expectation. The application wrote `auth.otp_requested` with `delivery=phone_sms`.
- Jorge reported **no SMS received** for the initial request. That initial result established request acceptance only.
- On the separately authorized retry at **2026-09-23 03:21:55.398 UTC**, the same endpoint returned HTTP 200, `SMS code sent`, an eight-digit-code expectation and a 60-second cooldown. Request ID: `f2cf5031-c3ab-4942-a82f-bd78d12eae0b`.
- Jorge then confirmed **“code arrived!”**. Recipient delivery is confirmed for this retry. Correct-code login, wrong/expired/replayed-code behavior and any linked-email step-up have not been confirmed by this receipt. No authentication code was requested in chat.
- AWS account is outside the SMS sandbox. The configured origination identity is the **ACTIVE US toll-free number**, and `InternationalSendingEnabled=true`. Do not diagnose this as “Mexico unsupported” merely from its US origin.
- No AWS End User Messaging SMS configuration sets were found in us-east-1. The application send does not specify a delivery-events configuration set; `receiveSupabaseAuthSmsHook` discards the returned provider message ID. The older SNS failure-log stream predates this test and is not a delivery receipt for it.
- The SMS hook flag is enabled in the app configuration. That alone does not independently verify the hosted Supabase send-hook/test-number configuration or prove that this request reached the configured AWS transport.
- Available application logs/audit do not establish a terminal carrier result. No applicable SendTextMessage event was found in the inspected CloudTrail event history; absence there is not proof of no send.

## Diagnosis boundary and next action

Root cause remains **unconfirmed**. Possibilities include hosted Auth test-number/hook routing or downstream delivery; do not blame the device/carrier without evidence. AWS documents international toll-free routing as best effort in its [SMS country-support guidance](https://docs.aws.amazon.com/sms-voice/latest/userguide/phone-numbers-sms-by-country.html).

The successful retry does not establish why the first attempt failed or prove provider failure observability. Remaining diagnostics are the project's actual Supabase phone-provider/hook/test-number settings and sanitized provider-message correlation plus delivery/failure events. Do not log OTPs, full phone numbers or message bodies. Configure/review the exact AWS event destination/IAM/cost boundary before an external change; there is no approval here to purchase another number, change account linking or switch providers.

No additional SMS send is needed to establish this receipt. Complete phone login **in the app**, plus the remaining wrong/expired/replayed-code and any linked-email step-up acceptance cases in the release checklist. Do not mark all phone-auth acceptance passed from receipt alone; do not send further codes without a request.

Private receipts: `/private/tmp/darci-sms-operator23-receipt.json`, `/private/tmp/darci-sms-diagnostic23-receipt.json`. The full number and credentials are not committed.
