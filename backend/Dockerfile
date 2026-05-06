# syntax=docker/dockerfile:1
# Build context: repo root (docker build -f backend/Dockerfile .)

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install packages/types first (referenced via file: link in backend)
COPY packages/types/package*.json ./packages/types/
RUN cd packages/types && npm ci
COPY packages/types ./packages/types
RUN cd packages/types && npm run build

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy source and compile
COPY backend ./backend
RUN cd backend && npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV SERVICE_NAME=api

# Copy compiled output and production node_modules
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./package.json

# Copy the OpenAPI spec for the runtime image.
COPY api/openapi.yaml ./api/openapi.yaml

# Copy template sources referenced by template_artifacts.artifact_metadata.localTemplatePath.
COPY docs /docs

EXPOSE 4000
CMD ["node", "dist/index.js"]
