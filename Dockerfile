# syntax=docker/dockerfile:1
# Multi-stage build: installs deps, builds Next.js in standalone mode, and ships a small
# runtime image that applies SQLite migrations on start (scripts/migrate.mjs) and serves.

# Debian-based image: better-sqlite3 has prebuilt glibc binaries, so no native compile is needed.
FROM node:24-slim AS deps
WORKDIR /app
# Toolchain only as a fallback in case a prebuilt binary is unavailable for this Node version.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# `postinstall` runs `prisma generate`, which needs the config to resolve (URL is only read by migrate).
ENV DATABASE_URL="file:/data/vaultly.db"
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 DATABASE_URL="file:/data/vaultly.db"
RUN npm run build

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# SQLite file and local uploads live on a volume mounted at /data
ENV DATABASE_URL="file:/data/vaultly.db" LOCAL_UPLOAD_DIR="/data/uploads"
RUN groupadd --system app && useradd --system --gid app --home /app app && mkdir -p /data && chown app:app /data
# Standalone output = server.js + only the node_modules the server actually imports
# (including better-sqlite3 and the Prisma client runtime).
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Migration SQL + the lightweight runner (uses the traced better-sqlite3 above).
COPY --from=build --chown=app:app /app/prisma/migrations ./prisma/migrations
COPY --from=build --chown=app:app /app/scripts/migrate.mjs ./scripts/migrate.mjs
USER app
VOLUME ["/data"]
EXPOSE 3000
# Apply migrations on start, then serve.
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
