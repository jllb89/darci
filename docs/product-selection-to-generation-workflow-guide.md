# Product Selection To Generation Workflow Guide

Last updated: 2026-04-15

Related:
- docs/pdf-generation-next-roadmap.md
- docs/pdf-generation-prerequisites-roadmap.md
- docs/pdf-generation-phase-1-schema-and-api-contract.md
- docs/member-form-persistence-and-generation-roadmap.md

## Why This Doc Exists

This is the plain-English guide to the system we have today.

It explains the current path from product selection all the way to stored generated artifacts, and it tells you which frontend files, backend routes, controllers, services, and database tables are involved at each step.

This is not the future ideal flow.

This is the real flow that exists now.

## One-Minute Summary

The current system works like this:

1. the frontend asks the backend which product flows are available,
2. the frontend asks which jurisdictions are allowed for that product flow,
3. the frontend asks for the correct member form contract,
4. the backend bootstraps a draft document in the database,
5. the frontend autosaves draft answers into revisioned draft rows,
6. submit validates the form and stores canonical answers,
7. the backend syncs document parties from those canonical answers,
8. the backend creates one generation run per output,
9. the backend resolves signers, system values, blockers, and render context,
10. runnable generation runs are queued,
11. a worker renders a stored artifact, uploads it, and creates a linked document version.

The main thing still missing is the final production rendering and execution layer after that point.

## The Most Important Files

If you only want the shortest reading list, start here:

1. `apps/web/src/app/app/start/page.tsx`
2. `backend/src/routes/rules.ts`
3. `backend/src/controllers/memberFormRulesController.ts`
4. `backend/src/routes/documents.ts`
5. `backend/src/controllers/documentsController.ts`
6. `backend/src/services/documentService.ts`
7. `backend/src/services/documentGenerationService.ts`
8. `backend/src/services/documentGenerationRenderService.ts`
9. `backend/src/worker/index.ts`
10. `api/openapi.yaml`

## Database Tables In The Current Flow

## Product and rule-definition tables

These tables decide what the member can ask for and what the backend expects:

1. `product_flow_modes`
   - top-level product mode definitions such as `trust_bundle`
2. `product_flow_mode_families`
   - which document families belong to each product mode
3. `product_flow_mode_outputs`
   - which outputs should be generated for each mode
4. `product_flow_mode_ui`
   - UI grouping and layout hints for the frontend
5. `jurisdiction_product_availability`
   - launch gating by jurisdiction, family, and document type
6. `poa_requirements`
   - base POA requirement definitions
7. `poa_form_rules`
   - POA form-specific rule metadata
8. `poa_glossary_terms`
   - POA glossary and help text
9. `poa_special_authority_rules`
   - POA special-authority options
10. `poa_canonical_special_authorities`
    - canonical POA special-authority catalog
11. `trust_requirements`
    - trust requirement definitions
12. `trust_trustee_powers`
    - trustee-power options and labels
13. `idn_requirements`
    - IDN and acknowledgment-related requirements
14. `template_binding_rules`
    - placeholder-to-source mapping for templates
15. `template_registry`
    - which template version and hash should be used for a jurisdiction and output
16. `template_artifacts`
    - where the actual renderable artifact lives and which render engine it uses

## Document workflow tables

These tables hold the document lifecycle itself:

1. `users`
   - internal user ids mapped from Supabase users
2. `documents`
   - top-level workflow anchor for a document or intake flow
3. `document_versions`
   - stored versions of source uploads and generated outputs
4. `document_intake_drafts`
   - the latest draft snapshot for a document
5. `document_intake_revisions`
   - append-only draft and submit history
6. `document_parties`
   - document-wide people roster
7. `document_generation_runs`
   - one row per output generation attempt
8. `document_output_signers`
   - signer and acknowledger snapshot per generation run
9. `document_system_values`
   - durable runtime values used during generation
10. `audit_events`
    - operational and member event log

## Existing downstream tables that still matter

These tables are part of the older downstream execution flow and still exist today:

1. `signatures`
2. `notarization_requests`
3. `notarization_codes`

These tables are not yet fully aligned with the new generation-run and output-signer model.

## Key Migration Files

If you want the schema story in chronological order, these are the most useful migrations to read:

1. `supabase/migrations/20260413110000_add_product_flow_mode_schema.sql`
2. `supabase/migrations/20260414150000_add_template_binding_rules.sql`
3. `supabase/migrations/20260414180000_add_document_intake_drafts.sql`
4. `supabase/migrations/20260414193000_add_template_registry_and_generation_runs.sql`
5. `supabase/migrations/20260414210000_limit_jurisdiction_product_availability_to_ca_oh.sql`
6. `supabase/migrations/20260414234500_add_generation_run_phase1_lifecycle.sql`
7. `supabase/migrations/20260415010000_add_generation_phase2_signers_and_system_values.sql`

## End-To-End Workflow

## Step 1: The frontend loads product flow modes

Plain English:

The app first asks, "What products can the member start from this screen?"

Frontend files:

1. `apps/web/src/app/app/start/page.tsx`
2. `apps/web/src/app/app/start/startPageTypes.ts`
3. `apps/web/src/app/app/start/startPageConstants.ts`
4. `apps/web/src/app/app/start/ProductSelectionBand.tsx`

Backend route and controller:

1. `backend/src/routes/rules.ts`
   - `GET /rules/product-flow-modes`
2. `backend/src/controllers/memberFormRulesController.ts`
   - `listProductFlowModesForSelection`

Services involved:

1. `backend/src/services/productFlowModeService.ts`
   - `listProductFlowModes`
   - `getProductFlowMode`
   - `buildSelectionForMode`

Tables involved:

1. `product_flow_modes`
2. `product_flow_mode_families`
3. `product_flow_mode_outputs`
4. `product_flow_mode_ui`

What happens:

The backend returns product mode definitions, the families each mode includes, the outputs each mode implies, and the UI metadata the frontend uses to render the start flow.

## Step 2: The frontend loads allowed jurisdictions for the selected mode

Plain English:

Once the member picks a product mode, the app asks, "Which jurisdictions are currently allowed for this selection?"

Frontend file:

1. `apps/web/src/app/app/start/page.tsx`

Backend route and controller:

1. `backend/src/routes/rules.ts`
   - `GET /rules/member-form?mode=...`
2. `backend/src/controllers/memberFormRulesController.ts`
   - `listMemberFormJurisdictionsForSelection`

Services involved:

1. `backend/src/services/productFlowModeService.ts`
   - resolves the selected mode into the family and type selection
2. `backend/src/services/memberFormRulesService.ts`
   - `listMemberFormJurisdictions`
3. `backend/src/services/jurisdictionAvailabilityService.ts`
   - applies CA and OH launch gating
4. `backend/src/services/poaService.ts`
5. `backend/src/services/trustService.ts`
6. `backend/src/services/idnService.ts`

Tables involved:

1. `product_flow_modes`
2. `product_flow_mode_families`
3. `jurisdiction_product_availability`
4. `poa_requirements`
5. `trust_requirements`
6. `idn_requirements`

What happens:

The backend intersects the jurisdictions supported by the selected requirement families and then removes anything blocked by launch gating.

Right now that effectively limits the launch to California and Ohio.

## Step 3: The frontend loads the member form contract

Plain English:

Once the member has chosen a product mode and jurisdiction, the app asks, "What exact form should I show?"

Frontend files:

1. `apps/web/src/app/app/start/page.tsx`
2. `apps/web/src/app/app/start/memberFormRuntime.ts`
3. `apps/web/src/app/app/start/memberFormControls.ts`
4. `apps/web/src/app/app/start/startPageUtils.ts`

Backend route and controller:

1. `backend/src/routes/rules.ts`
   - `GET /rules/member-form/:jurisdiction?mode=...`
2. `backend/src/controllers/memberFormRulesController.ts`
   - `getMemberFormRulesByJurisdiction`

Services involved:

1. `backend/src/services/memberFormRulesService.ts`
   - `deriveMemberFormRulesByJurisdiction`
2. `backend/src/services/inputRequirements.ts`
   - normalizes raw requirement records
3. `backend/src/services/memberInputAggregator.ts`
   - merges family-specific fields into one member-facing form
4. `backend/src/services/templateBindingRulesService.ts`
   - tells the system which canonical fields matter later for template coverage
5. `backend/src/services/jurisdictionAvailabilityService.ts`
   - blocks unsupported jurisdictions
6. `backend/src/services/poaService.ts`
7. `backend/src/services/trustService.ts`
8. `backend/src/services/idnService.ts`

Tables involved:

1. `poa_requirements`
2. `poa_form_rules`
3. `poa_glossary_terms`
4. `poa_special_authority_rules`
5. `poa_canonical_special_authorities`
6. `trust_requirements`
7. `trust_trustee_powers`
8. `idn_requirements`
9. `template_binding_rules`
10. `jurisdiction_product_availability`

What happens:

The backend builds one aggregated form contract that the frontend can render.

That contract already knows:

1. which sections exist,
2. which fields are required,
3. which fields are conditional,
4. which values are allowed,
5. which canonical keys matter later for extraction and generation.

## Step 4: The frontend bootstraps a draft document

Plain English:

Before the member starts entering real data, the frontend asks the backend to create a fresh draft workflow record. Resume behavior is now explicit rather than automatic.

Frontend file:

1. `apps/web/src/app/app/start/page.tsx`

Backend route and controller:

1. `backend/src/routes/documents.ts`
   - `POST /documents/intake/bootstrap`
2. `backend/src/controllers/documentsController.ts`
   - `bootstrapDocumentIntakeDraft`

Services involved:

1. `backend/src/services/productFlowModeService.ts`
   - `buildSelectionForMode`
2. `backend/src/services/documentService.ts`
   - `bootstrapDocumentIntakeDraft`
   - internal draft-creation helpers

Tables involved:

1. `documents`
2. `document_intake_drafts`
3. `document_intake_revisions`

What happens:

The backend either:

1. finds an existing unlocked draft for the same owner, mode, and jurisdiction, or
2. creates a new `documents` row, a new current draft row, and the first revision-history row.

The frontend then gets back a `documentId`, the current draft state, and the latest revision number.

## Step 5: The frontend autosaves draft answers

Plain English:

As the member fills out the form, the frontend periodically writes the draft to the backend.

Frontend file:

1. `apps/web/src/app/app/start/page.tsx`

Backend route and controller:

1. `backend/src/routes/documents.ts`
   - `PUT /documents/:id/intake-draft`
2. `backend/src/controllers/documentsController.ts`
   - `saveDocumentIntakeDraft`

Services involved:

1. `backend/src/services/documentService.ts`
   - `saveDocumentIntakeDraft`

Tables involved:

1. `document_intake_drafts`
2. `document_intake_revisions`
3. `documents`

What happens:

The backend:

1. checks whether the draft is already locked,
2. checks the expected revision to avoid overwriting another session,
3. upserts the latest draft snapshot,
4. appends a revision-history row,
5. updates intake timestamps and intake status on the `documents` row.

The frontend also handles revision conflicts by reloading the latest saved version if another session changed the draft.

## Step 6: Submit validates the form and locks intake

Plain English:

When the member finishes the intake flow, the frontend asks the backend to validate everything and turn the draft into the submitted source of truth.

Frontend file:

1. `apps/web/src/app/app/start/page.tsx`

Backend route and controller:

1. `backend/src/routes/documents.ts`
   - `POST /documents/:id/intake-submit`
2. `backend/src/controllers/documentsController.ts`
   - `submitDocumentIntakeDraft`

Services involved:

1. `backend/src/services/memberFormRulesService.ts`
   - rebuilds the member-form contract for the document's mode and jurisdiction
2. `backend/src/services/memberFormValidationService.ts`
   - `validateMemberFormSubmission`
3. `backend/src/services/documentService.ts`
   - `saveDocumentIntakeDraft`
4. `backend/src/services/documentGenerationService.ts`
   - `syncDocumentPartiesFromCanonicalAnswers`

Tables involved:

1. `document_intake_drafts`
2. `document_intake_revisions`
3. `documents`
4. `document_parties`

What happens:

The backend:

1. reloads the current rules for the selected mode and jurisdiction,
2. validates the submitted answers,
3. builds canonical answers,
4. saves the submission as a new revision,
5. marks the `documents` row as submitted,
6. syncs the document-wide people roster into `document_parties`.

At this point the intake is locked and becomes the stable basis for generation.

## Step 7: Generation runs are created from the submitted intake

Plain English:

Once intake is submitted, the backend can create one generation run for each configured output.

Important current note:

The API path is real, but the current document workspace frontend is still mostly mock UI and is not yet fully wired to these endpoints.

Backend route and controller:

1. `backend/src/routes/documents.ts`
   - `POST /documents/:id/generation-runs`
   - `GET /documents/:id/generation-runs`
   - `GET /documents/:id/generation-runs/:runId`
2. `backend/src/controllers/documentsController.ts`
   - `createDocumentGenerationRuns`
   - `listDocumentGenerationRuns`
   - `getDocumentGenerationRun`
   - `cancelDocumentGenerationRun`

Services involved:

1. `backend/src/services/documentService.ts`
   - `getActiveTemplateRegistryForOutput`
   - `getActiveTemplateArtifact`
   - `createDocumentGenerationRun`
   - `replaceDocumentOutputSigners`
2. `backend/src/services/memberFormRulesService.ts`
   - rebuilds rules for the submitted document
3. `backend/src/services/memberFormDocumentExtractionService.ts`
   - `buildMemberFormDocumentExtractionPayload`
4. `backend/src/services/documentGenerationService.ts`
   - `prepareGenerationRun`
5. `backend/src/worker/jobs.ts`
   - `enqueueDocumentGenerationRun`
6. `backend/src/services/auditService.ts`
   - `recordAuditEvent`

Tables involved:

1. `documents`
2. `document_intake_drafts`
3. `template_registry`
4. `template_artifacts`
5. `template_binding_rules`
6. `document_generation_runs`
7. `document_output_signers`
8. `document_parties`
9. `document_system_values`
10. `audit_events`

What happens:

For each output in the document's output bundle, the controller:

1. finds the active template registry row,
2. finds the active template artifact,
3. rebuilds extraction coverage,
4. asks `prepareGenerationRun` to resolve the renderable state,
5. inserts the generation run,
6. inserts signer obligations for that run,
7. queues the run if it is renderable,
8. leaves it `blocked` if something important is still missing.

## Step 8: `prepareGenerationRun` is the core orchestration step

Plain English:

This service is the center of the current generation model.

File:

1. `backend/src/services/documentGenerationService.ts`

What it does:

1. loads existing `document_parties`,
2. auto-syncs parties from canonical answers if the roster is empty,
3. ensures durable system values exist,
4. resolves the correct `documentKey` for the output,
5. resolves the extraction contract for that output,
6. handles the trust-certificate alias case,
7. derives signer and acknowledger obligations,
8. resolves placeholder values,
9. builds blocker records,
10. decides whether the run is `queued` or `blocked`,
11. assembles `render_context_json`, `resolved_sources_json`, and the final run payload.

Important helper functions inside this file:

1. `deriveDocumentPartiesFromCanonicalAnswers`
2. `syncDocumentPartiesFromCanonicalAnswers`
3. `deriveSignerObligationsForRun`
4. `ensureDocumentSystemValues`
5. `resolveExtractionDocumentForOutput`
6. `resolveOutputDocumentKey`
7. `buildGenerationRunBlockers`
8. `prepareGenerationRun`

Tables touched through this step:

1. `document_parties`
2. `document_system_values`
3. `documents`
4. `template_binding_rules`

Important current IDN note:

1. the code already has a persisted `documents.idn` field,
2. `ensureDocumentSystemValues` uses that field as the source for `registry_number`,
3. if `documents.idn` is empty, the current generation path can assign one during generation preparation,
4. the current generated format is a placeholder-style value such as `IDN-XXXXXXXX`, not yet the final 12-character alphanumeric IDN described by the product rule,
5. there is not yet a first-class IDN record that stores the minimum product metadata set such as signer set, notary, date, title, and page count,
6. this means the platform already has an IDN-like concept and even calls it `idn`, but the timing, format, and metadata model are not yet aligned with the intended business workflow.

## Step 9: The worker queue takes over for queued runs

Plain English:

If a run is ready, the backend puts it on a queue and a worker process handles the rendering.

Files:

1. `backend/src/worker/queues.ts`
2. `backend/src/worker/jobs.ts`
3. `backend/src/worker/index.ts`
4. `backend/src/services/documentGenerationRenderService.ts`

Runtime pieces:

1. BullMQ queue named `generation-runs`
2. Redis connection from `REDIS_URL`

What happens:

1. `enqueueDocumentGenerationRun` adds the run id to the queue,
2. the worker claims the run by id,
3. the render service loads the document, template artifact, signer obligations, and render context,
4. it renders the current draft artifact,
5. it uploads that artifact to Supabase Storage,
6. it creates a new `document_versions` row,
7. it updates the run to `rendered`, or to `failed` if something breaks.

Tables involved:

1. `document_generation_runs`
2. `template_artifacts`
3. `document_output_signers`
4. `document_versions`
5. `audit_events`

Storage involved:

1. Supabase documents bucket via `backend/src/services/storageService.ts`

## Step 10: What the current renderer actually does

Plain English:

The current renderer is intentionally a foundation renderer, not the final production renderer.

File:

1. `backend/src/services/documentGenerationRenderService.ts`

Current behavior:

1. reads the pinned render context,
2. builds an HTML artifact that shows placeholder values, signer obligations, and deferred requirements,
3. optionally includes the local template source snapshot if configured,
4. stores that artifact and links it to the run.

What it does not do yet:

1. fill real PDF forms,
2. merge real DOCX templates,
3. output the final production artifact format for every template engine.

## Step 11: Inspection APIs expose the new model

Plain English:

Once runs exist, the backend can explain what happened and who is supposed to sign.

Relevant routes:

1. `GET /documents/:id/generation-runs`
2. `GET /documents/:id/generation-runs/:runId`
3. `GET /documents/:id/signer-obligations`
4. `GET /documents/:id/signature-fields`
5. internal `POST /internal/generation-runs/claim-next`
6. internal `POST /internal/generation-runs/:runId/recheck`
7. internal `POST /internal/generation-runs/:runId/complete`
8. internal `POST /internal/generation-runs/:runId/fail`
9. internal `POST /internal/generation-runs/:runId/cancel`

Files:

1. `backend/src/routes/documents.ts`
2. `backend/src/routes/internal.ts`
3. `backend/src/controllers/documentsController.ts`

What the signer APIs currently do:

1. `getDocumentSignerObligations` returns output-aware signer and acknowledger rows,
2. `getSignatureFields` turns signer obligations into placeholder signature-field records.

Important limitation:

The current signature fields are signer-aware, but they still use placeholder coordinates and are not yet derived from a real rendered file.

## Step 12: The downstream signature and notary layer still uses the older model

Plain English:

There is already a signature and notarization path in the backend, but it has not yet been fully updated to the new generation-run and output-signer model.

Files:

1. `backend/src/controllers/documentsController.ts`
   - `requestSignatureUpload`
   - `finalizeSignatureUpload`
   - `submitNotarization`
   - `appendAcknowledgment`
   - `watermarkDocument`
2. `backend/src/services/documentService.ts`
3. `backend/src/services/storageService.ts`

Tables involved:

1. `signatures`
2. `notarization_requests`
3. `notarization_codes`
4. `documents`
5. `audit_events`

Current limitations:

1. signature upload currently links `signerId` to `document.owner_id`, not to `document_output_signers`,
2. notarization submit still keys off the older document status flow,
3. `appendAcknowledgment` is still a TODO stub,
4. `watermarkDocument` is still a TODO stub,
5. there is no manual "member reviewed the rendered PDFs and approved them for signing" checkpoint yet,
6. the current upload flow and generation flow can assign `documents.idn` before the new review-approval checkpoint exists,
7. normal document responses currently include `idn`, so visibility still needs to be tightened if the product rule is "hide IDN from the member until signed.",
8. the current model stores an ID string, but not yet the full IDN metadata bundle you described.

This is why the next roadmap focuses on final rendering plus signer-aware execution.

## Step 13: The frontend document workspace is not fully wired yet

Plain English:

The intake screen is real. The document workspace is still largely presentational.

Files:

1. `apps/web/src/app/app/documents/page.tsx`
2. `apps/web/src/app/app/documents/[id]/page.tsx`

Current state:

1. these pages still use mock document lifecycle data,
2. they are not yet showing live generation runs, blockers, signer obligations, or worker status,
3. they are not yet the operational UI for the new generation pipeline.

## How Audit Events Fit In

File:

1. `backend/src/services/auditService.ts`

Table:

1. `audit_events`

Plain English:

Audit events are the running breadcrumb trail for the workflow.

They record major actions such as:

1. document creation,
2. upload started and completed,
3. generation run created, blocked, started, completed, failed, or canceled,
4. signature capture started and completed,
5. notarization submission and code creation.

## Suggested Reading Order For A New Developer

If you want to understand the system without getting lost, read in this order:

1. `docs/pdf-generation-next-roadmap.md`
2. `apps/web/src/app/app/start/page.tsx`
3. `backend/src/routes/rules.ts`
4. `backend/src/controllers/memberFormRulesController.ts`
5. `backend/src/services/productFlowModeService.ts`
6. `backend/src/services/memberFormRulesService.ts`
7. `backend/src/services/memberInputAggregator.ts`
8. `backend/src/routes/documents.ts`
9. `backend/src/controllers/documentsController.ts`
10. `backend/src/services/documentService.ts`
11. `backend/src/services/documentGenerationService.ts`
12. `backend/src/services/documentGenerationRenderService.ts`
13. `backend/src/worker/index.ts`
14. `api/openapi.yaml`

## Final Plain-English Summary

The current system is no longer just a form collector.

It is now a real intake-to-generation foundation:

1. form selection is dynamic,
2. drafts are persisted,
3. submission is validated and locked,
4. parties, signers, and system values are resolved,
5. generation runs are created and tracked,
6. a worker can produce and store a generated artifact.

The next step is not to rebuild that foundation.

The next step is to finish the last mile on top of it.