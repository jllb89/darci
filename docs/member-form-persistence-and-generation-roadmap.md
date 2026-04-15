# Member Form Persistence and Generation Roadmap (CA/OH First)

Last updated: 2026-04-14
Related:
- docs/contract-form-closeout-2026-04-14.md
- docs/product-mode-and-trust-roadmap.md
- docs/template-binding-rules-admin-api-contract.md
- docs/admin-dashboard-template-binding-rules-guide.md
- docs/pdf-generation-prerequisites-roadmap.md
- docs/pdf-generation-phase-1-schema-and-api-contract.md

## Delivery Status Snapshot (2026-04-14)

- [x] Moved template binding catalog from hardcoded config to DB table (`template_binding_rules`) with runtime loader + cache.
- [x] Switched extraction coverage and requiredness tightening to DB-backed template metadata.
- [x] Added admin CRUD API for binding rules and updated OpenAPI spec.
- [x] Applied migration `20260414150000_add_template_binding_rules.sql` to remote.
- [x] Added draft persistence schema (`document_intake_drafts`, `document_intake_revisions`, and `documents` intake tracking columns).
- [x] Added Phase B draft endpoints (`GET/PUT /documents/:id/intake-draft`) with integration tests and OpenAPI updates.
- [x] Added intake bootstrap endpoint (`POST /documents/intake/bootstrap`) to create/resume draft documents before intake edits.
- [x] Switched start flow to DB-primary draft hydration + autosave, with localStorage retained only as fallback.
- [x] Added Phase C submit/payload endpoints (`POST /documents/:id/intake-submit`, `GET /documents/:id/intake-payload`) with validation and canonical snapshot responses.
- [x] Enforced intake lock semantics after submit (`intake_status` submitted/locked blocks autosave edits).
- [x] Added Phase D schema (`template_registry`, `document_generation_runs`, and `document_versions.generation_run_id`) with CA/OH template pin seeds.
- [x] Added Phase D generation orchestration endpoints (`POST/GET /documents/:id/generation-runs`) with template version/hash resolution and payload/coverage snapshots.
- [x] Added Phase E jurisdiction launch gating in member-form lists and submit paths using `jurisdiction_product_availability`.
- [x] Added Phase E migration to restrict launch availability to CA/OH and return explicit rollout reasons for blocked jurisdictions.

## 1) Goal
Build a production-safe pipeline that:
- captures member-form answers as canonical JSON per selected product mode,
- persists drafts and final submissions in the database (not browser-only),
- generates outputs using jurisdiction-aware, versioned template selection,
- starts with CA and OH rollout, and
- detects missing intake fields before generation starts.

## 2) Current State (Baseline)

Note: Baseline items below describe the original gap state; Phase B draft persistence and bootstrap plumbing are now implemented.

Frontend and submission behavior:
- Draft state now hydrates from backend draft snapshots and autosaves to DB revisions (with local fallback when bootstrap/save is unavailable).
- The final Continue action now submits intake via backend validation + snapshot persistence.
- Submitted intake now supports backend generation-run creation with pinned template version/hash and coverage snapshots.

Backend and data model:
- `/rules/member-form/:jurisdiction/validate` validates payloads but does not persist them.
- `createDocument` stores metadata (`product_flow_mode`, `selected_families`, `output_bundle`) and file version records, but not full form answers.
- Existing schema has `documents`, `document_versions`, and `document_parties`; no first-class intake answers table/snapshot history.

Extraction and template mapping:
- Template binding coverage exists and can report `mapped`, `missing_canonical_field`, and system/notary values.
- Binding config is explicit for `trust_rrr` and `poa_general`.
- Known missing canonical mapping appears in tests for POA multiple-agent signature authority.

Jurisdiction launch controls:
- `jurisdiction_product_availability` now gates jurisdiction list responses and member-form derivation for submit/rules endpoints.
- Current launch scope is CA/OH only; other jurisdictions return an explicit rollout-block reason.

## 3) Target End State

At submit time, each document has:
- one active draft snapshot,
- immutable revision history for autosave/submit events,
- one finalized intake payload snapshot used for generation,
- output generation runs linked to specific template version/hash,
- output-scoped signer obligations resolved from the selected templates and jurisdiction rules,
- render-ready context or explicit blockers for system/notary/signing-stage values,
- traceable coverage status for required placeholders.

At runtime:
- frontend autosaves to DB every field update burst (debounced),
- reload resumes from DB draft (no localStorage dependency),
- generation starts only if coverage gate passes,
- CA/OH are explicitly enabled; all other jurisdictions blocked with reason.

## 4) Proposed Data Model

## 4.1 Keep `documents` as workflow anchor
Add minimal columns for fast filtering:
- `intake_status text not null default 'not_started'` (`not_started|draft|submitted|locked`)
- `intake_schema_version text`
- `intake_last_saved_at timestamptz`
- `intake_submitted_at timestamptz`

## 4.2 Add current-state draft table
`document_intake_drafts` (1 row per document):
- `document_id uuid primary key references documents(id) on delete cascade`
- `owner_id uuid not null references users(id)`
- `product_flow_mode text not null`
- `jurisdiction text not null`
- `current_step text`
- `rules_snapshot_version text not null`
- `answers_json jsonb not null default '{}'::jsonb`
- `canonical_answers_json jsonb not null default '{}'::jsonb`
- `revision integer not null default 1`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Notes:
- `answers_json` preserves raw form values.
- `canonical_answers_json` stores normalized per-canonical-key payload for generation.

## 4.3 Add append-only revision history
`document_intake_revisions`:
- `id uuid primary key default gen_random_uuid()`
- `document_id uuid not null references documents(id) on delete cascade`
- `revision integer not null`
- `event_type text not null` (`autosave|submit|system_migration`)
- `payload_json jsonb not null`
- `validation_result jsonb not null default '{}'::jsonb`
- `created_by uuid references users(id)`
- `created_at timestamptz not null default now()`
- unique (`document_id`, `revision`)

This gives auditability and rollback points without overloading `documents`.

## 4.4 Add generation run records
`document_generation_runs`:
- `id uuid primary key default gen_random_uuid()`
- `document_id uuid not null references documents(id) on delete cascade`
- `intake_revision integer not null`
- `output_key text not null`
- `document_key text not null` (ex: `trust_rrr`, `poa_general`)
- `template_key text not null`
- `template_version text not null`
- `template_hash text not null`
- `payload_json jsonb not null`
- `coverage_json jsonb not null default '{}'::jsonb`
- `status text not null default 'queued'` (`queued|rendered|failed`)
- `error_message text`
- `created_at timestamptz not null default now()`

Link generated files in `document_versions` by adding nullable `generation_run_id`.

## 4.5 Add template registry/versioning table
`template_registry`:
- `id uuid primary key default gen_random_uuid()`
- `jurisdiction text not null`
- `output_key text not null`
- `document_key text not null`
- `template_key text not null`
- `template_version text not null`
- `template_hash text not null`
- `effective_from timestamptz not null default now()`
- `effective_to timestamptz`
- `is_active boolean not null default true`
- unique (`jurisdiction`, `output_key`, `template_version`)

Use this as source-of-truth for deterministic generation.

## 4.6 Add output-scoped signer obligations
Keep `document_parties` as the document-wide contact roster, but add a signer-obligation snapshot keyed to the generated output.

Suggested table: `document_output_signers`
- `id uuid primary key default gen_random_uuid()`
- `document_id uuid not null references documents(id) on delete cascade`
- `generation_run_id uuid not null references document_generation_runs(id) on delete cascade`
- `document_party_id uuid references document_parties(id) on delete set null`
- `output_key text not null`
- `document_key text not null`
- `party_role text not null`
- `party_name text not null`
- `obligation_type text not null` (`signer|acknowledger|witness|notary`)
- `signing_group text` (ex: `trustees_all`, `trustmakers_all`, `principal_only`)
- `is_required boolean not null default true`
- `resolution_source text not null` (`template|jurisdiction_rule|manual_override`)
- `sort_order integer not null default 0`
- `created_at timestamptz not null default now()`

Notes:
- Store both `document_party_id` and a party snapshot (`party_name`, `party_role`) so generation remains deterministic even if the contact roster later changes.
- This lets future signing/notification systems know exactly who must sign each generated output.

## 4.7 Extend generation-run render state
Current `document_generation_runs` rows pin template version/hash and coverage, but they do not yet persist enough state for real PDF rendering.

Add or persist equivalent fields for:
- `render_context_json jsonb not null default '{}'::jsonb`
- `blocking_requirements_json jsonb not null default '{}'::jsonb`
- `renderer_job_id text`
- `started_at timestamptz`
- `rendered_at timestamptz`
- `failed_at timestamptz`
- `document_version_id uuid references document_versions(id) on delete set null`

Status should likely expand to at least:
- `queued|blocked|rendering|rendered|failed`

Notes:
- `payload_json` currently stores canonical answers, not the fully resolved placeholder/value context the renderer will consume.
- `blocking_requirements_json` should capture unresolved system/notary/signing-stage values that coverage alone does not detect.

## 4.8 Add template artifact locator metadata
`template_registry` currently pins `template_key + template_version + template_hash`, but it does not identify where the real renderable artifact lives or which renderer should be used.

Add either columns on `template_registry` or a companion table keyed by (`template_key`, `template_version`) for:
- `artifact_storage_path text` or `artifact_url text`
- `artifact_mime_type text`
- `render_engine text` (`pdf_form|docx_template|html_pdf|other`)
- `artifact_metadata jsonb not null default '{}'::jsonb`

Without this, a worker can verify the template version but still cannot fetch the actual source template.

## 5) API Roadmap

Phase 1 APIs (draft persistence):
- `POST /documents/intake/bootstrap`
- `GET /documents/:id/intake-draft`
- `PUT /documents/:id/intake-draft`
  - body: `currentStep`, `answers`, optional `expectedRevision`
  - response: `revision`, `updatedAt`

Phase 2 APIs (submit + generation contract):
- `POST /documents/:id/intake-submit`
  - validates and writes immutable submit revision
  - computes canonical payload snapshot
- `GET /documents/:id/intake-payload`
  - returns canonical payload for downstream generation

Phase 3 APIs (generation orchestration):
- `POST /documents/:id/generation-runs`
  - one run per required output
  - stores template version/hash and coverage snapshot
- `GET /documents/:id/generation-runs`

Phase 4 APIs (render preparation + signer obligations):
- `GET /documents/:id/signer-obligations`
  - lists output-scoped signer obligations derived at submit/generation time
- `GET /documents/:id/generation-runs/:runId`
  - returns render context, blockers, signer obligations, and linked rendered version when available
- internal/service endpoint or worker contract to move a generation run through `blocked|rendering|rendered|failed`
- `GET /documents/:id/signature-fields`
  - should become version-aware and signer-aware, not a generic stub

## 6) CA/OH Launch Strategy for Jurisdiction + Versioning

## 6.1 Explicit launch gating
- Use `jurisdiction_product_availability` as runtime filter in:
  - member-form jurisdiction lists,
  - mode jurisdiction lists,
  - submit endpoint guard.
- Seed CA and OH as available for launch paths.
- Set all other jurisdictions `is_available = false` with clear `reason_if_unavailable`.

## 6.2 Template pinning
- For each required output in CA/OH, pin `template_key + template_version + template_hash` in `template_registry`.
- On submit, resolve active row by (`jurisdiction`, `output_key`) and store resolved version on generation run.

## 6.3 Controlled upgrades
- New template version rollout = new row in `template_registry`.
- Do not mutate existing generation runs.
- Allow in-progress drafts to continue on previously pinned version if already submitted.

## 7) Form Completeness Gap Check (CA templates)

## 7.1 Confirmed missing fields/questions (high priority)
1. POA multiple-agent signature rule (`agent_signature_authority`)
- Required by DDPOA template text.
- Present as required template binding but currently unresolved/missing in tests.
- Action: add explicit field to POA intake and canonical map.

2. POA execution date (`execution_date`)
- Required by DDPOA execution clause.
- Present in template binding config but not present in input requirements.
- Action: capture at the member signing step (post-intake) and map canonically.

## 7.2 Requiredness mismatches (likely generation risk)
1. POA contact details required in template, optional in form
- `principal_contact` and `agent_contact` are optional in input requirements.
- Action: enforce requiredness from template-binding metadata (not jurisdiction conditionals), or define deterministic fallback policy in metadata when optional.

2. Trust fields marked required in bindings but optional in intake
- `revocation_holders`, `tax_id_owner`, `trustee_incapacity_standard` are optional in form but required in trust template bindings.
- Action: enforce requiredness from template-binding metadata, or downgrade binding requiredness with explicit fallback text rules in config.

## 7.3 Coverage gaps for trust certificate output
1. Trust bundle outputs include `trust_certificate` but extraction bindings are not currently defined as a dedicated `trust_certificate` document key contract.
- Clarification: `trust_rrr` already covers the Trust Registration Amendment template. The remaining gap is the separate Trust Certification template, which uses different placeholder names (`Trust.No`, `Trust.RegDate`, `NotaryState`, lowercase `illuminotary`, and `Trust.Name`/`TrustName` variants).
- Action: add explicit binding config for trust certificate placeholders and coverage assertions.

2. Certification placeholders needing explicit source decision
- `Trust.RegDate`, `Trust.No`, and notary block values should be tagged as `system` or `notary` with clear source pipeline.
- Action: add placeholder-level source mapping and gate generation if unresolved.

## 7.4 Signer obligation gap
1. Signer identity is not currently persisted per output.
- `document_parties.is_signing_party` exists only at the document level, but trust bundles can produce outputs with different signer sets.
- Action: resolve signer obligations per generated output/document_key and persist them as part of submit/generation metadata.

2. California template review shows output-specific signer rules.
- `trust_rrr` / Trust Registration Amendment includes signature blocks for trustmakers and trustees, while the acknowledgment block currently names trustmakers.
- `trust_certificate` states that all currently acting trustees sign and its acknowledgment block names trustees, but the template also includes a trustmaker signature block that should be clarified before trustmakers are treated as required signers for notification/routing purposes.
- `poa_general` / CA DDPOA includes only the principal execution signature block; agents are appointed parties, not document signers in the current California template.

3. Recommended persistence shape
- Keep `document_parties` as the contact roster.
- Add output-scoped signer metadata so later PDF-signing and notification workflows know exactly which parties must sign which generated output.

4. Related gap: notarial appearance parties are not always the same as signers.
- In California trust templates, the signature section and acknowledgment section do not always name the same party set.
- Action: persist notarial appearance/acknowledgment participants separately from signer obligations when template text requires it.

## 7.5 Backend/API prerequisites before PDF generation roadmap
1. Auto-sync `document_parties` from submit.
- The roster API exists, but member-form submit/generation does not currently populate it from canonical intake answers.

2. Persist resolved render context, not only canonical answers.
- `document_generation_runs.payload_json` currently stores canonical answers, while the renderer will need resolved placeholder/value pairs.

3. Add a renderability gate beyond template coverage.
- Current coverage treats `system`, `notary`, and `signing` placeholders as covered even if no runtime value provider exists.
- PDF generation needs explicit blocker reporting for missing values such as registry numbers, registration dates, notary venue fields, or signing-stage dates.

4. Make generation runs version-aware and worker-aware.
- There is currently no backend/API path that turns a queued generation run into a rendered `document_version` and records lifecycle timestamps.

5. Make signature APIs signer-aware.
- `GET /documents/:id/signature-fields` is currently a stub and does not identify which signer obligation or party each field belongs to.
- Signature records currently link to the document owner rather than an output-scoped signer obligation.

## 8) Implementation Phases

## Phase A (1-2 days): Close known schema/form gaps

Status: in progress (3/4 complete)

- [x] Add POA `agent_signature_authority` field.
- [ ] Capture `execution_date` from the member signing event (post-intake), not from the intake form.
- [x] Tighten requiredness from DB-backed template-binding metadata (not jurisdiction conditionals).
- [x] Add/extend unit tests for missing binding detection and new mappings.

Exit criteria:
- [x] No known high-priority `missing_canonical_field` for required CA POA placeholders.

## Phase B (2-4 days): DB draft persistence

Status: complete (3/3 complete)

- [x] Add `document_intake_drafts` and `document_intake_revisions` migrations.
- [x] Implement draft load/save endpoints.
- [x] Switch frontend from localStorage-primary to DB-primary (localStorage optional fallback only).

Dependency note:
- Resolved: start flow now uses an intake bootstrap step to create/resume `document.id` before draft autosave starts.

Exit criteria:
- [x] Draft survives refresh/device switch and shows revision timestamp.

## Phase C (2-4 days): Final submission snapshot + canonical payload

Status: complete (3/3 complete)

- [x] Implement submit endpoint that validates and writes immutable revision.
- [x] Persist canonical payload snapshot for generation.
- [x] Lock intake after submit (explicit unlock action is deferred).

Exit criteria:
- [x] Every submitted document has immutable payload revision and deterministic canonical JSON.

## Phase D (2-3 days): Template registry + generation run tracking

Status: complete (3/3 complete)

- [x] Add `template_registry` and `document_generation_runs`.
- [x] Resolve and pin template version/hash per output.
- [x] Record payload and coverage used to render each output.

Exit criteria:
- [x] Every generated artifact can be traced to payload + template version + hash.

## Phase E (1-2 days): CA/OH launch gate

Status: complete (3/3 complete)

- [x] Enforce `jurisdiction_product_availability` in listing and submit paths.
- [x] Seed CA/OH availability and reasons for disabled jurisdictions.
- [x] Verify product mode combinations for CA/OH only.

Exit criteria:
- [x] Non-CA/OH jurisdictions are blocked cleanly with clear reason.

## 9) Test Plan

Unit:
- canonical mapping includes new POA fields,
- trust certificate binding config coverage,
- requiredness behavior by jurisdiction.

Integration:
- draft save/load/submit lifecycle,
- submit rejects unresolved required bindings,
- generation run stores template version/hash and payload snapshot.

E2E:
- start flow draft resume,
- final submit and generation kickoff for CA and OH,
- blocked flow messaging for non-enabled jurisdictions.

## 10) Suggested First PR Slice
1. [x] Add missing POA fields and requiredness updates from DB-backed template metadata.
2. [ ] Add dedicated trust certificate binding config and tests.
3. [x] Add draft persistence tables + basic save/load endpoint.

This gives immediate risk reduction on template completeness while preparing the persistence backbone.
