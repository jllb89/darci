# Client Summary: Trust + IDN Schema Transformation

## Executive Overview

We completed a major architecture upgrade that turns complex, state-by-state legal rules into two clear, product-ready contracts:

- Trust Input Requirements Schema
- IDN Input Requirements Schema

In plain terms, this means the platform no longer depends on brittle legal prose or one-off state logic during runtime. Instead, it now uses structured, auditable, and predictable requirements that backend and frontend can execute consistently.

This is a meaningful jump in maturity. What used to require legal interpretation at implementation time is now encoded into deterministic workflow behavior, normalized statuses, and traceable source mappings.

## What We Built (Shared Design Across Both Schemas)

Both schemas now follow the same enterprise pattern, which gives us consistency, speed, and confidence:

1. Legal source is separated from product contract.
2. Backend derives workflow requirements from legal rules plus curated overlays.
3. Frontend renders from a stable input_requirements contract.
4. Jurisdiction variation is managed through classification and overlays, not through 50 separate full templates.

### Shared Contract Capabilities

- Stable top-level contract with versioning, jurisdiction, document type, derivation mode, review status, sections, outputs, notices, and source trace.
- Classification layer for legal behavior (high-level legal posture).
- Capabilities layer for granular feature flags (fine-grained behavior).
- Template resolution layer with base template plus jurisdiction overlay and a single acknowledgment profile source of truth.
- Workflow layer with a clean boundary between required inputs and generated outputs.
- Section-and-field model with conditions, validation intent, and stable field keys for UI reuse.
- Normalized status systems that convert legal phrasing into deterministic values.
- Manual review gate logic with explicit relationship to review status.
- Auditability through source_trace for legal-origin explainability.

## Trust Schema: What It Now Supports

The Trust schema now supports all trust workflows in one contract:

- Restatement and amendment style workflows (rrr)
- Certification workflows
- Other trust-related workflows

### Trust Classification and Behavior

The system distinguishes:

- Trust system family (UTC standard, UTC plus, non-UTC standard, trust-friendly, civil-law)
- Execution level (standard, notarization required, acknowledgment-or-witness alternative, formal act)

This prevents state logic from becoming hardcoded chaos and keeps legal behavior explicit.

### Trust Capabilities Layer

We added explicit trust capabilities so one enum does not carry too much meaning:

- Asset protection posture
- Directed trust support
- Decanting friendliness
- Silent trust friendliness

This makes future expansion safer and avoids overloading classification categories.

### Trust Template and Output Architecture

- Base template chosen by document type and classification context.
- State overlay adds jurisdiction-specific rules and language.
- Acknowledgment profile remains a single source of truth.
- Required artifacts are only prerequisites.
- Document outputs are only generated deliverables.

### Trust Field and Compliance Depth

Key improvements include:

- Execution normalized statuses (required, not required, conditional, alternative path)
- Certification split into:
  - Required certification elements
  - Permitted optional certification elements
  - Prohibited certification elements
- Manual review enforcement rules tied directly to review status.
- Explicit derivation mapping from legal source fields to contract fields.

## IDN Schema: What It Now Supports

The IDN schema now covers acknowledgment and notarial wrapper behavior across common-law and civil-law contexts, while keeping scope clear.

Document type is explicitly scoped to wrapper behavior, not full legal drafting of civil-law instrument body text.

### IDN Classification and Channel Model

The model is intentionally split into:

- Notarial system type
- Execution presence mode
- Digital channel status

This separation keeps legal posture and channel behavior cleanly modeled.

### IDN Capabilities Layer

The platform now captures jurisdiction-level capabilities such as:

- RON allowed
- E-notarization allowed
- Witnesses required for primary act
- Personal knowledge identification allowed
- Credible witness identification allowed
- Commission expiration required on certificate

### IDN Representation Strictness

To solve strictness versus convenience, the schema now defines:

- Canonical sectioned representation as the source of truth
- Optional flattened section summaries for convenience reads
- Explicit rule that both must match when both are present

This gives engineering flexibility without losing contract integrity.

### IDN Workflow and Compliance Depth

Key implementation-ready features include:

- Explicit artifacts versus outputs boundary
- Public instrument artifacts refined into concrete items:
  - Party identity evidence
  - Representative capacity evidence
  - Witness bundle when applicable
- Personal appearance logic strengthened with:
  - Personal appearance required flag
  - Personal appearance basis explanation field
  - Conservative fallback with manual review when source language is nuanced
- Certificate posture flags:
  - Statutory short form available
  - Custom certificate language required
- Compact normalization decision tables for deterministic backend mapping.

## Platform Capabilities You Can Demonstrate to Clients Now

### 1) One engine, many jurisdictions, no template explosion

The platform can support broad jurisdiction coverage by combining:

- Legal classification
- Capability flags
- Base templates
- Small overlays

instead of maintaining a separate full template per state or territory.

### 2) Deterministic compliance behavior

Legal phrases like not required, conditional, authorized, evolving, and statutory form language are normalized into predictable statuses. This removes guesswork and reduces production risk.

### 3) Stronger legal traceability and audit readiness

Every derived requirement can be connected back to source fields through source trace and explicit derivation mappings. This is valuable for legal review, quality assurance, and enterprise client trust.

### 4) Clear manual review safety net

Both schemas enforce manual review logic with review-state coupling, so uncertain or high-risk cases are gated before final generation.

### 5) Cleaner frontend and backend integration

Stable section and field keys, clear conditions, and consistent enums make UI rendering and API orchestration faster and safer.

## Concrete Capability Examples

### Example A: California Trust RRR flow

- Platform selects trust RRR base template.
- California overlay and acknowledgment profile are applied.
- Required prior trust documents are collected as artifacts.
- Execution and notarial requirements are derived in normalized form.
- Output package includes generated trust document and any required acknowledgment page.

### Example B: Ohio Trust Certification flow

- Certification branch activates certification scope section.
- Required, permitted, and prohibited certification elements are clearly separated.
- Frontend can render exactly what must be included and what must be excluded.

### Example C: New York IDN acknowledgment with digital support

- Jurisdiction classified with remote-capable channel posture.
- RON and e-notarization statuses are surfaced explicitly.
- Capacity-sensitive acknowledgment profile drives certificate behavior.

### Example D: Puerto Rico civil-law public instrument wrapper

- Public-instrument wrapper route is selected without pretending to draft the full civil-law body text.
- Civil-law and evolving-digital posture are reflected in classification.
- Manual review is triggered with explicit reason when needed.

## Business Impact for Clients

This work delivers visible client value now:

- Faster onboarding of new jurisdictions
- Reduced compliance ambiguity during document generation
- Better legal defensibility and audit confidence
- Lower maintenance cost versus state-by-state branching
- Higher delivery confidence for enterprise integrations

## Bottom Line

We now have two aligned, implementation-ready contracts that convert legal complexity into predictable product behavior.

This is not just documentation. It is a production architecture foundation that supports scale, compliance, and speed at the same time.