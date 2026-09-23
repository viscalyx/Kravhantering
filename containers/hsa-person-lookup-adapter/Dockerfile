# syntax=docker/dockerfile:1.7

FROM registry.access.redhat.com/ubi10/nodejs-24:latest@sha256:fbb6ecf7772c98d84a3cb741e26a601682ae0e97bedcb56744db41ceb5ba60ab AS dependencies

USER 0:0
ENTRYPOINT []
ENV HOME=/root
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENV NPM_CONFIG_PREFIX=/usr/local

ENV NODE_ENV=production
WORKDIR /app

COPY containers/hsa-person-lookup-adapter/package.json containers/hsa-person-lookup-adapter/package-lock.json containers/hsa-person-lookup-adapter/.npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM registry.access.redhat.com/ubi10/nodejs-24-minimal:latest@sha256:bf6efa8c27f5cda1595bf86e1455a6d217c68cd8f386e8e167623250ace053eb

# Final-image identity; base component provenance and notices remain inherited.
LABEL name="kravhantering/hsa-person-lookup-adapter" \
  vendor="Viscalyx" \
  maintainer="https://github.com/viscalyx/Kravhantering" \
  url="https://github.com/viscalyx/Kravhantering" \
  help="https://github.com/viscalyx/Kravhantering/tree/main/containers" \
  summary="Kravhantering HSA person lookup adapter" \
  description="Kravhantering HSA person lookup adapter" \
  io.k8s.display-name="Kravhantering HSA person lookup adapter" \
  io.k8s.description="Kravhantering HSA person lookup adapter" \
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
WORKDIR /app/containers/hsa-person-lookup-adapter

COPY --from=dependencies --chown=1000:1000 /app/node_modules ./node_modules
COPY --chown=1000:1000 containers/hsa-person-lookup-adapter/package.json ./
COPY --chown=1000:1000 containers/hsa-person-lookup-adapter/src ./src
COPY --chown=1000:1000 lib/hsa/strict-certificate-validation.mjs /app/lib/hsa/strict-certificate-validation.mjs

USER 1000:1000
EXPOSE 8443
CMD ["node", "src/strict-server.mjs"]
