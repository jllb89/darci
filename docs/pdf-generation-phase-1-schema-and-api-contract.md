# PDF Generation Phase 1 Schema And API Contract

Last updated: 2026-04-15

Related:
- docs/pdf-generation-prerequisites-roadmap.md
- docs/pdf-generation-next-roadmap.md
- docs/product-selection-to-generation-workflow-guide.md
- docs/member-form-persistence-and-generation-roadmap.md
- docs/audit-events.md
- docs/admin-launch-controls-api-roadmap.md

## Status Note

Most of this Phase 1 contract is now implemented.

Use `docs/pdf-generation-next-roadmap.md` for the active planning view of what is already done and what is still missing.

Use `docs/product-selection-to-generation-workflow-guide.md` for the plain-English end-to-end guide of how the current system works in code.

This document remains useful as the original design contract for the Phase 1 schema and API decisions.

## Scope

This document defines the concrete schema and API contract for Phase 1 from the PDF generation prerequisites roadmap.

Phase 1 includes:

1. generation run lifecycle and renderer linkage,
2. template artifact locator metadata,
3. render context persistence,
4. renderability gating beyond template coverage.

Phase 1 does not include:

1. output-scoped signer obligations,
2. notarial appearance participant persistence,
3. signer-aware signature APIs,
4. notification workflows.

## Adopted Decisions

1. `document_parties` remains the document-wide contact roster. Phase 1 does not change that model.
2. Generation lifecycle belongs on `document_generation_runs`, not on `documents.status`.
3. `canceled` is a first-class generation-run lifecycle state.
4. `blocked` means render prerequisites are not satisfied yet. `failed` means rendering was attempted and did not complete successfully.
5. `template_registry` continues to pin jurisdiction/output selection, while a separate template artifact record identifies the concrete renderable file and renderer.

## Why Lifecycle Stays On Generation Runs

One document can produce multiple outputs, and those outputs can be in different states at the same time.

Example:

1. `trust_rrr` may be renderable now,
2. `trust_certificate` may be blocked on `Trust.RegDate`,
3. a later rerender may cancel one run while another already rendered.

Because of that, `documents.status` should not be overloaded with generation lifecycle states like `blocked`, `rendering`, `rendered`, `failed`, or `canceled`.

If the product later needs a document-level summary, it should be derived from current generation runs, not stored as the primary truth.

## Lifecycle Status Contract

## Status enum

- `queued`
- `blocked`
- `rendering`
- `rendered`
- `failed`
- `canceled`

## Status semantics

1. `queued`
   - A run is fully eligible for rendering and can be claimed by a worker.

2. `blocked`
   - A run passed basic creation, but one or more runtime prerequisites are missing.
   - Examples: missing system value, missing notary value, missing signing-stage value, missing template artifact.

3. `rendering`
   - A worker has claimed the run and is actively rendering it.

4. `rendered`
   - Rendering succeeded and a `document_version` is linked to the run.

5. `failed`
   - Rendering was attempted and ended in an error state.

6. `canceled`
   - Rendering should no longer proceed for this run.
   - Used when a member/admin/service role explicitly cancels a run, or when the system supersedes the run before completion.

## Allowed transitions

1. `queued -> rendering`
2. `queued -> blocked`
3. `queued -> canceled`
4. `blocked -> queued`
5. `blocked -> canceled`
6. `rendering -> rendered`
7. `rendering -> failed`
8. `rendering -> canceled`

## Forbidden transitions

1. `rendered -> *`
2. `failed -> rendering`
3. `canceled -> rendering`

Notes:

1. Phase 1 does not define an in-place retry transition. Retrying can be done by creating a new run or by a later dedicated retry contract.
2. `rendering -> canceled` is best-effort and requires cooperative worker cancellation.

## Data Model

## 1) New table: `template_artifacts`

Purpose:

- identify the concrete renderable template artifact for a pinned `template_key + template_version + template_hash`.

Suggested schema:

- `id uuid primary key default gen_random_uuid()`
- `template_key text not null`
- `template_version text not null`
- `template_hash text not null`
- `artifact_storage_path text not null`
- `artifact_mime_type text not null`
- `render_engine text not null`
- `artifact_metadata jsonb not null default '{}'::jsonb`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- unique (`template_key`, `template_version`, `template_hash`)

Suggested validations:

1. `artifact_storage_path` must be non-empty.
2. `render_engine` must be one of `pdf_form`, `docx_template`, `html_pdf`, `other`.
3. `artifact_mime_type` must be non-empty.

Why a separate table:

1. the same artifact can be pinned by multiple `template_registry` rows,
2. artifact storage metadata is not jurisdiction-specific,
3. it keeps `template_registry` focused on rollout/pinning rather than storage concerns.

## 2) Extend `document_generation_runs`

Current columns are not enough to support a real render lifecycle.

Add:

- `template_artifact_id uuid references template_artifacts(id) on delete set null`
- `render_context_json jsonb not null default '{}'::jsonb`
- `blocking_requirements_json jsonb not null default '[]'::jsonb`
- `resolved_sources_json jsonb not null default '{}'::jsonb`
- `renderer_job_id text`
- `document_version_id uuid references document_versions(id) on delete set null`
- `blocked_at timestamptz`
- `started_at timestamptz`
- `rendered_at timestamptz`
- `failed_at timestamptz`
- `canceled_at timestamptz`
- `failure_code text`
- `failure_details_json jsonb not null default '{}'::jsonb`
- `cancellation_reason text`

Change existing status check to:

- `status in ('queued', 'blocked', 'rendering', 'rendered', 'failed', 'canceled')`

## Why both `document_versions.generation_run_id` and `document_generation_runs.document_version_id`

Keep both:

1. `document_versions.generation_run_id` preserves artifact-to-run traceability from the document version side.
2. `document_generation_runs.document_version_id` makes the latest rendered artifact for a run directly queryable without a reverse lookup.

## 3) Structured blocker shape

`blocking_requirements_json` should contain an array of records like:

```json
[
  {
    "code": "missing_system_value",
    "source": "system",
    "field": "Trust.RegDate",
    "message": "Trust registration date is not available yet.",
    "blocking": true
  }
]
```

Initial blocker codes:

1. `missing_template_artifact`
2. `missing_system_value`
3. `missing_notary_value`
4. `missing_signing_value`
5. `missing_render_context_value`
6. `unresolved_placeholder_mapping`

## 4) Render context shape

`render_context_json` should contain the fully resolved values consumed by a renderer, not raw canonical answers.

Suggested shape:

```json
{
  "documentId": "4b5ef6d1-9a53-4d55-bd2a-67b9b8b92cf7",
  "generationRunId": "d1f1b37c-5f5d-4ce6-9542-4b83646706f3",
  "documentKey": "trust_certificate",
  "template": {
    "templateKey": "ca_trust_certificate",
    "templateVersion": "2026.04.14.v1",
    "templateHash": "sha256:ca-trustcert-v1",
    "renderEngine": "docx_template"
  },
  "placeholders": {
    "Trust.Name": "The Smith Family Trust",
    "Trust.No": "DARCI-000123",
    "Trust.RegDate": "2026-04-14"
  },
  "repeatingSections": {},
  "sourceSummary": {
    "memberForm": 12,
    "system": 2,
    "notary": 0,
    "signing": 0
  }
}
```

## Public API Contract

## 1) Update `POST /documents/{id}/generation-runs`

Current behavior creates `queued` or `failed` runs.

Phase 1 behavior should create:

1. `queued` when template artifact and render blockers are clear,
2. `blocked` when coverage is present but runtime blockers exist,
3. `409` only for true state conflicts such as non-submitted intake or locked-invalid workflow state.

Important rule:

- pre-render readiness issues should no longer create `failed` runs.

Updated response shape per run:

```json
{
  "runs": [
    {
      "id": "d1f1b37c-5f5d-4ce6-9542-4b83646706f3",
      "documentId": "4b5ef6d1-9a53-4d55-bd2a-67b9b8b92cf7",
      "intakeRevision": 3,
      "outputKey": "trust_certificate",
      "documentKey": "trust_certificate",
      "templateKey": "ca_trust_certificate",
      "templateVersion": "2026.04.14.v1",
      "templateHash": "sha256:ca-trustcert-v1",
      "status": "blocked",
      "documentVersionId": null,
      "blockingRequirements": [
        {
          "code": "missing_system_value",
          "source": "system",
          "field": "Trust.RegDate",
          "message": "Trust registration date is not available yet.",
          "blocking": true
        }
      ],
      "createdAt": "2026-04-14T23:40:00.000Z"
    }
  ]
}
```

## 2) Update `GET /documents/{id}/generation-runs`

List response should return summary records only.

Add fields:

1. `status`
2. `documentVersionId`
3. `blockedCount`
4. `startedAt`
5. `renderedAt`
6. `failedAt`
7. `canceledAt`

## 3) Add `GET /documents/{id}/generation-runs/{runId}`

Purpose:

- return lifecycle details for one run.

Allowed roles:

- `member`
- `admin`
- `service_role`

Response `200` shape:

```json
{
  "run": {
    "id": "d1f1b37c-5f5d-4ce6-9542-4b83646706f3",
    "documentId": "4b5ef6d1-9a53-4d55-bd2a-67b9b8b92cf7",
    "intakeRevision": 3,
    "outputKey": "trust_certificate",
    "documentKey": "trust_certificate",
    "templateKey": "ca_trust_certificate",
    "templateVersion": "2026.04.14.v1",
    "templateHash": "sha256:ca-trustcert-v1",
    "templateArtifact": {
      "id": "afbc6c0e-37fa-4bc7-bd1e-b973c9cf8b96",
      "storagePath": "templates/ca/trust_certificate/2026.04.14.v1.docx",
      "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "renderEngine": "docx_template"
    },
    "status": "rendering",
    "blockingRequirements": [],
    "rendererJobId": "render-job-1042",
    "documentVersionId": null,
    "failureCode": null,
    "failureDetails": {},
    "cancellationReason": null,
    "createdAt": "2026-04-14T23:40:00.000Z",
    "blockedAt": null,
    "startedAt": "2026-04-14T23:42:00.000Z",
    "renderedAt": null,
    "failedAt": null,
    "canceledAt": null
  }
}
```

Optional query param:

- `includeDebug=true` for `admin` and `service_role` only.

When `includeDebug=true`, include:

1. `renderContext`
2. `resolvedSources`
3. full blocker payload

## 4) Add `POST /documents/{id}/generation-runs/{runId}/cancel`

Purpose:

- cancel a run before or during rendering.

Allowed roles:

- `member`
- `admin`
- `service_role`

Request body:

```json
{
  "reason": "Member replaced intake and needs a fresh generation run."
}
```

Behavior:

1. `queued -> canceled`
2. `blocked -> canceled`
3. `rendering -> canceled` only if worker cancellation is supported; otherwise return `409`
4. `rendered`, `failed`, and existing `canceled` runs return `409`

Response `200`:

```json
{
  "run": {
    "id": "d1f1b37c-5f5d-4ce6-9542-4b83646706f3",
    "status": "canceled",
    "cancellationReason": "Member replaced intake and needs a fresh generation run.",
    "canceledAt": "2026-04-14T23:50:00.000Z"
  }
}
```

## Service-Role / Worker Contract

These endpoints may be documented in OpenAPI or implemented as internal-only routes. The key point is that the lifecycle contract must be explicit.

## 1) `POST /internal/generation-runs/claim-next`

Purpose:

- atomically claim one eligible `queued` run and transition it to `rendering`.

Allowed role:

- `service_role`

Request body:

```json
{
  "workerId": "renderer-worker-3"
}
```

Response `200` when a run is claimed:

```json
{
  "run": {
    "id": "d1f1b37c-5f5d-4ce6-9542-4b83646706f3",
    "status": "rendering",
    "rendererJobId": "renderer-worker-3:1042",
    "startedAt": "2026-04-14T23:42:00.000Z"
  }
}
```

Response `204` when no run is available.

## 2) `POST /internal/generation-runs/{runId}/recheck`

Purpose:

- recompute blockers for a blocked run.

Allowed role:

- `service_role`

Behavior:

1. if blockers remain, keep `blocked`,
2. if blockers clear, transition `blocked -> queued` and clear `blockedAt` only if desired by implementation, or keep it as first-blocked timestamp.

## 3) `POST /internal/generation-runs/{runId}/complete`

Purpose:

- mark a rendering run as rendered and link the new `document_version`.

Allowed role:

- `service_role`

Request body:

```json
{
  "documentVersionId": "b1ff573e-4b3b-4971-8ea3-f862cc83c44f"
}
```

Behavior:

1. require current status `rendering`,
2. require the linked `document_version` to point back to this `generation_run_id`,
3. transition `rendering -> rendered`.

## 4) `POST /internal/generation-runs/{runId}/fail`

Purpose:

- mark a rendering run as failed with structured error details.

Allowed role:

- `service_role`

Request body:

```json
{
  "failureCode": "renderer_timeout",
  "message": "Renderer did not finish within 60 seconds.",
  "failureDetails": {
    "workerId": "renderer-worker-3",
    "timeoutMs": 60000
  }
}
```

Behavior:

1. require current status `rendering`,
2. transition `rendering -> failed`,
3. persist `failure_code`, `error_message`, and `failure_details_json`.

## 5) `POST /internal/generation-runs/{runId}/cancel`

Purpose:

- allow a worker or service process to confirm cooperative cancellation.

Allowed role:

- `service_role`

Behavior:

1. require current status `rendering`,
2. transition `rendering -> canceled`,
3. persist `canceled_at` and `cancellation_reason`.

## Validation Rules

1. `document_generation_runs.status` must use the six-value enum above.
2. `rendered` requires `document_version_id` and `rendered_at`.
3. `failed` requires `failed_at` and a non-empty `failure_code` or `error_message`.
4. `canceled` requires `canceled_at`.
5. `rendering` requires `started_at` and `renderer_job_id`.
6. `template_artifact_id` should be non-null for `queued`, `rendering`, and `rendered` runs.
7. `blocked` must carry at least one blocking requirement.
8. `render_context_json` may be incomplete for `blocked` runs, but must be complete for `rendering` and `rendered` runs.

## OpenAPI Additions

New or updated schemas:

1. `TemplateArtifact`
2. `GenerationRunBlocker`
3. `DocumentGenerationRunSummary`
4. `DocumentGenerationRunDetail`
5. `DocumentGenerationRunCancelRequest`
6. `DocumentGenerationRunDetailResponse`
7. `ClaimGenerationRunRequest`
8. `ClaimGenerationRunResponse`
9. `CompleteGenerationRunRequest`
10. `FailGenerationRunRequest`
11. `CancelGenerationRunRequest`

## Error Contract

All endpoints continue using the standard error envelope.

Common statuses:

1. `400` validation error
2. `401` unauthorized
3. `403` forbidden
4. `404` run or document not found
5. `409` invalid lifecycle transition

## Audit Events To Add In Phase 1

1. `system.generation_run_created`
2. `system.generation_run_blocked`
3. `system.generation_run_queued`
4. `system.generation_run_render_started`
5. `system.generation_run_render_completed`
6. `system.generation_run_failed`
7. `system.generation_run_canceled`
8. `system.template_artifact_resolved`

Recommended metadata:

1. `document_id`
2. `generation_run_id`
3. `output_key`
4. `document_key`
5. `template_key`
6. `template_version`
7. `template_hash`
8. `document_version_id` when applicable
9. `failure_code` or `cancellation_reason` when applicable

## Implementation Order Inside Phase 1

1. Migration for `template_artifacts` and `document_generation_runs` extension.
2. Service-layer helpers for:
   - artifact resolution,
   - blocker building,
   - render context building,
   - lifecycle transitions.
3. Update existing generation-run creation path to create `queued` or `blocked` runs instead of `failed` pre-render runs.
4. Add `GET /documents/{id}/generation-runs/{runId}` and cancel endpoint.
5. Add worker/service-role claim/recheck/complete/fail/cancel endpoints.
6. Add integration tests for lifecycle transitions.

## Acceptance Criteria

1. A generation run can be `queued`, `blocked`, `rendering`, `rendered`, `failed`, or `canceled`.
2. A run created with unresolved runtime values is `blocked`, not `failed`.
3. A rendered file is linked both ways between `document_versions` and `document_generation_runs`.
4. A renderer can locate the exact source template artifact without hardcoded lookup tables.
5. A detailed run endpoint exposes lifecycle timestamps and blocker state.
6. Canceling an eligible run produces a durable `canceled` state.

## Out Of Scope For This Contract

1. signer obligation derivation,
2. notarial appearance participant derivation,
3. signature field geometry generation,
4. notification routing,
5. PDF merge/fill mechanics for specific render engines.