# AWS Deployment Roadmap — Staging & Production

**Status:** Staging deployed — April 28, 2026  
**Goal:** Deploy the full DARCi stack to AWS with staging and production environments, using a container-based architecture and AWS-managed runtime configuration.

---

## Current Staging State

Staging has been provisioned in AWS account `427057633951`, region `us-east-1`.

**Live endpoints:**
- ALB DNS: `darci-staging-alb-844336327.us-east-1.elb.amazonaws.com`
- Web app: `http://darci-staging-alb-844336327.us-east-1.elb.amazonaws.com/`
- API health: `http://darci-staging-alb-844336327.us-east-1.elb.amazonaws.com/health`
- API host rule: `api.staging.darci.app` routes all paths to the API once DNS points at the ALB

**AWS resources created:**
- ECS cluster: `darci-staging`
- ECS services: `darci-staging-web`, `darci-staging-api`, `darci-staging-worker`
- ALB: `darci-staging-alb`
- Target groups: `darci-staging-web-tg`, `darci-staging-api-tg`
- ECR repositories: `darci-web`, `darci-api`, `darci-worker`
- Secrets Manager secret: `/darci/staging/app`
- Redis endpoint: `darci-staging-redis-xqocue.serverless.use1.cache.amazonaws.com:6379`

**Verified deployment status:**
- Web service: running `1/1`, ALB target healthy
- API service: running `1/1`, ALB target healthy, `/health` returns `{"status":"ok"}`
- Worker service: running `1/1`

**Resolved staging blockers:**
- Added `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `/darci/staging/app` so the API no longer exits with `supabaseKey is required`.
- Updated the BullMQ Redis connection to use `maxRetriesPerRequest: null` so the worker can start on ECS.
- Updated OpenAPI spec path resolution so the API can load `api/openapi.yaml` in both local builds and the Docker runtime layout.

**Remaining manual steps:**
- Create DNS records for `app.staging.darci.app` and `api.staging.darci.app` pointing to the ALB.
- Request/validate an ACM certificate and switch the ALB listener to HTTPS.
- Add the Resend webhook endpoint after HTTPS is live: `https://api.staging.darci.app/webhooks/resend`.
- Add CI/CD so future pushes rebuild and redeploy automatically.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  GitHub (source of truth)                                   │
│  main branch → auto-deploy → STAGING                        │
│  release tag  → manual gate → PRODUCTION                    │
└────────────────────────┬────────────────────────────────────┘
                         │ GitHub Actions (OIDC)
          ┌──────────────▼──────────────┐
          │        AWS Account           │
          │  ┌────────────────────────┐  │
          │  │   ECR (3 repositories) │  │
          │  │  - darci-api           │  │
          │  │  - darci-worker        │  │
          │  │  - darci-web           │  │
          │  └────────────┬───────────┘  │
          │               │              │
          │  ┌────────────▼───────────┐  │
          │  │  ECS Fargate Cluster   │  │
          │  │                        │  │
          │  │  [staging namespace]   │  │
          │  │   API service  :4000   │  │
          │  │   Worker service       │  │
          │  │   Web service  :3000   │  │
          │  │                        │  │
          │  │  [production namespace]│  │
          │  │   API service  :4000   │  │
          │  │   Worker service       │  │
          │  │   Web service  :3000   │  │
          │  └────────────────────────┘  │
          │                              │
          │  ElastiCache (Redis)         │
          │   staging cluster            │
          │   production cluster         │
          │                              │
          │  Secrets Manager             │
          │   /darci/staging/*           │
          │   /darci/production/*        │
          │                              │
          │  ALB → Route53 + ACM TLS     │
          │   api.staging.darci.app      │
          │   app.staging.darci.app      │
          │   api.darci.app              │
          │   app.darci.app              │
          └──────────────────────────────┘
```

**External services (unchanged, already hosted):**
- Supabase — database, storage, auth
- Resend — email delivery

---

## What Does NOT Change

- Environment variable names — ECS uses the same names already in `.env.staging` / `.env.production`
- Supabase setup — already configured and running
- Resend setup — unchanged until webhook activation after HTTPS is live
- Local development workflow — `.env.staging` continues to work on local machine

Deployment prep required a few small backend runtime fixes: env-configured CORS origins, raw-body webhook routing, BullMQ-compatible Redis options, and Docker-safe OpenAPI spec resolution.

---

## Phases

### Phase 0 — Required Runtime Fixes (Complete)

**Who:** Agent

Completed fixes:
- `backend/src/index.ts` reads `CORS_ALLOWED_ORIGINS` while preserving localhost for local dev.
- Resend webhooks mount before `express.json()` so signature verification receives the raw body.
- `backend/src/worker/queues.ts` creates the Redis connection with `maxRetriesPerRequest: null` for BullMQ worker compatibility.
- `backend/src/index.ts` resolves `api/openapi.yaml` from both repo and Docker runtime layouts.
- `backend/.env.example` documents `SUPABASE_ANON_KEY`.

---

### Phase 1 — Containerization (Agent can do)

**Time estimate:** 1–2 hours  
**Who:** Agent creates files; you test builds locally with `docker build`

Three Dockerfiles, each multi-stage (build → runtime). No changes to application code in any of them.

#### `backend/Dockerfile` — API server

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY packages/types ./packages/types
COPY backend/package*.json ./backend/
RUN cd backend && npm ci
COPY backend ./backend
RUN cd backend && npm run build

# Stage 2: runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

#### `backend/Dockerfile.worker` — BullMQ worker

Same multi-stage build, different CMD:
```dockerfile
CMD ["node", "dist/worker/index.js"]
```

#### `apps/web/Dockerfile` — Next.js frontend

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY packages/types ./packages/types
COPY apps/web/package*.json ./apps/web/
RUN cd apps/web && npm ci
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN cd apps/web && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json ./package.json
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
```

`NEXT_PUBLIC_API_BASE_URL` is a build-time env var in Next.js (baked into the JS bundle). It must be passed as a Docker `--build-arg` at image build time, not at container startup. This is handled automatically by the GitHub Actions workflow in Phase 3.

---

### Phase 2 — AWS Secrets Setup (You do this)

**Time estimate:** 30–45 minutes  
**Who:** You in AWS Console  
**Prerequisites:** AWS account access, have `.env.staging` and `.env.production` open

All secrets from your local env files go into **AWS Secrets Manager** under two path prefixes:

| Path prefix | Maps from |
|-------------|-----------|
| `/darci/staging/` | `.env.staging` |
| `/darci/production/` | `.env.production` |

**How to do it:**

1. Go to **AWS Secrets Manager** → **Store a new secret**
2. Choose **Other type of secret**
3. Add each key/value pair from your `.env.staging` file
4. Name the secret `/darci/staging/app`
5. Repeat for `.env.production` → name it `/darci/production/app`

**Required keys for each environment** (from `.env.example`):

```
NODE_ENV
PORT
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
DATABASE_URL
REDIS_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RESEND_API_KEY
RESEND_WEBHOOK_SECRET
SENTRY_DSN
NOTIFICATION_PROVIDER
CORS_ALLOWED_ORIGINS       ← new (from Phase 0 fix)
```

**`CORS_ALLOWED_ORIGINS` values to set:**

- Staging: `https://app.staging.darci.app`  
- Production: `https://app.darci.app`

(Use your actual domain once set up in Phase 4.)

> ⚠️ After secrets are in AWS, the `.env.staging` and `.env.production` files on your local machine continue working normally for local dev. They are already gitignored and won't be deployed.

---

### Phase 3 — ECR Repositories (Complete)

**Time estimate:** 15 minutes  
**Who:** Agent writes; you run one CLI command

Create three ECR repositories. This is a one-time setup. The staging repositories have been created in `us-east-1`:

- `427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-api`
- `427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-worker`
- `427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-web`

Enable image scanning and tag immutability for production repos.

---

### Phase 4 — ECS Fargate Infrastructure (Complete for staging)

**Who:** Agent executed via AWS CLI for staging

**Resources to provision per environment** (staging and production run the same template, parameterized by environment name):

#### Networking
- VPC with public + private subnets (2 AZs minimum)
- Internet Gateway + NAT Gateway
- Security groups for ALB, ECS tasks, ElastiCache

#### Compute
- ECS Fargate cluster (one cluster, separate services per env)
- **API service:** 1 task (0.5 vCPU / 1 GB), port 4000, ALB target group
- **Worker service:** 1 task (0.5 vCPU / 512 MB), no inbound port, no ALB attachment
- **Web service:** 1 task (0.5 vCPU / 1 GB), port 3000, ALB target group

#### Load balancing
- Application Load Balancer (shared across staging services, separate for production)
- HTTPS listener (ACM cert) + HTTP → HTTPS redirect
- Target groups: API on `/` path for `api.` subdomain, Web on `/` path for `app.` subdomain

#### Cache
- ElastiCache Serverless (Redis) — one per environment
- Private subnet, security group allowing only from ECS tasks

#### Secrets injection into ECS
- ECS task definitions reference Secrets Manager via `secrets:` block
- No secrets stored in task definition plaintext or in container env files
- IAM task execution role granted `secretsmanager:GetSecretValue` on `/darci/{env}/*`

#### Task definition pattern
```json
{
  "secrets": [
    { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:...:darci/staging/app:DATABASE_URL::" },
    { "name": "REDIS_URL", "valueFrom": "arn:aws:secretsmanager:...:darci/staging/app:REDIS_URL::" }
  ]
}
```

Note: `REDIS_URL` points to the ElastiCache endpoint provisioned in this phase.

---

### Phase 5 — CI/CD Pipeline (Agent can do)

**Time estimate:** 1 hour  
**Who:** Agent writes `.github/workflows/deploy.yml`; you add AWS credentials to GitHub secrets

**GitHub Secrets needed (you add these once):**
- `AWS_ACCOUNT_ID`
- `AWS_REGION` (e.g. `us-east-1`)
- `STAGING_NEXT_PUBLIC_API_BASE_URL` (e.g. `https://api.staging.darci.app`)
- `PROD_NEXT_PUBLIC_API_BASE_URL` (e.g. `https://api.darci.app`)

Authentication uses **GitHub OIDC → AWS IAM Role** — no static AWS access keys stored in GitHub. The agent will provide the IAM role trust policy.

**Deploy workflow logic:**

```
On push to main:
  1. Build all 3 Docker images
  2. Push to ECR (tagged with git SHA + "staging-latest")
  3. Update STAGING ECS services (force new deployment)
  4. Wait for services to stabilize

On push of tag matching v*.*.* :
  1. Pull the staging images already built for that commit
  2. Retag as production
  3. Manual approval gate (GitHub Environment protection rule)
  4. Update PRODUCTION ECS services
```

This means production deploys the **exact same image** that ran in staging — no separate production build.

**Also fixes the existing CI bug:** `working-directory: web` → `working-directory: apps/web` in `.github/workflows/ci.yml`.

---

### Phase 6 — DNS & TLS (You do this)

**Time estimate:** 30 minutes (+ propagation time)  
**Who:** You in Route53 + ACM

1. **Request ACM certificate** for `*.staging.darci.app` and `*.darci.app` (wildcard covers all subdomains)
2. **Validate via DNS** — ACM provides CNAME records to add to Route53
3. **Create Route53 A records** pointing to ALB:
   - `api.staging.darci.app` → ALB DNS name (staging)
   - `app.staging.darci.app` → ALB DNS name (staging)
   - `api.darci.app` → ALB DNS name (production)
   - `app.darci.app` → ALB DNS name (production)
4. Update `CORS_ALLOWED_ORIGINS` in Secrets Manager once real domains are known

---

### Phase 7 — Resend Webhook Activation (You do this)

**Time estimate:** 5 minutes  
**Who:** You in Resend dashboard  
**Prerequisites:** Phase 6 complete (staging API has a public HTTPS URL)

1. Go to Resend dashboard → **Webhooks** → **Add endpoint**
2. URL: `https://api.staging.darci.app/webhooks/resend`
3. Subscribe to events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.complained`, `email.bounced`, `email.opened`, `email.clicked`
4. Copy the **signing secret** Resend provides
5. Update `RESEND_WEBHOOK_SECRET` in Secrets Manager (`/darci/staging/app`) with this value
6. Force a new ECS deployment so the task picks up the new secret:
   ```
   aws ecs update-service --cluster darci --service darci-api-staging --force-new-deployment
   ```
7. Repeat (separate webhook endpoint + secret) for production when ready

---

## Execution Plan Summary

| Phase | Who | Blocking? | Estimated Time |
|-------|-----|-----------|----------------|
| 0 — CORS fix | Agent | Yes — must be first | 10 min |
| 1 — Dockerfiles | Agent | Yes — needed for all container phases | 1–2 hrs |
| 2 — Secrets Manager | **You** | Yes — needed before ECS can start | 30–45 min |
| 3 — ECR repos | Agent / Console | Yes — needed before first push | 15 min |
| 4 — ECS infrastructure | Agent (IaC) | Yes — core infrastructure | 2–3 hrs |
| 5 — CI/CD pipeline | Agent | No — can deploy manually first | 1 hr |
| 6 — DNS & TLS | **You** | No — can use ALB DNS directly at first | 30 min |
| 7 — Resend webhook | **You** | No — existing features work without it | 5 min |

**Minimum viable path to a live staging environment:**
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → manually push images → staging is live.
CI/CD (Phase 5) and custom domain (Phase 6) can follow immediately after.

---

## Phases the Agent Can Execute

- **Phase 0** — CORS fix (single file edit)
- **Phase 1** — all three Dockerfiles + `.dockerignore` files
- **Phase 3** — CloudFormation stack for ECR repos
- **Phase 4** — CloudFormation or CDK stack for full ECS infrastructure
- **Phase 5** — GitHub Actions deploy workflow + CI bug fix

**Ready to start with Phase 0 and Phase 1?** Say "go" and the agent will implement them sequentially.
