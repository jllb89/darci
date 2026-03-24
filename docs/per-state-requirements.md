# Per-State Acknowledgment Requirements

This document captures state-specific certificate requirements and related supporting documents for DARCi document workflows.

## Ohio

Certificate of acknowledgment requirements (summary):
- Must include notary commission expiration date (OH requires this)
- Must include venue, date, signer name, and notary name
- Must include notary signature and electronic seal

Reference:
- https://codes.ohio.gov/ohio-revised-code/section-147.542

Common supporting documents for OH (examples):
- Trust Cert and Registration Amendment - OH.pdf
- Power of Attorney - OH.pdf

## California

Certificate of acknowledgment requirements (summary):
- Commission expiration date not required on the certificate
- Must include venue, date, signer name, and notary name
- Must include notary signature and electronic seal

Common supporting documents for CA (examples):
- Trust Cert and Registration Amendment - CA.pdf
- Power of Attorney - CA.pdf

## Per-State Intake Checklist

Use this checklist to validate the submission package before notarization.

### Ohio

Required items:
- Certificate of acknowledgment compliant with OH requirements
- Notary commission expiration date present on the certificate
- Signer identity and contact details
- Notary electronic seal and electronic signature files

### California

Required items:
- Certificate of acknowledgment compliant with CA requirements
- Venue, date, signer name, and notary name present
- Signer identity and contact details
- Notary electronic seal and electronic signature files

## Document Lifecycle (Audit-Event Based)

1. Member uploads or generates document
	- What happens: Member uploads a file or starts from a template; DARCi creates the document record and stores the initial version.
	- Audit events: member.document_upload_started, member.document_upload_completed, system.document_created

2. DARCi assigns IDN and prepares document for signing
	- What happens: System assigns the IDN and prepares the document version for signing.
	- Audit events: system.document_idn_assigned, system.document_prepared_for_signing

3. Member signs electronically
	- What happens: Signer captures a signature and DARCi links it to the document version.
	- Audit events: member.signature_capture_started, member.signature_capture_completed, system.signature_linked_to_document

4. Member submits document(s) for illuminotarization
	- What happens: Member submits the notarization request for the document(s).
	- Audit events: member.notarization_submit_started, member.notarization_submitted

5. Member receives an illuminotarization code
	- What happens: System generates and delivers an illuminotarization code to the member.
	- Audit events: system.code_generated, system.code_delivered

6. Member provides illuminotarization code to illuminotary
	- What happens: Member shares the code with the notary to initiate access.
	- Audit events: member.code_shared

7. Illuminotary accesses document(s) via illuminotarization code
	- What happens: Notary enters the code; DARCi validates and opens the request.
	- Audit events: notary.code_entered, system.code_validated, system.code_consumed, notary.request_opened

8. DARCi appends acknowledgment page
	- What happens: System selects the correct acknowledgment template and appends it to the document.
	- Audit events: system.ack_template_selected, system.ack_page_generated, system.ack_page_appended

9. DARCi watermarks document with digital original notice + IDN
	- What happens: System applies the watermark and completes document version updates.
	- Audit events: system.watermark_started, system.watermark_completed

10. Illuminotary verifies in person, applies digital seal and signature
	- What happens: Notary schedules and completes the in-person meeting, verifies identity, and applies seal/signature.
	- Audit events: notary.meeting_scheduled, notary.meeting_started, notary.identity_verified, notary.meeting_completed, notary.seal_applied, notary.signature_applied

11. Completed document submitted and hashed
	- What happens: Final notarized document is created and hashed.
	- Audit events: system.notarized_document_created, system.hashing_started, system.hashing_completed

12. IDN + hash written to distributed ledger
	- What happens: System anchors the hash and IDN to the ledger.
	- Audit events: system.ledger_anchor_requested, system.ledger_anchor_completed

13. Verification endpoint for public authenticity checks
	- What happens: Public verification requests return validity and ledger reference.
	- Audit events: public.verification_requested, system.verification_result_returned

## Mock Documents by Lifecycle Step (Member POV)

Use these mock records to validate the document detail UI for every lifecycle step.

1. Upload
	- Document: DOC-6101 · New Client Intake - Vega (Ohio)
	- Required fields: Source, file name, pages, owner

2. IDN assigned / prepared
	- Document: DOC-6102 · Trust Certification - OH (Ohio)
	- Required fields: IDN, document version, prepared at

3. Sign
	- Document: DOC-6103 · POA - Westlake (California)
	- Required fields: Signers, signature method, completion status

4. Submit for illuminotarization
	- Document: DOC-6104 · Loan Packet - Crestview (Ohio)
	- Required fields: Request ID, selected notary, submitted at

5. Code issued
	- Document: DOC-6105 · Title Transfer - Baker (Ohio)
	- Required fields: Code, delivery method, expires

6. Code shared
	- Document: DOC-6106 · Estate Affidavit - Nolan (Ohio)
	- Required fields: Share method, shared at, recipient

7. Notary access
	- Document: DOC-6107 · Seller Disclosure - Pine (Ohio)
	- Required fields: Notary, access time, validation result

8. Acknowledgment appended
	- Document: DOC-6108 · Guardianship - Patel (Ohio)
	- Required fields: Jurisdiction, template, acknowledgment page

9. Watermarked
	- Document: DOC-6109 · Construction Lien - Reed (Ohio)
	- Required fields: Watermark text, pages watermarked, completed at

10. Notary verification + seal/signature
	 - Document: DOC-6110 · Closing Statement - Park (Ohio)
	 - Required fields: Meeting time, verification method, seal/signature

11. Notarized + hashed
	 - Document: DOC-6111 · Escrow Release - Miles (Ohio)
	 - Required fields: Final file, hash, submitted at

12. Anchored to ledger
	 - Document: DOC-6112 · Lien Waiver - Ortiz (Ohio)
	 - Required fields: Ledger TX, anchor status, anchored at

13. Public verification
	 - Document: DOC-6113 · Public Verification - Avery Stone (Ohio)
	 - Required fields: Verification result, ledger TX, checked at
