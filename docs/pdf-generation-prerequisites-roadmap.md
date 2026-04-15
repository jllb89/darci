# PDF Generation Prerequisites Roadmap

Last updated: 2026-04-15

Related:
- docs/member-form-persistence-and-generation-roadmap.md
- docs/admin-dashboard-template-binding-rules-guide.md
- docs/jurisdiction-launch-runbook.md
- docs/audit-events.md
- docs/pdf-generation-phase-1-schema-and-api-contract.md

## Delivery Status Snapshot (2026-04-15)

Phase 1 status: backend/API foundation completed.

Phase 2 status: backend signer/party/system-value foundation completed.

Roadmap checklist status:

- [x] Workstream 1: output-scoped signer obligations
- [x] Workstream 2: notarial appearance participants modeled as `acknowledger` obligations
- [x] Workstream 3: auto-sync `document_parties` on submit
- [x] Workstream 4: render context persistence
- [x] Workstream 5: renderability gate beyond coverage
- [x] Workstream 6: concrete system value providers for current CA launch outputs
- [x] Workstream 7: template artifact locator and render-engine metadata
- [x] Workstream 8: generation run lifecycle and renderer linkage
- [~] Workstream 9: signer-aware signature APIs are partially implemented via signer-aware lookup endpoints, but the final execution workflow is still pending

Done in Phase 1:

1. Workstream 8 foundation implemented:
   - generation-run lifecycle now supports `queued|blocked|rendering|rendered|failed|canceled`,
   - public detail and cancel endpoints exist for generation runs,
   - internal claim/recheck/complete/fail/cancel endpoints exist for worker/service-role transitions,
   - generation runs can link forward to `document_versions`.
2. Workstream 7 implemented:
   - `template_artifacts` now stores concrete renderable artifact metadata and render engine selection.
3. Workstream 4 implemented:
   - generation runs now persist `template_artifact_id`, `render_context_json`, `blocking_requirements_json`, `resolved_sources_json`, and lifecycle timestamps.
4. Workstream 5 implemented:
   - generation-run creation now produces structured `blocked` runs when runtime prerequisites are unresolved instead of treating pre-render readiness gaps as `failed` runs.
5. Validation completed:
   - backend TypeScript build passes,
   - backend integration suite passes against the root `.env.staging`.

Done in this delivery after Phase 1:

1. the generation queue and worker now claim queued runs, render a stored artifact, upload it, create a linked `document_version`, and mark the run `rendered|failed` with lifecycle/audit updates,
2. `document_output_signers` now persists output-scoped signer and acknowledger obligations,
3. `document_system_values` now persists durable runtime values such as registry number, trust registration date, verification URL, and California acknowledgment text profile,
4. submit now syncs `document_parties` from canonical intake answers,
5. trust certificate generation now has binding coverage and a trust-output extraction alias path,
6. `GET /documents/{id}/signer-obligations` and signer-derived `GET /documents/{id}/signature-fields` now expose output-aware signer data.

Still deferred after this delivery:

1. final PDF-fidelity renderers for `docx_template` / `pdf_form` engines are not implemented yet; the current worker produces stored draft artifacts from pinned template metadata and render context,
2. Phase 3 signer-aware signature capture / acknowledgment append / watermark endpoints still need final workflow integration.

## Why This Exists

The current member-form persistence work is close to the point where a PDF generation roadmap becomes useful, but the backend and API surface are still missing several prerequisites.

This document isolates those prerequisites so the later PDF generation roadmap can assume:

1. signer obligations are resolved and persisted,
2. renderable template artifacts can be located deterministically,
3. generation runs move through a real render lifecycle rather than stopping at `queued`, and
4. signing/notary flows can attach to the correct generated output and correct party.

Point 8 below, generation run lifecycle and renderer linkage, is the most critical because it is the boundary between “metadata/orchestration exists” and “the platform can actually produce and track a rendered PDF artifact.”

## Current Verified State

What already exists:

1. `document_parties` exists and remains the document-wide contact roster.
2. `document_output_signers` now persists output-scoped signer and acknowledger obligations per generation run.
3. `document_system_values` now persists durable runtime values needed by generation.
4. `document_generation_runs` exists and pins `output_key`, `document_key`, `template_key`, `template_version`, and `template_hash`.
5. `document_versions.generation_run_id` exists, so rendered files can be linked back to a run.
6. Coverage gating exists and can fail a generation run when required template bindings are unresolved.
7. Launch gating exists and CA/OH availability is enforced.
8. `template_artifacts` now stores artifact location and render-engine metadata for pinned templates.
9. `document_generation_runs` now persist render context, blockers, resolved sources, artifact linkage, and lifecycle timestamps.
10. Generation-run APIs now support detail, cancel, claim, recheck, complete, and fail transitions.
11. Generation-run creation now emits `blocked` runs with structured blockers for unresolved runtime prerequisites and queues renderable runs for the worker.
12. The worker now produces stored rendered artifacts and linked `document_versions`.

What is still missing:

1. the current renderer emits stored draft artifacts, not final PDF-fidelity outputs for every template engine,
2. member signature capture, acknowledgment append, and watermark flows are not yet fully wired to specific generation runs / signer obligations,
3. downstream notifications and signing UX remain outside this prerequisite scope.

## Goals

1. Preserve `document_parties` as the single contact roster for people involved in a document.
2. Add output-scoped signer obligations derived from template text and jurisdiction rules.
3. Make generation runs render-ready by persisting resolved placeholder context and blockers.
4. Support deterministic template artifact resolution, not just version pinning.
5. Establish a worker-safe lifecycle for generation runs from queue through rendered artifact.
6. Make signature and later notification workflows attach to the correct output, signer, and signature field.

## Non-Goals

1. Building the final PDF-fidelity renderer for every supported template engine.
2. Building notification delivery workflows.
3. Designing the final signing UX.
4. Solving all future admin-dashboard features unrelated to generation readiness.

## Workstream 1: Output-Scoped Signer Obligations

## Problem

`document_parties.is_signing_party` is document-wide. That is too coarse for bundles where different outputs require different parties to sign.

Examples from California templates:

1. Trust Registration Amendment (`trust_rrr`) includes trustmaker and trustee signature blocks.
2. Trust Certification (`trust_certificate`) states that all currently acting trustees sign, even though the template also contains a trustmaker signature block that should be clarified.
3. CA DDPOA (`poa_general`) only requires principal execution in the current template.

## Proposed Persistence

Add `document_output_signers`.

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `document_id uuid not null references documents(id) on delete cascade`
- `generation_run_id uuid not null references document_generation_runs(id) on delete cascade`
- `document_party_id uuid references document_parties(id) on delete set null`
- `output_key text not null`
- `document_key text not null`
- `party_role text not null`
- `party_name text not null`
- `obligation_type text not null` (`signer|acknowledger|witness|notary`)
- `signing_group text`
- `is_required boolean not null default true`
- `resolution_source text not null` (`template|jurisdiction_rule|manual_override`)
- `sort_order integer not null default 0`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

## Why This Shape

1. `document_party_id` keeps the signer obligation tied to the reusable contact roster.
2. `party_name` and `party_role` snapshot the obligation at generation time so later roster edits do not mutate historical runs.
3. `obligation_type` keeps signers separate from acknowledgers, witnesses, and notaries.
4. `signing_group` captures rules like `trustees_all`, `trustees_any_one`, `principal_only`, `trustmakers_all`.

## Backend/API Work

1. Add DB migration and service methods for `document_output_signers`.
2. Extend generation-run creation to resolve signer obligations from canonical intake + selected template/document key.
3. Add `GET /documents/{id}/signer-obligations`.
4. Add `GET /documents/{id}/generation-runs/{runId}` returning signer obligations for the run.

## Acceptance Criteria

1. Every generation run has a signer-obligation snapshot per output.
2. Trust bundle outputs can carry different signer sets on the same document.
3. Historical signer obligations remain stable if the contact roster later changes.

## Workstream 2: Notarial Appearance Participants

## Problem

The party set in the acknowledgment block is not always the same as the signing party set.

This must be modeled explicitly or later PDF/signing/notary workflows will assume the wrong participants.

## Proposed Approach

Treat acknowledgment participants as `obligation_type = acknowledger` inside `document_output_signers` unless a later dedicated table becomes necessary.

## Backend/API Work

1. Resolve acknowledgment participants separately from signer obligations.
2. Include acknowledgment participants in signer-obligation responses.
3. Surface clear distinctions in metadata returned to renderers and signing services.

## Acceptance Criteria

1. A template can require a signer and a different acknowledgment participant set.
2. Signature-field generation can distinguish execution signatures from notarial appearance data.

## Workstream 3: Auto-Sync `document_parties` On Submit

## Problem

The roster API exists, but member-form submit/generation does not yet appear to populate `document_parties` automatically from canonical intake answers.

## Proposed Approach

At intake submit time:

1. derive the canonical party roster from final canonical answers,
2. replace the document’s `document_parties` rows,
3. store role-specific metadata needed later for signer resolution.

Suggested metadata examples:

1. trustee row order,
2. trustmaker row order,
3. whether a trustee was selected as the named signing trustee,
4. whether a POA principal allows a proxy signer,
5. whether an agent is primary or successor.

## Backend/API Work

1. Add a submit-time `syncDocumentPartiesFromCanonicalAnswers` step.
2. Ensure contact normalization stays deterministic.
3. Ensure submit locks the roster snapshot used by generation runs.

## Acceptance Criteria

1. `document_parties` always reflects the latest submitted intake, not stale draft state.
2. Generation run creation does not depend on a separate manual roster update endpoint.

## Workstream 4: Render Context Persistence

## Problem

`document_generation_runs.payload_json` currently stores canonical answers, but a renderer will need the resolved placeholder/value context after all member, system, notary, and signing-stage mappings have been applied.

## Proposed Persistence

Extend `document_generation_runs` with:

- `render_context_json jsonb not null default '{}'::jsonb`
- `blocking_requirements_json jsonb not null default '{}'::jsonb`
- `resolved_sources_json jsonb not null default '{}'::jsonb`

## What Goes In `render_context_json`

1. resolved placeholder keys and values,
2. list/repeatable expansions,
3. signer obligation references,
4. acknowledgment participants,
5. template-specific normalization results,
6. data shape the renderer can consume without re-deriving business rules.

## What Goes In `blocking_requirements_json`

1. missing system values,
2. missing notary values,
3. missing signing-stage values,
4. unresolved signer/acknowledger ambiguity,
5. template artifact lookup failures.

## Acceptance Criteria

1. A generation worker can render using generation-run state alone plus the resolved template artifact.
2. A failed or blocked run can explain exactly why it cannot render.

## Workstream 5: Renderability Gate Beyond Coverage

## Problem

Coverage answers “is there metadata for this placeholder?” but not “does a real value provider exist right now?”

This distinction matters for:

1. `Trust.No` / `DarciNo`,
2. `Trust.RegDate`,
3. notary venue/date values,
4. signing-stage values like execution date,
5. future acknowledgment and watermark metadata.

## Proposed Approach

Introduce a renderability gate after coverage but before rendering.

Possible statuses:

1. `blocked_missing_system_value`
2. `blocked_missing_notary_value`
3. `blocked_missing_signing_value`
4. `blocked_signer_resolution`
5. `blocked_template_artifact`

## Backend/API Work

1. Add a `buildRenderReadiness` step after generation-run creation.
2. Store the blockers on the run.
3. Return blocker details in generation-run APIs.

## Acceptance Criteria

1. Runs with complete binding metadata but missing runtime values no longer appear merely `queued`.
2. Operations can tell the difference between metadata gaps and runtime data gaps.

## Workstream 6: Concrete System Value Providers

## Problem

Some placeholders are already known to be system-sourced, but the backend does not yet expose a stable source of truth for them.

## Initial Required Providers

1. DARCi / registration number used by trust outputs.
2. Trust registration date.
3. Template-level registry metadata needed by future watermarking or platform certificates.

## Proposed Approach

Add explicit provider functions and persist the source values on durable workflow records rather than deriving them ad hoc.

Possible locations:

1. `documents` if the value is document-wide and immutable after assignment.
2. a dedicated registry/workflow table if the value belongs to trust registration rather than the raw document.
3. `document_generation_runs.render_context_json` only as the resolved snapshot, not the origin source of truth.

## Acceptance Criteria

1. Every `system` binding used by CA launch outputs has a real runtime provider.
2. Trust Certification no longer depends on undocumented or inferred runtime values.

## Workstream 7: Template Artifact Locator And Render Engine Metadata

## Problem

`template_registry` pins version/hash but does not tell a worker how to retrieve the actual source artifact or what renderer to use.

## Proposed Approach

Add either columns on `template_registry` or a companion `template_artifacts` table keyed by `template_key + template_version`.

Suggested fields:

- `artifact_storage_path text`
- `artifact_mime_type text`
- `render_engine text` (`pdf_form|docx_template|html_pdf|other`)
- `artifact_metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

## Why This Matters

Without artifact-location metadata, a worker can verify that the correct version should be used but still has no way to fetch it.

## Acceptance Criteria

1. A generation run can resolve one and only one renderable template artifact.
2. The renderer can identify which engine to invoke without hardcoded branching by output key.

## Workstream 8: Generation Run Lifecycle And Renderer Linkage

## Criticality

This is the most critical missing piece.

Today, generation runs mostly capture orchestration state. The backend can create `queued` or `failed` runs, but there is no full lifecycle that:

1. claims a run for rendering,
2. records a renderer job id,
3. stores start/finish/failure timestamps,
4. creates or links the rendered `document_version`,
5. records a stable relation between the rendered artifact and the generation run.

## Proposed Lifecycle

Expand run status to:

1. `queued`
2. `blocked`
3. `rendering`
4. `rendered`
5. `failed`
6. `canceled`

Extend `document_generation_runs` with:

- `renderer_job_id text`
- `started_at timestamptz`
- `rendered_at timestamptz`
- `failed_at timestamptz`
- `canceled_at timestamptz`
- `document_version_id uuid references document_versions(id) on delete set null`

## Worker / Service Contract

At minimum, the backend needs an internal or service-role path that does the following:

1. fetch next eligible `queued` run,
2. verify the run is renderable,
3. move the run to `rendering`,
4. fetch the pinned template artifact,
5. render and store the artifact,
6. create a `document_version` linked to `generation_run_id`,
7. update the run to `rendered` with `document_version_id`,
8. update the run to `failed` with structured error details on exceptions.

## API Work

1. Add `GET /documents/{id}/generation-runs/{runId}`.
2. Return lifecycle timestamps, render status, blockers, linked `documentVersionId`, and signer obligations.
3. Optionally add internal/service-role endpoints for worker transitions if the worker will not talk to the database directly.

## Acceptance Criteria

1. A rendered output can always be traced back to exactly one generation run.
2. A generation run can always show whether it is queued, blocked, rendering, rendered, failed, or canceled.
3. A failed or canceled run contains enough structured state to retry, replace, or triage without re-deriving context.

## Workstream 9: Signer-Aware Signature APIs

## Problem

The current signature APIs are document-owner-centric and `GET /documents/{id}/signature-fields` is still a stub.

That is incompatible with output-scoped signers and multiple generated artifacts.

## Proposed Approach

Make signature APIs operate on the rendered output and signer obligation, not just the document.

## API Direction

1. `GET /documents/{id}/signature-fields?generationRunId=...`
   - Returns signer-aware fields tied to a rendered output version.
2. `POST /documents/{id}/signatures/request`
   - Require `generationRunId` and `outputSignerId` or equivalent.
3. `POST /documents/{id}/signatures/finalize`
   - Link the uploaded signature to a signer obligation, not the document owner.

## Suggested Signature Field Shape

In addition to the existing geometry data, include:

- `generationRunId`
- `documentVersionId`
- `outputSignerId`
- `obligationType`
- `partyName`
- `partyRole`
- `signatureKind` (`execution|acknowledgment|initial|other`)

## Acceptance Criteria

1. Signature uploads are attributable to the correct signer obligation.
2. Trust bundle outputs can present different signature fields to different parties.
3. Signature records no longer assume `document.owner_id` is the signer.

## Proposed Implementation Order

## Phase 1: Lifecycle Foundation

Status: backend/API foundation implemented.

Completed in this phase:

1. Workstream 8: generation-run lifecycle schema, state transitions, and lifecycle endpoints.
2. Workstream 7: template artifact locator and render engine metadata.
3. Workstream 4: render context, blocker, and resolved-source persistence on generation runs.
4. Workstream 5: renderability gate expressed as `blocked` runs with structured blocker payloads.

Reason:

Without these four items, there is no reliable “unit of rendering” for a future PDF workflow.

## Phase 2: Party And Signer Resolution

Status: backend foundation implemented.

Completed in this phase:

1. Workstream 3: auto-sync `document_parties` on submit.
2. Workstream 1: output-scoped signer obligations.
3. Workstream 2: notarial appearance participants.
4. Workstream 6: concrete system value providers.

Reason:

These give the renderer and later signature flows the correct people and correct values.

## Phase 3: Signature Surface Alignment

Status: partially started, not complete.

Completed so far:

1. `GET /documents/{id}/signer-obligations` returns output-aware signer data.
2. `GET /documents/{id}/signature-fields` is now signer-aware instead of a static stub.

Still missing in this phase:

1. Workstream 9: signer-aware signature APIs.
2. Add signer-aware signature field generation from rendered versions.
3. Align audit events with signer obligation ids and generation run ids.

## Suggested Audit Event Additions

These can follow the existing audit pattern.

1. `system.generation_run_queued`
2. `system.generation_run_blocked`
3. `system.generation_run_render_started`
4. `system.generation_run_render_completed`
5. `system.generation_run_failed`
6. `system.output_signers_resolved`
7. `system.signature_fields_generated`
8. `member.signature_capture_requested`
9. `member.signature_capture_linked_to_output_signer`

## Testing Expectations

## Unit

1. signer obligation derivation for `trust_rrr`, `trust_certificate`, and `poa_general`.
2. acknowledgment participant derivation independent of signer derivation.
3. renderability gate correctly distinguishes metadata coverage from missing runtime values.
4. template artifact resolution chooses the correct renderer and source artifact.

## Integration

1. intake submit hydrates `document_parties` deterministically.
2. generation-run creation persists signer obligations and render blockers.
3. worker lifecycle transitions create linked `document_versions`.
4. failed render attempts preserve structured blocker/error state.
5. signature requests bind to the correct generation run and signer obligation.

## Exit Criteria Before Drafting The PDF Generation Roadmap

The PDF generation roadmap should start only after the team agrees on the following truths:

1. what a generation run must persist to be renderable,
2. where real template artifacts live,
3. how signer obligations are resolved per output,
4. how acknowledgment participants differ from signers,
5. which system values exist now versus which are deferred to later stages,
6. how a rendered version is created and linked back to the run.

Once those decisions are accepted, the PDF generation roadmap can focus on renderer choice, fill/merge mechanics, storage, retries, watermarking, and downstream signing.