# Paid client testing in private production — September 25

## Activated and verified — September 27

**Production paid membership is enabled.** The protected release `36174873042` succeeded for revision `9a0c453296ec139677f830df823c7061dc8a1d25`. The application deployment had completed, but the separate runtime/catalog activation had not run; that was the cause of the reported visible Starter plan with purchase unavailable. Logging out could not fix a closed server-side sales gate.

- Activated all six approved v2 prices and removed legacy prices from new purchase availability; existing subscriptions were not changed.
- CloudFormation completed successfully; API/worker are stable with `BILLING_LIVE_ACCESS_MODE=open`, `IOS_MEMBER_CHECKOUT_ENABLED=true`, and billing enforcement retained.
- Authenticated production membership GET returned HTTP 200 at **2026-09-27 22:06 UTC**, with `paymentsReal=true`, all six exact live prices purchasable, and iOS checkout available. Verified using the previously approved synthetic operator's member workspace, not a client account. Its existing active subscription correctly prevents buying a duplicate and permits billing management.
- Added `157.131.202.3/32` and `185.98.169.47/32` to both app/API HTTPS routing; `146.75.154.172/32` was already granted and is preserved. All existing resources/parameters and default-deny routing remain intact. Temporary listener-scoped deployment permission was removed after verification.
- **104 production infrastructure tests passed**, including additive access, duplicate-IP handling and preservation of existing grants.
- No charges, subscriptions or Checkout sessions were created in this pass. A new client's completed payment, physical Apple Pay and installed TestFlight behavior are still client acceptance checks, not claimed as tested here.

Private operational evidence: `.recovery-private/production-private-sales-GknNDe/result.json`, `api-verification.json`, and `.recovery-private/production-tester-access-qpDjVr/report.json`. No credentials are included in this document.

Clients can refresh web billing or close/reopen the membership screen in the current production-configured iOS build. This configuration change requires no additional web deployment or TestFlight binary. A genuinely staging-configured build still needs replacement; production settings do not retarget an installed app.

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
