# Admin Dashboard Guide: Template Binding Rules

Last updated: 2026-04-14

This guide explains how to operate and build the admin dashboard experience for template binding rules.

Companion docs:

- docs/admin-launch-controls-api-roadmap.md
- docs/jurisdiction-launch-runbook.md

## What Was Just Implemented

1. Added database-backed binding catalog table and seed data:
   - Migration: supabase/migrations/20260414150000_add_template_binding_rules.sql

2. Added runtime rule loader and cache:
   - Service: backend/src/services/templateBindingRulesService.ts
   - In-memory cache TTL: 60 seconds
   - Cache invalidates after create/update/deactivate

3. Switched extraction and requiredness logic to use DB-backed metadata:
   - Extraction service: backend/src/services/memberFormDocumentExtractionService.ts
   - Member-form requiredness: backend/src/services/memberFormRulesService.ts

4. Added admin API for rule management:
   - Routes: backend/src/routes/admin.ts
   - Controller: backend/src/controllers/templateBindingRulesAdminController.ts
   - OpenAPI paths/schemas: api/openapi.yaml

5. Applied pending migrations to remote project:
   - Verified with supabase migration list

6. Added Phase E launch gating for member-form/runtime availability:
   - Service: backend/src/services/jurisdictionAvailabilityService.ts
   - Shared jurisdiction normalization: backend/src/services/jurisdictionUtils.ts
   - Current launch scope is CA/OH only via `jurisdiction_product_availability`
   - Migration: supabase/migrations/20260414210000_limit_jurisdiction_product_availability_to_ca_oh.sql

## Admin API Endpoints

- GET /admin/template-binding-rules
- POST /admin/template-binding-rules
- PATCH /admin/template-binding-rules/{id}
- DELETE /admin/template-binding-rules/{id}

Roles allowed:
- admin
- service_role

Detailed payload contract:
- docs/template-binding-rules-admin-api-contract.md

## Dashboard UX Requirements

Minimum screens/components:

1. Rule list view
   - Table columns: documentKey, placeholder, source, required, canonicalKey, sourceFieldKey, sortOrder, isActive, updatedAt
   - Filters:
     - documentKey dropdown or text filter
     - includeInactive toggle

2. Create rule form
   - Required fields: documentKey, placeholder, description, required, source
   - Conditional validation:
     - If source is member_form, require canonicalKey or sourceFieldKey

3. Edit rule form
   - Partial updates allowed
   - Do not submit empty payload

4. Deactivate action
   - Use DELETE endpoint (soft delete)
   - Keep a confirmation modal

5. Optional reactivate action
   - Use PATCH with isActive: true

## Important Scope Notes

This guide is primarily for the template binding rules dashboard, but Phase E added a second operational concern that should influence the eventual admin UI design:

1. Binding rules control placeholder mapping and requiredness pressure.
2. Jurisdiction availability controls whether a jurisdiction/mode combination is even launch-enabled.
3. Template registry controls which template version/hash is pinned at generation time.

The current admin API exists only for `template_binding_rules`.

The current codebase does not yet expose admin CRUD endpoints for:

- `jurisdiction_product_availability`
- `template_registry`

If the future admin dashboard needs to manage launch rollout or template version pinning directly, those APIs will need to be added first.

## Validation Rules To Enforce In UI

1. documentKey pattern: ^[a-z0-9_]+$
2. canonicalKey pattern: ^[a-z0-9_]+$ (if provided)
3. sourceFieldKey pattern: ^[a-z0-9_]+$ (if provided)
4. sortOrder must be integer >= 0
5. placeholder and description must be non-empty
6. source enum:
   - member_form
   - system
   - notary
   - signing
7. source is member_form requires canonicalKey or sourceFieldKey

## Admin Operations Playbook

Use this sequence for safe production changes:

1. Create rule in inactive state
   - POST with isActive false

2. Verify mapping impact
   - GET list filtered by documentKey
   - Confirm canonicalKey/sourceFieldKey is valid and expected

3. Activate rule
   - PATCH with isActive true

4. Run smoke check
   - Call rules extraction endpoint for impacted jurisdiction/mode
   - Confirm templateCoverage does not unexpectedly increase missingBindings

5. Monitor behavior
   - Watch for 400/409 responses in admin calls

## What This Dashboard Can Fix

The binding-rules dashboard will be useful for filling in missing metadata without a code deploy when the missing information is at the placeholder-mapping layer.

Examples it can fix:

1. Add a missing placeholder row for a document key such as `trust_certificate`.
2. Mark a placeholder as `member_form`, `system`, `notary`, or `signing`.
3. Add or correct `canonicalKey` when a placeholder should map to an existing canonical field.
4. Add or correct `sourceFieldKey` when a placeholder should map to a specific extracted source field.
5. Tighten or relax `required` when template coverage expectations change.
6. Adjust `sortOrder`, `description`, and `notes` so the extraction contract is easier to review.

Typical examples:

1. Add dedicated `trust_certificate` bindings that were previously missing.
2. Mark `Trust.RegDate` and `Trust.No` as `system`-sourced placeholders.
3. Mark notarial certificate placeholders as `notary`-sourced placeholders.

## Trust Certificate Remediation Checklist

This is the most important remaining metadata gap to keep in view when the admin dashboard is eventually built.

## Why It Matters

1. `trust_bundle` outputs include `trust_certificate`.
2. `template_registry` already includes active `trust_certificate` rows for CA and OH.
3. The remaining risk is placeholder coverage and correct source classification for the `trust_certificate` document key.

## Minimum Remediation Checklist

1. Confirm active template registry rows exist for the target jurisdiction and output key.
   - `outputKey = trust_certificate`
   - `documentKey = trust_certificate`

2. Add dedicated binding rows for `documentKey = trust_certificate`.
   - Do not assume `trust_rrr` bindings are sufficient.

3. Classify each placeholder source explicitly.
   - `member_form`
   - `system`
   - `notary`
   - `signing` only if a placeholder truly depends on signing-stage capture

4. Confirm every required placeholder has one of these outcomes.
   - mapped to an existing canonical key
   - mapped to a concrete source field key
   - intentionally marked as `system`
   - intentionally marked as `notary`

5. Run extraction smoke tests after the rows are added.
   - Required bindings should not leave avoidable `missingBindings > 0`

## Likely Placeholder Decisions For `trust_certificate`

Based on the current certificate template, these are the main placeholder buckets to review.

Member-form backed candidates:

1. `Trust.Name`
   - likely maps to `trust_name`
2. `Trust.Date`
   - likely maps to `trust_date`
3. `Trust.Revoke`
   - likely maps to `revocation_holders`
4. `Trust.Maker.Tax.Name`
   - likely maps to `tax_id_owner`
5. `Trustees`
   - likely maps to `trustees`
6. `SignatureAuthority`
   - likely maps to `trustee_signature_authority`
7. `TrustState`
   - likely maps to `jurisdiction`
8. Trustmaker/trustee signature participant placeholders
   - likely map to `grantors` and `trustees`
9. Trustee powers grid
   - likely maps to `trustee_power_matrix`

System-backed candidates:

1. `Trust.No`
2. `Trust.RegDate`

Notary-backed candidates:

1. `County`
2. `Day`
3. `Month`
4. `Year`
5. `illuminotary`
6. `NotaryState` if the certificate copy or future template variant expects it as runtime metadata

## What The Dashboard Can And Cannot Do Here

What it can do:

1. Add the missing `trust_certificate` binding rows.
2. Mark placeholders as `system` or `notary` instead of leaving them unmapped.
3. Tighten requiredness and improve placeholder descriptions and notes.

What it cannot do by itself:

1. Create real values for `Trust.No` if no system pipeline provides it.
2. Create real values for `Trust.RegDate` if the registration date is not persisted anywhere.
3. Solve signing-stage values that are not captured in the product flow.

## Recommended Triage Flow For This Gap

1. Create or review all `trust_certificate` placeholder rows in the binding rules dashboard.
2. Mark each row with the correct source class.
3. Identify any placeholder that still lacks an actual runtime value provider.
4. Split the remaining work into:
   - dashboard-fixable metadata gaps
   - backend/system value gaps
   - signing/notary capture gaps
5. Only enable new trust-bundle jurisdictions after this checklist is clear.

## What This Dashboard Cannot Fix Alone

The dashboard cannot solve missing runtime data when the underlying source value does not exist anywhere in the system yet.

Examples that still require backend/frontend work:

1. A missing intake field that has never been implemented.
2. A signing-stage value that is not yet captured in the product flow.
3. A system-derived value that has no service generating it.
4. A template registry gap when no active template version/hash is pinned for that output.
5. A launch-gate restriction when the jurisdiction is still disabled in `jurisdiction_product_availability`.

Concrete current example:

1. `execution_date` remains a signing-stage capture problem and is not something the binding-rules dashboard can fully solve by itself.

## Launch Gate Notes For Future Admin Work

Phase E introduced runtime enforcement through `jurisdiction_product_availability`.

Current behavior:

1. Member-form jurisdiction lists now come from availability rows, not directly from requirement-table intersections.
2. Member-form rules/validate and `POST /documents/{id}/intake-submit` return `409` when a jurisdiction is not launch-enabled.
3. The runtime conflict payload includes:
   - `jurisdiction`
   - `reason`
   - `unavailableRequirements[]` with `family`, `documentType`, and `reason`

Current rollout state:

1. `US-CA` and `US-OH` are enabled.
2. Other jurisdictions are disabled with the reason: `Launch limited to California and Ohio during current rollout.`

This is enforced in:

1. `backend/src/services/jurisdictionAvailabilityService.ts`
2. `backend/src/controllers/memberFormRulesController.ts`
3. `backend/src/controllers/documentsController.ts`

## How To Enable Another Jurisdiction Safely

Do not treat availability as a single toggle. Enabling a new jurisdiction safely requires the template, binding, and generation layers to be ready first.

Recommended sequence:

1. Verify requirement-table coverage exists for the exact family/document-type combinations needed.
   - `poa_requirements`
   - `trust_requirements`
   - `idn_requirements`

2. Verify template pinning exists in `template_registry` for every required output in that jurisdiction.
   - Confirm `template_key`, `template_version`, and `template_hash` are active.

3. Verify binding coverage for every generated document key.
   - Especially check `trust_certificate` if trust-bundle outputs are involved.

4. Run extraction smoke checks before enabling the jurisdiction.
   - Call the member-form extraction endpoint for the target jurisdiction/mode.
   - Confirm required placeholders do not fail coverage unexpectedly.

5. Enable the jurisdiction in `jurisdiction_product_availability` for each required family/document-type row.
   - Set `is_available = true`
   - Clear `reason_if_unavailable`

6. Re-test member-form listing and submit behavior.
   - `GET /rules/member-form?mode=...`
   - `GET /rules/member-form/{jurisdiction}?mode=...`
   - `POST /rules/member-form/{jurisdiction}/validate?mode=...`
   - `POST /documents/{id}/intake-submit`

7. Re-test generation after submit.
   - `POST /documents/{id}/generation-runs`
   - Confirm generation runs resolve templates and do not fail on missing coverage.

Until an admin API exists for availability rows, this step is SQL/migration-driven rather than dashboard-driven.

## Suggested Future Admin Modules

If the admin dashboard expands beyond binding rules, these are the next highest-value additions.

1. Jurisdiction Availability Console
   - Backed by `jurisdiction_product_availability`
   - Filter by jurisdiction, family, document type, `isAvailable`
   - Edit `reason_if_unavailable`
   - Bulk enable/disable by jurisdiction launch wave

2. Template Registry Console
   - Backed by `template_registry`
   - Filter by jurisdiction and output key
   - Show active template version/hash window
   - Stage a new version before rollout

3. Coverage Triage View
   - Read extraction payload coverage per document key
   - Highlight `missingBindings > 0`
   - Deep-link into the binding rule editor for the affected document key

4. Launch Readiness Checklist View
   - Combine availability status, active template registry status, and coverage readiness
   - Show whether a jurisdiction is actually ready for member-form submit and generation

These future modules should link directly to the companion planning docs:

1. docs/admin-launch-controls-api-roadmap.md
2. docs/jurisdiction-launch-runbook.md

## Recommended Dashboard Flow For Missing Information

When operations or legal review identifies missing document-generation information, the UI should help answer this first:

1. Is this a missing placeholder mapping?
   - Fixable in binding rules dashboard.

2. Is this a missing launch permission?
   - Needs availability-table control.

3. Is this a missing template pin/version?
   - Needs template registry control.

4. Is this a missing product/source value that does not yet exist in runtime?
   - Needs product code changes, not just admin metadata changes.

This distinction matters because not all “missing information” should be treated as a binding-rule problem.

## Common Error Handling In Dashboard

Expected statuses:

- 400 validation error
- 401 unauthorized
- 403 forbidden
- 404 not found
- 409 conflict (typically duplicate documentKey + placeholder)
- 500 internal error

Suggested UI behavior:

1. 400: show field-level messages when available
2. 409: show a clear duplicate-rule message
3. 404: refresh list and show not-found toast
4. 401/403: redirect to auth/permissions flow

Additional 409 note for future cross-admin modules:

1. Binding-rules `409` usually means duplicate placeholder per document key.
2. Launch-gate/runtime `409` can also mean jurisdiction unavailable for the selected mode/family combination.
3. If future admin surfaces include availability controls, do not reuse the duplicate-rule message for launch-gate conflicts.

## Caching and Consistency Notes

1. Runtime loader cache is 60 seconds.
2. Admin write operations invalidate cache immediately.
3. If reads appear stale right after writes, wait one request cycle or refresh.

## Migration and Verification Commands

Run from repository root:

1. Check migration status:
   supabase migration list

2. Apply pending migrations:
   supabase db push

3. Re-check status:
   supabase migration list

4. Validate backend types/build:
   cd backend && npm run build

5. Check launch-gate migration state:
   supabase migration list

6. If enabling jurisdictions manually for a rollout, verify the target rows in `jurisdiction_product_availability` before and after the change.

## Implementation References

- Launch-controls roadmap: docs/admin-launch-controls-api-roadmap.md
- Jurisdiction launch runbook: docs/jurisdiction-launch-runbook.md
- Migration: supabase/migrations/20260414150000_add_template_binding_rules.sql
- Launch-gate migration: supabase/migrations/20260414210000_limit_jurisdiction_product_availability_to_ca_oh.sql
- Runtime service: backend/src/services/templateBindingRulesService.ts
- Launch-gate service: backend/src/services/jurisdictionAvailabilityService.ts
- Shared jurisdiction helpers: backend/src/services/jurisdictionUtils.ts
- Extraction usage: backend/src/services/memberFormDocumentExtractionService.ts
- Requiredness usage: backend/src/services/memberFormRulesService.ts
- Admin controller: backend/src/controllers/templateBindingRulesAdminController.ts
- Admin routes: backend/src/routes/admin.ts
- OpenAPI: api/openapi.yaml
- API contract snippet: docs/template-binding-rules-admin-api-contract.md