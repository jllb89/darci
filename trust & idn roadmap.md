Roadmap
Phase 1 — Trust (higher complexity, higher value)

1. Research & legal source document — Create docs/Trust_requirements.json with per-state trust rules (UTC adoption, revocability, trustee powers, certification requirements, execution formalities, statutory form availability). Same flat format as POA_requirements.json.

2. Input requirements schema — Create docs/trust-input-requirements-schema.md defining sections, fields, and derivation logic for all 3 trust document types (RRR, Certification, Other). One schema, branching by document type.

2. 5 Trust rules architecture / family model
Define the canonical trust template families and override model that will interpret Trust_requirements.json:

UTC standard
UTC modified
non-UTC common-law
special flexible jurisdictions
civil-law formal jurisdictions

Also define:

canonical trust rule types
which fields are safe to template
which fields must remain override-heavy
how one canonical record projects into:
Trust RRR
Trust Certification
Trust Other

"trustClassification": "UTC_STANDARD" | "NON_UTC_STANDARD" | "SPECIAL_COMPLEX"
executionLevel: "STANDARD" | "NOTARIZATION_REQUIRED" | "FORMAL_ACT"


Big picture (this is important)

Louisiana confirms your final classification model:

✅ You now have 4 real categories:
type TrustSystem =
  | "UTC_STANDARD"
  | "NON_UTC_STANDARD"
  | "EXECUTION_STRICT"      // Iowa-type
  | "CIVIL_LAW_COMPLEX"     // Louisiana
🔥 Why this matters

Because your engine will behave differently:

Type	Behavior
UTC_STANDARD	template-driven
NON_UTC	custom overrides
EXECUTION_STRICT	enforce notarization
CIVIL_LAW	completely different logic
🚨 Final note (important)

This is the first state where:
👉 Your system cannot safely auto-generate without guardrails

So:

Manual Review Required = Yes ✅ (correct)
You may even want:
requiresAttorneyReview: true


⚠️ Important modeling insight

For states like Nevada:

👉 The key is NOT execution
👉 The key is trust capabilities

So your engine will eventually need:

trustCapabilities: {
  assetProtection: true,
  selfSettledTrust: true,
  decanting: true,
  directedTrusts: true
}


3. Migration — Additive migration creating trust_requirements, trust_form_rules, trust_glossary_terms, trust_canonical_powers, trust_power_rules. Same pattern as the POA state-engine migration.

4. Seed data — Seed all 51 jurisdictions into trust_requirements. Seed CA and OH with detailed glossary/power rules (same starter approach as POA).

5. Backend service — trustService.ts + trustInputRequirements.ts following the POA pattern. Single derivation function that accepts the trust document type and branches section/field logic accordingly.

5. Backend controller — trustController.ts with GET /rules/trust/:jurisdiction?type=rrr|certification|other. Enriches with glossary, same response shape pattern.

6. Frontend — Trust start page consuming the trust API, reusing the same dynamic form pattern.

Phase 2 — IDN (lower complexity)

1. Research & legal source document — Create docs/IDN_requirements.json with per-state acknowledgement certificate rules.

2. Schema doc — docs/idn-input-requirements-schema.md (simpler — mostly template selection + field presence rules).

3. Migration — idn_requirements, idn_form_rules, idn_glossary_terms.

4. Seed — All 51 jurisdictions. CA/OH detailed.

5. Backend service + controller — Lighter than POA/Trust.

6. Frontend — Likely not a standalone start page — the IDN is appended to other documents. This may be more of a backend generation step than a member-facing form.

Phase 3 — Integration

- Wire the document flow so that generating a POA or Trust automatically triggers the correct IDN/acknowledgement page generation for that jurisdiction

- The "Start a document" page gets a document type selector (POA, Trust RRR, Trust Certification) before jurisdiction





Roadmap

1. Backend orchestration service
Build one service that loads POA/Trust/IDN requirement records for a jurisdiction and selected document types.
Use canonical derivation for all families via inputRequirements.ts:2834, not the POA legacy wrapper.
Feed contracts into memberInputAggregator.ts:659.

2. New member-form rules endpoint
Add a new endpoint under rules (for example: member-form by jurisdiction) that returns:
selected families and document types
canonical per-family contracts (for traceability/debug)
aggregated member form contract
fact context per source (family + document_type), so frontend can evaluate source-level conditions deterministically
Keep existing family endpoints untouched for backward compatibility.

3. Frontend start-page integration
Keep authenticated route at page.tsx.
Replace POA-only fetching with the new aggregated endpoint.
Add UI selectors for active families/document types before rendering fields.
Render aggregated sections/fields from member form contract, preserving current section-first UX structure.

4. Condition engine upgrade (critical)
Extend condition evaluation to support full operators and value shapes from shared contracts.
For fields with exact mode: evaluate field-level condition normally.
For fields with source_only mode: evaluate each source.original_when using that source fact context; do not treat missing top-level condition as unconditional.
Required state must be computed from active sources only.

5. Writeback mapping (when you wire submit)
Build canonical-field-to-source mapping using merged sources.
Persist values only into source fields whose original_when is active for the selected family/document path.
This is where the source_only rule matters most to avoid over-collecting or wrongly required inputs.

6. Tests and rollout
Backend tests: endpoint contract, mixed-family merge, source_only behavior, missing-family behavior.
Frontend tests: operator handling, source_only visibility/required behavior, multi-family switching.
Roll out behind a flag so POA-only path remains available during transition.


Highest-Risk Point To Lock Early

The source_only semantics in memberInputAggregator.ts:109 and memberInputAggregator.ts:480 must drive both UI activation and submission mapping. If this is skipped, fields can appear unconditional and create legal-flow regressions.
If you want, I can implement Phase 1 now: new backend member-form endpoint plus tests.
After that, I can wire Phase 2 in page.tsx in a backward-compatible flag path.