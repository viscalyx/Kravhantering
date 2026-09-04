# syntax=docker/dockerfile:1.7

ARG UBI_BUILDER_IMAGE=registry.access.redhat.com/ubi10/nodejs-24:latest@sha256:5295d1fd8e46aebad1e9da107c62bc4a5cfe8bca5fd1175a7b0a523fa977866a
ARG UBI_RUNTIME_IMAGE=registry.access.redhat.com/ubi10/nodejs-24-minimal:latest@sha256:f0e6f6fa5bd82741bdf9b304341c94bbac4268a7f94d710c26eac01f20528c2b

FROM ${UBI_BUILDER_IMAGE} AS dependencies

USER 0
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace

COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci

FROM dependencies AS transient-cleanup-build

COPY tsconfig.json tsconfig.transient-cleanup.json ./
COPY lib/auth/audit.ts lib/auth/client-ip.ts ./lib/auth/
COPY lib/transient-cleanup ./lib/transient-cleanup
COPY lib/typeorm/sqlserver-config.ts ./lib/typeorm/sqlserver-config.ts
RUN npm run transient-cleanup:build

FROM dependencies AS app-build

ARG BUILD_COMMIT_SHA=unknown
ARG BUILD_EXPECTED_DATABASE_SCHEMA_VERSION=
ARG BUILD_IMAGE_TAG=local-container
ARG BUILD_TIME=
ARG BUILD_VERSION=0.1.0
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000

ENV BUILD_COMMIT_SHA=${BUILD_COMMIT_SHA}
ENV BUILD_EXPECTED_DATABASE_SCHEMA_VERSION=${BUILD_EXPECTED_DATABASE_SCHEMA_VERSION}
ENV BUILD_IMAGE_TAG=${BUILD_IMAGE_TAG}
ENV BUILD_TARGET=prod
ENV BUILD_TIME=${BUILD_TIME}
ENV BUILD_VERSION=${BUILD_VERSION}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NODE_ENV=production

COPY . .
RUN npm run build

FROM ${UBI_BUILDER_IMAGE} AS db-job-dependencies

USER 0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
WORKDIR /workspace

COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN <<'EOF'
set -eu
node <<'NODE'
const fs = require('node:fs')
const dbJobDependencies = ['mssql', 'reflect-metadata', 'typeorm']

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
packageJson.scripts = {}
packageJson.devDependencies = {}
packageJson.dependencies = Object.fromEntries(
  dbJobDependencies.map(name => [name, packageJson.dependencies[name]]),
)
fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`)

const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
packageLock.packages[''].dependencies = packageJson.dependencies
delete packageLock.packages[''].devDependencies
fs.writeFileSync('package-lock.json', `${JSON.stringify(packageLock, null, 2)}\n`)
NODE
npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund
EOF

FROM ${UBI_RUNTIME_IMAGE} AS runtime-base

USER 0
RUN printf '%s\n' 'node:x:1000:' >> /etc/group \
  && printf '%s\n' 'node:x:1000:1000:Node.js:/home/node:/bin/bash' >> /etc/passwd \
  && mkdir -p /home/node \
  && chown 1000:1000 /home/node \
  && rm -rf /usr/lib/node_modules_24/npm \
  && rm -f /usr/bin/npm /usr/bin/npx

ENV HOME=/home/node

FROM runtime-base AS app-runtime

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=app-build --chown=1000:1000 /workspace/.next/standalone ./
COPY --from=app-build --chown=1000:1000 /workspace/.next/static ./.next/static
COPY --from=app-build --chown=1000:1000 /workspace/public ./public
COPY --chown=1000:1000 containers/app/start-runtime.mjs ./start-runtime.mjs

USER 1000:1000
EXPOSE 3000
CMD ["node", "start-runtime.mjs"]

FROM runtime-base AS db-job

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV KRAVHANTERING_DB_ADMIN_IMAGE=db-job

WORKDIR /workspace

COPY --from=db-job-dependencies --chown=1000:1000 /workspace/node_modules ./node_modules
COPY --chown=1000:1000 package.json package-lock.json ./
COPY --chown=1000:1000 scripts/db-sqlserver-admin.mjs ./scripts/db-sqlserver-admin.mjs
COPY --chown=1000:1000 scripts/ai-provider-secret-maintenance.mjs ./scripts/ai-provider-secret-maintenance.mjs
COPY --chown=1000:1000 scripts/ai-provider-secret-restore-cli.mjs ./scripts/ai-provider-secret-restore-cli.mjs
COPY --chown=1000:1000 lib/ai/provider-secret-crypto-core.mjs ./lib/ai/provider-secret-crypto-core.mjs
COPY --from=transient-cleanup-build --chown=1000:1000 /workspace/.build/transient-cleanup ./transient-cleanup
COPY --chown=1000:1000 typeorm/migrations ./typeorm/migrations
COPY --chown=1000:1000 typeorm/runtime-permission-manifest.mjs ./typeorm/runtime-permission-manifest.mjs
COPY --chown=1000:1000 typeorm/seed-required.mjs ./typeorm/seed-required.mjs
COPY --chown=1000:1000 typeorm/ai-safety-seed-data.mjs ./typeorm/ai-safety-seed-data.mjs
COPY --chown=1000:1000 typeorm/seed-runner.mjs ./typeorm/seed-runner.mjs

USER 1000:1000
ENTRYPOINT ["node", "scripts/db-sqlserver-admin.mjs"]
CMD ["health"]

FROM runtime-base AS demo-seed

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV KRAVHANTERING_DB_ADMIN_IMAGE=demo-seed

WORKDIR /workspace

COPY --from=db-job-dependencies --chown=1000:1000 /workspace/node_modules ./node_modules
COPY --chown=1000:1000 package.json package-lock.json ./
COPY --chown=1000:1000 scripts/db-sqlserver-admin.mjs ./scripts/db-sqlserver-admin.mjs
COPY --chown=1000:1000 scripts/ai-provider-secret-maintenance.mjs ./scripts/ai-provider-secret-maintenance.mjs
COPY --chown=1000:1000 scripts/ai-provider-secret-restore-cli.mjs ./scripts/ai-provider-secret-restore-cli.mjs
COPY --chown=1000:1000 lib/ai/provider-secret-crypto-core.mjs ./lib/ai/provider-secret-crypto-core.mjs
COPY --chown=1000:1000 typeorm/migrations ./typeorm/migrations
COPY --chown=1000:1000 typeorm/runtime-permission-manifest.mjs ./typeorm/runtime-permission-manifest.mjs
COPY --chown=1000:1000 typeorm/seed-required.mjs ./typeorm/seed-required.mjs
COPY --chown=1000:1000 typeorm/ai-safety-seed-data.mjs ./typeorm/ai-safety-seed-data.mjs
COPY --chown=1000:1000 typeorm/seed-runner.mjs ./typeorm/seed-runner.mjs
COPY --chown=1000:1000 lib/mcp/import-validation-fingerprint.mjs ./lib/mcp/import-validation-fingerprint.mjs
COPY --chown=1000:1000 lib/requirements/responsibility-person-verification-fingerprint.mjs ./lib/requirements/responsibility-person-verification-fingerprint.mjs
COPY --chown=1000:1000 typeorm/seed.mjs ./typeorm/seed.mjs
COPY --chown=1000:1000 typeorm/seed-dogfood.mjs ./typeorm/seed-dogfood.mjs
COPY --chown=1000:1000 typeorm/seed-dogfood-build.mjs ./typeorm/seed-dogfood-build.mjs
COPY --chown=1000:1000 typeorm/seed-playwright-manual-cases-build.mjs ./typeorm/seed-playwright-manual-cases-build.mjs
COPY --chown=1000:1000 typeorm/seed-archiving-retention-build.mjs ./typeorm/seed-archiving-retention-build.mjs

USER 1000:1000
ENTRYPOINT ["node", "scripts/db-sqlserver-admin.mjs"]
CMD ["seed:demo"]
