# Production marketing landing routing

The intended landing is the Next.js web root (`apps/web/src/app/page.tsx`), also visible at `https://app.staging.darciregistry.dev/`. The legacy Hostinger WordPress site is not the intended landing.

## Domain map

| Domain | Purpose |
| --- | --- |
| `illuminotary.com` | Public production Next.js marketing root |
| `www.illuminotary.com` | Permanent redirect to the apex, preserving path/query |
| `darciregistry.com`, `www.darciregistry.com` | Existing Hostinger permanent redirect to `illuminotary.com`, preserving path/query |
| `app.illuminotary.com` | Existing restricted production application |
| `api.illuminotary.com` | Existing restricted production API and already-approved public callbacks/verification |

## Narrow public surface

The production ALB forwards only GET/HEAD on the apex root and static asset paths (`/_next/static/*`, `/images/*`, `/icons/*`, `/footer/*`, `/favicon.ico`) to the existing web target. Other apex GET/HEAD requests redirect to `app.illuminotary.com`, preserving path/query, so existing relative login and plan links reach the application without making authentication or documents public on the marketing domain. Other methods remain denied.

No app/API allowlist, billing flag, runtime secret, database, PDF or deployed image is changed. The template transformation preserves all existing resources and parameters, adds five marketing listener rules plus the apex/www certificate, and refuses an unguarded baseline or priority collision. Temporary CloudFormation permissions expire after 30 minutes and are removed after the update completes.

## DNS / certificate

Namecheap apex: ALIAS to `darci-production-1695242078.us-east-1.elb.amazonaws.com` (never fixed ALB IPs). `www`: CNAME to the same ALB. Existing app/API, mail and certificate validation records remain untouched.

AWS ACM certificate: `308a3dde-3fbb-4468-b743-6357bf0dffbd`, region `us-east-1`, covers apex and www. Keep both new validation CNAMEs for automatic renewal.

## Deployment / rollback

`infra/production/deploy-marketing-routes.mjs` reads the current deployed template and records its exact baseline privately before the change. Existing GitHub production image promotions use the previous deployed template, so subsequent releases retain these routes.

If a rollback is necessary, restore the saved reviewed template and revert only Namecheap apex/www to their previous A records (`77.37.92.73`). Do not remove old-domain redirect rules or change app/API DNS. The unused copied Hostinger site is retained; no site files were deleted.

## Verification

- Routing regression tests cover private-gate preservation, host/method/path restrictions, ALB condition limits, duplicate configuration, priority collisions and foreign certificates.
- Before DNS cutover, validate TLS, root/asset responses and app redirects against the ALB directly.
- After cutover, validate both marketing hostnames and old-domain redirects, then verify the actual landing in the browser.
- This routing correction does not certify all marketing wording or wire the existing inert marketing controls/newsletter forms.

### Executed checks

- All 111 production infrastructure tests passed.
- AWS certificate issued for both names; the CloudFormation update completed with every pre-existing resource and parameter unchanged. Temporary deployment permissions were removed.
- Direct TLS-verified ALB checks passed for the intended root, all 34 referenced/background assets, www canonical redirects, preserved billing-link query parameters, and POST denial.
- Plain and percent-encoded static-path traversal attempts redirected rather than forwarding private pages.
- Namecheap saved apex ALIAS and www CNAME records. Authoritative DNS, Cloudflare and Google resolvers returned the AWS destination. The old-domain root and `/start` redirects retained their destinations and query parameters.
- Private deployment evidence: `.recovery-private/production-marketing-y2hZ5o/` (ignored; do not publish its baseline configuration).
- Public hostname checks through fresh DNS-over-HTTPS returned the Next.js landing (HTTP 200) and www canonical redirect (HTTP 301) at 22:13 UTC. This Mac's native resolver/browser still cached the former Hostinger address; no persistent network settings were changed. Local DNS caches can temporarily show the old page after the otherwise completed cutover.
- Full compressed HTTPS downloads through current public DNS passed for all four URLs (apex/www of both domains), each ending at the intended Next.js landing with no WordPress page content. Browser visual confirmation on this Mac remains subject to its local DNS cache.
