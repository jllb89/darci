# syntax=docker/dockerfile:1
# Build context: repo root (docker build -f apps/web/Dockerfile .)
#
# NEXT_PUBLIC_API_BASE_URL is baked into the JS bundle at build time.
# Pass it as a build argument:
#   docker build --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.staging.darci.app \
#                -f apps/web/Dockerfile .

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY apps/web/package*.json ./
RUN npm ci

COPY apps/web ./
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# next start needs the standalone output or the full .next + node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]
