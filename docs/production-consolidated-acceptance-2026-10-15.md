# Consolidated production acceptance — 15 October 2026

## Decision and scope

**Later same-day closeout:** representative-volume production recovery/RTO has
passed: **266 exact objects / 254 readable PDFs / 51 matching hashes**, ten
functional groups, three selective queue groups and 32 access requests. Conservative
complete exercise including key follow-up **23m29**, snapshot age **10h35**;
both within the 4h/24h objectives. No stored identity ciphertexts existed; key
usability/context was synthetic and matched local production configuration.
[Recovery evidence and boundaries](production-recovery-rto-2026-10-15.md).
Jorge approved the new Terms and the three limited Privacy corrections; local
implementation is complete, publication/production readback and a new native build
are still pending. The findings below retain the original hosted scan evidence.

**Engineering pass completed — not a blanket launch sign-off.** Fourteen hosted
checks passed and the required Terms-link check failed. Engineering checks are
recorded below; the device/product checklist remains for Jorge and consenting testers.
No new charge, subscription change, customer message, privilege, client document,
signature, infrastructure setting or App Review submission was made by this pass.
Public verification reads append their normal audit records. Temporary copies used
for native PDF parsing were removed; original PDFs were never rewritten.

Production application revision: **`5b90a27`**; documentation/source checkout:
`0bc6af7`. API29 / worker29 / web18, desired and healthy tasks **2 / 1 / 2**.
[Protected production release](https://github.com/jllb89/darci/actions/runs/38778977891).
Both the release's [CI](https://github.com/jllb89/darci/actions/runs/38778978972)
and the later docs-only [CI](https://github.com/jllb89/darci/actions/runs/38782696953)
passed, including the disposable database-security job.

### Finding to resolve before sign-off

**AC-01 — broken Terms link.** iOS login links to
`https://darciregistry.com/terms`, which redirects to
`https://app.illuminotary.com/terms` and returns **HTTP 404**. Direct
`https://illuminotary.com/terms` reaches the same missing page. Privacy returns 200.
The native Terms screen also still includes “Interface copy for review. Final
legal terms should be approved by qualified counsel.” This is a publication/copy
gap, not a request to repeat the already-recorded commercial/legal approval.
Publish the exact approved terms at the stable URL and reconcile the native copy;
do not invent substitute legal terms. No application fix/deployment was made here.

**AC-02 — cosmetic:** the web sign-in footer still says © 2024. The fresh-browser
smoke reached the working email/phone sign-in form; Google is visibly disabled as
unavailable. No code was sent and no reviewer/client session was used. Signed-out
`/app/settings` redirected to `/start?returnTo=%2Fapp%2Fsettings`, with no profile
data visible. This is browser smoke, not full authenticated UI acceptance.

### Existing gates and deliberate limits

- **Signup is still closed** (`disable_signup=true`); existing email/phone login
  is enabled. Test with existing approved accounts. Public new-user registration
  requires an explicit rollout decision and a separate registration test; a public
  website does not mean signup is open. This pass did not enable it.
- General live purchases are **open**; iOS Checkout is enabled and billing is
  **enforced**. Accepted Stripe events and notifications are processed by the
  worker, not duplicate API runners. A paid member should not be mistaken for an
  unsubscribed member when testing the home subscription card.
- The server reconciliation's separate **team-lifecycle acceptance record is
  unset**. Do not flip this to passed until actual results are returned.
- The initial backup metadata check was followed by the separately scoped full
  restore above. That drill closes representative-volume recovery/RTO, not
  regional infrastructure rebuilding, live secret rotation or provider replay.
- Fresh hosted owner/signer/notary/MFA/socket-revocation exercises were not rerun
  against client accounts. Earlier hosted fixture evidence and today's isolated
  SQL/route regressions remain valid, but do not substitute for the manual matrix.
- No deliberate production outage, worker crash, secret rotation, refund, decline,
  subscription renewal/cancellation, webhook replay or quota exhaustion was
  injected. Existing recovery/lifecycle evidence is not being presented as a new
  production incident drill. Sentry/OTLP and Google-owner review stay deferred.

## Checks completed on the engineering side

| Area | Fresh evidence | Boundary of the claim |
| --- | --- | --- |
| Isolated regression | 952 backend tests / 119 files; 138 web tests / 26 files; type/backend builds, web types, error catalog and KPI gates pass. | Local tests; not a physical-device run. |
| Infrastructure | 129 production/scanner/bootstrap tests plus 29 recovery/monitoring/workflow tests pass; 7 mobile-config/iOS-summary helper tests pass. | Infrastructure code tests; not destructive live drills. |
| Web lint | Zero errors; two preexisting hook-dependency warnings. | Warnings remain in notary request/start views. |
| Release | Actual running digests match the verified production manifest; template/configuration, secret version and capacity unchanged. | Not a new deployment. |
| API/edge | Web/privacy and API live/ready 200; anonymous member/document/billing/notary/admin routes and invalid JWT denied; exact-origin CORS; AASA available. | Terms is separately failed above; no logged-in browser UI claim. |
| Callback ingress | Unsigned Stripe, Resend and Supabase SMS callbacks rejected. | No SMS/email/APNs test send or valid paid-event replay. |
| Database | 109/109 migration versions; 98/98 public tables have RLS; service-only finalization/identity RPCs protected; no client grants to private identity storage; zero legacy plaintext identifier copies. | Inventory/grant checks are not every policy's complete actor matrix. |
| Billing | Complete live provider scan: 8 internal / 8 Stripe subscriptions, zero reconciliation issues/backlog/held packages. Six approved prices verified: $9.99/$19.99/$59.99 monthly and $99/$199/$599 annual; allowances 3/25/unlimited per month; before tax. | Does not charge a card, approve tax calculations, or simulate future renewal in live mode. |
| Prior incident | Both approved unrelated Stripe events remain `ignored`; billing alarm remains OK with actions enabled. | No further events were reclassified. |
| Final files | **51 completed hash records / 39 documents / 194 pages / 34,618,794 bytes**: exact SHA-256, PDF parser, qpdf syntax and native Poppler page-read checks pass. | Checks all completed hash records at scan time; not layout/legal accuracy or Apple PDFKit display. |
| Completion consistency | All 39 completed documents have committed release controls tied to a completed hash and the same final version; zero held release controls. | Not a new multi-output interruption or held-release drill. |
| Public verification | Existing released CA and OH samples return `verified`, final-only allowlisted documents, no-store/no-referrer and null external-ledger fields. | Public preview is intentional and was previously approved; anyone who sees a PDF can save it. |
| Operations | **22 recovery/application/capacity/SMS alarms OK, actions enabled**; ten genuine worker heartbeats in ten minutes; no worker critical signals in the sampled last five minutes. | Snapshot evidence, not every alarm's new source-to-inbox drill. |
| Perimeter/audit | Production WAF attached with three rules; multiregion CloudTrail logging, digest validation enabled and fresh log delivery. | No new attack injection or digest-chain restore drill. |
| Backup cadence and recovery | Complete exact-version manifests at **02:00 October 15 and 14:00 October 14, Mexico City time**; full 266-object recovery and exact-image application acceptance subsequently passed in **23m29**. | Current-volume local recovery, not regional rebuild or historical provider replay. |
| iOS provenance | Local signed **0.1.0 (28)** production archive: production API/web/Supabase, valid code signature, production APNs, matching associated domain and privacy manifest. Mobile source matches latest passing iOS CI `b70f1c9`. | Does not prove which build is currently installed/submitted, handset delivery, visual accessibility or App Review approval. |

Private reports and sanitized logs:
`.recovery-private/readiness-audit-2026-10-15/consolidated-*`.
Local engineering-gate receipt:
`/var/folders/lh/sn6jzvdn11jbjq_zj57xr9fr0000gn/T/darci-phase1-gate-ZuNWbU/report.json`.
No keys, OTPs, device tokens, signing secrets or private PDF URLs belong in this doc.

## Manual test setup — do this once

- [ ] **SET-01:** Install the production TestFlight candidate. Record version/build,
  iPhone model and iOS version. Latest local archive verified here is 0.1.0 (28);
  confirm your installed/submitted candidate rather than assuming it matches.
- [ ] **SET-02:** Use `https://app.illuminotary.com` on desktop Chrome and Safari;
  also test iPhone Safari. Do not use staging. Test once on Wi-Fi and once on
  cellular; public access should no longer depend on the old tester-IP allowlist.
- [ ] **SET-03:** Assign existing approved accounts: entitled member M1; different
  member M2; consenting invited signer S; CA notary N-CA; OH notary N-OH; Jorge as
  admin. Keep an existing unsubscribed member for denial checks. Check available
  allowances before starting; never grant yourself entitlement just to hide a bug.
- [ ] **SET-04:** Use clearly labeled non-client test documents and consenting
  participants. Never falsify identity, location or a notarial act. Do not delete
  a real account, fabricate a legal signature, alter a completed client PDF or
  change a client's subscription for testing.
- [ ] **SET-05:** Record each result as PASS / FAIL / BLOCKED with case ID,
  production build, actor roles, local time, IDN (or document ID before IDN exists),
  expected/actual behavior and screenshot/video. Never include OTPs or credentials.

## 1. Login, account and session checks

Run AUTH-01–05 on **production iPhone and production web**.

- [ ] **AUTH-01:** Log out, request an email code, enter/autofill all **8 digits**,
  and finish login. Retry one wrong code: rejected without signing in. No endless
  spinner or generic error on a healthy connection.
- [ ] **AUTH-02:** Repeat with SMS, verifying the correct country prefix and phone.
  Complete any explicitly requested email-linking step; it must explain that the
  second code is email verification, not silently send a second SMS.
- [ ] **AUTH-03:** Leave login idle until a code expires, verify rejection, request
  a fresh code using the UI and finish. Resend cooldown and errors must be clear;
  don't repeatedly spam requests or paste codes into this report.
- [ ] **AUTH-04:** Open the same account on web and iPhone. Background/foreground
  the phone; interrupt/restore connectivity during a draft save. Previously saved
  fields survive; requests recover without duplicate workflows. On logout, Back,
  old document links and notification taps must not expose private content.
- [ ] **AUTH-05:** With no account session, document/notary/admin links request
  login, not display private data. After login they route to the intended screen.
- [ ] **ACCOUNT-01:** Edit name on web Settings, reopen on iPhone and verify sync.
  Change email and phone only to alternate addresses/numbers you control; complete
  the required OTP confirmation before the new contact becomes the login identity.
  Wrong/canceled confirmation must not replace the current verified contact.
- [ ] **ACCOUNT-02:** On a disposable, preapproved test account **without a paid
  subscription or legal documents**, cancel the deletion dialog once, then complete
  account deletion. Confirm sign-out, inaccessible private content/old session and
  correct retention explanation. Do not use Jorge's/admin/client accounts. Mark
  BLOCKED if a safe disposable account has not been provisioned.
- [ ] **ACCOUNT-03:** Open Privacy, Terms, support and incident contacts. No missing
  page, outdated support domain, review-only disclaimer or staging link. **AC-01 is
  already failed**; retest after the approved Terms publication fix.

## 2. Membership, prices and access

- [ ] **BILL-01:** On the existing unsubscribed member, confirm the subscription
  offer is visible and new generation is denied server-side with a useful message.
  On an active entitled member, allowance/plan are accurate; the missing signup
  offer is not a bug if that member is already subscribed.
- [ ] **BILL-02:** Compare all displayed plan prices: 3 documents $9.99/month or
  $99/year; 25 documents $19.99/month or $199/year; unlimited $59.99/month or
  $599/year. Annual plans still have **monthly** document allowances; notary fees
  are separate and prices are before applicable taxes.
- [ ] **BILL-03:** Open Checkout on web and iPhone, verify plan/cadence/amount and
  cancel **without paying**. iPhone returns to the app or offers its explicit
  fallback. A canceled/forged success return must not grant membership.
- [ ] **BILL-04:** Open the existing subscriber's billing Portal and return without
  changing anything. Subscription period, invoices and cancellation state must
  match the app; opening the Portal is not permission to alter live billing.
- [ ] **BILL-05:** Record allowance before/after one successful new generation.
  It consumes one workflow, not one unit per output PDF. Reopening, retrying or
  double-tapping the same accepted workflow must not consume another unit.
- [ ] **BILL-06:** Using a separately approved exhausted test account, confirm new
  workflows are blocked while already accepted work can continue. Do not exhaust
  a paying customer's allowance to construct this test; mark BLOCKED if no fixture.

The previously approved $9.99 live payment already passed. **Do not repeat it** or
test real declines/refunds/renewals/upgrade/downgrade/cancellation just for this
checklist. Isolated automated lifecycle/concurrency/crash regressions passed; any
additional live-money or held-release drill needs its own controlled fixture/scope.

## 3. Product and platform matrix

For full matrix sign-off, execute all **32 runs** below. Each row is a separate
jurisdiction/product, with four member → notary platform combinations. This table
is not checked off merely because one POA succeeds. If the team chooses a smaller
pairwise smoke instead, record that explicitly and leave full coverage open.

| Product | Web → web | iPhone → iPhone | Web → iPhone | iPhone → web |
| --- | --- | --- | --- | --- |
| CA Trust | CA-TR-WW | CA-TR-MM | CA-TR-WM | CA-TR-MW |
| OH Trust | OH-TR-WW | OH-TR-MM | OH-TR-WM | OH-TR-MW |
| CA standalone POA | CA-PO-WW | CA-PO-MM | CA-PO-WM | CA-PO-MW |
| OH standalone POA | OH-PO-WW | OH-PO-MM | OH-PO-WM | OH-PO-MW |
| CA uploaded PDF, continue to sign | CA-SG-WW | CA-SG-MM | CA-SG-WM | CA-SG-MW |
| OH uploaded PDF, continue to sign | OH-SG-WW | OH-SG-MM | OH-SG-WM | OH-SG-MW |
| CA uploaded PDF, without signature | CA-NS-WW | CA-NS-MM | CA-NS-WM | CA-NS-MW |
| OH uploaded PDF, without signature | OH-NS-WW | OH-NS-MM | OH-NS-WM | OH-NS-MW |

**Required sequence and expected results in every run:**

1. Start with the correct jurisdiction/product and record initial allowance.
2. Fill all required fields. Include unmistakable **special instructions in every
   POA**. Save a draft, leave, reopen, and verify exact field persistence.
3. On iPhone, move from text to date/picker/non-text controls: keyboard dismisses.
   The single blue Done control works; no duplicate Done controls or compressed
   unreadable layout. Notary chooser fits short lists and scrolls long lists while
   keeping both actions accessible. Larger text must not hide essential controls.
4. Tap Continue once, then deliberately double-tap during one run. It proceeds to
   generation/review, **never resets to the beginning**; no duplicate workflow or
   duplicate allowance use. Record document ID before generation and IDN afterward.
5. Open **every expected output** and every page. Trust includes all applicable
   registration/certificate/POA outputs exposed by the product. Correct special
   instructions and member data appear; no blank/unreadable PDF or clipped text.
6. Sign only where required, with a consenting test participant. Across the matrix,
   exercise typed, newly drawn and saved signatures; an old saved signature must
   not overlap the addendum label/date. Preview choices must not change obligations.
   The upload-without-signature path must not unexpectedly demand a member signature.
7. Select a valid notary for the jurisdiction and submit. The selection sheet closes,
   the member sees a truthful waiting state, and the assigned notary sees one request.
8. Notary reviews all relevant PDFs and approves; member/notary then see the correct
   session/contact state. No stale “Insufficient permissions” after role switching.
9. Complete only the authorized test in-person flow: truthful venue/date, consent,
   identity requirements, relevant acknowledgments/signatures and notary completion.
   Check location-denied/manual fallback on at least one CA and one OH run. Do not
   falsify location or identity to make a test pass.
10. Member sees the final package without logging out/in. Every output opens in
    iPhone and desktop; download/read with Files or another native reader. No
    “PDF cannot be previewed,” missing pages or blank final view.
11. State changes to completed/verification-ready **only when all required final
    artifacts actually exist**. Reopen/retry must preserve content, signature,
    acknowledgment and hashes; no simulated ledger/anchoring claim.
12. Open public verification while signed out. It shows only released verified final
    outputs, with hash wrapping inside its card. Verify the downloaded final's exact
    SHA-256 matches the record (`shasum -a 256 "/path/to/final.pdf"` on Mac).
    Printing/re-saving/re-PDFing creates different bytes and is not an equality test.
13. On the notary Completed tab, the removed **View Document** action must remain
    absent where notaries are intentionally not entitled; don't treat denied access
    as a reason to restore the button. Other authorized member access remains intact.
14. Record final allowance, IDN, all generated output names, roles/platforms and result.

## 4. Focused edge cases — one controlled example each

- [ ] **EDGE-01:** Notary rejects a labeled request: clear member notice and selection
  of another eligible notary work. A wrong-jurisdiction/unapproved account cannot
  act on it. A different member cannot access its private document URL.
- [ ] **EDGE-02:** On an invite-capable flow, intended signer opens/claims invitation
  on the other platform; wrong signed-in identity is denied. Expired/revoked invite
  shows a recoverable state. Send test invitations only to consenting testers.
- [ ] **EDGE-03:** Upload a normal multipage PDF and one rotated/scanned PDF. Preview,
  zoom, page count and download work. A password-locked or malformed PDF is rejected
  clearly; do not send an oversized denial-of-service file into production. Native
  size/page-boundary rejection already has isolated coverage.
- [ ] **EDGE-04:** During one form save and one generation request, switch Wi-Fi off
  and back on. Retry the same workflow; no field loss, loop to intake, duplicate
  generation or extra usage. Do not force-stop production servers/workers.
- [ ] **EDGE-05:** Switch member ↔ notary on an authorized dual-role account and
  reopen relevant requests; no stale permissions or cross-account data. Member-only
  accounts cannot acquire admin/notary powers through a UI or direct URL.
- [ ] **EDGE-06:** Jorge opens an MFA-protected admin action. Recent step-up is
  required; canceling MFA performs no mutation. Approve/revoke only a clearly labeled
  consenting test notary if that test has been authorized, never a client by mistake.
- [ ] **EDGE-07:** On an approved test case only, compare foreground, background and
  cold-start notification taps. One expected workflow email/push arrives, opens the
  correct production document/session, and read state synchronizes. With permission
  denied, the app still works; enabling notifications later recovers registration.
- [ ] **EDGE-08:** Check one real workflow email on iPhone Gmail and desktop: logo,
  readable layout, clear CTA, correct production link and support contact. No broken
  images, raw giant URL, old domain or duplicate email for a repeated same action.

## 5. Apple review — Jorge-owned, not submitted by this pass

- [ ] **APPLE-01:** Verify dedicated Apple reviewer access on the submitted build,
  both member and notary workspace, correct instructions, and that its time-limited
  access/allowance remains valid for the review period. Do not put bypass codes here.
- [ ] **APPLE-02:** Record on a supported **physical iPhone with current iOS**:
  launch → login/registration as actually enabled → typical member flow → document
  review/signing/notary handoff → paid-feature access as actually implemented →
  account deletion on a separate disposable account. Explain closed signup
  accurately; do not advertise an unavailable registration path.
- [ ] **APPLE-03:** Match App Review Notes, reviewer credentials, purposes/audience,
  external services, CA/OH limits, privacy labels, regional availability and any
  authorization documentation to the actual submitted build. Public-site access,
  policy publication and approved commercial terms are not App Store approval.
- [ ] **APPLE-04:** Verify actual-app screenshots, privacy/support URLs, enabled
  purchase flow and export/privacy answers. Submit only after Jorge's approval.

## Result template and stop criteria

Copy this for each manual case:

```text
Case ID:
PASS / FAIL / BLOCKED:
Date/time + timezone:
Web browser or TestFlight version/build + device/iOS:
Member/notary platform pairing:
Test account role labels (no passwords/codes):
Document ID / IDN:
Starting → ending allowance:
Expected:
Actual:
Screenshot/video reference:
```

**Stop that flow and report immediately** for cross-account disclosure, invalid
permissions allowing access, unreadable final PDF, hash mismatch, missing output,
false completion, extra usage/charge, duplicate legal signature or lost intake.
Do not regenerate a completed client package, retry a charge, delete evidence or
invent a workaround to get a PASS. AC-01, the representative recovery gate, any
blocked critical test, and the manual results must be resolved or explicitly
accepted/disabled before the consolidated go/no-go is signed.
