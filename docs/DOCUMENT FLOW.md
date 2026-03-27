# Document Flow

This document defines the chronological document lifecycle and assigns responsibility for each step and audit event.

## Roles

- Member: document owner or requester.
- Signer: any required signer who is not the owner.
- Notary: licensed notary performing in-person verification.
- Platform: DARCi system services.
- Public: external user verifying authenticity.

## End-to-End Flow (Chronological)

1. Set up document (Member)
   - Member selects state/jurisdiction.
   - Platform checks jurisdiction requirements (acknowledgment rules, statutory form needs).

2. Upload or generate document (Member)
   - member.document_upload_started
   - member.document_upload_completed
   - system.document_created (Platform)

3. Assign IDN + prepare for signing (Platform)
   - system.document_idn_assigned
   - system.document_prepared_for_signing

4. Electronic signing (Member + Signers)
   - member.signature_capture_started (each signer)
   - member.signature_capture_completed (each signer)
   - system.signature_linked_to_document (Platform)

5. Submit for illuminotarization (Member)
   - member.notarization_submit_started
   - member.notarization_submitted

6. Code generation + delivery (Platform)
   - system.code_generated
   - system.code_delivered

7. Code sharing (Member)
   - member.code_shared

8. Notary access via code (Notary + Platform)
   - notary.code_entered
   - system.code_validated (Platform)
   - system.code_consumed (Platform)
   - notary.request_opened

9. Acknowledgment page appended (Platform)
   - system.ack_template_selected
   - system.ack_page_generated
   - system.ack_page_appended

10. Watermark applied (Platform)
   - system.watermark_started
   - system.watermark_completed

11. Meeting negotiation and scheduling (Member + Notary)
   - member.meeting_time_proposed
   - notary.meeting_time_proposed
   - member.meeting_time_confirmed
   - notary.meeting_time_confirmed
   - notary.meeting_scheduled
   - notary.meeting_rescheduled (if needed)
   - notary.meeting_cancelled (if needed)
   - system.meeting_no_show_recorded (if needed)

12. In-person verification + seal/signature (Notary)
   - notary.meeting_started
   - notary.identity_verified
   - notary.meeting_completed
   - notary.seal_applied
   - notary.signature_applied

13. Final document creation + hashing (Platform)
   - system.notarized_document_created
   - system.hashing_started
   - system.hashing_completed

14. Ledger anchoring (Platform)
   - system.ledger_anchor_requested
   - system.ledger_anchor_completed

15. Public verification (Public + Platform)
   - public.verification_requested
   - system.verification_result_returned

## Meeting Status States

- scheduled
- rescheduled
- cancelled
- in_progress
- completed
- no_show

Status mapping:
- scheduled: notary.meeting_scheduled
- rescheduled: notary.meeting_rescheduled
- cancelled: notary.meeting_cancelled
- in_progress: notary.meeting_started
- completed: notary.meeting_completed (outcome=success)
- no_show: system.meeting_no_show_recorded

## Notes

- The acknowledgment page is appended by the Platform, not uploaded by members.
- Watermarking is a Platform step after the acknowledgment page is appended.
- Member and Notary both participate in meeting negotiation; the Notary finalizes scheduling.
