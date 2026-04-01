# IDN Input Requirements Schema v1.2

This document defines the derived `input_requirements` contract for IDN workflows.

It is intentionally separate from `docs/IDN_requirements.json`.

- `IDN_requirements.json` is the legal/source layer.
- `input_requirements` is the product/workflow contract.
- Backend derives workflow requirements from legal rules plus curated overrides.
- Frontend renders from `input_requirements`, not raw legal prose.

This schema supports all IDN notarial workflow branches in one contract:

- `acknowledgment` (certificate generation + execution wrapper)
- `authentic_act` (execution wrapper in authentic-act contexts)
- `public_instrument` (execution wrapper in public-instrument contexts)

## Document Type Scope

`document_type` controls wrapper behavior for notarial execution and certificate handling.

- It does include acknowledgment/execution wrapper behavior and required artifacts/outputs.
- It does not include full drafting of civil-law instrument body text.
- `public_instrument` means wrapper handling around a public-instrument context, not full instrument generation.

## Core Architecture

Target system model:

1. legal rules -> classification + derived requirements
2. classification + document type -> base template
3. state/territory -> small overlay (especially acknowledgment language, channel rules, and notices)
4. member inputs -> fill base template + overlay

This keeps jurisdiction variation concentrated in validation and overlays, rather than forking full templates per jurisdiction.

## Goals

- One stable API contract for all IDN notarial branches.
- Explicit base-template and jurisdiction-overlay support.
- Separate legal-system family from channel behavior.
- Preserve legal-source traceability and derivation auditability.
- Keep section/field semantics UI-agnostic.

## Non-Goals

- Replacing legal text in `IDN_requirements.json`.
- Storing frontend component names.
- Modeling pixel-level rendering details.
- Drafting full civil-law authentic-act or public-instrument body text.

## Top-Level Shape

```json
{
  "schema_version": "2026-04-01",
  "jurisdiction": "US-CA",
  "document_type": "acknowledgment",
  "ui_profile": "idn_standard",
  "derivation_mode": "rules_plus_overrides",
  "review_status": "draft",
  "api_representation_mode": "sectioned_plus_flattened_summaries",
  "classification": {
    "notarial_system": "COMMON_LAW_STANDARD",
    "execution_presence_mode": "IN_PERSON_ONLY",
    "digital_channel_status": "E_NOTARIZATION_AUTHORIZED_NO_RON"
  },
  "notary_capabilities": {
    "ron_allowed": false,
    "e_notarization_allowed": true,
    "witnesses_required_for_primary_act": false,
    "personal_knowledge_only_identification_allowed": false,
    "credible_witness_identification_allowed": true,
    "commission_expiration_on_certificate_required": false
  },
  "template_resolution": {
    "base_template_key": "idn_acknowledgment_v1",
    "jurisdiction_overlay_key": "ca_overlay_v1",
    "acknowledgment_profile": "CA_STATUTORY_ACK"
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
- `jurisdiction`: canonical key such as `US-CA`, `US-NY`, `US-PR`.
- `document_type`: IDN workflow branch.
  Allowed values: `acknowledgment`, `authentic_act`, `public_instrument`.
  Scope: wrapper behavior only; not full civil-law instrument drafting.
- `ui_profile`: coarse rendering profile.
- `derivation_mode`: output production mode.
  Allowed values: `rules_only`, `rules_plus_overrides`, `manual_review`.
- `review_status`: confidence level.
  Allowed values: `draft`, `verified`, `needs_review`.
- `api_representation_mode`: response shape policy.
  Allowed values: `sectioned_only`, `sectioned_plus_flattened_summaries`.
- `classification`: legal/behavioral classification.
- `notary_capabilities`: normalized capability flags; keeps capability detail out of classification enums.
- `template_resolution`: base template plus jurisdiction overlay selection.
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
  "notarial_system": "COMMON_LAW_STANDARD",
  "execution_presence_mode": "IN_PERSON_ONLY",
  "digital_channel_status": "E_NOTARIZATION_AUTHORIZED_NO_RON"
}
```

### notarial_system enum

- `COMMON_LAW_STANDARD`
- `COMMON_LAW_VARIANT`
- `CIVIL_LAW_AUTHENTIC_ACT`
- `CIVIL_LAW_PUBLIC_INSTRUMENT`

### execution_presence_mode enum

- `IN_PERSON_ONLY`
- `IN_PERSON_OR_REMOTE_ALLOWED`
- `CIVIL_LAW_IN_PERSON_DEFAULT`

### digital_channel_status enum

- `RON_AUTHORIZED`
- `E_NOTARIZATION_AUTHORIZED_NO_RON`
- `DIGITAL_NOT_AUTHORIZED`
- `DIGITAL_STATUS_EVOLVING`

### Suggested classification derivation

- `CIVIL_LAW_PUBLIC_INSTRUMENT`
  - civil-law, public-instrument regime (for example Puerto Rico style protocol model).
- `CIVIL_LAW_AUTHENTIC_ACT`
  - civil-law authentic-act execution (for example Louisiana style).
- `COMMON_LAW_VARIANT`
  - still fundamentally common-law acknowledgment based, but not safely handled by the standard short-form model alone (for example capacity/certificate overlays).
- `COMMON_LAW_STANDARD`
  - common-law statutory acknowledgment posture without major structural overlay.

`COMMON_LAW_VARIANT` is not a channel bucket. Channel differences should be modeled through `execution_presence_mode` and `digital_channel_status`.

- `execution_presence_mode = IN_PERSON_OR_REMOTE_ALLOWED`
  - jurisdiction text authorizes remote online notarization path.
- `execution_presence_mode = IN_PERSON_ONLY`
  - execution posture remains in-person only.
- `execution_presence_mode = CIVIL_LAW_IN_PERSON_DEFAULT`
  - civil-law in-person execution posture is primary by design.

- `digital_channel_status = RON_AUTHORIZED`
  - jurisdiction text authorizes remote online notarization.
- `digital_channel_status = E_NOTARIZATION_AUTHORIZED_NO_RON`
  - in-person electronic notarization allowed; RON not authorized.
- `digital_channel_status = DIGITAL_NOT_AUTHORIZED`
  - no digital notarization channel is authorized.
- `digital_channel_status = DIGITAL_STATUS_EVOLVING`
  - legal status is limited, partial, or actively evolving.

## Notary Capabilities

This object captures feature signals independently from classification.

```json
{
  "ron_allowed": true,
  "e_notarization_allowed": true,
  "witnesses_required_for_primary_act": false,
  "personal_knowledge_only_identification_allowed": true,
  "credible_witness_identification_allowed": true,
  "commission_expiration_on_certificate_required": true
}
```

### notary_capabilities fields

- `ron_allowed`: jurisdiction posture authorizes remote online notarization.
- `e_notarization_allowed`: in-person electronic notarization is broadly allowed.
- `witnesses_required_for_primary_act`: primary act requires witnesses (for example authentic acts).
- `personal_knowledge_only_identification_allowed`: personal knowledge alone can satisfy signer identification.
- `credible_witness_identification_allowed`: credible witness path can satisfy signer identification.
- `commission_expiration_on_certificate_required`: commission expiration must appear on the certificate.

### Capability usage notes

- Keep `classification` coarse; use `notary_capabilities` for feature-level branching.
- Capability booleans are derived and may come from legal rules plus curated overlays.
- Missing capability certainty should default to conservative (`false`) with `manual_review_required` when needed.

## Template Resolution

```json
{
  "base_template_key": "idn_acknowledgment_v1",
  "jurisdiction_overlay_key": "ny_overlay_v1",
  "acknowledgment_profile": "NY_CAPACITY_ACK"
}
```

### Template fields

- `base_template_key`: selected by `document_type` and optionally classification.
- `jurisdiction_overlay_key`: jurisdiction-specific overlays for channel rules, notices, and certificate language.
- `acknowledgment_profile`: acknowledgment/notarial certificate profile key (single source of truth).

Do not duplicate this as a separate canonical field under certificate sections; field-level display metadata should be derived from this value.

### Suggested acknowledgment profile enum

- `STANDARD_ACK`
- `CA_STATUTORY_ACK`
- `NY_CAPACITY_ACK`
- `LA_AUTHENTIC_ACT`
- `PR_PUBLIC_INSTRUMENT`

## Workflow

```json
{
  "steps": [
    "document_type_selection",
    "jurisdiction_selection",
    "signer_identity",
    "venue_and_commission",
    "certificate_requirements",
    "seal_and_stamp",
    "review"
  ],
  "required_artifacts": [
    "document_to_be_notarized",
    "signer_identity_evidence",
    "witness_information_if_required"
  ],
  "submission_checks": [
    "required_fields_complete",
    "required_identity_rules_complete",
    "required_certificate_elements_complete",
    "required_seal_elements_complete",
    "manual_review_gate_if_applicable"
  ]
}
```

### Contract boundary: artifacts vs outputs

- `required_artifacts`: prerequisite inputs or uploads required before generation.
- `document_outputs`: generated deliverables produced after generation.
- Generated certificate pages or execution packets belong in `document_outputs`, not in `required_artifacts`.

### required_artifacts by document type

- `acknowledgment`
  - `document_to_be_notarized`
  - `signer_identity_evidence`
- `authentic_act`
  - `document_to_be_notarized`
  - `signer_identity_evidence`
  - `witness_information`
- `public_instrument`
  - `document_to_be_notarized`
  - `party_identity_evidence`
  - `representative_capacity_evidence`
  - `witness_bundle_if_applicable`

## Section Shape

```json
{
  "key": "signer_identity",
  "title": "Signer Identity",
  "presence": "required",
  "repeatable": false,
  "applies_to_document_types": ["acknowledgment", "authentic_act", "public_instrument"],
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
  "key": "signer_identification_rule",
  "label": "Signer identification rule",
  "semantic_type": "signer_identification_rule",
  "required": true,
  "data_type": "string",
  "collect_from": "system",
  "default_source": "none",
  "validation": {
    "min_length": 2,
    "max_length": 500
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

- `jurisdiction`
- `governing_law_reference`
- `acknowledgment_form_type`
- `notary_commission_authority`
- `venue_requirement_note`
- `signer_identification_rule`
- `witness_requirement_status`
- `ron_status`
- `e_notarization_status`
- `required_certificate_elements`
- `permitted_optional_certificate_elements`
- `prohibited_certificate_elements`
- `statutory_short_form_available`
- `custom_certificate_language_required`
- `seal_requirement_status`
- `seal_required_elements`
- `commission_expiration_status`
- `recording_requirement_note`
- `signer_competency_note`
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
- `system`
- `notary`
- `witness`

### default_source enum

- `none`
- `jurisdiction_default`
- `system_derived`
- `document_template`
- `previous_document`

### requirement_status enum

- `required`
- `not_required`
- `conditional`
- `not_applicable`

### availability_status enum

- `allowed`
- `not_allowed`
- `limited`
- `evolving`

## Conditions

```json
{
  "all": [
    {
      "fact": "document_type",
      "operator": "equals",
      "value": "acknowledgment"
    }
  ]
}
```

### condition facts

- `document_type`
- `notarial_system`
- `execution_presence_mode`
- `digital_channel_status`
- `acknowledgment_profile`
- `capability_ron_allowed`
- `capability_e_notarization_allowed`
- `capability_witnesses_required_for_primary_act`
- `capability_credible_witness_identification_allowed`
- `manual_review_required`
- `recording_requirement_present`
- `commission_expiration_required`

### condition operators

- `equals`
- `not_equals`
- `in`
- `not_in`
- `is_true`
- `is_false`

## Canonical Sections

1. `document_context`
2. `legal_basis`
3. `signer_identity`
4. `venue_and_commission`
5. `witness_and_competency`
6. `notarization_channel`
7. `certificate_requirements`
8. `seal_and_stamp`
9. `recording_requirements`
10. `manual_review`

## Section Presence by Document Type

| Section | Acknowledgment | Authentic Act | Public Instrument |
|---|---|---|---|
| document_context | required | required | required |
| legal_basis | required | required | required |
| signer_identity | required | required | required |
| venue_and_commission | required | required | required |
| witness_and_competency | conditional | required | conditional |
| notarization_channel | required | required | required |
| certificate_requirements | required | required | required |
| seal_and_stamp | required | required | required |
| recording_requirements | required | required | required |
| manual_review | conditional | conditional | conditional |

Frontend rendering rule: `manual_review` must remain hidden unless `manual_review_required = true`.

## Core Field Catalog

### document_context

- `document_type` (enum_single, required)
- `jurisdiction` (enum_single, required)
- `base_template_key` (string, required, system_derived)
- `jurisdiction_overlay_key` (string, required, system_derived)
- `acknowledgment_profile` (enum_single, required, system_derived)

### legal_basis

- `governing_law_reference` (text, required, system_derived)
- `acknowledgment_form_type` (text, required, system_derived)
- `notary_commission_authority` (text, required, system_derived)

### signer_identity

- `signer_identification_rule` (text, required, system_derived)
- `personal_knowledge_only_identification_allowed` (boolean, required, system_derived)
- `credible_witness_identification_allowed` (boolean, conditional, system_derived)

### venue_and_commission

- `venue_requirement_note` (text, required, system_derived)
- `commission_expiration_status` (requirement_status, required, system_derived)

### witness_and_competency

- `witness_requirement_status` (requirement_status, required, system_derived)
- `witness_count_minimum` (integer, conditional, system_derived)
- `signer_competency_note` (text, required, system_derived)

### notarization_channel

- `ron_status` (availability_status, required, system_derived)
- `e_notarization_status` (availability_status, required, system_derived)
- `personal_appearance_required` (boolean, required, system_derived)
- `personal_appearance_basis` (text, conditional, system_derived)

`personal_appearance_required` should be derived from `classification.execution_presence_mode` and `document_type`. If legal text is nuanced or evolving, keep conservative `true`, populate `personal_appearance_basis`, and set `manual_review_required = true`.

### certificate_requirements

- `required_certificate_elements` (array, required, system_derived)
- `permitted_optional_certificate_elements` (array, optional, system_derived)
- `prohibited_certificate_elements` (array, conditional, system_derived)
- `certificate_language_note` (text, conditional, system_derived)
- `statutory_short_form_available` (boolean, required, system_derived)
- `custom_certificate_language_required` (boolean, required, system_derived)

### seal_and_stamp

- `seal_requirement_status` (requirement_status, required, system_derived)
- `seal_required_elements` (array, conditional, system_derived)
- `seal_format_notes` (text, optional, system_derived)

### recording_requirements

- `recording_requirement_note` (text, required, system_derived)
- `recording_acknowledgment_required` (boolean, conditional, system_derived)

### manual_review

- `manual_review_required` (boolean, required, system_derived)
- `manual_review_reason` (text, conditional, system_derived)

Acknowledgment profile source of truth remains `template_resolution.acknowledgment_profile`.

## Derivation Mapping From IDN Requirements

Mappings are direct and do not reinterpret legal meaning.

- `Jurisdiction` -> `document_context.jurisdiction`
- `Governing Law` -> `legal_basis.governing_law_reference`
- `Acknowledgment Form` -> `legal_basis.acknowledgment_form_type`, `template_resolution.acknowledgment_profile`, `certificate_requirements.statutory_short_form_available`, `certificate_requirements.custom_certificate_language_required`
- `Notary Commission Authority` -> `legal_basis.notary_commission_authority`
- `Venue Requirement` -> `venue_and_commission.venue_requirement_note`
- `Signer Identification` -> `signer_identity.signer_identification_rule`, `signer_identity.personal_knowledge_only_identification_allowed`, `signer_identity.credible_witness_identification_allowed`, `notary_capabilities.personal_knowledge_only_identification_allowed`, `notary_capabilities.credible_witness_identification_allowed`
- `Witness Requirements` -> `witness_and_competency.witness_requirement_status`, `witness_and_competency.witness_count_minimum`, `notary_capabilities.witnesses_required_for_primary_act`
- `Remote Online Notarization (RON)` -> `notarization_channel.ron_status`, `classification.execution_presence_mode`, `classification.digital_channel_status`, `notary_capabilities.ron_allowed`
- `E-Notarization` -> `notarization_channel.e_notarization_status`, `classification.digital_channel_status`, `notary_capabilities.e_notarization_allowed`
- `Remote Online Notarization (RON)` + `E-Notarization` + `document_type` -> `notarization_channel.personal_appearance_required`, `notarization_channel.personal_appearance_basis`
- `Notarial Certificate Required Elements` -> `certificate_requirements.required_certificate_elements`
- `Seal/Stamp Requirements` -> `seal_and_stamp.seal_requirement_status`, `seal_and_stamp.seal_required_elements`, `seal_and_stamp.seal_format_notes`
- `Commission Expiration on Certificate` -> `venue_and_commission.commission_expiration_status`, `notary_capabilities.commission_expiration_on_certificate_required`
- `Recording Requirements` -> `recording_requirements.recording_requirement_note`, `recording_requirements.recording_acknowledgment_required`
- `Competency of Signer` -> `witness_and_competency.signer_competency_note`

### Normalization guidance

Normalize source text to lowercase, trim whitespace, and apply first-match-wins in listed priority order.

### Compact normalization decision table

#### requirement_status

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "not applicable", "n/a", "does not apply" | `not_applicable` |
| 2 | "if", "when", "unless", "only in specific cases", "may be required", "depending on" | `conditional` |
| 3 | "not required", "no witness required", "not necessary" | `not_required` |
| 4 | "required", "must", "shall", "mandatory" | `required` |

#### availability_status

| Priority | Source phrase patterns (case-insensitive) | Normalized status |
|---|---|---|
| 1 | "not authorized", "not permitted", "prohibited", "not allowed" | `not_allowed` |
| 2 | "not fully implemented", "evolving", "under evolving regulations" | `evolving` |
| 3 | "limited", "partial", "pilot" | `limited` |
| 4 | "authorized", "permitted", "allowed" | `allowed` |

#### certificate form posture flags

| Derived field | Source phrase patterns (case-insensitive) | Output |
|---|---|---|
| `certificate_requirements.statutory_short_form_available` | "mandatory statutory form", "statutory short form", "exact statutory wording", "substantially conform" | `true` |
| `certificate_requirements.custom_certificate_language_required` | "authentic act", "public instrument", "civil law", "protocol" | `true` |

Default rule when no matching phrase is found:

- `requirement_status`: `conditional` and add `manual_review_required = true`.
- `availability_status`: `limited` and add `manual_review_required = true`.
- certificate posture flags: both `false` unless legal-source text clearly triggers them.

## Review State Rules

- If `manual_review.manual_review_required = true`, then `review_status` MUST be `needs_review`.
- If `manual_review.manual_review_required = false`, `review_status` may be `draft` or `verified`.
- `review_status = verified` requires submission checks to pass and no active manual-review gate.
- `derivation_mode = manual_review` should set `manual_review.manual_review_required = true` and `review_status = needs_review`.

## Document Outputs

```json
[
  {
    "key": "generated_notarial_certificate",
    "required": true
  },
  {
    "key": "jurisdiction_acknowledgment_page",
    "required": false,
    "when": {
      "all": [
        {
          "fact": "acknowledgment_profile",
          "operator": "in",
          "value": ["CA_STATUTORY_ACK", "NY_CAPACITY_ACK", "LA_AUTHENTIC_ACT", "PR_PUBLIC_INSTRUMENT"]
        }
      ]
    }
  },
  {
    "key": "execution_packet",
    "required": false,
    "when": {
      "all": [
        {
          "fact": "document_type",
          "operator": "in",
          "value": ["acknowledgment", "authentic_act", "public_instrument"]
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
    "key": "identity_rule_notice",
    "severity": "info",
    "message": "Signer identification rules vary by jurisdiction and may allow personal knowledge, satisfactory evidence, or credible witnesses."
  },
  {
    "key": "digital_channel_notice",
    "severity": "info",
    "message": "RON and electronic notarization permissions vary by jurisdiction and channel configuration."
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
    "source": "idn_requirements",
    "field": "Remote Online Notarization (RON)",
    "value": "NOT authorized; California requires personal appearance before the notary"
  },
  {
    "source": "idn_requirements",
    "field": "Commission Expiration on Certificate",
    "value": "Required"
  }
]
```

## Example A: IDN Acknowledgment (CA)

```json
{
  "jurisdiction": "US-CA",
  "document_type": "acknowledgment",
  "api_representation_mode": "sectioned_plus_flattened_summaries",
  "classification": {
    "notarial_system": "COMMON_LAW_STANDARD",
    "execution_presence_mode": "IN_PERSON_ONLY",
    "digital_channel_status": "E_NOTARIZATION_AUTHORIZED_NO_RON"
  },
  "notary_capabilities": {
    "ron_allowed": false,
    "e_notarization_allowed": true,
    "witnesses_required_for_primary_act": false,
    "personal_knowledge_only_identification_allowed": false,
    "credible_witness_identification_allowed": true,
    "commission_expiration_on_certificate_required": false
  },
  "template_resolution": {
    "base_template_key": "idn_acknowledgment_v1",
    "jurisdiction_overlay_key": "ca_overlay_v1",
    "acknowledgment_profile": "CA_STATUTORY_ACK"
  },
  "workflow": {
    "required_artifacts": [
      "document_to_be_notarized",
      "signer_identity_evidence"
    ]
  },
  "section_summaries": {
    "notarization_channel": {
      "ron_status": "not_allowed",
      "e_notarization_status": "allowed",
      "personal_appearance_required": true,
      "personal_appearance_basis": "IN_PERSON_ONLY plus RON not authorized"
    },
    "certificate_requirements": {
      "statutory_short_form_available": true,
      "custom_certificate_language_required": false
    }
  },
  "source_trace": [
    {
      "source": "idn_requirements",
      "field": "Commission Expiration on Certificate",
      "value": "Not required"
    }
  ],
  "sections": [
    { "key": "document_context", "presence": "required" },
    { "key": "signer_identity", "presence": "required" },
    { "key": "certificate_requirements", "presence": "required" },
    { "key": "seal_and_stamp", "presence": "required" }
  ]
}
```

`execution_presence_mode = IN_PERSON_ONLY` plus `digital_channel_status = E_NOTARIZATION_AUTHORIZED_NO_RON` means RON is not authorized while in-person electronic notarization can still be allowed. The acknowledgment page behavior is controlled by `template_resolution.acknowledgment_profile` plus overlay rules.

The California example intentionally sets `commission_expiration_on_certificate_required = false` to match the source row value `Commission Expiration on Certificate: Not required`. This is separate from seal content requirements.

## Example B: IDN Acknowledgment (NY)

```json
{
  "jurisdiction": "US-NY",
  "document_type": "acknowledgment",
  "api_representation_mode": "sectioned_only",
  "classification": {
    "notarial_system": "COMMON_LAW_VARIANT",
    "execution_presence_mode": "IN_PERSON_OR_REMOTE_ALLOWED",
    "digital_channel_status": "RON_AUTHORIZED"
  },
  "notary_capabilities": {
    "ron_allowed": true,
    "e_notarization_allowed": true,
    "witnesses_required_for_primary_act": false,
    "personal_knowledge_only_identification_allowed": true,
    "credible_witness_identification_allowed": false,
    "commission_expiration_on_certificate_required": true
  },
  "template_resolution": {
    "base_template_key": "idn_acknowledgment_v1",
    "jurisdiction_overlay_key": "ny_overlay_v1",
    "acknowledgment_profile": "NY_CAPACITY_ACK"
  },
  "sections": [
    { "key": "document_context", "presence": "required" },
    { "key": "signer_identity", "presence": "required" },
    { "key": "certificate_requirements", "presence": "required" },
    { "key": "seal_and_stamp", "presence": "required" },
    { "key": "notarization_channel", "presence": "required" }
  ]
}
```

## Example C: IDN Public Instrument (PR)

```json
{
  "jurisdiction": "US-PR",
  "document_type": "public_instrument",
  "api_representation_mode": "sectioned_plus_flattened_summaries",
  "classification": {
    "notarial_system": "CIVIL_LAW_PUBLIC_INSTRUMENT",
    "execution_presence_mode": "CIVIL_LAW_IN_PERSON_DEFAULT",
    "digital_channel_status": "DIGITAL_STATUS_EVOLVING"
  },
  "notary_capabilities": {
    "ron_allowed": false,
    "e_notarization_allowed": false,
    "witnesses_required_for_primary_act": false,
    "personal_knowledge_only_identification_allowed": true,
    "credible_witness_identification_allowed": false,
    "commission_expiration_on_certificate_required": false
  },
  "template_resolution": {
    "base_template_key": "idn_public_instrument_v1",
    "jurisdiction_overlay_key": "pr_overlay_v1",
    "acknowledgment_profile": "PR_PUBLIC_INSTRUMENT"
  },
  "section_summaries": {
    "manual_review": {
      "manual_review_required": true,
      "manual_review_reason": "Civil-law public instrument workflow requires protocol-level review"
    }
  },
  "sections": [
    { "key": "document_context", "presence": "required" },
    { "key": "legal_basis", "presence": "required" },
    { "key": "signer_identity", "presence": "required" },
    { "key": "certificate_requirements", "presence": "required" },
    { "key": "manual_review", "presence": "required" }
  ]
}
```

## Implementation Notes

- Backend should preserve legal/source text for explanatory note fields.
- Backend should normalize requirement-like status fields to `requirement_status`.
- Backend should normalize channel availability fields to `availability_status`.
- Keep `template_resolution.acknowledgment_profile` as the only source-of-truth profile key.
- Keep `required_artifacts` as inputs and `document_outputs` as generated deliverables.
- Use `manual_review_required` to enforce generation gate behavior and force `review_status = needs_review` when true.
- Keep section keys and field keys stable for frontend reuse.