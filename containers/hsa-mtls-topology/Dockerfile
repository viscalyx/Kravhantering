# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600 AS builder

WORKDIR /build
COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')" \
  && npm ci --ignore-scripts --no-audit --no-fund
COPY lib ./lib
RUN npx esbuild lib/hsa/strict-person-lookup.ts --bundle --format=esm --platform=node \
  --target=node24 --alias:@=/build --outfile=/tmp/strict-person-lookup.mjs

FROM node:24-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /test
COPY containers/hsa-mtls-topology/topology-test.mjs ./topology-test.mjs
COPY containers/hsa-mtls-topology/wrong-server-decoy.mjs ./wrong-server-decoy.mjs
COPY --from=builder /tmp/strict-person-lookup.mjs ./strict-person-lookup.mjs
USER node
CMD ["node", "topology-test.mjs"]
