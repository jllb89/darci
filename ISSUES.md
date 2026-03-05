# DARCI v1 GitHub Issues

This list is structured for creating GitHub issues with labels and weekly milestones.

## Label Set (to create)
- week-1, week-2, week-3, week-4, week-5, week-6
- product, design, backend, frontend, mobile, infra, docs, qa, security

## Week 1 - Discovery + UI/UX Planning

### W1-01 Requirements lock and success criteria
- Labels: week-1, product
- Milestone: Week 1
- Description: Lock scope, success metrics, and priority flows for v1.
- Checklist:
  - Confirm v1 goals and non-goals
  - Define success metrics (time-to-notarize, completion rate, notary turnaround)
  - Document legal and compliance assumptions by jurisdiction
  - Review and sign off with stakeholders
- Acceptance criteria:
  - Requirements doc approved and versioned

### W1-02 UX research and insights summary
- Labels: week-1, product, design
- Milestone: Week 1
- Description: Run light research with members and notaries to validate pain points.
- Checklist:
  - Conduct 3-5 member interviews
  - Conduct 2-3 notary interviews
  - Summarize key friction points
  - Translate insights into UX requirements
- Acceptance criteria:
  - Insights summary shared and accepted

### W1-03 User journeys and wireflows
- Labels: week-1, product, design
- Milestone: Week 1
- Description: Map member, notary, admin, and public verification flows.
- Checklist:
  - Member journey map and flow diagram
  - Notary journey map and flow diagram
  - Admin and public verification flow summaries
  - Review and revise based on feedback
- Acceptance criteria:
  - Journey maps approved by stakeholders

### W1-04 Wireframes for core screens
- Labels: week-1, design
- Milestone: Week 1
- Description: Produce wireframes for member, notary, admin, and public pages.
- Checklist:
  - Member: dashboard, document detail, submit
  - Notary: code entry, request detail, sign and submit
  - Admin: dashboard overview, notary list
  - Public: verification lookup + result
- Acceptance criteria:
  - Wireframes reviewed and signed off

### W1-05 Design system foundations
- Labels: week-1, design
- Milestone: Week 1
- Description: Establish the base design system for UI build.
- Checklist:
  - Typography scale and font pairing
  - Color palette and semantic colors
  - Spacing and layout grid
  - Core components (button, input, badge, status)
- Acceptance criteria:
  - Design tokens and components available to devs

## Week 2 - Architecture + Backend Foundations

### W2-01 Database schema review and constraints
- Labels: week-2, backend, infra
- Milestone: Week 2
- Description: Validate schema and tighten constraints for v1 tables.
- Checklist:
  - Add missing NOT NULL and FK constraints
  - Add indexes for frequent lookups
  - Review cascade rules for deletes and updates
  - Validate storage buckets
- Acceptance criteria:
  - Migration updated and reviewed

### W2-02 RLS policies and access rules
- Labels: week-2, backend, security
- Milestone: Week 2
- Description: Review and validate RLS policies for all tables and storage.
- Checklist:
  - Ensure member and notary access rules are correct
  - Validate service role access paths
  - Add RLS policy tests for core access scenarios
- Acceptance criteria:
  - RLS tests pass and policy review complete

### W2-03 OpenAPI v1 schema completion
- Labels: week-2, backend, docs
- Milestone: Week 2
- Description: Expand OpenAPI to include request and response schemas.
- Checklist:
  - Add schema definitions for each endpoint
  - Standardize error response shape
  - Document auth requirements per route
- Acceptance criteria:
  - OpenAPI spec ready for client generation

### W2-04 Auth middleware and role guards
- Labels: week-2, backend, security
- Milestone: Week 2
- Description: Implement auth middleware and role-based authorization.
- Checklist:
  - Supabase auth token verification
  - Role guard middleware (member/notary/admin)
  - Auth errors and logging
- Acceptance criteria:
  - Protected routes enforce correct access

### W2-05 CI/CD and monitoring baseline
- Labels: week-2, infra, qa
- Milestone: Week 2
- Description: Stabilize CI, environments, and monitoring.
- Checklist:
  - CI pipeline green for backend/web/types
  - Add staging and production env config
  - Sentry and OTEL baseline setup
- Acceptance criteria:
  - CI green and monitoring events visible

## Week 3 - Core Backend + Member Flow

### W3-01 Document upload + IDN assignment
- Labels: week-3, backend
- Milestone: Week 3
- Description: Implement document upload (signed URL flow), versioning, and IDN assignment.
- Checklist:
  - Done: storage paths + naming scheme (owner_id/document_id/v1)
  - Done: API request upload (create document row, version row, return signed upload URL)
  - Done: API finalize upload (confirm object metadata, update version)
  - Done: server-side validation (PDF only, max 25 MB)
  - Done: document type handling (template or explicit input)
  - Done: assign IDN on finalize
  - Done: audit events for upload request + finalize
  - Done: OpenAPI schema updates + error responses
  - Done: smoke tests (happy path, invalid type, oversized, missing object)
  - Remaining: replace stubbed GETs with real data (documents, document detail, versions)
  - Remaining: add automated test coverage in CI (if desired beyond smoke script)
- Acceptance criteria:
  - API creates document with IDN and version via signed URL flow

### W3-02 Member signature capture
- Labels: week-3, backend
- Milestone: Week 3
- Description: Support member signature upload and storage.
- Checklist:
  - Done: API to save signature asset
  - Done: Link signature to document
  - Done: Validate file types and sizes
  - Done: OpenAPI updates and tests
- Acceptance criteria:
  - Signature stored and retrievable

### W3-03 Notarization submission + code issuance
- Labels: week-3, backend
- Milestone: Week 3
- Description: Create notarization request and issue illuminotarization code.
- Checklist:
  - Create request record
  - Generate code with expiry
  - Update document status
- Acceptance criteria:
  - Request is created and code is issued

### W3-04 Member dashboard endpoints
- Labels: week-3, backend
- Milestone: Week 3
- Description: Add endpoints for member dashboard data.
- Checklist:
  - List active documents and statuses
  - Provide recent activity summary
  - Include pending and completed counts
- Acceptance criteria:
  - Dashboard response supports UI needs

### W3-05 Member audit events
- Labels: week-3, backend, qa
- Milestone: Week 3
- Description: Capture audit events for member actions.
- Checklist:
  - Create audit event entries for uploads and signatures
  - Include metadata for traceability
- Acceptance criteria:
  - Audit events visible in database

## Week 4 - Notary Flow + Document Integrity

### W4-01 Code resolve and request access
- Labels: week-4, backend
- Milestone: Week 4
- Description: Enable notary access via illuminotarization code.
- Checklist:
  - Resolve code to request
  - Validate code expiry and consumption
  - Update request state
- Acceptance criteria:
  - Notary can access request via code

### W4-02 Acknowledgment generation
- Labels: week-4, backend, docs
- Milestone: Week 4
- Description: Generate acknowledgment page based on jurisdiction templates.
- Checklist:
  - Template storage and rendering
  - Attach acknowledgment to document
  - Persist acknowledgment metadata
  - Block signature capture until acknowledgment is appended
- Acceptance criteria:
  - Acknowledgment page appended correctly

### W4-03 Watermarking pipeline
- Labels: week-4, backend
- Milestone: Week 4
- Description: Watermark document pages with IDN and notice.
- Checklist:
  - Apply watermark to all pages
  - Store watermarked document
  - Update version metadata
- Acceptance criteria:
  - Watermarked document stored and linked

### W4-04 Notary signature and seal
- Labels: week-4, backend
- Milestone: Week 4
- Description: Capture notary signature and seal, and store notarized copy.
- Checklist:
  - Save notary signature asset
  - Apply seal to document
  - Store notarized copy in storage
- Acceptance criteria:
  - Notarized copy stored and linked

### W4-05 Notary audit and compliance logs
- Labels: week-4, backend, security
- Milestone: Week 4
- Description: Capture notary actions for audit compliance.
- Checklist:
  - Log code resolve, review, sign, submit actions
  - Ensure timestamps and actor IDs are stored
- Acceptance criteria:
  - Compliance logs available for review

## Week 5 - Frontend Build

### W5-01 Member UI core screens
- Labels: week-5, frontend
- Milestone: Week 5
- Description: Build member UI for upload, sign, submit, and status.
- Checklist:
  - Dashboard and document list UI
  - Document detail view with signing
  - Submit for notarization workflow
- Acceptance criteria:
  - Member can complete flow in staging UI

### W5-02 Notary UI core screens
- Labels: week-5, frontend
- Milestone: Week 5
- Description: Build notary UI for code access, review, sign, submit.
- Checklist:
  - Code entry and validation UI
  - Request detail and preview UI
  - Sign and submit screens
- Acceptance criteria:
  - Notary can complete flow in staging UI

### W5-03 Admin dashboard baseline
- Labels: week-5, frontend
- Milestone: Week 5
- Description: Add initial admin dashboard views.
- Checklist:
  - KPI summary cards
  - Notary list with status
  - Audit log view placeholder
- Acceptance criteria:
  - Admin dashboard renders real data

### W5-04 Public verification UI
- Labels: week-5, frontend
- Milestone: Week 5
- Description: Build public verification page UI.
- Checklist:
  - IDN lookup form
  - Result view with proof summary
- Acceptance criteria:
  - Public verification flow works end-to-end

### W5-05 Frontend UI states and error handling
- Labels: week-5, frontend, qa
- Milestone: Week 5
- Description: Add loading, empty, error, and access denied states.
- Checklist:
  - Standardize status components
  - Error handling for API failures
  - Empty-state copy for key pages
- Acceptance criteria:
  - UI handles edge states cleanly

### W5-06 Mobile app shell
- Labels: week-5, mobile
- Milestone: Week 5
- Description: Set up Flutter navigation and placeholder screens.
- Checklist:
  - App shell and routing
  - Placeholder screens for member flow
  - Basic theming aligned to design system
- Acceptance criteria:
  - Mobile app launches and navigates

## Week 6 - Ledger + Verification + Hardening

### W6-01 Hashing and ledger anchoring
- Labels: week-6, backend, infra
- Milestone: Week 6
- Description: Implement hashing pipeline and ledger anchoring via workers.
- Checklist:
  - Hash notarized PDFs
  - Anchor IDN + hash to ledger
  - Store ledger entries
- Acceptance criteria:
  - Ledger entries created and verifiable

### W6-02 Verification endpoint + proof payload
- Labels: week-6, backend, frontend
- Milestone: Week 6
- Description: Expose verification endpoint and integrate proof display.
- Checklist:
  - API returns ledger proof payload
  - UI renders authenticity and proof
- Acceptance criteria:
  - Verification works end-to-end

### W6-03 QA test plan and execution
- Labels: week-6, qa
- Milestone: Week 6
- Description: Formalize and run QA across the flow.
- Checklist:
  - Test cases for upload, sign, notarize, verify
  - Regression checks
  - Bug triage and fixes
- Acceptance criteria:
  - QA report delivered and issues tracked

### W6-04 Security review and fixes
- Labels: week-6, security
- Milestone: Week 6
- Description: Security review of auth, RLS, storage, and APIs.
- Checklist:
  - Validate RLS and storage policies
  - Review rate limiting and audit logs
  - Patch any findings
- Acceptance criteria:
  - Security review signed off

### W6-05 Docs and launch readiness
- Labels: week-6, docs
- Milestone: Week 6
- Description: Finalize docs and launch checklist.
- Checklist:
  - API docs and runbook
  - Support playbooks
  - Launch readiness review
- Acceptance criteria:
  - Launch checklist approved
