# Dashboard CTA Product and Implementation Plan

## Product Position

The dashboard should not be a reporting screen. It should be the fastest place to finish work.

The best version of this dashboard does three things:

1. Shows what needs attention.
2. Explains why it matters.
3. Offers the shortest safe action to move the document forward.

The key product decision is that dashboard CTAs should launch work, but not own business logic. Document, signing, and notification APIs should decide what is allowed, what is next, and who can be contacted. The dashboard should be a high-signal command surface on top of those workflow APIs.

## Product Opinion on the CTAs

### What I Would Improve

The current CTA ideas are directionally right, but a truly excellent dashboard should avoid generic actions like "View all" as the primary action whenever a better action exists. "View all" is navigation. A great dashboard uses action labels that complete jobs.

Better examples:

- Instead of "View all documents": "Continue 2 drafts" or "Review 3 documents"
- Instead of "View all requests": "Sign now" or "Review signature requests"
- Instead of "View activity": "Open latest issue" when activity includes blockers
- Instead of "Do this now": dynamic labels like "Send 3 reminders", "Fix blockers", or "Continue signing"

### CTA Philosophy

Every CTA should answer one of these questions:

- Can I finish something now?
- Can I unblock someone else now?
- Can I reduce uncertainty now?
- Can I recover from an exception now?

If the CTA does not answer one of those, it should probably be secondary.

### My Strongest Product Recommendation

The highest-value CTA is not just "Send reminder email." It is a full reminder workflow:

1. Detect pending required signers.
2. Preview who will be reminded.
3. Explain cooldown/skips.
4. Send reminders.
5. Show delivery result.
6. Record audit trail.

That makes the dashboard feel operationally useful, not decorative.

### Best-in-Class Additions

These are what I would add if we are trying to build the best product in the category.

#### 1. Recommended Action Stack

Instead of a single "Next action" card, show a prioritized action stack:

- High priority: "Send reminders for 3 pending signatures"
- Medium priority: "Fix blockers on CA Trust"
- Low priority: "Download completed POA"

This makes the dashboard feel like a work queue, not a snapshot.

#### 2. Bulk Action Bar

When multiple documents have the same problem, offer a batch action:

- "Send all reminders"
- "Open first blocker"
- "Continue oldest draft"

This is especially important as users accumulate many documents.

#### 3. Deadline and Aging Signals

Pending signatures should become more urgent over time.

Examples:

- "Waiting 3 days"
- "Last reminder sent yesterday"
- "Signer opened invite but has not signed"

This helps users decide whether to remind, call, or escalate.

#### 4. Action Outcome Feedback

After a CTA succeeds, the dashboard should update the user’s mental model.

Examples:

- "Reminders sent to 2 signers"
- "1 signer skipped because they were reminded today"
- "Next eligible reminder tomorrow at 9:00 AM"

This is where trust is built.

#### 5. Role-Aware CTA Labels

A member, signer, notary, and admin should not see the same language.

Examples:

- Member: "Send reminders"
- Signer: "Sign now"
- Notary: "Review request"
- Admin: "Inspect queue"

This avoids generic workflow language and makes the interface feel aware.

#### 6. Do Not Over-CTA Everything

More CTAs are good only when they are ranked. Too many equal-weight buttons makes the page slower.

Recommended hierarchy:

- One primary CTA per section.
- One secondary CTA only when useful.
- Batch CTA only when multiple items share the same action.

## Dashboard CTA Catalog

| Dashboard Section | Placement | Primary CTA Label | Secondary CTA | Purpose |
| --- | --- | --- | --- | --- |
| Metrics cards | Card footer | Open queue | None | Move from count to filtered work queue |
| Recent documents | Per row, right side | Continue | Copy reference | Resume document at the correct workflow step |
| Signature requests | Per row | Sign now | Send reminder | Complete signer action or nudge pending signer |
| Recent activity | Per item footer | Open related document | None for now | Turn timeline events into workflow entry points |
| Alerts: pending signatures | Alert row | Send reminders | Review signers | Nudge all eligible pending signers |
| Alerts: review blockers | Alert row | Fix blockers | None | Jump to blocker context |
| Recommended next action | Card primary button | Dynamic backend label | None | Execute the highest-value available action |
| Empty documents | Empty state | Create document | None | Avoid a dead dashboard |
| Error state | Error banner | Retry | Contact support later | Recover from failed load |

## Backend Architecture Principle

Dashboard actions should call reusable document/signing APIs.

Avoid dashboard-owned business endpoints like:

```txt
POST /dashboard/ctas/signature-reminder
```

Prefer workflow-owned endpoints:

```txt
GET  /documents/:id/next-action
POST /documents/signature-reminders/preview
POST /documents/signature-reminders
POST /documents/:id/signature-reminders/preview
POST /documents/:id/signature-reminders
```

The dashboard can call these APIs, but the APIs should also work from document detail, sign flow, request detail, admin queues, and future mobile surfaces.

## Backend Pass

### 1. Enrich Document List Responses

Update `GET /documents` so the frontend no longer needs per-document signing fetches.

Each document should include:

```ts
type DocumentListResponseItem = {
  id: string;
  idn: string | null;
  status: string | null;
  documentType: string | null;
  documentTypeLabel: "Trust" | "POA" | "Document notarization" | "Document";
  jurisdiction: string | null;
  productFlowMode?: string;
  selectedFamilies?: string[];
  principalName: string | null;
  createdAt: string;
  updatedAt: string | null;
  summary: DocumentWorkspaceSummary | null;
  signerSummary: DocumentSignerSummary;
  nextAction: DocumentNextAction;
};
```

Signer summary:

```ts
type DocumentSignerSummary = {
  signers: Array<{
    signerId: string;
    role: string;
    roleLabel: string;
    name: string | null;
    status: "pending" | "signed";
    isRequired: boolean;
  }>;
  signerRoles: string[];
  pendingSignerRoles: string[];
  pendingRequiredSignatureCount: number;
};
```

Backend should resolve:

- `documentTypeLabel` from `selected_families`, then `product_flow_mode`, then `document_type`.
- `principalName` from document parties, system values, or intake canonical answers. Do not use the viewer email.
- `signerSummary` from document output signers plus captured signature records.
- `nextAction` from the centralized resolver.

### 2. Add Document Next Action Resolver

Create a service such as:

```txt
backend/src/services/documentNextActionService.ts
```

Endpoint:

```txt
GET /documents/:id/next-action
```

Response:

```json
{
  "documentId": "doc_123",
  "nextAction": {
    "code": "collect_signatures",
    "label": "Continue signing",
    "description": "2 required signatures are still pending.",
    "targetPath": "/app/sign?documentId=doc_123",
    "priority": "high"
  }
}
```

Supported action codes:

```ts
type DocumentNextActionCode =
  | "complete_intake"
  | "resolve_review_blockers"
  | "collect_signatures"
  | "finalize_and_download"
  | "no_action_required";
```

Resolver logic should consider:

- Intake status
- Document status
- Review blockers
- Signing readiness
- Pending required signatures
- Finalization state
- Verification readiness

### 3. Enrich Dashboard Response

Update `GET /dashboard` to include structured action metadata.

Keep existing `nextAction` string temporarily if needed, but add:

```ts
type DashboardPrimaryAction = {
  code: string;
  label: string;
  description: string;
  targetPath: string;
  priority: "high" | "medium" | "low";
};
```

Example response:

```json
{
  "primaryAction": {
    "code": "collect_signatures",
    "label": "Review pending signatures",
    "description": "3 documents are waiting on required signatures.",
    "targetPath": "/app/documents?status=pending_signature",
    "priority": "high"
  }
}
```

Dashboard aggregation should also reuse enriched document summaries where possible.

### 4. Signature Reminder Preview

Endpoint:

```txt
POST /documents/signature-reminders/preview
POST /documents/:id/signature-reminders/preview
```

Request:

```json
{
  "documentIds": ["doc_1", "doc_2"],
  "mode": "pending_required_only",
  "channel": "email"
}
```

Response:

```json
{
  "documentsRequested": 2,
  "documentsEligible": 2,
  "recipientsEligible": 3,
  "recipientsSkippedCooldown": 1,
  "documents": [
    {
      "documentId": "doc_1",
      "documentTypeLabel": "Trust",
      "principalName": "Jane Doe",
      "pendingRecipients": [
        {
          "signerId": "signer_1",
          "name": "John Doe",
          "role": "Trustmaker",
          "deliveryHint": "j***@example.com",
          "cooldownActive": false,
          "nextEligibleAt": null
        }
      ]
    }
  ]
}
```

Preview rules:

- Do not send anything.
- Only include pending required signers.
- Mask delivery destinations.
- Include cooldown status.
- Return zero-recipient success when nothing is eligible.

### 5. Send Signature Reminders

Endpoint:

```txt
POST /documents/signature-reminders
POST /documents/:id/signature-reminders
```

Request:

```json
{
  "documentIds": ["doc_1", "doc_2"],
  "mode": "pending_required_only",
  "channel": "email"
}
```

Header:

```txt
Idempotency-Key: uuid
```

Response:

```json
{
  "ok": true,
  "summary": {
    "documentsRequested": 2,
    "documentsProcessed": 2,
    "recipientsEligible": 3,
    "recipientsSent": 2,
    "recipientsSkippedCooldown": 1,
    "recipientsFailed": 0
  },
  "results": [
    {
      "documentId": "doc_1",
      "sent": 2,
      "skippedCooldown": 0,
      "failed": 0
    }
  ]
}
```

Validation and safety:

- Max 50 documents per request.
- User must be authorized for every document.
- Only pending required signers are eligible.
- Cooldown: 12 or 24 hours per document, signer, channel, and template.
- Use existing notification/outbox services if possible.
- Add audit events for requested, sent, skipped cooldown, and failed.
- Support idempotency for repeated clicks/retries.

### 6. Backend Acceptance Criteria

Backend is complete when:

- `GET /documents` includes `documentTypeLabel`, `principalName`, `signerSummary`, and `nextAction`.
- `GET /documents/:id/next-action` returns consistent action targets.
- `GET /dashboard` includes `primaryAction`.
- Reminder preview returns eligible/skipped recipients without sending.
- Reminder send respects authorization, cooldown, and idempotency.
- Audit events are recorded for reminder attempts.
- Backend typecheck passes.
- Focused tests cover:
  - no pending signers
  - partial cooldown
  - unauthorized document
  - successful reminder send
  - idempotent retry
  - next action resolution by status

## Frontend Pass

### 1. Metrics Cards

Placement: metric card footer.

CTA:

```txt
Open queue
```

Behavior:

- Link to `/app/documents?status=<derived-status>`.
- Make metric cards feel clickable but keep button/anchor explicit.

### 2. Recent Documents

Placement: right side of each row.

CTA label:

- Use `document.nextAction.label`.

Examples:

- `Continue`
- `Review blockers`
- `Continue signing`
- `Open document`

Behavior:

- Link to `document.nextAction.targetPath`.
- Remove local status-routing heuristics after backend resolver is live.

### 3. Signature Requests

Placement: per request row.

Primary CTA:

```txt
Sign now
```

Secondary CTA:

```txt
Send reminder
```

Behavior:

- `Sign now` links to the sign path or backend next action target.
- `Send reminder` opens preview modal for that request’s document.

### 4. Alerts

#### Pending Signatures Alert

Primary CTA:

```txt
Send reminders
```

Secondary CTA:

```txt
Review signers
```

Behavior:

- `Send reminders` calls preview first.
- Confirmation modal copy:

```txt
Send reminders to 3 pending signer(s)?
```

Success toast:

```txt
Reminders sent to 2 signer(s). 1 skipped due to recent reminder.
```

#### Review Blockers Alert

Primary CTA:

```txt
Fix blockers
```

Behavior:

- Link to first blocked document review path.

### 5. Recent Activity

Placement: per activity item footer.

CTA:

```txt
Open related document
```

Behavior:

- Link to enriched document next action target when available.
- Keep activity filtered to document-linked events only.

### 6. Recommended Next Action Card

Replace passive `Next action` text with structured CTA.

Title:

```txt
Recommended next action
```

Button:

- Use `primaryAction.label`.

Examples:

- `Review pending signatures`
- `Fix review blockers`
- `Continue drafts`
- `Create document`

Behavior:

- Link to `primaryAction.targetPath`.

### 7. Empty and Error States

Documents empty:

```txt
Create document
```

Requests empty:

```txt
No signature requests right now.
```

Activity empty:

```txt
View documents
```

Error banner:

```txt
Retry
```

## Frontend Acceptance Criteria

Frontend is complete when:

- `/app` shows action CTAs per section, not only passive links.
- `/app/documents` uses backend signer summaries and removes N+1 signing fetches.
- Reminder CTA preview modal appears before sending.
- Reminder send has loading, success, partial success, and failure states.
- Dashboard uses backend `primaryAction` and document `nextAction` targets.
- No CTA appears when the user is unauthorized or no eligible action exists.
- Web typecheck passes.

## Suggested Build Order

### Backend First

1. Document type/principal/signer summary enrichment.
2. Document next-action resolver.
3. Dashboard `primaryAction` enrichment.
4. Reminder preview endpoint.
5. Reminder send endpoint with cooldown/idempotency/audit.
6. Backend tests and typecheck.

### Frontend Second

1. Consume enriched `GET /documents` and remove N+1 signing fetches.
2. Wire Recent documents CTAs.
3. Wire Recommended next action card.
4. Wire Alerts reminder preview/send modal.
5. Wire Signature request CTAs.
6. Add loading/disabled/toast states.
7. Web typecheck.

## Implementation Notes

- Keep CTA labels short and verb-led.
- Do not expose raw IDs as primary labels.
- Prefer document type + principal + workflow status for context.
- Use backend-provided target paths for workflow routing.
- Do not let dashboard-specific components reimplement workflow decisions.
- Treat reminders as audited workflow actions, not simple email sends.
