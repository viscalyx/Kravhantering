# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:10c950bed4f33b3cedac92b6a46a14f18b8bf4bed18affbf86c871d9bc0d0a91 AS dependencies

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace

COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci

FROM dependencies AS transient-cleanup-build

COPY tsconfig.json tsconfig.transient-cleanup.json ./
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

FROM node:24-trixie-slim@sha256:10c950bed4f33b3cedac92b6a46a14f18b8bf4bed18affbf86c871d9bc0d0a91 AS db-job-dependencies

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

FROM node:24-trixie-slim@sha256:10c950bed4f33b3cedac92b6a46a14f18b8bf4bed18affbf86c871d9bc0d0a91 AS app-runtime

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=app-build --chown=node:node /workspace/.next/standalone ./
COPY --from=app-build --chown=node:node /workspace/.next/static ./.next/static
COPY --from=app-build --chown=node:node /workspace/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM node:24-trixie-slim@sha256:10c950bed4f33b3cedac92b6a46a14f18b8bf4bed18affbf86c871d9bc0d0a91 AS db-job

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV KRAVHANTERING_DB_ADMIN_IMAGE=db-job

WORKDIR /workspace

COPY --from=db-job-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/db-sqlserver-admin.mjs ./scripts/db-sqlserver-admin.mjs
COPY --from=transient-cleanup-build --chown=node:node /workspace/.build/transient-cleanup ./transient-cleanup
COPY --chown=node:node typeorm/migrations ./typeorm/migrations
COPY --chown=node:node typeorm/runtime-permission-manifest.mjs ./typeorm/runtime-permission-manifest.mjs
COPY --chown=node:node typeorm/seed-required.mjs ./typeorm/seed-required.mjs
COPY --chown=node:node typeorm/ai-safety-seed-data.mjs ./typeorm/ai-safety-seed-data.mjs
COPY --chown=node:node typeorm/seed-runner.mjs ./typeorm/seed-runner.mjs

USER node
ENTRYPOINT ["node", "scripts/db-sqlserver-admin.mjs"]
CMD ["health"]

FROM node:24-trixie-slim@sha256:10c950bed4f33b3cedac92b6a46a14f18b8bf4bed18affbf86c871d9bc0d0a91 AS demo-seed

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV KRAVHANTERING_DB_ADMIN_IMAGE=demo-seed

WORKDIR /workspace

COPY --from=db-job-dependencies --chown=node:node /workspace/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node scripts/db-sqlserver-admin.mjs ./scripts/db-sqlserver-admin.mjs
COPY --chown=node:node typeorm/migrations ./typeorm/migrations
COPY --chown=node:node typeorm/runtime-permission-manifest.mjs ./typeorm/runtime-permission-manifest.mjs
COPY --chown=node:node typeorm/seed-required.mjs ./typeorm/seed-required.mjs
COPY --chown=node:node typeorm/ai-safety-seed-data.mjs ./typeorm/ai-safety-seed-data.mjs
COPY --chown=node:node typeorm/seed-runner.mjs ./typeorm/seed-runner.mjs
COPY --chown=node:node typeorm/seed.mjs ./typeorm/seed.mjs
COPY --chown=node:node typeorm/seed-dogfood.mjs ./typeorm/seed-dogfood.mjs
COPY --chown=node:node typeorm/seed-dogfood-build.mjs ./typeorm/seed-dogfood-build.mjs
COPY --chown=node:node typeorm/seed-playwright-manual-cases-build.mjs ./typeorm/seed-playwright-manual-cases-build.mjs
COPY --chown=node:node typeorm/seed-archiving-retention-build.mjs ./typeorm/seed-archiving-retention-build.mjs

USER node
ENTRYPOINT ["node", "scripts/db-sqlserver-admin.mjs"]
CMD ["seed:demo"]
