# Mobile PDF, session and notary-selection regression fix

Implementation date: 2026-09-16. Code implemented locally; deployment and a new TestFlight release are still required. Existing remote documents have not been modified.

## Confirmed PDF cause

The affected uploads are encrypted/owner-restricted PDFs that open without a user password. The signing and finalization code loaded them with `pdf-lib`'s `ignoreEncryption: true`. That option bypasses a check; it does not decrypt PDF streams. Saving those documents produced derivatives that Apple PDFKit reported as having zero displayable pages, even when pdf-lib still counted pages.

The finalization bypass was introduced in `f858047` and the signing bypass in `0aa5869`. Earlier regression fixtures simulated encryption with a dictionary instead of using genuinely encrypted content, and output checks used the same permissive reader. They did not catch the corruption.

The web preview uses the browser's native PDF viewer and the same storage URLs. There is no separate, proven-good web PDF generation pipeline. The client reports establish a mobile symptom; they do not establish that the underlying files were sound on web.

| Reported IDN | Observed state | Evidence |
| --- | --- | --- |
| WM640UA2ZAQS (OH) | Pending notary; signed | Original readable, signed derivative unreadable in PDFKit; no submitted notary request found |
| FETWXDPEYVPS (CA) | Pending notary; signed | Same failure pattern; no submitted notary request found |
| ONX2O7GV2PXS (OH) | Completed; signature skipped | Original readable; acknowledgment/final derivatives unreadable in PDFKit; finalization and anchoring recorded |
| EUDOXFSANSN4 (CA) | Completed; signature skipped | Same completed-package failure pattern |

## Implemented protections

- Preserve uploaded source bytes. Decrypt password-free protected PDFs into temporary working copies using qpdf before signing, adding acknowledgments or watermarking. Reject password-required files with actionable guidance.
- Before storing a newly transformed PDF, independently check it with qpdf and Poppler, verify expected page count, and render every page. Reject syntax/content-stream failures, including errors from a renderer that nevertheless exits successfully. Upload review runs the same validation before accepting the source for processing.
- Replace the custom notary-selection overlay with a native, scrollable sheet and a safe-area-pinned action footer. Large text cannot push Submit beyond the bottom of the sheet. Submission errors appear inside the sheet, and a dismissed sheet can be reopened.
- Show “Pending notary selection” until there is an actual request, instead of implying that the notary has already received it.
- Refresh iOS credentials proactively on foreground entry and while signed in; coalesce refresh requests, preserve the session on transient failures, and prevent an outdated refresh from restoring a signed-out session. Long-lived request clients use rotated credentials only for the same account.
- Send a request-scoped mobile profile hint. The backend accepts it only when that role is currently granted and active. A web profile change no longer implicitly selects the wrong role for an explicit mobile notary request. Backend identity lookup failures fail closed with a retryable 503 instead of falling back to stale token roles.
- Add sanitized Sentry signals for PDF processing/rendering, preview failures, notary submission, permission denials and session operations. No PDF bytes, passwords, tokens or signed storage URLs are included in the new signals.

The exact earlier “Insufficient permissions” event could not be attributed to a specific request without its identifier/time. The role-sharing and stale-session weaknesses above were verified in code and regression-tested; they are not presented as a proven reconstruction of that individual event.

## Verification

- Backend: 571 tests across 88 files; TypeScript build and observability catalog/KPI-readiness checks passed. Readiness checks are not proof of live production KPI attainment.
- Web: 69 tests across 13 files and production build passed.
- iOS: 108 unit tests and the notary-submission UI regression test passed at standard and maximum accessibility text size. Device Release compilation also passed; this is not an App Store distribution/archive validation.
- All four reported original uploads were downloaded read-only and processed through both signature and skip-signature paths: eight local test derivatives passed independent rendering and Apple PDFKit page checks. OH originals preserved four pages; CA originals preserved seven, plus the appropriate signature/acknowledgment pages. These were conspicuously marked test derivatives, not replacement legal artifacts.
- No staging records, stored documents, signatures, hashes or ledger anchors were changed by these checks.

Read-only verification command on macOS, from the backend directory:

```sh
env NODE_ENV=test DOTENV_CONFIG_PATH=../.env.staging node -r dotenv/config -r ts-node/register scripts/verify-reported-pdf-regression.ts WM640UA2ZAQS ONX2O7GV2PXS FETWXDPEYVPS EUDOXFSANSN4
```

## Deployment and team acceptance

1. Build and redeploy **both backend API and worker images**. Their Dockerfiles install `qpdf` and `poppler-utils`; CI also installs them. Non-Docker development needs `brew install qpdf poppler` on macOS. There are no new environment variables or database migrations.
2. Produce and distribute a new iOS TestFlight build. The old installed app will not receive the sheet/session changes from a server deployment. The UI-test harness is DEBUG-only and excluded from Release.
3. Use fresh copies of the affected source PDFs for staging acceptance: CA and OH, with and without signing, mobile→mobile and web↔mobile. Confirm preview after upload/signing and on both parties' devices after finalization, then download the final artifact. Test notary submission with largest text, sheet dismissal/reopening, and longer notary lists.
4. Keep a mobile notary session open while switching the same account's web profile. Background/foreground the app across token expiry and a temporary network interruption. Confirm recovery without logout and confirm genuinely revoked roles still fail.
5. Check Sentry for the new failure categories and confirm the deployed API and worker versions include this change. Do not declare the old document IDs repaired merely because newly created documents work.

## Existing-document recovery boundary

Deployment does **not** repair derivatives already saved with the old pipeline.

- Pending signed documents: reconstruct a new derived version from the preserved original and the existing authorized signature records. Do not use the corrupted latest derivative as the input, fabricate replacement signatures, or silently overwrite version history. Confirm the resulting signing/readiness state before resuming submission.
- Completed/anchored documents: retain every existing version and hash/anchor. A corrected package requires a recorded replacement version, validated content, new hash and anchor, and audit links to the superseded artifact. Review how this should be exposed as a correction before publishing it to members.
- The included script proves that the originals can be processed safely; it deliberately performs no recovery writes. A controlled recovery operation remains separate from this deployment. For immediate team testing, fresh staging workflows avoid modifying completed records.

## Scope and limitations

This pass addresses the reported PDF mutation regression, notary-selection reachability and concrete session/profile hazards. It does not redesign all mobile screens, guarantee every PDF format is supported, deploy infrastructure, publish TestFlight, or certify legal validity. Independent rendering checks guard against the observed structural corruption; they are not a substitute for checking document content and acknowledgment accuracy.
