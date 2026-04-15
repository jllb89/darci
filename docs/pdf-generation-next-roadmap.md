# PDF Generation Next Roadmap

Last updated: 2026-04-15

Related:
- docs/pdf-generation-prerequisites-roadmap.md
- docs/pdf-generation-phase-1-schema-and-api-contract.md
- docs/product-selection-to-generation-workflow-guide.md
- docs/member-form-persistence-and-generation-roadmap.md

## Why This Doc Exists

The older PDF planning docs were written to get the foundation in place.

Most of that foundation now exists in code.

This document is the simple planning view for what is already prepared and what still needs to be built next.

## Plain-English Status

Today the platform can do the hard setup work that a real generation pipeline needs.

A member can choose a product flow, choose a jurisdiction, load the correct form, save drafts to the database, submit intake, and lock that intake for generation.

After submission, the backend can resolve the correct outputs, the correct template version, the correct template artifact, the correct signer and acknowledger obligations, and the system values needed to render.

The backend can then create generation runs, mark them `queued` or `blocked`, put runnable work on a queue, have a worker pick it up, render a stored artifact, upload it, and link that artifact back to the document as a real `document_version`.

What is still missing is the last-mile production layer:

1. real final PDF rendering for platform-generated outputs,
2. the member review route, manual review approval step, and product-specific output visibility rules,
3. IDN assignment and signing-preparation timing aligned to member review approval,
4. signer-aware signature capture tied to `generationRunId` and `outputSignerId`,
5. the simple handoff steps that happen after signature and before notarization,
6. real acknowledgment append and watermark steps.

## Locked Product Decisions For The Next Pass

These decisions should be treated as fixed while implementing Phases A and B.

## 1) Generated output format is PDF only

All platform-generated legal documents exposed by the product should end as PDFs.

We should not expose DOCX outputs for member download or review.

This means the final rendering work is about producing correct PDFs, not editable legal-document files.

## 2) `/app/start` stays the intake route and `/app/review` becomes the next step

The intake and contract form flow stays at `/app/start`.

The next route should be `/app/review`.

That route should:

1. use the same main app layout,
2. reuse the process band concept,
3. show the process band at step `2` for Review,
4. render and display generated PDFs before signing.

## 3) Trust product outputs are not all member-visible

For the trust product, the platform should generate:

1. Trust Registration Amendment,
2. Trust Certification,
3. POA.

Member-facing review should show:

1. Trust Registration Amendment,
2. the generated POA.

Trust Certification should still be generated, but it is for internal platform use only and should not be shown as a member-facing review document.

## 4) Dynamic POA is a living platform document

Simple POA is not a one-time fixed product.

It is a Dynamic POA that the member can return to and edit over time.

That means:

1. a member should only have one active Dynamic POA in the platform,
2. later edits should update that same living POA workflow instead of creating unlimited editable POA records,
3. rerendering the latest PDF is expected behavior, not an exception,
4. version history can still exist, but the business object is still one editable Dynamic POA.

## 5) IDN is assigned after manual review approval

DARCi should assign the IDN, or Illuminotary code, when the member manually confirms that the rendered PDFs are correct and ready for signing.

That approval step is when DARCi prepares the document for signing and unlocks signature actions.

Until that approval happens, the document should not be treated as signing-ready.

The member-facing product should not show the IDN before the document has actually been signed.

At minimum, the IDN record should carry the IDN itself plus signer set, notary, date, document title, and page count.

Current implementation note:

The codebase already has a `documents.idn` field and related `registry_number` system value, but the timing, visibility, and final ID format still need to be aligned with this rule.

## What Is Already Prepared

## 1) Product and form selection foundation

Already ready:

1. product flow modes are database-driven,
2. allowed jurisdictions are filtered by launch availability,
3. member forms are assembled dynamically from jurisdiction-specific requirement data.

Why this matters:

The frontend no longer needs hardcoded PDF assumptions to know what the member should fill out.

## 2) Draft persistence and intake submission

Already ready:

1. a draft document is bootstrapped in the database,
2. autosave writes revisioned draft snapshots,
3. submission validates the form, stores canonical answers, and locks intake for generation.

Why this matters:

Generation now works from stable database state instead of browser-only state.

## 3) Template and extraction foundation

Already ready:

1. template bindings live in `template_binding_rules`,
2. template version pinning lives in `template_registry`,
3. renderable artifact lookup lives in `template_artifacts`,
4. document extraction payloads can explain coverage and missing mappings.

Why this matters:

The backend knows both which template should be used and where the concrete artifact lives.

## 4) Generation lifecycle foundation

Already ready:

1. generation runs support `queued`, `blocked`, `rendering`, `rendered`, `failed`, and `canceled`,
2. run detail and transition endpoints exist,
3. runs can link to `document_versions`,
4. blocker payloads explain why a run cannot render yet.

Why this matters:

The system now has a real unit of rendering instead of a loose "maybe generate later" state.

## 5) Party, signer, and system-value resolution

Already ready:

1. `document_parties` can be auto-synced from submitted canonical answers,
2. `document_output_signers` stores output-scoped signer and acknowledger snapshots,
3. `document_system_values` stores durable runtime values such as registry number, trust registration date, verification URL, and California acknowledgment template text,
4. trust certificate generation now has explicit binding support and an extraction alias path.

Why this matters:

The backend can answer "who signs what" and "what values are still missing" before rendering starts.

## 6) Worker and stored-artifact rendering

Already ready:

1. a BullMQ queue exists for generation runs,
2. the worker claims queued runs,
3. the worker renders a stored artifact from the pinned render context,
4. the worker uploads that artifact and creates a linked `document_version`,
5. lifecycle and audit events update as work completes or fails.

Why this matters:

This is the first end-to-end backend path that turns submitted intake into a traceable generated output.

## 7) Inspection and debugging APIs

Already ready:

1. `GET /documents/:id/generation-runs`
2. `GET /documents/:id/generation-runs/:runId`
3. `GET /documents/:id/signer-obligations`
4. `GET /documents/:id/signature-fields`
5. internal claim, recheck, complete, fail, and cancel endpoints for generation runs

Why this matters:

Operators and future UI surfaces can inspect generation state instead of guessing.

## What We Do Not Need To Rebuild

These parts are already in place and should be treated as foundation, not redone work:

1. product mode tables and product-mode resolution,
2. jurisdiction availability gating,
3. member-form contract assembly,
4. draft persistence and submit locking,
5. generation-run schema and lifecycle,
6. template artifact lookup,
7. signer and acknowledger snapshot resolution,
8. system-value persistence,
9. worker queue scaffolding,
10. run-detail and signer-inspection endpoints.

## What Is Still Missing

## 1) Final PDF rendering

Current state:

The worker renders a stored draft artifact from render context and template metadata.

Missing work:

1. replace the draft artifact renderer with a production PDF renderer,
2. support the current template inputs while always emitting PDF outputs,
3. store the correct final PDF mime types and metadata,
4. derive real page-aware field geometry from final rendered PDFs,
5. define rerender and versioning behavior for living documents such as Dynamic POA.

This is the biggest technical gap.

## 2) Product-aware review and visibility rules

Current state:

Generation runs know about outputs, but the member-facing review rules are not fully implemented.

Missing work:

1. create `/app/review` as the post-intake review route,
2. render generated PDFs in that route using the same app shell and the process band at step `2`,
3. for trust flows, show Trust Registration Amendment and POA to the member,
4. keep Trust Certification generated but internal-only,
5. define which outputs are reviewable, signable, and internal-only by product flow.

## 3) Manual review approval and IDN preparation

Current state:

The review route does not exist yet, there is no explicit "member approved the PDFs" audit checkpoint, and the current backend can assign `documents.idn` during generation preparation.

Missing work:

1. add a manual approval action in `/app/review`,
2. record a dedicated audit event when the member confirms the rendered PDFs are correct and ready to sign,
3. assign the IDN or Illuminotary code when that approval happens,
4. prepare signing and unlock signature actions only after that approval,
5. use the product-approved IDN format instead of the current placeholder format,
6. persist the minimum IDN metadata set for the approved document,
7. keep the IDN hidden from member-facing responses until the document has been signed.

## 4) Signer-aware signature execution

Current state:

The backend can list signer obligations and generate placeholder signature fields.

Missing work:

1. `POST /documents/:id/signatures/request` should require `generationRunId` and `outputSignerId`,
2. `POST /documents/:id/signatures/finalize` should link the uploaded signature to a signer obligation, not to the document owner,
3. signature records need the right data model to track output-scoped signers,
4. signature fields should come from the real rendered artifact, not from placeholder coordinates.

This is the biggest workflow gap.

## 5) Pre-notarization handoff

Current state:

The system can reach generated outputs, but the simple product steps after signature and before notarization are not yet formalized.

Missing work:

1. define the handoff from signed outputs into notarization-ready status,
2. preserve internal-only outputs during this handoff without exposing them in the member review surface,
3. make Dynamic POA rerender and review behavior consistent when the member edits it later.

## 6) Notary-stage and closeout integration

Current state:

Notary and watermark endpoints exist, but the new generation model is not fully wired into them.

Missing work:

1. populate deferred notary values into the generation and output flow,
2. implement real acknowledgment append behavior,
3. implement real watermark behavior,
4. decide how final notarized outputs become new document versions,
5. decide how final output state is represented once a run has been rendered and then fully executed.

## 7) Frontend wiring for generation and execution

Current state:

The start-page intake flow is real. The review route does not exist yet, and the document detail workspace is still mostly mock UI.

Missing work:

1. `/app/review` route with generated PDF display,
2. live generation-run list and detail UI where needed,
3. live blocker display,
4. signer-obligation display,
5. actions for cancel and recheck where appropriate,
6. real signature and notary workflow screens that use the new backend model.

## 8) Quality and operational hardening

Missing work:

1. more unit coverage for signer derivation and blocker rules,
2. more integration coverage around worker-driven render completion,
3. at least one full staging run using the worker and real queued generation runs,
4. final OpenAPI and documentation cleanup once the execution layer is settled.

## Recommended Next Phases

## Phase A: Final Rendering

Goal:

Replace the draft artifact renderer with a production PDF-only rendering pipeline and the first real review surface.

Deliverables:

1. final platform-generated outputs are always PDFs,
2. `/app/review` route exists and uses the same app layout as `/app/start`,
3. the process band is shown at step `2` in the review route,
4. member-facing review displays generated PDFs,
5. trust product review shows Trust Registration Amendment and POA only,
6. Trust Certification is still generated but remains internal-only,
7. Dynamic POA rerender and versioning rules are defined for ongoing edits.

Exit signal:

At least one CA flow and one OH flow can move from `/app/start` to `/app/review` and show the correct final member-facing PDFs.

## Phase B: Signer-Aware Signature Execution

Goal:

Move signature capture onto the new generation-run and output-signer model.

Deliverables:

1. signature request and finalize endpoints that require output-scoped signer context,
2. updated signature persistence,
3. real rendered-output signature field mapping from final PDFs,
4. signer-specific audit events,
5. signature execution rules aligned with member-visible outputs versus internal-only outputs,
6. signature execution remains blocked until the Phase C review-approval and IDN-preparation checkpoint is satisfied.

Exit signal:

A generated output can say exactly which signer signed which output and where that signature belongs.

## Phase C: Manual Review Approval And IDN Preparation

Goal:

Add the manual review checkpoint where the member confirms the rendered PDFs are correct, DARCi assigns the IDN, and signing becomes available.

Deliverables:

1. a manual approval action in `/app/review` for "these PDFs are correct and ready to sign",
2. audit logging for that approval step,
3. IDN assignment and signing preparation at the moment of approval,
4. the final approved IDN format, replacing the current placeholder-style value,
5. signature enablement only after review approval,
6. IDN hidden from member-facing surfaces until the document has actually been signed,
7. product-aware handling of internal-only versus member-visible outputs during approval,
8. Dynamic POA edit and rerender behavior confirmed for repeat visits.

Exit signal:

The system can move from rendered PDFs to member-approved signing-ready outputs, with an audit trail and IDN assignment that follow the product rules.

## Phase D: Notary Closeout And Finalization

Goal:

Finish the downstream workflow after signatures exist.

Deliverables:

1. real acknowledgment append,
2. real watermarking,
3. population of deferred notary and signing-stage values,
4. final notarized version handling.

Exit signal:

The system can move from generated output to fully closed-out notarized output without leaving the new data model.

## Phase E: UI And Operator Hardening

Goal:

Make the real backend flow visible and usable in the product.

Deliverables:

1. live document detail page,
2. run and blocker visibility,
3. signer visibility,
4. operational controls and monitoring.

Exit signal:

An operator or developer can follow one document from intake through generation and closeout entirely from the real UI and API surfaces.

## Recommended Reading Order

If you want the short planning view, read this file first.

If you want the technical walkthrough behind this roadmap, read `docs/product-selection-to-generation-workflow-guide.md` next.