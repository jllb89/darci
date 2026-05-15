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
- What was fixed: Removed the field from trust requirements and cleaned related form/help/group mappings. Also enforced trust saves to persist `revocability_status = revocable` on draft and submit.

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

---

## 8. Domain Change + Going Live (darciregistry.dev)
- Status: DONE
- Goal: Move staging to the new `.dev` domain and make the full platform reachable and stable online.

### What we had to do (full list)

#### A) Code and app defaults
- Updated old domain examples in repo docs and config samples to new `.dev` values.
- Updated verification link generation to use configurable base URL instead of hardcoded domain.
- Added `PUBLIC_VERIFICATION_BASE_URL` support, with fallback to `https://www.darciregistry.dev`.
- Updated notification email logo/web links to use configured app base URL (no hardcoded staging `.com` URL).

#### B) DNS, TLS, and traffic routing
- Created/confirmed DNS hosted zone for the domain.
- Added DNS records for staging app and staging API.
- Issued and attached TLS certificates for staging hosts.
- Updated load balancer rules to accept the new hostnames.
- Kept old `.com` records during overlap to avoid downtime during cutover.

#### C) CDN and edge delivery
- Routed staging web traffic through CloudFront.
- Configured CloudFront host mapping for staging app domain.
- Added static asset cache behavior for `_next/static`, images, icons, and fonts.
- Added HTTP to HTTPS redirect path at the edge/load balancer level.

#### D) AWS runtime configuration
- Updated ECS runtime env values to new staging `.dev` URLs for API and app base.
- Updated Secrets Manager values, especially allowed CORS origin.
- Added/confirmed secrets required for web build-time public config.
- Forced ECS service redeploy so running tasks picked up new secrets and env values.

#### E) CI/CD and build pipeline
- Updated staging deploy variables to use new `.dev` endpoints.
- Ensured staging health check target points to new domain.
- Rebuilt and redeployed web so public API base URL baked into bundle matched new API domain.
- Kept GitHub OIDC deploy flow and ECR push/deploy sequence in place.

#### F) Auth and callback integrations
- Updated Supabase allowed callback URLs to new staging app callback URL.
- Updated Google OAuth redirect URL configuration to match new callback URL.
- Updated Supabase Auth Send SMS hook endpoint URL to new staging API domain.
- Confirmed hook secret mapping in AWS so signed webhook delivery stays valid.

#### G) Email delivery and webhooks
- Updated Resend webhook endpoint to the new staging API host.
- Verified webhook signing secret alignment after endpoint change.
- Confirmed event delivery path for sent/delivered/bounced/opened/clicked events.

#### H) Online performance and stability hardening
- Optimized large homepage image assets.
- Added stronger static caching headers.
- Reduced heavy prefetch behavior for app routes.
- Added CDN in front of web service to improve real network performance.

#### I) Final deployment blocker we hit and fixed
- Problem: GitHub Actions deploy looked stuck during Docker build.
- Real reason: arm64 emulation + Alpine image path crashed during `npm ci` with `qemu` illegal instruction.
- Fix: Switched backend Docker images from Alpine to Debian slim for build/runtime stages.
- Result: Deployment pipeline could complete and site came up.

### Why this was failing before
- Several systems were still tied to old domain values (DNS, callback URLs, webhook endpoints, runtime envs, and build variables).
- Any one mismatch could break login callbacks, API calls, or webhook processing.
- Build instability in CI (arm emulation + Alpine) delayed the final successful redeploy.

### What is true now
- Staging app and API are online on the new `.dev` domain.
- Domain routing, TLS, runtime config, auth callbacks, and webhook paths are aligned.
- Deployment path is stabilized with updated backend image base.
