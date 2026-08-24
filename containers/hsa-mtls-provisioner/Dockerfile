# syntax=docker/dockerfile:1.7

ARG HSA_TOOLCHAIN_BASE_IMAGE=docker.io/library/node
ARG HSA_TOOLCHAIN_BASE_TAG=24-trixie-slim
ARG HSA_TOOLCHAIN_BASE_DIGEST=sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486

FROM ${HSA_TOOLCHAIN_BASE_IMAGE}:${HSA_TOOLCHAIN_BASE_TAG}@${HSA_TOOLCHAIN_BASE_DIGEST}

ARG HSA_TOOLCHAIN_BASE_IMAGE
ARG HSA_TOOLCHAIN_BASE_TAG
ARG HSA_TOOLCHAIN_BASE_DIGEST
ARG NODE_VERSION=24
ARG OPENSSL_VERSION=3.5.6-1~deb13u2
ARG CA_CERTIFICATES_VERSION=20250419

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    "ca-certificates=${CA_CERTIFICATES_VERSION}" \
    "openssl=${OPENSSL_VERSION}" \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY containers/hsa-mtls-provisioner/toolchain.lock.json /tmp/toolchain.lock.json
COPY containers/hsa-mtls-provisioner/toolchain /tmp/toolchain-verifier

RUN HSA_TOOLCHAIN_BASE_IMAGE="${HSA_TOOLCHAIN_BASE_IMAGE}" \
    HSA_TOOLCHAIN_BASE_TAG="${HSA_TOOLCHAIN_BASE_TAG}" \
    HSA_TOOLCHAIN_BASE_DIGEST="${HSA_TOOLCHAIN_BASE_DIGEST}" \
    HSA_TOOLCHAIN_NODE_VERSION="${NODE_VERSION}" \
    HSA_TOOLCHAIN_OPENSSL_VERSION="${OPENSSL_VERSION}" \
    HSA_TOOLCHAIN_CA_CERTIFICATES_VERSION="${CA_CERTIFICATES_VERSION}" \
    node /tmp/toolchain-verifier/verify-toolchain-lock.mjs \
      /tmp/toolchain.lock.json \
  && rm -rf /tmp/toolchain-verifier /tmp/toolchain.lock.json

LABEL se.kravhantering.hsa-provisioner.node-major="${NODE_VERSION}" \
  se.kravhantering.hsa-provisioner.openssl-package="${OPENSSL_VERSION}" \
  se.kravhantering.hsa-provisioner.ca-certificates-package="${CA_CERTIFICATES_VERSION}"

WORKDIR /opt/kravhantering/hsa-mtls-provisioner

COPY containers/hsa-mtls-provisioner/package.json ./
COPY containers/hsa-mtls-provisioner/src ./src
COPY containers/hsa-mtls/certificate-profile.json \
  /opt/kravhantering/hsa-mtls/certificate-profile.json

ENTRYPOINT ["node", "src/cli.mjs"]
CMD ["ensure"]
