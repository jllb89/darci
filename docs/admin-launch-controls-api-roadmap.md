# Admin Launch Controls API Roadmap

Last updated: 2026-04-14

This document outlines the next admin API surface needed beyond the existing template binding rules API.

## Why This Exists

The current admin API supports only `template_binding_rules`.

Phase D and Phase E introduced two additional operational tables that now influence production behavior directly:

1. `jurisdiction_product_availability`
   - Controls whether a jurisdiction and family/document-type combination is launch-enabled.
   - Runtime listing and submit flows now depend on it.

2. `template_registry`
   - Controls which template version and hash is pinned per jurisdiction/output.
   - Generation runs depend on it for deterministic rendering.

Without admin APIs for these tables, rollout and template version management remain SQL or migration driven.

## Goals

1. Allow operations or legal/admin users to enable and disable jurisdictions without editing code.
2. Allow controlled template version rollout per jurisdiction and output.
3. Preserve deterministic generation behavior and avoid mutating already-recorded generation runs.
4. Keep launch-control changes separate from requirement-table content.
5. Make the future admin dashboard capable of triaging most metadata and rollout issues in one place.

## Non-Goals

1. Editing `poa_requirements`, `trust_requirements`, or `idn_requirements` directly.
2. Editing generated artifacts retroactively.
3. Solving missing runtime values that are not yet captured anywhere in product flows.
4. Replacing the existing template binding rules admin API.

## Proposed Admin Resource A: Jurisdiction Availability

## Table

- `jurisdiction_product_availability`

## Purpose

- Launch gating by jurisdiction, family, and document type.

## Suggested Resource Shape

```json
{
  "id": "4d1be4fb-49dd-49df-a220-5d3f52f4d969",
  "jurisdiction": "US-NY",
  "family": "trust",
  "documentType": "rrr",
  "isAvailable": false,
  "reasonIfUnavailable": "Pending template and trust certificate coverage readiness.",
  "seededAt": "2026-04-13T11:10:00.000Z",
  "createdAt": "2026-04-13T11:10:00.000Z",
  "updatedAt": "2026-04-14T21:00:00.000Z"
}
```

## Proposed Endpoints

1. `GET /admin/jurisdiction-availability`
   - Filters:
     - `jurisdiction`
     - `family`
     - `documentType`
     - `isAvailable`

2. `PATCH /admin/jurisdiction-availability/{id}`
   - Supports:
     - `isAvailable`
     - `reasonIfUnavailable`

3. `POST /admin/jurisdiction-availability/bulk-update`
   - Useful for jurisdiction launch waves.
   - Example use cases:
     - enable all rows for `US-VA`
     - disable all trust rows for `US-IL`

4. Optional: `POST /admin/jurisdiction-availability`
   - Only if the team wants the UI to create rows missing from seeded data.
   - If omitted, row creation remains migration-driven and the UI only edits existing rows.

## Suggested Validation Rules

1. `jurisdiction` must use normalized codes such as `US-CA`.
2. `family` must be one of `poa`, `trust`, `idn`.
3. `documentType` must be valid for the chosen family.
4. If `isAvailable = false`, `reasonIfUnavailable` should be strongly recommended and ideally required.
5. If `isAvailable = true`, the API should clear `reasonIfUnavailable` automatically unless the team explicitly wants to preserve history.

## Suggested Conflict Handling

1. Reject enabling rows when required launch prerequisites are known to be missing.
2. Alternatively, if the team wants a simpler first version, allow the toggle but surface warnings in the UI instead of blocking.

## Proposed Admin Resource B: Template Registry

## Table

- `template_registry`

## Purpose

- Pin active template version and hash windows by jurisdiction and output.

## Suggested Resource Shape

```json
{
  "id": "14c4c33f-a630-4ed3-80b0-c358ad2c16f7",
  "jurisdiction": "US-CA",
  "outputKey": "trust_certificate",
  "documentKey": "trust_certificate",
  "templateKey": "ca_trust_certificate",
  "templateVersion": "2026.04.14.v1",
  "templateHash": "sha256:ca-trustcert-v1",
  "effectiveFrom": "2026-04-14T19:30:00.000Z",
  "effectiveTo": null,
  "isActive": true,
  "createdAt": "2026-04-14T19:30:00.000Z"
}
```

## Proposed Endpoints

1. `GET /admin/template-registry`
   - Filters:
     - `jurisdiction`
     - `outputKey`
     - `documentKey`
     - `isActive`

2. `POST /admin/template-registry`
   - Create a new pinned version row.

3. `PATCH /admin/template-registry/{id}`
   - Supports controlled metadata edits such as:
     - `effectiveTo`
     - `isActive`
     - descriptive metadata if later added

4. Optional: `POST /admin/template-registry/{id}/deactivate`
   - Useful if the team prefers an explicit action over generic patching.

## Suggested Validation Rules

1. `outputKey` and `documentKey` should match the same lowercase underscore pattern already used elsewhere.
2. `templateKey`, `templateVersion`, and `templateHash` must be non-empty.
3. `effectiveTo` must be greater than `effectiveFrom`.
4. Do not allow overlapping active effective windows for the same `jurisdiction + outputKey` unless that overlap is intentional and explicitly supported.
5. Warn when a registry row is created for an output whose document key still has unresolved required binding coverage.

## UX Concepts For The Future Dashboard

## Availability Console

1. Matrix or grid grouped by jurisdiction.
2. Columns for family, document type, availability, and reason.
3. Bulk enable/disable by jurisdiction.
4. Inline warning when launch gating is enabled for a jurisdiction that lacks template registry or coverage readiness.

## Template Registry Console

1. Table grouped by jurisdiction and output key.
2. Show active version and hash at a glance.
3. Support staged rollout by adding a future `effectiveFrom`.
4. Show whether the target document key has active binding rules and recent extraction coverage confidence.

## Suggested Implementation Order

1. Add read-only admin endpoints for both resources.
2. Add patch support for jurisdiction availability.
3. Add create/list/patch support for template registry.
4. Add bulk-update endpoint for availability once first manual launches are understood.
5. Add dashboard UI only after the contracts are stable.

## Suggested Audit Events

These are not implemented yet but would be useful.

1. `admin.jurisdiction_availability_updated`
2. `admin.jurisdiction_availability_bulk_updated`
3. `admin.template_registry_created`
4. `admin.template_registry_updated`
5. `admin.template_registry_deactivated`

## Testing Expectations

1. List filters return only intended rows.
2. Validation rejects invalid family/document-type pairs.
3. Enabling a jurisdiction updates runtime member-form listing behavior.
4. Submit flow reflects availability changes immediately.
5. Generation picks the newly pinned template registry row after activation.
6. Existing generation runs remain unchanged when registry rows are updated later.

## Relationship To Existing Binding Rules Admin API

The three admin surfaces should be considered complementary:

1. `template_binding_rules`
   - Placeholder metadata and requiredness pressure.

2. `jurisdiction_product_availability`
   - Launch gating.

3. `template_registry`
   - Template version and hash pinning.

A future admin dashboard should make it easy to move between them for the same jurisdiction/output/document key.

## References

- Existing binding rules contract: docs/template-binding-rules-admin-api-contract.md
- Launch-gate service: backend/src/services/jurisdictionAvailabilityService.ts
- Generation/template pinning migration: supabase/migrations/20260414193000_add_template_registry_and_generation_runs.sql
- Launch-gate migration: supabase/migrations/20260414210000_limit_jurisdiction_product_availability_to_ca_oh.sql
