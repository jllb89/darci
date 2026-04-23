# Product Selection To Generation Workflow Guide

Last updated: 2026-04-23

Related:

- docs/pdf-generation-next-roadmap.md  
- docs/pdf-generation-prerequisites-roadmap.md  
- docs/pdf-generation-phase-1-schema-and-api-contract.md  
- docs/member-form-persistence-and-generation-roadmap.md  
- docs/last-mile-roadmap.md

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
8. the backend creates preview generation runs for the visible outputs,  
9. a worker renders member-facing preview PDFs, uploads them, and creates linked document versions,  
10. `/app/review` loads the visible review outputs and lets the member approve them,  
11. review approval assigns the final-format IDN, records review metadata, and creates the official signing runs,  
12. `/app/sign` loads the official signing set and signer-aware signature tasks,  
13. upload, typed, drawn, and saved-signature capture stamp the latest official PDF and create new signed document versions,  
14. signing confirmation persists `signature_execution` for the approved signing set,  
15. `submit-notarization` now hands the document into the illuminotarization workflow, code, and notification layer,  
    —  
16. meeting, confirmation, check-in, identity verification, proximity evaluation, artifacts, and no-show/cancel flows are mounted,  
17. acknowledgment append and watermark finalization now mutate real PDF bytes, create derived document versions, hash transformed final bytes, record ledger anchor attempts, and complete the workflow state,  
18. `GET /documents/:id/timeline` now serves persisted document, workflow, and finalization activity instead of a synthetic placeholder response,  
19. `GET /verify/{idn}` now serves the persisted public verification result using anchored-proof semantics and logs verification checks,  
20. the surrounding platform now includes live Phase 1 through Phase 3 foundations for multi-role identity, billing/entitlements, invites, and notification outbox state,
21. invite issuance, resend, revoke, public validate, and public claim runtime are now mounted end to end,
22. Track 6 hardening now enforces meeting-artifact retention lifecycle rules and tighter storage-policy coverage, with a service-role retention endpoint for operational cleanup.

The main things still missing are frontend cutover to the real workspace APIs, payment execution on top of the Phase 2 billing schema, broader generic workspace UI adoption, a dedicated normalized IDN record, and replacement of the current stubbed ledger provider with a real external integration.

## The Most Important Files

If you only want the shortest reading list, start here:

1. `apps/web/src/app/app/start/page.tsx`  
2. `apps/web/src/app/app/review/page.tsx`  
3. `apps/web/src/app/app/sign/page.tsx`  
4. `backend/src/routes/rules.ts`  
5. `backend/src/controllers/memberFormRulesController.ts`  
6. `backend/src/routes/documents.ts`  
7. `backend/src/controllers/documentsController.ts`  
8. `backend/src/services/documentService.ts`  
9. `backend/src/services/documentGenerationService.ts`  
10. `backend/src/services/documentGenerationRenderService.ts`  
11. `backend/src/services/documentVisibilityService.ts`  
12. `backend/src/worker/index.ts`  
13. `backend/src/services/userRoleService.ts`  
14. `backend/src/middleware/auth.ts`  
15. `backend/src/services/illuminotarizationWorkflowService.ts`  
16. `backend/src/controllers/notaryController.ts`  
17. `backend/src/services/documentFinalizationService.ts`  
18. `backend/src/controllers/verifyController.ts`  
19. `backend/src/routes/users.ts`  
20. `backend/src/routes/admin.ts`  
21. `backend/src/routes/notary.ts`  
22. `backend/src/routes/verify.ts`  
23. `backend/src/routes/invites.ts`  
24. `backend/src/controllers/inviteController.ts`  
25. `backend/src/services/documentInviteService.ts`  
26. `backend/src/services/inviteClaimService.ts`  
27. `backend/src/services/meetingService.ts`  
28. `backend/src/controllers/meetingInternalController.ts`  
29. `backend/src/routes/internal.ts`  
30. `api/openapi.yaml`

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

These tables are part of the current downstream execution flow and still matter today:

1. `signatures`  
2. `notarization_requests`  
3. `notarization_codes`

`signatures` is now part of the real member signing path and stores output-scoped signature capture records.

`notarization_requests` and `notarization_codes` still sit on the older downstream closeout model and are not yet fully normalized around the new generation-run and output-signer execution chain.

## Last-mile phase tables now in scope

These Phase 1 through Phase 6 tables now exist around the same workflow and are part of the real system state clients and operators depend on.

### Phase 1: Identity, roles, and verification

1. `user_roles`  
   - additive capability rows for `member`, `pro`, `notary`, and `admin`  
2. `user_role_verifications`  
   - verification status per assigned role  
3. `pro_profiles`  
   - Pro-specific business and review metadata  
4. `user_role_history`  
   - role-assignment and active-role history  
5. `role_verification_artifacts`  
   - evidence rows for role review and approval

### Phase 2: Billing, pricing, and entitlements

1. `billing_accounts`  
   - owner and payer billing anchor per account  
2. `billing_customers`  
   - Stripe customer linkage  
3. `billing_catalog_products`  
   - canonical purchasable product families  
4. `billing_catalog_prices`  
   - concrete price rows seeded from the payment spec  
5. `billing_orders`  
   - one-time and delegated purchase anchors  
6. `billing_order_items`  
   - per-line item purchase detail  
7. `payment_transactions`  
   - provider-side payment object tracking  
8. `billing_subscriptions`  
   - recurring billing anchors  
9. `billing_subscription_items`  
   - active subscription line items  
10. `billing_entitlements`  
    - product benefits granted separately from raw payments  
11. `pro_credit_wallets`  
    - Pro prepaid-credit balance anchors  
12. `pro_credit_lots`  
    - expiring credit inventory  
13. `pro_credit_transactions`  
    - append-only credit ledger  
14. `pro_credit_reservations`  
    - temporary credit holds before commit or release  
15. `billing_payment_requests`  
    - Pro-to-client payment delegation requests  
16. `stripe_webhook_events`  
    - webhook idempotency and processing state

### Phase 3: Invitations, external signers, and notifications

1. `document_access_invites`  
   - invite lifecycle anchor per document or signer target  
2. `invite_recipients`  
   - recipient addressing separate from invite identity  
3. `invite_tokens`  
   - hashed token lifecycle rows  
4. `invite_claims`  
   - resolution of invite access into real DARCi accounts  
5. `notification_templates`  
   - seeded notification catalog, now at 36 templates on staging  
6. `notification_jobs`  
   - outbox and scheduling layer  
7. `notification_deliveries`  
   - per-recipient delivery ledger  
8. `notification_preferences`  
   - channel and scope preferences per user  
9. `outbound_message_events`  
   - provider and system delivery event history

### Phase 4: Illuminotarization workflow, code, and review

1. `illuminotarization_workflows`  
   - bundle-level workflow anchor beyond the legacy request row  
2. `illuminotarization_workflow_documents`  
   - workflow-to-document linkage  
3. `workflow_assignments`  
   - member and notary assignment ledger  
4. `workflow_status_history`  
   - append-only workflow state transitions  
5. `code_deliveries`  
   - code send/resend tracking  
6. `illuminotary_review_decisions`  
   - approve, reject, and changes-requested decisions  
7. `access_code_attempts`  
   - code-resolution attempt log

### Phase 5: Meeting, evidence, and same-place validation

1. `meeting_participants`  
   - explicit member and notary participants per meeting  
2. `meeting_checkins`  
   - participant check-in/out timeline  
3. `geolocation_samples`  
   - captured location evidence with accuracy and timestamps  
4. `proximity_evaluations`  
   - same-place distance and threshold results  
5. `identity_verification_events`  
   - identity-verification outcomes and metadata  
6. `illuminotary_assets`  
   - seal/signature asset linkage for execution  
7. `meeting_artifacts`  
   - meeting evidence objects tied back to participants and events

### Phase 6: Finalization, hash, ledger, and public verification

1. `document_execution_runs`  
   - explicit acknowledgment-append and watermark execution chain  
2. `document_hash_records`  
   - hash-generation results for final artifacts  
3. `ledger_entries`  
   - distributed-ledger linkage remains part of the live closeout chain  
4. `ledger_anchor_attempts`  
   - ledger retry and proof attempts  
5. `public_verification_checks`  
   - public authenticity-request log  
6. `finalization_status_history`  
   - immutable chain of finalization status changes

## Key Migration Files

If you want the schema story in chronological order, these are the most useful migrations to read:

1. `supabase/migrations/20260413110000_add_product_flow_mode_schema.sql`  
2. `supabase/migrations/20260414150000_add_template_binding_rules.sql`  
3. `supabase/migrations/20260414180000_add_document_intake_drafts.sql`  
4. `supabase/migrations/20260414193000_add_template_registry_and_generation_runs.sql`  
5. `supabase/migrations/20260414210000_limit_jurisdiction_product_availability_to_ca_oh.sql`  
6. `supabase/migrations/20260414234500_add_generation_run_phase1_lifecycle.sql`  
7. `supabase/migrations/20260415010000_add_generation_phase2_signers_and_system_values.sql`  
8. `supabase/migrations/20260415133000_add_pending_review_document_status.sql`  
9. `supabase/migrations/20260417113000_add_signature_execution_phase_b.sql`  
10. `supabase/migrations/20260417134500_allow_review_and_signature_execution_system_value_sources.sql`  
11. `supabase/migrations/20260419190000_add_phase1_multi_role_identity.sql`  
12. `supabase/migrations/20260419220000_add_phase2_billing_and_entitlements.sql`  
13. `supabase/migrations/20260419233000_add_phase3_invites_and_notifications.sql`  
14. `supabase/migrations/20260419235500_seed_phase3_template_wave_2.sql`  
15. `supabase/migrations/20260420003000_seed_phase3_template_wave_3_client_pay.sql`  
16. `supabase/migrations/20260420013000_add_phase4_illuminotarization_workflows.sql`  
17. `supabase/migrations/20260420113000_add_phase5_meeting_evidence.sql`  
18. `supabase/migrations/20260420160000_add_phase6_document_finalization.sql`  
19. `supabase/migrations/20260421110000_add_phase6_jurisdiction_finalization_config.sql`  
20. `supabase/migrations/20260423103000_add_track6_phase7_hardening.sql`

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

The API path is real, and the member review and signing routes now depend on these runs. The generic document-workspace pages are still mostly mock UI and are not yet fully wired to the generation-run detail surfaces.

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
2. `ensureDocumentSystemValues` still uses that field as the source for `registry_number`,  
3. review approval now assigns a final 12-character uppercase alphanumeric IDN if the current value is empty or not already in final format,  
4. review approval also persists `review_approval`, `registry_number`, `verification_url`, and `idn_record` in `document_system_values`,  
5. `idn_record` now carries signer names, approval date, latest approved version ids, review source, title, and verification metadata for the approved document set,  
6. member-facing document responses hide the IDN until the document reaches `pending_notary`, `completed`, or `notarized`, while admin and service-role can still see it earlier,  
7. there is still no separate first-class IDN table, so the richer IDN metadata currently lives in system values rather than its own normalized record.

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
4. it renders a member-facing PDF for either preview review output or the official post-approval signing set,  
5. it records page-aware signature placements back onto `document_output_signers`,  
6. it uploads that PDF to Supabase Storage,  
7. it creates a new `document_versions` row,  
8. for preview output it records watermark audit events and moves a draft document to `pending_review`,  
9. it updates the run to `rendered`, or to `failed` if something breaks.

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

The current renderer now produces the real member-facing review and signing PDFs for the launch outputs, and it also handles signature stamping on official signing versions.

File:

1. `backend/src/services/documentGenerationRenderService.ts`

Current behavior:

1. reads the pinned render context and template source,  
2. renders launch templates into branded legal-document PDFs using `pdfkit`,  
3. applies the preview watermark `Preview document only, not official` when the document is not yet in the official signing stage,  
4. captures page-aware signature and date field geometry while rendering and stores it on signer metadata,  
5. rerenders official post-approval signing PDFs without the preview watermark,  
6. stamps typed, drawn, uploaded, and saved-signature captures onto the latest official PDF and creates a new signed `document_versions` row.

What it does not do yet:

1. own the downstream workflow, meeting-evidence, and finalization chain directly, because that logic now lives in the notary and document-finalization services after signing,  
2. support every possible external template/render engine beyond the current launch path,  
3. replace the separate invite, billing, and verification domains that now surround the renderer but still have their own service boundaries.

## Step 11: Review, signing, and inspection APIs expose the new model

Plain English:

Once runs exist, the backend can explain what happened and who is supposed to sign.

Relevant routes:

1. `GET /documents/:id/review`  
2. `POST /documents/:id/review-approval`  
3. `GET /documents/:id/timeline`  
4. `GET /documents/:id/generation-runs`  
5. `GET /documents/:id/generation-runs/:runId`  
6. `GET /documents/:id/signer-obligations`  
7. `GET /documents/:id/signature-fields`  
8. `GET /documents/:id/signing`  
9. `GET /documents/:id/signatures/saved`  
10. `POST /documents/:id/signatures/request`  
11. `POST /documents/:id/signatures/finalize`  
12. `POST /documents/:id/signatures`  
13. `POST /documents/:id/sign`  
14. internal `POST /internal/generation-runs/claim-next`  
15. internal `POST /internal/generation-runs/:runId/recheck`  
16. internal `POST /internal/generation-runs/:runId/complete`  
17. internal `POST /internal/generation-runs/:runId/fail`  
18. internal `POST /internal/generation-runs/:runId/cancel`

Files:

1. `backend/src/routes/documents.ts`  
2. `backend/src/routes/internal.ts`  
3. `backend/src/controllers/documentsController.ts`

What these APIs currently do:

1. `getDocumentReview` returns member-visible preview PDFs, pending outputs, `missingOutputKeys`, and approval state, and can inline-process queued review outputs in local/debug scenarios,  
2. `approveDocumentReview` persists the review checkpoint, assigns the final-format IDN, records `idn_record`, transitions the document into `pending_signature`, and attempts the official signing generation handoff for the approved outputs,  
3. `getDocumentTimeline` returns a persisted timeline assembled from document timestamps, workflow status history, document system values, active notarization request state, and finalization status history,  
4. `getDocumentSignerObligations` returns output-aware signer and acknowledger rows,  
5. `getDocumentSigning` returns the official signing outputs, signer-aware signature tasks, group satisfaction state, pending official outputs, and completion state, and can inline-process queued signing outputs in local/debug scenarios,  
6. `listSavedSignatures` returns previously captured member signatures that can be reused on the current obligation,  
7. `getSignatureFields` uses real stored signature placements when the rendered PDF has already been mapped and falls back to default rectangles only when placement metadata is not available yet.

Important visibility note:

Member review and signing surfaces are filtered through `documentVisibilityService`, so internal-only outputs such as `trust_certificate` stay hidden from members while remaining visible to admin and service-role.

## Step 12: The member signing layer now hands off into the mounted notary closeout stack

Plain English:

The member signing path is now wired to the generation-run and output-signer model, and that path now hands off into a mounted notary closeout stack instead of stopping at a stubbed downstream boundary.

Files:

1. `backend/src/controllers/documentsController.ts`  
   - `listSavedSignatures`  
   - `getDocumentSigning`  
   - `captureSignature`  
   - `requestSignatureUpload`  
   - `finalizeSignatureUpload`  
   - `signDocument`  
   - `submitNotarization`  
   - `appendAcknowledgment`  
   - `watermarkDocument`  
2. `backend/src/services/documentService.ts`  
3. `backend/src/services/documentGenerationRenderService.ts`  
4. `backend/src/services/storageService.ts`  
5. `backend/src/services/documentVisibilityService.ts`

Tables involved:

1. `signatures`  
2. `document_output_signers`  
3. `document_generation_runs`  
4. `document_versions`  
5. `document_system_values`  
6. `notarization_requests`  
7. `notarization_codes`  
8. `documents`  
9. `audit_events`

Current state:

1. upload request and finalize now require `generationRunId` and `outputSignerId`,  
2. typed, drawn, and saved-signature capture also require `generationRunId` and `outputSignerId`,  
3. each successful capture stamps the latest official PDF for that run and creates a new signed `document_versions` row,  
4. `signDocument` persists `signature_execution` with completed generation-run ids, signer ids, and signature ids,  
5. `submitNotarization` now dual-writes the compatibility request/code rows plus the Phase 4 workflow, assignment, delivery, and status-history model,  
6. notary code resolution, resend, regenerate, and review-decision flows now append workflow and delivery state instead of only touching the legacy request row,  
7. `appendAcknowledgment` now appends a real acknowledgment page to the PDF bytes, uploads the transformed artifact, and records the derived acknowledgment version plus execution state,  
8. `watermarkDocument` now applies the digital-original watermark to the PDF bytes, hashes the transformed final artifact, records the ledger entry and anchor-attempt state, and closes the finalization flow,  
9. `GET /verify/{idn}` now returns persisted verification material from the Phase 6 closeout chain using completed-hash plus anchored-ledger proof semantics rather than row presence alone,  
10. Phase 3 notification jobs, deliveries, and message events are now enqueued from mounted review, signing, notarization, and code-delivery paths.

Remaining limitations:

1. the invite API runtime is now live, but the broader frontend workspace cutover for issuer and signer invite surfaces still remains future work,  
2. Stripe-backed billing execution and client-payment request runtime still remain future work even though the Phase 2 schema is live,  
3. the richer IDN metadata still lives in `document_system_values` rather than a dedicated normalized IDN record,  
4. the generic document-workspace UI still lags the operational review, signing, invite, meeting, and finalization flow,  
5. the current ledger anchoring path still defaults to a stubbed provider contract, so replacing that with a real external ledger integration remains deferred provider-backed backend work rather than a missing Phase 6 runtime step.

This is why the next roadmap now focuses on frontend cutover plus the provider-backed billing and ledger work rather than inventing new backend workflow primitives from scratch.

## Step 13: The downstream workflow now continues through workflow, meeting, and finalization APIs

Plain English:

After the member reaches a signing-ready state, the mounted downstream stack now carries the document through workflow assignment, code access, meeting execution, closeout, and public verification.

Relevant routes:

1. `POST /documents/:id/submit-notarization`  
2. `POST /notary/code/resolve`  
3. `POST /notary/code/resend`  
4. `POST /notary/code/regenerate`  
5. `POST /notary/requests/:id/review-decision`  
6. `POST /notary/requests/:id/meeting/propose`  
7. `POST /notary/requests/:id/meeting/confirm`  
8. `POST /notary/requests/:id/meeting/reschedule`  
9. `POST /notary/requests/:id/meeting/cancel`  
10. `POST /notary/requests/:id/meeting/no-show`  
11. `POST /notary/requests/:id/meeting/check-in`  
12. `POST /notary/requests/:id/meeting/identity-verification`  
13. `POST /notary/requests/:id/meeting/proximity-evaluation`  
14. `POST /notary/requests/:id/meeting/artifacts`  
15. `POST /documents/:id/append-acknowledgment`  
16. `POST /documents/:id/watermark`  
17. `GET /verify/:idn`

Files:

1. `backend/src/routes/documents.ts`  
2. `backend/src/routes/notary.ts`  
3. `backend/src/routes/verify.ts`  
4. `backend/src/controllers/documentsController.ts`  
5. `backend/src/controllers/notaryController.ts`  
6. `backend/src/controllers/verifyController.ts`  
7. `backend/src/services/illuminotarizationWorkflowService.ts`  
8. `backend/src/services/documentFinalizationService.ts`

What happens:

1. submit-notarization now creates or updates both the compatibility request/code rows and the Phase 4 workflow layer,  
2. code resolution and review-decision flows now write assignment, delivery, access-attempt, and workflow-status records,  
3. meeting lifecycle routes now persist explicit participants, check-ins, geolocation samples, proximity evaluations, identity-verification events, and meeting artifacts,  
4. acknowledgment append now appends a real acknowledgment page to the PDF, uploads the transformed artifact, and creates the derived version-chain step before final watermarking,  
5. watermark finalization now applies the digital-original watermark to the PDF bytes, records the transformed-artifact hash, persists explicit ledger anchor-attempt state, and closes the workflow/request/document state,  
6. the public verify route now reads from the persisted hash-plus-ledger proof model and only returns `verified` when the completed hash, anchored ledger entry, and anchor-attempt evidence agree.

Validation note:

1. the Phase 4 live staging smoke covers upload finalize, review approval, submit-notarization, and notary code resolution,  
2. the Phase 5 live staging smoke covers happy-path, cancellation, and no-show meeting flows plus the evidence side effects,  
3. focused Phase 6 unit and integration coverage verifies real PDF mutation and anchored-proof verification semantics,  
4. focused Track 5 and Track 6 coverage now verifies invite lifecycle routes plus service-role retention enforcement,  
5. the Phase 6 live staging smoke covers acknowledgment append, watermark finalization, hash persistence, ledger anchoring, and public verification,  
6. the latest 2026-04-23 staging rerun passed Phase 4, Phase 5, and Phase 6 smoke validation again after remote migration parity was restored.

## Step 14: Cross-cutting last-mile foundations now surround the workflow

Plain English:

The intake-to-finalization flow now sits inside a broader Phase 1 through Phase 3 platform foundation, even where the end-user UI or provider integration is not fully mounted yet.

Relevant files:

1. `backend/src/middleware/auth.ts`  
2. `backend/src/services/userRoleService.ts`  
3. `backend/src/routes/users.ts`  
4. `backend/src/routes/admin.ts`  
5. `api/openapi.yaml`

What exists now:

1. Phase 1 active-role resolution is live in middleware, `GET /users/me`, self-service active-role switching, and admin role-management APIs,  
2. Phase 2 billing accounts, billing catalog, entitlements, Pro credit wallets, payment-request schema, and webhook-idempotency tables are live on staging,  
3. Phase 3 invite, token, claim, notification, delivery, preference, and template tables are live on staging,  
4. the seeded Phase 3 template catalog now covers 36 notification templates, including review, signing, notarization, meeting, verification, and client-payment scenarios,  
5. mounted review, signing, submit-notarization, invite issuance, invite resend, and code-delivery paths now enqueue Phase 3 notification jobs and delivery/event records,  
6. authenticated invite list, create, resend, and revoke APIs plus public validate and claim APIs are now mounted end to end on top of the Phase 3 schema,  
7. Track 6 hardening now adds retention enforcement for expired meeting artifacts and tighter storage policies for `meeting-evidence` and `illuminotary-assets`,  
8. Stripe execution and client-payment settlement still remain future work on top of the already-landed schema.

## 2026-04-23 Operational Update

Plain English:

The last backend-first delivery pass closed the remaining Track 5 and Track 6 gaps, reconciled remote migration state, and reran live smoke validation.

What changed:

1. Track 5 invite services, controllers, routes, tests, OpenAPI, and workflow docs were completed and are now the live backend path for issuer-side invite management and recipient claim flows,  
2. Track 6 hardening landed through `supabase/migrations/20260423103000_add_track6_phase7_hardening.sql`, plus the service-role endpoint `POST /internal/meeting-artifacts/enforce-retention`,  
3. the latest migration was committed and pushed separately, and remote migration state was reconciled so staging now matches local migration history, including `20260421110000_add_phase6_jurisdiction_finalization_config.sql` and `20260423103000_add_track6_phase7_hardening.sql`,  
4. the staging smoke checklist for Phase 4, Phase 5, and Phase 6 was rerun successfully after migration sync,  
5. focused API sanity coverage also passed for verification, meeting completion, invite lifecycle, and retention enforcement slices.

What this means now:

1. the backend-first roadmap is complete through Track 6,  
2. the next practical delivery stream is frontend cutover to the real workspace APIs already documented in `apps/web/docs/workspace-api-usage.md`,  
3. the remaining backend work is mostly deferred provider-backed work, especially Stripe payment execution and real ledger-provider integration.

## Step 15: The member workflow UI is partly real and partly mock

Plain English:

The intake, review, and signing routes are real. The generic document-workspace pages are still largely presentational.

Files:

1. `apps/web/src/app/app/documents/page.tsx`  
2. `apps/web/src/app/app/documents/[id]/page.tsx`  
3. `apps/web/src/app/app/start/page.tsx`  
4. `apps/web/src/app/app/review/page.tsx`  
5. `apps/web/src/app/app/sign/page.tsx`

Current state:

1. `/app/start` is the real intake bootstrap, resume, autosave, and submit flow,  
2. `/app/review` is the real review workspace for member-visible preview PDFs and review approval,  
3. `/app/sign` is the real signing workspace for official signing PDFs and output-scoped signature capture,  
4. the generic `/app/documents` pages still use mock document lifecycle data,  
5. those generic pages are not yet the operational UI for generation runs, blockers, or notary closeout.

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
4. document ready for review,  
5. review approved, IDN assigned, and signing prepared,  
6. signature capture started and completed,  
7. signature applied to the official PDF and signing confirmed,  
8. preview watermark audit events,  
9. notarization submission and code creation,  
10. workflow assignment, code resolution, and review decisions,  
11. meeting proposal, confirmation, reschedule, cancellation, no-show, check-in, identity verification, and proximity evaluation,  
12. acknowledgment append, watermark completion, hash recording, ledger anchoring, and public verification result return,  
13. notification-triggering milestones across review, signing, notarization, meeting, and verification flows.

## Suggested Reading Order For A New Developer

If you want to understand the system without getting lost, read in this order:

1. `docs/pdf-generation-next-roadmap.md`  
2. `apps/web/src/app/app/start/page.tsx`  
3. `apps/web/src/app/app/review/page.tsx`  
4. `apps/web/src/app/app/sign/page.tsx`  
5. `backend/src/routes/rules.ts`  
6. `backend/src/controllers/memberFormRulesController.ts`  
7. `backend/src/services/productFlowModeService.ts`  
8. `backend/src/services/memberFormRulesService.ts`  
9. `backend/src/services/memberInputAggregator.ts`  
10. `backend/src/routes/documents.ts`  
11. `backend/src/controllers/documentsController.ts`  
12. `backend/src/services/documentService.ts`  
13. `backend/src/services/documentGenerationService.ts`  
14. `backend/src/services/documentGenerationRenderService.ts`  
15. `backend/src/services/userRoleService.ts`  
16. `backend/src/middleware/auth.ts`  
17. `backend/src/services/illuminotarizationWorkflowService.ts`  
18. `backend/src/controllers/notaryController.ts`  
19. `backend/src/services/documentFinalizationService.ts`  
20. `backend/src/controllers/verifyController.ts`  
21. `backend/src/worker/index.ts`  
22. `api/openapi.yaml`

## Final Plain-English Summary

The current system is no longer just a form collector.

It is now a real intake-to-verification foundation:

1. form selection is dynamic,  
2. drafts are persisted,  
3. submission is validated and locked,  
4. parties, signers, and system values are resolved,  
5. preview generation runs are created and rendered into member-facing PDFs,  
6. the member can review and approve the visible output set,  
7. approval assigns the final IDN and prepares the official signing set,  
8. signature capture stamps the official PDFs and signing confirmation records execution state,  
9. submit-notarization now opens the real illuminotarization workflow and code-access layer,  
10. meeting execution and evidence capture now persist real same-place and identity-verification state,  
11. finalization now appends acknowledgment, mutates and watermarks the final artifact, records the transformed-artifact hash and ledger proof, and serves public verification using anchored-proof semantics,  
12. multi-role identity, billing, invite, and notification foundations now surround that workflow as live Phase 1 through Phase 3 platform state.

The next step is not to rebuild that foundation.

The next step is to harden the remaining invite, billing, generic UI, naming, storage, and policy gaps on top of a downstream chain that is already mounted and staging-validated through Phase 6\.  
