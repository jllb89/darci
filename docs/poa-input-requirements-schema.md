# POA Input Requirements Schema Draft

This document defines a derived `input_requirements` contract for Power of Attorney workflows.

It is intentionally separate from `docs/POA_requirements.json`.

- `POA_requirements.json` remains the legal/source layer.
- `input_requirements` is the product/workflow layer.
- The backend should derive `input_requirements` from normalized POA rules and curated overrides.
- The frontend should render sections and validations from `input_requirements`, not from raw legal prose.

## Goals

- Express exactly which user inputs DARCI must collect for a given jurisdiction and POA type.
- Encode workflow semantics, not React component names.
- Support conditional branches such as `notary_or_witness`.
- Keep the shape stable enough for API and UI reuse.
- Allow manual overrides where legal text does not fully determine the UX.

## Non-Goals

- Storing raw frontend component identifiers such as `Select`, `RadioGroup`, or `Textarea`.
- Replacing the legal/source record.
- Modeling every visual detail of the form.

## Recommended Ownership

Short term:
- Draft and validate this contract in docs.
- Implement the derivation in the backend first.
- Return `input_requirements` from the POA API without changing the database yet.

Later, only if it proves stable:
- Persist the derived result in Postgres as JSONB, or
- Persist only curated overrides and keep final assembly in the backend.

## Top-Level Shape

```json
{
  "schema_version": "2026-03-27",
  "jurisdiction": "US-CA",
  "poa_type": "general",
  "ui_profile": "poa_standard",
  "derivation_mode": "rules_plus_overrides",
  "review_status": "draft",
  "workflow": {
    "execution_paths": [],
    "steps": [],
    "submission_checks": []
  },
  "sections": [],
  "document_outputs": [],
  "notices": [],
  "source_trace": []
}
```

## Top-Level Field Definitions

- `schema_version`: version of the derived contract, not the legal source.
- `jurisdiction`: canonical code such as `US-CA`.
- `poa_type`: canonical POA type such as `general`, `durable`, `medical`, `limited`.
- `ui_profile`: coarse rendering profile already aligned with the POA rules table.
- `derivation_mode`: how this record was produced.
  Allowed values: `rules_only`, `rules_plus_overrides`, `manual_review`.
- `review_status`: product/compliance confidence level.
  Allowed values: `draft`, `verified`, `needs_review`.
- `workflow`: process decisions that affect which sections appear and in what order.
- `sections`: canonical form sections and their fields.
- `document_outputs`: required execution artifacts that must exist before completion.
- `notices`: disclosures or warnings the UI must show.
- `source_trace`: pointers back to normalized rules and statutory references.

## Workflow Object

```json
{
  "execution_paths": [
    {
      "key": "notary_acknowledgment",
      "label": "Sign before a notary",
      "default": true,
      "availability": "allowed"
    }
  ],
  "steps": [
    "principal_details",
    "agent_details",
    "authority_scope",
    "execution_requirements",
    "review"
  ],
  "submission_checks": [
    "principal_signed",
    "required_witnesses_present",
    "required_notary_path_selected"
  ]
}
```

### Workflow Enums

- `execution_paths[].availability`
  Allowed values: `required`, `allowed`, `not_allowed`, `manual_review`.

### Recommended Execution Path Keys

- `notary_acknowledgment`
- `witness_execution`
- `notary_and_witness_execution`
- `recording_dependent_durability`
- `manual_review`

## Section Shape

Each section is semantic, not visual.

```json
{
  "key": "principal",
  "title": "Principal",
  "presence": "required",
  "repeatable": false,
  "applies_to_paths": ["notary_acknowledgment", "witness_execution"],
  "fields": []
}
```

### Section Enums

- `presence`
  Allowed values: `required`, `optional`, `conditional`, `hidden`, `manual_review`.

### Recommended Section Keys

- `principal`
- `agent`
- `successor_agent`
- `co_agents`
- `authority_scope`
- `durability`
- `effective_date`
- `execution_choice`
- `witnesses`
- `notary`
- `special_instructions`
- `statutory_notices`

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

### Field Properties

- `key`: stable API identifier.
- `label`: default human-readable label.
- `semantic_type`: meaning of the field, not the control implementation.
- `required`: whether the value must be supplied for the current path.
- `data_type`: storage and validation primitive.
- `collect_from`: who supplies the value.
- `default_source`: whether DARCI may prefill it.
- `validation`: primitive constraints and allowed values.
- `help_text`: optional short product guidance.
- `when`: optional conditional expression for path-specific fields.

### Field Enums

- `semantic_type`
  Allowed values:
  - `person_name`
  - `person_address`
  - `person_contact`
  - `enum_single`
  - `enum_multi`
  - `boolean`
  - `date`
  - `text`
  - `initials`
  - `signature_mark`
  - `witness_count`
  - `acknowledgment_choice`
  - `legal_notice_acceptance`
  - `recording_status`

- `data_type`
  Allowed values: `string`, `integer`, `boolean`, `date`, `array`.

- `collect_from`
  Allowed values: `member`, `principal`, `agent`, `notary`, `system`.

- `default_source`
  Allowed values: `none`, `user_profile`, `document_template`, `jurisdiction_default`, `system_derived`.

## Conditional Expressions

Only one minimal conditional format is recommended for v1.

```json
{
  "all": [
    {
      "fact": "selected_execution_path",
      "operator": "equals",
      "value": "witness_execution"
    }
  ]
}
```

### Condition Facts

- `selected_execution_path`
- `durability_rule`
- `specific_authority_rule`
- `effective_date_rule`
- `statutory_form_rule`
- `review_status`

### Condition Operators

- `equals`
- `not_equals`
- `in`
- `not_in`

## Document Outputs

These are required artifacts, not UI sections.

```json
[
  {
    "key": "signed_poa_document",
    "required": true
  },
  {
    "key": "witness_attestation",
    "required": false,
    "when": {
      "all": [
        {
          "fact": "selected_execution_path",
          "operator": "equals",
          "value": "witness_execution"
        }
      ]
    }
  }
]
```

### Recommended Output Keys

- `signed_poa_document`
- `notary_acknowledgment`
- `witness_attestation`
- `special_authority_initials`
- `durability_clause`
- `springing_trigger_clause`
- `recording_confirmation`

## Notices

Use notices for compliance or product warnings that must be shown, but are not themselves fields.

```json
[
  {
    "key": "capacity_required",
    "severity": "info",
    "message": "The principal must have the required legal capacity at signing."
  }
]
```

### Notice Severities

- `info`
- `warning`
- `blocking`

## Source Trace

The frontend does not need to interpret this. It exists for debugging, auditability, and later admin tooling.

```json
[
  {
    "source": "poa_requirements",
    "field": "ack_requirement",
    "value": "notary_or_witness"
  },
  {
    "source": "poa_requirements",
    "field": "specific_authority_rule",
    "value": "explicit_required"
  }
]
```

## Canonical Base Sections For v1

These sections should exist across almost every state, even if some become hidden or optional.

1. `principal`
2. `agent`
3. `authority_scope`
4. `durability`
5. `effective_date`
6. `execution_choice`
7. `witnesses`
8. `notary`
9. `special_instructions`
10. `statutory_notices`

This keeps frontend rendering predictable while still allowing state variation through `presence`, `applies_to_paths`, and per-field `when` conditions.

## Mapping Guidance From Existing POA Rules

These current normalized POA fields should directly influence the derived contract.

- `ack_requirement`
  Drives available `execution_paths`, `witnesses` section presence, and `notary` section presence.

- `durability_rule`
  Drives the `durability` section and whether a clause is required, optional, defaulted, or review-only.

- `specific_authority_rule`
  Drives whether `authority_scope` includes explicit authority picks and initials.

- `statutory_form_rule`
  Drives notices, optional template selection, and whether freeform drafting should be discouraged.

- `effective_date_rule`
  Drives whether `effective_date` exposes immediate effect only, optional future date, or springing options.

- `competency_rule`
  Drives notices and any required acknowledgment checkbox.

- `ui_profile`
  Drives high-level rendering style, not legal logic.

## Example A: California General POA

This example shows a branching jurisdiction where either a notary path or a two-witness path may be used.

```json
{
  "schema_version": "2026-03-27",
  "jurisdiction": "US-CA",
  "poa_type": "general",
  "ui_profile": "poa_standard",
  "derivation_mode": "rules_plus_overrides",
  "review_status": "draft",
  "workflow": {
    "execution_paths": [
      {
        "key": "notary_acknowledgment",
        "label": "Sign before a notary",
        "default": true,
        "availability": "allowed"
      },
      {
        "key": "witness_execution",
        "label": "Use two witnesses instead of a notary",
        "default": false,
        "availability": "allowed"
      }
    ],
    "steps": [
      "principal_details",
      "agent_details",
      "authority_scope",
      "execution_requirements",
      "review"
    ],
    "submission_checks": [
      "principal_signed",
      "one_execution_path_selected"
    ]
  },
  "sections": [
    {
      "key": "principal",
      "title": "Principal",
      "presence": "required",
      "repeatable": false,
      "applies_to_paths": ["notary_acknowledgment", "witness_execution"],
      "fields": [
        {
          "key": "principal_full_name",
          "label": "Principal full legal name",
          "semantic_type": "person_name",
          "required": true,
          "data_type": "string",
          "collect_from": "member",
          "default_source": "user_profile"
        }
      ]
    },
    {
      "key": "witnesses",
      "title": "Witnesses",
      "presence": "conditional",
      "repeatable": true,
      "applies_to_paths": ["witness_execution"],
      "fields": [
        {
          "key": "witness_count",
          "label": "Number of witnesses",
          "semantic_type": "witness_count",
          "required": true,
          "data_type": "integer",
          "collect_from": "member",
          "default_source": "jurisdiction_default",
          "validation": {
            "min": 2,
            "max": 2
          }
        }
      ]
    },
    {
      "key": "notary",
      "title": "Notary acknowledgment",
      "presence": "conditional",
      "repeatable": false,
      "applies_to_paths": ["notary_acknowledgment"],
      "fields": []
    }
  ],
  "document_outputs": [
    {
      "key": "signed_poa_document",
      "required": true
    },
    {
      "key": "notary_acknowledgment",
      "required": false,
      "when": {
        "all": [
          {
            "fact": "selected_execution_path",
            "operator": "equals",
            "value": "notary_acknowledgment"
          }
        ]
      }
    },
    {
      "key": "witness_attestation",
      "required": false,
      "when": {
        "all": [
          {
            "fact": "selected_execution_path",
            "operator": "equals",
            "value": "witness_execution"
          }
        ]
      }
    }
  ],
  "notices": [
    {
      "key": "capacity_required",
      "severity": "info",
      "message": "The principal must have capacity to execute the power of attorney."
    }
  ]
}
```

## Example B: Connecticut General POA

This example shows a fixed execution requirement: notary plus two witnesses.

```json
{
  "jurisdiction": "US-CT",
  "poa_type": "general",
  "workflow": {
    "execution_paths": [
      {
        "key": "notary_and_witness_execution",
        "label": "Notary and two witnesses required",
        "default": true,
        "availability": "required"
      }
    ]
  },
  "sections": [
    {
      "key": "witnesses",
      "title": "Witnesses",
      "presence": "required",
      "repeatable": true,
      "applies_to_paths": ["notary_and_witness_execution"],
      "fields": [
        {
          "key": "witness_count",
          "label": "Number of witnesses",
          "semantic_type": "witness_count",
          "required": true,
          "data_type": "integer",
          "collect_from": "member",
          "default_source": "jurisdiction_default",
          "validation": {
            "min": 2,
            "max": 2
          }
        }
      ]
    },
    {
      "key": "notary",
      "title": "Notary acknowledgment",
      "presence": "required",
      "repeatable": false,
      "applies_to_paths": ["notary_and_witness_execution"],
      "fields": []
    }
  ],
  "document_outputs": [
    {
      "key": "notary_acknowledgment",
      "required": true
    },
    {
      "key": "witness_attestation",
      "required": true
    }
  ]
}
```

## Example C: Florida General POA

This example shows a jurisdiction with explicit authority handling and execution formalities that should force extra collection requirements.

```json
{
  "jurisdiction": "US-FL",
  "poa_type": "general",
  "sections": [
    {
      "key": "authority_scope",
      "title": "Authority scope",
      "presence": "required",
      "repeatable": false,
      "applies_to_paths": ["notary_and_witness_execution"],
      "fields": [
        {
          "key": "special_authorities",
          "label": "Special authorities",
          "semantic_type": "enum_multi",
          "required": true,
          "data_type": "array",
          "collect_from": "member",
          "default_source": "none"
        },
        {
          "key": "special_authority_initials",
          "label": "Principal initials for special authorities",
          "semantic_type": "initials",
          "required": true,
          "data_type": "string",
          "collect_from": "principal",
          "default_source": "none",
          "when": {
            "all": [
              {
                "fact": "specific_authority_rule",
                "operator": "equals",
                "value": "explicit_required"
              }
            ]
          }
        }
      ]
    }
  ],
  "document_outputs": [
    {
      "key": "special_authority_initials",
      "required": true
    }
  ]
}
```

## Edge Cases That Need Explicit Override Support

- California and similar states where users may choose between notary and witness paths.
- South Carolina style conditional durability rules where recording status can change the workflow.
- States where statutory forms exist but custom drafting is still allowed.
- States where medical POA or real-estate POA execution differs from general POA.
- States with witness eligibility restrictions that cannot be fully inferred from the current source fields.

These cases justify a `rules_plus_overrides` derivation mode.

## Recommended Derivation Strategy

Use a layered derivation pipeline.

1. Start from normalized fields in `public.poa_requirements`.
2. Build base execution paths from `ack_requirement`.
3. Build canonical sections from a shared template.
4. Adjust `presence`, `fields`, and `document_outputs` using rule mappings.
5. Apply curated jurisdiction overrides for edge cases.
6. If confidence is low, return `review_status: needs_review` and a blocking notice.

## Recommended Next Step

Before any DB migration:

1. Implement this contract in the backend as a pure TypeScript derivation function.
2. Return it from the POA rules endpoint next to the normalized legal fields.
3. Test it against at least `US-CA`, `US-CT`, `US-FL`, and `US-SC`.
4. Only then decide whether any of it belongs in Postgres.

That keeps the database focused on legal facts while we prove the workflow contract in code.