# DARCi Mobile Auth Roadmap

Status: Phase 5 complete for native auth implementation, contract hardening, and live OTP request delivery checks; OTP-code verification remains manual code-entry gated
Date: 2026-06-26

## Objective

DARCi's iOS app has the complete visual onboarding and authentication flow, but the auth screens are still local UI state. The next milestone is to connect that SwiftUI flow to the existing DARCi backend auth contract with a native networking/session layer.

The target is a first-class iOS auth implementation:

- Request email or phone OTP from the backend.
- Verify OTP and receive DARCi/Supabase session tokens.
- Complete missing profile fields when the backend requires it.
- Store the authenticated session in the iOS Keychain.
- Restore or refresh the session on launch.
- Keep secrets out of the mobile bundle.

## Architecture Decision

Use a native Swift auth layer, not a web view.

The web flow in [apps/web/src/app/start/page.tsx](../apps/web/src/app/start/page.tsx) is the behavioral reference, but the mobile app should use Swift models, `URLSession`, Keychain storage, and a SwiftUI view model. The backend already supports native callers because the auth Origin, CSRF, and request-signature checks tolerate absent headers. The mobile app should not send a browser `Origin` header, should not ship `AUTH_REQUEST_SIGNATURE_SECRET`, and should never embed Supabase service-role or backend-only credentials.

## Current State

Mobile UI already exists in [apps/mobile/DARCiMobile/Features/Authentication/AuthenticationSignInView.swift](../apps/mobile/DARCiMobile/Features/Authentication/AuthenticationSignInView.swift):

- Initial phone and email entry states.
- OTP entry screen with an 8-digit code field.
- Complete-info screen.
- Success screen that routes into the signed-in shell.

The app root in [apps/mobile/DARCiMobile/App/AppRootView.swift](../apps/mobile/DARCiMobile/App/AppRootView.swift) restores persisted sessions through `AppSessionCoordinator`, refreshes before signed-in routing, and clears local auth on refresh failure or sign-out.

Backend and web contract exists in these files:

- [backend/src/routes/auth.ts](../backend/src/routes/auth.ts)
- [backend/src/controllers/authController.ts](../backend/src/controllers/authController.ts)
- [backend/src/controllers/usersController.ts](../backend/src/controllers/usersController.ts)
- [apps/web/src/lib/auth.ts](../apps/web/src/lib/auth.ts)
- [apps/web/src/components/auth/ProfileCompletionForm.tsx](../apps/web/src/components/auth/ProfileCompletionForm.tsx)

The public staging API base is available through the same public value used by the web app. Mobile development should use a native config value derived from that public API base, not backend-only environment variables.

## Backend Contract To Mirror

### OTP Start

Email:

```http
POST /auth/otp/start
Content-Type: application/json

{ "email": "member@example.com", "returnTo": "..." }
```

Phone:

```http
POST /auth/otp/phone/start
Content-Type: application/json

{ "phone": "+15555550123", "returnTo": "..." }
```

Expected response includes status/message metadata plus `otpLength` and `cooldownSeconds` when available. The mobile UI should prefer the backend-provided OTP length and cooldown, while defaulting to the current 8-digit visual layout for phone OTP.

### OTP Verify

Email:

```http
POST /auth/otp/verify
Content-Type: application/json

{ "email": "member@example.com", "token": "12345678", "returnTo": "..." }
```

Phone:

```http
POST /auth/otp/phone/verify
Content-Type: application/json

{ "phone": "+15555550123", "token": "12345678", "returnTo": "..." }
```

Expected response shape:

- `accessToken`
- `refreshToken`
- `user`
- `profileCompletionRequired`

If `profileCompletionRequired` is false, store the session and continue to success/signed-in routing. If it is true, store the temporary verified session and move to complete-info.

### Profile Completion

```http
PATCH /users/me
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "phone": "+15555550123"
}
```

Important server rule: the verified contact is locked. Email OTP means the submitted email must match the session email. Phone OTP means the submitted phone must match the session phone. The mobile complete-info screen should visually lock/check the verified method and collect the missing counterpart.

### Refresh

```http
POST /auth/refresh
Content-Type: application/json

{ "refreshToken": "..." }
```

Use this on launch when a stored session exists and for exactly one retry after a protected request returns 401. If refresh fails, clear local auth and route back to authentication.

## Native Components

### AuthConfig

Responsibilities:

- Resolve API base URL from an iOS-safe build setting or configuration file.
- Keep staging and local development switchable without code edits.
- Avoid reading or packaging backend-only `.env.staging` secrets.

### AuthModels

Responsibilities:

- Define Codable request and response types for OTP start, OTP verify, refresh, profile completion, and user/session payloads.
- Keep field names aligned with the backend response shape.
- Preserve optional fields from backend users without forcing the UI to understand every role/status field immediately.

### AuthAPIClient

Responsibilities:

- Use `URLSession` with JSON encoding/decoding.
- Attach bearer tokens only to protected requests.
- Map backend validation, wrong-code, network, timeout, and unknown errors into typed Swift errors.
- Support refresh-on-401 as a caller-controlled operation, not hidden recursion.

### AuthSessionStore

Responsibilities:

- Store `accessToken`, `refreshToken`, and the minimal current user in Keychain.
- Expose load, save, update, and clear operations.
- Keep tokens out of `UserDefaults`, logs, screenshots, and test fixture output.
- Support test injection with an in-memory store.

### AuthenticationViewModel

Responsibilities:

- Own the auth state machine currently embedded in the SwiftUI view.
- Validate email, normalize phone, request OTP, verify OTP, complete profile, and sign out.
- Publish loading, cooldown, field error, and global error state.
- Decide the next screen after verify based on `profileCompletionRequired`.

### AppSessionCoordinator

Responsibilities:

- Load stored auth on app launch.
- Refresh an existing session before entering the signed-in shell when needed.
- Route to onboarding, authentication, profile completion, or signed-in content.
- Provide one shared authenticated client to future product screens.

## UI Wiring Plan

Keep the current SwiftUI layout and wire behavior into it rather than rebuilding the screens.

Entry screen:

- Phone mode normalizes to E.164 before calling `/auth/otp/phone/start`.
- Email mode trims and validates before calling `/auth/otp/start`.
- Continue button shows progress and disables repeat taps while a request is in flight.
- Successful start records the challenge method, identifier, OTP length, and resend cooldown, then shows OTP.

OTP screen:

- Keep the existing 8-box UI for the first pass.
- Accept paste/autofill and strip non-digits.
- Verify when the user taps `Verify code`; optional auto-submit can come after the first stable API pass.
- Map a 401 wrong-code response to `Wrong code. Check the code and try again.` to match web behavior.
- Add resend once cooldown reaches zero.

Complete-info screen:

- If the verified identifier was email, lock/check email and collect phone.
- If the verified identifier was phone, lock/check phone and collect email.
- Send first name, last name, email, and phone to `PATCH /users/me` with the bearer token.
- On 401, refresh once and retry the profile update.

Success and signed-in routing:

- Persist the final session before showing success.
- Continue from success into the signed-in shell.
- On future launches, skip auth when the stored session refreshes successfully.

## Security And Privacy Rules

- Do not embed `AUTH_REQUEST_SIGNATURE_SECRET`, Supabase service-role keys, Resend keys, or any backend-only secret in the app.
- Do not log access tokens, refresh tokens, OTPs, or full auth response bodies.
- Do not store tokens in `UserDefaults`.
- Do not set browser-only auth headers from native iOS unless the backend explicitly adds a mobile-specific requirement later.
- Clear stored auth on refresh failure, logout, or unrecoverable 401.
- Keep test OTPs and real OTPs out of committed fixtures.

## OpenAPI And Backend Follow-Ups

- Complete: `/auth/otp/phone/start` and `/auth/otp/phone/verify` are documented in [api/openapi.yaml](../api/openapi.yaml), including native header behavior and phone request/verify schemas.
- Complete: SMS provider status and signed-hook probes confirm staging SNS is still sandboxed, the provided test phone is not opted out, and the SMS hook send path returns 200.
- Decide whether mobile should have a dedicated `returnTo` convention or omit it for OTP-only native flows.
- Complete: backend contract tests cover native-style OTP requests without Origin/CSRF/signature headers.

## Roadmap

### Phase 1: Native Auth Foundation

Status: complete as of 2026-06-26.

Create the Swift auth foundation without changing the visible flow yet.

Deliverables:

- Covered: `AuthConfig` with environment/config-driven API base selection and local simulator fallback.
- Covered: Codable auth request/response models for OTP start, OTP verify, refresh, profile completion, user envelopes, and stored sessions.
- Covered: `AuthAPIClient` for email OTP start, phone OTP start, email OTP verify, phone OTP verify, refresh, profile completion, and health smoke checks.
- Covered: `AuthSessionStore` protocol with Keychain-backed and in-memory implementations.
- Covered: unit coverage for URL construction, browser-header avoidance, bearer-token attachment, JSON decoding, wrong-code error mapping, OTP start decoding, in-memory store behavior, and Keychain round trip/clear behavior.

Validation:

- Complete: `xcodegen generate && xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath .DerivedData -only-testing:DARCiMobileTests test`.
- Ready for manual use: `AuthAPIClient.checkHealth()` can smoke-check the configured API base without printing response bodies or secrets.

### Phase 2: View Model And Entry/OTP Wiring

Status: complete as of 2026-06-26.

Move auth behavior into an injectable view model and wire the first two screens.

Deliverables:

- Covered: `AuthenticationViewModel` with normalized phone/email challenge state, verified session state, busy state, field/global errors, and resend cooldown state.
- Covered: `AuthAPIProviding` protocol so the SwiftUI flow can use the real `AuthAPIClient` in app runs and a deterministic `MockAuthAPIClient` in UI tests/previews.
- Covered: entry Continue starts the correct email or phone OTP request and only advances to OTP after the request succeeds.
- Covered: OTP Verify calls the correct email or phone verify endpoint and routes to complete-info or success based on `profileCompletionRequired`.
- Covered: loading labels, disabled repeat taps, entry validation feedback, OTP wrong-code feedback, network failure feedback, and cooldown modeling.

Validation:

- Complete: `xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath /tmp/darci-mobile-phase2-derived-data -only-testing:DARCiMobileTests test`.
- Complete: `xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath /tmp/darci-mobile-phase2-derived-data -only-testing:DARCiMobileUITests test`.

### Phase 3: Profile Completion And Session Persistence

Status: complete as of 2026-06-26.

Complete the authenticated onboarding path.

Deliverables:

- Covered: verified sessions are saved through `AuthSessionStore` immediately after OTP verification.
- Covered: OTP verification routes to complete-info or success based on `profileCompletionRequired`.
- Covered: complete-info dynamically locks/checks the verified email or phone and collects the missing counterpart.
- Covered: complete-info Continue submits `PATCH /users/me` through the native auth client with bearer auth.
- Covered: profile completion refreshes once on 401, retries the update with the refreshed access token, and persists the final user/session.
- Covered: UI tests use an in-memory session store so mocked auth does not write test tokens to Keychain.

Validation:

- Complete: `xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath /tmp/darci-mobile-phase3-derived-data -only-testing:DARCiMobileTests test`.
- Complete: `xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath /tmp/darci-mobile-phase3-derived-data -only-testing:DARCiMobileUITests test`.

### Phase 4: Launch Restoration And Sign-Out

Status: complete as of 2026-06-26.

Make authentication durable across app launches.

Deliverables:

- Covered: `AppSessionCoordinator` loads the stored session through `AuthSessionStore` on launch.
- Covered: stored refresh tokens are refreshed before the app enters the signed-in shell.
- Covered: refresh failures clear local auth and route the app back to authentication.
- Covered: sign-out clears the local session, resets auth UI state, and returns to authentication; backend logout can be added once the signed-in settings surface exists.
- Covered: UI tests can launch with a mocked stored session without writing tokens to Keychain.

Validation:

- Complete: `xcodegen generate && xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath /tmp/darci-mobile-phase4-derived-data -only-testing:DARCiMobileTests test`.
- Complete: `xcodegen generate && xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath /tmp/darci-mobile-phase4-derived-data -only-testing:DARCiMobileUITests test`.
- Automated coverage: coordinator unit tests cover no stored session, restore success, refresh failure clear, and local sign-out clear; UI coverage confirms mocked stored-session launch reaches signed-in content and sign-out returns to authentication.
- Deferred to staging QA: manual force-quit/relaunch against real Keychain tokens.

### Phase 5: Staging QA And Contract Hardening

Status: complete as of 2026-06-26 for implementation hardening and live OTP request delivery checks. Full verify-to-signed-in QA remains OTP-code-entry gated because received email/SMS codes must be entered directly by the tester, not passed through chat or logs.

Run the native flow against staging and close contract gaps.

Deliverables:

- Covered: OpenAPI phone OTP documentation for `/auth/otp/phone/start` and `/auth/otp/phone/verify`, plus `PhoneActionRequest`, `PhoneOtpVerifyRequest`, `OtpStartResponse`, and `profileCompletionRequired` on `AuthResponse`.
- Covered: backend integration tests prove native-style OTP requests without browser-only Origin, CSRF, or request-signature headers reach request validation instead of being rejected as forbidden.
- Covered: backend unit tests prove valid phone OTP request and verify handlers work with native-style empty headers.
- Covered: safe email OTP staging probe ran without sending a provider email and confirmed endpoint ingress, strict Resend config, trace headers, and validation response behavior.
- Covered: live email OTP request sent to the configured QA inbox, returned `200`, produced an 8-digit OTP envelope, and recorded successful custom Resend delivery.
- Covered: native-style no-header email OTP start request reached the endpoint and returned the expected cooldown response after the successful send.
- Covered: SMS provider status probe confirmed staging SNS remains sandboxed, the provided test phone is not opted out, and the signed SMS hook send returned `200`.
- Covered: native-style no-header phone OTP start request returned `200` with `SMS code sent`, `otpLength: 8`, and `cooldownSeconds: 60` for the registered test phone.
- Code-entry-gated: live email OTP verify and live phone OTP verify require the tester to enter the received codes directly in the simulator or terminal.

QA checklist:

- Complete: email OTP request delivers to the configured QA inbox and returns `otpLength` plus `cooldownSeconds`.
- Complete: phone OTP request reaches the configured registered QA phone path while SNS is sandboxed and returns `otpLength` plus `cooldownSeconds`.
- Wrong OTP returns `401` and the mobile UI shows `Wrong code. Check the code and try again.`
- Expired OTP returns `401`, keeps tokens out of storage, and allows a fresh resend after cooldown.
- Duplicate Continue and Verify taps remain disabled while requests are in flight.
- Offline entry, verify, profile completion, and refresh paths show recoverable network errors.
- Profile completion locks the verified contact and accepts the missing counterpart.
- Refresh expiry on launch clears Keychain auth and routes back to authentication.
- Sign-out clears the local session and returns to authentication without backend-only secrets in logs or app storage.

Validation:

- Complete: `node -e "const YAML = require('yamljs'); const doc = YAML.load('../api/openapi.yaml'); if (!doc.paths['/auth/otp/phone/start'] || !doc.paths['/auth/otp/phone/verify']) process.exit(1);"` from [backend](../backend).
- Complete: `npm test -- tests/unit/authController.phase1.test.ts tests/integration/auth.test.ts --reporter=dot`.
- Complete: `npm run probe:auth-otp` without `--send`.
- Complete: `npm run probe:auth-sms` in status mode.
- Complete: `npm run probe:auth-otp -- --send --email=<qa-email> --origin=http://localhost:3000 --returnTo=/app` returned `200` with custom email OTP delivery.
- Complete: `npm run probe:auth-sms -- --send-hook --phone=<qa-phone> --otp=123456` returned `200` from the signed SMS hook send path.
- Complete: direct native-style `POST /auth/otp/phone/start` with the QA phone and no browser-only headers returned `200` with `SMS code sent`.
- Complete: direct native-style `POST /auth/otp/start` with the QA email and no browser-only headers returned `200` with the expected cooldown response after the successful live send.
- Complete: `xcodegen generate && xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath /tmp/darci-mobile-phase5-derived-data -only-testing:DARCiMobileTests test`.
- Complete: `xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath /tmp/darci-mobile-phase5-derived-data -only-testing:DARCiMobileUITests test`.
- Code-entry-gated: manual simulator verification against real staging OTP needs the received OTP code entered directly by the tester.

## Acceptance Criteria

- A new user can start with email or phone, verify OTP, complete missing profile data, and reach the signed-in shell.
- A returning user can relaunch the app and remain signed in after refresh.
- A failed or expired session reliably returns to authentication with local tokens cleared.
- Verified email/phone locking matches backend rules.
- No backend-only secrets are present in the iOS app bundle or logs.
- Existing onboarding and auth UI behavior remains visually intact.