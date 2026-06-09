# First-Class Error Reporting Roadmap

## Audit Summary

### Current strengths
- Backend has centralized Sentry wrappers in `backend/src/utils/sentry.ts`.
- Backend telemetry bootstrap is centralized in `backend/src/telemetry/index.ts` and loaded from `backend/src/instrument.ts`.
- Express error handler is present in `backend/src/index.ts`.
- BullMQ worker failure capture includes job context in `backend/src/worker/index.ts`.
- Document flow emits domain traces with `logDocumentTrace`.
- Web has server/edge Sentry init and global error capture (`apps/web/sentry.server.config.ts`, `apps/web/sentry.edge.config.ts`, `apps/web/src/app/global-error.tsx`).

### Core gaps blocking immediate exact-cause diagnosis
- Error schema is not uniform across API, worker, and web.
- Correlation identifiers are partial and not globally attached to Sentry scope.
- Domain errors are mostly untyped (`Error`) rather than taxonomy-driven.
- Fingerprints are not consistently stable by error family/code.
- OTLP export noise can drown actionable signal.
- Alerts/runbooks/ownership are not codified by error code family.

## First-Class Definition
For each production failure, an on-call engineer should have in under 60 seconds:
- Failing operation/stage.
- Stable error code and family.
- Correlation chain (`requestId`, `documentId`, `generationRunId`, `rendererJobId`, user role/id).
- Stable fingerprint grouped by root cause.
- High-value breadcrumbs and runbook owner.

## Phased Implementation Plan

### Phase 0: Signal Hygiene (1-2 days)
- Validate telemetry startup inputs (`SENTRY_DSN`, release, sampling, OTLP endpoint).
- Normalize OTLP endpoint shape and fail soft when invalid.
- Emit startup marker event with release/environment/service context.

Status: Started and implemented in this pass.

### Phase 1: Unified Error Contract (3-4 days)
- Introduce typed domain error taxonomy (family + code + details).
- Replace critical `throw new Error` paths in generation/signing/storage with `DomainError`.
- Standardize Sentry capture payload for domain errors:
- Required tags: `service`, `operation`, `error_code`, `error_family`.
- Required context object: `error` with code/family/name/details.
- Stable default fingerprint based on service/family/code/operation.

Status: Started and implemented for generation/signing/storage in this pass.

### Phase 2: End-to-End Correlation (3-5 days)
- Add global request correlation middleware for all API routes.
- Propagate correlation IDs into queued jobs and worker execution.
- Attach correlation IDs to every domain capture and trace event.

Status: Complete.

Verification completed:
- Confirmed API response correlation header behavior via integration tests (`X-Request-Id` generated and caller-provided value echoed).
- Confirmed request ID is propagated into audit envelopes in key documents/notary controller flows via mocked `recordAuditEvent` assertions.
- Confirmed compile and targeted integration suite pass for Phase 2 additions.

### Phase 3: Causal Breadcrumb Timeline (4-6 days)
- Mirror critical domain transition events as Sentry breadcrumbs.
- Preserve rich context while applying PII-safe scrubbing.

Status: Complete.

Implementation completed:
- Upgraded the central document trace utility so every `logDocumentTrace` event also emits a structured Sentry breadcrumb.
- Added breadcrumb level classification (`error`, `warning`, `info`) based on trace stage semantics.
- Added PII-safe breadcrumb metadata scrubbing that preserves causal identifiers (`requestId`, `documentId`, `generationRunId`, output/template keys) while redacting sensitive fields and summarizing sensitive containers.
- Current breadcrumb coverage includes intake submission, review approval/deferred generation, signing prep/repair, generation run creation/blocking, render start/completion/failure, and document download-url failures.

Verification completed:
- Added focused unit coverage for trace metadata scrubbing and breadcrumb severity classification.
- Confirmed backend compile passes after breadcrumb integration.

### Phase 4: Web Parity (2-3 days)
- Align browser/server/edge error contract with backend taxonomy.
- Add feature-action breadcrumbs for high-friction flows (review/sign/notarization).

Status: Complete.

Implementation completed:
- Upgraded the shared web telemetry wrapper to support backend-compatible `error_code`, `error_family`, `operation`, and `request_id` tags with stable fingerprints.
- Added PII-safe client telemetry metadata scrubbing and a reusable feature-action breadcrumb helper.
- Aligned browser, server, and edge Sentry initialization with bounded sample parsing and consistent `service:web`, runtime, and `app_env` tags.
- Routed the global app error boundary through the domain telemetry contract.
- Added feature-action breadcrumbs and domain-coded captures to document review, signing, signature capture, submit-to-notary, and notary workspace actions.
- Captured backend `X-Request-Id` response headers on high-friction web failures so client events correlate with API logs and backend Sentry events.

Verification completed:
- Confirmed edited web files report no VS Code diagnostics.
- Confirmed targeted web test passes: `npm test -- --run src/lib/auth.test.ts`.
- Confirmed full production web build passes: `npm run build` in `apps/web`.

### Phase 5: Alerts, Ownership, and Runbooks (2-4 days)
- Alert rules by family/impact (P0/P1).
- Runbook mapping: `error_code -> owner -> checks -> mitigations`.
- Release health guardrails based on baseline error deltas.

Status: Complete.

Implementation completed:
- Added a machine-readable observability catalog at `docs/first-class-error-reporting-catalog.json` with owners, P0/P1 alert rules, release health guardrails, and per-code runbook metadata.
- Added `docs/first-class-error-reporting-runbook.md` with first-response steps, family-specific checks, mitigation paths, unclassified-error policy, and release guardrails.
- Added `scripts/validate-error-catalog.mjs` to scan backend `DomainError` emissions, storage helper emissions, and web `errorCode` captures for catalog coverage.
- Added `npm run observability:validate` in `backend/package.json` so the coverage check is easy to run before deploys or code-review closeout.

Verification completed:
- Confirmed direct catalog validation passes: `node scripts/validate-error-catalog.mjs`.
- Confirmed package script validation passes: `npm run observability:validate` in `backend`.
- Confirmed edited Phase 5 docs/script/package files report no VS Code diagnostics.

### Phase 6: Quality Gates (ongoing)
- Add tests for critical failures asserting code/family/fingerprint context.
- CI lint/checks for unclassified errors in critical modules.
- Synthetic smoke events to validate telemetry shape after deploy.

Status: Complete.

Implementation completed:
- Added backend telemetry context tests that assert stable `error_code`, `error_family`, `operation`, context, and fingerprint shape for domain and unclassified fallback errors.
- Added web telemetry context tests that assert backend-compatible browser error tags, request correlation, stable fingerprints, and PII-safe breadcrumb metadata scrubbing.
- Exported pure backend/web telemetry context builders so quality-gate tests can verify event shape without emitting Sentry events.
- Extended `scripts/validate-error-catalog.mjs` to scan backend scripts, enforce the synthetic smoke event catalog entry, and reject unclassified capture helpers in critical review/sign/notary/generation modules.
- Added a dry-run/emit synthetic smoke script at `backend/scripts/smoke-observability-telemetry.ts` for post-deploy Sentry shape verification.
- Added package commands for focused observability validation and smoke checks.
- Wired backend and web observability quality gates into `.github/workflows/ci.yml`.

Verification completed:
- Confirmed catalog and critical-module quality gate passes: `node scripts/validate-error-catalog.mjs`.
- Confirmed backend telemetry quality tests pass: `npm run observability:test` in `backend`.
- Confirmed web telemetry quality tests pass: `npm run observability:test` in `apps/web`.
- Confirmed synthetic smoke dry run prints expected tags/context/fingerprint: `npm run observability:smoke` in `backend`.
- Confirmed backend TypeScript build passes: `npm run build` in `backend`.
- Confirmed web production build passes: `npm run build` in `apps/web`.
- Confirmed CI workflow diagnostics pass for the new observability gate steps.

## Suggested KPIs
- Mean time to identify root cause: under 5 minutes.
- Events missing correlation IDs: under 2%.
- Ungrouped/unstable fingerprint rate: under 5%.
- P0 alerts without runbook mapping: 0.
- Telemetry noise ratio (non-actionable): under 10%.

## KPI Readiness Checks
- Local/static KPI readiness is measured by `npm run observability:kpis` in `backend`.
- The evaluator currently passes all local proxies:
- `38/38` catalog entries have owner, alert, runbook, checks, and mitigation metadata.
- `0/16` critical capture sites lack `requestId`/`request_id` correlation.
- `0/37` emitted codes lack catalog coverage or directly emit `UNCLASSIFIED_ERROR`.
- `0` P0 catalog entries and `0` P0 alert rules are missing runbook metadata.
- `1/38` catalog entries are synthetic/noise-class severity (`2.63%`).
- Runtime KPI attainment still requires production Sentry/log/incident exports for actual MTTR, missing-correlation event rate, grouping rate, and noise ratio.

## Changes Started Immediately (This Pass)
- Phase 0:
- Hardened telemetry bootstrap validation and OTLP endpoint normalization.
- Added startup telemetry marker emission with release/environment tags.
- Added safe sampling parse with bounds.
- Phase 1:
- Added shared `DomainError` taxonomy module.
- Added standardized domain capture helper for Sentry scope consistency.
- Converted critical storage and generation/signing throw sites to typed domain errors.
- Updated generation-run failure persistence to include typed `errorCode`/`errorFamily` details.
