# syntax=docker/dockerfile:1.7

FROM registry.access.redhat.com/ubi10/nodejs-24:latest@sha256:5295d1fd8e46aebad1e9da107c62bc4a5cfe8bca5fd1175a7b0a523fa977866a AS builder

USER 0:0
ENTRYPOINT []
ENV HOME=/root
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV NPM_CONFIG_PREFIX=/usr/local

WORKDIR /build
COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund
COPY lib ./lib
RUN npx esbuild lib/hsa/strict-person-lookup.ts --bundle --format=esm --platform=node \
  --target=node24 --alias:@=/build --outfile=/tmp/strict-person-lookup.mjs

FROM registry.access.redhat.com/ubi10/nodejs-24-minimal:latest@sha256:c2e4d56d102ebb99edaaeee9d4a17d4ebda67ecc192af57f12752b265e7a67a6

USER 0:0
ENTRYPOINT []
ENV HOME=/home/node
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV NPM_CONFIG_PREFIX=/usr/local
RUN --mount=type=bind,source=containers/node,target=/tmp/ubi-compat \
  --mount=type=bind,source=LICENSE,target=/tmp/kravhantering-LICENSE \
  sh /tmp/ubi-compat/ubi-compat.sh

WORKDIR /test
COPY containers/hsa-mtls-topology/topology-test.mjs ./topology-test.mjs
COPY containers/hsa-mtls-topology/wrong-server-decoy.mjs ./wrong-server-decoy.mjs
COPY --from=builder /tmp/strict-person-lookup.mjs ./strict-person-lookup.mjs
USER 1000:1000
CMD ["node", "topology-test.mjs"]
