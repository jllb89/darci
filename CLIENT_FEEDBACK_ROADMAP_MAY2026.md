# Client Feedback Roadmap (May 2026)

## 1. POA Flow: Selected Powers Don’t Match Generated Doc
- Status: DONE
- Why it was failing: The system used strict key matching for POA powers. Some templates and rules used different key names for the same power, so selected items did not map correctly.
- What was fixed: Added broader alias mapping so equivalent power names are treated as the same selection.

## 2. Add ‘Back’ Button on Review Page (POA/Trust)
- Status: DONE
- Why it was failing: This was reported as missing, but the button already existed in the current review page implementation.
- What was fixed: Verified behavior and kept it in place.

## 3. OH POA: Doc Generation Fails
- Status: DONE
- Why it was failing: Required placeholders tied to notary context were treated as hard blockers too early during review generation.
- What was fixed: Review-stage generation now defers notary-context placeholders instead of failing the run.

## 4. CA Trust Registration: Prefilled Info Bug
- Status: DONE
- Why it was failing: During draft conflict sync, server values could overwrite in-progress user edits.
- What was fixed: Merge order was changed so the latest local edits are preserved while still syncing server draft updates.

## 5. Remove ‘Revocable’ Dropdown from Trust Registration
- Status: DONE
- Why it was failing: The field still existed in backend input requirements and helper mappings, so the UI could still surface it.
- What was fixed: Removed the field from trust requirements and cleaned related form/help/group mappings.

## 6. OH Trust Registration: Stuck on ‘Preparing your review PDFs’
- Status: DONE
- Why it was failing: Generation could stay blocked waiting for values that are only available later in notary/signing context.
- What was fixed: Updated blocker logic so those review-time system values are deferred instead of causing a hard stop.

## 7. Remove All Mock Data from App Routes
- Status: DONE
- Why it was failing: These pages were still using static mock arrays even though backend endpoints were ready.
- What was fixed: Replaced mocks with authenticated live API calls for list/detail pages in app, documents, verification, and requests.
- Scope kept: `/app/start` was not included in mock removal work.

---

### Current Outcome
- All listed client feedback items above are marked DONE.
- Remaining step: complete staging redeploy and smoke test after CI fix below.
