# First-Class Error Reporting Runbook

Last updated: 2026-06-09

## Goal

Turn each production error event into a short, repeatable incident path: identify the failing operation, use the correlation IDs to find backend/web evidence, assign the right owner, apply a mitigation, and record the stable error code outcome.

Primary artifacts:

1. `docs/first-class-error-reporting-catalog.json`
2. `scripts/validate-error-catalog.mjs`
3. Sentry tags: `service`, `runtime`, `operation`, `error_code`, `error_family`, `request_id`, `document_id`, `generation_run_id`

## First Response

1. Open the Sentry event and copy `error_code`, `error_family`, `operation`, `request_id`, `release`, and environment.
2. Look up the code in `docs/first-class-error-reporting-catalog.json` and assign the listed owner.
3. Follow the code-level `checks` first, then the family section below.
4. Use `request_id` to correlate web, API, worker, audit, and document trace events.
5. Preserve sample identifiers before mitigation: document id, generation run id, template artifact id, renderer job id, notary request id, and storage path when present.

## Alert Rules

Configure these as Sentry issue or metric alerts. The catalog stores the exact query and threshold payloads.

| Rule | Severity | Owner | Trigger |
| --- | --- | --- | --- |
| `p0-critical-document-flow` | P0 | Backend platform + document generation | One production event for a code that blocks generation/signing finalization. |
| `p1-storage-dependency` | P1 | Storage platform | Two storage-family events in 10 minutes. |
| `p1-generation-template` | P1 | Document generation | Two generation/template-source events in 10 minutes. |
| `p1-signing-notarization` | P1 | Notary operations | Two signing/notarization events in 10 minutes. |
| `p1-web-critical-flow` | P1 | Web app | Three web critical-flow events in 15 minutes. |
| `p1-unclassified-error` | P1 | Backend platform | One unclassified or missing-code production error in 15 minutes. |
| `p1-release-regression` | P1 | Backend platform | Current release has at least five errors and is 50% above the previous 24-hour baseline. |
| `p3-observability-smoke` | P3 | Backend platform | Synthetic deploy smoke event is received with the expected telemetry shape. |

## P0 Critical Document Flow

Use this path when `p0-critical-document-flow` fires.

1. Confirm whether new documents are still able to generate and sign in the affected environment.
2. If the code is template-source or artifact related, pause the affected jurisdiction/output or roll back the template registry/artifact pointer.
3. If the code is storage upload related, verify Supabase storage write health before requeueing generation runs.
4. If the code is signing placement/PDF related, stop further template rollout and regenerate placement metadata for affected runs.
5. Requeue only after the root dependency is healthy; otherwise retries will amplify noise and user-visible failures.

## Generation And Template Family

High-value Sentry fields: `document_id`, `generation_run_id`, `renderer_job_id`, `outputKey`, `templateKey`, `templateArtifactId`, `request_id`.

Checks:

1. Query the generation run and confirm `template_artifact_id`, `template_key`, `output_key`, `status`, and `failure_details_json`.
2. Confirm active `template_registry` points to a deployed artifact and the source file exists in the release.
3. Check recent migrations or admin changes that touched registry/artifact rows.
4. Confirm storage upload succeeded for any regenerated PDFs.

Mitigations:

1. Roll back to the last known artifact pointer when a template source or artifact is missing.
2. Requeue failed runs only after template/artifact/storage checks pass.
3. If one jurisdiction/output is affected, disable only that launch path while keeping unrelated flows live.

## Storage Family

High-value Sentry fields: `bucket`, `storagePath`, `contentType`, `expiresInSeconds`, `request_id`.

Checks:

1. Confirm Supabase project health and whether failures are reads, writes, signed URLs, or metadata listings.
2. Verify bucket names match runtime env: documents, signatures, notarized copies.
3. Check service role credentials and bucket policies before changing application code.
4. For missing objects, decide whether the object should be restored, regenerated, or the DB row corrected.

Mitigations:

1. Restore bucket policy/credentials, then retry the exact failed operation.
2. Regenerate generated PDFs or signature assets only when the source data is still valid.
3. Pause upload/signature/generation flows if storage is unavailable beyond one retry window.

## Signing And Notarization Family

High-value Sentry fields: `document_id`, `generation_run_id`, `outputSignerId`, `notary_request_id`, `notary_action`, `request_id`.

Checks:

1. Confirm the official PDF exists and is a PDF for the generation run.
2. Confirm signer rows and signature placement metadata exist for the output signer.
3. For notary handoff, validate selected notary eligibility: active role, matching jurisdiction, non-owner, commission-valid.
4. For meeting/finalization actions, compare the requested action with the current workflow/request/meeting status.

Mitigations:

1. Regenerate signing outputs when placement metadata or official PDFs are missing.
2. Repair stale signer/notary state before asking users to retry.
3. Use alternate capture modes when only one signature capture method is degraded.
4. Avoid reversing completed notary decisions unless audit evidence proves the transition did not commit.

## Web Family

High-value Sentry fields: `service:web`, `runtime`, `operation`, `request_id`, `document_id`, `notary_request_id`, route breadcrumbs.

Checks:

1. Use `request_id` to inspect the corresponding backend response before assuming the bug is client-only.
2. Check whether failures cluster by route, browser, release, or one backend status code.
3. For global error-boundary events, inspect `digest`, preceding breadcrumbs, and the current release.

Mitigations:

1. Roll back the web release if route crashes cluster by release and block critical flows.
2. Patch payload handling if the backend response is valid but the UI crashes or misclassifies it.
3. Add a more specific `captureDomainException` code after root cause is known.

## Unclassified Errors

Treat `UNCLASSIFIED_ERROR` and missing `error_code` as P1 until classified.

1. Identify the throwing or capture site.
2. Assign the closest `error_family` and stable code.
3. Add catalog coverage with owner, checks, mitigations, and alert rule ids.
4. Run `node scripts/validate-error-catalog.mjs` before closing.

## Release Health Guardrails

Use these during staging promotion and the first 30 minutes after production deploy.

1. Pause rollout on the first P0 event in the current release.
2. Open P1 incident review when the current release has at least five events and is 50% above the previous 24-hour baseline for the same `error_code`/`error_family`.
3. Do not promote if more than 2% of critical-flow events are missing expected correlation fields.
4. Treat new `UNCLASSIFIED_ERROR` events as release blockers until the code is classified or proven unrelated.

Suggested Sentry release-health query:

```text
environment:production event.type:error release:$current_release has:error_code
```

Suggested baseline comparison query:

```text
environment:production event.type:error error_code:$error_code !release:$current_release
```

## Synthetic Smoke Events

Use the smoke script after deploy to verify the first-class telemetry shape without triggering P0/P1 workflow alerts.

Dry run locally or in staging shell:

```sh
cd backend
npm run observability:smoke
```

Emit after deploy when `SENTRY_DSN` is present:

```sh
cd backend
npm run observability:smoke -- --emit
```

Expected Sentry tags:

1. `service=backend`
2. `operation=observability.smoke`
3. `error_code=OBSERVABILITY_SMOKE_EVENT`
4. `error_family=internal`
5. `request_id=smoke-<uuid>` or the supplied `OBSERVABILITY_SMOKE_REQUEST_ID`
6. `synthetic=true`
7. `smoke_test=observability`

Expected fingerprint:

```text
backend / internal / OBSERVABILITY_SMOKE_EVENT / observability.smoke
```

## Catalog Maintenance

Run this after adding or changing any `DomainError` or web `captureDomainException` code:

```sh
node scripts/validate-error-catalog.mjs
```

The validator fails when a code is missing from the catalog, has a family mismatch, lacks an owner, lacks checks/mitigations, references an unknown alert rule, emits `UNCLASSIFIED_ERROR` directly, or uses unclassified capture helpers in critical review/sign/notary/generation files.

Focused quality-gate tests:

```sh
cd backend
npm run observability:test
```

KPI readiness evaluation:

```sh
cd backend
npm run observability:kpis
```

The KPI evaluator validates local/static proxies for the suggested KPIs and explicitly calls out which final percentages still require production Sentry, log, or incident exports. Use it as a deploy gate, not as a substitute for live KPI reporting.

```sh
cd apps/web
npm run observability:test
```