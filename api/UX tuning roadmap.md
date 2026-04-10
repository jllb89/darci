Roadmap drafted below; no code changes executed yet.

**Execution Boundaries**
1. I will keep backend architecture, trust/poa/idn schemas, and migrations unchanged.
2. I will preserve all existing family contract fields and source trace; changes will be in aggregation/runtime/presentation behavior.
3. Authority-related work will be deferred to the final implementation phase, per your instruction.

**Target Files (planned)**
1. memberInputAggregator.ts
2. memberFormRulesService.ts only if needed for stable synthetic-field metadata
3. memberFormRuntime.ts
4. page.tsx
5. memberInputAggregator.test.ts
6. memberFormRulesService.test.ts
7. memberFormRuntime.test.ts
8. Possible new small presentation helper + test in the same start-page folder if needed for deterministic grouping/badging tests

**Phase Plan**
1. Phase 0: Baseline + guardrails
- Snapshot current visible-field behavior from aggregation/runtime.
- Confirm no persistence/migration/schema edits are required for this pass.
- Keep Trust RRR + POA generation inputs intact.

2. Phase 1: Suppress internal/system fields (non-authority)
- Add a member-UI exclusion list in aggregation/runtime display filtering.
- Suppress document_title and document_type, plus semantic variants detected from canonical key and source field keys (for example poa_type and similar internal document-type selectors if surfaced).
- Ensure suppressed fields are not included in visible section field counts or required indicators.
- Keep underlying family contracts unchanged.

3. Phase 2: Replace Restatement summary + wire conditional prior-doc requiredness (non-authority)
- Hide restatement_summary from member-facing display.
- Inject a synthetic structured field:
  - canonical_key: restatement_context_type
  - label: What kind of trust update is this?
  - semantic_type: enum_single
  - data_type: string
  - values: initial_registration, amendment, restatement, amendment_and_restatement, unsure
- Add runtime condition support so requiredness can depend on current form answers (not just static source facts).
- Make prior_document_items required only when restatement_context_type is amendment, restatement, or amendment_and_restatement; optional for initial_registration and unsure.
- Preserve reverse mapping metadata so downstream trust narrative can still be derived from structured answers plus document context.

4. Phase 3: Improve mixed Trust + POA mental model (non-authority first)
- Add source-aware field classification from field.sources and active runtime sources: Trust, POA, Shared.
- Render subtle badges and family-aware grouped blocks inside each section without duplicating merged fields.
- Keep one canonical merged field for shared items.
- Apply this presentation model to all sections, while reserving authority-specific refinements for final phase.

5. Phase 4: Authority pass (last, as requested)
- Replace trustee_power_matrix textarea experience with structured trustee_powers multi-select.
- Planned trustee_powers options:
  - real_property
  - personal_property
  - banking_and_financial
  - stocks_and_bonds
  - commodities_and_options
  - insurance_and_annuities
  - government_securities
  - margin_transactions
  - mutual_funds
  - claims_and_litigation
  - business_operations
  - tax_matters
- Replace base revocation_holders free-text experience with structured selection:
  - trustmaker_only
  - all_trustmakers_jointly
  - each_trustmaker_as_to_own_property
  - trustee_controlled
  - custom
  - unsure
- Add conditional follow-up field revocation_holders_custom_text shown only when custom is selected.
- Preserve source mapping/writeback metadata to original trust fields and keep generation compatibility.

6. Phase 5: Tests + regression validation
- Add/update deterministic tests for all 8 required behaviors:
  - internal fields excluded
  - restatement structured replacement
  - trustee powers structured rendering
  - revocation holders structured + custom follow-up
  - prior_document_items conditional requiredness
  - trust/poa source-aware grouping/badging
  - shared merged field appears once
  - reverse mapping/source trace preserved
- Run focused test suites and build checks in backend and web.

**Acceptance Gates Before Close**
1. No schema or migration diffs.
2. No removal of family contract fields.
3. Member-facing UX reflects all 6 requested product changes.
4. Source trace and reverse mapping remain intact and test-covered.

If this roadmap is approved, I will execute in exactly this order and keep authority changes for the end.