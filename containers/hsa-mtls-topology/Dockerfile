# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486 AS builder

WORKDIR /build
COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')" \
  && npm ci --ignore-scripts --no-audit --no-fund
COPY lib ./lib
COPY containers/hsa-mtls-topology/app-probe.ts ./app-probe.ts
RUN npx esbuild app-probe.ts --bundle --format=esm --platform=node \
  --target=node24 --alias:@=/build --outfile=/tmp/app-probe.mjs

FROM node:24-trixie-slim@sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /test
COPY containers/hsa-mtls-topology/topology-test.mjs ./topology-test.mjs
COPY --from=builder /tmp/app-probe.mjs ./app-probe.mjs
USER node
CMD ["node", "topology-test.mjs"]
