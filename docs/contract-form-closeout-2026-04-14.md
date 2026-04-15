# Contract Form Closeout - 2026-04-14

## What was validated

- Backend TypeScript build passed: `backend npm run build`.
- Targeted member-form unit tests passed (18/18):
  - `tests/unit/memberFormRulesService.test.ts`
  - `tests/unit/memberFormDocumentExtractionService.test.ts`
  - `tests/unit/memberFormValidationService.test.ts`

## Low-risk cleanup completed

- Refactored duplicated response payloads in member form controller:
  - Single helper for `jurisdiction is required` validation response.
  - Single helper for `member form requirements not found` response.
- Tightened `mode` typing in controller request parsing to `ProductFlowModeKey`.
- Improved fallback mode display naming so fallback mode labels are human-readable (for example, `notarize_document` -> `Notarize Document`).

## Hardcoded audit (found)

The following are still hardcoded and should be tracked intentionally:

- Product flow fallback defaults in backend mode service:
  - fallback families/type tuples for `poa_only`, `trust_bundle`, `notarize_document`.
  - hard fallback default mode key (`trust_bundle`) when DB default is unavailable.
- Member-form fallback help text dictionary in `memberFormRulesService`.
  - This is currently a deliberate safety net when DB help text is missing.
- Trust fallback behavior in `trustService` still hardcodes fallback document type (`rrr`) in fallback paths.
- Several TODO placeholder values in non-contract-form controllers (notary/ledger/verify/documents/webhook).

## Recommended next hardcoded-removal phase

1. Move fallback help text dictionary into a DB-backed table with locale support.
2. Replace static mode fallback tuples with DB-seeded bootstrap rows plus startup validation.
3. Convert trust `rrr` fallback into a configurable default from mode/family metadata.
4. Track TODO placeholders under a dedicated technical-debt issue list by controller.
