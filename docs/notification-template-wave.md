# Notification Template Wave

Last updated: 2026-04-20

Related:
- docs/MVP email_notification templates.md
- docs/last-mile-roadmap.md
- api/openapi.yaml

## Purpose

The client-provided MVP draft gave us a strong starting baseline for registration, trusted-person, agent, illuminotary scheduling, and completion emails.

This document adds the next template wave so the notification catalog has at least one user-facing template mapped to each point in the 17-step product scope.

Baseline source templates remain in docs/MVP email_notification templates.md.

This wave adds the next set needed for:

1. review readiness,
2. signing readiness and confirmation,
3. signer invitation and unregistered-signer onboarding,
4. signer completion updates,
5. illuminotarization submission and approval states,
6. meeting scheduling and reminders,
7. finalization, hashing, ledger anchoring, and verification readiness,
8. client-pay billing invites and payment-request notices.

## Coverage Matrix

| Step | Product scope point | Template coverage |
| --- | --- | --- |
| 1 | Member uploads or generates document | `registration_started_welcome_email`, `registration_incomplete_reminder_email` |
| 2 | DARCi assigns IDN and prepares document for signing | `document_ready_for_review_email`, `member_signing_ready_email` |
| 3 | Member signs electronically | `member_signatures_recorded_email` |
| 4 | DARCi notifies assigned signers and sends invitation | `signer_invitation_email` |
| 5 | Unregistered signers sign up before viewing document | `signer_signup_required_email` |
| 6 | Signers review document and sign | `signer_reminder_email`, `signer_completion_confirmation_email` |
| 7 | Member gets notified signers have signed | `signer_signed_update_email`, `all_signatures_complete_email` |
| 8 | Member selects illuminotary and submits document(s) | `notarization_submission_confirmation_email` |
| 9 | Member receives an illuminotarization code | `notary_next_step_email` |
| 10 | Member provides code to illuminotary | `notary_code_expiring_email` |
| 11 | illuminotary accesses document(s) and approves it | `notary_request_claimed_email`, `notary_changes_requested_email`, `notary_approval_received_email` |
| 12 | DARCi appends acknowledgment page | `digital_original_ready_email` |
| 13 | DARCi watermarks document with digital original notice and IDN | `digital_original_ready_email` |
| 14 | In-person meeting, identity verification, seal, and signature | `meeting_scheduled_confirmation_email`, `meeting_reminder_email`, `meeting_completed_seal_applied_email` |
| 15 | Completed document submitted and hashed | `document_hash_completed_email` |
| 16 | IDN and hash written to distributed ledger | `ledger_anchor_completed_email` |
| 17 | Verification endpoint for public authenticity checks | `verification_ready_email` |

## New Wave Templates

### Review And Signing

**document_ready_for_review_email**
To: Registrant
Trigger: `system.document_ready_for_review`
Subject: Your documents are ready for review
Body:

Hi [First Name],

Your documents are ready for review.

Please take a few minutes to look them over carefully before you approve them for signing:
[Review Documents]

If something does not look right, do not approve yet. You can return to your dashboard, update your information, and regenerate the document set.

Questions? We are happy to help.

- Your DARCi Team

**member_signing_ready_email**
To: Registrant
Trigger: `system.document_signing_prepared`
Subject: Your documents are ready for signature
Body:

Hi [First Name],

Your reviewed documents are now ready for signature.

When you are ready, sign here:
[Sign Documents]

Once your signature is complete, we will keep the next steps moving and let you know what comes next.

- Your DARCi Team

**member_signatures_recorded_email**
To: Registrant
Trigger: `member.document_signatures_confirmed`
Subject: Your signature has been recorded
Body:

Hi [First Name],

Your signature has been successfully recorded for [Document Name].

You can review the current status anytime from your dashboard:
[View Status]

If other signers are still pending, we will keep you updated as each one completes their step.

- Your DARCi Team

### Signer Invitation And Completion

**signer_invitation_email**
To: Signer
Trigger: `invite.document_signing_created`
Subject: [Requester Name] has requested your signature
Body:

Hi [First Name],

[Requester Name] has invited you to review and sign a document through DARCi.

You can get started here:
[Review And Sign]

If you do not already have a DARCi account, we will guide you through a short setup before you view the document.

This invitation is available until [Expiration Date].

- Your DARCi Team

**signer_signup_required_email**
To: Signer
Trigger: `invite.document_signing_signup_required`
Subject: Finish setting up your DARCi account to view the document
Body:

Hi [First Name],

Before you can open the document that was shared with you, please finish setting up your DARCi account.

Complete setup here:
[Create Or Finish Account]

Once you are done, we will bring you straight back to the document review and signature flow.

- Your DARCi Team

**signer_reminder_email**
To: Signer
Trigger: `invite.document_signing_reminder`
Subject: Reminder: your signature is still needed
Body:

Hi [First Name],

This is a quick reminder that your signature is still needed for [Document Name].

You can review and sign here:
[Review And Sign]

If you already completed this step, you can ignore this message.

- Your DARCi Team

**signer_completion_confirmation_email**
To: Signer
Trigger: `invite.document_signing_completed`
Subject: Thank you, your signature has been received
Body:

Hi [First Name],

Thank you. Your signature for [Document Name] has been received.

You do not need to take any further action right now.

If the document owner needs anything else from you, we will let you know.

- Your DARCi Team

**signer_signed_update_email**
To: Registrant
Trigger: `invite.signer_completed`
Subject: [Signer Name] has signed
Body:

Hi [First Name],

[Signer Name] has completed their signature for [Document Name].

You can follow the remaining status here:
[View Status]

We will keep notifying you as the document moves forward.

- Your DARCi Team

**all_signatures_complete_email**
To: Registrant
Trigger: `system.all_required_signatures_complete`
Subject: All required signatures are complete
Body:

Hi [First Name],

All required signatures are now complete for [Document Name].

You can move to the next step from your dashboard here:
[Continue]

If your document requires illuminotarization, this is where you will begin that final approval flow.

- Your DARCi Team

### Illuminotarization And Meeting Flow

**notarization_submission_confirmation_email**
To: Registrant
Trigger: `member.notarization_submitted`
Subject: Your document has been submitted for illuminotarization
Body:

Hi [First Name],

Your document has been submitted for illuminotarization.

You can track progress from your dashboard here:
[View Status]

If a code is required for the next step, we will send it to you and keep it available in your dashboard.

- Your DARCi Team

**notary_code_expiring_email**
To: Registrant
Trigger: `system.code_expiring`
Subject: Your illuminotary code is about to expire
Body:

Hi [First Name],

Your illuminotary code for [Document Name] is about to expire on [Expiration Date].

Please schedule your appointment or return to your dashboard if you need to request a fresh code:
[View Dashboard]

- Your DARCi Team

**notary_request_claimed_email**
To: Registrant
Trigger: `notary.code_resolved`
Subject: Your illuminotary has started reviewing your document
Body:

Hi [First Name],

[illuminotary Name] has accessed your document and started the illuminotarization review process.

You can follow the current status here:
[View Status]

If the illuminotary needs anything else from you before the in-person meeting, we will let you know.

- Your DARCi Team

**notary_changes_requested_email**
To: Registrant
Trigger: `notary.request_changes_requested`
Subject: Action needed: your illuminotary requested changes
Body:

Hi [First Name],

Your illuminotary requested changes before the document can move forward.

Summary of the request:
[Change Summary]

Please return to your dashboard to review the request and take the next step:
[Review Changes]

- Your DARCi Team

**notary_approval_received_email**
To: Registrant
Trigger: `notary.request_approved`
Subject: Your document has been approved for the in-person appointment
Body:

Hi [First Name],

Your illuminotary has approved the document for the in-person appointment step.

You can continue from your dashboard here:
[Continue]

We will keep you updated with the meeting details and final completion steps.

- Your DARCi Team

**meeting_scheduled_confirmation_email**
To: Registrant or illuminotary
Trigger: `notary.meeting_scheduled`
Subject: Your illuminotary meeting is scheduled
Body:

Hi [First Name],

Your illuminotary meeting for [Document Name] has been scheduled.

Date and time: [Scheduled Time]
Location: [Meeting Location]

You can review the details here:
[View Meeting]

- Your DARCi Team

**meeting_reminder_email**
To: Registrant or illuminotary
Trigger: `system.meeting_reminder`
Subject: Reminder: your illuminotary meeting is coming up
Body:

Hi [First Name],

This is a reminder that your illuminotary meeting for [Document Name] is scheduled for [Scheduled Time].

Location: [Meeting Location]

Please bring any required identification and arrive on time.

You can review the meeting details here:
[View Meeting]

- Your DARCi Team

**meeting_completed_seal_applied_email**
To: Registrant
Trigger: `notary.meeting_completed_and_sealed`
Subject: Your in-person signing is complete
Body:

Hi [First Name],

Your in-person meeting is complete and the illuminotary has applied the required seal and signature.

DARCi is now finishing the final post-meeting processing steps.

You can track status here:
[View Status]

- Your DARCi Team

### Finalization, Hashing, Ledger, And Verification

**digital_original_ready_email**
To: Registrant
Trigger: `system.digital_original_ready`
Subject: Your digital original is ready
Body:

Hi [First Name],

Your document has completed the acknowledgment and digital-original preparation steps.

You can view the latest finalization status here:
[View Status]

We will notify you again as soon as the hash, ledger, and verification steps are complete.

- Your DARCi Team

**document_hash_completed_email**
To: Registrant
Trigger: `system.document_hash_completed`
Subject: Your document hash has been recorded
Body:

Hi [First Name],

DARCi has generated the document hash for [Document Name].

Hash reference:
[Hash Value]

You can review the current record here:
[View Status]

- Your DARCi Team

**ledger_anchor_completed_email**
To: Registrant
Trigger: `system.ledger_anchor_completed`
Subject: Your registration has been anchored to the ledger
Body:

Hi [First Name],

Your document's IDN and hash have now been written to the distributed ledger.

Ledger reference:
[Ledger Reference]

You can review the current record here:
[View Status]

- Your DARCi Team

**verification_ready_email**
To: Registrant
Trigger: `system.verification_ready`
Subject: Your verification link is ready
Body:

Hi [First Name],

Your document is now ready for authenticity verification.

Verification link:
[Verification Link]

You can also view it anytime from your dashboard:
[My Dashboard]

Thank you for completing the process with DARCi.

- Your DARCi Team

## Billing, Client Pay, And Payment Requests

These templates extend the catalog beyond the 17-step document workflow so the delegated client-pay path has first-pass invite, reminder, and payment-state coverage.

**client_payment_request_invitation_email**
To: Client payer
Trigger: `billing.payment_request_sent`
Subject: Payment needed to continue [Document Name]
Body:

Hi [First Name],

[Requester Name] sent you a DARCi payment request for [Document Name].

Amount due: [Amount Display]

Please review the request and submit payment here:
[Pay Now]

If you do not already have a DARCi account, we will guide you through a short setup before checkout.

This request is due by [Due Date].

- Your DARCi Team

**client_payment_request_signup_required_email**
To: Client payer
Trigger: `billing.payment_request_signup_required`
Subject: Finish setting up your DARCi account to review and pay
Body:

Hi [First Name],

Before you can review the DARCi payment request shared with you, please finish setting up your account.

Complete setup here:
[Create Or Finish Account]

Once you are done, we will bring you straight back to the payment review flow.

- Your DARCi Team

**client_payment_request_reminder_email**
To: Client payer
Trigger: `billing.payment_request_reminder`
Subject: Reminder: payment is still pending for [Document Name]
Body:

Hi [First Name],

This is a quick reminder that payment is still pending for [Document Name].

Amount due: [Amount Display]

You can review the request and pay here:
[Pay Now]

If you already completed this step, you can ignore this message.

- Your DARCi Team

**client_payment_request_paid_email**
To: Client payer
Trigger: `billing.payment_request_paid`
Subject: Your DARCi payment has been received
Body:

Hi [First Name],

We have received your payment for [Document Name].

Amount received: [Amount Display]

You can review the latest status here:
[View Status]

Thank you for completing this step.

- Your DARCi Team

**client_payment_request_expired_email**
To: Client payer
Trigger: `billing.payment_request_expired`
Subject: Your DARCi payment request expired
Body:

Hi [First Name],

The payment request for [Document Name] has expired before payment was completed.

If you still need to continue, please contact [Requester Name] or return to your dashboard for the latest status:
[View Status]

- Your DARCi Team

**pro_client_payment_request_sent_email**
To: Pro or registrant
Trigger: `billing.client_payment_request_sent`
Subject: Client payment request sent to [Client Name]
Body:

Hi [First Name],

We sent a DARCi client-payment request to [Client Name] for [Document Name].

Amount requested: [Amount Display]

You can monitor the request from your dashboard here:
[View Status]

We will let you know when the payment is completed or if the request expires.

- Your DARCi Team

**pro_client_payment_received_email**
To: Pro or registrant
Trigger: `billing.client_payment_received`
Subject: [Client Name] completed the payment request
Body:

Hi [First Name],

[Client Name] completed the DARCi payment request for [Document Name].

Amount received: [Amount Display]

You can continue from your dashboard here:
[View Status]

- Your DARCi Team

**pro_client_payment_request_expired_email**
To: Pro or registrant
Trigger: `billing.client_payment_request_expired`
Subject: Client payment request for [Client Name] expired
Body:

Hi [First Name],

The DARCi client-payment request for [Client Name] expired before payment was completed.

You can resend the request or review the latest status here:
[View Status]

- Your DARCi Team