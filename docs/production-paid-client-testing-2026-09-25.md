# Paid client testing in private production — September 25

## Approval and scope

Jorge clarified that clients **are testing and will continue testing in production** and asked for live membership to work there. This supersedes the staging-only testing decision in the earlier September 25 findings. Purchases use real Stripe payments made by each client; no complimentary entitlement, automatic subscription, test-card live transaction or agent-created charge is authorized.

Approved scope: publish the six previously approved member prices, open hosted Checkout and billing management to authenticated members behind the existing private-production IP gate, and enable the existing iOS hosted-checkout presentation. Keep enforcement, private routing, signup settings, credentials, images and notification settings unchanged except for the separately approved current application release. This is not a public launch or an assertion of Apple App Review / physical Apple Pay acceptance.

| Monthly allowance | Monthly payment | Annual payment |
| --- | --- | --- |
| 3 documents | $9.99 | $99 |
| 25 documents | $19.99 | $199 |
| Unlimited | $59.99 | $599 |

USD; notary fees separate; before applicable taxes. Annual allowances reset monthly. Existing subscriptions retain their contracts and are not migrated by activation. Existing tax configuration is not inferred or changed.

## Operational procedure

1. Require successful exact-revision CI and the protected production image release. A push to master deploys staging, **not production**; use `Deploy Production Candidate` and its GitHub environment approval.
2. Run read-only checks: `node infra/production/enable-private-member-sales.mjs` (Node 24).
3. After the production release succeeds, run `node infra/production/enable-private-member-sales.mjs --approved-private-live-sales --release-run=RUN_ID`.
4. The script verifies the actual release digests, Stripe merchant/payment capability, six exact live-price mappings, enabled signed webhook, restricted Portal settings, approved live database boundary and enforced runtime. It stores the baseline under `.recovery-private/production-private-sales-*`, activates the six catalog rows, retires legacy rows from new sales, then changes only `BILLING_LIVE_ACCESS_MODE=open` and `IOS_MEMBER_CHECKOUT_ENABLED=true` on API/worker via CloudFormation.
5. Verify completed rollout, all six published options, live-mode messaging, authenticated billing status and unchanged private-access rules. No paid checkout is completed by the agent. Physical clients must use the **production-configured** iOS build; server settings cannot turn a staging build into production or install a new TestFlight binary.

Rollback: close `BILLING_LIVE_ACCESS_MODE` and turn off new iOS checkout using a reviewed template derived from the saved baseline while retaining the current image parameters. **Keep live mode, webhook/reconciliation workers and existing entitlements running** so already accepted payments, renewals and cancellations continue to reconcile. Never disable the live webhook or delete paid subscriptions as a rollback. Do not overwrite a newer runtime template without comparing it first.

## Evidence at preparation

- Read-only live preflight passed: all six exact amounts/cadences/allowances, Stripe charges and payouts enabled, one enabled production webhook, and correct live Portal. Detailed account requirements are not visible through this key; no claim of an independent complete account-requirements review.
- Configuration tests prove only the two approved flags change and fail on unsafe/mixed baselines.
- The initial current-revision CI failed one stale email reply-to expectation. The assertion is corrected to the approved support inbox; no email routing or customer messages changed in this fix.
- Deployment, activation and post-deploy results are recorded below when actually completed; preparation does not mean production has been opened.
