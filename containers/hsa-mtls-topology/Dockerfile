# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486 AS builder

WORKDIR /build
COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')" \
  && npm ci --ignore-scripts --no-audit --no-fund
COPY lib ./lib
RUN npx esbuild lib/hsa/strict-person-lookup.ts --bundle --format=esm --platform=node \
  --target=node24 --alias:@=/build --outfile=/tmp/strict-person-lookup.mjs

FROM node:24-trixie-slim@sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /test
COPY containers/hsa-mtls-topology/topology-test.mjs ./topology-test.mjs
COPY containers/hsa-mtls-topology/wrong-server-decoy.mjs ./wrong-server-decoy.mjs
COPY --from=builder /tmp/strict-person-lookup.mjs ./strict-person-lookup.mjs
USER node
CMD ["node", "topology-test.mjs"]
