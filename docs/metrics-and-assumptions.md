Success Metrics and Legal/Compliance Assumptions (v1)

This document captures v1 success metrics and legal/compliance assumptions for the initial jurisdiction.

Scope
- Jurisdiction: US-OH (v1 launch)
- Reference: US-CA notes retained for later expansion
- v1 focus: member-first notarization journey with in-person IPEN acknowledgment

Success Metrics (Definitions Only)

1) Time-to-notarize
- Definition: Elapsed time from member submission for notarization to notary submission of completed document.
- Start event: Member submits document for notarization (API: POST /documents/:id/submit-notarization).
- End event: Notary submits completed document (API: POST /notary/requests/:id/submit).
- Output: Median and P90 in minutes.
- Segments: Jurisdiction, document type, notary, time of day.

2) Completion rate
- Definition: Percentage of submitted notarization requests that reach "completed" within 7 days.
- Numerator: Requests completed within 7 days.
- Denominator: Requests submitted in the same cohort.
- Output: Weekly completion rate, with drop-off reasons tagged.
- Segments: Jurisdiction, member type, notary.

3) Notary turnaround time
- Definition: Elapsed time from code resolution by notary to notary submission.
- Start event: Notary resolves code (API: POST /notary/code/resolve).
- End event: Notary submits completed document (API: POST /notary/requests/:id/submit).
- Output: Median and P90 in minutes.
- Segments: Jurisdiction, notary.

Data capture requirements
- Every state transition logged in audit_events with timestamps.
- Request lifecycle states stored in notarization_requests.
- All API endpoints emit structured audit events.

Legal and Compliance Assumptions (US-OH)

Note: These are assumptions to verify with counsel. They are not legal advice.

In-person requirement (IPEN)
- Assumption: IPEN requires the member to appear personally before the notary for acknowledgments or jurats.

Identity verification
- Assumption: DARCI does not store or evaluate the underlying identity artifact used by the notary.
- Scope: Notary handles identity verification as part of the notary interface, not core platform logic.

Notary commission and credentials
- Assumption: Notary must hold a valid Ohio commission and maintain active status.

Notary journal and record retention
- Assumption: Notary maintains a journal entry for each notarization and retains records per Ohio law.

Certificate wording and acknowledgment
- Assumption: Jurisdiction-specific acknowledgment wording is required and must be appended.
- Status: Client supplied Ohio acknowledgment wording (attached in project materials).

Venue requirements
- Assumption: Notary certificate includes venue (state and county) for in-person notarization.

Electronic signature and seal
- Assumption: Digital seal and signature are acceptable for the notarized output.

Tamper-evident document
- Assumption: Final notarized PDF must be tamper-evident and sealed after notary signature.

Audio/video recording
- Assumption: No audio/video recording required for in-person notarizations.

Consent and disclosure
- Assumption: Member is shown the final document and acknowledgment before notary signs.

Reference Notes (US-CA)

These are provided for later expansion and are not part of the v1 Ohio scope.

Acceptable ID types (CA)
- Government-issued identification card or driver's license
- US passport (current or issued within 5 years)

Notary journal retention (CA)
- Notaries must keep completed journals as long as they maintain an active commission.

Acknowledgment wording (CA)

> ACKNOWLEDGMENT
> A notary public or other officer completing this
> certificate verifies only the identity of the individual
> who signed the document to which this certificate is
> attached, and not the truthfulness, accuracy, or
> validity of that document.
> State of California
> County of _____________________________)
> On _____________________ ____ before me, _________________________________________
> (insert name and title of the officer)
> personally appeared ______________________________________________________________,
> who proved to me on the basis of satisfactory evidence to be the person(s) whose name(s) is/are
> subscribed to the within instrument and acknowledged to me that he/she/they executed the same in
> his/her/their authorized capacity(ies), and that by his/her/their signature(s) on the instrument the
> person(s), or the entity upon behalf of which the person(s) acted, executed the instrument.
> I certify under PENALTY OF PERJURY under the laws of the State of California that the foregoing
> paragraph is true and correct.
> WITNESS my hand and official seal.
> Signature ______________________________ (Seal)