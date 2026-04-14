# Trust Quickguide Implementation Roadmap (Addendum)

Last updated: 2026-04-13
Primary source: [docs/Register your Trust – Quickguide.md](docs/Register%20your%20Trust%20%E2%80%93%20Quickguide.md)
Related roadmap: [docs/product-mode-and-trust-roadmap.md](docs/product-mode-and-trust-roadmap.md)

## 1) Objective
Implement the remaining Trust Quickguide requirements in the contract form and supporting backend flows, while preserving the completed product-mode architecture and wizard behavior.

## 2) Progress Snapshot (Current State)

### Platform foundation (already done)
- [x] Product-mode data model and seed configuration are live.
- [x] Mode-aware rules APIs are live.
- [x] Document orchestration stores product mode and output bundle metadata.
- [x] Start flow has mode selector, mode-driven step grouping, and mode-driven upload visibility/required behavior.

### Quickguide step parity (current)
- Step 1 Trust Name: Covered
- Step 2 Trustmaker(s): Covered
- Step 3 Trustee: Covered
- Step 4 Successor Trustee: Covered
- Step 5 Trustee Powers and Signing Authority: Covered
- Step 6 Revocation and Incapacity: Covered
- Step 7 Upload Documents: Covered
- Step 8 Finalization guidance: Partial

## 3) Delivery Phases

### Phase Q1 - Step 2 Trustmaker parity
Status: Completed

- [x] Baseline fields exist (`grantors`, `tax_id_owner`).
- [x] Add explicit Trustmaker UX copy and role distinctions (Trustmaker vs Trustee).
- [x] Add explicit acting-trustee handling in trust mode.
- [x] Enforce primary tax-id-owner selection from entered Trustmakers when multiple Trustmakers exist.
- [x] Add frontend and backend validation parity for these rules. (Backend validation endpoint + final-step frontend validation call)

Deliverables:
- [apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx)
- [backend/src/services/memberFormRulesService.ts](backend/src/services/memberFormRulesService.ts)
- [backend/src/services/inputRequirements.ts](backend/src/services/inputRequirements.ts)
- [backend/src/services/memberFormDocumentExtractionService.ts](backend/src/services/memberFormDocumentExtractionService.ts)

### Phase Q2 - Step 5 Signing authority parity
Status: Completed

- [x] Baseline field exists (`trustee_powers`).
- [x] Add explicit signing authority capture (`all_trustees`, `any_one_trustee`, `named_signing_trustee`, `custom`).
- [x] Enforce signer selection consistency with trustee rows.
- [x] Ensure extraction/output mapping includes signing authority semantics.
- [x] Update API contract for any new response/request field additions.

Deliverables:
- [apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx)
- [backend/src/controllers/memberFormRulesController.ts](backend/src/controllers/memberFormRulesController.ts)
- [backend/src/services/memberFormRulesService.ts](backend/src/services/memberFormRulesService.ts)
- [api/openapi.yaml](api/openapi.yaml)

### Phase Q3 - Step 7 Upload documents parity
Status: Completed

- [x] Mode-driven upload behavior implemented (hidden for POA, optional for Trust, required for Notarize).
- [x] Baseline repeatable document list exists.
- [x] Expand multi-document metadata UX to match quickguide intent (originating type/date plus full amendment/supporting chain context).
- [x] Add stronger completeness checks per listed document row.
- [x] Ensure backend extraction payload preserves ordered trust-document chronology.

Deliverables:
- [apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx)
- [apps/web/src/app/app/start/memberFormControls.ts](apps/web/src/app/app/start/memberFormControls.ts)
- [backend/src/services/memberFormDocumentExtractionService.ts](backend/src/services/memberFormDocumentExtractionService.ts)

### Phase Q4 - Step 8 Finalization guidance parity
Status: Not started

- [ ] Add explicit post-submit trust registration guidance in member journey.
- [ ] Display and emphasize DARCi record number handoff.
- [ ] Add trust-focused status language for illuminotary finalization.

Deliverables:
- [apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx)
- [apps/web/src/app/app/documents/[id]/page.tsx](apps/web/src/app/app/documents/[id]/page.tsx)

### Phase Q5 - Verification and hardening
Status: Not started

- [ ] Add integration tests for Step 2, Step 5, Step 7, and Step 8 behaviors.
- [ ] Add regression tests for trust mode section flow and upload gates.
- [ ] Reconcile quickguide coverage table to full Covered status.

Deliverables:
- [backend/tests/integration/rules-member-form-document-extraction.test.ts](backend/tests/integration/rules-member-form-document-extraction.test.ts)
- [backend/tests/integration/documents-create-mode.test.ts](backend/tests/integration/documents-create-mode.test.ts)

## 4) Acceptance Gates

### Gate Q-A: Trustmaker parity
- [x] Trustmaker role clarity and primary tax-id-owner rule fully enforced in UI and backend.

### Gate Q-B: Signing authority parity
- [x] Explicit signing authority captured and represented in downstream outputs.

### Gate Q-C: Upload parity
- [x] Trust document-chain capture supports originating doc plus amendments/supporting artifacts with reliable ordering.

### Gate Q-D: Finalization parity
- [ ] Journey explicitly guides member from generated package to illuminotary finalization with DARCi number handoff.

### Gate Q-E: Full quickguide parity
- [ ] Steps 1 through 8 marked Covered in [docs/product-mode-and-trust-roadmap.md](docs/product-mode-and-trust-roadmap.md).

## 5) Progress Log
- 2026-04-13:
  - [x] Created addendum roadmap file.
  - [x] Marked completed foundation progress from Phases A-E.
  - [x] Marked quickguide parity baseline by step (Covered vs Partial).
  - [x] Phase Q1 started: Trustmaker terminology and acting-trustee UX copy implemented in trust mode.
  - [x] Phase Q1 started: `tax_id_owner` now enforces Trustmaker-based selection in UI when multiple Trustmakers exist.
  - [x] Phase Q1 completed: backend submission-time validation endpoint enforces Trustmaker-tax-owner linkage and acting-trustee signing consistency.
  - [x] Phase Q1 completed: start-flow final Continue now calls backend member-form validation endpoint.
  - [x] Phase Q2 completed: explicit signing authority modes are captured, trustee signer consistency is validated in UI/backend, and extraction mappings include signing-authority semantics.
  - [x] Phase Q3 completed: documents-to-include now uses chronological multi-row metadata capture with originating-document constraints and stronger per-row completeness checks.
  - [ ] Remaining implementation work for Step 8 finalization guidance.
