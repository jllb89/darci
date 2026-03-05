# W3-01 API Contract (Upload + Finalize)

This is the short contract for the signed upload flow (Option B) with server-side validation and IDN assignment.

## 1) Request Upload

POST /documents

Purpose: Create document + version and return a signed upload URL.

Request body:

```json
{
  "fileName": "agreement.pdf",
  "fileSize": 1234567,
  "mimeType": "application/pdf",
  "documentType": "generic",
  "jurisdiction": "US-OH",
  "templateId": "tmpl_123",
  "title": "Member Agreement"
}
```

Required fields: fileName, fileSize, mimeType

Response:

```json
{
  "document": {
    "id": "<uuid>",
    "idn": null,
    "status": "draft",
    "documentType": "generic",
    "jurisdiction": "US-OH",
    "createdAt": "2026-03-04T12:00:00.000Z"
  },
  "version": {
    "id": "<uuid>",
    "version": 1,
    "storagePath": "<owner_id>/<document_id>/v1/source.pdf",
    "fileName": "agreement.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1234567,
    "isFinal": false,
    "createdAt": "2026-03-04T12:00:00.000Z"
  },
  "upload": {
    "bucket": "documents",
    "path": "<owner_id>/<document_id>/v1/source.pdf",
    "signedUrl": "https://...",
    "token": "..."
  }
}
```

Audit events:
- member.document_upload_started
- system.document_created

Validation:
- mimeType must be application/pdf
- fileSize must be <= 25 MB

## 2) Finalize Upload

POST /documents/{id}/upload-finalize

Purpose: Confirm upload, validate PDF and size, assign IDN, update version.

Request body:

```json
{
  "documentVersionId": "<uuid>"
}
```

Response:

```json
{
  "document": {
    "id": "<uuid>",
    "idn": "IDN-1A2B3C4D",
    "status": "uploaded",
    "documentType": "generic",
    "jurisdiction": "US-OH",
    "createdAt": "2026-03-04T12:00:00.000Z"
  },
  "version": {
    "id": "<uuid>",
    "version": 1,
    "storagePath": "<owner_id>/<document_id>/v1/source.pdf",
    "fileName": "agreement.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 1234567,
    "isFinal": false,
    "createdAt": "2026-03-04T12:00:00.000Z"
  }
}
```

Audit events:
- member.document_upload_completed
- system.document_idn_assigned

Validation:
- File exists at storagePath
- mimeType must be application/pdf
- file size metadata must exist and be <= 25 MB
