# Last Mile Docs Index

Last updated: 2026-04-23

This file is intentionally short.

The previous all-in-one roadmap had become too large and was mixing three different jobs:

1. frontend contract guidance,
2. shipped-work history,
3. remaining backend execution planning.

Use the split docs below instead.

## Use These Docs

1. `apps/web/docs/workspace-api-usage.md`
   Frontend source of truth for the shared authenticated workspace under `/app`.
2. `docs/last-mile-delivery-snapshot.md`
   Concise record of what has already shipped.
3. `docs/backend-first-roadmap.md`
   Backend execution roadmap for work that can proceed before frontend cutover.

## Current Headline

1. Stage A database-first work is materially complete through Phase 6, with the current non-provider hardening slice already landed where noted in the delivery snapshot.
2. Backend-first Track 1 is complete.
3. Backend-first Track 2 through Track 6 are complete, and the shared plus notary workspace contracts, notification runtime, invite runtime, and hardening runtime are locked for frontend and operator cutover.
4. The next product-facing step is frontend cutover to the documented workspace APIs while provider-backed deferred tracks wait on external input.

## Update Rules

1. If the frontend needs to know which route or response shape to use, update `apps/web/docs/workspace-api-usage.md`.
2. If new work has shipped, update `docs/last-mile-delivery-snapshot.md`.
3. If priorities or remaining backend scope change, update `docs/backend-first-roadmap.md`.

Do not expand this file back into a mixed historical roadmap.