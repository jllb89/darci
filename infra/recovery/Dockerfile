# Build context: repository root. Only the explicit recovery files are copied.
FROM node:24-alpine AS dependencies
WORKDIR /app
COPY infra/recovery/package*.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM node:24-alpine
RUN apk upgrade --no-cache && apk add --no-cache aws-cli postgresql17-client ca-certificates \
    && npm uninstall --global npm \
    && mkdir /work && chown node:node /work
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY backend/scripts/recovery-snapshot.mjs ./backend/scripts/recovery-snapshot.mjs
COPY infra/recovery/supabase-ca.crt ./infra/recovery/supabase-ca.crt
ENV NODE_ENV=production AWS_PAGER="" TMPDIR=/work
USER node
VOLUME ["/work"]
ENTRYPOINT ["timeout", "-s", "TERM", "2700", "node", "backend/scripts/recovery-snapshot.mjs"]
CMD ["backup", "--task-role=true", "--session-pooler=true", "--pg-bin=/usr/bin", "--ca-file=/app/infra/recovery/supabase-ca.crt"]
