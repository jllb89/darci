# Success Metrics and Legal/Compliance Assumptions (v1)

This document captures v1 success metrics and legal/compliance assumptions for the initial jurisdiction.

## Scope
- Jurisdiction: US-CA
- v1 focus: member-first notarization journey with in-person acknowledgment

## Success Metrics (Definitions Only)

### 1) Time-to-notarize
- Definition: Elapsed time from member submission for notarization to notary submission of completed document.
- Start event: Member submits document for notarization (API: POST /documents/:id/submit-notarization).
- End event: Notary submits completed document (API: POST /notary/requests/:id/submit).
- Output: Median and P90 in minutes.
- Segments: Jurisdiction, document type, notary, time of day.

### 2) Completion rate
- Definition: Percentage of submitted notarization requests that reach "completed" within 7 days.
- Numerator: Requests completed within 7 days.
- Denominator: Requests submitted in the same cohort.
- Output: Weekly completion rate, with drop-off reasons tagged.
- Segments: Jurisdiction, member type, notary.

### 3) Notary turnaround time
- Definition: Elapsed time from code resolution by notary to notary submission.
- Start event: Notary resolves code (API: POST /notary/code/resolve).
- End event: Notary submits completed document (API: POST /notary/requests/:id/submit).
- Output: Median and P90 in minutes.
- Segments: Jurisdiction, notary.

### Data capture requirements
- Every state transition logged in audit_events with timestamps.
- Request lifecycle states stored in notarization_requests.
- All API endpoints emit structured audit events.

## Legal and Compliance Assumptions (US-CA)

Note: These are assumptions to verify with counsel. They are not legal advice.

### In-person requirement
- Assumption: Member must appear physically before the notary.
- Verification status: Pending legal review.

### Identity verification
- Assumption: Notary verifies identity using acceptable ID types for California.
- Example ID types: Driver license, state ID, passport (confirm with counsel).
- Verification status: Pending legal review.

### Notary commission and credentials
- Assumption: Notary must hold a valid California commission and maintain active status.
- Verification status: Pending legal review.

### Notary journal and record retention
- Assumption: Notary maintains a journal entry for each notarization and retains records per CA law.
- Verification status: Pending legal review.

### Certificate wording and acknowledgment
- Assumption: Jurisdiction-specific acknowledgment wording is required and must be appended.
- Verification status: Pending legal review.

### Venue requirements
- Assumption: Notary certificate includes venue (state and county) for in-person notarization.
- Verification status: Pending legal review.

### Electronic signature and seal
- Assumption: Digital seal and signature are acceptable for the notarized output.
- Verification status: Pending legal review.

### Tamper-evident document
- Assumption: Final notarized PDF must be tamper-evident and sealed after notary signature.
- Verification status: Pending legal review.

### Audio/video recording
- Assumption: No audio/video recording required for in-person notarizations.
- Verification status: Pending legal review.

### Consent and disclosure
- Assumption: Member is shown the final document and acknowledgment before notary signs.
- Verification status: Pending legal review.

## Open Questions (Legal)
- Does California permit electronic notarization for in-person appearances? If yes, under what conditions?
- What are the required retention periods for journal entries and notarized documents?
- Are there any prohibited document categories for electronic notarization in CA?
- Are specific consent statements required on the acknowledgment page?

## Next Steps
- Review assumptions with counsel.
- Update this document with confirmed requirements and citations.
- Translate confirmed rules into product checks and RLS policy constraints.
