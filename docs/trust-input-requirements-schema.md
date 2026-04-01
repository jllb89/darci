# Trust Input Requirements Schema v2.1

This document defines the derived `input_requirements` contract for Trust workflows.

It is intentionally separate from `docs/Trust_requirements.json`.

- `Trust_requirements.json` is the legal/source layer.
- `input_requirements` is the product/workflow contract.
- Backend derives workflow requirements from legal rules plus curated overrides.
- Frontend renders from `input_requirements`, not raw legal prose.

This schema supports all trust document types in one contract:

- `rrr`
- `certification`
- `other`

## Core Architecture

Target system model:

1. legal rules -> classification + derived requirements
2. classification + document type -> base template
3. state -> small overlay (especially acknowledgment / execution / notices)
4. trust inputs -> fill base template + overlay

This keeps state variation concentrated in validation and overlays, rather than forking full templates per state.

## Goals

- One stable API contract for all trust document types.
- Explicit base-template and state-overlay support.
- Separate trust-system family from execution-level behavior.
- Preserve legal-source traceability and derivation auditability.
- Keep section/field semantics UI-agnostic.

## Non-Goals

- Replacing legal text in `Trust_requirements.json`.
- Storing frontend component names.
- Modeling pixel-level rendering details.

## Top-Level Shape

```json
{
  "schema_version": "2026-03-31",
  "jurisdiction": "US-CA",
  "document_type": "rrr",
  "ui_profile": "trust_standard",
  "derivation_mode": "rules_plus_overrides",
  "review_status": "draft",
  "classification": {
    "trust_system": "NON_UTC_STANDARD",
    "execution_level": "STANDARD"
  },
  "trust_capabilities": {
    "asset_protection": false,
    "directed_trusts": false,
    "decanting_friendly": false,
    "silent_trust_friendly": false
  },
  "template_resolution": {
    "base_template_key": "trust_rrr_v1",
    "state_overlay_key": "ca_overlay_v1",
    "acknowledgment_profile": "CA_ACK"
  },
  "workflow": {
    "steps": [],
    "required_artifacts": [],
    "submission_checks": []
  },
  "sections": [],
  "document_outputs": [],
  "notices": [],
  "source_trace": []
}
```

## Top-Level Field Definitions

- `schema_version`: version of this contract.
- `jurisdiction`: canonical key such as `US-CA`.
- `document_type`: trust workflow branch.
  Allowed values: `rrr`, `certification`, `other`.
- `ui_profile`: coarse rendering profile.
- `derivation_mode`: output production mode.
  Allowed values: `rules_only`, `rules_plus_overrides`, `manual_review`.
- `review_status`: confidence level.
  Allowed values: `draft`, `verified`, `needs_review`.
- `classification`: legal/behavioral classification.
- `trust_capabilities`: normalized trust-feature capability flags; keeps capability detail out of `trust_system` enum overloading.
- `template_resolution`: base template plus state overlay selection.
- `workflow`: process sequencing and input prerequisites (`required_artifacts`) used before generation.
- `sections`: semantic input sections and fields.
- `document_outputs`: generated deliverables emitted by the system.
- `notices`: UI notices and warnings.
- `source_trace`: source mapping for audit/debug.

## Classification

```json
{
  "trust_system": "UTC_STANDARD",
  "execution_level": "STANDARD"
}
```

### trust_system enum

- `UTC_STANDARD`
- `UTC_PLUS`
- `NON_UTC_STANDARD`
- `TRUST_FRIENDLY`
- `CIVIL_LAW`

### execution_level enum

- `STANDARD`
- `NOTARIZATION_REQUIRED`
- `ACK_OR_WITNESS_ALTERNATIVE`
- `FORMAL_ACT`

### Suggested classification derivation

- `CIVIL_LAW`
  - civil-law structure or execution language such as public deed/authentic act.
- `TRUST_FRIENDLY`
  - jurisdictions where trust-friendly capability posture is a defining workflow characteristic.
- `UTC_PLUS`
  - UTC jurisdictions with notable trust-related overlays that affect workflow behavior.
- `UTC_STANDARD`
  - UTC jurisdictions without major behavioral overlays.
- `NON_UTC_STANDARD`
  - non-UTC jurisdictions without trust-friendly or civil-law profile.

- `execution_level = FORMAL_ACT`
  - authentic act/public deed or comparable formal-act regime.
- `execution_level = ACK_OR_WITNESS_ALTERNATIVE`
  - execution explicitly supports acknowledgment OR witness path alternatives.
- `execution_level = NOTARIZATION_REQUIRED`
  - notarization required without alternative witness-only branch.
- `execution_level = STANDARD`
  - no strict execution branch above standard handling.

## Trust Capabilities

This object captures feature capability signals independently from `trust_system`.

```json
{
  "asset_protection": true,
  "directed_trusts": true,
  "decanting_friendly": true,
  "silent_trust_friendly": false
}
```

### trust_capabilities fields

- `asset_protection`: jurisdiction posture supports strong asset-protection trust patterns.
- `directed_trusts`: directed-trust arrangements are broadly supported.
- `decanting_friendly`: decanting is broadly available for practical workflows.
- `silent_trust_friendly`: silent-trust posture is broadly available.

### Capability usage notes

- Keep `trust_system` coarse; use `trust_capabilities` for feature-level branching.
- Capability booleans are derived and may come from legal rules plus curated overlays.
- Missing capability certainty should default to conservative (`false`) with `manual_review_required` when needed.

## Template Resolution

```json
{
  "base_template_key": "trust_certification_v1",
  "state_overlay_key": "oh_overlay_v1",
  "acknowledgment_profile": "OH_ACK"
}
```

### Template fields

- `base_template_key`: selected by `document_type` and optionally classification.
- `state_overlay_key`: state-specific overlays for notices, execution text, and branch behavior.
- `acknowledgment_profile`: acknowledgment/notarial certificate profile key (single source of truth).

Do not duplicate this as a separate canonical field under `notary_and_witness`; field-level display metadata should be derived from this value.

### Suggested acknowledgment profile enum

- `STANDARD_ACK`
- `CA_ACK`
- `OH_ACK`
- `NY_DEED_ACK`
- `LA_FORMAL_ACT`
- `PR_PUBLIC_INSTRUMENT`

## Workflow

```json
{
  "steps": [
    "document_type_selection",
    "trust_identity",
    "trust_parties",
    "document_specific_inputs",
    "execution_requirements",
    "review"
  ],
  "required_artifacts": [
    "prior_trust_documents_if_rrr",
    "source_trust_instrument_reference_if_certification",
    "uploaded_supporting_document_if_other"
  ],
  "submission_checks": [
    "required_fields_complete",
    "required_execution_fields_complete",
    "manual_review_gate_if_applicable"
  ]
}
```

### Contract boundary: artifacts vs outputs

- `required_artifacts`: prerequisite inputs or uploads required before generation.
- `document_outputs`: generated deliverables produced after generation.
- Signed/generated documents and acknowledgment pages belong in `document_outputs`, not in `required_artifacts`.

### required_artifacts by document type

- `rrr`
  - `prior_trust_documents`
- `certification`
  - `source_trust_instrument_reference`
- `other`
  - `uploaded_supporting_document`

## Section Shape

```json
{
  "key": "trust_identity",
  "title": "Trust Identity",
  "presence": "required",
  "repeatable": false,
  "applies_to_document_types": ["rrr", "certification", "other"],
  "fields": []
}
```

### Section presence enum

- `required`
- `optional`
- `conditional`
- `hidden`
- `manual_review`

## Field Shape

```json
{
  "key": "trust_name",
  "label": "Trust name",
  "semantic_type": "trust_name",
  "required": true,
  "data_type": "string",
  "collect_from": "member",
  "default_source": "none",
  "validation": {
    "min_length": 2,
    "max_length": 200
  }
}
```

### Field properties

- `key`: stable API identifier.
- `label`: display label.
- `semantic_type`: field meaning.
- `required`: branch-specific required status.
- `data_type`: primitive type.
- `collect_from`: input source.
- `default_source`: prefill policy.
- `validation`: primitive constraints.
- `help_text`: optional guidance.
- `when`: optional condition object.
- `derivation_rule`: optional source derivation hint.

### semantic_type suggested values

- `trust_name`
- `trust_date`
- `document_title`
- `document_page_count`
- `person_name`
- `person_role`
- `person_list`
- `enum_single`
- `enum_multi`
- `boolean`
- `date`
- `text`
- `notary_requirement`
- `witness_requirement`
- `signature_requirement`
- `registration_note`
- `certification_scope`
- `uploaded_document`
- `signature_authority_rule`
- `revocation_holders`
- `tax_id_owner`
- `asset_titling_format`
- `execution_status`

### data_type enum

- `string`
- `integer`
- `boolean`
- `date`
- `array`
- `object`

### collect_from enum

- `member`
- `system`
- `notary`
- `trustee`

### default_source enum

- `none`
- `jurisdiction_default`
- `system_derived`
- `document_template`
- `previous_document`

### execution_status enum

- `required`
- `not_required`
- `conditional`
- `alternative_path`

## Conditions

```json
{
  "all": [
    {
      "fact": "document_type",
      "operator": "equals",
      "value": "certification"
    }
  ]
}
```

### condition facts

- `document_type`
- `trust_system`
- `execution_level`
- `acknowledgment_profile`
- `trust_capability_asset_protection`
- `trust_capability_directed_trusts`
- `trust_capability_decanting_friendly`
- `trust_capability_silent_trust_friendly`
- `manual_review_required`
- `real_property_rule_present`
- `statutory_form_available`

### condition operators

- `equals`
- `not_equals`
- `in`
- `not_in`
- `is_true`
- `is_false`

## Canonical Sections

1. `document_context`
2. `trust_identity`
3. `trust_parties`
4. `trust_terms`
5. `certification_scope`
6. `prior_documents`
7. `supporting_uploads`
8. `execution_requirements`
9. `notary_and_witness`
10. `statutory_notices`
11. `manual_review`

## Section Presence by Document Type

| Section | RRR | Certification | Other |
|---|---|---|---|
| document_context | required | required | required |
| trust_identity | required | required | required |
| trust_parties | required | required | conditional |
| trust_terms | required | hidden | optional |
| certification_scope | hidden | required | hidden |
| prior_documents | required | optional | hidden |
| supporting_uploads | optional | optional | required |
| execution_requirements | required | required | required |
| notary_and_witness | conditional | conditional | conditional |
| statutory_notices | required | required | required |
| manual_review | conditional | conditional | conditional |

## Core Field Catalog

### document_context

- `document_type` (enum_single, required)
- `document_title` (string, required)
- `jurisdiction` (enum_single, required)
- `base_template_key` (string, required, system_derived)
- `state_overlay_key` (string, required, system_derived)
- `acknowledgment_profile` (enum_single, required, system_derived)

### trust_identity

- `trust_name` (string, required)
- `trust_date` (date, required)

### trust_parties

- `grantors` (array, required for `rrr` and `certification`)
- `trustees` (array, required for `rrr` and `certification`)
- `successor_trustees` (array, optional)
- `revocation_holders` (array, conditional, system_derived)
- `signature_authority_rule` (text, required, system_derived)
- `tax_id_owner` (enum_single, conditional, system_derived)
- `asset_titling_format` (text, conditional, system_derived)

### trust_terms

- `restatement_summary` (text, required for `rrr`)
- `key_trust_terms` (text, optional for `rrr` and `other`)

### certification_scope

- `certification_purpose` (enum_single, required for `certification`)
- `required_certification_elements` (array, required for `certification`, system_derived)
- `permitted_optional_certification_elements` (array, optional, system_derived)
- `prohibited_certification_elements` (array, conditional, system_derived)
- `certification_elements_preview` (text, optional, system_derived)

### prior_documents

- `prior_document_items` (array of object: title/pages/date, required for `rrr`)

### supporting_uploads

- `uploaded_document_file` (uploaded_document, required for `other`, optional otherwise)

### execution_requirements

- `writing_required` (boolean, required, system_derived)
- `signature_required` (boolean, required, system_derived)
- `special_execution_rules` (text, conditional, system_derived)

### notary_and_witness

- `notarization_required_status` (execution_status, required, system_derived)
- `witnesses_required_status` (execution_status, required, system_derived)
- `execution_alternative_available` (boolean, conditional, system_derived)
- `real_property_rule_note` (text, conditional, system_derived)

Acknowledgment/notarial profile source of truth remains `template_resolution.acknowledgment_profile`.

### statutory_notices

- `registration_requirement_note` (text, required, system_derived)
- `specific_authority_note` (text, required, system_derived)
- `certification_statutory_basis_note` (text, required, system_derived)

### manual_review

- `manual_review_required` (boolean, required, system_derived)
- `manual_review_reason` (text, conditional, system_derived)

## Derivation Mapping From Trust Requirements

Mappings are direct and do not reinterpret legal meaning.

- `Writing Required` -> `execution_requirements.writing_required`
- `Signature Required` -> `execution_requirements.signature_required`
- `Notarization Required` -> `notary_and_witness.notarization_required_status` (normalized `execution_status`)
- `Witnesses Required` -> `notary_and_witness.witnesses_required_status` (normalized `execution_status`)
- `Special Execution Rules` -> `execution_requirements.special_execution_rules`
- `Trust Certification Statutory Basis` -> `statutory_notices.certification_statutory_basis_note`
- `Certification Required Elements` -> `certification_scope.required_certification_elements`
- `Certification Permissive Elements` -> `certification_scope.permitted_optional_certification_elements`
- `Certification Prohibited Elements` -> `certification_scope.prohibited_certification_elements`
- `Non-Default Powers Requiring Express Authority` -> `statutory_notices.specific_authority_note`
- `Statutory Form Available` -> notices/template resolution overlays
- `Registration Requirement` -> `statutory_notices.registration_requirement_note`
- `Real Property Rule` -> `notary_and_witness.real_property_rule_note`
- `Manual Review Required` -> `manual_review.manual_review_required`, `review_status`
- trust-capability overlays -> `trust_capabilities.*`
- `UTC Adopted` + execution fields + overlays -> `classification.trust_system`, `classification.execution_level`

### Execution status normalization guidance

- explicit required language -> `required`
- explicit not-required language -> `not_required`
- conditional language (for example by transaction/property/use) -> `conditional`
- explicit alternative path language (acknowledgment OR witness) -> `alternative_path`

## Review State Rules

- If `manual_review.manual_review_required = true`, then `review_status` MUST be `needs_review`.
- If `manual_review.manual_review_required = false`, `review_status` may be `draft` or `verified`.
- `review_status = verified` requires submission checks to pass and no active manual-review gate.
- `derivation_mode = manual_review` should set `manual_review.manual_review_required = true` and `review_status = needs_review`.

## Document Outputs

```json
[
  {
    "key": "generated_trust_document",
    "required": true
  },
  {
    "key": "execution_signature_packet",
    "required": false,
    "when": {
      "all": [
        {
          "fact": "document_type",
          "operator": "in",
          "value": ["rrr", "certification", "other"]
        }
      ]
    }
  },
  {
    "key": "state_acknowledgment_page",
    "required": false,
    "when": {
      "all": [
        {
          "fact": "acknowledgment_profile",
          "operator": "in",
          "value": ["CA_ACK", "OH_ACK", "NY_DEED_ACK", "LA_FORMAL_ACT", "PR_PUBLIC_INSTRUMENT"]
        }
      ]
    }
  },
  {
    "key": "generation_review_report",
    "required": false,
    "when": {
      "all": [
        {
          "fact": "manual_review_required",
          "operator": "is_true"
        }
      ]
    }
  }
]
```

## Notices

```json
[
  {
    "key": "execution_formality_notice",
    "severity": "info",
    "message": "Execution requirements vary by jurisdiction and document type."
  },
  {
    "key": "manual_review_notice",
    "severity": "warning",
    "message": "This jurisdiction requires manual review before final generation.",
    "when": {
      "all": [
        {
          "fact": "manual_review_required",
          "operator": "is_true"
        }
      ]
    }
  }
]
```

### Notice severities

- `info`
- `warning`
- `blocking`

## Source Trace

```json
[
  {
    "source": "trust_requirements",
    "field": "Notarization Required",
    "value": "Not required but recommended"
  },
  {
    "source": "trust_requirements",
    "field": "Manual Review Required",
    "value": "No"
  }
]
```

Capability flags shown in examples are illustrative placeholders for contract behavior.

## Example A: Trust RRR (CA)

```json
{
  "jurisdiction": "US-CA",
  "document_type": "rrr",
  "classification": {
    "trust_system": "NON_UTC_STANDARD",
    "execution_level": "STANDARD"
  },
  "trust_capabilities": {
    "asset_protection": false,
    "directed_trusts": false,
    "decanting_friendly": false,
    "silent_trust_friendly": false
  },
  "template_resolution": {
    "base_template_key": "trust_rrr_v1",
    "state_overlay_key": "ca_overlay_v1",
    "acknowledgment_profile": "CA_ACK"
  },
  "workflow": {
    "required_artifacts": [
      "prior_trust_documents"
    ]
  },
  "document_outputs": [
    { "key": "generated_trust_document", "required": true },
    { "key": "state_acknowledgment_page", "required": true }
  ],
  "notary_and_witness": {
    "notarization_required_status": "required",
    "witnesses_required_status": "not_required"
  },
  "sections": [
    { "key": "trust_identity", "presence": "required" },
    { "key": "trust_parties", "presence": "required" },
    { "key": "trust_terms", "presence": "required" },
    { "key": "prior_documents", "presence": "required" },
    { "key": "execution_requirements", "presence": "required" }
  ]
}
```

`execution_level = STANDARD` here means no additional formal-act branch. It does not suppress acknowledgment behavior; `template_resolution.acknowledgment_profile = CA_ACK` and overlays can still require a state acknowledgment page.

## Example B: Trust Certification (OH)

```json
{
  "jurisdiction": "US-OH",
  "document_type": "certification",
  "classification": {
    "trust_system": "UTC_STANDARD",
    "execution_level": "STANDARD"
  },
  "trust_capabilities": {
    "asset_protection": false,
    "directed_trusts": false,
    "decanting_friendly": false,
    "silent_trust_friendly": false
  },
  "template_resolution": {
    "base_template_key": "trust_certification_v1",
    "state_overlay_key": "oh_overlay_v1",
    "acknowledgment_profile": "OH_ACK"
  },
  "sections": [
    { "key": "trust_identity", "presence": "required" },
    { "key": "trust_parties", "presence": "required" },
    { "key": "certification_scope", "presence": "required" },
    { "key": "trust_terms", "presence": "hidden" },
    { "key": "execution_requirements", "presence": "required" }
  ]
}
```

## Example C: Trust Other (NY-like execution alternative)

```json
{
  "jurisdiction": "US-NY",
  "document_type": "other",
  "classification": {
    "trust_system": "NON_UTC_STANDARD",
    "execution_level": "ACK_OR_WITNESS_ALTERNATIVE"
  },
  "trust_capabilities": {
    "asset_protection": false,
    "directed_trusts": false,
    "decanting_friendly": false,
    "silent_trust_friendly": false
  },
  "template_resolution": {
    "base_template_key": "trust_other_v1",
    "state_overlay_key": "ny_overlay_v1",
    "acknowledgment_profile": "NY_DEED_ACK"
  },
  "sections": [
    { "key": "trust_identity", "presence": "required" },
    { "key": "trust_parties", "presence": "conditional" },
    { "key": "supporting_uploads", "presence": "required" },
    { "key": "execution_requirements", "presence": "required" }
  ]
}
```

## Implementation Notes

- Backend should derive booleans consistently:
  - `Writing Required = "Yes"` -> `true`
  - `Signature Required = "Yes"` -> `true`
  - other values -> `false`
- Backend should normalize execution status fields:
  - explicit required language -> `required`
  - explicit not-required language -> `not_required`
  - conditional language -> `conditional`
  - alternative-path language -> `alternative_path`
- Keep `template_resolution.acknowledgment_profile` as the only source-of-truth profile key.
- Keep `required_artifacts` as inputs and `document_outputs` as generated deliverables.
- Preserve legal/source text in derived note fields.
- Use `Manual Review Required` to enforce generation gate behavior and force `review_status = needs_review` when true.
- Keep section keys and field keys stable for frontend reuse.
