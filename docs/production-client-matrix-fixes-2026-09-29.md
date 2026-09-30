# Client matrix fixes — September 29, 2026

## Status: configuration live; application fixes ready for release

The client reported successful iOS-to-iOS document flows, with remaining push, checkout-return, certificate-preview and signature issues. This pass does not claim the entire acceptance matrix is complete.

| Issue | Finding and change | Release status |
| --- | --- | --- |
| No production push | API/worker had APNs disabled and no APNs provider selection. Enabled future production push at 100% after confirming zero pending push jobs. Existing alerts were not replayed. | **Live:** API/worker task revision 18; stable CloudFormation and completed ECS rollouts. |
| Jorge's one approved device test | Physical build 23 logs proved Apple supplied a token, but API registration returned 409 because the inactive September 23 operator-test record still held its unique token claim. With explicit approval, cleared only that stale test token, retained the row and added an audit note. The phone then registered normally; its token fingerprint matches the stale claim. | **Passed:** one labeled test sent September 30 at 20:59 UTC, accepted by APNs (HTTP 200), and Jorge confirmed handset receipt. No historical/client notifications replayed. |
| Inactive token blocks a new installation | Deactivation now clears the token. A registration uniqueness conflict may release only the authenticated user's matching inactive token claim, scoped to provider/environment/bundle, and retry once. Active or other-account claims remain protected. | Local backend fix; TypeScript build and 30 focused push/outbox tests passed. Production release required for the general fix. |
| Push/session resilience | Prefer the newer same-account/same-issuer access token; never replace fresh in-memory credentials with an older Keychain copy. Pass the refreshed session directly into foreground push sync. Reset registration after OS failure/sign-out; if the OS never calls back, allow a later foreground retry after 30 seconds instead of suppressing requests indefinitely. This is a reproduced code-level recovery gap, not proof of why this phone missed its callback. | Local code; needs new TestFlight build. |
| Checkout returns to web | iOS now identifies its checkout request. Server returns it to an environment-specific browser bridge with automatic native opening and an explicit “Open DARCi app” fallback. Web checkout retains its existing destination. Membership still comes from server/Stripe confirmation, never the return query. | Local API/web/iOS code; deploy API/web before distributing the new iOS build. |
| Missing trust certificate during iOS signing | Preview choices were filtered using capture obligations, which intentionally hide mirrored certificate signatures. Preview all server-authorized signing outputs without changing the signature obligations. | Local iOS code; new TestFlight build required. |
| Invalid request saving signatures | Web's first save sends `reuseSourceSignatureId: null`; API previously accepted omission but rejected null. Normalize null to absent in capture and upload-request schemas; preserve actual reuse validation. Failed saves explain why those signatures were not available on another device. | Local API code; production release required. |
| Uploaded addendum clips signature label | The 10-point white clearing area overlaps the old label baseline. Raise the label above that area; leave actual document/signature placement unchanged. | Local API code; affects subsequent rendering only. Existing PDFs/signatures were not rewritten. |
| Public verification preview | Jorge explicitly approved anyone possessing the verification link viewing the contents without login, understanding that visible PDFs can be saved. Restore the two-panel verification/preview layout. Return only released, completed, exact-byte-verified final PDFs via short-lived signed URLs. Keep no-store/no-referrer and noindex; never expose internal evidence or identity metadata. | Local API/web code; production release required. |
| Public verification network gate | The existing tester-IP gate also blocked public verification links. Added only host-scoped GET/HEAD `/verify/*` routes on app/API and required static assets. Default-deny, private app routes, client allowlists, images, secrets and billing stay unchanged. | **Live:** three verified listener rules; temporary deployment permission removed. |

## Validation

- Backend: **837 tests in 111 files passed** on September 30; TypeScript build passed. Error-catalog/alert validation passed in the prior matrix pass. The default-concurrency run hit one 5-second timeout in an unrelated document test; the complete rerun with four workers passed without changing test timeouts.
- Web: **79 tests in 15 files passed**, TypeScript check and production Next.js build passed.
- iOS: **130 unit tests passed** on September 30, including certificate preview, native checkout return, environment isolation, credential freshness and the three push-registration recovery tests. This is simulator unit/build evidence, not TestFlight acceptance.
- **108 production infrastructure tests passed**, including four new tests for push-only configuration changes and narrowly scoped public verification routes.
- A synthetic addendum was generated through the actual renderer and visually inspected after rasterization: signature label and date remain readable. No client PDF was used or altered.
- The application code is **not committed, pushed or deployed by this pass**. Live configuration changes above are separate from application release.

## Deployment and retest

1. Commit/release the application changes through normal CI, then run **Deploy Production Candidate** and approve its production environment. A staging redeploy alone does not update production.
2. Generate production iOS configuration and archive **DARCiMobile-Production** for a new TestFlight build. Verify the embedded production endpoints and both native billing-return URL schemes.
3. Save a new typed signature and a new drawn signature on web; sign out/in on the same account in iOS and verify both saved signatures are available. Test OH trust and standalone POA.
4. During CA/OH trust signing on iOS, verify Certificate of Trust, Trust Registration and the applicable POA previews are selectable; signing requirements must remain unchanged.
5. Verify a newly signed uploaded-document addendum does not clip its label. Do not regenerate an existing completed client package to test this.
6. Complete/cancel iOS checkout and verify return to the app, with manual fallback if Safari blocks automatic opening. Do not repeat a real charge solely to test without authorization.
7. Open a completed package's verification URL in a signed-out browser from outside the tester allowlist. It should show only verified final documents; unfinished, held or failed-integrity packages must not expose PDFs. General `/app` access remains private.
8. Confirm an actual workflow push reaches an authorized production device and its tap opens the correct screen. The one operator transport test is separately limited to a fresh registration and one send; provider acceptance is not handset receipt.

## Operational evidence

- Push rollout: `.recovery-private/production-push-rollout-4ICAoB/report.json`.
- Public routes: `.recovery-private/production-public-verification-pY0pL9/report.json`.
- Private deployment evidence is intentionally not committed; it contains configuration snapshots, not a public artifact.
- Operator test runner: `infra/production/operator-push-test.mjs --approved-one-operator-push`. It refuses inactive/multiple/stale devices and an existing send receipt. Do not bypass those guards or resend an uncertain attempt.
- Approved stale test-token release: `.recovery-private/production-operator-push-fixture-release-20260930.json`.
- Single test send receipt: `.recovery-private/production-operator-push-20260929.json` (runner filename retained; actual send timestamp is September 30). **Do not rerun**: APNs accepted the one approved message.

This approval supersedes the earlier metadata-only public-verification policy. It does not make private buckets public, publish unverified PDFs or lift the app's private-production access gate.

## September 30 resumed diagnostics

- Live read-only preflight: APNs remains enabled on API/worker, zero pending push jobs, three active authorized production devices, no active operator token. No new infrastructure changes or test sends.
- The September 25 production archive has `aps-environment=production`, the expected bundle/team identifiers and production associated domain. This checks the local archive, not the installed TestFlight binary.
- The paired iPhone is discoverable; direct device diagnostics initially stopped because it was locked. Requested unlock only, not another logout/login.
- Added missing-callback retry regression coverage and kept native checkout URL schemes in `project.yml` as well as Info.plist so project regeneration cannot discard them.
- Full iOS unit suite passed (130 tests, zero failures); four mobile release-configuration tests and four focused push/public-route infrastructure tests also passed. The first iOS attempt stopped before compilation because yesterday's temporary package checkouts were missing; rerunning with the existing pinned Xcode cache passed. No dependencies were upgraded.
- Once the phone was unlocked, direct console capture identified `apns_token_received` followed by `token_register_failed` with HTTP 409. This supersedes the missing-callback hypothesis for this phone: the retry hardening remains useful, but was not this incident's root cause. The September 23 test script had copied the phone's token into a temporary operator installation and subsequently deactivated it without freeing the database's unique token claim.
- After approved exact-record cleanup, console capture showed `token_register_success` at 20:59:19 UTC. No client row, document, signature, subscription or permission was changed.
- Jorge confirmed receiving the single labeled push. This closes operator transport/handset receipt, not every workflow notification/tap scenario. The general backend conflict fix remains local and must be deployed.
