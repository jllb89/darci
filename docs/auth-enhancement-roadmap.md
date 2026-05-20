# DARCi Auth Audit And Enhancement Roadmap

Status: Phase 3 Option B complete; `/start` now uses Supabase email/phone OTP plus Google OAuth; staging dashboard activation pending
Date: 2026-05-07

## Goal

DARCi uses Supabase Auth, but the mounted product auth surface is still a thin email/password wrapper. This document audits the current spec, database schema, controllers, endpoints, services, frontend auth helper, and tests, then lays out a role-aware enhancement roadmap for members, pro members, notaries, and admins.

The near-term goal is not to replace the existing role/document authorization model. The goal is to let Supabase own identity credentials and sessions while DARCi owns product profiles, role capabilities, onboarding policy, notification lifecycle, and sensitive-action controls.

Stripe implementation is intentionally not part of the near-term auth priority. The auth work still needs to prepare clean boundaries for future Stripe work: confirmed/active accounts, verified role capabilities, reauthentication for sensitive billing actions, and entitlement checks that never confuse payment state with identity trust.

## High-Level Verdict

The foundation is usable but incomplete.

What exists today:

- Email/password login, signup, refresh, and logout are mounted in [backend/src/routes/auth.ts](../backend/src/routes/auth.ts) and implemented in [backend/src/controllers/authController.ts](../backend/src/controllers/authController.ts).
- Supabase JWT verification is centralized in [backend/src/middleware/auth.ts](../backend/src/middleware/auth.ts), with role guards in [backend/src/middleware/roles.ts](../backend/src/middleware/roles.ts).
- Multi-role identity is much stronger than the auth surface: [backend/src/services/userRoleService.ts](../backend/src/services/userRoleService.ts) and [supabase/migrations/20260419190000_add_phase1_multi_role_identity.sql](../supabase/migrations/20260419190000_add_phase1_multi_role_identity.sql) model member, pro, notary, and admin capabilities.
- The web app stores backend-returned Supabase tokens in browser `localStorage` through [apps/web/src/lib/auth.ts](../apps/web/src/lib/auth.ts). Password login, resend confirmation, password recovery, magic-link requests, email OTP start, and email OTP verification post through backend auth endpoints. Signup and PKCE callback exchange still use the browser Supabase client in [apps/web/src/lib/supabaseClient.ts](../apps/web/src/lib/supabaseClient.ts).
- Document signer invites are product invites, not account invites. They are separate from auth onboarding and live under the invite tables/routes documented in [docs/signer-invitation-workflow-roadmap.md](signer-invitation-workflow-roadmap.md).

What Phase 1 now covers:

- Email confirmation is enforced through Supabase public signup and browser PKCE callback handling.
- Password recovery/reset is implemented through Supabase recovery tokens, Resend delivery, and a DARCi reset normalization endpoint.

Remaining major gaps:
- Magic links and email OTP are implemented. Phone OTP is implemented as Supabase-owned Auth OTP delivered through the Supabase Send SMS Hook and AWS SNS; staging requires Supabase dashboard activation and hook secret configuration before SMS can send.
- MFA and reauthentication before sensitive actions are not implemented.
- Google OAuth is wired in the web flow, but the Supabase Google provider and redirect allow-list must be configured per environment.
- Admin user invitations do not exist; admin role APIs only operate on existing Supabase users.
- SMS schema exists, and AWS SNS is now wired as a DARCi-owned notification outbox provider when explicitly enabled. It is not used for Supabase Auth phone OTP.
- Runtime auth rate limiting and full audit-event writes are not complete. Phase 0 now defines the rate-limit plan, audit action names, sensitive-action policy, logout scope semantics, and account status enforcement guardrails.

## Current Supabase Guidance To Carry Into Implementation

This roadmap was refreshed against current Supabase Auth documentation on 2026-04-30. The following implementation details should guide Phase 0 and Phase 1 work.

- Public self-signup should use Supabase's confirmation flow instead of `auth.admin.createUser({ email_confirm: true })`. When Confirm email is enabled, Supabase `signUp` returns a user with a null session; DARCi should show a confirmation-required state and should not grant normal app access until confirmation completes.
- Supabase admin `createUser` does not send a confirmation email. It should be reserved for trusted server/admin flows where DARCi intentionally creates or confirms a user, not for public self-signup.
- Email confirmation, password recovery, magic links, and OAuth redirects should use an explicit callback strategy. If we use PKCE, the browser that starts the flow must be able to exchange the returned code with `exchangeCodeForSession`; a backend-only proxy should not assume it can complete PKCE without preserving the verifier in a secure same-browser context.
- Password recovery is a two-step flow: Supabase owns recovery token verification, then the reset page establishes a recovery session and `updateUser({ password })` changes the password. DARCi sends recovery emails through Resend without adding custom recovery-token tables.
- Confirmation resend should use Supabase `resend({ type: "signup" })`. Passwordless sign-in resends should call `signInWithOtp` again, and password recovery resends should generate a recovery token and deliver the DARCi reset link through Resend.
- Passwordless `signInWithOtp` can create users by default. For invite/login flows where DARCi must not silently create accounts, set `shouldCreateUser: false`.
- Server-side authorization must be based on verified JWTs or Supabase `getUser`. Supabase `getSession` is not an authorization primitive on the server because it reads session storage rather than validating with Auth.
- Supabase `signOut()` defaults to global sign-out. For a normal app sign-out button, local sign-out is usually the expected behavior; DARCi should either change the default logout contract to local or expose separate local/global sign-out actions.
- Supabase MFA currently supports TOTP and phone factors. Sensitive DARCi routes should enforce authenticator assurance level (`aal2`) or a DARCi recent-reauth window before role grants, admin user invitations, notary finalization/seal actions, credential changes, and high-value billing changes.
- Production Auth email delivery should use custom SMTP, the Supabase Resend integration, or the Supabase Send Email Hook. The Send Email Hook replaces Supabase's built-in email sending, so choosing it means DARCi owns provider fallback and hook observability.
- Supabase hosted phone auth supports native SMS providers such as Twilio, Vonage, MessageBird, and Textlocal. The Send SMS Hook can route Auth SMS through a custom provider such as AWS SNS, but choosing that path means DARCi owns hook reliability, delivery monitoring, and abuse controls for security-critical OTPs.
- Auth rate limits, CAPTCHA escalation, and IP-forwarding behavior should be designed before widening OTP and recovery surfaces. If backend server-side calls forward client IPs to Supabase, use the documented secret-key forwarding behavior rather than exposing untrusted headers from the browser.
- Keep existing HS256 compatibility, but treat asymmetric Supabase JWT signing keys and JWKS verification as the production direction. The backend already has JWKS support in [backend/src/middleware/auth.ts](../backend/src/middleware/auth.ts).

## Current-State Audit

### OpenAPI Spec

Relevant file: [api/openapi.yaml](../api/openapi.yaml)

Mounted auth endpoints in the spec:

- `POST /auth/login`
- `POST /auth/signup`
- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /auth/resend-confirmation`
- `POST /auth/password/recovery`
- `POST /auth/password/reset`
- `POST /auth/session/sync`
- `GET /users/me`
- `PATCH /users/me/active-role`
- `GET /admin/users/{id}/roles`
- `POST /admin/users/{id}/roles`
- `PATCH /admin/users/{id}/active-role`

Schemas currently published:

- `LoginRequest`: email and password.
- `SignupRequest`: first name, last name, email, password.
- `LogoutRequest`: refresh token.
- `RefreshRequest`: refresh token.
- `EmailActionRequest`: email plus optional `returnTo`.
- `PasswordResetRequest`: recovery-session refresh token plus new password.
- `SessionSyncRequest`: optional refresh token for browser PKCE session sync.
- `AuthResponse`: access token, refresh token, user.
- `RuntimeRole`: `member`, `pro`, `notary`, `admin`.
- `UserRoleAssignment` and `UserRoleAssignmentsResponse` for multi-role admin operations.

Spec gaps:

- Magic-link request and email OTP start/verify endpoints are published.
- No phone OTP start/verify endpoints.
- No OAuth start/callback endpoint.
- No MFA enroll/challenge/verify/unenroll endpoints.
- No reauthentication or step-up endpoint.
- No admin user invitation endpoint.
- No auth audit/event schemas.

Spec issue resolved during Phase 0:

- The `/auth/refresh` response block previously appeared duplicated under the same operation, including repeated `400`, `401`, and `500` keys and an extra `description/content` pair nested under the first `500`. The spec now publishes a single response map for that operation.

### Backend Routing And Middleware

Relevant files:

- [backend/src/index.ts](../backend/src/index.ts)
- [backend/src/routes/auth.ts](../backend/src/routes/auth.ts)
- [backend/src/middleware/auth.ts](../backend/src/middleware/auth.ts)
- [backend/src/middleware/roles.ts](../backend/src/middleware/roles.ts)
- [backend/src/types/express.d.ts](../backend/src/types/express.d.ts)

Current behavior:

- Public paths are `/health`, `/docs`, `/openapi.yaml`, `/auth/login`, `/auth/signup`, `/auth/refresh`, `/auth/resend-confirmation`, `/auth/password/recovery`, `/verify/*`, and `/invites/public/*`.
- `/auth/logout` is intentionally protected and requires both bearer access token and refresh token.
- JWT verification supports Supabase HS256 projects through `SUPABASE_JWT_SECRET` and asymmetric Supabase signing keys through JWKS.
- After JWT verification, middleware attempts to load DARCi's `public.users` row by Supabase user id and enriches `req.user` with `dbUserId`, `role`, `availableRoles`, and `status`.
- If no DB identity exists and the token is otherwise valid, non-production environments fall back to `member`. Production now fails closed unless `AUTH_ALLOW_MISSING_DB_USER_FALLBACK=true` is explicitly set. `/auth/session/sync` and `/auth/password/reset` are the narrow exceptions so confirmed/recovery Supabase browser sessions can create the missing DARCi profile mirror.
- Role guards call `roleSatisfiesRequirement`; `pro` satisfies member-protected routes.
- Inactive DARCi account statuses are blocked at the auth middleware boundary before protected routes run. `/auth/logout` remains reachable so suspended users can clear their current app session.

Risks and gaps:

- `req.user.status` is enforced by `requireAuth` for authenticated app requests. This blocks suspended/revoked accounts before role guards and controllers run.
- Phase 1 writes audit events for signup, resend confirmation, recovery request, email confirmation sync, and password reset. Login/logout/refresh audit writes are still planned.
- There is no runtime login/signup rate limiting or CAPTCHA escalation at the Express boundary yet, but Phase 0 defines the initial policy buckets in [backend/src/auth/authPolicy.ts](../backend/src/auth/authPolicy.ts).
- The middleware still tolerates DB lookup failures in some test/dev cases and falls back to `member`. Production missing-profile behavior now fails closed by default.
- Backend auth endpoints proxy Supabase sessions but do not expose Supabase's richer auth flows.

### Auth Controller

Relevant file: [backend/src/controllers/authController.ts](../backend/src/controllers/authController.ts)

Implemented flows:

- `login`: validates email/password, calls `supabase.auth.signInWithPassword`, syncs DARCi user identity, returns access and refresh tokens.
- `signup`: calls Supabase public `auth.signUp` with a confirmation redirect, creates or updates the DARCi profile mirror, and returns a confirmation-required response when Supabase returns no session.
- `resendConfirmation`: calls Supabase `auth.resend({ type: "signup" })` with the DARCi callback URL.
- `requestPasswordRecovery`: generates a Supabase recovery token and sends a direct DARCi reset-page token URL through Resend.
- `resetPassword`: remains available as a backend normalization endpoint for API clients with a valid Supabase recovery session.
- `syncSession`: validates a browser Supabase PKCE session with `getUser`, syncs the DARCi profile mirror, and returns DARCi's stored auth shape. Browser recovery pages update the password with Supabase `updateUser({ password })`, then call session sync.
- `refresh`: calls `supabase.auth.refreshSession`, syncs DARCi identity, returns new tokens.
- `logout`: sets the current Supabase session from bearer and refresh token, then calls `signOut` with explicit scope. The default is `local`; callers can request `global` for sign-out-everywhere or security-event flows.

Important finding resolved in Phase 1:

- Signup no longer uses `supabaseAdmin.auth.admin.createUser({ email_confirm: true })` for public self-signup. Supabase now owns the confirmation email and callback session.

Other gaps:

- Supabase `signInWithOtp`, `verifyOtp`, and magic-link flows are wired for existing accounts.
- No OAuth exchange/callback flow.
- No MFA or assurance-level checks.
- No admin-invite acceptance flow.

### Identity And Role Services

Relevant files:

- [backend/src/services/userRoleService.ts](../backend/src/services/userRoleService.ts)
- [backend/src/controllers/usersController.ts](../backend/src/controllers/usersController.ts)
- [backend/src/controllers/adminController.ts](../backend/src/controllers/adminController.ts)
- [backend/src/routes/users.ts](../backend/src/routes/users.ts)
- [backend/src/routes/admin.ts](../backend/src/routes/admin.ts)

Current model:

- `runtimeRoleValues` are `member`, `pro`, `notary`, and `admin`.
- `public.users.role` remains the active runtime role for compatibility.
- `public.user_roles` is the richer capability table. It supports multiple assignments per user, `active/suspended/revoked` status, and one `is_active_profile` role per user.
- Role switching updates `public.user_roles`, `public.users.role`, and Supabase `app_metadata.role`.
- Admins can list/upsert role assignments and switch active roles for existing Supabase users.

Strong parts:

- This is the right separation: Supabase owns credential identity; DARCi owns role capabilities.
- `pro` is first-class and intentionally satisfies member routes where product behavior is equivalent.
- Notary/pro verification tables already exist, so credential review can be layered onto account onboarding.

Gaps:

- Admin role assignment only works after a Supabase user already exists. There is no `inviteUserByEmail` or app-level user invitation flow.
- Role changes are not step-up protected. An admin with a stale session can grant roles, switch active roles, or alter notification templates.
- Role assignment history exists in the database, but controller-level audit coverage should be verified and expanded for auth-sensitive operations.
- Role verification records are schema-only in this audit. They are not wired into onboarding gates for pro or notary activation.

### Database Schema And RLS

Relevant migrations:

- [supabase/migrations/20260224120000_init.sql](../supabase/migrations/20260224120000_init.sql)
- [supabase/migrations/20260326131000_users_role_check.sql](../supabase/migrations/20260326131000_users_role_check.sql)
- [supabase/migrations/20260326133000_users_add_names.sql](../supabase/migrations/20260326133000_users_add_names.sql)
- [supabase/migrations/20260419190000_add_phase1_multi_role_identity.sql](../supabase/migrations/20260419190000_add_phase1_multi_role_identity.sql)
- [supabase/migrations/20260420113000_add_phase5_meeting_evidence.sql](../supabase/migrations/20260420113000_add_phase5_meeting_evidence.sql)
- [supabase/migrations/20260419233000_add_phase3_invites_and_notifications.sql](../supabase/migrations/20260419233000_add_phase3_invites_and_notifications.sql)

Current tables relevant to identity/auth:

- `public.users`: DARCi profile row keyed to `supabase_user_id`, with email, active role, account status, first name, and last name.
- `public.user_roles`: role capability assignments.
- `public.user_role_verifications`: role-related identity/license/commission/professional verification records.
- `public.pro_profiles`: pro-business metadata.
- `public.notary_profiles`: notary commission metadata.
- `public.user_role_history`: role status/history ledger.
- `public.role_verification_artifacts`: storage references for verification artifacts.
- `public.identity_verification_events`: notarial meeting participant identity checks, separate from account login identity.
- `public.document_access_invites`, `invite_recipients`, `invite_tokens`, and `invite_claims`: product/document invite model.

Current RLS posture:

- User rows are generally self-readable/self-writable by matching `auth.uid()` to `users.supabase_user_id`.
- Role tables are self-readable and service-role writable.
- Pro and notary profile rows are owner-accessible plus service-role accessible.
- Product tables rely heavily on owner/notary/user relationships and service role for backend operations.

Schema gaps for auth enhancement:

- No app-level mirror of Supabase `email_confirmed_at`, phone, phone confirmed state, last sign-in, or last auth sync timestamp.
- No app-level auth event table dedicated to login, logout, reset, confirmation, OTP, OAuth, MFA, or reauth events. Existing `audit_events` can be reused if event naming is standardized.
- No admin user invitation table.
- No account-level policy flags such as `requires_mfa`, `mfa_required_after`, or `last_reauthenticated_at`.
- No table for app-owned step-up challenges if DARCi chooses AWS SNS for reauth codes outside Supabase Auth.
- No rate-limit or failed-login state in the database. This may belong in Redis instead.

Important distinction:

- Do not build custom password reset or email confirmation token tables unless Supabase cannot support a required product behavior. Supabase should own credential/recovery tokens. DARCi should mirror state and audit outcomes.

### Frontend Auth

Relevant files:

- [apps/web/src/lib/auth.ts](../apps/web/src/lib/auth.ts)
- [apps/web/src/lib/supabaseClient.ts](../apps/web/src/lib/supabaseClient.ts)
- [apps/web/src/app/start/page.tsx](../apps/web/src/app/start/page.tsx)
- [apps/web/src/app/auth/callback/page.tsx](../apps/web/src/app/auth/callback/page.tsx)
- [apps/web/src/app/auth/reset-password/page.tsx](../apps/web/src/app/auth/reset-password/page.tsx)
- [apps/web/src/app/app/invite/page.tsx](../apps/web/src/app/app/invite/page.tsx)
- [apps/web/package.json](../apps/web/package.json)

Current behavior:

- The web app uses `@supabase/supabase-js` for browser PKCE email action links and callback exchange.
- `/start` posts password login, resend confirmation, password recovery, magic-link requests, email OTP start, and email OTP verification through backend auth endpoints. Signup still uses the browser Supabase client so PKCE confirmation links remain same-browser exchangeable.
- Access token, refresh token, and user are stored in browser `localStorage` under `darci.accessToken`, `darci.refreshToken`, and `darci.user`.
- `refreshStoredAuth` calls backend `/auth/refresh` when API calls return `401`.
- Logout calls backend `/auth/logout` and clears local storage.
- The invite landing page can route anonymous users to `/start` with `mode=signup|login` and sanitized `returnTo`.
- Email confirmation and password recovery links resolve through `/auth/callback`; recovery then routes to `/auth/reset-password`.
- The Google OAuth button is visible but disabled and not wired.

Risks and gaps:

- `localStorage` token storage increases blast radius for XSS. It is common in early SPAs, but an auth hardening milestone should evaluate httpOnly cookie sessions or Supabase SSR/browser helpers.
- The callback route currently handles confirmation, recovery, magic links, and OTP email-link callbacks. OAuth still needs product decisions and callback routing.
- There is no UI for phone collection, MFA enrollment, backup/recovery codes, or reauth prompts.
- There is no role-specific onboarding path for pro users, notaries, or admins.

### Notifications, Invites, And SMS

Relevant files:

- [backend/src/services/notificationService.ts](../backend/src/services/notificationService.ts)
- [backend/src/services/notificationOutboxService.ts](../backend/src/services/notificationOutboxService.ts)
- [backend/src/services/notificationProviderPolicy.ts](../backend/src/services/notificationProviderPolicy.ts)
- [backend/src/controllers/notificationInternalController.ts](../backend/src/controllers/notificationInternalController.ts)
- [api/openapi.yaml](../api/openapi.yaml)

Current state:

- Notification schema and OpenAPI schemas know about `email`, `sms`, and `in_app` channels.
- Delivery provider enums include `twilio` in some contracts.
- Runtime email provider policy resolves only `internal` or `resend`.
- The worker dispatches `internal` and `resend` providers. Other provider values throw `provider_unavailable`.
- No AWS SNS SDK dependency or SNS adapter exists.
- Existing document signer invites are email-centered and now use Resend lifecycle tracking.

SMS/Auth implication:

- Supabase hosted phone auth currently lists MessageBird, Twilio, Vonage, and Textlocal as supported SMS providers. AWS SNS is not listed as a native hosted Supabase Auth SMS provider.
- Supabase also supports a Send SMS Hook that replaces its built-in SMS sending. AWS SNS may be viable through that hook, but then DARCi owns hook security, delivery reliability, retry/fallback behavior, and monitoring for Auth OTP delivery.
- AWS SNS can still be valuable for DARCi-owned SMS notifications or reauth challenges. If used outside Supabase Auth, it must remain separate from Supabase phone-login sessions and must store only hashed OTPs or challenge proofs.
- Keep "Supabase Auth phone OTP" and "DARCi notification/step-up SMS" as separate architectural choices.

### Tests

Relevant files:

- [backend/tests/integration/auth.test.ts](../backend/tests/integration/auth.test.ts)
- [backend/tests/integration/auth-logout.test.ts](../backend/tests/integration/auth-logout.test.ts)
- [backend/tests/unit/authController.logout.test.ts](../backend/tests/unit/authController.logout.test.ts)

Current coverage:

- Missing bearer token is rejected.
- Role guards reject member access to a notary endpoint.
- Notary role reaches a notary endpoint.
- Logout revokes a Supabase session through the controller and route.

Missing coverage:

- Login success/failure.
- Signup success/conflict/validation.
- Refresh success/failure.
- End-to-end email confirmation and password recovery against a real Supabase project.
- Phone OTP.
- OAuth callback/session exchange.
- MFA enrollment/challenge/verification.
- Reauth enforcement on admin/notary sensitive actions.
- Role switching and admin role grants.
- Rate limiting and audit events.

## Requested Feature Gap Matrix

| Feature | Current State | Target State |
| --- | --- | --- |
| Email confirmation | Implemented with Supabase public signup, resend confirmation, browser PKCE callback, and backend session sync | Add end-to-end staging coverage and delivery observability |
| Password recovery | Implemented with Supabase recovery tokens, Resend delivery, browser reset-page verification, backend reset normalization, and audit event | Add end-to-end staging coverage and provider delivery tracking |
| Password reset while signed in | Missing | Require current password or step-up, then `updateUser({ password })` |
| Email OTP | Implemented through Supabase browser `signInWithOtp` and `verifyOtp` on `/start` | Add staging E2E coverage and delivery observability |
| Phone/SMS OTP | Implemented through Supabase Auth phone OTP with DARCi's signed Send SMS Hook to AWS SNS | Activate Supabase dashboard settings, AWS hook secret, SNS spend/compliance, and staging E2E coverage |
| Magic links | Implemented for existing accounts through Supabase `signInWithOtp`, browser PKCE callback exchange, and invite return target support | Add staging E2E coverage and delivery observability |
| Social OAuth | Google button wired through Supabase browser OAuth and DARCi session sync | Configure Google provider credentials, redirect allow-list, and account-linking rules in Supabase |
| MFA | Missing | TOTP first for admins/notaries, optional for members/pro, policy-driven enforcement |
| Reauth before sensitive action | Missing | Step-up challenge/assurance check before role grants, notary finalization, credential changes, and account security changes |
| Invite users | Document signer invites only | Separate account/user invitation flow for admins, notaries, pro users, and organization/team use later |
| Role onboarding | Schema exists, flows incomplete | Member default; pro/notary/admin require role assignment, optional invitation, and verification gates |

## Target Architecture

### Identity Boundary

Supabase Auth should own:

- Password credentials.
- Email confirmation tokens.
- Password recovery tokens.
- Email OTP and magic-link tokens.
- Phone OTP when using a Supabase-supported SMS provider.
- OAuth identities and provider account linking.
- MFA factors where Supabase supports the required method.
- Session refresh/revocation.

DARCi should own:

- `public.users` profile mirror and app account status.
- Role capabilities in `public.user_roles`.
- Pro/notary verification workflow.
- Admin account invitations and role intent.
- Document signer invite lifecycle.
- Notification templates/outbox/delivery lifecycle.
- Auth and sensitive-action audit events.
- Product authorization decisions.

Future Stripe work should depend on this boundary rather than creating a second identity system. Stripe customer, subscription, and payment state may unlock product entitlements, but it must not create trusted identity, grant `pro`, `notary`, or `admin` roles, bypass account status, or satisfy notary/pro verification requirements.

### Billing And Stripe Readiness Boundary

Stripe is a later implementation priority, but auth should prepare these invariants now:

- Only confirmed and active DARCi accounts should be able to start payment flows from the app.
- Public payment-return pages may be unauthenticated for Stripe redirects, but entitlement activation must happen from trusted Stripe webhooks or backend verification, not from browser redirect parameters.
- Stripe webhooks should run as trusted system/service work. They should not require a user session and should not derive authorization from request users.
- Payment success may create or update `billing_orders`, `billing_subscriptions`, `billing_entitlements`, payment transactions, and Pro credit lots. It must not directly grant role assignments.
- Pro credit purchases require an active/verified `pro` role before purchase or before credit use, depending on final policy. Payment alone should not verify a Pro.
- Notary membership purchases require an active/verified `notary` role before live notarization capacity is usable. Payment alone should not verify a notary commission.
- Billing account ownership should attach to DARCi `public.users.id`, with Stripe IDs stored as provider references. Stripe metadata should include DARCi user id, billing account id, order id, product family, environment, and any document/request id needed for reconciliation.
- Billing changes that can affect money movement, refunds, payment methods, Pro credit lots, notary membership tiers, or admin overrides should require recent reauth and, for admin/notary-sensitive paths, MFA.
- Suspended/revoked DARCi accounts should be blocked from starting new app payment flows and from consuming entitlements, even if Stripe reports an active subscription. Refund/cancel handling remains an operations workflow, not an auth bypass.
- Supabase Stripe Sync Engine should be treated as local billing data for joins, reporting, and reconciliation. DARCi's internal fulfillment logic should still update entitlement and credit tables from trusted payment events.

See the separate [docs/stripe-implementation-roadmap.md](stripe-implementation-roadmap.md) for the later Stripe implementation plan.

### Role-Aware Account Model

Member:

- Default role after confirmed signup or approved invite acceptance.
- Can create documents, sign their documents, claim signer invites, and manage their own profile.
- MFA optional at first.

Pro member:

- A `pro` role assignment plus optional `pro_profiles` row.
- Can satisfy member routes and unlock pro product surfaces.
- Should have billing/entitlement checks separate from role assignment.
- Verification may be optional or product-dependent.

Notary:

- A `notary` role assignment plus `notary_profiles` and verification records.
- Should not be activated solely by self-signup.
- Requires commission/license verification and stronger account security before live notarization work.
- MFA should be required before final notary production access.

Admin:

- A tightly controlled `admin` role assignment.
- Should require MFA, reauth for role/user changes, auth audit logs, and possibly IP/session policy later.
- Should be invited or manually promoted by existing trusted admin/service process.

### Session Storage Direction

There are two viable paths:

1. Keep backend-proxied auth endpoints short term and harden them.
2. Move the web app to Supabase client/SSR auth helpers with secure cookie sessions and backend token verification still honoring Supabase JWTs.

Recommended path:

- Short term: keep the backend proxy for password login/refresh/logout to limit churn, but add a thin Supabase browser client for PKCE-based email confirmation, recovery, magic-link, and OAuth callback exchange.
- Medium term: evaluate httpOnly cookie session storage for the Next app to reduce `localStorage` token exposure.
- Do not block critical confirmation/reset work on the session storage migration.

## Roadmap

### Phase 0: Spec And Guardrail Cleanup

Purpose: make the current auth surface explicit before adding new flows.

Backend/spec work:

- Clean the duplicated `/auth/refresh` response block in [api/openapi.yaml](../api/openapi.yaml).
- Document Phase 0 auth behavior honestly before the Phase 1 signup semantics change.
- Add explicit `401`/`403` behavior for suspended account status once enforced.
- Add auth audit event naming conventions.
- Decide logout semantics explicitly: local sign-out for normal user logout, global sign-out only for "sign out everywhere" or security events.

Security work:

- Enforce `public.users.status = active` in `requireAuth` or `requireRole`.
- Decide whether identity lookup failure in production should fail closed.
- Add a minimal rate-limit plan for `/auth/login`, `/auth/signup`, `/auth/refresh`, and future OTP endpoints.
- Add a minimal sensitive-action policy that future Stripe work can reuse: payment-method changes, refunds, Pro credit grants/adjustments, membership overrides, and high-value checkout actions require recent reauth; admin billing overrides require MFA.

Tests:

- Add middleware tests for suspended users and missing DB identity behavior.
- Add OpenAPI validation in CI or at least a stricter duplicate-key check.

Implementation status on 2026-04-30:

- [api/openapi.yaml](../api/openapi.yaml) now has a single `/auth/refresh` response map, explicit inactive-account `403` responses for auth session endpoints, documented current signup behavior, and local/global logout scope semantics.
- [backend/src/auth/authPolicy.ts](../backend/src/auth/authPolicy.ts) centralizes account-status errors, logout scope policy, auth audit action names, initial rate-limit buckets, and the sensitive-action policy future billing/admin/notary routes should reuse.
- [backend/src/middleware/auth.ts](../backend/src/middleware/auth.ts) blocks inactive DARCi accounts and fails closed for missing app identity in production by default.
- [backend/src/controllers/authController.ts](../backend/src/controllers/authController.ts) blocks inactive accounts from login/refresh/signup responses and defaults logout to local scope while allowing explicit global scope.
- Focused tests cover suspended-account blocking, logout reachability for inactive users, production missing-profile fail-closed behavior, local/global logout scope, and the `/auth/refresh` duplicate-response regression.

### Phase 1: Email Confirmation And Password Recovery

Purpose: close the highest-risk account hygiene gaps.

Backend work:

- Change signup away from `supabaseAdmin.auth.admin.createUser({ email_confirm: true })` for public self-signup.
- Use Supabase's confirmation flow so confirmation emails are sent.
- Add `POST /auth/resend-confirmation` if backend-proxied API clients need it; otherwise wire the web flow directly to Supabase `auth.resend`.
- Add `POST /auth/password/recovery` if backend-proxied API clients need it; otherwise wire the web flow directly to Supabase recovery-token generation and DARCi email delivery.
- Add a callback/session exchange path for confirmation and recovery links. For PKCE, use a Supabase browser client so the same browser can exchange the code with `exchangeCodeForSession`.
- Add `POST /auth/password/reset` only as a backend-owned normalization layer if needed; the Supabase password update itself should happen from a valid recovery session using `updateUser({ password })`.
- Sync confirmation state into `public.users` if we add mirror columns.

Frontend work:

- Add `@supabase/supabase-js` to the web app for PKCE auth action links and OAuth/passwordless callbacks.
- Add post-signup "check your email" state.
- Wire the existing reset-password button.
- Add recovery callback page and reset form.
- Preserve invite `returnTo` through confirmation/recovery flows.
- After callback session exchange, call the backend to sync `public.users`, role context, and DARCi's existing stored user shape.

Schema work:

- Add `email_confirmed_at`, `last_auth_synced_at`, and optional `last_sign_in_at` mirrors to `public.users` if product UI needs them.
- Add audit events for signup requested, email confirmed, recovery requested, password reset completed, and failed reset.

Tests:

- Controller tests for confirmation/resend/recovery/reset contracts.
- Integration tests with mocked Supabase Auth client calls.
- Frontend tests for signup confirmation and reset states.

Implementation status on 2026-04-30:

- [backend/src/controllers/authController.ts](../backend/src/controllers/authController.ts) now uses Supabase public signup for confirmation-aware self-registration, exposes backend resend/recovery/reset/session-sync endpoints, and mirrors Supabase auth lifecycle timestamps into DARCi profiles.
- [backend/src/routes/auth.ts](../backend/src/routes/auth.ts) mounts `POST /auth/resend-confirmation`, `POST /auth/password/recovery`, `POST /auth/password/reset`, and `POST /auth/session/sync`.
- [supabase/migrations/20260430160000_add_phase1_auth_confirmation_mirrors.sql](../supabase/migrations/20260430160000_add_phase1_auth_confirmation_mirrors.sql) adds non-destructive auth lifecycle mirror columns to `public.users`.
- [apps/web/src/lib/supabaseClient.ts](../apps/web/src/lib/supabaseClient.ts), [apps/web/src/app/auth/callback/page.tsx](../apps/web/src/app/auth/callback/page.tsx), and [apps/web/src/app/auth/reset-password/page.tsx](../apps/web/src/app/auth/reset-password/page.tsx) implement the browser PKCE callback and recovery reset flow. The reset page uses the Supabase recovery session to call `updateUser({ password })`, then syncs the DARCi profile/session shape through the backend.
- [apps/web/src/app/start/page.tsx](../apps/web/src/app/start/page.tsx) shows a confirmation-required signup state, preserves sanitized `returnTo`, supports resend confirmation, and wires password recovery.
- Focused backend tests cover signup confirmation, resend, recovery, reset, session sync, middleware missing-profile behavior for session sync, logout scope behavior, and the OpenAPI refresh-response regression. The web build and existing web tests pass.

### Phase 2: Magic Links And Email OTP

Purpose: reduce friction for signer and member entry without weakening invite boundaries.

Backend work:

- Add `POST /auth/magic-link` for email link sign-in.
- Add `POST /auth/otp/start` and `POST /auth/otp/verify` for email OTP if we want explicit code entry.
- Add callback/session exchange handling for magic links.
- Bind returned sessions through `ensureUserIdentityFromAuth`.
- For invited-signing flows, use `shouldCreateUser: false` unless the product intentionally wants passwordless account creation.

Invite integration:

- Let `/app/invite?token=...` offer magic-link entry when the invited email is known.
- Keep the existing claim plus authenticated email-match rule for signing access.
- Never let a magic link alone grant document access without invite claim validation.

Frontend work:

- Add passwordless tab or mode on `/start`.
- Add invite-aware "send me a link" path.
- Add callback handling that routes back to sanitized `returnTo`.

Tests:

- Magic link request, callback exchange, and invite return flow.
- OTP start/verify success, expiry/failure, and rate-limit behavior.

Implementation status on 2026-04-30:

- [backend/src/controllers/authController.ts](../backend/src/controllers/authController.ts), [backend/src/routes/auth.ts](../backend/src/routes/auth.ts), and [backend/src/middleware/auth.ts](../backend/src/middleware/auth.ts) now expose public `POST /auth/magic-link`, `POST /auth/otp/start`, and `POST /auth/otp/verify` endpoints. Magic-link and OTP start both use Supabase `signInWithOtp` with `shouldCreateUser: false`; OTP verification uses Supabase `verifyOtp` and returns the existing DARCi auth response shape after profile sync.
- [apps/web/src/app/start/page.tsx](../apps/web/src/app/start/page.tsx) now has password, email-link, and email-code login modes while preserving sanitized invite `returnTo` routes.
- [apps/web/src/app/auth/callback/page.tsx](../apps/web/src/app/auth/callback/page.tsx) and [apps/web/src/lib/auth.ts](../apps/web/src/lib/auth.ts) pass passwordless callback intent through `/auth/session/sync` so magic-link and OTP email-link sessions are audited and routed back to the original app destination.
- [api/openapi.yaml](../api/openapi.yaml) publishes the Phase 2 passwordless endpoints and `EmailOtpVerifyRequest` schema.
- Focused backend tests cover magic-link request creation policy, OTP start, OTP verification, and magic-link callback audit sync. Web and backend builds pass.

### Phase 3: SMS Strategy And Phone OTP

Purpose: decide SMS ownership before wiring security-critical phone login.

Decision point:

- Option A: use a Supabase-supported phone auth provider such as Twilio, Vonage, MessageBird, or Textlocal. This is the cleanest path for Supabase phone OTP login because Supabase owns OTP issuance and session creation.
- Option B: use AWS SNS only for DARCi-owned notifications and step-up codes. This keeps SNS useful without pretending it is a native Supabase Auth provider.
- Option C: use the Supabase Send SMS Hook with AWS SNS or another custom provider. This keeps Supabase Auth as the OTP/session authority, but DARCi owns hook delivery reliability, retry/fallback behavior, security monitoring, and provider operations.
- Option D: build a custom AWS SNS phone-login service. This is not recommended for the first pass because DARCi would own OTP generation, replay protection, abuse controls, and session bridging.

Decision selected on 2026-05-07:

- DARCi is proceeding with Option B.
- Phone login/phone OTP remains out of scope for Phase 3.
- AWS SNS is available only through DARCi's notification outbox for SMS templates and future app-owned step-up challenges.
- Supabase Auth remains the authority for login sessions; SNS messages must not create or imply Supabase sessions.

Recommended decision:

- Use Supabase-supported SMS provider for phone auth if phone login is a product requirement.
- Use the Send SMS Hook only if AWS SNS/regional delivery/provider fallback is more important than native provider simplicity and we are ready to operate the hook.
- Use AWS SNS for DARCi notification SMS or app-owned reauth/step-up only if cost, AWS consolidation, or delivery controls matter more than native Supabase phone auth.

Backend work for native Supabase phone OTP:

- Add `POST /auth/phone/otp/start`.
- Add `POST /auth/phone/otp/verify`.
- Add phone update/verification endpoints for signed-in users.
- Normalize E.164 phone numbers before sending to Supabase.

Backend work for AWS SNS step-up only:

- Add an `auth_reauth_challenges` or `account_security_challenges` table.
- Add an SNS adapter to the notification provider boundary.
- Store only hashed OTP codes, expiry, attempt count, and consumed timestamp.
- Never store raw OTP values.

Notification work:

- Add a real SMS provider adapter in [backend/src/services/notificationOutboxService.ts](../backend/src/services/notificationOutboxService.ts).
- Add provider policy separate from the existing email-only Resend policy.
- Add delivery event normalization for SMS if the provider supports callbacks.

Implementation status on 2026-05-07:

- [backend/src/services/notificationProviderPolicy.ts](../backend/src/services/notificationProviderPolicy.ts) now resolves SMS delivery separately from email delivery. `NOTIFICATION_SMS_PROVIDER=sns` enables SNS when environment and rollout gates allow it; otherwise SMS deliveries remain on the internal provider.
- [backend/src/services/notificationService.ts](../backend/src/services/notificationService.ts) supports SMS recipients with phone numbers and writes SMS delivery addresses separately from email addresses.
- [backend/src/services/notificationOutboxService.ts](../backend/src/services/notificationOutboxService.ts) now includes an AWS SNS adapter that publishes queued SMS deliveries with `Transactional` SMS type by default and records SNS message ids in the delivery ledger.
- [supabase/migrations/20260507120000_add_sns_notification_provider.sql](../supabase/migrations/20260507120000_add_sns_notification_provider.sql) expands notification provider constraints to include `sns` for deliveries and outbound events.
- The staging database has been updated with this migration and Supabase migration history repaired for version `20260507120000`.
- The staging ECS API/worker task role has inline policy `darci-staging-task-sns-sms-publish`, allowing `sns:Publish` in `us-east-1`.
- The staging app secret has inert SNS runtime config: `NOTIFICATION_SMS_PROVIDER=internal`, `NOTIFICATION_PROVIDER_SNS_ENABLED=false`, `SNS_REGION=us-east-1`, `SNS_SMS_TYPE=Transactional`, and blank `SNS_SMS_SENDER_ID`, so staging SMS remains disabled.
- Staging API and worker services run task definition revision `:7`, which injects all SNS-related secret keys into both containers.
- Step-up challenge tables/endpoints remain Phase 6 work. When mounted, they should use hashed challenge codes, expiry, attempt limits, and the existing sensitive-action policy; they should send through the SNS outbox provider rather than creating phone-login sessions.

### Phase 4: Social OAuth

Purpose: reduce onboarding friction without weakening role gates.

Backend/frontend work:

- Enable Google OAuth in Supabase first.
- Adopt Supabase browser auth handling on `/start` and `/auth/callback`.
- Enable the Google button on `/start`.
- Sync OAuth user metadata into `public.users`.
- Define account-linking rules when the same email exists through password auth.

Policy work:

- Social OAuth should create/confirm a member account by default.
- OAuth alone must not grant notary/admin/pro capabilities.
- Pro/notary/admin roles still require explicit role assignment and any required verification.

Future providers:

- Google first.
- Microsoft next if admin/pro users are likely to use work identities.
- Apple only if mobile/native becomes important.

Implementation status on 2026-05-07:

- [apps/web/src/app/start/page.tsx](../apps/web/src/app/start/page.tsx) now presents a single email-or-phone identifier input, detects email versus phone format, starts Supabase email or SMS OTP, verifies the OTP into a Supabase session, and then syncs that session through the DARCi backend.
- The OTP step includes a password fallback. Email challenges prefill the email; phone challenges ask for email and password because Supabase password auth is email-based.
- Google OAuth now calls Supabase browser auth with the DARCi `/auth/callback?intent=oauth` redirect and syncs the resulting session through `/auth/session/sync`.
- [backend/src/controllers/supabaseAuthWebhookController.ts](../backend/src/controllers/supabaseAuthWebhookController.ts) exposes `POST /webhooks/supabase/auth/send-sms` for Supabase Auth Send SMS Hook delivery. The endpoint verifies Standard Webhooks signatures and publishes the OTP via AWS SNS.
- [supabase/migrations/20260507133000_add_phone_auth_user_mirrors.sql](../supabase/migrations/20260507133000_add_phone_auth_user_mirrors.sql) allows phone-only `public.users` mirrors by dropping the email `not null` constraint and adding `phone` plus `phone_confirmed_at` mirrors.

### Phase 5: Admin User Invitations And Role Onboarding

Purpose: let admins invite users into the right role without unsafe manual setup.

Backend work:

- Add `POST /admin/users/invites`.
- Add `GET /admin/users/invites` and revoke/resend endpoints.
- Add `POST /auth/user-invites/{token}/accept` or equivalent callback handling.
- Use Supabase admin invite/generate-link APIs where possible instead of custom credential tokens.
- Create the DARCi profile and role assignment only after the invite is accepted or mark it pending until acceptance.

Schema work:

- Add `user_account_invites` with intended email, intended roles, inviter, status, token hash, expiry, accepted user id, and metadata.
- Keep this separate from document signer invites. The existing document invite model is signer/workflow-specific and should not become a generic account invite catch-all.

Role-specific onboarding:

- Member invite: create or connect account, grant `member`.
- Pro invite: grant `member` plus pending/active `pro`, create `pro_profiles` draft.
- Notary invite: grant `member`, create pending `notary` assignment, require commission verification before activation.
- Admin invite: require existing admin step-up and MFA; grant `admin` only after acceptance and policy checks.

### Phase 6: MFA And Reauthentication

Purpose: protect high-risk roles and actions.

MFA policy:

- Admin: MFA required.
- Notary: MFA required before production notarization/seal actions.
- Pro: MFA recommended or required based on billing/organization access.
- Member: optional at first.

Sensitive actions requiring reauth:

- Admin role grants, suspensions, revocations, and active-role switches.
- Admin user invitations for notary/admin/pro roles.
- Password change, email change, phone change, MFA enrollment/unenrollment.
- Notary commission profile changes.
- Notary seal/signature asset upload, revoke, or activation.
- Notarial finalization/sign/seal actions.
- Payment method or high-value billing changes once mounted.

Backend work:

- Add assurance metadata to request context, either from Supabase session assurance/factors or from DARCi step-up challenge state.
- Add `requireRecentReauth` middleware for sensitive routes.
- Add `POST /auth/reauthenticate` for password or OTP challenge.
- Add MFA enroll/challenge/verify endpoints if using Supabase MFA APIs through the backend.
- Define the reusable sensitive-action contract before Stripe work begins so billing routes can require the same step-up policy instead of inventing payment-specific auth.

Frontend work:

- Add MFA setup and recovery UX.
- Add a reusable step-up modal/page for sensitive actions.
- Preserve pending action intent after successful step-up.

Tests:

- Route guards reject stale sessions for sensitive endpoints.
- Recent step-up allows exactly the intended action window.
- MFA required policies apply by role.

### Phase 7: Auth Hardening And Observability

Purpose: make auth production-operable.

Security controls:

- Add rate limiting for credential and OTP endpoints.
- Add brute-force detection by email/IP/device fingerprint where appropriate.
- Add CAPTCHA escalation after repeated failures.
- Add session/device listing and revoke-other-sessions later if product needs it.
- Revisit token storage strategy and CSP as part of web hardening.

Audit/observability:

- Record auth events into `audit_events` or a dedicated auth event table.
- Track provider delivery lifecycle for confirmation, recovery, magic links, OTP, and invitations.
- Add admin-facing auth/security timeline for user support.
- Alert on suspicious admin/notary auth behavior.
- Add billing-auth correlation fields to auth/security events where relevant, such as attempted checkout while suspended, payment-method change step-up, Pro credit adjustment, or admin billing override.

Test coverage:

- Abuse/rate-limit tests.
- Audit event tests.
- OpenAPI contract tests.
- End-to-end happy paths for signup confirmation, reset, magic link, OAuth, and MFA.

## API Contract Backlog

Completed auth contract updates:

- `POST /auth/signup`: change semantics to confirmation-aware signup.
- `POST /auth/resend-confirmation`.
- `POST /auth/password/recovery`.
- `POST /auth/password/reset`.

Candidate endpoints to add or revise:

- `POST /auth/magic-link`.
- `POST /auth/otp/start`.
- `POST /auth/otp/verify`.
- `POST /auth/phone/otp/start`.
- `POST /auth/phone/otp/verify`.
- `POST /auth/oauth/{provider}/start` or client-side equivalent.
- `GET /auth/callback` or `POST /auth/exchange-code`.
- `POST /auth/mfa/enroll`.
- `POST /auth/mfa/challenge`.
- `POST /auth/mfa/verify`.
- `POST /auth/mfa/unenroll`.
- `POST /auth/reauthenticate`.
- `GET /auth/security-events`.
- Future billing-sensitive auth helper: `POST /auth/step-up` or `POST /auth/reauthenticate` should be reusable by billing routes.
- `POST /admin/users/invites`.
- `GET /admin/users/invites`.
- `POST /admin/users/invites/{id}/resend`.
- `POST /admin/users/invites/{id}/revoke`.
- `POST /auth/user-invites/{token}/accept`.

## Schema Backlog

Completed additive schema work:

- `public.users.email_confirmed_at`.
- `public.users.last_sign_in_at` and `public.users.last_auth_synced_at`.
- `public.users.phone` and `public.users.phone_confirmed_at` for Supabase phone OTP accounts.

Candidate additive schema work:

- `public.users.requires_mfa` or policy-driven equivalent.
- `public.users.last_reauthenticated_at` only if assurance is mirrored outside session state.
- `public.user_account_invites` for account/role invitations.
- `public.auth_security_events` or standardized `audit_events` action names.
- `public.account_security_challenges` only if DARCi owns AWS SNS step-up OTP challenges.
- Notification provider schema support for `sns` only if we choose AWS SNS for app-owned SMS.
- Optional auth/billing correlation columns or metadata conventions for `audit_events`, such as `billing_account_id`, `billing_order_id`, `stripe_customer_id`, and `sensitive_action`.

Do not add custom tables for Supabase-owned recovery/confirmation/magic-link secrets unless forced by a specific unsupported flow.

Do not add auth-owned tables for Stripe customer, subscription, entitlement, or credit state. Those belong to billing and entitlement services, with auth enforcing identity, role, status, and step-up requirements.

## Implementation Order Recommendation

1. Phase 0: clean spec, enforce account status, add stricter auth tests. Completed.
2. Phase 1: email confirmation and password recovery/reset. Completed.
3. Phase 2: magic links and email OTP, especially for invited signers. Completed.
4. Phase 3: choose Option B for SMS; wire AWS SNS only for DARCi-owned SMS notifications and future step-up challenges. Completed.
5. Phase 4: Google OAuth.
6. Phase 5: admin user invitations and role onboarding.
7. Phase 6: MFA and reauth for admin/notary sensitive actions.
8. Phase 7: rate limiting, auth observability, session storage hardening.

This order fixes the most basic account trust gaps first, then improves signer/member conversion, then tightens high-privilege workflows.

## Immediate Next Tasks

- Apply migration `20260507133000` to staging and repair Supabase migration history after direct apply.
- In AWS Secrets Manager `/darci/staging/app`, add `SUPABASE_AUTH_SMS_HOOK_SECRET`, set `SUPABASE_AUTH_SMS_HOOK_ENABLED=true` only after the Supabase hook is configured, and keep `SNS_REGION=us-east-1`, `SNS_SMS_TYPE=Transactional`, and optional `SNS_SMS_SENDER_ID` aligned with the task definition secrets.
- In Supabase Auth dashboard, enable Phone, configure the Send SMS Hook URL `https://api.staging.darciregistry.com/webhooks/supabase/auth/send-sms`, copy the generated hook secret into AWS, enable Google, and allow `https://app.staging.darciregistry.com/auth/callback` plus local callback URLs for development.
