# Stability/security closeout — 15 October 2026

## Approved scope and release order

Fix the blocked staging releases and investigate the production billing alarm.
Jorge explicitly requested **staging first, test staging, then production**.
No production release, Stripe inbox correction, subscription change, charge,
client notification, PDF mutation, or App Review submission is authorized by the
staging deployment itself. Preserve the unrelated local Apple review draft.

**Follow-up authorization:** Jorge confirmed staging looks good and requested
pushing the roadmap, deploying through the normal production approval, then
closing only the two unrelated Stripe events and verifying natural billing-alarm
recovery. This does not authorize subscription/charge/document changes.

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
- **165 infrastructure/workflow tests pass**; workflow YAML parses and diff
  whitespace checks pass. The shared scanner rejects tags, mismatched/incomplete
  reports, HIGH findings, and Docker/scanner failures.
- Local API/worker images have zero HIGH/CRITICAL findings against the refreshed
  vulnerability database. The API's network-isolated unsigned PDF creation,
  qpdf check and Poppler render smoke passes.

## Deployed staging acceptance — completed

Exact application/scanner revision: `751a334d91efd70266bedefb9498e3b804b808d5`.
[CI](https://github.com/jllb89/darci/actions/runs/38768452589) and
[staging deployment](https://github.com/jllb89/darci/actions/runs/38768452468)
passed. Running API129, worker115 and web80 match the three successful immutable
digest/verified-config scan receipts; all rollouts completed with desired capacity.
The published runtime includes TIFF 4.7.2-r0 and Next.js 16.3.8. API readiness/web
return HTTP 200, and unsigned Stripe ingress still returns HTTP 400.

A clearly labeled unrelated Stripe **test-mode** subscription generated real
`customer.subscription.created`, `customer.subscription.deleted`, and
`invoice.paid` callbacks; all became `ignored`. A signed duplicate returned
`duplicate=true`, preserving the inbox records. No DARCi subscription or price
mapping was created. No email/payment method was supplied, no real charge was
made, the trial was canceled, its price/product archived, and the synthetic Stripe
customer deleted. Callback evidence remains retained in staging.

Read-only staging reconciliation completed its provider scan: **22 internal / 22
provider subscriptions, zero issues, zero webhook backlog and zero held packages**.
Staging's existing observe-mode/acceptance configuration was not changed.
Private receipts/reports are under
`.recovery-private/readiness-audit-2026-10-15/` (ignored; no keys in reports).

## Recovery alert investigation

The staging recovery failure queue contained an alert for task
`84a811562db74956bdad2686f6e9b9e8`. It stopped after more than 2,400/2,571 object
copies because a source storage read failed. No incomplete manifest was accepted.
HEAD checks for positions 2,400–2,424 now all return HTTP 200; the original failure
did not retain an HTTP status, so its exact provider cause is unknown.

An existing-resource staging backup retry, task
`23e09c282d384030845fc4b74ed28ae8`, **completed successfully**: all 2,571 objects,
937,766,811 total bytes, 163.289 seconds. Its exact versioned complete manifest,
checksums and task exit zero were verified. The old alert was retained privately
and only that exact queue message acknowledged; the queue is empty. Its alarm
returned **OK naturally at 10:29:51 Mexico City time**, with actions still enabled.
No queue purge, alarm override, source/PDF change or production change occurred.
Production's twice-daily backups remain current and unchanged.

## Remaining gates

- [x] Exact-revision CI, all three image scans and staging rollout pass.
- [x] Deployed staging read-only health/billing reconciliation plus isolated
      webhook-scope acceptance pass; no client or live-payment mutation.
- [x] New staging backup completes; retain evidence before acknowledging its old alert.
- [x] Jorge's requested manual staging check / production go-ahead.
- [ ] Only after staging acceptance: approved production release and verification.
- [ ] Audit/reclassify only the two proven unrelated production inbox events;
      preserve their previous failure evidence and verify billing state is unchanged.
- [ ] Let the production billing alarm recover through genuine probes; do not
      disable the detector, remove real dead-letter detection or inject success.

App Review is owned by Jorge in parallel. Broader browser-session hardening and
the consolidated production acceptance matrix are not silently marked complete
by this narrowly scoped pass.
