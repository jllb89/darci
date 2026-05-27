# Trustmaker POA Generation Roadmap

## Goal

When a member generates a Trust Registration package, DARCi must generate one companion POA for each Trustmaker, capped at two Trustmakers. Each generated POA should name that Trustmaker as the POA principal, route signing to the matching Trustmaker email, and allow the signed-in document creator to sign only the POA whose Trustmaker email matches their account email.

## Scope

- Applies to `trust_bundle` only.
- Leaves `poa_only` behavior unchanged.
- Reuses the existing `poa_general` template bindings and template registry rows.
- Reuses existing signer invite and notification delivery infrastructure.
- Avoids new database tables.

## Implementation Plan

Status: implemented.

1. Intake guard
   - Limit `grantors` / Trustmakers to one or two entries.
   - Require unique Trustmaker emails.
   - Require the document creator email to match one Trustmaker email at submit time.
   - Disable the add Trustmaker action in the UI after two entries.

2. Output expansion
   - At intake submit, rebuild the document `output_bundle` for `trust_bundle` using submitted Trustmakers.
   - Replace the single `poa_document` entry with `poa_document_tm1` and, when needed, `poa_document_tm2`.
   - Store metadata on each generated POA output: base output key, document key, principal source, Trustmaker index, name, and email.

3. Template reuse
   - Keep generated run output keys unique per Trustmaker.
   - Resolve template lookup through `baseOutputKey = poa_document` so existing `template_registry` rows are reused.
   - Keep generated run `document_key = poa_general`.

4. Per-POA principal resolution
   - Before preparing each `poa_general` run, derive `principal_full_name` and `principal_contact` from the selected Trustmaker.
   - Keep agent, authority scope, special instructions, and execution values unchanged.

5. Signing and invites
   - For trustmaker-derived POAs, create signer and acknowledger obligations only for the selected Trustmaker.
   - Link each signer row to the selected Trustmaker party for email routing.
   - Restrict owner signature capture to the Trustmaker obligation whose email matches the signed-in user.
   - Let the existing remaining-signer invite dispatcher notify the other Trustmaker after the creator signs.

## Validation

- Backend typecheck: `pnpm -C backend exec tsc --noEmit`.
- Frontend typecheck: `pnpm -C apps/web exec tsc --noEmit`.
- Focused backend tests: `pnpm -C backend exec vitest run tests/unit/memberFormValidationService.test.ts tests/unit/documentGenerationService.test.ts tests/unit/signerInvitationResolverService.test.ts`.
- Covered trustmaker count and unique-email validation, Trustmaker-derived POA signer obligations, and remaining signer invite routing for the second Trustmaker POA.