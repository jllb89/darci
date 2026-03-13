# DARCI Progress: Completed Issues + Tests

This document lists completed issues with a short goal, the result, and how to run the related tests.
Each test run logs request/response details so the client can see what is being exercised.

## W2-01 Database schema review and constraints
Goal: Tighten schema constraints, indexes, cascade rules, and storage setup.
Result: Core tables, constraints, indexes, and cascade rules applied via migrations.
Tests:
- No automated tests yet

## W2-02 RLS policies and access rules
Goal: Enforce member/notary/service role access in Postgres and storage.
Result: RLS policies defined for core tables and storage access paths.
Tests:
- No automated tests yet

## W2-03 OpenAPI v1 schema completion
Goal: Document request/response schemas and auth requirements.
Result: OpenAPI updated with schemas and standardized error shapes.
Tests:
- No automated tests yet

## W2-04 Auth middleware and role guards
Goal: Validate Supabase JWTs and enforce role-based access.
Result: Auth middleware rejects missing tokens, and role guards enforce notary/admin access.
Tests:
- Integration: auth middleware
  - From backend: `OTEL_SDK_DISABLED=1 NODE_OPTIONS="" npx vitest run tests/integration/auth.test.ts`

## W2-05 CI/CD and monitoring baseline
Goal: Stabilize CI, environments, and telemetry baseline.
Result: CI pipeline and Sentry/OTEL baseline configured for backend workflows.
Tests:
- No automated tests yet

## W3-01 Document upload + IDN assignment
Goal: Support signed upload flow, finalize upload, assign IDN, and expose real GET endpoints.
Result: Upload/finalize works with server validation, IDN assignment, audits, and GET endpoints return real data.
Tests:
- Smoke: upload flow
  - From backend: `set -a && source ../.env.staging && set +a && OTEL_SDK_DISABLED=1 NODE_OPTIONS="" node -r ts-node/register scripts/smoke-document-upload.ts`
- Integration: documents GET endpoints
  - From backend: `OTEL_SDK_DISABLED=1 NODE_OPTIONS="" npx vitest run tests/integration/documents-get.test.ts`

## W3-02 Member signature capture
Goal: Allow members to upload and finalize a signature asset tied to a document.
Result: Signature request/finalize endpoints validate size/type, store signature, and emit audits.
Tests:
- Smoke: signature upload flow
  - From backend: `set -a && source ../.env.staging && set +a && OTEL_SDK_DISABLED=1 NODE_OPTIONS="" node -r ts-node/register scripts/smoke-signature-upload.ts`
- Integration: signature flow
  - From backend: `OTEL_SDK_DISABLED=1 NODE_OPTIONS="" npx vitest run tests/integration/signatures.test.ts`

  What the tests verify

requests a signature upload: Validates a member can request a signed upload URL for a signature file when the document is in pending_signature, and a signature record is created.
rejects invalid signature mime type: Ensures only allowed image types are accepted for signature uploads.
rejects oversized signature: Enforces the size limit for signature uploads.
finalizes signature upload: Confirms the uploaded signature file exists and passes validation, then marks it captured.
rejects missing signature upload: Fails if the storage object metadata can’t be found (file not uploaded).
rejects invalid signature mime type on finalize: Fails if the uploaded object’s MIME type isn’t allowed.
rejects oversized signature on finalize: Fails if the uploaded object exceeds the size limit.

## W3-03 Notarization submission + code issuance
Goal: Create notarization request, issue illuminotarization code, and update document status.
Result: Submit notarization creates request, issues code with TTL, updates status, and records audits.
Tests:
- Integration: submit notarization flow
  - From backend: `OTEL_SDK_DISABLED=1 NODE_OPTIONS="" npx vitest run tests/integration/notarization-submit.test.ts`

  What each test verifies

creates request and code: Validates the happy path where a member submits a signed document; the system creates a notarization request, issues a code, updates the document status to pending_notary, and returns the response payload.
returns 404 when document is missing: Ensures a submit call fails if the document doesn’t exist or is not accessible.
uses TTL minutes for code expiry: Confirms the code expiry respects NOTARIZATION_CODE_TTL_MINUTES and writes the correct expiresAt.
retries on code collision: Simulates a duplicate code collision and verifies the system retries and succeeds.
rejects wrong status: Ensures a document not in pending_signature can’t be submitted for notarization.
rejects existing request: Prevents duplicate active notarization requests for the same document.

## W3-04 Member dashboard endpoints
Goal: Provide dashboard data with documents, activity summary, and status counts.
Result: `/dashboard/member` returns documents, activity (filtered by actor + doc ids), and counts; supports admin `memberId`.
Tests:
- Integration: member dashboard
  - From backend: `OTEL_SDK_DISABLED=1 NODE_OPTIONS="" npx vitest run tests/integration/dashboard-member.test.ts`

## W4-01 Code resolve and request access
Goal: Allow notary to resolve code, consume it, and assign request for review.
Result: `/notary/code/resolve` validates code, marks it consumed, assigns notary, updates request status, and audits.
Tests:
- Integration: code resolve flow
  - From backend: `OTEL_SDK_DISABLED=1 NODE_OPTIONS="" npx vitest run tests/integration/notary-code-resolve.test.ts`
