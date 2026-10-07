# Production public app access — 7 October 2026

## Deployed scope

Jorge approved public network access to both `app.illuminotary.com` and
`api.illuminotary.com`. Deployment completed at **20:04 UTC** with the production
CloudFormation stack in `UPDATE_COMPLETE`.

Normal web and production iOS API access no longer requires a tester IP address.
This is a network-routing change, not anonymous access to accounts or documents.
Authentication, account/document permissions, admin controls, enforced billing,
WAF protections, signup settings and payment configuration were preserved.
**This pass did not enable new-account signup.**

No application redeployment or new TestFlight build is required for this routing
change. An iOS build must already point to the production API to benefit.

## Routing and operational boundaries

| Priority | Production host/path | Action |
| --- | --- | --- |
| Existing operator/tester rules | Approved source IPs and exact app/API hosts | Preserved |
| 300 | `app.illuminotary.com` | Public forwarding to the existing web target |
| 301 | API `/internal`, `/internal/*`, `/debug-sentry` | Deny outside earlier approved IP rules |
| 302 | API `/docs`, `/docs/*`, `/openapi.yaml` | Deny outside earlier approved IP rules |
| 303 | `api.illuminotary.com` | Public forwarding to the existing API target |
| Default HTTPS | Unrecognized hosts | 403 |

Public port 80 was opened **only on the production load-balancer security group**;
its listener redirects to HTTPS. ECS, database and Redis security groups were
not changed. Existing signed provider callbacks, Apple association files,
verification and marketing routes were retained exactly. Internal endpoint
service-role authentication still applies even to allowlisted networks.

## Verification

- All **114 production infrastructure regression tests passed**.
- Exact deployed-template and listener-rule readback passed; all existing
  resources and parameters, including pinned images, were preserved.
- Web `/start`: HTTP 200; API `/health/ready`: HTTP 200, `status: ready`.
- Unauthenticated documents, profile, member billing and admin requests: 401.
- Invalid bearer token on documents: 401.
- App-origin authenticated-request CORS preflight: 204 with the correct origin.
- HTTP app URL: 301 to HTTPS; a real unrecognized HTTP Host header: 403.
- Temporary deployment permissions were removed after verification.

Live HTTP probes ran from the operator computer. An independent remote-fetch
tool could not access these URLs, so no external-device test is claimed. Public
rules were verified to have no source-IP condition; an off-Wi-Fi/cellular device
check is the final user-side confirmation. Diagnostic denial for external
networks is established by deployed rule ordering, not by spoofing a source-IP
header or by a local allowlisted request.

Private deployment evidence: `.recovery-private/production-public-app-cewJi9/`.
No messages, charges, subscriptions or client documents were created or modified.

## Maintenance and rollback

Implementation: `infra/production/public-app-access.mjs`; regression coverage:
`public-app-access.test.mjs`; approved rollout:
`node infra/production/deploy-public-app-access.mjs --approved-public-app-access`.

Future image releases must retain the current deployed template (the release
workflow uses the previous template). Do not deploy the original private
bootstrap template over the live stack.

For an approved rollback, use the exact saved baseline template from this
deployment, with all current parameter values preserved, after reviewing any
subsequent infrastructure changes. Remove only this pass's four public-access
rules and public HTTP ingress; retain the earlier operator/tester rules and
provider/marketing exceptions. Do not replace images, runtime secrets or signup
and payment settings as part of network rollback.
