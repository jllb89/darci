# Production member test findings — 24 September

## Login

Jorge confirmed the generic login failure occurred while his phone had fallen back
to cellular, outside the private-production IP allowlist. After restoring Wi-Fi,
he completed account setup and generated a POA on production build 22. This is an
actual production-device login/product result, not full SMS/email recovery or push
acceptance. No network access was widened.

## Existing documents and membership

Read-only production checks matched the signed-in account to the approved operator
fixture used for notification and live-billing acceptance.

- Old document `d5f09f5c-74de-4627-aad2-7904345f6cf0` exactly matches the preserved
  notification fixture in `.recovery-private/production-product-notification-20260923.json`.
  The screenshot repeats its same short ID under Recents, US/CA and Document
  notarizations; it is not three distinct documents.
- `[DARCi TEST]` notification titles correspond to the isolated operator drills.
- The newly created POA is `82801382-f6c3-4f2d-8750-ab32f0ad17b0`, created 24 September.
- The real $9.99 Starter subscription remains **active until 23 October 2026,
  22:03 UTC**, with cancellation at period end (no renewal). Payment was not refunded
  or the paid period shortened.
- Live entitlement: **3 total, 1 used, 2 remaining**. POA creation was counted.
- The iOS coordinator intentionally hides the subscription-offer home card for active
  memberships. That explains this account's missing green signup card. Billing status
  remains accessible through the profile's membership/billing screen.

No documents, notifications, subscriptions or entitlements were deleted or modified.

## Separate enforcement gap — corrected in production

The initial live API had no `BILLING_ENFORCEMENT_MODE` task variable or secret binding, so
`billingPolicyService` used its **observe** default. This tracks usage but does not
block unsubscribed/over-limit new workflows. The successful paid-user test cannot
prove enforcement. General purchases remain closed and `IOS_MEMBER_CHECKOUT_ENABLED`
is false.

Jorge explicitly approved **enforced** production billing while preserving closed signup,
new purchases, paid entitlements, accepted-work continuity and held-final protections.
The scoped API/worker configuration rollout completed at **17:37:53 UTC** on
**API15/worker15**. Both services are fully running with `BILLING_ENFORCEMENT_MODE=enforced`;
CloudFormation is `UPDATE_COMPLETE`. Exact-template readback confirms application
images, secret versions and all other configuration are unchanged.
Evidence: `.recovery-private/production-billing-enforcement-xOzNL0`.
Readback during rollout confirms the operator remains active with **1 of 3 used**,
cancellation still at period end, and API health returns 200. No purchase activation.

Six additional mocked-policy regressions prove nonmember/inactive/exhausted denial,
two remaining units for a paid member, genuine Unlimited access, and the observe/enforced
distinction. These are policy tests, not a claim of full hosted unpaid-user UI acceptance.

## Notification email redesign — local, not deployed

The old shared wrapper referenced an SVG hosted behind the private app gate and
hardcoded the old support inbox. The new shared notification wrapper uses:

- Text DARCi wordmark; no remote logo/font dependency or added public asset routes.
- Green brand header, lighter headline, readable spacing, responsive layout and
  explicit dark-mode styles, preserving plaintext alternatives.
- Clear **Review documents** button for the existing review template, preserving its
  destination and review instructions. No database template migration required.
- Footer contact derived from configured Reply-To, defaulting to Jorge's approved
  inbox. Existing from/to/reply-to delivery selection is preserved.

This updates templated product notifications. Authentication's separately implemented
OTP/recovery email layouts are not redesigned in this pass.

Validation: **48 focused email/billing tests and 99 infrastructure tests pass**;
backend TypeScript check passes.
Mobile 390px light/dark and desktop 900px browser renders have no horizontal overflow;
previews were visually inspected. Actual Gmail/Outlook rendering is not yet claimed.
Initial test attempts hit local Node20/loopback restrictions; the successful run used
Node24 and loopback permission. No production email was sent.

Local preview: `/private/tmp/darci-email-preview/document-review.html`.
Regenerate with `node -r ts-node/register scripts/preview-notification-email.ts` from
`backend` using the project's Node runtime. Deploy the reviewed API/worker code through
the production workflow to apply the design to future notifications; existing emails
will not change. No TestFlight rebuild is needed for this email change.
