# syntax=docker/dockerfile:1.7

ARG UBI_BUILDER_IMAGE=registry.access.redhat.com/ubi10/nodejs-24:latest@sha256:dfc3e9630807d07cf21af3251c42bc1c26816f80b8feff8f300a01f61b15b8c4
ARG UBI_RUNTIME_IMAGE=registry.access.redhat.com/ubi10/nodejs-24-minimal:latest@sha256:c2e4d56d102ebb99edaaeee9d4a17d4ebda67ecc192af57f12752b265e7a67a6

FROM ${UBI_BUILDER_IMAGE} AS dependencies

USER 0:0
ENTRYPOINT []
ENV HOME=/root
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV NPM_CONFIG_PREFIX=/usr/local

ENV NODE_ENV=production
WORKDIR /app

COPY containers/hsa-directory-mock/package.json containers/hsa-directory-mock/package-lock.json containers/hsa-directory-mock/.npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM ${UBI_RUNTIME_IMAGE}

# Final-image identity; base component provenance and notices remain inherited.
LABEL name="kravhantering/hsa-directory-mock" \
  vendor="Viscalyx" \
  maintainer="https://github.com/viscalyx/Kravhantering" \
  url="https://github.com/viscalyx/Kravhantering" \
  help="https://github.com/viscalyx/Kravhantering/tree/main/containers" \
  summary="Kravhantering HSA directory mock" \
  description="Kravhantering HSA directory mock" \
  io.k8s.display-name="Kravhantering HSA directory mock" \
  io.k8s.description="Kravhantering HSA directory mock" \
  version="" release="" build-date="" vcs-ref="" vcs-type="" \
  org.opencontainers.image.created="" \
  org.opencontainers.image.revision="" \
  io.openshift.expose-services="8443:https" \
  io.openshift.tags="nodejs,runtime" \
  io.openshift.s2i.scripts-url="" io.s2i.scripts-url="" \
  com.redhat.deployments-dir="" com.redhat.dev-mode="" com.redhat.dev-mode.port=""

USER 0:0
ENTRYPOINT []
ENV HOME=/home/node
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV NPM_CONFIG_PREFIX=/usr/local
RUN --mount=type=bind,source=containers/node,target=/tmp/ubi-compat \
  --mount=type=bind,source=LICENSE,target=/tmp/kravhantering-LICENSE \
  sh /tmp/ubi-compat/ubi-compat.sh

ENV NODE_ENV=production
WORKDIR /app/containers/hsa-directory-mock

COPY --from=dependencies --chown=1000:1000 /app/node_modules ./node_modules
COPY --chown=1000:1000 containers/hsa-directory-mock/package.json ./
COPY --chown=1000:1000 containers/hsa-directory-mock/fixtures ./fixtures
COPY --chown=1000:1000 containers/hsa-directory-mock/src ./src
COPY --chown=1000:1000 lib/hsa/strict-certificate-validation.mjs /app/lib/hsa/strict-certificate-validation.mjs

USER 1000:1000
EXPOSE 8443
CMD ["node", "src/strict-server.mjs"]
