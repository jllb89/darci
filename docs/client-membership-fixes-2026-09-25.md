# Client testing: membership and notary application fixes

Status: implemented and validated locally; not committed, deployed or uploaded to TestFlight in this pass. No migrations are required. No subscriptions, entitlements, payment gates or customer records were changed.

## Findings and changes

1. **Become an illuminotary did nothing.** The signed-in iOS shell supplied an empty callback. It now opens the existing notary application at `/app/settings` in the matching environment. The screen explains that this is a web handoff and may require sign-in. No session token is placed in the URL. The web authentication redirect now retains the requested destination so login does not discard that application link. This does not grant a notary role or bypass application review.
2. **Membership plans disappeared with partial catalog rollout and closed checkout.** Production has only Starter monthly v2 active. The API required all six active v2 prices before returning any, so it hid that only published price. Both storefronts additionally filtered on purchase permission. The read API now handles a partially published v2 catalog and separately reports `visibleInCatalog`. Published offers remain visible with purchasing disabled; inactive offers are not invented or activated. Retired offers remain hidden from new-plan selection. Purchase permission remains server-enforced. iOS also has explicit loading, empty/error retry and support actions, and can retry an initially failed load on return to the foreground.
3. **The web form obscured the actual membership denial.** Draft bootstrap errors were swallowed, allowing users to fill an unpersisted form before hitting “Missing context.” The form now stops on bootstrap failure, preserves the server's billing reason, links to membership and offers a retry. Other failures are not mislabeled as missing subscriptions. A new member/pro dashboard prompt makes billing discoverable. An entitlement lookup outage explicitly does not advise buying another membership.
4. **Production was mislabeled as test mode.** Web and iOS membership labels now follow the API's payment environment. Production no longer promises “no real charge.” Membership support links use the approved operator inbox.

## Deployed configuration checked read-only

On September 25, production API revision `darci-production-api:15` was active with two running tasks:

- `APP_ENV=production`
- `STRIPE_PROVIDER_ENVIRONMENT=live`
- `BILLING_ENFORCEMENT_MODE=enforced`
- `BILLING_LIVE_ACCESS_MODE=closed`
- `IOS_MEMBER_CHECKOUT_ENABLED=false`

This configuration still prevents unsubscribed production testers from creating workflows. Showing the catalog does not provide an entitlement. **Owner decision confirmed September 25: keep production paid; use staging for free subscription tests.** No complimentary production access or live rollout is included in these fixes. General production checkout remains closed until separately authorized. The prior “PRIVATE BETA” screenshot label alone cannot identify the client's environment because that label was hardcoded.

Staging API revision `darci-staging-api:122` was active with one running task, `APP_ENV=staging`, `BILLING_ENFORCEMENT_MODE=enforced` and `IOS_MEMBER_CHECKOUT_ENABLED=true`. With no explicit provider override, the backend uses test mode. The team must use the staging-configured TestFlight build and `https://app.staging.darciregistry.dev`, not the production app/site, for free subscription testing. A test subscription is still required; enforced does not mean unlimited free access without a plan.

Read-only secret-mode and database checks confirmed the deployed staging key is test mode and the production key is live mode (no keys printed). **Staging still publishes the three legacy prices.** All six approved new test Prices and their verified mappings/portal passed `verify-stripe-member-catalog.ts --prepared`, but their DARCi catalog rows remain inactive. Their activation is a separate rollout step after the compatible TestFlight release, as documented in `member-pricing-v2-rollout-2026-09-23.md`. No catalog activation occurred in this pass. Production has Starter monthly v2 published and the other five v2 rows inactive; its closed checkout gate was preserved.

## Verification

- Full web suite: **78 tests passed**; web TypeScript check passed.
- Focused backend membership/catalog, enforcement, checkout and document-creation suite: **29 tests passed**; backend TypeScript check passed.
- iOS build and focused suites: **24 unit tests and 1 billing-screen UI test passed** on iPhone 17 Pro / iOS 26.2.
- Coverage includes closed live checkout with six published offers visible; a one-price partial production rollout; hidden retired prices; retries after a failed initial iOS load; no purchase from a read-only plan; membership denial classification; and environment-safe application links.

## Release and client retest

Deploy API and web changes together, then ship a new TestFlight build. Existing TestFlight clients still filter on the old purchase flag until updated.

1. Tap “Become an illuminotary”; sign into the web app if prompted and confirm it returns to the application form.
2. Open billing without membership: verify the currently published plans, correct environment label and an explicit closed-checkout message where applicable. Verify all six new prices/monthly–annual selection after the separate catalog activation.
3. Test a network failure and retry on the iOS billing page.
4. On web, open a POA or trust form without membership: the membership notice must appear before editable contract fields. Follow its billing link, then use retry after an approved membership change.
5. With an entitled member, confirm creation and existing billing management still work. Do not perform live purchases until that separate rollout is approved.
