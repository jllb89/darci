# Product Mode Expansion + Trust Compliance Roadmap

## 1) Objective
Add a first-step product selection in New Document and move mode behavior to data-driven configuration (not hardcoded), while confirming Trust flow compliance with the quickguide.

Trust quickguide execution addendum:
[docs/trust-quickguide-implementation-roadmap.md](docs/trust-quickguide-implementation-roadmap.md)

Product catalog externalization addendum:
[docs/product-catalog-api-roadmap.md](docs/product-catalog-api-roadmap.md)

Target entry point:
[apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx)

## 2) Requested Product Modes

| Mode | Member Experience | Upload Column | Families Used for Form Rules | Documents Generated |
| :--- | :--- | :--- | :--- | :--- |
| Generate POA | Member fills POA-only contract form for selected jurisdiction | Disabled | POA | POA |
| Generate Trust | Member fills unified flow split into General Information, POA Requirements, Trust Requirements | Enabled (trust docs may be attached) | POA + Trust | Certificate of Trust + Trust RRR + POA |
| Notarize a Document | Same form logic as POA, but with upload and notarization path | Enabled/Required | POA (plus notarization workflow) | POA + uploaded document with applied seal |

## 3) Current-State Findings (Why This Needs Refactor)

### Hardcoded selection defaults
- Intake families are currently fixed to POA + Trust:
[backend/src/services/memberFormRulesService.ts](backend/src/services/memberFormRulesService.ts#L44)
- Default selection uses fixed document types (general POA + rrr Trust):
[backend/src/services/memberFormRulesService.ts](backend/src/services/memberFormRulesService.ts#L379)

### Frontend step model is fixed
- Start page currently splits into People vs Authority/Advanced, not product-driven groups:
[apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx#L527)
[apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx#L762)

### Runtime family assumptions are fixed
- Runtime intake order is hardcoded to POA + Trust:
[apps/web/src/app/app/start/memberFormRuntime.ts](apps/web/src/app/app/start/memberFormRuntime.ts#L2)

### Upload behavior is hardcoded for current trust create flow
- Hidden/upload field policy is static:
[apps/web/src/app/app/start/memberFormControls.ts](apps/web/src/app/app/start/memberFormControls.ts#L218)

### Documents table does not store product mode/bundle intent
- `documents` currently tracks only `document_type` and `jurisdiction`:
[supabase/migrations/20260224120000_init.sql](supabase/migrations/20260224120000_init.sql#L13)

## 4) Database Plan (No Hardcoded Mode Logic)

### 4.1 New configuration tables
1. `product_flow_modes`
- `mode_key` (poa_only, trust_bundle, notarize_document)
- `display_name`, `description`, `is_active`, `sort_order`

2. `product_flow_mode_families`
- maps mode -> required families and default document types
- columns: `mode_key`, `family`, `default_document_type`, `is_required`

3. `product_flow_mode_outputs`
- maps mode -> expected output docs
- columns: `mode_key`, `output_key`, `output_label`, `sort_order`

4. `product_flow_mode_ui`
- controls section strategy per mode
- columns: `mode_key`, `group_key` (general/poa/trust), `sort_order`, `layout_mode`, `show_upload_column`, `upload_required`

5. `jurisdiction_product_availability`
- per jurisdiction/family/document_type availability (for rollout and partial coverage)

### 4.2 Extend operational table
6. Extend `documents`
- add `product_flow_mode` (text)
- add `selected_families` (text[] or jsonb)
- add `output_bundle` (jsonb, optional)

This preserves existing requirement tables and avoids embedding mode rules in code.

## 5) Backend Roadmap (Controllers + Services)

### Phase A: Selection service foundation
Status: Completed

- [x] Create mode selection service with:
	- `listProductFlowModes()`
	- `getProductFlowMode(modeKey)`
	- `buildSelectionForMode(modeKey)`
	- `getJurisdictionsForMode(modeKey)`
	- Implementation: [backend/src/services/productFlowModeService.ts](backend/src/services/productFlowModeService.ts)
- [x] Replace hardcoded intake defaults in member-form flow with mode-backed selection.
	- Updated: [backend/src/services/memberFormRulesService.ts](backend/src/services/memberFormRulesService.ts)
	- Updated: [backend/src/controllers/memberFormRulesController.ts](backend/src/controllers/memberFormRulesController.ts)
- [x] Add DB schema and seed foundation for data-driven product modes.
	- Added: [supabase/migrations/20260413110000_add_product_flow_mode_schema.sql](supabase/migrations/20260413110000_add_product_flow_mode_schema.sql)
	- Added: [supabase/migrations/20260413111000_seed_product_flow_modes.sql](supabase/migrations/20260413111000_seed_product_flow_modes.sql)
- [x] API contract note: no public endpoint shape changes in Phase A, so OpenAPI/spec remains unchanged.

### Phase B: Rules API extension
Status: Completed

- [x] Added endpoint: `GET /rules/product-flow-modes`
	- Route/controller: [backend/src/routes/rules.ts](backend/src/routes/rules.ts), [backend/src/controllers/memberFormRulesController.ts](backend/src/controllers/memberFormRulesController.ts)
- [x] Extended member-form endpoints to accept mode query:
	- `GET /rules/member-form?mode=poa_only|trust_bundle|notarize_document`
	- `GET /rules/member-form/{jurisdiction}?mode=...`
	- `GET /rules/member-form/{jurisdiction}/document-extraction?mode=...`
- [x] Returned selected mode metadata in `MemberFormRulesContract` response.
	- Contract type updates: [backend/src/services/memberFormRulesService.ts](backend/src/services/memberFormRulesService.ts)
	- OpenAPI updates: [api/openapi.yaml](api/openapi.yaml)

### Phase C: Document orchestration alignment
Status: Completed

- [x] Updated create/start document flow to persist mode and selected families.
	- Controller request/response updates: [backend/src/controllers/documentsController.ts](backend/src/controllers/documentsController.ts)
	- Persistence model updates: [backend/src/services/documentService.ts](backend/src/services/documentService.ts)
- [x] Added output bundle resolution from `product_flow_mode_outputs` and persisted expected outputs on document create.
	- Resolver: [backend/src/services/productFlowModeService.ts](backend/src/services/productFlowModeService.ts)
	- Create-flow integration: [backend/src/controllers/documentsController.ts](backend/src/controllers/documentsController.ts)
- [x] Updated API spec for document create/request metadata and document response payload.
	- OpenAPI: [api/openapi.yaml](api/openapi.yaml)

## 6) Frontend Roadmap (New Document UX)

### Phase D: Add mode step at start
Status: Completed

- [x] Add a first-step selector in:
[apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx)
- Generate POA
- Generate Trust
- Notarize a document

- [x] Fetch available modes + jurisdiction list filtered by selected mode.
	- Mode endpoint integration: [apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx)
	- Mode-aware jurisdiction/member-form fetches: [apps/web/src/app/app/start/page.tsx](apps/web/src/app/app/start/page.tsx)

### Phase E: Mode-driven form rendering
Status: Completed

- [x] Replace current People/Authority split with mode-specific groups:
	- Generate Trust: `General Information -> POA Requirements -> Trust Requirements`
	- Generate POA: `General Information -> POA Requirements`
	- Notarize: `General Information -> POA Requirements`
- [x] Mode-driven upload column behavior:
	- POA mode: upload hidden/disabled
	- Trust mode: upload visible (optional/conditional)
	- Notarize mode: upload visible and required

## 7) Trust Quickguide Compliance Audit (Current vs Required)
Source guide:
[docs/Register your Trust – Quickguide.md](docs/Register%20your%20Trust%20%E2%80%93%20Quickguide.md)

| Quickguide Step | Current Coverage | Status | Required Action |
| :--- | :--- | :--- | :--- |
| Step 1 Trust Name | `trust_name` exists | Covered | Keep required in Trust mode |
| Step 2 Trustmaker(s) | `grantors` + trustmaker-bound `tax_id_owner` + acting-trustee signer handling | Covered | Keep backend/frontend validation parity in place via member-form validation endpoint |
| Step 3 Trustee | `trustees` exists | Covered | Keep required in Trust mode |
| Step 4 Successor Trustee | `successor_trustees` exists | Covered | Keep optional unless jurisdiction rule says required |
| Step 5 Trustee Powers + Signing Authority | Explicit signing-authority mode capture is now live (`all_trustees`, `any_one_trustee`, `named_signing_trustee`, `custom`) with trustee-row consistency checks | Covered | Maintain validation parity and extraction mapping coverage |
| Step 6 Revocation + Incapacity | `revocation_holders`, `trustee_incapacity_standard` exist | Covered | Keep as explicit trust section inputs |
| Step 7 Upload Documents | Documents-to-include now captures chronological row metadata (originating type/date, amendments/supporting chain context, references) with completeness checks | Covered | Maintain chronology validation and extraction-order semantics |
| Step 8 illuminotarize Finalization | Notarization workflow exists in platform, but trust journey does not clearly present this as final registration step | Partial | Add explicit post-submit step and status guidance with DARCi number handoff |

## 8) Implementation Sequence and Acceptance Gates

### Gate 1: Data model live
- [x] Product mode tables seeded
- [x] Documents table extended
- [x] Mode-backed intake selection foundation shipped (no new public endpoint yet)

### Gate 2: API mode-aware
- [x] Member-form rules are returned per mode
- [x] Jurisdiction listing reflects mode/family availability

### Gate 3: Frontend mode selector live
- [x] New mode step in Start flow
- [x] Mode-specific section grouping and upload behavior active

### Gate 4: Trust quickguide parity
- Steps 1-8 represented in UX and payload outputs
- Compliance checklist marked fully covered

## 9) Recommended First Build Slice (Lowest Risk)
1. Implement `poa_only` mode first (no upload, single family) to validate mode architecture.
2. Implement `trust_bundle` second (adds group split + uploads + multi-output).
3. Implement `notarize_document` third (reuses poa-only intake, adds upload required + seal output workflow).

## 10) Open Decisions Needed Before Build
1. In Notarize mode, should IDN family be included in intake rules or handled only in post-submission notarization workflow?
2. For Trust bundle, should POA always be `general`, or selectable (`general/durable/limited/medical`) before form rendering?
3. For Trust signing authority, confirm expected values: `all_trustees`, `any_one_trustee`, `named_signing_trustee`, or custom text.
