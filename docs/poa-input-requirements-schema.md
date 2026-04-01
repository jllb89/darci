# POA Input Requirements Schema v2

This document defines the derived `input_requirements` contract for Power of Attorney workflows.

It is intentionally separate from `docs/POA_requirements.json`.

- `POA_requirements.json` is the legal/source layer.
- `input_requirements` is the product/workflow contract.
- Backend derives workflow requirements from legal rules plus curated overrides.
- Frontend renders from `input_requirements`, not raw legal prose.

This schema supports all POA workflow branches in one contract:

- `general`
- `durable`
- `medical`
- `limited`

## Core Architecture

Target system model:

1. legal rules -> normalized staging rules
2. normalized rules -> classification + capabilities + derived requirements
3. classification + poa_type -> base template
4. state -> overlay for execution formalities, notices, and clause behavior
5. member inputs -> fill base template + overlay

This keeps jurisdiction variation concentrated in normalization and overlays, rather than forking full templates per state.

## Goals

- One stable API contract for all POA workflows.
- Explicit classification, capabilities, and template-resolution support.
- Separate legal/source interpretation from product rendering.
- Preserve legal-source traceability and derivation auditability.
- Keep section/field semantics UI-agnostic.

## Non-Goals

- Replacing legal text in `POA_requirements.json`.
- Storing frontend component names.
- Modeling pixel-level rendering details.

## Source Normalization Staging

`POA_requirements.json` is useful but still phrase-heavy and partially mixed (for example `Not addressed`, `Varies by type`).

Before deriving final `input_requirements`, backend should generate a staging object from raw legal text:

```json
{
  "execution_rule": "NOTARY_OR_WITNESSES",
  "durability_rule": "DURABLE_IF_STATED",
  "specific_authority_rule": "EXPLICIT_REQUIRED",
  "effective_date_rule": "IMMEDIATE_OR_SPECIFIED",
  "statutory_form_rule": "AVAILABLE",
  "competency_rule": "CAPACITY_REQUIRED",
  "normalization_confidence": "high"
}
```

Suggested `normalization_confidence` values:

- `high`
- `medium`
- `low`

Low confidence should force `manual_review_required = true`.

## Top-Level Shape

```json
{
  "schema_version": "2026-04-01",
  "jurisdiction": "US-CA",
  "poa_type": "general",
  "ui_profile": "poa_standard",
  "derivation_mode": "rules_plus_overrides",
  "review_status": "draft",
  "api_representation_mode": "sectioned_plus_flattened_summaries",
  "classification": {
    "poa_system": "NON_UPOAA_STANDARD",
    "execution_model": "NOTARY_OR_WITNESSES"
  },
  "poa_capabilities": {
    "notary_required": true,
    "witnesses_required": true,
    "alternative_execution_path_allowed": true,
    "special_authority_initials_required": false,
    "statutory_form_available": true,
    "springing_authority_supported": true,
    "durability_default_presumed": false,
    "type_specific_execution_rules_present": false
  },
  "template_resolution": {
    "base_template_key": "poa_general_v2",
    "state_overlay_key": "ca_overlay_v2",
    "execution_profile": "CA_NOTARY_OR_2W"
  },
  "workflow": {
    "steps": [],
    "required_artifacts": [],
    "submission_checks": []
  },
  "sections": [],
  "section_summaries": {},
  "document_outputs": [],
  "notices": [],
  "source_trace": []
}
```

## Top-Level Field Definitions

- `schema_version`: version of this contract.
- `jurisdiction`: canonical key such as `US-CA`, `US-CT`.
- `poa_type`: branch for POA workflow behavior.
  Allowed values: `general`, `durable`, `medical`, `limited`.
- `ui_profile`: coarse rendering profile.
- `derivation_mode`: output production mode.
  Allowed values: `rules_only`, `rules_plus_overrides`, `manual_review`.
- `review_status`: confidence level.
  Allowed values: `draft`, `verified`, `needs_review`.
- `api_representation_mode`: response shape policy.
  Allowed values: `sectioned_only`, `sectioned_plus_flattened_summaries`.
- `classification`: legal/behavioral classification.
- `poa_capabilities`: normalized capability flags; keeps capability detail out of classification enums.
- `template_resolution`: base template plus state overlay selection.
- `workflow`: process sequencing and input prerequisites (`required_artifacts`) used before generation.
- `sections`: canonical semantic input sections and fields.
- `section_summaries`: optional flattened section mirrors for convenience reads.
- `document_outputs`: generated deliverables emitted by the system.
- `notices`: UI notices and warnings.
- `source_trace`: source mapping for audit/debug.

### Representation rules

- `sections` is the canonical contract representation.
- `section_summaries` is optional and read-only; it mirrors selected section values for convenience.
- If both are present, they must agree on overlapping values.
- New writes should target canonical `sections` values.

## Classification

```json
{
  "poa_system": "UPOAA_STANDARD",
  "execution_model": "NOTARY_ONLY"
}
```

### poa_system enum

- `UPOAA_STANDARD`
- `UPOAA_PLUS`
- `NON_UPOAA_STANDARD`
- `CIVIL_LAW_MANDATE`
- `HIGH_FORMALITY_VARIANT`

### execution_model enum

- `NOTARY_ONLY`
- `WITNESSES_ONLY`
- `NOTARY_OR_WITNESSES`
- `NOTARY_AND_WITNESSES`
- `FORMAL_ACT`
- `TYPE_SPECIFIC_VARIANT`

### Suggested classification derivation

- `CIVIL_LAW_MANDATE`
  - civil-law mandate posture or formal-act execution language.
- `HIGH_FORMALITY_VARIANT`
  - still POA-based but with elevated execution complexity (for example initials/capacity/witness/ack overlays).
- `UPOAA_PLUS`
  - UPOAA posture with notable execution overlays.
- `UPOAA_STANDARD`
  - UPOAA posture without major execution overlays.
- `NON_UPOAA_STANDARD`
  - non-UPOAA posture without civil-law/formal-act structure.

- `execution_model = NOTARY_OR_WITNESSES`
  - execution allows either notary route or witness route.
- `execution_model = NOTARY_AND_WITNESSES`
  - both notary and witness requirements apply.
- `execution_model = NOTARY_ONLY`
  - notary route required and witness route not required.
- `execution_model = WITNESSES_ONLY`
  - witness route required without notary requirement.
- `execution_model = TYPE_SPECIFIC_VARIANT`
  - legal text states behavior varies by POA type or transaction type.
- `execution_model = FORMAL_ACT`
  - execution follows formal-act/civil-law style requirements.

## POA Capabilities

This object captures feature signals independently from classification.

```json
{
  "notary_required": true,
  "witnesses_required": true,
  "alternative_execution_path_allowed": false,
  "special_authority_initials_required": true,
  "statutory_form_available": true,
  "springing_authority_supported": true,
  "durability_default_presumed": false,
  "type_specific_execution_rules_present": false
}
```

### poa_capabilities fields

- `notary_required`: notary execution path is required by default.
- `witnesses_required`: witness participation is required by default.
- `alternative_execution_path_allowed`: multiple compliant execution paths are available.
- `special_authority_initials_required`: explicit initials/signature required for specific authorities.
- `statutory_form_available`: jurisdiction provides statutory form(s).
- `springing_authority_supported`: authority can become effective on future condition/event.
- `durability_default_presumed`: durability is presumed without extra language.
- `type_specific_execution_rules_present`: legal text indicates type-specific execution variance.

### Capability usage notes

- Keep `classification` coarse; use `poa_capabilities` for feature-level branching.
- Capabilities are derived and may come from legal rules plus curated overlays.
- Missing certainty should default conservative and trigger manual review.

## Template Resolution

```json
{
  "base_template_key": "poa_general_v2",
  "state_overlay_key": "ct_overlay_v2",
  "execution_profile": "CT_NOTARY_AND_2W"
}
```

### Template fields

- `base_template_key`: selected by `poa_type` and optionally classification.
- `state_overlay_key`: state-specific overlays for execution text, notices, and branch behavior.
- `execution_profile`: execution/certificate profile key (single source of truth for execution profile display behavior).

Do not duplicate execution profile as separate competing profile fields in other sections.

### Suggested execution_profile enum

- `STANDARD_NOTARY`
- `STANDARD_WITNESSES`
- `CA_NOTARY_OR_2W`
- `CT_NOTARY_AND_2W`
- `FL_2W_PLUS_NOTARY`
- `NY_HIGH_FORMALITY`
- `LA_FORMAL_ACT`

## Workflow

```json
{
  "steps": [
    "poa_type_selection",
    "principal",
    "agent",
    "authority_scope",
    "durability",
    "effective_date",
    "execution_choice",
    "review"
  ],
  "required_artifacts": [
    "principal_identity_evidence",
    "agent_identity_information",
    "witness_information_if_required",
    "representative_capacity_evidence_if_required"
  ],
  "submission_checks": [
    "required_fields_complete",
    "required_execution_fields_complete",
    "required_special_authority_fields_complete",
    "manual_review_gate_if_applicable"
  ]
}
```

### Contract boundary: artifacts vs outputs

- `required_artifacts`: prerequisite inputs or uploads required before generation.
- `document_outputs`: generated deliverables produced after generation.
- Signed/generated execution artifacts belong in `document_outputs`, not in `required_artifacts`.

### required_artifacts by poa_type

- `general`
  - `principal_identity_evidence`
  - `agent_identity_information`
  - `witness_information_if_required`
- `durable`
  - `principal_identity_evidence`
  - `agent_identity_information`
  - `durability_clause_confirmation`
- `medical`
  - `principal_identity_evidence`
  - `agent_identity_information`
  - `healthcare_notice_acknowledgment_if_required`
- `limited`
  - `principal_identity_evidence`
  - `agent_identity_information`
  - `transaction_scope_details`

## Section Shape

```json
{
  "key": "principal",
  "title": "Principal",
  "presence": "required",
  "repeatable": false,
  "applies_to_poa_types": ["general", "durable", "medical", "limited"],
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
  "key": "principal_full_name",
  "label": "Principal full legal name",
  "semantic_type": "person_name",
  "required": true,
  "data_type": "string",
  "collect_from": "member",
  "default_source": "user_profile",
  "validation": {
    "min_length": 2,
    "max_length": 120
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

- `person_name`
- `person_address`
- `person_contact`
- `authority_selection`
- `special_authority_status`
- `special_authority_initials`
- `durability_status`
- `effective_date_status`
- `springing_trigger`
- `execution_model`
- `execution_requirement_status`
- `witness_count`
- `notary_requirement_status`
- `statutory_form_status`
- `competency_status`
- `recording_requirement_note`
- `legal_notice_acceptance`
- `manual_review_reason`

### data_type enum

- `string`
- `integer`
- `boolean`
- `date`
- `array`
- `object`

### collect_from enum

- `member`
- `principal`
- `agent`
- `notary`
- `witness`
- `system`

### default_source enum

- `none`
- `user_profile`
- `jurisdiction_default`
- `system_derived`
- `document_template`
- `previous_document`

### execution_requirement_status enum

- `required`
- `not_required`
- `conditional`
- `alternative_path`

### durability_default_status enum

- `durable_by_default`
- `durable_if_stated`
- `non_durable_by_default`
- `type_specific`
- `not_addressed`

### specific_authority_status enum

- `explicit_required`
- `explicit_required_with_initials`
- `not_required`
- `type_specific`
- `not_addressed`

### effective_date_status enum

- `immediate_default`
- `immediate_or_specified`
- `specified_event_allowed`
- `type_specific`
- `not_addressed`

### statutory_form_status enum

- `available`
- `available_not_mandatory`
- `multiple_forms_available`
- `not_available`
- `not_addressed`

### competency_status enum

- `capacity_required`
- `competent_adult_required`
- `sound_mind_required`
- `not_addressed`

## Conditions

```json
{
  "all": [
    {
      "fact": "poa_type",
      "operator": "equals",
      "value": "durable"
    }
  ]
}
```

### condition facts

- `poa_type`
- `poa_system`
- `execution_model`
- `execution_profile`
- `capability_notary_required`
- `capability_witnesses_required`
- `capability_alternative_execution_path_allowed`
- `capability_special_authority_initials_required`
- `capability_springing_authority_supported`
- `manual_review_required`
- `statutory_form_available`
- `recording_requirement_present`

### condition operators

- `equals`
- `not_equals`
- `in`
- `not_in`
- `is_true`
- `is_false`

## Canonical Sections

1. `document_context`
2. `principal`
3. `agent`
4. `successor_agent`
5. `authority_scope`
6. `durability`
7. `effective_date`
8. `execution_choice`
9. `witnesses`
10. `notary`
11. `special_instructions`
12. `statutory_notices`
13. `manual_review`

## Section Presence by POA Type

| Section | General | Durable | Medical | Limited |
|---|---|---|---|---|
| document_context | required | required | required | required |
| principal | required | required | required | required |
| agent | required | required | required | required |
| successor_agent | optional | optional | optional | optional |
| authority_scope | required | required | conditional | required |
| durability | optional | required | conditional | optional |
| effective_date | required | required | required | required |
| execution_choice | required | required | required | required |
| witnesses | conditional | conditional | conditional | conditional |
| notary | conditional | conditional | conditional | conditional |
| special_instructions | optional | optional | optional | optional |
| statutory_notices | required | required | required | required |
| manual_review | conditional | conditional | conditional | conditional |

Frontend rendering rule: `manual_review` must remain hidden unless `manual_review_required = true`.

## Core Field Catalog

### document_context

- `poa_type` (enum_single, required)
- `jurisdiction` (enum_single, required)
- `base_template_key` (string, required, system_derived)
- `state_overlay_key` (string, required, system_derived)
- `execution_profile` (enum_single, required, system_derived)

### principal

- `principal_full_name` (person_name, required)
- `principal_address` (person_address, required)
- `principal_contact` (person_contact, optional)

### agent

- `agent_full_name` (person_name, required)
- `agent_address` (person_address, required)
- `agent_contact` (person_contact, optional)

### authority_scope

- `authority_scope_selection` (authority_selection, required)
- `specific_authority_status` (specific_authority_status, required, system_derived)
- `special_authority_initials_required` (boolean, required, system_derived)
- `special_authority_initials` (special_authority_initials, conditional)

### durability

- `durability_default_status` (durability_default_status, required, system_derived)
- `durability_clause_required` (boolean, conditional, system_derived)
- `durability_clause_text` (text, conditional, system_derived)

### effective_date

- `effective_date_status` (effective_date_status, required, system_derived)
- `springing_authority_supported` (boolean, required, system_derived)
- `springing_trigger_description` (springing_trigger, conditional)

### execution_choice

- `execution_model` (execution_model, required, system_derived)
- `notary_required_status` (execution_requirement_status, required, system_derived)
- `witnesses_required_status` (execution_requirement_status, required, system_derived)
- `alternative_execution_path_allowed` (boolean, conditional, system_derived)
- `execution_model_basis` (text, conditional, system_derived)

### witnesses

- `witness_count_minimum` (witness_count, conditional, system_derived)
- `witness_eligibility_note` (text, conditional, system_derived)

### notary

- `notary_acknowledgment_required` (boolean, conditional, system_derived)
- `notary_certificate_note` (text, conditional, system_derived)

### statutory_notices

- `statutory_form_status` (statutory_form_status, required, system_derived)
- `competency_status` (competency_status, required, system_derived)
- `competency_notice` (text, conditional, system_derived)
- `recording_requirement_note` (recording_requirement_note, conditional, system_derived)

### manual_review

- `manual_review_required` (boolean, required, system_derived)
- `manual_review_reason` (text, conditional, system_derived)

Execution profile source of truth remains `template_resolution.execution_profile`.

## Derivation Mapping From POA Requirements

Mappings are direct and do not reinterpret legal meaning.

- `Jurisdiction` -> `document_context.jurisdiction`
- `Governing Law` -> classification support + `source_trace`
- `Execution Requirements` + `Acknowledgment/Witnessing` -> `classification.execution_model`, `execution_choice.*`, `poa_capabilities.notary_required`, `poa_capabilities.witnesses_required`, `poa_capabilities.alternative_execution_path_allowed`
- `Durability` -> `durability.durability_default_status`, `durability.durability_clause_required`, `poa_capabilities.durability_default_presumed`
- `Specific Authority Required for Certain Acts` -> `authority_scope.specific_authority_status`, `authority_scope.special_authority_initials_required`, `poa_capabilities.special_authority_initials_required`
- `Statutory Form Available` -> `statutory_notices.statutory_form_status`, `poa_capabilities.statutory_form_available`
- `Effective Date` -> `effective_date.effective_date_status`, `effective_date.springing_authority_supported`, `poa_capabilities.springing_authority_supported`
- `Competency Requirement` -> `statutory_notices.competency_status`, `statutory_notices.competency_notice`

## Normalization Guidance

Normalize source text to lowercase, trim whitespace, and apply first-match-wins in listed priority order.

### Compact normalization decision table

#### execution_model

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "varies by type", "varies" | `TYPE_SPECIFIC_VARIANT` |
| 2 | "formal act", "authentic act", "civil code mandate" | `FORMAL_ACT` |
| 3 | "notary public and two witnesses", "notarized and witnessed", "two witnesses, notarized" | `NOTARY_AND_WITNESSES` |
| 4 | "notary public or two witnesses", "notarized or witnessed" | `NOTARY_OR_WITNESSES` |
| 5 | "two witnesses" without notary phrasing | `WITNESSES_ONLY` |
| 6 | "acknowledged before notary public", "signed before notary" | `NOTARY_ONLY` |

#### execution_requirement_status

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "or" between compliant paths | `alternative_path` |
| 2 | "if", "when", "depending on", "type-specific" | `conditional` |
| 3 | "not required" | `not_required` |
| 4 | "required", "must", "shall", "signed before", "acknowledged" | `required` |

#### durability_default_status

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "presumed durable unless stated otherwise", "durable unless stated otherwise" | `durable_by_default` |
| 2 | "durable if specific language included", "durable if specific notices included" | `durable_if_stated` |
| 3 | "varies by type" | `type_specific` |
| 4 | "not addressed" | `not_addressed` |

#### specific_authority_status

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "separate signature/initial", "superpowers" | `explicit_required_with_initials` |
| 2 | "yes", "for certain acts", "for actions like" | `explicit_required` |
| 3 | "varies by type" | `type_specific` |
| 4 | "not addressed" | `not_addressed` |

#### effective_date_status

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "upon execution unless otherwise specified" | `immediate_default` |
| 2 | "upon execution or as specified" | `immediate_or_specified` |
| 3 | "upon execution or specified event" | `specified_event_allowed` |
| 4 | "varies by type" | `type_specific` |
| 5 | "not addressed" | `not_addressed` |

#### statutory_form_status

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "yes, short and long forms", "general and health care" | `multiple_forms_available` |
| 2 | "yes, but not mandatory", "yes, but voluntary" | `available_not_mandatory` |
| 3 | "yes" | `available` |
| 4 | "not addressed" | `not_addressed` |

#### competency_status

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "capacity to contract", "capacity to understand" | `capacity_required` |
| 2 | "competent adult", "competent at time of execution", "sufficient mental capacity" | `competent_adult_required` |
| 3 | "sound mind" | `sound_mind_required` |
| 4 | "not addressed" | `not_addressed` |

Default rule when no matching phrase is found:

- set status to the most conservative conditional/type-specific value.
- set `manual_review_required = true`.
- include raw text in `source_trace` for explainability.

## Review State Rules

- If `manual_review.manual_review_required = true`, then `review_status` MUST be `needs_review`.
- If `manual_review.manual_review_required = false`, `review_status` may be `draft` or `verified`.
- `review_status = verified` requires submission checks to pass and no active manual-review gate.
- `derivation_mode = manual_review` should set `manual_review.manual_review_required = true` and `review_status = needs_review`.

## Document Outputs

```json
[
  {
    "key": "generated_poa_document",
    "required": true,
    "output_category": "legal_requirement"
  },
  {
    "key": "notary_acknowledgment",
    "required": false,
    "output_category": "legal_requirement",
    "when": {
      "all": [
        {
          "fact": "capability_notary_required",
          "operator": "is_true"
        }
      ]
    }
  },
  {
    "key": "witness_attestation",
    "required": false,
    "output_category": "legal_requirement",
    "when": {
      "all": [
        {
          "fact": "capability_witnesses_required",
          "operator": "is_true"
        }
      ]
    }
  },
  {
    "key": "special_authority_initials_page",
    "required": false,
    "output_category": "legal_requirement",
    "when": {
      "all": [
        {
          "fact": "capability_special_authority_initials_required",
          "operator": "is_true"
        }
      ]
    }
  },
  {
    "key": "generation_review_report",
    "required": false,
    "output_category": "operational_optional",
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

### output_category enum

- `legal_requirement`
- `operational_optional`

## Notices

```json
[
  {
    "key": "capacity_required_notice",
    "severity": "info",
    "message": "The principal must have required legal capacity at execution."
  },
  {
    "key": "execution_formality_notice",
    "severity": "info",
    "message": "Execution formalities vary by jurisdiction and POA type."
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
    "source": "poa_requirements",
    "field": "Acknowledgment/Witnessing",
    "value": "Acknowledged before notary public or two witnesses"
  },
  {
    "source": "poa_requirements",
    "field": "Specific Authority Required for Certain Acts",
    "value": "Yes, \"superpowers\" require separate signature/initial"
  }
]
```

## Pilot Example A: California General POA

```json
{
  "jurisdiction": "US-CA",
  "poa_type": "general",
  "api_representation_mode": "sectioned_plus_flattened_summaries",
  "classification": {
    "poa_system": "NON_UPOAA_STANDARD",
    "execution_model": "NOTARY_OR_WITNESSES"
  },
  "poa_capabilities": {
    "notary_required": true,
    "witnesses_required": true,
    "alternative_execution_path_allowed": true,
    "special_authority_initials_required": false,
    "statutory_form_available": true,
    "springing_authority_supported": true,
    "durability_default_presumed": false,
    "type_specific_execution_rules_present": false
  },
  "template_resolution": {
    "base_template_key": "poa_general_v2",
    "state_overlay_key": "ca_overlay_v2",
    "execution_profile": "CA_NOTARY_OR_2W"
  },
  "section_summaries": {
    "execution_choice": {
      "notary_required_status": "alternative_path",
      "witnesses_required_status": "alternative_path",
      "execution_model_basis": "Acknowledgment/Witnessing contains notary OR two witnesses"
    }
  },
  "sections": [
    { "key": "principal", "presence": "required" },
    { "key": "agent", "presence": "required" },
    { "key": "authority_scope", "presence": "required" },
    { "key": "execution_choice", "presence": "required" },
    { "key": "witnesses", "presence": "conditional" },
    { "key": "notary", "presence": "conditional" }
  ]
}
```

## Pilot Example B: Connecticut General POA

```json
{
  "jurisdiction": "US-CT",
  "poa_type": "general",
  "api_representation_mode": "sectioned_only",
  "classification": {
    "poa_system": "UPOAA_PLUS",
    "execution_model": "NOTARY_AND_WITNESSES"
  },
  "poa_capabilities": {
    "notary_required": true,
    "witnesses_required": true,
    "alternative_execution_path_allowed": false,
    "special_authority_initials_required": false,
    "statutory_form_available": true,
    "springing_authority_supported": true,
    "durability_default_presumed": true,
    "type_specific_execution_rules_present": false
  },
  "template_resolution": {
    "base_template_key": "poa_general_v2",
    "state_overlay_key": "ct_overlay_v2",
    "execution_profile": "CT_NOTARY_AND_2W"
  },
  "sections": [
    { "key": "execution_choice", "presence": "required" },
    { "key": "witnesses", "presence": "required" },
    { "key": "notary", "presence": "required" }
  ],
  "document_outputs": [
    { "key": "notary_acknowledgment", "required": true, "output_category": "legal_requirement" },
    { "key": "witness_attestation", "required": true, "output_category": "legal_requirement" }
  ]
}
```

## Pilot Example C: Florida General POA

```json
{
  "jurisdiction": "US-FL",
  "poa_type": "general",
  "api_representation_mode": "sectioned_plus_flattened_summaries",
  "classification": {
    "poa_system": "HIGH_FORMALITY_VARIANT",
    "execution_model": "NOTARY_AND_WITNESSES"
  },
  "poa_capabilities": {
    "notary_required": true,
    "witnesses_required": true,
    "alternative_execution_path_allowed": false,
    "special_authority_initials_required": true,
    "statutory_form_available": false,
    "springing_authority_supported": true,
    "durability_default_presumed": false,
    "type_specific_execution_rules_present": false
  },
  "template_resolution": {
    "base_template_key": "poa_general_v2",
    "state_overlay_key": "fl_overlay_v2",
    "execution_profile": "FL_2W_PLUS_NOTARY"
  },
  "section_summaries": {
    "authority_scope": {
      "specific_authority_status": "explicit_required_with_initials",
      "special_authority_initials_required": true
    }
  },
  "sections": [
    { "key": "authority_scope", "presence": "required" },
    { "key": "witnesses", "presence": "required" },
    { "key": "notary", "presence": "required" }
  ]
}
```

## Pilot Example D: New York General POA

```json
{
  "jurisdiction": "US-NY",
  "poa_type": "general",
  "api_representation_mode": "sectioned_plus_flattened_summaries",
  "classification": {
    "poa_system": "HIGH_FORMALITY_VARIANT",
    "execution_model": "NOTARY_AND_WITNESSES"
  },
  "poa_capabilities": {
    "notary_required": true,
    "witnesses_required": true,
    "alternative_execution_path_allowed": false,
    "special_authority_initials_required": true,
    "statutory_form_available": true,
    "springing_authority_supported": true,
    "durability_default_presumed": true,
    "type_specific_execution_rules_present": false
  },
  "template_resolution": {
    "base_template_key": "poa_general_v2",
    "state_overlay_key": "ny_overlay_v2",
    "execution_profile": "NY_HIGH_FORMALITY"
  },
  "section_summaries": {
    "execution_choice": {
      "execution_model_basis": "Acknowledgment as real-property conveyance plus two witnesses"
    },
    "authority_scope": {
      "special_authority_initials_required": true
    }
  },
  "sections": [
    { "key": "principal", "presence": "required" },
    { "key": "agent", "presence": "required" },
    { "key": "authority_scope", "presence": "required" },
    { "key": "execution_choice", "presence": "required" },
    { "key": "witnesses", "presence": "required" },
    { "key": "notary", "presence": "required" }
  ]
}
```

## Implementation Notes

- Derive a normalization staging layer before assembling final `input_requirements`.
- Keep `sections` canonical and use `section_summaries` only for convenience reads.
- Keep `template_resolution.execution_profile` as single source of truth for execution profile behavior.
- Keep `required_artifacts` as inputs and `document_outputs` as generated outputs.
- Force manual review for low-confidence normalization or type-specific ambiguity.
- Test first with `US-CA`, `US-CT`, `US-FL`, and `US-NY` to validate execution complexity.