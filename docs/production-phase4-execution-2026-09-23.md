# Phase 4 — Production release candidates

Status: engineering preparation in progress; no TestFlight upload or public launch.
Phase 3 is closed for enabled private-production scope. Jorge confirmed both
commercial/legal approval and the final product email receipt. Do not repeat those gates.

## Completed this pass

- Added explicit `Production` configuration and `DARCiMobile-Production` scheme.
  The existing `DARCiMobile` Release archive remains staging.
- Generated ignored production public configuration from `.env.production` without
  shell execution or copying server secrets. Wrong-project/privileged keys fail closed.
- Isolated production Keychain auth and push-installation records from staging;
  production links reject staging, HTTP, user-info, nonstandard ports and spoofed hosts.
- Replaced hardcoded staging verification/privacy destinations with environment-aware
  URLs. Production Sentry remains disabled.
- Built a signed distribution archive and verified actual embedded production API,
  web, Supabase, APNs and associated-domain configuration; provisioning/signature,
  app and Sentry dSYM UUIDs, and the required-reason UserDefaults privacy declaration pass.
- Deployed only the two approved GET association-file routes on the production app
  host. CloudFormation finished successfully; existing images/configuration and
  private app/API rules were preserved. Temporary deployment permissions were removed.
  Apple’s association CDN fetched the production file with HTTP 200.
- Inspected deployed web login/callback JavaScript: production API and Supabase URLs,
  no staging project/API references in those loaded chunks. Existing web6 remains live.
- Fixed local root/well-known AASA parity: the well-known copy was missing successful
  and canceled billing returns. Regression coverage now checks both files and routes.
  **This content correction still requires a web release and CDN recheck.**

## Candidate and evidence

- Archive: `apps/mobile/build/phase4/DARCiMobile-Production.xcarchive`.
- Version/build: **0.1.0 (21)**; bundle `com.illuminote.darci`; Xcode 26.2 / iPhoneOS 26.2.
- Artifact verification: `production-verification.json` inside the archive.
- Executable SHA-256: `8b320656facbf5d71bcd0c05d5d54404fa18b54857c7807ace2bfe679b075b23`.
- App UUID: `D17D9AAE-6D94-3155-96C2-A3A1EAC77976`; matching Sentry symbols also verified.
- Profile expires 5 August 2027. Build-number availability in App Store Connect is
  not yet checked. No archive upload, Apple validation or review acceptance claimed.
- First archive attempt encountered stale Swift-package cache revisions before
  compilation. A dedicated cache resolved the unchanged pinned versions and archived successfully.
- Private evidence: `.recovery-private/production-association-Z9Xghr/report.json`,
  `phase4-web-config-inspection.json`, `phase4-web-auth-config-inspection.json`.
- 17 Node configuration/routing/workflow regression tests passed. Initial iOS unit
  run exposed a realtime test using real simulator GPS permission; its location
  dependency is now stubbed. The full rerun passed **120/120 iOS unit tests**, including
  five production-environment regressions, with zero failures. Simulator: iPhone 16e,
  iOS 26.2. UI tests were not rerun in this pass; physical-device acceptance is still open.

## Next release steps

1. Review/commit this pass's changes; release the corrected web association file
   through the existing protected production workflow. Recheck both files and Apple CDN.
2. Check build 21 is unused in App Store Connect; distribute this **production**
   archive to the intended internal TestFlight group. Do not accidentally upload a
   staging Release archive. See [mobile commands](../apps/mobile/README.md).
3. Install on Jorge's phone, using the allowlisted Wi-Fi network. Same bundle ID
   replaces the staging app, but production must require its own login. No beta
   data is migrated. Client networks still need explicit access approval.
4. Record the device checks below. No new charge, public signup, unrestricted access
   or general push activation is authorized by building/uploading this candidate.
5. Complete the [App Store review preparation](production-app-store-review-2026-09-23.md)
   before submission. Phase 4 is not closed merely because an archive compiles.

## Production-device acceptance sheet

Record device/OS, build, timestamp and pass/fail evidence for every row. Use dedicated
test accounts/documents; do not manufacture customer legal signatures for a test.

- [ ] Production email and SMS login, verify code, wrong/expired code, linked-email
  step-up where applicable; no automatic duplicate sends.
- [ ] Relaunch/foreground, token refresh, logout and re-login; no staging session reuse.
- [ ] Synthetic document review/download, signer invitation and member/notary navigation;
  links from another environment must not be consumed by this production build.
- [ ] Location denied/manual venue path; keyboard dismissal, Large Text and small screen.
- [ ] Device permission and authenticated production push registration, then an explicitly
  targeted operator notification: foreground/background delivery, tap to correct
  document, authenticated open record and stale-token handling. General push remains off.
- [ ] Applicable Checkout/Portal/Apple Pay UI and browser return into the app. Backend
  live payment acceptance already passed; do not charge again without authorization.
  Current purchase controls remain closed, so this UI exercise requires a scoped window.
- [ ] Profile privacy/terms/support and account-deletion flow, including active-subscription
  consequences and retained legal records. Do not delete an account with client artifacts.

These checks are distinct from the broader Phase 5 CA/OH/product/cross-platform matrix.
