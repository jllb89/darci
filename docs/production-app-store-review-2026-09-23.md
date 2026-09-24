# Production App Store review preparation

Status: draft submission checklist, not a new request for commercial/legal approval.
Jorge has approved those policies. The remaining job is publishing the exact approved
content and accurately describing the implemented app to Apple.

## Reviewer notes to complete before submission

- DARCi provides member document preparation/signing and an in-person notarization
  workflow. Notaries approve requests and meet the member in person. Final artifacts
  are hash-verified; do not claim external-ledger anchoring for the hash-only launch.
- Supply a dedicated reviewer account and clear instructions for member and notary
  roles. Explain MFA, OTP and location prerequisites without placing credentials in
  this repository. Decide a narrowly scoped reviewer-access mechanism: the current
  IP-restricted app/API cannot be assumed reachable by Apple's reviewers.
- Accurately describe the release's purchase controls and enabled features. The
  current private candidate has general purchases and push sending disabled.
  Do not describe them as publicly enabled or hide their intended behavior.
- Explain what the membership fee buys and that notary fees are separate. Apple's
  outside-app goods/services rule is not an automatic approval merely because one
  workflow has an in-person step. Confirm the submitted subscription model against
  [App Review Guidelines 3.1.3(e)](https://developer.apple.com/app-store/review/guidelines/#goods-and-services-outside-of-the-app).

## Distribution checklist

- [ ] Confirm unused build number/version, Apple archive validation, signing and symbols;
  the local production archive/signature/dSYM verification has passed.
- [ ] Supply final app description, screenshots, support URL, review contact and test
  instructions matching the enabled production build. No staging host in metadata.
- [ ] Publish/link the exact approved privacy and terms content. Native terms still
  contain an “Interface copy for review” disclaimer; web privacy still lists the old
  `support@darciregistry.com` contact. Reconcile with the approved support/reply-to
  `lopezb.jl@gmail.com` and approved text before submission, not invented substitute policy.
- [ ] Make required privacy/support pages review-accessible through an explicitly
  approved access change. Only the two AASA routes are currently approved as public.
- [ ] Complete App Store privacy labels from actual collection/use, including contact
  information, identity/document data, signatures, location and device identifiers
  as applicable. The bundled required-reason manifest is not a complete privacy label.
- [ ] Review SDK privacy manifests and export-compliance answers for the shipped binary.
- [ ] Exercise account deletion and accurately explain lawful retention and subscription
  handling. See [Apple privacy/account requirements](https://developer.apple.com/app-store/review/guidelines/#privacy).
- [ ] Complete physical-device notification, login, payment UI and accessibility checks
  in the [execution record](production-phase4-execution-2026-09-23.md).

The app's own UserDefaults access declares CA92.1 in `PrivacyInfo.xcprivacy`; see
[Apple's required-reason API documentation](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).
Production association GETs are publicly reachable so Apple's CDN can retrieve the
file; see [Apple universal-link diagnostics](https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links).
