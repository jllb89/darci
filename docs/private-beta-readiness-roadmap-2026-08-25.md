# DARCi Private Beta Readiness Roadmap

- Status: product truth and engineering risk source of truth
- Created: 2026-08-25
- Current environment: internal staging
- Next target: controlled private beta
- Initial launch jurisdictions: California and Ohio only

## Purpose

This document records the product decisions confirmed after the August 2026 project audit, the known gaps in the repository, and the recommended order for moving DARCi from internal staging to a controlled private beta and eventually a public launch.

This is a planning document only. It does not mean that any listed remediation has been implemented, legally approved, or tested in staging. Existing detailed implementation roadmaps remain useful; this document is the umbrella source of truth for priority and product intent.

## Executive Position

DARCi is a substantial staging product with working web, native iOS, API, database, document-generation, signing, notary, finalization, and verification foundations. It is not yet production-ready.

The immediate goal is not to add more breadth. It is to stabilize the intended California/Ohio in-person workflow, close the security and data-governance gaps that create disproportionate risk, integrate Stripe or explicitly feature-gate billing, fix known staging errors, and make the repository's claims match the product that will actually launch.

The most important confirmed decisions are:

1. Public verification intentionally exposes the actual final PDF when a person has the document's IDN.
2. Initial availability is California and Ohio only.
3. Notarization is in person. DARCi is not currently a remote online notarization product.
4. The member and notary arrange their meeting outside DARCi.
5. Invited signers must create or use an email-linked DARCi account before signing.
6. Full identity-document identifiers are required during the in-person check, but DARCi should define what is retained after completion and should prefer retaining only a partial identifier where legally and operationally sufficient.
7. The 100-meter/15-minute same-place values are development defaults, not approved production policy.
8. The trust certificate is an internal legal artifact. It should not appear as a standalone document in normal member/notary review surfaces, but it must continue to exist where the legal package requires it.
9. Illuminotarization access codes must remain for compatibility, although assigned notaries primarily access work through their authenticated notary profile.
10. Stripe integration is missing and is part of launch-readiness work.
11. A production ledger provider has not been selected. Ledger and broad compliance claims must not get ahead of implementation or legal review.

## Confirmed Product Truth

### Product families

DARCi has three primary product flows:

1. **Trust package**
   - The member completes jurisdiction-specific intake.
   - DARCi generates the required documents from Markdown-based templates.
   - The package includes a trust certificate, registration/recording-related artifact, and POA-related document as applicable.
   - Required owners and invited signers execute the documents.
   - The owner selects a notary in the document's jurisdiction.
   - The trust certificate remains hidden as a standalone artifact in ordinary member/notary review surfaces but continues to exist as an internal legal artifact.

2. **Power of attorney**
   - The member completes jurisdiction-specific intake.
   - DARCi generates the POA from the applicable template.
   - Required owners and invited signers execute it.
   - The owner selects a notary in the document's jurisdiction.

3. **Document notarization**
   - The member uploads an existing document.
   - Member signature is optional only for this product flow.
   - The member selects a notary in the document's jurisdiction.
   - The downstream notarial flow is shared with the generated-document products.

### Common signing and notarial flow

1. The document owner supplies data or uploads a document.
2. DARCi generates or stores the working document.
3. Required signer invitations are sent.
4. An invited signer creates or uses a DARCi account linked to the invited email address, completes required account/profile information, and signs.
5. The document owner signs where required.
6. The owner selects an eligible notary for the document jurisdiction.
7. The notary receives the assigned request and approves or rejects it.
8. If approved, the member and notary receive the contact information needed to coordinate directly.
9. The parties arrange the in-person meeting outside DARCi. DARCi is not a scheduling or booking platform in the current launch scope.
10. The notary starts the in-person session in DARCi.
11. DARCi collects location evidence from both parties and evaluates whether they are in the same place.
12. Identity-document information and the meeting venue/address are recorded. Google Maps autocomplete currently supports address entry.
13. DARCi generates and appends the jurisdiction-specific notarial acknowledgment.
14. The final document is watermarked and hashed.
15. A ledger-anchor attempt is recorded. Until a real provider exists, this must not be represented as a completed third-party distributed-ledger anchor.
16. The final PDF is retrievable through public IDN verification by design.

### Jurisdiction and meeting scope

- California and Ohio are the only initial launch jurisdictions.
- The launch flow is in-person electronic notarization, not remote online notarization.
- Same-place evidence supports the notary's in-person workflow; it does not independently prove legal co-presence or identity.
- The existing 100-meter distance and 15-minute freshness settings are development values and require later product/legal validation.
- In-app scheduling, proposals, confirmations, rescheduling, cancellation, and no-show functionality are outside current launch scope even if related API code exists.

### Access and privacy decisions

- Public IDN verification intentionally includes access to the actual final PDF.
- The IDN therefore functions partly as a bearer secret: anyone who receives it may be able to retrieve the final document.
- Legal, privacy, help, and product copy must say this clearly and consistently. Copy claiming that documents are never public is inaccurate under the confirmed design.
- Public verification should still avoid exposing internal database identifiers, private storage paths, identity-session records, raw GPS samples, or unrelated account data.
- Assigned notaries use their authenticated notary profile to see assigned documents. Legacy access codes remain available but are not the primary assignment experience.
- Existing support-link destinations are accepted and do not require change solely because they differ from the main application domain.

### Identity decision

- Notaries need to inspect the actual identity document during the in-person session.
- The current workflow may capture the complete document identifier to support that check.
- DARCi does not yet have a formal retention schedule.
- The target should be to retain the minimum information needed after notarization is completed, potentially only a partial identifier, subject to California/Ohio legal review and notary recordkeeping requirements.
- There are no phone-only accounts. A signer account must have an email linked to it and must complete the required user information in web or mobile.

## Decision Register

| ID | Topic | Confirmed decision | Consequence |
| --- | --- | --- | --- |
| DEC-01 | Public verification | The final PDF is intentionally available through IDN verification. | Preserve the feature; align disclosures, logging, abuse controls, and privacy copy. |
| DEC-02 | Jurisdictions | Launch in California and Ohio only. | Disable or label all other jurisdictions as unavailable and limit legal validation to CA/OH. |
| DEC-03 | Notarization mode | In-person only for initial launch. | Remove or correct RON/remote-notarization claims and unused active paths. |
| DEC-04 | Scheduling | Parties arrange meetings externally. | Remove or feature-disable in-app scheduling surfaces; retain code only if intentionally dormant. |
| DEC-05 | Invited signers | Signers must use an email-linked account before signing. | Bind claims server-side to a verified account email; no anonymous final claim. |
| DEC-06 | Identity capture | Full document information is needed during the session. | Permit session-time capture, then minimize/encrypt/delete according to a formal retention policy. |
| DEC-07 | Same-place policy | Current thresholds are development settings. | Do not present them as legally approved; tune after error analysis and legal/product review. |
| DEC-08 | Trust certificate | Internal artifact that legally must exist. | Keep hidden from ordinary standalone review while preserving it in the required legal processing/package. |
| DEC-09 | Access codes | Keep for compatibility; notaries normally use authenticated profiles. | Treat codes as fallback/legacy access and test that they cannot broaden authorization. |
| DEC-10 | Ledger | Provider not yet selected. | Treat ledger work as incomplete and correct marketing/compliance language until implemented. |
| DEC-11 | Billing | Stripe integration is missing. | Complete the notary subscription MVP or feature-gate paid membership for beta. |
| DEC-12 | Release stage | Internal staging moving toward private beta. | Use controlled users, explicit feature flags, observability, and a written beta go/no-go checklist. |

## Known Intentional Behavior Versus Defects

### Intentional and not a defect

- Returning the final PDF from public IDN verification.
- Limiting launch availability to California and Ohio.
- Requiring an in-person meeting.
- Letting parties coordinate the meeting outside DARCi.
- Keeping the trust certificate out of normal standalone review surfaces.
- Keeping legacy illuminotarization codes while using authenticated notary assignments as the primary path.
- Keeping the currently accepted support links.

### Intentional behavior that still needs safeguards or truthful copy

- Public final-PDF verification needs accurate privacy/legal disclosure, access logging, signed-URL expiration, and abuse monitoring.
- Full identity-number capture during the session needs encryption, access restrictions, minimization after completion, and a retention schedule.
- Legacy access codes need authorization and leakage testing.
- Hidden trust-certificate behavior needs an explicit packaging test so visibility rules cannot accidentally remove a legally required artifact or expose it as a separate document.

### Confirmed gaps

- No production ledger provider.
- No formal identity/document/location retention policy.
- Invite claiming is not firmly bound server-side to the intended verified email account.
- Known production dependency advisories.
- Stripe runtime and user-facing subscription flow are missing.
- Staging errors still affect the in-person/same-place flow.
- The repository still contains product copy and functionality that imply remote notarization or platform scheduling.

## Dependency Advisory Explanation

### Snapshot

`npm audit --omit=dev` was refreshed on 2026-08-25 without changing packages.

| Application | Critical | High | Moderate | Low | Total affected package entries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Backend | 2 | 9 | 63 | 1 | 75 |
| Web | 0 | 7 | 6 | 1 | 14 |

These numbers do **not** mean that DARCi has 89 independently exploitable security holes. `npm audit` counts affected package entries across the installed dependency graph. One vulnerable low-level library can cause many parent packages to be reported. For example, an old OpenTelemetry subtree can account for many affected entries, and a single Next.js entry can aggregate multiple framework advisories.

They also must not be ignored. DARCi handles legal documents, identity data, authentication tokens, public endpoints, and notary workflows. A remotely reachable denial of service, authorization bypass, SSRF, XSS, parser flaw, or memory disclosure can have materially higher impact here than in a low-sensitivity application.

### Main affected dependency clusters

The audit and dependency tree show these important clusters:

- The backend's older OpenTelemetry packages pull in affected gRPC/protobuf and telemetry dependencies.
- The backend has two AWS SMS dependency branches at materially different versions. The older Pinpoint branch pulls an older `fast-xml-parser`; this creates both advisory exposure and version drift.
- Supabase realtime pulls `ws` into both backend and web dependency trees.
- Express/router/body parsing and observability/Sentry chains contribute additional backend advisories.
- The web app directly uses Next.js `16.1.6`. The current audit groups several availability, proxy/middleware, SSRF, cache, and XSS advisories under this dependency and reports a non-major fixed Next.js line as available.
- Next.js also brings affected `postcss` and `sharp` versions in the current tree.

Representative risk classes reported by the upstream advisories include:

- denial of service through malformed or unbounded input;
- middleware/proxy authorization bypass;
- server-side request forgery;
- cache poisoning or cache confusion;
- cross-site scripting under specific rendering/configuration conditions;
- XML or protobuf parsing issues;
- WebSocket memory exhaustion or disclosure; and
- crashes or unbounded memory use in observability components.

This list describes upstream advisory classes, not a conclusion that every issue is reachable in DARCi. Reachability must be checked against actual routes, configuration, input sources, and deployment topology.

### How to remediate safely

Do not run `npm audit fix --force` and accept broad major-version changes without review. Use controlled package groups:

1. Save the current audit JSON as a CI artifact or security record without committing sensitive environment data.
2. Map each critical/high advisory to its direct parent using `npm ls`.
3. Determine whether the vulnerable behavior is reachable in the deployed DARCi configuration.
4. Upgrade one related group at a time:
   - Next.js, its matching ESLint config, and framework-owned transitive packages;
   - Supabase/realtime and `ws`;
   - AWS messaging clients and XML parsing dependencies;
   - OpenTelemetry/gRPC/protobuf and Sentry compatibility;
   - Express/router/body-parser dependencies where a supported fix is available.
5. After each group, run backend tests/build, web tests/typecheck/lint/build, and targeted authentication, upload, invite, realtime, PDF, and public-verification tests.
6. Re-run the production-only audit and compare counts and dependency paths.
7. For any remaining critical/high advisory, document reachability, mitigation, owner, review date, and a time-limited acceptance decision.
8. Add an automated recurring audit/dependency-update process so the repository does not silently return to the same state.

### Exit criteria

- No unreviewed critical production advisory.
- No reachable, unmitigated high production advisory.
- Every remaining high advisory has a written reachability decision and expiry/review date.
- All application test/build gates pass after upgrades.
- A dependency update/audit check runs continuously in CI or a scheduled security workflow.

## Master Risk and Work Register

Priority meanings:

- **P0**: recommended before admitting private-beta users unless the feature is disabled or an explicit, time-limited risk acceptance is recorded.
- **P1**: complete during controlled private beta and before broader/public access.
- **P2**: required for production maturity but can follow the controlled beta if it does not affect the beta's enabled scope.
- **Accepted**: intentional product behavior; work is limited to safeguards, tests, and truthful documentation.

### Release stabilization and quality

- [ ] **BETA-01 — P0 — Create a reproducible staging error register.** Record user, role, product, jurisdiction, request/document ID, step, expected result, actual result, timestamp, correlation ID, frontend error, backend event code, and resolution. Prioritize current in-person location/session failures.
- [ ] **BETA-02 — P0 — Run full real-account staging smoke tests.** Cover member and invited signer on web and iOS, CA and OH, all three products, selected-notary approval/rejection, external contact handoff, in-person session, identity/venue capture, acknowledgment, finalization, and public verification.
- [ ] **BETA-03 — P0 — Restore a completely green automated baseline.** The backend's 509 tests, backend build, web's 59 tests, web lint/build, types build, and iOS app build passed in the audit. However, iOS tests do not compile because fixtures/protocol mocks have drifted, and standalone web TypeScript checking fails in a test fixture. Fix both.
- [ ] **BETA-04 — P0 — Expand CI to test what ships.** Add the web production build, iOS build/tests, migration validation, and RLS tests. Keep production runtime Node and CI Node versions aligned or explicitly support/test both.
- [ ] **BETA-05 — P1 — Add controlled end-to-end beta tests.** Exercise the real Supabase/storage/realtime/email environment with dedicated test accounts and cleanup rules. Do not rely only on mocked unit/integration tests.
- [ ] **BETA-06 — P1 — Define deployment and rollback gates.** Document staging-to-beta promotion, migration ordering, worker/API compatibility, rollback limits, backup/restore verification, and who can approve a release. Add a production/private-beta deployment workflow when the environment is ready.

### Dependency and application security

- [ ] **SEC-01 — P0 — Triage and remediate production dependency advisories.** Follow the controlled process in the dependency section. Prioritize direct/reachable framework and parser issues; do not treat raw counts as exploitability proof or as harmless noise.
- [ ] **SEC-02 — P0 — Add application-level rate limiting and abuse controls.** Cover authentication, invite claim, upload, IDN verification/PDF retrieval, notary-code resolution, location/session advancement, email/SMS triggers, and other expensive or public routes.
- [ ] **SEC-03 — P0 — Add baseline HTTP security headers.** Introduce a reviewed Helmet/header policy and a Next.js Content Security Policy compatible with Supabase, Sentry, maps, PDF display, and required assets. Add HSTS at the correct TLS termination layer.
- [ ] **SEC-04 — P0 — Reduce browser-token exposure.** The web app stores access and refresh tokens in `localStorage`. Assess migration to secure server-managed cookies or an equivalent hardened session design. Until migrated, enforce strong CSP, remove unsafe script paths, minimize token lifetime, and test logout/revocation.
- [ ] **SEC-05 — P1 — Make CSRF/request-signature controls explicit.** Existing helpers can pass when a token/signature is absent. Decide which browser/state-changing routes require CSRF protection and which service/webhook routes require signatures; fail closed where the control is required.
- [ ] **SEC-06 — P1 — Harden public operational surfaces.** Decide whether Swagger/OpenAPI should be public in beta, return generic client-safe 500 responses instead of raw exception messages, and expand health checks to distinguish liveness from dependency readiness without exposing secrets.
- [ ] **SEC-07 — P1 — Add public-verification safeguards without removing final-PDF access.** Use short-lived signed URLs, access/audit logging, rate limits, enumeration resistance, cache controls, and incident revocation/re-finalization procedures. Verify that only the intended final package is returned.
- [ ] **SEC-08 — P1 — Review outbound webhook code before enabling it.** Generic outbound webhook delivery is incomplete/stubbed. Keep it disabled or finish signing, retries, idempotency, secret rotation, destination allow/deny policy, and observability.
- [ ] **SEC-09 — P1 — Remove personal notary details from repository documentation.** Review `docs/notaries.md`, decide whether the data is authorized test/public information, replace it with fixtures if not, and assess history cleanup and credential/contact rotation separately before any destructive history rewrite.

### Authentication, authorization, RLS, and invitations

- [ ] **AUTH-01 — P0 — Bind invite claims to the intended verified email account.** A new signer may create an account first, but the claim must only succeed when the authenticated account's verified normalized email matches the invitation recipient. Profile completion can remain a prerequisite before signing.
- [ ] **AUTH-02 — P0 — Make invite claiming atomic and idempotent.** Invite, token, recipient, and claimed-user updates currently span separate operations. Use a transaction/database function so failure cannot consume a token or bind only part of the invitation state.
- [ ] **AUTH-03 — P1 — Test legacy notary-code access as a fallback authorization path.** Ensure a code never reveals or claims a request for the wrong authenticated notary and cannot bypass selected-notary jurisdiction/assignment rules.
- [ ] **AUTH-04 — P1 — Expand RLS tests and run them in CI.** The existing SQL policy test is old and covers only a limited core. Cover invitation, identity, session, realtime, finalization, billing, audit, and storage access. Test member, invited signer, selected notary, wrong notary, admin, anonymous, and service-role boundaries.
- [ ] **AUTH-05 — P1 — Audit service-role usage.** Backend application authorization remains the primary control where service-role queries bypass RLS. Inventory every service-role route and add negative authorization tests.

### Identity, privacy, and retention

- [ ] **DATA-01 — P0 — Adopt an interim private-beta data-retention policy.** At minimum define owner, purpose, access, retention clock, deletion/archival action, and legal hold for identity identifiers, identity images if any, addresses, raw GPS samples, same-place conclusions, check-in/event metadata, signatures, working documents, final documents, audit logs, verification logs, and backups.
- [ ] **DATA-02 — P0 — Correct identity field semantics.** Some workflows store complete passport/passport-card/military/resident/foreign-passport identifiers in a field named like a masked identifier. Rename or reshape the contract so code, UI, logs, and policy do not incorrectly imply masking.
- [ ] **DATA-03 — P0 — Restrict and protect complete identity identifiers.** Prevent identifiers from appearing in general read models, logs, analytics, crash reports, notifications, and client caches. Add field-level encryption or an equivalent protected store, strict role-based access, and access audit events.
- [ ] **DATA-04 — P1 — Minimize identity data after session completion.** After the notary no longer needs the full value, retain only the legally required subset—potentially last four characters plus type/issuer/expiry—and securely delete the full value, subject to CA/OH counsel and recordkeeping requirements.
- [ ] **DATA-05 — P1 — Implement retention enforcement.** Scheduled jobs and deletion/anonymization routines must cover identity events/check-in metadata and GPS evidence, not only meeting artifacts. Include backups, retries, legal holds, audit proof, and failure alerts.
- [ ] **DATA-06 — P1 — Add member-facing disclosure and operational procedures.** Explain what is collected, why, who sees it, how long it is kept, and how access/deletion/legal-hold requests are handled. Align web, iOS, privacy policy, and support procedures.

### Legal document integrity and auditability

- [ ] **INT-01 — P0 — Define fail-closed audit events for legally material transitions.** The generic audit writer currently logs a warning and allows the mutation to continue if persistence fails. Signing, invite acceptance, notary approval/rejection, identity verification, acknowledgment sealing, finalization, hash creation, ledger attempts, and public-package publication need a documented failure policy. Use durable transactional/outbox patterns where required.
- [ ] **INT-02 — P0 — Make critical multi-step workflows atomic or recoverable.** Review invitation claim, document generation, signature completion, notarization submission, session advancement, acknowledgment, storage/database finalization, and billing fulfillment. Add database transactions, idempotency keys, state-machine preconditions, compensating cleanup, and recovery jobs.
- [ ] **INT-03 — P1 — Use real content hashes for legal templates.** Current template hash values are labels rather than hashes of the exact Markdown/template bytes. Hash the resolved template content, store version/provenance, verify it during generation, and retain enough metadata to reproduce what was rendered.
- [ ] **INT-04 — P1 — Lock final-package composition with tests.** Verify CA/OH acknowledgment language, signature/seal placement, watermark, IDN, trust-certificate inclusion/visibility rules, hash source bytes, and final PDF returned by public verification.
- [ ] **INT-05 — P1 — Clarify uploaded-document acknowledgment modeling.** Uploaded-document notarization currently reuses/coerces a POA-oriented internal family. Replace this brittle abstraction with an explicit uploaded-document/notarial-act model before it causes jurisdiction or rendering errors.

### In-person session and location evidence

- [ ] **SESSION-01 — P0 — Stabilize the current session errors.** Use the staging error register to isolate permission, freshness, accuracy, backgrounding, realtime, address-autocomplete, and state-transition failures on web and iOS.
- [ ] **SESSION-02 — P1 — Replace development same-place defaults with approved policy.** Analyze observed GPS accuracy and failure rates, define maximum distance, sample count, acceptable accuracy, freshness window, retry/manual-review behavior, and accessible fallback. Obtain product/legal approval before calling the result proof of co-presence.
- [ ] **SESSION-03 — P1 — Preserve evidence and conclusion separately.** Record raw measurements under the retention policy and store the derived same-place decision, algorithm/version, thresholds, timestamps, and actor/device context required for audit.
- [ ] **SESSION-04 — P0 — Remove scheduling from active launch behavior.** Hide or disable scheduling/booking surfaces and messages in web, iOS, APIs, and notifications where they would imply DARCi arranges the meeting. Preserve dormant code only with explicit feature flags and tests.
- [ ] **SESSION-05 — P0 — Remove remote-notarization claims from launch surfaces.** Product, legal, help, API, and app copy should describe the current in-person process. Remote online notarization should exist only as a separately scoped future roadmap item, if retained at all.

### Jurisdiction, compliance, ledger, and public claims

- [ ] **LEGAL-01 — P0 — Complete CA/OH legal content review.** Current jurisdiction seed rows/templates include `needs_review` markers. Licensed counsel must approve required fields, certificate/acknowledgment wording, signing rules, notary recordkeeping, identity evidence, retention, and public verification disclosures.
- [ ] **LEGAL-02 — P0 — Enforce the CA/OH launch boundary everywhere.** Validate intake, document creation, notary eligibility, template selection, UI availability, API submission, admin controls, and tests. Other jurisdictions may remain in data/config only if clearly unavailable.
- [ ] **LEGAL-03 — P0 — Correct marketing and legal claims.** Remove or qualify statements such as real distributed-ledger anchoring, universal compliance, all legal standards, remote signing/notarization, or document non-publicity until the implementation and legal review support them.
- [ ] **LEDGER-01 — P2 — Select a production ledger/notarization-proof provider.** Define the legal/business purpose, data written externally, privacy model, immutability, cost, throughput, availability, SDK/API maturity, chain/provider risk, and verification longevity before selecting a vendor or network.
- [ ] **LEDGER-02 — P2 — Implement real anchoring behind the existing boundary.** Replace the stub/unconfigured modes with signed provider requests, immutable attempt history, retries, finality/confirmation state, reconciliation, provider outage handling, and public proof verification.
- [ ] **LEDGER-03 — P2 — Preserve truthful degraded behavior.** Document hashing and finalization must remain valid if the ledger is unavailable. The UI/API must distinguish `hash created`, `anchor pending`, `anchor failed`, and `anchor confirmed` rather than fabricating completion.

### Stripe and billing

- [ ] **BILL-01 — P0/P1 — Decide the private-beta billing gate.** If beta notaries must pay, Stripe is P0. If private beta is free/invite-only, explicitly feature-disable membership enforcement and make Stripe P1 before paid/public launch.
- [ ] **BILL-02 — P0/P1 — Implement the illuminotary subscription MVP.** Follow `docs/stripe-implementation-roadmap.md`: Stripe products/prices, verified-notary checkout, signed webhook ingestion, idempotent fulfillment, local billing/subscription state, capacity entitlement, Customer Portal, and reconciliation.
- [ ] **BILL-03 — P1 — Define capacity and lifecycle policy.** Confirm what counts toward the Basic/Plus limit, reset boundary, upgrade/downgrade behavior, past-due grace, cancellation, refunds, disputes, incomplete sessions, and administrator overrides.
- [ ] **BILL-04 — P1 — Never trust redirect success for fulfillment.** Grant membership/capacity only from verified Stripe webhooks or trusted server-side Stripe verification, with replay-safe processing and audit events.

### Platform, CI, operations, and maintainability

- [ ] **OPS-01 — P0 — Add readiness checks and beta runbooks.** Check database, storage, Redis/queues, email, push, maps configuration, and finalization dependencies. Define incident ownership, contact paths, log/correlation lookup, degraded modes, and recovery procedures.
- [ ] **OPS-02 — P1 — Monitor the complete legal workflow.** Add dashboards/alerts for invite delivery/claim, signature completion, notary acceptance, session advancement, location failure, acknowledgment generation, finalization, hash record, public verification, webhook, and retention-job failures.
- [ ] **OPS-03 — P1 — Verify email/push/deep-link delivery in staging.** Include selected-notary notifications, signer invitations, universal links, APNs, Resend configuration, retries, expiry, and duplicate-event behavior.
- [ ] **ARCH-01 — P2 — Split oversized controllers/pages/views by workflow boundary.** Several backend controllers, web pages, and SwiftUI views are thousands of lines long. Extract state machines, service boundaries, view models, schemas, and smaller components with characterization tests first.
- [ ] **ARCH-02 — P2 — Generate or centralize API contracts.** The 13,000-line OpenAPI definition does not currently generate clients; the shared types package is very small and effectively unused. Generate web/Swift models or introduce contract tests so clients stop drifting from the API.
- [ ] **ARCH-03 — P2 — Remove or formally archive obsolete scaffolding.** Confirm the old top-level Flutter/mobile skeleton is unused, then archive/remove it in a separate reviewed change so contributors do not maintain the wrong client.
- [ ] **ARCH-04 — P2 — Establish file ownership and review boundaries.** Assign owners for auth, legal templates, finalization, identity/location, billing, infrastructure, iOS, and web. Require specialist review for legal text, security controls, schema changes, and public claims.

## Recommended Roadmap

The roadmap is ordered by release gates rather than dates. A phase completes when its exit criteria are met.

### Phase 0 — Scope and truth lock

Goal: stop ambiguity from generating more incorrect behavior or copy.

Work:

- Adopt the confirmed product truth and decision register in this document.
- Treat California/Ohio, in-person notarization, external meeting coordination, email-linked signer accounts, intentional public final PDFs, and the internal trust certificate as locked beta assumptions.
- Decide whether private-beta notaries are charged. This determines whether Stripe is a beta-entry blocker or a controlled-beta deliverable.
- Assign product, engineering, security/privacy, and CA/OH legal owners.
- Create the staging error register and beta go/no-go checklist.

Exit criteria:

- No unresolved contradiction about the beta flow.
- Billing gate decision recorded.
- Every P0 item has an owner and status.
- Active copy does not promise a materially different product.

### Phase 1 — Private-beta entry gate

Goal: make a small, controlled beta safe enough to produce useful evidence without risking silent legal-document corruption or obvious account/data exposure.

Recommended P0 sequence:

1. Fix test compilation/typecheck drift and make the shipping CI baseline green (`BETA-03`, `BETA-04`).
2. Reproduce and stabilize current session/location errors (`BETA-01`, `SESSION-01`).
3. Triage critical/high dependency exposure and install baseline rate limits/security headers (`SEC-01` through `SEC-04`).
4. Adopt the interim retention policy and protect complete identity identifiers (`DATA-01` through `DATA-03`).
5. Make invite claims verified-email-bound and atomic (`AUTH-01`, `AUTH-02`).
6. Make legally material audit/state transitions fail safely and recoverably (`INT-01`, `INT-02`).
7. Enforce CA/OH only, remove active RON/scheduling claims, and align public-verification disclosure (`SESSION-04`, `SESSION-05`, `LEGAL-01` through `LEGAL-03`).
8. Complete Stripe MVP if beta charging is required; otherwise feature-disable charging/membership enforcement with a recorded limitation (`BILL-01`, `BILL-02`).
9. Run full real-account CA/OH smoke tests on web and iOS (`BETA-02`).

Exit criteria:

- No open unreviewed critical advisory or reachable unmitigated high advisory.
- Web and iOS can complete the enabled CA/OH flows with known limitations documented.
- Identity retention and access rules exist and are enforced at least for beta data.
- Invite claims cannot bind to the wrong email-linked account.
- Critical document states cannot silently advance without required audit/integrity records.
- Public verification returns the intended final PDF and nothing outside its approved package.
- All P0 tests/builds and staging smoke scenarios pass.
- Legal/product copy matches the implemented in-person CA/OH workflow.

### Phase 2 — Controlled private beta

Goal: operate with a small invited cohort, measure real failure modes, and finish P1 hardening.

Work:

- Limit enrollment and jurisdictions through server-side feature controls.
- Monitor every document through invitation, signing, selection, session, finalization, and verification.
- Complete RLS/service-role negative testing, retention automation, template provenance, final-package composition tests, public-verification safeguards, and operational runbooks.
- Collect location accuracy/failure evidence before changing the development threshold.
- Verify notification, universal-link, APNs, email, and recovery behavior with real devices/accounts.
- Complete Stripe lifecycle/capacity behavior if payments were feature-disabled at beta entry.
- Maintain a known-issues register and communicate limitations to beta users.

Exit criteria:

- P1 security, identity, authorization, integrity, and operations items are complete or explicitly accepted with deadlines.
- No recurring unexplained document-finalization, location, invite, or authorization failure.
- Retention jobs and deletion/minimization behavior are tested.
- Incident response, rollback, backup, and reconciliation procedures have been exercised.
- Product and engineering have evidence-based same-place policy recommendations for legal review.

### Phase 3 — Public/paid launch readiness

Goal: move from trusted beta users to broader availability without unsupported compliance claims.

Work:

- Obtain final CA/OH counsel approval for templates, notarial flow, identity handling, retention, disclosures, and recordkeeping.
- Complete paid billing, refund/cancellation/dispute operations, and financial reconciliation.
- Complete external security review/penetration testing and remediate findings.
- Establish service objectives, on-call/incident processes, production deployment approvals, disaster recovery, backup restoration, and dependency monitoring.
- Decide whether public launch requires a real ledger. If it does, finish `LEDGER-01` through `LEDGER-03`. If it does not, remove ledger promises and expose hash verification truthfully without suggesting external anchoring.
- Review public final-PDF verification with legal/privacy stakeholders and ensure the bearer-IDN model is clearly disclosed.

Exit criteria:

- Written CA/OH legal approval.
- Stripe production reconciliation and failure handling verified.
- Security review complete with no unresolved critical/high launch finding.
- Production operations and recovery exercises complete.
- Ledger/hash language exactly matches deployed behavior.
- Public verification and identity-retention disclosures are approved and consistent across web, iOS, and legal documents.

### Phase 4 — Post-launch maintainability and expansion

Goal: reduce delivery risk before adding jurisdictions or remote-notarization capabilities.

Work:

- Break down oversized files and clarify domain boundaries.
- Generate typed API clients or enforce cross-platform contract tests.
- Archive obsolete client scaffolding.
- Finish generic webhook support only when a real integration requires it.
- Evaluate additional jurisdictions one at a time with counsel-approved templates, rules, tests, and launch controls.
- Treat remote online notarization as a new product/compliance program, not a copy change to the in-person flow.

Exit criteria:

- Cross-platform API drift is caught automatically.
- High-risk modules have clear ownership and manageable boundaries.
- Each new jurisdiction/product has its own legal, security, operational, and test gate.

## Private Beta Go/No-Go Checklist

The first private-beta user should not be admitted until every required item below is checked or has a named, dated, written risk acceptance and a server-side feature disablement where applicable.

- [ ] California and Ohio are the only enabled jurisdictions.
- [ ] Remote-notarization and in-app scheduling claims/surfaces are removed or disabled.
- [ ] CA/OH templates and notarial wording have beta-level legal approval.
- [ ] Web, backend, types, and iOS test/build gates pass.
- [ ] Real web/iOS staging smoke tests pass for every enabled product and jurisdiction.
- [ ] Current session/location errors are reproducible, resolved, or have safe fallback behavior.
- [ ] No unreviewed critical or reachable unmitigated high production dependency advisory remains.
- [ ] Rate limiting, security headers, safe errors, and public verification controls are active.
- [ ] Invite claims require an authenticated, verified, matching email account and are atomic.
- [ ] Interim identity, GPS, document, audit, verification, and backup retention policy is approved.
- [ ] Complete identity identifiers are restricted, protected, and excluded from logs/general read models.
- [ ] Legally material transitions have durable audit/integrity behavior and recovery paths.
- [ ] Final-package composition and SHA-256 hashing are tested against the exact published bytes.
- [ ] Public verification disclosure accurately states that the final PDF is available to a holder of the IDN.
- [ ] Trust-certificate visibility and required package inclusion are tested.
- [ ] Stripe is production-like in staging, or billing/membership enforcement is explicitly disabled for a free invite-only beta.
- [ ] Notifications, email, push, deep links, realtime, storage, maps, and queues are verified in staging.
- [ ] Monitoring, correlation IDs, support escalation, rollback, and incident runbooks are ready.
- [ ] Known beta limitations are documented for participants.

## Open Decisions That Still Need Owners

These are not requests for immediate answers; they are decisions the roadmap must resolve before their respective gate.

1. Is the private beta paid, or free/invite-only with billing disabled?
2. Who owns privacy/retention policy approval and who is the CA/OH legal reviewer?
3. Which complete identity fields are legally required to be retained after the session, and for how long?
4. Does the public final PDF include the internal trust certificate as part of the legal package, and is that exact composition approved for anyone holding the IDN?
5. What event consumes one notary plan unit: accepted request, started session, completed document, or another action?
6. What manual fallback is allowed when GPS/location evidence is inaccurate or unavailable during an otherwise valid in-person meeting?
7. Is a production ledger a public-launch requirement, or should launch use document hashing only until a provider is selected?
8. Who owns security incident response, dependency triage, billing reconciliation, and failed-finalization recovery during beta?

## Existing Detailed Documents

Use these documents for implementation detail, but defer to this roadmap when old assumptions conflict with the confirmed product truth above:

- `docs/stripe-implementation-roadmap.md`
- `docs/signer-invitation-workflow-roadmap.md`
- `docs/in-person-session-completion-roadmap.md`
- `docs/in-person-session-realtime-roadmap.md`
- `docs/in-person-session-live-activity-roadmap.md`
- `docs/notarization-selected-notary-handoff-roadmap.md`
- `docs/jurisdiction-launch-runbook.md`
- `docs/first-class-error-reporting-roadmap.md`
- `docs/first-class-error-reporting-runbook.md`
- `docs/document-audit-events-reference.md`
- `docs/audit-events.md`
- `docs/last-mile-delivery-snapshot.md`

## Maintenance Rules

1. Update the decision register when product intent changes.
2. Never mark a task complete because code exists; require the listed exit evidence.
3. Record accepted risks with owner, reason, mitigation, expiry date, and review date.
4. Keep legal approval separate from engineering completion.
5. Keep intentional public final-PDF verification visible in privacy and threat-model reviews.
6. Do not re-enable scheduling, new jurisdictions, remote notarization, paid billing, or real-ledger claims without completing the relevant gate.
7. Update narrow implementation roadmaps when execution details change, and update this umbrella document when priority or product truth changes.
