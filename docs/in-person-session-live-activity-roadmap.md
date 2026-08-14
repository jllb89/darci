# In-Person Session Live Activity Roadmap

Last updated: 2026-08-11

## Goal

Add an iOS Live Activity for the in-person notarization session so members and Illuminotaries can see session progress from the Lock Screen and Dynamic Island, similar to ride/order tracking in Uber and Uber Eats.

The Live Activity should not become a second source of truth. It should mirror the existing in-person session aggregate and realtime invalidation flow.

## Current Mobile Audit

### Native Session State Is Already Strong

The native app already has both sides of the in-person session:

- Notary workspace: `NotaryInPersonSessionViewModel` drives the notary operator flow.
- Member workspace: `MemberInPersonSessionViewModel` drives member session mirroring and location sharing.
- Both subscribe to the same private Supabase broadcast channel, `request:{requestId}`, through `NotarySessionRealtimeCoordinator`.
- Realtime is used correctly as invalidation only. Each event refetches the canonical backend aggregate.
- Both sides have polling fallback when realtime degrades.

### Existing Notary Timeline

The notary session already resolves a durable step sequence:

1. Session started
2. Member checked in
3. Same-place confirmed
4. Identity verified
5. Venue recorded
6. Acknowledgment appended
7. Session completed
8. Verification anchored

The notary view model maps these to `NotarySessionTimelineItem` and derives the active step from meeting, evidence, and finalization state.

### Existing Member Timeline

The member session mirrors almost the same flow:

1. Session started
2. Location shared
3. Same-place confirmed
4. Identity verified
5. Venue recorded
6. Acknowledgment appended
7. Session completed
8. Verification ready

The member view model already exposes the core fields a Live Activity needs: notary name, document type, jurisdiction, document code, status label, meeting status, finalization state, and timeline completion.

### Current Native Platform Gap

The app currently has no Live Activity implementation:

- No `ActivityKit` usage.
- No `WidgetKit` extension target.
- No `NSSupportsLiveActivities` Info.plist key.
- No Live Activity entitlement/config in `project.yml`.
- No shared Activity attributes/content-state model.
- No APNs Live Activity push-token capture or backend update path.

Because of that, current realtime works only while the app process is active enough to maintain Supabase or fallback polling. That is not Uber-style background Lock Screen reliability yet.

## Product Decision

Ship this in two layers.

### Layer 1: Local Live Activity

Start, update, and end the Live Activity from the native app whenever the member or notary opens the in-person session screen. This gives immediate Lock Screen/Dynamic Island value and validates the design and state mapping quickly.

Limit: if iOS suspends the app and no remote Live Activity push is available, updates can lag until the app wakes or receives a normal push/deep link.

### Layer 2: Remote Live Activity Updates

Add APNs Live Activity push support so backend session mutations can update the Live Activity even when the app is suspended. This is the Uber/Uber Eats behavior.

This needs APNs token plumbing separate from normal notification device tokens because Live Activity update tokens are per activity and rotate.

## Activity State Contract

Create one native contract shared by app and widget extension:

```swift
struct InPersonSessionActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var role: Role
        var requestId: String
        var documentCode: String
        var title: String
        var subtitle: String
        var currentStepId: String
        var currentStepLabel: String
        var completedStepCount: Int
        var totalStepCount: Int
        var status: Status
        var samePlaceStatus: String?
        var distanceLabel: String?
        var updatedAt: Date
        var deepLinkPath: String
    }

    var requestId: String
    var documentId: String?
    var startedAt: Date
}
```

Recommended status enum:

- `preparing`
- `waitingForMember`
- `checkingLocation`
- `verifyingIdentity`
- `recordingVenue`
- `sealingAcknowledgment`
- `finalizing`
- `complete`
- `attentionNeeded`

Do not include PII, full addresses, exact GPS coordinates, ID document fields, or notary/member emails in the Live Activity payload.

## Phase 1: Shared Native State Adapter

Build a small adapter that converts existing notary/member session aggregates into a Live Activity state.

Tasks:

- Add `InPersonSessionLiveActivityState` as an app-level value type independent of ActivityKit.
- Add mapping from `NotaryInPersonSessionViewModel.context` and notary timeline into that state.
- Add mapping from `MemberInPersonSessionViewModel.context` and member timeline into that state.
- Normalize role-specific copy so the Lock Screen reads naturally for each side:
  - Member: “Waiting for your Illuminotary”, “Share your location”, “Identity verified”, “Final package ready”.
  - Notary: “Waiting for member location”, “Same-place confirmed”, “Record identity”, “Complete session”.
- Add unit tests for step/status mapping using mock member and notary session responses.

Acceptance:

- Given each known session phase, the adapter returns the expected step id, label, progress count, status, and deep link.
- No sensitive fields are present in the adapter output.

## Phase 2: Widget Extension And Static Rendering

Add the native Live Activity surface.

Tasks:

- Add a Widget Extension target through XcodeGen.
- Enable Live Activities in the app target Info.plist with `NSSupportsLiveActivities = YES`.
- Add ActivityKit/WidgetKit files under a shared app group-style source layout that XcodeGen can include cleanly.
- Render Lock Screen/banner UI:
  - document/session label
  - current status
  - progress bar or compact step counter
  - last-updated time
  - open-session deep link
- Render Dynamic Island variants:
  - compact leading/trailing: progress fraction plus status mark
  - minimal: session status dot
  - expanded: current step, next action, progress row
- Use existing DARCi visual language: black/white base with onboarding green as the positive status accent.

Acceptance:

- Widget extension builds through `xcodegen generate` and `xcodebuild`.
- Live Activity previews render for member and notary states.
- No layout truncation for long document labels or member/notary names.

## Phase 3: Local Activity Lifecycle Manager

Wire ActivityKit into the app process.

Tasks:

- Add `InPersonSessionLiveActivityController` behind a protocol for testability.
- Start or reuse an activity when either session view loads and the meeting is not complete/anchored.
- Update the activity after every canonical aggregate refresh.
- End the activity when finalization is anchored, the meeting/request is canceled, or the user signs out.
- Keep only one activity per request/role on a device.
- Add a user-controlled escape hatch if needed: stop Live Activity for this session.

Integration points:

- `NotaryInPersonSessionViewModel.load`, realtime invalidation refresh, action completion, `stop`.
- `MemberInPersonSessionViewModel.load`, realtime invalidation refresh, member location share completion, `stop`.
- App session logout/signout path should end active activities.

Acceptance:

- Opening a live in-person session starts the Lock Screen activity.
- Session actions update the Live Activity while the app is active.
- Foreground refetch repairs stale Live Activity state.
- Completion ends or marks the Live Activity complete cleanly.

## Phase 4: Backend Remote Update Support

Move from “nice local activity” to Uber-style reliability.

Tasks:

- Add a `live_activity_tokens` table or equivalent model:
  - `id`
  - `user_id`
  - `request_id`
  - `document_id`
  - `role`
  - `activity_id`
  - `push_token_hash`
  - encrypted/token storage if token body is persisted
  - `environment`
  - `started_at`
  - `last_seen_at`
  - `ended_at`
  - `metadata`
- Add mobile API endpoints:
  - register/update Live Activity push token
  - end/revoke Live Activity token
- Extend APNs adapter to send Live Activity update payloads to the token, separate from normal alert pushes.
- Add a payload builder from the same backend aggregate used by mobile:
  - member: `GET /requests/:id`
  - notary: `GET /notary/requests/:id/context`
- Queue update jobs from existing in-person session mutation points:
  - `session_started`
  - `meeting_checkin_recorded`
  - `same_place_evaluated`
  - `identity_verified`
  - `venue_captured`
  - `acknowledgment_sealed`
  - `meeting_completed`
  - `final_package_submitted`
- Expire or end tokens when the session completes, user logs out, token update fails permanently, or ActivityKit reports token rotation.

Acceptance:

- Backend can update a member/notary Live Activity while the app is backgrounded.
- Failed tokens are retired without breaking normal push notifications.
- Remote payload contains no sensitive session evidence.

## Phase 5: Push-To-Start Decision

Decide whether DARCi needs server-started Live Activities before the user opens the session in-app.

Option A: App-started only for first release.

- Simpler and safer.
- Activity begins after the member/notary opens the session screen.
- Normal push still drives them into the session.

Option B: Push-to-start.

- More Uber-like.
- Requires collecting push-to-start tokens and backend support for starting activities remotely.
- More App Review and operational complexity.

Recommendation: ship app-started first, then add push-to-start only if testing shows members expect the Lock Screen card to appear before opening DARCi.

## Phase 6: Observability And Controls

Tasks:

- Add mobile breadcrumbs/events for activity start, update, end, token registration, token rotation, and failures.
- Add backend audit events for Live Activity token registration and remote update attempts.
- Add admin/support visibility for “activity registered / last update / ended / failed”.
- Add rate limiting and coalescing for rapid backend mutation bursts.
- Keep normal push notifications as fallback; Live Activity updates should not be the only notification path.

Acceptance:

- We can answer whether an activity was active for a request and whether backend updates were delivered/attempted.
- Burst session mutations do not spam APNs.

## Phase 7: Validation Plan

Local validation:

- `xcodegen generate`
- iOS simulator/device build
- ActivityKit start/update/end smoke test on a physical iPhone where possible
- Widget preview snapshots for compact/minimal/expanded/Lock Screen states

Backend validation:

- Unit tests for Live Activity payload generation
- Unit tests for token registration/revocation
- APNs adapter tests for Live Activity update shape
- Focused integration test for each session mutation queuing one coalesced Live Activity update

End-to-end staging validation:

- Notary starts session from mobile.
- Member receives push/deep link and opens mobile member session.
- Member shares location.
- Same-place passes.
- Notary records identity and venue.
- Notary seals acknowledgment.
- Notary completes final package.
- Lock Screen/Dynamic Island updates every state without reopening the app after Phase 4.

## Recommended Attack Order

1. Implement the native state adapter and tests.
2. Add Widget Extension and static Live Activity rendering.
3. Wire local ActivityKit start/update/end from both mobile session view models.
4. Test on a physical iPhone and tune the UI copy/layout.
5. Add backend Live Activity token registration and APNs update support.
6. Queue remote updates from existing realtime broadcast mutation points.
7. Decide whether push-to-start is worth the extra complexity after app-started Live Activities are stable.

## Open Questions

- Should both member and notary get Live Activities, or should v1 target member only?
- Should the activity remain visible after completion as “Verification ready”, or end immediately when final package is anchored?
- Do we want push-to-start in v1, or keep normal push as the session entry point?
- What exact copy should appear for legally sensitive states like identity verification and same-place confirmation?
- Should users be able to disable Live Activities separately from push notifications?

## Risk Notes

- Supabase realtime is not enough for Uber-style Lock Screen updates while the app is suspended; APNs Live Activity updates are required for that reliability.
- Live Activity payloads must be privacy-minimal because they appear on the Lock Screen.
- ActivityKit requires careful token lifecycle handling; tokens are per activity and can rotate.
- Existing XcodeGen/Info.plist churn needs attention when adding the widget extension and `NSSupportsLiveActivities`.

## Operational Dependency: AWS SMS Production Access

AWS production SMS access is a related launch dependency because in-person session entry, auth recovery, and notification fallback can rely on SMS when email or push is unavailable. The current staging SMS path is still affected by AWS SNS/SMS sandbox limits.

Known current facts:

- AWS account: `427057633951`.
- Region: `us-east-1`.
- Staging SNS SMS sandbox is enabled.
- Known toll-free originator: `+18773624121` / `phone-441bd84199c549d2879f293084fef7c2`.
- Known toll-free registration: `registration-3088f0d5977843f1af061fa909c3ce96`.
- Registration was `CREATED` / `PENDING` as of the last staging note.
- Production service URL should be the production DARCi domain, not staging.

AWS has requested the following before approving production SMS spend/sandbox exit:

- Company URL, production website only.
- Requested monthly spend in USD.
- SMS launch date.
- Origination identity type and exact identity.
- Whether each identity is registered.
- Expected messages per day.
- Expected messages per second.
- Reason for the requested send rate.
- Volume by destination country and time period.
- Whether traffic is sustained or burst traffic.
- At least three SMS content samples.
- Every originating identity per country.
- Relationship between AWS account domain and message/service URLs, especially `illuminote.io` vs `darciregistry.dev`.

Recommended AWS support posture:

- Frame DARCi SMS as transactional, user-initiated, low-volume notarization/auth messaging.
- Do not describe marketing, promotional, lead-gen, or bulk messaging use cases.
- State that recipients are authenticated users, invited signers, members, notaries, or users who explicitly entered their phone for OTP/session workflows.
- Keep requested spend and throughput conservative for launch.
- State that SMS messages will include DARCi/DARCi Registry branding and no public URL shorteners.
- Explain domain relationship clearly: Illuminote is the operating/legal account entity; DARCi Registry is the product/service domain used in customer-facing application links.

Draft response values to confirm before sending:

- Company URL: `https://app.darciregistry.dev` or the final production marketing/app URL if different.
- Requested monthly spend: start conservatively, for example `$50` to `$100`, unless launch projections require more.
- Launch date: provide target date or “as soon as production access is approved”.
- Origination identity: toll-free long code `+18773624121`, if this remains the production identity.
- Registration status: confirm latest AWS registration status before replying.
- Expected messages per day: conservative launch estimate, for example `50-200/day`.
- Expected messages per second: `1 MPS` is sufficient for launch unless AWS requires the toll-free default.
- Destination countries: likely United States only for v1 unless Canada or others are active.

Example SMS samples:

1. `DARCi: Your sign-in code is 123456. It expires in 10 minutes. Do not share this code.`
2. `DARCi: Your in-person notarization session has started. Open DARCi to share your location and continue: https://app.darciregistry.dev/app/requests/REQUEST_ID`
3. `DARCi: Your notary request is ready for review. Open DARCi to view the status: https://app.darciregistry.dev/app/requests/REQUEST_ID`
4. `DARCi: Your document signing request is ready. Open DARCi to sign securely: https://app.darciregistry.dev/app/sign?documentId=DOCUMENT_ID`

Do not include real OTP codes, real request IDs, real user phone numbers, or secret URLs in the AWS response.