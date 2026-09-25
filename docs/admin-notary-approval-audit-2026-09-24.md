# Admin notary approval and related security UX audit

24 September 2026. Diagnostic pass only: no application code, database, MFA policy, account permissions or deployment changed. Findings are based on the current checkout and mocked local regression tests, not a captured production request or a live approval attempt.

## Reported message and immediate recovery

“Verify your authenticator code in Admin security before changing administrative settings” is emitted by `backend/src/middleware/adminStepUp.ts`. The `/admin` router requires an active admin context and recent signed TOTP verification (AAL2, at most 15 minutes old) for mutations; reading and notification-template preview are exempt. An SMS/email login code or refreshed JWT does not satisfy this requirement.

Both `/admin/notary-applications/:id/approve` and `/reject` use this guard. Approving an application grants the notary role, so removing the security check would weaken a privileged operation. The guard returns before the application handler: an attempt rejected by this exact guard has not approved the application.

On `/admin/notary-requests`, close the application dialog, use **Admin security → Set up / verify authenticator** above the requests, complete authenticator enrollment if necessary, verify its current six-digit code, then reopen the application and explicitly retry the decision. Never share the setup secret or OTP in chat. Verification is not automatic approval.

Normal notary acceptance of a member's document uses `/notary/requests/:id/review-decision`, not this admin guard. Meeting, identity, venue, signing and submission routes are also outside `/admin`. If the reported message appeared in that normal notary workspace rather than the admin application-review page, the exact route/request needs further investigation.

## Findings

### P1 — Admin capability checks are inconsistent

Notary application list/approve/reject handlers check the admin role but do not enforce the existing `canReviewNotaries` capability. Separately, legacy role-management handlers can grant roles without the `canManageAdmins` check used by the newer admin-team endpoint. MFA verifies the actor; it does not replace authorization. This is a code-level access-control gap, not evidence of observed misuse. Apply consistent capabilities across equivalent routes and add negative tests for restricted admins before expanding privileged access.

Evidence: `backend/src/routes/admin.ts`, `backend/src/controllers/notaryProfileController.ts`, `backend/src/controllers/adminController.ts`, contrasted with `backend/src/controllers/adminProfileController.ts` and `backend/src/services/adminProfileService.ts`.

### P1 — Approval can become partially complete

`approveNotaryApplication` marks the application approved, then separately grants the notary role and creates/updates the profile. A later failure can leave an approved application without a complete notary setup. The UI offers decisions only for pending applications, making recovery difficult. Notification enqueue also occurs after the business changes and can turn a successful decision into an error response. Approval/rejection writes do not condition on pending status, so competing decisions need explicit protection.

Recommended: an atomic, concurrency-safe decision with idempotent retry behavior and independently recoverable notification delivery. Do not automatically retry a privileged mutation merely because MFA succeeds.

Evidence: `backend/src/services/notaryProfileService.ts:508`, `backend/src/controllers/notaryProfileController.ts:313`.

### P2 — Verification is disconnected from the action

- The request detail modal covers the page's Admin security panel; the error offers no verification action inside the dialog.
- The older `/app/settings` application-review flow calls the same protected endpoint but includes no Admin security panel.
- Admin mutations elsewhere display the same generic rejection rather than a shared, actionable verification flow. This includes team/role changes, user status, notification retries, templates/binding rules, and billing recovery.

Recommended: shared step-up UI that preserves notes and context, requests the authenticator code when necessary, and requires explicit confirmation afterward. Include the older Settings path or retire that duplicate review entry point.

### P2 — Enrollment and expiry have recovery gaps

`AdminSecurity.tsx` retains enrollment only in component state. Navigating away/reloading loses an unverified enrollment; starting again enrolls a new factor instead of recovering the unfinished setup. With multiple verified factors, it automatically chooses the first one. Setup exposes only a manual key, with no QR option. The successful-verification message does not expire or display remaining validity, so a subsequent action can fail after 15 minutes despite unchanged success text.

Recommended: recover interrupted enrollment without removing verified factors, offer factor selection where appropriate, provide clearer setup instructions, and derive expiry status from the current session. Test route changes and invalid/expired codes.

### P2 — Billing operations labels misidentify production

The shared billing admin page hardcodes “Stripe test mode”, “Staging remains…” and a staging-oriented default support reason. That can mislead a production operator about the environment affected by a recovery action. Display the backend-reported environment and explicit consequences instead.

Evidence: `apps/web/src/app/app/admin/billing/page.tsx:175` and `:236`.

## Validation and limits

- Focused serial run on Node 24 (matching CI/runtime): **78/78 tests passed across six suites** covering admin MFA, admin-team permissions, billing support, normal notary review decisions and meeting/completion flows.
- The initial Node 20 attempt could not initialize the current Supabase SDK; a sandboxed Node 24 attempt could not bind test sockets. The first unsandboxed parallel run had one socket-hang-up failure; all 78 passed on serial rerun. No dependency or test assertions were changed.
- Existing tests establish that the guard works and ordinary notary routes are not blocked by it. They do not provide browser end-to-end coverage for enrollment, modal recovery, expired verification or legacy Settings approvals. Those need regressions alongside remediation.
- No client application was approved/rejected during this audit, and no MFA factors were created or removed.

## Recommended next implementation pass

Keep MFA enforced. Repair capability checks and approval consistency, provide one shared contextual admin-verification flow, correct production billing labels, and add end-to-end recovery/expiry/duplicate-action tests. Validate locally before a separately authorized deployment; migration-backed atomicity should be rehearsed before application to production.
