# PDF Generation Next Roadmap

Last updated: 2026-04-17

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

The member can now move from `/app/start` into `/app/review`, see member-facing review outputs, and explicitly approve the review set.

The backend can already persist review approval metadata and assign review-time system values, but the approval-to-sign handoff is not complete yet.

What is still missing is the last-mile signing and closeout layer:

1. real final PDF rendering for platform-generated outputs and official post-approval rerenders,
2. the `/app/sign` route and the handoff from review approval into signing,
3. signer-aware signature capture tied to `generationRunId` and `outputSignerId`,
4. signature persistence and rendering for uploaded, typed, and drawn signatures,
5. the simple handoff steps that happen after signature and before notarization,
6. real acknowledgment append and watermark steps.

## Concise Roadmap To Member-Facing Legal Documents

This is the shortest execution order that gets us from debug review artifacts to real member-facing legal documents.

## 1) Stop sending debug artifacts to members

Goal:

The member review surface must stop using generation-run debug PDFs.

Work:

1. split the current renderer into two outputs: member-facing legal document output and internal debug output,
2. make `/app/review` use only member-facing legal document versions,
3. keep run metadata, placeholder dumps, signer-obligation tables, and template-source snapshots internal-only.

Exit signal:

No member-facing PDF includes debug sections like `Resolved Placeholders`, `Signer Obligations`, `Deferred Requirements`, or `Template Source Reference`.

## 2) Render the real legal document body for current launch outputs

Goal:

The PDF should read like the actual legal document, not like a diagnostic export.

Work:

1. render the actual template body for `trust_rrr` and `poa_document`,
2. substitute placeholders directly into the legal text,
3. convert enum and coded values into member-facing legal text,
4. handle unresolved pre-sign fields intentionally instead of printing raw tokens or debug placeholders.

Exit signal:

The trust amendment and POA outputs are readable legal documents with clean substituted text.

## 3) Add a preview watermark for pre-approval review PDFs

Goal:

Every member-facing review PDF shown before approval must be clearly marked as non-official.

Work:

1. apply a watermark to every page of pre-approval member-facing review PDFs,
2. use the exact text `Preview document only, not official`,
3. record `system.watermark_started` and `system.watermark_completed` for preview versions.

Exit signal:

All pre-approval member-facing PDFs are watermarked with `Preview document only, not official` and no official signing copy carries that preview watermark.

## 4) Split preview documents from official signing documents

Goal:

Review PDFs and signing-ready PDFs must become different document versions with different rules.

Work:

1. keep preview PDFs available during `/app/review`,
2. on review approval, assign the IDN and rerender the official signing set,
3. remove the preview watermark from the official signing set,
4. keep internal-only outputs out of the member-facing set,
5. persist preview version ids separately from approved signing version ids.

Exit signal:

Members review watermarked preview PDFs first, then signing proceeds on a clean official version set generated after approval.

## 5) Finish signature, notary, and finalization on top of official versions

Goal:

Once official signing versions exist, the rest of the workflow should operate on those versions only.

Work:

1. move signature capture to generation-run and output-signer scoped official versions,
2. append acknowledgment and deferred notary data to the official document chain,
3. finalize post-sign and post-notary document versions without reintroducing debug artifacts.

Exit signal:

The full member workflow runs on legal document versions only, from preview through signing and notarization.

## Locked Product Decisions For The Next Pass

These decisions should be treated as fixed while implementing Phases A and B.

## 1) Generated output format is PDF only

All platform-generated legal documents exposed by the product should end as PDFs.

We should not expose DOCX outputs for member download or review.

This means the final rendering work is about producing correct PDFs, not editable legal-document files.

## 2) `/app/start`, `/app/review`, and `/app/sign` are the core member flow

The intake and contract form flow stays at `/app/start`.

The next route is `/app/review`.

After the member approves the PDFs in review, the next route should be `/app/sign`.

`/app/review` should:

1. use the same main app layout,
2. reuse the process band concept,
3. show the process band at step `2` for Review,
4. render and display generated PDFs before signing.

`/app/sign` should:

1. use the same layout pattern as `/app/verify`,
2. reuse the process band concept,
3. show the process band at step `3` for Sign,
4. load the official signing set produced after review approval,
5. let the member complete required signatures before confirmation.

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

The codebase now has review approval, review metadata persistence, and review-time IDN assignment, but the final ID format, visibility rules, and official post-approval rerender still need to be aligned with this rule.

## 6) Signature capture supports upload, typed, and drawn input

For this pass the member must be able to:

1. upload a signature image in `jpg` or `png`,
2. add a typed name or initials,
3. draw a signature in the browser.

The data model and APIs should preserve which method was used for each required signature and the rendered asset or text value needed to place it on the final output.

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

## 8) Review and approval foundation

Already ready:

1. `/app/review` exists in the member app shell,
2. member-facing review can show reviewable outputs and hide internal-only outputs,
3. review approval persists approval metadata and unlocks the next stage,
4. intake drafts can be resaved from review,
5. the OpenAPI contract now covers review state, review approval, and review draft-resave endpoints.

Why this matters:

The signature pass can build on a real approval checkpoint instead of inventing one.

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
10. run-detail and signer-inspection endpoints,
11. member review route foundation,
12. review approval and review-state API foundation.

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

`/app/review` exists and can show member-facing outputs, but the approval-to-sign handoff rules are not finished.

Missing work:

1. keep `/app/review` focused on preview and approval only,
2. keep trust review limited to Trust Registration Amendment and POA while preserving Trust Certification as internal-only,
3. define which outputs are reviewable, signable, and internal-only by product flow,
4. hand the member off from `/app/review` into `/app/sign` on approval,
5. keep output visibility rules consistent across review, sign, and notary stages.

## 3) Manual review approval and IDN preparation

Current state:

`/app/review` and review approval exist, and approval can already persist review metadata and assign review-time values.

Missing work:

1. rerender the official signing set immediately after approval using now-resolved values such as dates, DARCi number, trust number, and other review-time system values,
2. persist approved signing version ids separately from preview version ids,
3. route the member into `/app/sign` using the approved signing set, not the preview set,
4. use the product-approved IDN format instead of the current placeholder format,
5. persist the minimum IDN metadata set for the approved document,
6. keep the IDN hidden from member-facing responses until the document has been signed.

## 4) Signer-aware signature execution

Current state:

The backend can list signer obligations and generate placeholder signature fields, but there is no real signing route or output-scoped signature execution yet.

Missing work:

1. create `/app/sign` as the post-review signing route using the same layout pattern as `/app/verify`,
2. replace the review-document cards with one signature card per required signature,
3. show which document each required signature belongs to,
4. `POST /documents/:id/signatures/request` should require `generationRunId` and `outputSignerId`,
5. `POST /documents/:id/signatures/finalize` should link the captured signature to a signer obligation, not to the document owner,
6. signature records need the right data model to track output-scoped signers and signature method,
7. accept uploaded signature images in `jpg` or `png`, typed name or initials, and drawn signatures,
8. signature fields should come from the real rendered artifact, not from placeholder coordinates,
9. keep the final Confirm action disabled until every required signature is complete.

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

The start-page intake flow and `/app/review` are real. The signing route and the downstream execution surfaces are still missing.

Missing work:

1. `/app/sign` route with the official signing set,
2. a `Sign documents` column with one card per required signature,
3. signature-mode UI for upload, typed, and drawn input,
4. a final Confirm action that unlocks only when all required signatures are complete,
5. live generation-run list and detail UI where needed,
6. live blocker display,
7. real notary workflow screens that use the new backend model.

## 8) Quality and operational hardening

Missing work:

1. more unit coverage for signer derivation and blocker rules,
2. more integration coverage around worker-driven render completion,
3. at least one full staging run using the worker and real queued generation runs,
4. final OpenAPI and documentation cleanup once signing and notarization execution are settled.

## Recommended Next Phases

## Phase A: Final Rendering

Goal:

Replace the draft artifact renderer with a production PDF-only rendering pipeline and the first real review surface.

Deliverables:

1. final platform-generated outputs are always PDFs,
2. member-facing review no longer uses debug artifacts,
3. `/app/review` route exists and uses the same app layout as `/app/start`,
4. the process band is shown at step `2` in the review route,
5. member-facing review displays legal-document PDFs,
6. every pre-approval member-facing PDF includes the watermark `Preview document only, not official`,
7. trust product review shows Trust Registration Amendment and POA only,
8. Trust Certification is still generated but remains internal-only,
9. Dynamic POA rerender and versioning rules are defined for ongoing edits.

Exit signal:

At least one CA flow and one OH flow can move from `/app/start` to `/app/review` and show watermarked member-facing legal PDFs with no debug sections.

## Phase B: Signer-Aware Signature Execution

Goal:

Move signature capture onto the approved signing set and the new generation-run plus output-signer model.

Deliverables:

1. `/app/sign` route exists and uses the same layout pattern as `/app/verify`,
2. the process band is shown at step `3` in the signing route,
3. the route loads the official signing set produced after review approval,
4. the `Sign documents` column shows one card per required signature instead of document review cards,
5. each signature card identifies which document the signature belongs to,
6. signature request and finalize endpoints require output-scoped signer context,
7. signature persistence supports uploaded `jpg` or `png`, typed name or initials, and drawn signatures,
8. the data model records which signature method was used for each signer obligation,
9. real rendered-output signature field mapping comes from final PDFs,
10. signer-specific audit events exist,
11. the final Confirm action stays disabled until all required signatures are complete.

Exit signal:

A member can approve review, land on `/app/sign`, complete each required signature with a supported input mode, and confirm the signing step on the official signing set.

## Phase C: Official Signing Set And Approval Handoff

Goal:

Finish the approval-to-sign handoff so review approval produces the correct official signing set and routes the member into signing.

Deliverables:

1. keep review approval as the checkpoint for "these PDFs are correct and ready to sign",
2. rerender the official signing set after approval,
3. populate the newly resolved values needed by the signing set, including dates, DARCi number, trust number, and related review-time values,
4. remove the preview watermark from the official signing set,
5. persist approved signing version ids separately from preview version ids,
6. use the final approved IDN format instead of the current placeholder-style value,
7. keep signature enablement blocked until review approval has completed,
8. IDN remains hidden from member-facing surfaces until the document has actually been signed,
9. product-aware handling of internal-only versus member-visible outputs during approval and signing,
10. Dynamic POA edit and rerender behavior confirmed for repeat visits.

Exit signal:

The system can move from member-approved review PDFs into `/app/sign` with a clean official signing set, resolved review-time values, and the correct approval metadata.

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