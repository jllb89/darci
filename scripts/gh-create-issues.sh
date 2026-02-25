#!/usr/bin/env bash
set -euo pipefail

# Requires: GitHub CLI (gh) authenticated.
# Repo: https://github.com/jllb89/darci.git

REPO="jllb89/darci"

echo "Creating labels..."
while IFS= read -r label; do
	[[ -z "$label" ]] && continue
	gh label create "$label" --repo "$REPO" --color "ededed" --force
done < "$(dirname "$0")/../.github/labels.txt"

echo "Creating milestones..."
for week in 1 2 3 4 5 6; do
	gh api -X POST "repos/$REPO/milestones" -f title="Week $week" >/dev/null || true
done

create_issue() {
	local title="$1"
	local labels="$2"
	local milestone="$3"
	local body="$4"

	gh issue create \
		--repo "$REPO" \
		--title "$title" \
		--label "$labels" \
		--milestone "$milestone" \
		--body "$body"
}

echo "Creating issues..."

create_issue "W1-01 Requirements lock and success criteria" "week-1,product" "Week 1" "## Goal
Lock scope, success metrics, and priority flows for v1.

## Description
Define requirements, success criteria, and non-goals for DARCI v1.

## Checklist
- [ ] Confirm v1 goals and non-goals
- [ ] Define success metrics (time-to-notarize, completion rate, notary turnaround)
- [ ] Document legal and compliance assumptions by jurisdiction
- [ ] Review and sign off with stakeholders

## Acceptance Criteria
- [ ] Requirements doc approved and versioned"

create_issue "W1-02 UX research and insights summary" "week-1,product,design" "Week 1" "## Goal
Validate key pain points with members and notaries.

## Description
Run lightweight research and summarize findings into UX requirements.

## Checklist
- [ ] Conduct 3-5 member interviews
- [ ] Conduct 2-3 notary interviews
- [ ] Summarize key friction points
- [ ] Translate insights into UX requirements

## Acceptance Criteria
- [ ] Insights summary shared and accepted"

create_issue "W1-03 User journeys and wireflows" "week-1,product,design" "Week 1" "## Goal
Map member, notary, admin, and public verification flows.

## Description
Create journey maps and wireflows for all core experiences.

## Checklist
- [ ] Member journey map and flow diagram
- [ ] Notary journey map and flow diagram
- [ ] Admin and public verification flow summaries
- [ ] Review and revise based on feedback

## Acceptance Criteria
- [ ] Journey maps approved by stakeholders"

create_issue "W1-04 Wireframes for core screens" "week-1,design" "Week 1" "## Goal
Produce wireframes for member, notary, admin, and public pages.

## Description
Create low-fidelity layouts for all v1 screens.

## Checklist
- [ ] Member: dashboard, document detail, submit
- [ ] Notary: code entry, request detail, sign and submit
- [ ] Admin: dashboard overview, notary list
- [ ] Public: verification lookup + result

## Acceptance Criteria
- [ ] Wireframes reviewed and signed off"

create_issue "W1-05 Design system foundations" "week-1,design" "Week 1" "## Goal
Establish the base design system for UI build.

## Description
Define tokens and components for consistent UI.

## Checklist
- [ ] Typography scale and font pairing
- [ ] Color palette and semantic colors
- [ ] Spacing and layout grid
- [ ] Core components (button, input, badge, status)

## Acceptance Criteria
- [ ] Design tokens and components available to devs"

create_issue "W2-01 Database schema review and constraints" "week-2,backend,infra" "Week 2" "## Goal
Validate schema and tighten constraints for v1 tables.

## Description
Review v1 schema and storage buckets, add constraints and indexes.

## Checklist
- [ ] Add missing NOT NULL and FK constraints
- [ ] Add indexes for frequent lookups
- [ ] Review cascade rules for deletes and updates
- [ ] Validate storage buckets

## Acceptance Criteria
- [ ] Migration updated and reviewed"

create_issue "W2-02 RLS policies and access rules" "week-2,backend,security" "Week 2" "## Goal
Validate RLS policies for all tables and storage.

## Description
Review access rules for members, notaries, and service role.

## Checklist
- [ ] Ensure member and notary access rules are correct
- [ ] Validate service role access paths
- [ ] Add RLS policy tests for core access scenarios

## Acceptance Criteria
- [ ] RLS tests pass and policy review complete"

create_issue "W2-03 OpenAPI v1 schema completion" "week-2,backend,docs" "Week 2" "## Goal
Expand OpenAPI to include request and response schemas.

## Description
Document request/response shapes for all v1 routes.

## Checklist
- [ ] Add schema definitions for each endpoint
- [ ] Standardize error response shape
- [ ] Document auth requirements per route

## Acceptance Criteria
- [ ] OpenAPI spec ready for client generation"

create_issue "W2-04 Auth middleware and role guards" "week-2,backend,security" "Week 2" "## Goal
Implement auth middleware and role-based authorization.

## Description
Integrate Supabase auth and enforce member/notary/admin access.

## Checklist
- [ ] Supabase auth token verification
- [ ] Role guard middleware (member/notary/admin)
- [ ] Auth errors and logging

## Acceptance Criteria
- [ ] Protected routes enforce correct access"

create_issue "W2-05 CI/CD and monitoring baseline" "week-2,infra,qa" "Week 2" "## Goal
Stabilize CI, environments, and monitoring.

## Description
Ensure CI is green and baseline monitoring is in place.

## Checklist
- [ ] CI pipeline green for backend/web/types
- [ ] Add staging and production env config
- [ ] Sentry and OTEL baseline setup

## Acceptance Criteria
- [ ] CI green and monitoring events visible"

create_issue "W3-01 Document upload + IDN assignment" "week-3,backend" "Week 3" "## Goal
Implement document upload, versioning, and IDN assignment.

## Description
Support storing documents in storage with version tracking.

## Checklist
- [ ] Upload document to storage
- [ ] Create document version record
- [ ] Generate and assign IDN

## Acceptance Criteria
- [ ] API creates document with IDN and version"

create_issue "W3-02 Member signature capture" "week-3,backend" "Week 3" "## Goal
Support member signature upload and storage.

## Description
Store member signatures linked to documents.

## Checklist
- [ ] API to save signature asset
- [ ] Link signature to document
- [ ] Validate file types and sizes

## Acceptance Criteria
- [ ] Signature stored and retrievable"

create_issue "W3-03 Notarization submission + code issuance" "week-3,backend" "Week 3" "## Goal
Create notarization request and issue illuminotarization code.

## Description
Handle request creation and status transitions.

## Checklist
- [ ] Create request record
- [ ] Generate code with expiry
- [ ] Update document status

## Acceptance Criteria
- [ ] Request is created and code is issued"

create_issue "W3-04 Member dashboard endpoints" "week-3,backend" "Week 3" "## Goal
Add endpoints for member dashboard data.

## Description
Provide data for lists and status summaries.

## Checklist
- [ ] List active documents and statuses
- [ ] Provide recent activity summary
- [ ] Include pending and completed counts

## Acceptance Criteria
- [ ] Dashboard response supports UI needs"

create_issue "W3-05 Member audit events" "week-3,backend,qa" "Week 3" "## Goal
Capture audit events for member actions.

## Description
Persist audit events for uploads and signatures.

## Checklist
- [ ] Create audit event entries for uploads and signatures
- [ ] Include metadata for traceability

## Acceptance Criteria
- [ ] Audit events visible in database"

create_issue "W4-01 Code resolve and request access" "week-4,backend" "Week 4" "## Goal
Enable notary access via illuminotarization code.

## Description
Resolve code to request and validate access.

## Checklist
- [ ] Resolve code to request
- [ ] Validate code expiry and consumption
- [ ] Update request state

## Acceptance Criteria
- [ ] Notary can access request via code"

create_issue "W4-02 Acknowledgment generation" "week-4,backend,docs" "Week 4" "## Goal
Generate acknowledgment page based on jurisdiction templates.

## Description
Render and attach acknowledgment page to document.

## Checklist
- [ ] Template storage and rendering
- [ ] Attach acknowledgment to document
- [ ] Persist acknowledgment metadata

## Acceptance Criteria
- [ ] Acknowledgment page appended correctly"

create_issue "W4-03 Watermarking pipeline" "week-4,backend" "Week 4" "## Goal
Watermark document pages with IDN and notice.

## Description
Apply watermark across all pages and store version.

## Checklist
- [ ] Apply watermark to all pages
- [ ] Store watermarked document
- [ ] Update version metadata

## Acceptance Criteria
- [ ] Watermarked document stored and linked"

create_issue "W4-04 Notary signature and seal" "week-4,backend" "Week 4" "## Goal
Capture notary signature and seal, store notarized copy.

## Description
Store notary signature assets and final notarized PDF.

## Checklist
- [ ] Save notary signature asset
- [ ] Apply seal to document
- [ ] Store notarized copy in storage

## Acceptance Criteria
- [ ] Notarized copy stored and linked"

create_issue "W4-05 Notary audit and compliance logs" "week-4,backend,security" "Week 4" "## Goal
Capture notary actions for audit compliance.

## Description
Log notary actions with actor, timestamps, and metadata.

## Checklist
- [ ] Log code resolve, review, sign, submit actions
- [ ] Ensure timestamps and actor IDs are stored

## Acceptance Criteria
- [ ] Compliance logs available for review"

create_issue "W5-01 Member UI core screens" "week-5,frontend" "Week 5" "## Goal
Build member UI for upload, sign, submit, and status.

## Description
Implement core member screens connected to APIs.

## Checklist
- [ ] Dashboard and document list UI
- [ ] Document detail view with signing
- [ ] Submit for notarization workflow

## Acceptance Criteria
- [ ] Member can complete flow in staging UI"

create_issue "W5-02 Notary UI core screens" "week-5,frontend" "Week 5" "## Goal
Build notary UI for code access, review, sign, submit.

## Description
Implement core notary screens connected to APIs.

## Checklist
- [ ] Code entry and validation UI
- [ ] Request detail and preview UI
- [ ] Sign and submit screens

## Acceptance Criteria
- [ ] Notary can complete flow in staging UI"

create_issue "W5-03 Admin dashboard baseline" "week-5,frontend" "Week 5" "## Goal
Add initial admin dashboard views.

## Description
Implement KPI and notary management views.

## Checklist
- [ ] KPI summary cards
- [ ] Notary list with status
- [ ] Audit log view placeholder

## Acceptance Criteria
- [ ] Admin dashboard renders real data"

create_issue "W5-04 Public verification UI" "week-5,frontend" "Week 5" "## Goal
Build public verification page UI.

## Description
Implement IDN lookup and result view.

## Checklist
- [ ] IDN lookup form
- [ ] Result view with proof summary

## Acceptance Criteria
- [ ] Public verification flow works end-to-end"

create_issue "W5-05 Frontend UI states and error handling" "week-5,frontend,qa" "Week 5" "## Goal
Add loading, empty, error, and access denied states.

## Description
Standardize UI states and error handling patterns.

## Checklist
- [ ] Standardize status components
- [ ] Error handling for API failures
- [ ] Empty-state copy for key pages

## Acceptance Criteria
- [ ] UI handles edge states cleanly"

create_issue "W5-06 Mobile app shell" "week-5,mobile" "Week 5" "## Goal
Set up Flutter navigation and placeholder screens.

## Description
Create a minimal mobile shell aligned to design system.

## Checklist
- [ ] App shell and routing
- [ ] Placeholder screens for member flow
- [ ] Basic theming aligned to design system

## Acceptance Criteria
- [ ] Mobile app launches and navigates"

create_issue "W6-01 Hashing and ledger anchoring" "week-6,backend,infra" "Week 6" "## Goal
Implement hashing pipeline and ledger anchoring via workers.

## Description
Hash notarized documents and anchor IDN + hash to ledger.

## Checklist
- [ ] Hash notarized PDFs
- [ ] Anchor IDN + hash to ledger
- [ ] Store ledger entries

## Acceptance Criteria
- [ ] Ledger entries created and verifiable"

create_issue "W6-02 Verification endpoint + proof payload" "week-6,backend,frontend" "Week 6" "## Goal
Expose verification endpoint and integrate proof display.

## Description
Serve proof payload and show authenticity results.

## Checklist
- [ ] API returns ledger proof payload
- [ ] UI renders authenticity and proof

## Acceptance Criteria
- [ ] Verification works end-to-end"

create_issue "W6-03 QA test plan and execution" "week-6,qa" "Week 6" "## Goal
Formalize and run QA across the flow.

## Description
Define and execute test cases across the full journey.

## Checklist
- [ ] Test cases for upload, sign, notarize, verify
- [ ] Regression checks
- [ ] Bug triage and fixes

## Acceptance Criteria
- [ ] QA report delivered and issues tracked"

create_issue "W6-04 Security review and fixes" "week-6,security" "Week 6" "## Goal
Security review of auth, RLS, storage, and APIs.

## Description
Review and fix issues found during security audit.

## Checklist
- [ ] Validate RLS and storage policies
- [ ] Review rate limiting and audit logs
- [ ] Patch any findings

## Acceptance Criteria
- [ ] Security review signed off"

create_issue "W6-05 Docs and launch readiness" "week-6,docs" "Week 6" "## Goal
Finalize docs and launch checklist.

## Description
Complete API docs and operational runbook for launch.

## Checklist
- [ ] API docs and runbook
- [ ] Support playbooks
- [ ] Launch readiness review

## Acceptance Criteria
- [ ] Launch checklist approved"

echo "Done."
