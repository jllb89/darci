# Production APNs credential and operator test — 23 September

## Completed

- Imported `AuthKey_QW4JZ2X6DU.p8` from the operator's Downloads into ignored `.env.production`, without printing the key. Existing Key ID `QW4JZ2X6DU`, Team ID `38K3YA2857`, bundle `com.illuminote.darci` and production transport setting were checked. PEM parsing confirms a valid EC P-256 key. The env file is mode `0600`; other values were preserved.
- Pinned production AWS secret version `3feb06a0-52ec-4e45-9869-d89f182f953d`; previous version retained. APNs credentials are server-only, not mobile/web bundle contents.
- Configuration-only rollout completed **20:32:50 UTC**: API9 (2), worker8 (1), web4 (2), unchanged image digests, zero pending tasks. Temporary execution permissions were removed. App/API IP restrictions, closed signup/live purchases, disabled general push and notification runners remain unchanged.
- **13 APNs/device-registration tests and four configuration-boundary tests pass.** The initial integration-test attempt hit the sandbox's local-listener restriction; the same tests passed with listener permission. No product fix was needed for that test-environment error.
- Final production runtime, secret-version and negative callback checks pass; these callback probes sent no SMS and made no charges.

## Exactly one authorized push

Jorge explicitly approved using his existing TestFlight installation's production APNs token, read transiently from staging. Only his active, authorized, production-environment installation was selected. No account or token record was copied to production; no other user received a notification.

- Title: `[DARCi TEST] Production push`.
- Apple response: **HTTP 200**, **20:33:15 UTC**.
- APNs ID: `95359E8C-A533-818C-172F-58CF0079A92D`.
- One attempt only. The exclusive local receipt prevents automatic reruns; no automatic retry was performed.
- **Device receipt confirmed by Jorge in chat on 23 September.** This is independent confirmation beyond Apple's HTTP 200 response.

This used the existing APNs client from the operator machine with the deployed production credentials. It does **not** prove production-device registration, AWS worker egress/dispatch, outbox processing, push-open routing, logout invalidation or full production-app acceptance. The current TestFlight build still connects to staging. General push sending remains disabled until the remaining scoped activation/acceptance is complete.

## Private evidence

- `.recovery-private/production-provider-deploy-cieoEd`
- `.recovery-private/production-apns-20260923-QW4JZ2X6DU.json`
- `.recovery-private/production-provider-acceptance-PuCdOc`

No private key, device token or provider JWT is included in this document.
