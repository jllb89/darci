# DARCi Mobile Auth Roadmap

Status: planned; native auth layer selected for the next mobile coding pass
Date: 2026-06-25

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

The app root in [apps/mobile/DARCiMobile/App/AppRootView.swift](../apps/mobile/DARCiMobile/App/AppRootView.swift) currently routes by local launch phase only. It does not restore a persisted auth session.

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

- Add `/auth/otp/phone/start` and `/auth/otp/phone/verify` to [api/openapi.yaml](../api/openapi.yaml) so the published contract matches production behavior.
- Confirm staging SMS hook/provider status before depending on real phone delivery in QA.
- Decide whether mobile should have a dedicated `returnTo` convention or omit it for OTP-only native flows.
- Add backend contract tests for native-style requests without Origin/CSRF/signature headers if not already covered.

## Roadmap

### Phase 1: Native Auth Foundation

Create the Swift auth foundation without changing the visible flow yet.

Deliverables:

- `AuthConfig` with staging/local API base selection.
- Codable auth request/response models.
- `AuthAPIClient` for OTP start, OTP verify, refresh, and profile completion.
- `AuthSessionStore` backed by Keychain plus in-memory test implementation.
- Unit coverage for URL construction, JSON decoding, error mapping, and Keychain store behavior.

Validation:

- iOS unit tests pass.
- A local smoke target can call the staging health endpoint without printing secrets.

### Phase 2: View Model And Entry/OTP Wiring

Move auth behavior into an injectable view model and wire the first two screens.

Deliverables:

- `AuthenticationViewModel` with phone/email challenge state.
- Continue button starts OTP requests.
- OTP verify calls the correct endpoint for the selected method.
- Loading, disabled, field error, wrong-code, and network error states are visible.
- Resend cooldown state is modeled, even if the first UI pass keeps it minimal.

Validation:

- Unit tests with a mock API client cover success, wrong-code, validation failure, network failure, and cooldown state.
- Existing UI smoke tests still pass with mocked auth responses.

### Phase 3: Profile Completion And Session Persistence

Complete the authenticated onboarding path.

Deliverables:

- Store verified sessions after OTP verify.
- Route to complete-info when `profileCompletionRequired` is true.
- Lock the verified email or phone field based on challenge method.
- Submit `PATCH /users/me` with bearer auth.
- Refresh once on 401 and retry the profile update.
- Persist final user/session after profile completion.

Validation:

- Unit tests cover email-verified and phone-verified profile completion.
- Tests cover verified-contact mismatch prevention before submitting.
- Mocked UI test covers entry -> OTP -> complete-info -> success.

### Phase 4: Launch Restoration And Sign-Out

Make authentication durable across app launches.

Deliverables:

- App launch loads the Keychain session.
- Stored refresh token is used to refresh before entering signed-in content.
- Refresh failure clears local auth and returns to authentication.
- Sign-out clears local auth; backend logout can be added once the signed-in settings surface exists.

Validation:

- Unit tests cover restore success, refresh failure, and local clear.
- Manual simulator check confirms force-quit/relaunch behavior.

### Phase 5: Staging QA And Contract Hardening

Run the native flow against staging and close contract gaps.

Deliverables:

- Email OTP happy path against staging.
- Phone OTP happy path once SMS delivery is active.
- OpenAPI phone OTP documentation update.
- Backend test coverage for native requests without browser headers.
- QA checklist for expired OTP, wrong OTP, resend, duplicate taps, offline mode, and refresh expiry.

Validation:

- `xcodebuild` unit/UI suite passes.
- Manual simulator run reaches signed-in shell using staging auth.
- Backend/web tests touched by OpenAPI or auth contract changes pass.

## Acceptance Criteria

- A new user can start with email or phone, verify OTP, complete missing profile data, and reach the signed-in shell.
- A returning user can relaunch the app and remain signed in after refresh.
- A failed or expired session reliably returns to authentication with local tokens cleared.
- Verified email/phone locking matches backend rules.
- No backend-only secrets are present in the iOS app bundle or logs.
- Existing onboarding and auth UI behavior remains visually intact.