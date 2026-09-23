# DARCi web + TestFlight release acceptance checklist

Status: **test instructions, not a record of passed tests**. Owner: Jorge. Environment: staging API/web, Stripe test mode, new TestFlight build. Production and real cards/charges are outside this exercise.

The proposed $9.99/$19.99/$59.99 monthly and $99/$199/$599 annual catalog is **not implemented yet**. Test the deployed catalog as displayed; execute section 13 only after the pricing proposal is approved, implemented and deployed. A TestFlight upload now will not magically include the proposed plans.

## How to run and report

- Record web release SHA, TestFlight version/build, device model/iOS version, browser, date/time/timezone and text-size/Display Zoom settings.
- Use new, clearly labeled test documents/accounts, not completed client packages. Use synthetic identity information and PDFs labeled TEST / NO LEGAL EFFECT. Do not alter historical damaged PDFs or manufacture legal evidence.
- Actors: member/document owner; a different invited signer; assigned CA notary; assigned OH notary; unrelated member; wrong/unassigned notary; operator/admin. Notaries and invited signers do not buy a subscription for those roles.
- Use at least two physical iPhones for mobile-to-mobile work, including the client's larger-text configuration. Run the web side in Safari and Chrome; check narrow/mobile web layouts too.
- Mark each case PASS, FAIL, BLOCKED or N/A with a reason. A feature not offered by the build is not automatically a pass.
- For a failure, send: case ID, steps, expected/actual result, IDN/document/request ID, actor role, platform/build, timestamp and screenshot/screen recording. Include any displayed correlation/reference ID. **Do not send OTPs, session tokens, full identity numbers, signatures or private PDF URLs.**
- Stop a case immediately for another person's document/identity exposure, incorrect signed/final bytes, false completion, duplicate charge/subscription, or repeated quota consumption. Preserve evidence; do not delete/regenerate the affected package.

## 1. Installation, navigation and accessibility

- [ ] NAV-01 Clean install: onboarding opens; no prior user, stale session or production endpoint is inherited.
- [ ] NAV-02 Upgrade over the existing TestFlight build: session, documents and selected profile survive normally; forced reauthentication is intelligible if required.
- [ ] NAV-03 Home, Documents, Requests, notifications/search, profile and settings navigation work; back/dismiss returns to the expected place without losing work.
- [ ] NAV-04 Home header through “Welcome to DARCi” stays fixed while the product content scrolls; no overlap with status/navigation bars.
- [ ] NAV-05 Repeat auth, intake, document review, signing, notary selection, venue/identity forms, session completion, membership and settings at default and largest accessibility text, Bold Text and Display Zoom. All text/actions remain reachable; no cropped primary button.
- [ ] NAV-06 Show the keyboard in every critical form, especially venue/address and special instructions. Scroll, dismiss keyboard and reach Save/Continue without changing phone settings.
- [ ] NAV-07 Sheets with long content/notary lists scroll; their primary action remains reachable. Long names, emails, addresses and document titles wrap/read correctly.
- [ ] NAV-08 VoiceOver: meaningful labels, reading/focus order, selected state, error announcements and usable signing alternatives where supported. Record any inaccessible mandatory action.
- [ ] NAV-09 Light/dark system appearance, black profile/billing background and green membership container retain readable contrast. Maison Neue/ABC mono and light weights remain consistent; no unintended letter spacing.
- [ ] NAV-10 Loading, empty, offline and error states offer understandable next steps; no permanent spinner, blank screen or disabled action with no explanation.

## 2. Accounts, authentication and profile isolation

- [ ] AUTH-01 New email signup and returning email login: one delivered code, successful entry, correct account and documents.
- [ ] AUTH-02 Phone login on an existing linked account: SMS arrives, correct account opens; any required email step-up identifies a usable recovery path. No accidental second account or reassignment of a phone owned by another account.
- [ ] AUTH-03 Wrong, expired and reused code: clear rejection, no logged-in session, resend after cooldown works. Rapid resend does not flood email/SMS.
- [ ] AUTH-04 Phone/email verification and account linking: verify success, already-associated conflict and unavailable provider behavior. Never detach a client's number to make a test pass.
- [ ] AUTH-05 Incomplete profile: required name/email/phone steps are reachable and persist after restart. Cancel/retry must not strand the user.
- [ ] AUTH-06 Save personal information, including international phone and long names; reopen and compare web/iOS. Invalid input is explained without losing valid fields.
- [ ] AUTH-07 Stay signed in beyond token expiry, then open documents, review, sign and enter IPEN. No forced logout or false “Insufficient permissions” when refresh succeeds.
- [ ] AUTH-08 Refresh several screens quickly while backgrounding/foregrounding the app; repeat while switching Wi-Fi/cellular. No competing refresh failures or duplicate requests with lasting effects.
- [ ] AUTH-09 Airplane mode during refresh, then reconnect: temporary error/retry preserves the session; a real revoked session requires login.
- [ ] AUTH-10 Sign out, use Back, reopen a deep link and relaunch: protected account data stays inaccessible. Sign in as a different member: no previous user's PDFs/profile/billing state remains.
- [ ] AUTH-11 Account with member and notary grants: switch roles repeatedly, including after backgrounding. Requests and permissions match the selected role; refresh never resurrects a revoked role.
- [ ] AUTH-12 Password recovery or other auth methods only if offered: valid recovery returns to the right account; invalid/expired links fail safely.
- [ ] AUTH-13 Delete-account flow on a **disposable account only**: cancel first, then complete; confirmation and logout work, reaccess is denied. Retained legal/audit records must not be described as automatically erased.

## 3. Membership and payment experience — current deployed catalog

- [ ] BILL-01 No subscription: membership entry after signup/login, home CTA and profile entry all open the right paywall. Returning to the app does not trap users in repeated modals or block accepted invitations/work.
- [ ] BILL-02 Notary-only and invited-signer work has no paywall or quota charge. A notary acting separately as an owner follows the member policy.
- [ ] BILL-03 Cards, benefits, amount, currency, cadence and allowance agree with Checkout and the active-plan screen. No stale fallback prices become purchasable during a catalog error.
- [ ] BILL-04 Checkout success with a Stripe test payment: return/deep link works both warm and after app termination; membership activates after server confirmation, not merely a success redirect.
- [ ] BILL-05 Cancel/Back from Checkout: no false activation; retry does not create duplicate subscription/payment sessions.
- [ ] BILL-06 Decline and additional-authentication-required cases: clear error/action; no allowance before confirmed entitlement. **I can prepare test fixtures/payment scenarios; no manual Stripe CLI work is required from the team.**
- [ ] BILL-07 Apple Pay on a supported physical device/test-mode flow: sheet amount/currency, cancel, approval and app return. If unavailable, record the actual reason; do not treat card Checkout as proof of Apple Pay or Apple review approval.
- [ ] BILL-08 Active membership screen: correct plan, used/remaining allowance, reset date, renewal/payment date, scheduled changes and cancellation state; styling fits the black profile section.
- [ ] BILL-09 Billing portal: payment method, billing details and invoices/receipts available as configured; return to the same account/app; another member's billing cannot be opened.
- [ ] BILL-10 Upgrade: show the intended price/payment effect, synchronize after payment, retain already-used quota; retry/double tap makes one change.
- [ ] BILL-11 Downgrade: scheduled effective date is correct; current paid allowance remains until that date; no duplicate schedules.
- [ ] BILL-12 Cancel at renewal: access lasts through the paid period. Resume/cancel-cancellation, if offered, restores the appropriate renewal state.
- [ ] BILL-13 Last allowance unit: submit two different drafts from web/iOS together; only the permitted number starts. Retry the successful submission: no extra unit consumed.
- [ ] BILL-14 Draft creation/editing/preview, regeneration, multiple Trust artifacts, signatures, notary steps and downloads do not consume extra units. Each first accepted workflow consumes exactly one.
- [ ] BILL-15 Inactive/exhausted membership blocks new submitted work with understandable recovery, not loss of drafts or an unrelated permission error.
- [ ] BILL-16 Previously accepted work continues through signing and the notary's session after lapse. Newly finalized package is held from member/signer access until eligible again; already released documents remain available.
- [ ] BILL-17 Reactivate membership: held package becomes accessible with the **same IDN/version/bytes**, no new signing/notarization or usage charge. Operator verifies hashes.
- [ ] BILL-18 Network loss during Checkout/plan change: reopen/retry safely, one resulting change, no optimistic false success. Web and iOS eventually agree.

Renewal, lapse, failed invoice, scheduled downgrade and disputed/late payment cases require prepared test-mode fixtures/time advancement. Ask me to run those; do not wait a month or change client subscriptions.

## 4. Required complete product/jurisdiction/platform matrix

Run each cell as one new end-to-end test. “Owner → notary” names the platform used by each. Include a separate invited signer wherever the product/roles require one; cover web and iOS invite claiming across the matrix. These are **32 workflow combinations**, not 32 manual Stripe purchases.

| Jurisdiction / product | Web → web | iOS → iOS | Web → iOS | iOS → web |
| --- | --- | --- | --- | --- |
| CA Trust package | [ ] | [ ] | [ ] | [ ] |
| CA standalone POA | [ ] | [ ] | [ ] | [ ] |
| CA upload, continue to sign | [ ] | [ ] | [ ] | [ ] |
| CA upload, without signature | [ ] | [ ] | [ ] | [ ] |
| OH Trust package | [ ] | [ ] | [ ] | [ ] |
| OH standalone POA | [ ] | [ ] | [ ] | [ ] |
| OH upload, continue to sign | [ ] | [ ] | [ ] | [ ] |
| OH upload, without signature | [ ] | [ ] | [ ] | [ ] |

For every cell, record its IDN and confirm intake → rendered/uploaded review → required signatures → notary choice/approval → in-person prerequisites → acknowledgment/finalization → correct authorized access/public verification. Test no-signature uploads without inventing a mandatory signature step. Physical co-presence uses real consenting testers; all document/identity content remains synthetic.

## 5. Intake and document rendering

- [ ] DOC-01 Each product entry opens the correct form; only supported jurisdictions/options are offered. Switching product/jurisdiction does not retain incompatible fields silently.
- [ ] DOC-02 Required/conditional fields, dates, party counts/roles and address validation work; Back/Next, save/resume and relaunch preserve intended answers.
- [ ] DOC-03 Trust: every expected output is present; party names/roles and dates agree across artifacts. Internal trust artifacts stay out of ordinary standalone review where intended while remaining in the final package as specified.
- [ ] DOC-04 Independent POA: **special instructions** accepts empty, multiline and long text on iOS/web, persists and renders in the right section without clipping or omission.
- [ ] DOC-05 Long names/addresses, punctuation, accents and Unicode render correctly. Unfilled optional values do not appear as raw template tokens or “undefined.”
- [ ] DOC-06 Edit before approval and regenerate: newest correct output shown, obsolete review does not authorize a different version, no extra usage from rendering retries.
- [ ] DOC-07 Uploaded PDFs from Files/iCloud and supported share/import paths: correct file, page count/orientation/size; cancel/reselect does not submit the wrong file.
- [ ] DOC-08 Normal multi-page, scanned/image, rotated, mixed-size and permissions-protected readable PDFs: display before and after signing/finalization in both Apple PDFKit and browser.
- [ ] DOC-09 Password-required/locked, malformed, empty and non-PDF files: clear safe rejection or supported password handling; never publish an unreadable final or report success from an error page.
- [ ] DOC-10 Oversized/too-many-page files: useful limit error, no app freeze, no false completion/usage charge. Operator can supply prepared boundary fixtures; do not manufacture hundreds of client files.
- [ ] DOC-11 Upload/render interrupted by connectivity loss or termination: explicit retry/recovery, no duplicate submission or endless spinner.

## 6. Review, signatures and invitations

- [ ] SIGN-01 Every required visible output must be reviewed before approval; tab switching, zoom, scroll and page count work at large text.
- [ ] SIGN-02 Owner signature: consent, draw/clear/retry, placement and submission work; reopen confirms it on the intended version/page only.
- [ ] SIGN-03 Invited signer: invitation arrives at the intended test inbox, opens on web and iOS, and returns to the correct document after signup/login.
- [ ] SIGN-04 Cold/warm app universal links, expired/revoked links, wrong-account opening and forwarded links have correct outcomes; wrong recipient cannot claim or sign.
- [ ] SIGN-05 Open/claim the same invitation on web and phone together: one binding, safe repeat, no duplicated signers/signatures.
- [ ] SIGN-06 Multiple signers, required ordering/roles, reminders/resend/revoke where offered: correct status and recipient; no charge to signers or new workflow unit.
- [ ] SIGN-07 Back/reopen or double-tap capture/approval: no duplicate signature or premature “all signed.” A failed submit does not lose the recoverable draft signature unnecessarily.
- [ ] SIGN-08 Switch account/profile or lose connectivity during signing: no other person's signature/data reused; reconnect resumes safely.
- [ ] SIGN-09 Upload **continue to sign** specifically: original PDF and resulting signed PDF both load, and notary selection can proceed. Repeat CA/OH on mobile-to-mobile (original regression).
- [ ] SIGN-10 Upload **without signature**: skips signing correctly and reaches the same notarization flow without missing-file errors.

## 7. Notary eligibility, requests and contact exchange

- [ ] NOT-01 Notary list matches jurisdiction/eligibility; wrong-jurisdiction notaries cannot be selected. Search/selection/large-text list and confirmation work.
- [ ] NOT-02 Owner sends one request; assigned notary receives it with correct document/member/status. Repeat taps do not create duplicates.
- [ ] NOT-03 Assigned notary opens and reviews the readable PDF; unrelated/wrong notary cannot take over by URL, IDN or legacy code.
- [ ] NOT-04 Accept: correct contact details shared with the authorized parties and next steps explain arranging the in-person session externally. No invented booking/calendar requirement.
- [ ] NOT-05 Reject: reason/state returns to the member; any permitted reselection works without losing signatures or consuming new usage.
- [ ] NOT-06 Requests, notification badge and document status synchronize across web/iOS; foreground/reload reconnects after missed realtime events.
- [ ] NOT-07 Switch notary/member profiles and reopen the accepted session after token refresh: no stale “Insufficient permissions” requiring logout as a workaround (original regression).
- [ ] NOT-08 Save notary profile/jurisdiction/commission/signature/seal details where offered; invalid/missing required values prevent completion clearly. No self-granted authorization.

## 8. In-person session, identity and venue

- [ ] IPEN-01 Only the assigned authorized notary starts the session; member sees the matching live session and readable document.
- [ ] IPEN-02 Member check-in/location permission accepted: both real devices at the same place advance according to the configured accuracy/freshness requirements.
- [ ] IPEN-03 Location denied, approximate, stale, unavailable, or devices apart: clear retry/instructions; never falsely pass co-presence or silently bypass requirements.
- [ ] IPEN-04 Background/reopen/network interruption on either device during each step: state resumes consistently; notary does not repeat completed evidence or create a second session.
- [ ] IPEN-05 Identity type and jurisdiction-dependent required fields validate; long input and large text remain usable. Save/reopen works without exposing full sensitive values in ordinary member screens or notifications.
- [ ] IPEN-06 Venue state/county/city/address/location label: autocomplete and manual completion work; current-location failure has a usable manual path. Keyboard never covers the only Save/Continue action.
- [ ] IPEN-07 Required venue/identity/check-in/notary evidence cannot be skipped by quickly advancing, back navigation or reloading.
- [ ] IPEN-08 Acknowledgment preview contains correct document/person, CA/OH venue, date and notary information; signature/seal do not overlap or clip. This includes human legal/content review, not just PDF readability.
- [ ] IPEN-09 Finalize once, double tap, disconnect during submit and reopen: no duplicate acknowledgment/seal, false success, extra usage or changed previously published bytes. Escalate uncertainty; do not manually regenerate completed evidence.
- [ ] IPEN-10 Member sees final status after notary submits on another device. PDF opens/downloads on member and authorized notary surfaces—repeat CA/OH (original completed-package regression).
- [ ] IPEN-11 Copy after completion describes hash verification truthfully, not a fictitious external-ledger anchor or an ongoing session/recording that is already finished.

## 9. Final packages, document lists and public verification

- [ ] FINAL-01 Original/source, signed outputs, acknowledgment and final package have correct identities/page counts and no blank “cannot preview” panel. Inspect each page, not only the thumbnail.
- [ ] FINAL-02 Authorized download/share/export works from document, review/signing and session surfaces as permitted; downloaded bytes are actual PDFs, not login/error HTML.
- [ ] FINAL-03 Held membership: member/signer cannot obtain a new final/acknowledged PDF through another app screen; accepted pre-final work stays accessible. Assigned-notary/admin access follows their authorized duties, not member billing UI.
- [ ] FINAL-04 Previously released document remains accessible after cancellation; newly held document releases only when eligibility returns. Operator checks exact SHA-256/version consistency.
- [ ] FINAL-05 Public verification link in a logged-out browser shows permitted released status/hash only; no PDF preview/download, signed URL, identity number or private contact details. Held/unverified/unknown IDNs never falsely claim verified completion.
- [ ] FINAL-06 Other-member links, revoked signer and direct private Storage access are denied. A signed bearer URL's lifetime is a separate security property; do not assume logout invalidates an already-issued URL immediately.
- [ ] FINAL-07 Document list/detail, search/filter/status, empty results and navigation show correct items. Long titles and many documents do not hide controls; reopen after app restart has the latest final version.
- [ ] FINAL-08 Current synthetic outputs must be readable. Historical beta exceptions stay separately classified; do not overwrite old PDFs to make the new release appear clean.

## 10. Notifications, settings and support

- [ ] NTF-01 Email invite, request accepted/rejected, contact exchange, session and completion notifications arrive at the correct consenting tester, match the event and link to the correct environment/document.
- [ ] NTF-02 Notification center, unread state/badge and opening a notification work after cold launch, while logged out and after switching profile; no cross-account residue.
- [ ] NTF-03 Push permission allow/deny and foreground/background delivery on a physical TestFlight device; denial does not block app use. Record configured event coverage, not an assumption that every email also sends push.
- [ ] NTF-04 Notification preferences, if offered, persist and affect only intended channels; no duplicate sends after refresh/retry.
- [ ] NTF-05 Support contact, privacy/terms links, app version and back navigation work. Legal copy matches the approved feature/retention/payment behavior.

## 11. Operator-assisted checks — I handle infrastructure and fixtures

These are not instructions for Jorge to perform database edits, kill shared services or learn Stripe CLI. Already-passed receipts remain valid for unchanged code; repeat impacted cases after a change.

- [ ] OPS-01 Confirm deployed API/worker/web revisions, readiness, test-mode keys/Checkout, all eight alarms and no unexpected backlog.
- [ ] OPS-02 Admin/browser MFA, rejected non-admin/AAL1 access, recent reauthentication, reason-bound actions and no OTP/setup-secret leakage.
- [ ] OPS-03 Actual test renewal/failure/action-required/downgrade/upgrade/cancellation, webhook delay/duplicate/out-of-order and reconciliation; verify member UI with the resulting fixtures.
- [ ] OPS-04 Safe replay/resync/release/usage reversal is scoped, audited and idempotent; never a client-data experiment.
- [ ] OPS-05 Correlate any team-reported auth/PDF incident to request/time/IDN; run targeted recovery without changing evidence. Verify critical alert and recovery route without repeated unnecessary email drills.
- [ ] OPS-06 Backup freshness, isolated PDF/data restore, durable queue recovery and exact hashes; no client queue replay. Existing restore proof does not authorize destructive production testing.

## 12. Release decision

- [ ] Every required matrix cell and critical failure case has a result/evidence link; rerun affected cases after fixes.
- [ ] No open unauthorized access, unreadable newly finalized PDF, false completion, double usage/charge or stranded accepted workflow.
- [ ] Policy/content reviewer explicitly accepts CA/OH specimens, identity retention/legal holds, member billing/held-package terms and public copy.
- [ ] Production configuration/keys/domains and Apple distribution/purchase review are separately accepted before launch. TestFlight success is not App Store approval.
- [ ] Jorge records pass/fail and outstanding issues. Do not set the lifecycle acceptance flag simply to clear a warning.

## 13. Additional tests AFTER approval/implementation of new pricing

- [ ] PRICE-01 All six tier/cadence choices agree across web, iOS, Checkout, Portal, invoice and operator view; old-client behavior is safe and intentional.
- [ ] PRICE-02 Annual plan charges the full approved annual amount once, not its monthly equivalent; renewal date is annual, allowance reset date monthly if that proposal is approved.
- [ ] PRICE-03 Annual finite allowance resets monthly without a new invoice; no full-year quota up front, no rollover, no duplicate/missed reset after downtime or repeated webhooks. Include month-end/leap-year boundaries with test clocks.
- [ ] PRICE-04 Unlimited user completes more than 25 workflows without quota denial; usage remains audited. Unsubscribed/misconfigured account cannot be mistaken for unlimited. File/page/concurrency abuse limits still apply.
- [ ] PRICE-05 Same-cadence upgrades, scheduled downgrades, monthly→annual and annual→monthly have correct effective dates, paid amounts and preserved current-month usage. Failed payment gives no unearned upgrade.
- [ ] PRICE-06 Annual cancellation retains access until annual paid-through date, with monthly allowance windows until expiry; lapse/held/release behavior unchanged.
- [ ] PRICE-07 Unlimited→finite preserves current-window usage; annual duplicate events do not reset that usage. Tier/cadence changes cannot manufacture quota.
- [ ] PRICE-08 Existing beta subscriptions/history remain unchanged unless individually authorized; fresh production starts with only the approved six prices.
- [ ] PRICE-09 Decline, refund/support exception, partial-period change, provider outage/recovery and reconciliation cover annual/unlimited—not just the old monthly catalog.

## Result template

```text
Case / matrix cell:
PASS / FAIL / BLOCKED / N/A:
Web revision + TestFlight version/build:
Device / OS / browser / text-size settings:
Actor role / jurisdiction / product:
IDN + document/request ID:
Time and timezone:
Steps:
Expected:
Actual:
Screenshot/recording + safe error reference:
```
