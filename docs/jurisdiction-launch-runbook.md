# Jurisdiction Launch Runbook

Last updated: 2026-04-14

This runbook describes how to enable one additional jurisdiction end to end beyond the current CA/OH launch scope.

Until dedicated admin APIs exist for `jurisdiction_product_availability` and `template_registry`, parts of this process are SQL or migration driven.

## Goal

Safely move one jurisdiction from blocked to launch-enabled without exposing member-form submit or generation paths that are not fully ready.

## Current Launch Baseline

1. `US-CA` and `US-OH` are enabled.
2. Other jurisdictions are disabled by `jurisdiction_product_availability`.
3. The runtime returns `409` conflicts if submit or member-form access hits a blocked jurisdiction/mode combination.

## Preconditions

Do not enable a jurisdiction until all of these are true for the product combinations you plan to launch.

1. Requirement-table coverage exists.
   - `poa_requirements`
   - `trust_requirements`
   - `idn_requirements`

2. Template registry coverage exists for every required output.
   - `template_registry`

3. Binding metadata exists for each generated document key.
   - `template_binding_rules`

4. Extraction smoke checks do not show unresolved required bindings.

5. Product/legal stakeholders agree on the launch reason text to use if rollback is needed.

## Step 1: Define The Exact Launch Scope

Write down the scope first.

Example:

1. Jurisdiction: `US-VA`
2. Product modes:
   - `poa_only`
   - `trust_bundle`
3. Families/document types:
   - `poa / general`
   - `trust / rrr`
   - `idn / acknowledgment` only if notarize or other flows require it
4. Required outputs:
   - `poa_document`
   - `trust_rrr`
   - `trust_certificate`
   - `uploaded_document_with_seal` only if that flow is in scope

## Step 2: Verify Availability Rows Exist

Check current rows.

```sql
select
  jurisdiction,
  family,
  document_type,
  is_available,
  reason_if_unavailable,
  updated_at
from public.jurisdiction_product_availability
where jurisdiction = 'US-VA'
order by family, document_type;
```

If rows are missing, seed them first using a migration or controlled insert.

## Step 3: Verify Requirement Coverage

Confirm the underlying requirements exist.

```sql
select jurisdiction, poa_type
from public.poa_requirements
where jurisdiction = 'US-VA';

select jurisdiction, document_type
from public.trust_requirements
where jurisdiction = 'US-VA';

select jurisdiction, document_type
from public.idn_requirements
where jurisdiction = 'US-VA';
```

If the requirement rows do not exist, stop here. Launch gating should not be used to paper over missing legal/product requirements.

## Step 4: Verify Template Registry Coverage

Check that every required output has an active row.

```sql
select
  jurisdiction,
  output_key,
  document_key,
  template_key,
  template_version,
  template_hash,
  effective_from,
  effective_to,
  is_active
from public.template_registry
where jurisdiction = 'US-VA'
order by output_key, effective_from desc;
```

Minimum expectation for a trust-bundle launch:

1. `poa_document`
2. `trust_rrr`
3. `trust_certificate`

If any required output is missing, add the template registry row before enabling the jurisdiction.

## Step 5: Verify Binding Coverage

Check binding metadata for each document key.

Example query:

```sql
select
  document_key,
  placeholder,
  required,
  source,
  canonical_key,
  source_field_key,
  is_active,
  sort_order
from public.template_binding_rules
where document_key in ('poa_general', 'trust_rrr', 'trust_certificate')
order by document_key, sort_order, placeholder;
```

Important trust-bundle note:

1. `trust_certificate` is the remaining known metadata gap area.
2. Do not enable a trust jurisdiction until dedicated `trust_certificate` bindings are present and reviewed.

## Step 6: Run Extraction Smoke Checks

Before enabling the jurisdiction, use the runtime extraction path to confirm coverage is ready.

Recommended endpoints:

1. `GET /rules/member-form/{jurisdiction}?mode=trust_bundle`
2. `GET /rules/member-form/{jurisdiction}/document-extraction?mode=trust_bundle`
3. `POST /rules/member-form/{jurisdiction}/validate?mode=trust_bundle`

What to look for:

1. No unexpected `404` from missing requirements.
2. No `409` launch-gate conflict after availability is enabled.
3. No required placeholders with unresolved coverage that would later force generation failures.

## Step 7: Fill Missing Metadata Before Enabling

If extraction or checklist review identifies missing metadata, decide which bucket it falls into.

1. Missing placeholder mapping
   - Fix in `template_binding_rules`
   - This is the primary future admin dashboard use case.

2. Missing launch permission
   - Fix in `jurisdiction_product_availability`

3. Missing template pin or version/hash
   - Fix in `template_registry`

4. Missing runtime/source value not captured anywhere
   - Requires code or workflow changes

Current example:

1. `Trust.RegDate` and `Trust.No` can be represented in binding metadata, but they still require actual system values to exist.
2. `execution_date` is not solved by launch toggles or binding rows alone.

## Step 8: Enable The Jurisdiction

Use a migration when possible. If doing a controlled SQL update, use a transaction and document the change.

Example:

```sql
begin;

update public.jurisdiction_product_availability
set
  is_available = true,
  reason_if_unavailable = null,
  updated_at = now()
where jurisdiction = 'US-VA'
  and (
    (family = 'poa' and document_type = 'general')
    or (family = 'trust' and document_type = 'rrr')
  );

commit;
```

If the launch includes notarize or IDN functionality, include the relevant `idn` rows too.

## Step 9: Validate Runtime Behavior Immediately After Enablement

Confirm list and submit flows.

1. `GET /rules/member-form?mode=poa_only`
2. `GET /rules/member-form?mode=trust_bundle`
3. `GET /rules/member-form/va?mode=trust_bundle`
4. `POST /rules/member-form/va/validate?mode=trust_bundle`
5. `POST /documents/intake/bootstrap`
6. `POST /documents/{id}/intake-submit`

Expected outcome:

1. The jurisdiction appears in the list endpoints.
2. Rules and validate endpoints no longer return launch-gate `409`.
3. Intake submit succeeds if validation succeeds.

## Step 10: Validate Generation

Use a newly submitted document and call:

1. `POST /documents/{id}/generation-runs`
2. `GET /documents/{id}/generation-runs`

Check:

1. Template resolution uses the intended `template_registry` rows.
2. Required outputs are created.
3. No run fails because of missing required coverage.

## Trust-Bundle Special Checklist

If the jurisdiction includes `trust_bundle`, complete this extra check before declaring launch ready.

1. `trust_rrr` bindings reviewed.
2. `trust_certificate` bindings reviewed.
3. `trust_certificate` system placeholders identified.
   - `Trust.No`
   - `Trust.RegDate`
4. `trust_certificate` notary placeholders identified.
   - county, notary identity, certificate date parts
5. Trustee and trustmaker signature participant placeholders reviewed.
6. Template registry rows exist for both `trust_rrr` and `trust_certificate`.

## Rollback

If the jurisdiction must be pulled back quickly, disable it again and provide a clear reason.

```sql
update public.jurisdiction_product_availability
set
  is_available = false,
  reason_if_unavailable = 'Jurisdiction rollout paused pending follow-up validation.',
  updated_at = now()
where jurisdiction = 'US-VA';
```

If the issue is template-specific, consider also deactivating or superseding the relevant `template_registry` rows, but do not delete historical rows tied to existing generation runs.

## Success Criteria

The jurisdiction is ready only when all of the following are true.

1. It appears in the intended member-form jurisdiction lists.
2. Submit does not hit launch-gate `409` for intended product modes.
3. Required outputs resolve templates correctly.
4. Generation runs do not fail from avoidable metadata gaps.
5. Rollback instructions are documented before launch is announced.

## References

- Dashboard guide: docs/admin-dashboard-template-binding-rules-guide.md
- Launch-controls roadmap: docs/admin-launch-controls-api-roadmap.md
- Persistence and generation roadmap: docs/member-form-persistence-and-generation-roadmap.md
