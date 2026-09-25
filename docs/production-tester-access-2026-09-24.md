# Private-production tester network access — 24 September 2026

Deployed and verified at 17:48 UTC. CloudFormation completed successfully; exact live listener-rule readback passed.

| Tester | Approved public IPv4 addresses |
| --- | --- |
| Claire | `146.75.129.125`, `23.245.227.237` |
| Adam | `146.75.154.172`, `67.170.239.201` |
| Ann | `67.170.239.201` (shared with Adam; granted once) |

The four unique `/32` addresses can reach HTTPS on `app.illuminotary.com` and `api.illuminotary.com`. Existing operator access is preserved. Four additional host-and-source-IP rules use priorities 30–33; no existing rule was replaced. Port 80 remains operator-only: testers should use **https://app.illuminotary.com** or the production TestFlight build.

Default denial and the existing exact public provider-callback/Apple association exceptions are unchanged. No images, services, secrets, billing gates, signup settings, database allowlist or accounts changed. Billing remains enforced and purchases remain closed. Network access does not itself provision or authorize a member/notary account. Cellular, VPN, Private Relay or network changes may use another source IP and be denied.

Implementation: `infra/production/tester-access.mjs`; scoped rollout: `deploy-tester-access.mjs --approved-client-ips`. Future image deployments must retain the deployed template, including these rules. Do not replace it with the original bootstrap template. The rollout's temporary production-listener permission was removed after verification.

Validation: all **101 infrastructure tests passed**; live rule readback confirms both hosts and all four exact `/32`s. Private before/after evidence is in `.recovery-private/production-tester-access-OEM7CD/`. Actual end-to-end access from each client's network still requires their device check; it cannot be simulated by spoofing a request header.

## Additional Jorge network — 24 September, 21:42 Mexico City

Added the explicitly approved `187.247.153.218/32` to the existing production app/API HTTPS operator rules, retaining the previous operator address and all four tester addresses. The reviewed CloudFormation change set modified only `apiRoute` and `webRoute`, without replacement. Live rule readback verified the exact additive address, unchanged forwarding targets and unchanged other rules. Stack parameters, images, secrets, services, signup/billing settings, database network restrictions and port 80 were not changed. Temporary permission to modify only these two rules was removed after successful verification.

Implementation: `infra/production/add-operator-app-ip.mjs <IPv4> --approved-addition`. This is app access, not an expansion of direct database access. Syntax validation and both tester-access regression tests passed. Private before/after templates, change set and live-rule evidence: `.recovery-private/production-operator-ip-IVweni/` (verification completed 25 September at 03:42:57 UTC).
