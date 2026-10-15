# Stability/security closeout — 15 October 2026

## Approved scope and release order

Fix the blocked staging releases and investigate the production billing alarm.
Jorge explicitly requested **staging first, test staging, then production**.
No production release, Stripe inbox correction, subscription change, charge,
client notification, PDF mutation, or App Review submission is authorized by the
staging deployment itself. Preserve the unrelated local Apple review draft.

## Root causes and changes

- Three recent staging releases were rejected by HIGH-severity image findings:
  CVE-2026-4775 in TIFF and CVE-2026-94483 in Next.js. Pin Next/ESLint to 16.3.8 and
  require `tiff>=4.7.2-r0` alongside the existing Expat minimum in API/worker images.
  Both image builders pull current base images. Do not suppress findings or use
  `--ignore-unfixed` to make the release pass.
- The image policies differed: staging scanned OS **and Node packages** with
  Trivy while production relied on ECR. Both workflows now invoke
  `scripts/scan-runtime-image.mjs` with pinned Trivy 0.74.0, HIGH/CRITICAL severity,
  an empty ignore file and nonzero failure exit. Scan receipts bind the exact
  immutable ECR digest to the pulled image ID; production promotion revalidates
  receipts/reports and retains its separate ECR scan gate. Failed jobs expose a
  compact package/fixed-version summary and retain JSON reports.
- Production has two October 4 dead-lettered events for one unrelated Stripe
  subscription created in January 2022. Subscription metadata, price metadata,
  local subscription mapping and local price mapping contain no DARCi ownership.
  Repeated watchdog signals count the unresolved condition, **not new charges or
  distinct failed payments**. No Stripe subscription/payment was modified.
- Webhook processing now ignores only unmapped subscriptions without DARCi
  markers. Existing local subscription/price/Checkout mappings and DARCi metadata
  prevent silent dismissal. Database lookup failures and environment mismatches
  remain retryable failures; real DARCi entitlement fulfillment is unchanged.
  Non-subscription/expired unrelated Checkouts are ignored too. The watchdog is
  scoped to its Stripe environment and emits safe `queue_backlog/stripeOverdue`
  diagnostics; retained real dead letters still alert immediately.
- A preexisting UUID-redaction test was nondeterministic: a generated UUID can
  contain the hex substring `bad`. Assert UUID shape and absence of CR/LF instead.

## Verification before staging

- Backend TypeScript compilation passes; **952 backend tests pass** on Node 24.
- **138 web tests pass**; patched Next.js production build passes. Lint has zero
  errors and two preexisting hook-dependency warnings outside this patch.
- **163 infrastructure/workflow tests pass**; workflow YAML parses and diff
  whitespace checks pass. The shared scanner rejects tags, mismatched/incomplete
  reports, HIGH findings, and Docker/scanner failures.
- Local API/worker image checks and deployed staging acceptance are in progress;
  they are not recorded as passed until their actual results are available.

## Recovery alert investigation

The staging recovery failure queue contains an alert for task
`84a811562db74956bdad2686f6e9b9e8`. It stopped after more than 2,400/2,571 object
copies because a source storage read failed. No incomplete manifest was accepted.
HEAD checks for positions 2,400–2,424 now all return HTTP 200; the original failure
did not retain an HTTP status, so its exact provider cause is unknown.

An existing-resource staging backup retry was launched as task
`23e09c282d384030845fc4b74ed28ae8`. Verify its completed manifest and exit status
before acknowledging the exact old queue message. Do not purge the queue or force
an alarm state. Production's twice-daily backups remain current and unchanged.

## Remaining gates

- [ ] Exact-revision CI, all three image scans and staging rollout pass.
- [ ] Deployed staging read-only health/billing reconciliation plus isolated
      webhook-scope acceptance pass; no client or live-payment mutation.
- [ ] New staging backup completes; retain evidence before acknowledging its old alert.
- [ ] Only after staging acceptance: approved production release and verification.
- [ ] Audit/reclassify only the two proven unrelated production inbox events;
      preserve their previous failure evidence and verify billing state is unchanged.
- [ ] Let the production billing alarm recover through genuine probes; do not
      disable the detector, remove real dead-letter detection or inject success.

App Review is owned by Jorge in parallel. Broader browser-session hardening and
the consolidated production acceptance matrix are not silently marked complete
by this narrowly scoped pass.
