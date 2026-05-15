# Domain Cutover Audit: darciregistry.dev

Date: 2026-05-15
Scope: source code, deployment workflow, staging ECS runtime, staging Secrets Manager references, and docs runbooks.

## Executive Summary

The current runtime and repository are primarily configured for darciregistry.com (especially staging subdomains). A cutover to darciregistry.dev requires coordinated updates across DNS, TLS, edge routing, ECS env vars/secrets, GitHub Actions variables, Supabase redirect/hook settings, and Resend domain/webhook settings.

The largest risk is partial cutover: app and API hostnames can drift from callback/webhook allow-lists, which breaks auth callbacks, SMS hook delivery, and email event webhooks.

## What Was Updated In Code

1. Legacy darci.app examples were replaced with darciregistry.dev examples.
2. Verification URL defaults are now configurable via PUBLIC_VERIFICATION_BASE_URL, with default fallback to https://www.darciregistry.dev.
3. Notification logo base URL no longer hardcodes app.staging.darciregistry.com. It now resolves from WEB_APP_URL/NEXT_PUBLIC_WEB_BASE_URL/APP_BASE_URL/NEXT_PUBLIC_APP_BASE_URL/NEXT_PUBLIC_SITE_URL with fallback https://app.staging.darciregistry.dev.

## Current Runtime Snapshot (staging)

1. ECS API task definition uses:
   - API_BASE_URL=https://api.staging.darciregistry.com
   - APP_BASE_URL=https://app.staging.darciregistry.com
2. Staging secret /darci/staging/app currently includes:
   - CORS_ALLOWED_ORIGINS=https://app.staging.darciregistry.com
3. Web service task definition does not carry public API URL env vars directly; they are baked at image build via GitHub Actions variable STAGING_NEXT_PUBLIC_API_BASE_URL.

## Blast Radius Inventory

### Source/Code defaults

1. backend/.env.example (CORS example values)
2. apps/web/Dockerfile (build arg comment examples)
3. backend/src/controllers/documentsController.ts (verification URL default)
4. backend/src/services/documentGenerationService.ts (verification URL default)
5. backend/src/services/notificationTemplateRenderService.ts (hardcoded staging logo base URL)

### CI/CD + Build-time config

1. .github/workflows/deploy-staging.yml
   - STAGING_NEXT_PUBLIC_API_BASE_URL (repo variable)
   - STAGING_HEALTH_URL (repo variable)

### AWS runtime config

1. ECS service darci-staging-api env vars
   - API_BASE_URL
   - APP_BASE_URL
2. Secrets Manager /darci/staging/app
   - CORS_ALLOWED_ORIGINS
3. ALB/CloudFront/Route53 host routing entries (currently documented for darciregistry.com)

### Supabase auth integrations

1. Auth URL allow-list/callback URLs
2. Google OAuth redirect URLs
3. Send SMS Hook URL

### Resend + webhooks

1. Sending domain verification (domain and DNS records)
2. Sender identities/from addresses policy
3. Event webhook target URL for API

### Documentation references

Multiple docs still refer to darciregistry.com and staging on that domain, including:
1. docs/aws-staging-deployment-roadmap.md
2. docs/auth-enhancement-roadmap.md
3. docs/resend-email-provider-integration-roadmap.md
4. docs/resend-phase-0-scope-lock.md
5. docs/resend-email-incident-runbook.md
6. docs/CA DDPOA.md

## Required Cutover Plan

### Phase 1: DNS/TLS/Edge (Route53 + ACM + CloudFront/ALB)

1. Create/confirm hosted zone for darciregistry.dev.
2. Provision ACM certs covering required hosts:
   - app.staging.darciregistry.dev
   - api.staging.darciregistry.dev
   - app.darciregistry.dev
   - api.darciregistry.dev
3. Update ALB listener host rules to accept new .dev hosts.
4. Update CloudFront alternate domain names and certs for app host(s).
5. Add Route53 alias records to ALB/CloudFront targets.
6. Keep old .com records during overlap window to prevent immediate outage.

### Phase 2: App/API Runtime Configuration

1. Update ECS API env vars:
   - API_BASE_URL -> https://api.staging.darciregistry.dev
   - APP_BASE_URL -> https://app.staging.darciregistry.dev
2. Update Secrets Manager /darci/staging/app:
   - CORS_ALLOWED_ORIGINS -> https://app.staging.darciregistry.dev
   - (optional) PUBLIC_VERIFICATION_BASE_URL -> https://www.darciregistry.dev
3. Redeploy API and worker services.
4. Update GitHub repo variables:
   - STAGING_NEXT_PUBLIC_API_BASE_URL -> https://api.staging.darciregistry.dev
   - STAGING_HEALTH_URL -> https://api.staging.darciregistry.dev/health
5. Trigger staging deployment so web bundle gets rebuilt with the new API base URL.

### Phase 3: Supabase Auth + Webhooks

1. Update allowed redirect URLs:
   - https://app.staging.darciregistry.dev/auth/callback
   - https://app.darciregistry.dev/auth/callback (if production is moving)
2. Update Google OAuth redirect URIs in Google console and Supabase provider config.
3. Update Send SMS Hook URL:
   - https://api.staging.darciregistry.dev/webhooks/supabase/auth/send-sms
4. Reconfirm hook secret in AWS remains unchanged and mapped correctly.

### Phase 4: Resend Domain + Event Webhook

1. Decide sending domain policy:
   - Option A: keep sender addresses on darciregistry.com.
   - Option B: move sender addresses to darciregistry.dev.
2. If moving to .dev, complete Resend domain verification and DNS records first.
3. Update webhook endpoint URL in Resend:
   - https://api.staging.darciregistry.dev/webhooks/resend
4. Confirm backend RESEND_WEBHOOK_SECRET remains synchronized.
5. Send test messages and verify webhook event ingestion.

### Phase 5: Documentation + Legal Texts

1. Update domain references in ops/docs runbooks from .com to .dev where applicable.
2. Explicitly mark any systems intentionally remaining on .com (if mixed-domain strategy).
3. Review legal/contract templates referencing www.darciregistry.com before changing production legal copy.

## Validation Checklist

1. API health URL returns 200 at new .dev host.
2. Web app loads and calls API successfully (no CORS errors).
3. Supabase email/OTP callbacks return to /auth/callback on .dev and complete session sync.
4. Supabase Send SMS Hook delivers OTP via API webhook path on .dev.
5. Resend inbound event webhook reaches API on .dev and signature verification passes.
6. Invite links and document verification links use intended .dev host.

## Rollback Strategy

1. Keep .com DNS and host rules in place until all .dev checks pass.
2. If failures occur, revert API_BASE_URL/APP_BASE_URL/CORS_ALLOWED_ORIGINS and GitHub vars to prior .com values.
3. Redeploy API/worker/web and restore Supabase/Resend webhook URLs to prior .com endpoints.

## Commands (reference)

Update staging secret key:

aws secretsmanager get-secret-value --region us-east-1 --secret-id /darci/staging/app --query SecretString --output text > /tmp/staging-app.json
jq '.CORS_ALLOWED_ORIGINS = "https://app.staging.darciregistry.dev" | .PUBLIC_VERIFICATION_BASE_URL = "https://www.darciregistry.dev"' /tmp/staging-app.json > /tmp/staging-app-updated.json
aws secretsmanager update-secret --region us-east-1 --secret-id /darci/staging/app --secret-string file:///tmp/staging-app-updated.json

Force ECS rollout:

aws ecs update-service --region us-east-1 --cluster darci-staging --service darci-staging-api --force-new-deployment
aws ecs update-service --region us-east-1 --cluster darci-staging --service darci-staging-worker --force-new-deployment
aws ecs wait services-stable --region us-east-1 --cluster darci-staging --services darci-staging-api darci-staging-worker
