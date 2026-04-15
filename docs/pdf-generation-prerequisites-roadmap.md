# PDF Generation Prerequisites Roadmap

Last updated: 2026-04-15

Related:
- docs/pdf-generation-next-roadmap.md
- docs/product-selection-to-generation-workflow-guide.md
- docs/pdf-generation-phase-1-schema-and-api-contract.md
- docs/member-form-persistence-and-generation-roadmap.md

## Status Note

This prerequisites roadmap is now mostly historical.

The foundation it described has largely been implemented.

Use `docs/pdf-generation-next-roadmap.md` for the active planning view.

Use `docs/product-selection-to-generation-workflow-guide.md` for the detailed plain-English explanation of the current system.

## Plain-English Summary

The goal of this roadmap was to make PDF generation possible in a real, traceable backend workflow.

That foundation now exists.

The system can:

1. persist drafts and submitted intake payloads,
2. resolve product outputs and template versions,
3. resolve signer and acknowledger obligations,
4. store runtime system values,
5. create generation runs with blockers and lifecycle state,
6. queue renderable runs for a worker,
7. generate and store a traceable draft artifact linked to a document version.

What is still not complete is the last mile after that foundation:

1. real final rendering for `docx_template` and `pdf_form`,
2. signer-aware signature execution tied to generation runs and output signers,
3. real acknowledgment append and watermark steps,
4. full UI wiring for the live generation and execution flow.

## Original Prerequisite Areas And Their Current State

## Completed

1. output-scoped signer obligations
2. acknowledgment participants modeled as obligations
3. auto-sync of `document_parties` on submit
4. render context persistence
5. renderability gate beyond coverage
6. concrete system value providers for the current launch outputs
7. template artifact locator and render-engine metadata
8. generation run lifecycle and renderer linkage

## Partially Completed

1. signer-aware signature APIs
   - lookup endpoints exist,
   - full execution workflow is still pending.

## What This Means For Planning

The old question was, "What prerequisites do we need before real PDF generation can exist?"

That question has mostly been answered in code.

The new question is, "How do we finish the production rendering and execution layer on top of the foundation we now have?"

That is why the active planning has moved to `docs/pdf-generation-next-roadmap.md`.

## Recommended Reading Order

1. `docs/pdf-generation-next-roadmap.md`
2. `docs/product-selection-to-generation-workflow-guide.md`
3. `docs/pdf-generation-phase-1-schema-and-api-contract.md`
4. `docs/member-form-persistence-and-generation-roadmap.md`