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