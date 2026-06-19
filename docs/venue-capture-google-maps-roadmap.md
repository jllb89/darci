# Venue Capture + Google Maps Prefill Roadmap

## Objective
Improve the notary Venue Capture step by:
- Prefilling venue fields from live geolocation (reverse geocoding).
- Enabling Google Places autocomplete for fast, accurate address entry.
- Preserving manual override and existing validation/submission behavior.

## Product Outcomes
- Faster Venue Capture completion.
- Fewer manual address errors.
- Better consistency for state/county fields before sealing.

## Current Baseline
- Venue capture is now a dedicated step with a dedicated backend endpoint:
  - `POST /notary/requests/:id/meeting/venue-capture`
- Existing required fields for submission:
  - `state`, `county`
- Existing notary geolocation signals are already captured in session flow.

## Field Model (Source of Truth)
Venue fields in UI and capture payload:
- `state`
- `county`
- `city`
- `addressLine1`
- `locationLabel`

Source precedence:
1. Manual edits by notary (highest priority)
2. Google Place selection
3. Reverse geocode from current notary geolocation

## Implementation Phases

### Phase 1: Discovery + Contracts
Goal: lock data and UX contract before coding.

Tasks:
- Define exact mapping contract from Google address components to venue fields.
- Define prefill behavior when Venue Capture step opens.
- Define fallback behavior when API/geolocation is unavailable.
- Confirm no schema migration is required for core submission payload.

Deliverables:
- Mapping table and prefill sequence agreed.
- UX states documented (loading, prefilled, fallback, manual override).

### Phase 1 Output (Executed)

#### A. Data Contracts

Venue Capture Request Contract (existing endpoint):
- Endpoint: `POST /notary/requests/:id/meeting/venue-capture`
- Required:
  - `venue.state: string (2-80)`
  - `venue.county: string (1-120)`
- Optional:
  - `venue.city: string`
  - `venue.addressLine1: string`
  - `venue.locationLabel: string`
  - `venue.completedAt: ISO datetime`
  - `participantRole: "notary" | "member" | ...` (default planned usage: `"notary"`)
  - `capturedAt: ISO datetime`
  - `notes: string`

No schema migration required for phase 1:
- Core required payload already supported.
- Optional source metadata can remain in artifact metadata (phase 5).

#### B. Address Mapping Contract

Google Place/Geocode component mapping to venue fields:
- `state`:
  - primary: `administrative_area_level_1.long_name`
  - fallback: `administrative_area_level_1.short_name`
- `county`:
  - primary: `administrative_area_level_2.long_name`
  - normalize by removing trailing `" County"` for display consistency if present
- `city`:
  - priority order:
    1. `locality.long_name`
    2. `postal_town.long_name`
    3. `sublocality_level_1.long_name`
    4. `administrative_area_level_3.long_name`
- `addressLine1`:
  - `street_number.long_name + " " + route.long_name`
  - fallback: first line of `formatted_address`
- `locationLabel`:
  - priority order:
    1. selected place name (`place.name`) for autocomplete path
    2. `point_of_interest.long_name` if present
    3. empty

Country gating rule:
- If country is not US, do not hard-fail mapping.
- Preserve mapped values and keep manual editing enabled.
- Submission still only requires `state` and `county` as currently defined.

#### C. Prefill Sequence Contract

When Venue Capture step opens:
1. Load freshest notary geolocation sample from current context.
2. If no sample: skip prefill and show manual entry state.
3. If sample exists:
  - perform reverse geocode lookup
  - map components using contract above
  - fill only fields that are currently empty
4. Mark prefill source as `gps_reverse_geocode` in client state.
5. If user picks a place in autocomplete:
  - remap fields from place details
  - override all non-manually-locked fields
  - source becomes `google_place_select`
6. If user edits any field manually:
  - mark that field as user-owned for the current step session
  - subsequent automatic fills must not overwrite user-owned fields

#### D. UX States Contract

Venue step states:
- `idle`: no prefill attempted yet
- `prefill_loading`: geolocation/geocode in progress
- `prefill_applied`: values populated from GPS reverse geocode
- `autocomplete_applied`: values populated from place selection
- `manual_only`: no provider data available, manual entry active
- `provider_error`: provider/geocode failed; manual entry active

UI copy guidance:
- Loading: `"Prefilling venue from current location..."`
- Success GPS: `"Prefilled from current location."`
- Success Place: `"Address applied from selected place."`
- Failure: `"Could not prefill automatically. Enter venue manually."`

Validation behavior:
- Keep current submit gate: `state` + `county` required.
- Never block manual submission because provider is unavailable.

#### E. Failure and Fallback Matrix

1. Geolocation unavailable/denied:
- Result: skip reverse geocode
- UX: manual entry with non-blocking helper text

2. Reverse geocode fails/timeouts:
- Result: no prefill
- UX: provider_error state, manual entry enabled

3. Places autocomplete unavailable (script/key/quota):
- Result: address input remains plain text
- UX: manual_only state, no blocking error modal

4. Partial mapping (missing county or state):
- Result: fill available fields only
- UX: keep required-field validation visible until complete

#### F. Explicit Acceptance for Phase 1 Sign-off

Phase 1 is considered complete when:
- Mapping table is fixed and documented.
- Source precedence is fixed and documented.
- Prefill lifecycle and field overwrite rules are fixed and documented.
- Fallback matrix is fixed and documented.
- No backend schema migration is required for phase 1/phase 3 implementation.

### Phase 2: Google Cloud + Key Management
Goal: secure and controlled API setup.

Tasks:
- Create/choose Google Cloud project.
- Enable APIs:
  - Maps JavaScript API
  - Places API
  - Geocoding API
- Create browser API key and enforce restrictions:
  - HTTP referrers (staging + production domains)
  - API restrictions (only required APIs)
- Add quota caps and budget alerts.

Deliverables:
- Restricted browser key.
- Operational quota/budget guardrails.

### Phase 2 Output (Executed)

#### A. API Scope Decision

Phase 2 API scope for Venue Capture:
- Required in browser:
  - Maps JavaScript API
  - Places API
  - Geocoding API
- Not required in phase 2:
  - Directions API
  - Distance Matrix API
  - Routes API

Only the APIs above should be enabled for the browser key used by Venue Capture.

#### B. Key Strategy

Key model:
- Browser key for frontend autocomplete calls.
- Server key for backend reverse geocoding (active for web + mobile shared path).

Restriction policy for browser key:
- Application restriction: HTTP referrers.
- Allowed referrers:
  - staging web origin(s)
  - production web origin(s)
  - localhost origins for approved development ports
- API restrictions:
  - Maps JavaScript API
  - Places API
  - Geocoding API

Rotation policy:
- Rotate immediately if leakage is suspected.
- Scheduled rotation every 90 days.
- Maintain overlap window where old and new keys are both valid during rollout.

#### C. Environment Variable Contract

Frontend env vars:
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_MAPS_LIBRARIES=places`
- `NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED=true|false`

Backend reserved env vars (future use):
- `GOOGLE_MAPS_SERVER_API_KEY`
- `GOOGLE_MAPS_GEOCODE_USE_SERVER=false|true`

Operational rule:
- Never expose server API key to browser bundles.

#### D. Quota and Budget Controls

Quota guardrails:
- Set daily request caps for:
  - Places Autocomplete
  - Place Details
  - Geocoding
- Set per-minute burst limits to absorb abuse spikes.

Billing guardrails:
- Monthly budget with 50%, 75%, 90%, and 100% alerts.
- Alert routing:
  - engineering on-call channel
  - product owner email

Run-mode fallback rules:
- On quota or billing threshold breach, disable autocomplete via feature flag.
- Keep manual venue entry and submit path fully operational.

#### E. Security and Compliance Controls

- Restrict API key by referrer and API list (mandatory).
- Exclude keys from logs, telemetry payloads, and error responses.
- Store keys only in deployment secret stores.
- Ensure CI does not print secrets in build output.

#### F. Phase 2 Sign-off Criteria

Phase 2 is complete when:
- Browser key exists with strict referrer + API restrictions.
- Required env vars are defined in staging and production secret stores.
- Quota caps and budget alerts are configured and tested.
- Feature flag can disable Google behavior without blocking manual capture.

## Ops Checklist

### Provisioning
- [ ] Create/confirm Google Cloud project dedicated to web mapping features.
- [ ] Enable Maps JavaScript API, Places API, Geocoding API.
- [ ] Create browser key restricted by referrer and API list.
- [x] Create server key for backend geocoding and enable runtime usage for staging.

### Secrets and Environments
- [x] Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to staging secrets.
- [ ] Add `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to production secrets.
- [~] Add `NEXT_PUBLIC_GOOGLE_MAPS_LIBRARIES=places` to staging/prod. (staging confirmed; prod pending)
- [x] Add `NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED=true` to staging.
- [ ] Add `NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED=false` to production until launch gate passes.
- [x] Add `GOOGLE_MAPS_SERVER_API_KEY` to staging backend secrets.
- [x] Add `GOOGLE_MAPS_GEOCODE_USE_SERVER=true` to staging backend runtime env.
- [ ] Add `GOOGLE_MAPS_SERVER_API_KEY` to production backend secrets.
- [ ] Add `GOOGLE_MAPS_GEOCODE_USE_SERVER=true` to production backend runtime env.

### Access and Permissions
- [ ] Limit who can view/rotate Google API keys.
- [ ] Document key owners and backup owners.
- [ ] Verify least-privilege IAM for Google project admins.

### Monitoring and Alerts
- [ ] Configure daily API quota alerts.
- [ ] Configure monthly budget alerts at 50/75/90/100%.
- [ ] Route alerts to on-call and product stakeholders.
- [ ] Validate alert delivery with a test notification.

### Runtime Safeguards
- [x] Implement and verify feature flag kill switch for autocomplete.
- [x] Confirm manual venue capture works with feature flag off (code path preserved and submit path remains manual-safe).
- [x] Confirm manual venue capture works when Google script fails to load (explicit UI fallback to manual entry).

### Release Gates
- [~] Staging smoke test passed for autocomplete and reverse geocode prefill. (build + integration tests passing; manual staging QA sign-off pending)
- [x] Error-path smoke test passed (invalid key / blocked API / quota exceeded). (automated integration coverage includes service-disabled, request-denied, over-query-limit, and zero-results)
- [ ] Product approval for production enablement.
- [ ] Post-release monitoring owner assigned for first 72 hours.

### Post-Launch Operations
- [ ] Capture first-week usage and error metrics.
- [ ] Review spend against forecast.
- [x] Decide whether to enable server-side geocoding in a later phase. (decided and implemented)

### Phase 2 Status Snapshot (Updated)

Legend:
- `[x]` completed
- `[~]` partially complete / needs external validation
- `[ ]` not complete

Completed in-repo:
- Staging env values are present for browser + server Google settings.
- Backend server-side reverse geocoding is implemented and enabled behind `GOOGLE_MAPS_GEOCODE_USE_SERVER`.
- Autocomplete kill switch exists (`NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED`).
- Manual fallback paths exist when Google script/geocoding is unavailable.
- Staging deploy workflow now enforces Google Maps secret presence and injects browser Google build args for web image builds.
- Staging API task registration now enforces backend server geocode runtime flag and secret wiring for `GOOGLE_MAPS_SERVER_API_KEY`.

Still missing (ops/external):
- Google Cloud-side verification of API restrictions and HTTP referrer restrictions.
- Production secret/env rollout for browser and server Google keys.
- Quota caps, budget alerts, and alert routing validation.
- IAM ownership/least-privilege verification for key management.
- Manual staging smoke QA for invalid-key and quota-exceeded scenarios.

### Phase 3: Frontend Autocomplete Integration
Goal: make address entry fast and reliable.

Tasks:
- Integrate Google Places autocomplete into Venue Capture address input.
- On place selection, map components:
  - `administrative_area_level_1` -> `state`
  - `administrative_area_level_2` -> `county`
  - `locality` / fallback locality types -> `city`
  - `street_number + route` -> `addressLine1`
- Keep all fields user-editable after autofill.
- Preserve existing submit validation gates.

Deliverables:
- Venue form with autocomplete and deterministic field mapping.

### Phase 4: Geolocation-Based Prefill
Goal: prefill venue at step entry using current location.

Tasks:
- On entering Venue Capture step:
  - read freshest notary geolocation sample available
  - reverse geocode to venue fields
  - populate empty fields only (do not override manual edits)
- Show prefill provenance in UI (example: "Prefilled from current location").
- Add retry action for prefill if desired.

Deliverables:
- Automatic venue prefill experience with graceful fallback.

### Phase 5: Metadata and Observability Enhancements
Goal: track source quality and behavior without changing required payload.

Tasks:
- Include optional metadata in venue capture artifact:
  - `prefillSource` (`gps_reverse_geocode`, `google_place_select`, `manual`)
  - `placeId` (if selected)
  - `formattedAddress`
  - `prefillLat` / `prefillLng`
- Add telemetry events for:
  - prefill success/failure
  - autocomplete selection
  - manual override

Deliverables:
- Observable venue capture quality and source attribution.

### Phase 5 Output (Executed)

- Venue capture API now accepts optional `prefillMetadata`:
  - `prefillSource`: `gps_reverse_geocode` | `google_place_select` | `manual`
  - `placeId`
  - `formattedAddress`
  - `prefillLat` / `prefillLng`
- Venue capture artifacts now persist source metadata with the capture record for downstream analytics.
- Frontend now sends source attribution metadata on venue submission.
  - Geocode prefill path sets source to `gps_reverse_geocode`.
  - Google place selection sets source to `google_place_select`.
  - Manual edits set source to `manual`.
- Audit payload for venue capture now includes `prefill_source` for event-level observability.

### Phase 6: Testing and Hardening
Goal: ensure reliability and safe degradation.

Tasks:
- Unit tests:
  - address-component mapping parser
  - source-priority merge logic
- Integration tests:
  - venue prefilled from geolocation path
  - place selection overwrites prefill values
  - manual edits persist to submission
  - API key missing / quota exceeded -> manual fallback still works
- UI regression checks on mobile/desktop.

Deliverables:
- Test coverage for normal and degraded paths.

### Phase 6 Output (Executed)

- Added integration coverage for server-side reverse geocoding endpoint:
  - success path with normalized mapping
  - forbidden path when actor is not assigned
  - service-disabled path when `GOOGLE_MAPS_GEOCODE_USE_SERVER=false`
  - provider denied path (`REQUEST_DENIED`)
  - provider quota path (`OVER_QUERY_LIMIT`)
  - provider no-result path (`ZERO_RESULTS`)
- Hardened reverse geocode endpoint authorization to match existing meeting actions.
- Hardened reverse geocode runtime gating with `GOOGLE_MAPS_GEOCODE_USE_SERVER`.
- Decoupled reverse-geocode venue prefill from browser Google key requirements:
  - server prefill runs with backend geocoding even when browser autocomplete is disabled.

### Phase 7: Rollout Strategy
Goal: controlled release with measurable impact.

Tasks:
- Feature flag the Google integration.
- Roll out in stages:
  - internal users
  - partial production cohort
  - full production release
- Monitor KPIs:
  - venue step completion time
  - venue step completion rate
  - % manual overrides after prefill
  - geocode/autocomplete error rates

Deliverables:
- Controlled launch and metrics-based go/no-go.

## Acceptance Criteria
- Entering Venue Capture attempts geolocation prefill automatically.
- Address input supports Google autocomplete and fills related fields.
- Notary can edit any field before submit.
- Submission still uses existing venue-capture endpoint and required validations.
- If Google services fail, manual path remains fully usable.

## Risks and Mitigations
- API quota exhaustion:
  - Mitigate with quotas, alerts, and fallback to manual entry.
- Key leakage:
  - Mitigate with strict referrer + API restrictions and key rotation process.
- Inconsistent county/state mapping by country/region:
  - Mitigate with normalized mapping function and user-editable fields.
- UX confusion from auto-overwrites:
  - Mitigate with source precedence and no overwrite of manual edits.

## Suggested Sequence and Timeline
- Phase 1-2: 1-2 days
- Phase 3-4: 2-4 days
- Phase 5-6: 2-3 days
- Phase 7: staged rollout over 2-5 days

Total implementation window: approximately 1.5 to 2.5 weeks, depending on QA depth and rollout pacing.

## Implementation Notes
- Prefer loading Google Maps scripts only when Venue Capture step is active.
- Keep reverse geocode and autocomplete adapter logic modular for unit testing.
- Ensure no hard dependency on Google APIs for submitting venue capture.
