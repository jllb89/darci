# DARCI v1 Roadmap (6 Weeks)

This roadmap builds on the current scaffold and focuses on the member-first notarization journey. Each week ends with a concrete demo and checklist.

## Week 1 - Discovery + UI/UX Planning

### Goals
- Lock requirements, success criteria, and priority flows.
- Produce wireframes and a design direction for member, notary, admin, and public verification.
- Establish the design system baseline for web and mobile.

### Deliverables
- Product requirements doc with success metrics and non-goals.
- End-to-end journey maps for member and notary.
- Wireframes for key screens.
- Design system starter kit (type, color, spacing, components).

### Work Items
- Requirements lock
  - Define success metrics (conversion, completion time, notary turnaround).
  - Confirm legal and compliance assumptions per jurisdiction.
  - Confirm v1 non-goals (workflow builder, advanced analytics).
- UX research
  - Interview targets: 3-5 members, 2-3 notaries.
  - Map friction points in existing notarization workflows.
  - Confirm required UI states (pending, in review, completed, rejected).
- User journeys
  - Member: upload -> sign -> submit -> share code -> receive notarized doc.
  - Notary: enter code -> review -> in-person verify -> sign/seal -> submit.
  - Public: verify by IDN -> see ledger proof.
- Wireframes
  - Member dashboard, new document, document detail, submission status.
  - Notary code entry, request detail, signature/seal, submission.
  - Admin dashboard overview, notary management, audit logs.
  - Public verification page.
- Design system foundations
  - Typography scale, color palette, spacing, elevation.
  - Button, input, badge, stepper, status chips.
  - Success and failure states, warning and compliance callouts.

### Acceptance Criteria
- Stakeholders sign off on flows, wireframes, and scope.
- Design system set for build use.
- Prototype walkthrough approved.

## Week 2 - Architecture + Backend Foundations

### Goals
- Finalize schema, API contracts, and baseline infra.
- Set up auth, roles, RLS, and core middleware.
- Establish CI/CD and observability baseline.

### Deliverables
- Supabase schema and storage policies updated and reviewed.
- OpenAPI spec v1 with request/response shapes.
- Auth middleware and role-based guards.
- CI/CD pipeline green.
- Sentry + OpenTelemetry baseline.

### Work Items
- Data layer
  - Validate v1 tables: users, documents, document_versions, notarization_requests,
    illuminotarization_codes, signatures, acknowledgment_pages, ledger_entries, audit_events.
  - Add missing constraints: NOT NULL, FK cascade rules, indexes.
  - Confirm storage buckets: documents, signatures, notarized-copies.
- API spec
  - Define request/response schemas for all v1 routes.
  - Add error schema and standard response envelope.
  - Confirm auth requirements per route.
- Auth and roles
  - Supabase Auth integration for backend.
  - Role and permission middleware (member/notary/admin).
  - RLS validation tests for common queries.
- CI/CD and monitoring
  - CI checks: backend tests, web lint, types build.
  - Environments: local, staging, production.
  - Sentry and OTEL wiring baseline.

### Acceptance Criteria
- Auth-protected API endpoints with role checks.
- OpenAPI spec usable for client generation.
- CI green for backend/web/types.

## Week 3 - Core Backend + Member Flow

### Goals
- Implement core member workflow services and endpoints.
- Support document upload/generation, IDN assignment, and signatures.
- Provide member dashboards and status tracking.

### Deliverables
- Document creation pipeline (upload + versioning).
- IDN generation and assignment.
- Member signature capture and storage.
- Member dashboard endpoints.

### Work Items
- Document services
  - Implement document creation endpoint with storage upload.
  - Generate IDN and assign to document.
  - Store document version and metadata.
- Signature services
  - Capture member signature.
  - Store signature assets in storage bucket.
- Notarization submission
  - Create notarization request and illuminotarization code.
  - Track status transitions: draft -> pending_notary.
- Member endpoints
  - List documents, status counts, recent activity.
  - Document detail with versions, signatures, and submission status.
- Audit and events
  - Record audit events for member actions.

### Acceptance Criteria
- Member can upload, sign, and submit.
- API returns dashboard-ready data.
- Audit trail recorded.

## Week 4 - Notary Flow + Document Integrity

### Goals
- Deliver notary code access and document review flow.
- Implement acknowledgment append and watermarking pipeline.
- Capture notary digital signature and seal.

### Deliverables
- Code-based access for notary.
- Acknowledgment page generation.
- Watermarking with IDN/notice.
- Notary signature and seal upload.

### Work Items
- Notary access
  - Code resolve endpoint and request retrieval.
  - Queue and request status transitions.
- Document integrity
  - Append acknowledgment page with jurisdiction verbiage.
  - Watermark all pages with IDN and notice.
- Notary signature + seal
  - Signature capture and seal attachment.
  - Store notarized copy in storage bucket.
- Audit and compliance
  - Notary action logging.
  - Compliance logs for changes.

### Acceptance Criteria
- Notary can access request via code.
- Acknowledgment and watermarking applied.
- Notarized copy stored and tracked.

## Week 5 - Frontend Build

### Goals
- Build core member, notary, admin, and public verification UI.
- Connect UI to backend endpoints.
- Provide consistent UI states and error handling.

### Deliverables
- Member UI: upload, sign, submit, status.
- Notary UI: code access, review, sign, submit.
- Admin dashboard baseline.
- Public verification page.

### Work Items
- Member web app
  - Dashboard and document list.
  - Document detail view with signing flow.
  - Submit for notarization with status tracker.
- Notary web app
  - Code entry and request details.
  - Review, signature, seal, submit.
- Admin app
  - KPI and system health view.
  - Notary management list with status.
- Public verification
  - IDN input and result page.
- UI states
  - Loading, empty, success, error, and access denied.

### Acceptance Criteria
- UI screens connect to v1 APIs and render real data.
- Member and notary flows are end-to-end usable in staging.

## Week 6 - Ledger + Verification + Hardening

### Goals
- Anchor documents to ledger and deliver public verification.
- Complete QA, security review, docs, and launch prep.

### Deliverables
- Hashing and ledger anchoring pipeline.
- Public verification endpoint + UI with proof.
- Test suite and final QA checklist.
- Launch readiness checklist.

### Work Items
- Ledger
  - Hash notarized documents via worker.
  - Anchor IDN + hash to ledger provider.
  - Store ledger entries and expose in verification.
- Verification
  - Public endpoint for IDN lookup.
  - UI display for authenticity and proof.
- Hardening
  - Security review for auth, RLS, storage policies.
  - Rate limiting and audit log review.
  - QA testing: upload, sign, notarize, verify.
- Docs and launch
  - API docs and operational runbook.
  - Support playbooks and monitoring alerts.

### Acceptance Criteria
- Ledger anchoring complete and verifiable.
- Public verification works end-to-end.
- Security review and QA passed.
- Launch checklist signed off.

## Cross-Cutting Tasks (All Weeks)

- Track scope creep and adjust weekly goals if needed.
- Maintain API contract consistency across backend, web, and mobile.
- Update documentation and changelog weekly.
- Capture feedback and iterate UX/UI.
