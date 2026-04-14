# Product Catalog Externalization Roadmap (DB + API)

Last updated: 2026-04-13
Related roadmap: [docs/product-mode-and-trust-roadmap.md](docs/product-mode-and-trust-roadmap.md)

## 1) Objective
Move product card content and selection metadata to database-backed configuration and expose it through API, so the start flow renders products from backend data only (no frontend hardcoded marketing copy).

## 2) Problem Statement
Current status:
- Product modes are loaded from API (`GET /rules/product-flow-modes`) and ultimately from DB.
- Frontend still overrides mode naming/description with hardcoded constants (`productFlowModeMarketingContent`).
- Product-card copy cannot be updated without frontend deployment.

Required end state:
- Product title/description/badge label are managed in DB.
- API returns canonical product presentation fields.
- Frontend renders only API-provided product content (with safe fallback behavior).

## 3) Scope
In scope:
- Product list content for the `/app/start` selection cards.
- Selected-product badge text.
- API contract and DB schema updates required for product presentation metadata.
- Migration strategy from hardcoded constants to backend-driven fields.

Out of scope:
- Full CMS/admin UI for managing product content (can be Phase 2+).
- Changes to core trust/POA requirement logic.

## 4) Current Technical Baseline
Backend:
- DB table `product_flow_modes` already stores `display_name` and `description`.
- Modes are exposed by `GET /rules/product-flow-modes`.

Frontend:
- Start page fetches modes via `/rules/product-flow-modes`.
- Product card text is currently overridden in frontend constants.

## 5) Target Data Model
### Phase 1 (Minimal, fastest)
Use existing `product_flow_modes` fields as presentation source of truth:
- `display_name` -> card title
- `description` -> card description

No schema change required for Phase 1.

### Phase 2 (Richer presentation metadata)
Add optional columns to `product_flow_modes`:
- `card_title` text
- `card_description` text
- `badge_label` text
- `short_label` text
- `marketing_metadata` jsonb default `{}`

Rationale:
- Preserve existing operational display name while allowing UI-specific copy.
- Support future surfaces (badges, homepage product cards, A/B copy variants).

## 6) API Contract Plan
### Existing endpoint
- `GET /rules/product-flow-modes`

### Contract evolution
Keep existing fields and add optional presentation fields:
- `cardTitle?: string`
- `cardDescription?: string`
- `badgeLabel?: string`
- `shortLabel?: string`
- `marketingMetadata?: object`

Compatibility:
- Existing clients continue to work with `displayName`/`description`.
- New clients prefer explicit card/badge fields.

## 7) Frontend Migration Plan
### Step F1: Remove hardcoded product marketing map
- Delete `productFlowModeMarketingContent` constants.
- In product cards, render API values first.

### Step F2: Rendering precedence
Card title precedence:
1. `mode.cardTitle`
2. `mode.displayName`
3. Humanized `mode.modeKey`

Card description precedence:
1. `mode.cardDescription`
2. `mode.description`
3. Safe fallback string

Badge label precedence:
1. `mode.badgeLabel`
2. `mode.cardTitle`
3. `mode.displayName`

### Step F3: Keep UX behaviors unchanged
- Product selection state and reset behavior stay as-is.
- Existing animations remain, only data source changes.

## 8) Backend Implementation Plan
### Step B1: Service mapping
- Extend `ProductFlowModeDefinition` to include optional presentation fields.
- Map DB columns to response shape in `productFlowModeService`.

### Step B2: Controller/API
- Keep `listProductFlowModesForSelection` endpoint path unchanged.
- Return presentation fields in payload.

### Step B3: OpenAPI
- Update schema in `api/openapi.yaml` for new optional fields.

## 9) Data Migration + Seeding Plan
### Phase 1 migration
- No schema migration.
- Normalize existing `display_name` and `description` values in seed data so they are product-first.

### Phase 2 migration
- Add columns for dedicated UI copy fields.
- Backfill new columns from existing `display_name`/`description`.
- Update seed scripts to maintain those fields.

## 10) Testing Plan
Backend:
- Unit tests for service mapping of optional presentation fields.
- Integration test for `/rules/product-flow-modes` response shape.

Frontend:
- Unit test for product card text precedence and badge label precedence.
- Regression tests for selection/reset flow after hardcoded map removal.

## 11) Rollout Sequence
1. [x] Phase 1 frontend de-hardcode (consume API title/description now).
2. [x] Phase 1 copy cleanup in seeded DB values.
3. [x] Validate in staging.
4. Optional Phase 2 schema extension for richer metadata.
5. Adopt `cardTitle`/`cardDescription`/`badgeLabel` in frontend once available.

## 12) Acceptance Criteria
- No product title/description is sourced from frontend hardcoded constants.
- Product cards and selected badge show API-provided values.
- `/rules/product-flow-modes` remains backward compatible.
- Build/tests pass and product selection UX behavior is unchanged.

## 13) Open Decisions
1. Should `display_name` remain operational/internal while UI uses `card_title`?
2. Do we want localized copy per locale now, or defer localization?
3. Is an admin editing workflow required in this milestone or later?
