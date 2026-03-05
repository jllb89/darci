# Audit Events - Action Enum and Metadata Schema

This document defines the canonical audit event actions and metadata schema for DARCI.

## Table

`public.audit_events`
- `actor_id` (uuid, references `public.users.id`)
- `entity_type` (text)
- `entity_id` (uuid, nullable)
- `action` (text)
- `metadata` (jsonb)
- `created_at` (timestamptz)

## Embeddings Table (Optional)

`public.audit_event_embeddings`
- `audit_event_id` (uuid, references `public.audit_events.id`)
- `embedding` (vector(1536))
- `model` (text)
- `input_hash` (text)
- `created_at` (timestamptz)

Use this table for AI search or clustering. Do not store embeddings directly in `audit_events`.

## Metadata and Embedding Flow

1. Insert an audit event into `public.audit_events` with stable, human-readable `metadata`.
2. Build a deterministic text input from the audit event (action + key metadata).
3. Compute an embedding and store it in `public.audit_event_embeddings` with:
  - `audit_event_id`
  - `embedding`
  - `model`
  - `input_hash` (hash of the embedding input text)

## Entity Types

Use one of the following strings in `entity_type`:

- `document`
- `document_version`
- `signature`
- `notarization_request`
- `illuminotarization_code`
- `acknowledgment_page`
- `ledger_entry`
- `verification`

If the entity does not map to a table (e.g., `verification`), set `entity_id` to `null`.

## Action Enum List

Use the following `action` values exactly as written:

- `member.document_upload_started`
- `member.document_upload_completed`
- `system.document_created`
- `system.document_idn_assigned`
- `system.document_prepared_for_signing`
- `member.signature_capture_started`
- `member.signature_capture_completed`
- `system.signature_linked_to_document`
- `member.notarization_submit_started`
- `member.notarization_submitted`
- `system.code_generated`
- `system.code_delivered`
- `member.code_shared`
- `notary.code_entered`
- `system.code_validated`
- `system.code_consumed`
- `notary.request_opened`
- `system.ack_template_selected`
- `system.ack_page_generated`
- `system.ack_page_appended`
- `system.watermark_started`
- `system.watermark_completed`
- `notary.meeting_scheduled`
- `notary.meeting_started`
- `notary.identity_verified`
- `notary.meeting_completed`
- `notary.seal_applied`
- `notary.signature_applied`
- `system.notarized_document_created`
- `system.hashing_started`
- `system.hashing_completed`
- `system.ledger_anchor_requested`
- `system.ledger_anchor_completed`
- `public.verification_requested`
- `system.verification_result_returned`

## Common Metadata Fields

Include these fields where applicable. Keep metadata minimal and stable.

- `document_id` (uuid)
- `document_version_id` (uuid)
- `signature_id` (uuid)
- `request_id` (uuid)
- `code_id` (uuid)
- `acknowledgment_page_id` (uuid)
- `ledger_entry_id` (uuid)
- `idn` (text)
- `actor_role` (member|notary|system|public)
- `ip_address` (text)
- `user_agent` (text)

## Metadata Schema by Action

### 1) Member uploads or generates document

**member.document_upload_started**
- entity_type: `document`
- entity_id: `documents.id` (if already created) or `null`
- metadata:
  - `source` (upload|template)
  - `template_id` (text, optional)
  - `file_name` (text)
  - `file_size` (number)
  - `mime_type` (text)
  - `document_id` (uuid, optional)

**member.document_upload_completed**
- entity_type: `document_version`
- entity_id: `document_versions.id`
- metadata:
  - `document_id` (uuid)
  - `document_version_id` (uuid)
  - `storage_path` (text)
  - `checksum` (text)
  - `pages` (number)
  - `upload_duration_ms` (number)

**system.document_created**
- entity_type: `document`
- entity_id: `documents.id`
- metadata:
  - `document_id` (uuid)
  - `owner_id` (uuid)

### 2) DARCI assigns IDN and prepares document for signing

**system.document_idn_assigned**
- entity_type: `document`
- entity_id: `documents.id`
- metadata:
  - `document_id` (uuid)
  - `idn` (text)
  - `idn_algorithm_version` (text)

**system.document_prepared_for_signing**
- entity_type: `document_version`
- entity_id: `document_versions.id`
- metadata:
  - `document_id` (uuid)
  - `document_version_id` (uuid)

### 3) Member signs electronically

**member.signature_capture_started**
- entity_type: `signature`
- entity_id: `signatures.id` (if created) or `null`
- metadata:
  - `signature_method` (draw|upload|typed)
  - `device_type` (text)
  - `ip_address` (text)
  - `document_id` (uuid)

**member.signature_capture_completed**
- entity_type: `signature`
- entity_id: `signatures.id`
- metadata:
  - `signature_id` (uuid)
  - `document_id` (uuid)
  - `storage_path` (text)
  - `signature_hash` (text)

**system.signature_linked_to_document**
- entity_type: `signature`
- entity_id: `signatures.id`
- metadata:
  - `signature_id` (uuid)
  - `document_id` (uuid)
  - `document_version_id` (uuid)

### 4) Member submits for illuminotarization

**member.notarization_submit_started**
- entity_type: `notarization_request`
- entity_id: `notarization_requests.id` (if created) or `null`
- metadata:
  - `document_id` (uuid)
  - `selected_notary_id` (uuid, optional)

**member.notarization_submitted**
- entity_type: `notarization_request`
- entity_id: `notarization_requests.id`
- metadata:
  - `request_id` (uuid)
  - `document_id` (uuid)
  - `submitted_at` (timestamptz)

### 5) Member receives an illuminotarization code

**system.code_generated**
- entity_type: `illuminotarization_code`
- entity_id: `illuminotarization_codes.id`
- metadata:
  - `code_id` (uuid)
  - `request_id` (uuid)
  - `expires_at` (timestamptz)

**system.code_delivered**
- entity_type: `illuminotarization_code`
- entity_id: `illuminotarization_codes.id`
- metadata:
  - `code_id` (uuid)
  - `delivery_method` (email|sms|in_app)
  - `delivery_target` (text)
  - `delivered_at` (timestamptz)

### 6) Member provides illuminotarization code to illuminotary

**member.code_shared**
- entity_type: `illuminotarization_code`
- entity_id: `illuminotarization_codes.id`
- metadata:
  - `code_id` (uuid)
  - `request_id` (uuid)
  - `share_method` (in_app|manual)
  - `shared_at` (timestamptz)

### 7) Illuminotary accesses document(s) via code

**notary.code_entered**
- entity_type: `illuminotarization_code`
- entity_id: `illuminotarization_codes.id`
- metadata:
  - `code_id` (uuid)
  - `request_id` (uuid)
  - `notary_id` (uuid)

**system.code_validated**
- entity_type: `illuminotarization_code`
- entity_id: `illuminotarization_codes.id`
- metadata:
  - `code_id` (uuid)
  - `valid` (boolean)
  - `reason` (text, optional)

**system.code_consumed**
- entity_type: `illuminotarization_code`
- entity_id: `illuminotarization_codes.id`
- metadata:
  - `code_id` (uuid)
  - `consumed_at` (timestamptz)

**notary.request_opened**
- entity_type: `notarization_request`
- entity_id: `notarization_requests.id`
- metadata:
  - `request_id` (uuid)
  - `document_id` (uuid)

### 8) DARCi appends acknowledgment page

**system.ack_template_selected**
- entity_type: `acknowledgment_page`
- entity_id: `acknowledgment_pages.id` (if created) or `null`
- metadata:
  - `document_id` (uuid)
  - `jurisdiction` (text)
  - `template_id` (text)
  - `template_version` (text)

**system.ack_page_generated**
- entity_type: `acknowledgment_page`
- entity_id: `acknowledgment_pages.id`
- metadata:
  - `acknowledgment_page_id` (uuid)
  - `document_id` (uuid)

**system.ack_page_appended**
- entity_type: `document_version`
- entity_id: `document_versions.id`
- metadata:
  - `document_id` (uuid)
  - `document_version_id` (uuid)

### 9) DARCi watermarks document

**system.watermark_started**
- entity_type: `document_version`
- entity_id: `document_versions.id`
- metadata:
  - `document_id` (uuid)
  - `document_version_id` (uuid)
  - `watermark_text` (text)

**system.watermark_completed**
- entity_type: `document_version`
- entity_id: `document_versions.id`
- metadata:
  - `document_id` (uuid)
  - `document_version_id` (uuid)
  - `pages_watermarked` (number)

### 10) Illuminotary verifies in person and applies seal/signature

**notary.meeting_scheduled**
- entity_type: `notarization_request`
- entity_id: `notarization_requests.id`
- metadata:
  - `request_id` (uuid)
  - `scheduled_at` (timestamptz)
  - `meeting_type` (in_person)

**notary.meeting_started**
- entity_type: `notarization_request`
- entity_id: `notarization_requests.id`
- metadata:
  - `request_id` (uuid)
  - `started_at` (timestamptz)
  - `location` (text, optional)

**notary.identity_verified**
- entity_type: `notarization_request`
- entity_id: `notarization_requests.id`
- metadata:
  - `request_id` (uuid)
  - `verification_method` (text)
  - `doc_type` (text)
  - `doc_last4` (text)

**notary.meeting_completed**
- entity_type: `notarization_request`
- entity_id: `notarization_requests.id`
- metadata:
  - `request_id` (uuid)
  - `completed_at` (timestamptz)
  - `outcome` (success|cancelled|no_show)

**notary.seal_applied**
- entity_type: `document_version`
- entity_id: `document_versions.id`
- metadata:
  - `document_id` (uuid)
  - `document_version_id` (uuid)
  - `seal_asset_id` (text)

**notary.signature_applied**
- entity_type: `signature`
- entity_id: `signatures.id`
- metadata:
  - `signature_id` (uuid)
  - `document_id` (uuid)
  - `document_version_id` (uuid)

### 11) Completed document submitted and hashed

**system.notarized_document_created**
- entity_type: `document_version`
- entity_id: `document_versions.id`
- metadata:
  - `document_id` (uuid)
  - `document_version_id` (uuid)
  - `storage_path` (text)
  - `is_final` (boolean)

**system.hashing_started**
- entity_type: `ledger_entry`
- entity_id: `ledger_entries.id` (if created) or `null`
- metadata:
  - `document_id` (uuid)
  - `document_version_id` (uuid)
  - `hash_algorithm` (text)

**system.hashing_completed**
- entity_type: `ledger_entry`
- entity_id: `ledger_entries.id`
- metadata:
  - `document_id` (uuid)
  - `hash` (text)

### 12) IDN + hash written to distributed ledger

**system.ledger_anchor_requested**
- entity_type: `ledger_entry`
- entity_id: `ledger_entries.id`
- metadata:
  - `ledger_entry_id` (uuid)
  - `document_id` (uuid)
  - `idn` (text)
  - `hash` (text)

**system.ledger_anchor_completed**
- entity_type: `ledger_entry`
- entity_id: `ledger_entries.id`
- metadata:
  - `ledger_entry_id` (uuid)
  - `ledger_tx_id` (text)
  - `anchored_at` (timestamptz)
  - `status` (text)

### 13) Public verification

**public.verification_requested**
- entity_type: `verification`
- entity_id: `null`
- metadata:
  - `idn` (text)
  - `ip_address` (text)
  - `user_agent` (text)

**system.verification_result_returned**
- entity_type: `verification`
- entity_id: `null`
- metadata:
  - `idn` (text)
  - `valid` (boolean)
  - `reason` (text, optional)
  - `ledger_tx_id` (text, optional)
