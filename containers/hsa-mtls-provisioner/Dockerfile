# syntax=docker/dockerfile:1.7

ARG HSA_TOOLCHAIN_BASE_IMAGE=registry.access.redhat.com/ubi10/nodejs-24-minimal
ARG HSA_TOOLCHAIN_BASE_TAG=latest
ARG HSA_TOOLCHAIN_BASE_DIGEST=sha256:f0e6f6fa5bd82741bdf9b304341c94bbac4268a7f94d710c26eac01f20528c2b

FROM ${HSA_TOOLCHAIN_BASE_IMAGE}:${HSA_TOOLCHAIN_BASE_TAG}@${HSA_TOOLCHAIN_BASE_DIGEST}

# Final-image identity; base component provenance and notices remain inherited.
LABEL name="kravhantering/hsa-mtls-provisioner" \
  vendor="Viscalyx" \
  maintainer="https://github.com/viscalyx/Kravhantering" \
  url="https://github.com/viscalyx/Kravhantering" \
  help="https://github.com/viscalyx/Kravhantering/tree/main/containers" \
  summary="Kravhantering HSA test-PKI provisioner" \
  description="Kravhantering HSA test-PKI provisioner" \
  io.k8s.display-name="Kravhantering HSA test-PKI provisioner" \
  io.k8s.description="Kravhantering HSA test-PKI provisioner" \
  version="" release="" build-date="" vcs-ref="" vcs-type="" \
  org.opencontainers.image.created="" \
  org.opencontainers.image.revision="" \
  io.openshift.expose-services="" \
  io.openshift.tags="nodejs,runtime" \
  io.openshift.s2i.scripts-url="" io.s2i.scripts-url="" \
  com.redhat.deployments-dir="" com.redhat.dev-mode="" com.redhat.dev-mode.port=""

ARG HSA_TOOLCHAIN_BASE_IMAGE
ARG HSA_TOOLCHAIN_BASE_TAG
ARG HSA_TOOLCHAIN_BASE_DIGEST
ARG NODE_MAJOR=24
ARG OPENSSL_VERSION=3.5.8-1.el10_2
ARG CA_CERTIFICATES_VERSION=2025.2.80_v9.0.305-102.el10_1

USER 0:0
ENV HOME=/root

RUN --mount=type=bind,source=containers/node,target=/tmp/ubi-compat \
  --mount=type=bind,source=LICENSE,target=/tmp/kravhantering-LICENSE \
  microdnf --disablerepo='*' --enablerepo=ubi-10-baseos-rpms install -y \
    "ca-certificates-${CA_CERTIFICATES_VERSION}" \
    "openssl-${OPENSSL_VERSION}" \
    "openssl-libs-${OPENSSL_VERSION}" \
  && microdnf clean all \
  && sh /tmp/ubi-compat/ubi-compat.sh

COPY containers/hsa-mtls-provisioner/toolchain.lock.json /tmp/toolchain.lock.json
COPY containers/hsa-mtls-provisioner/toolchain /tmp/toolchain-verifier

RUN HSA_TOOLCHAIN_BASE_IMAGE="${HSA_TOOLCHAIN_BASE_IMAGE}" \
    HSA_TOOLCHAIN_BASE_TAG="${HSA_TOOLCHAIN_BASE_TAG}" \
    HSA_TOOLCHAIN_BASE_DIGEST="${HSA_TOOLCHAIN_BASE_DIGEST}" \
    HSA_TOOLCHAIN_NODE_VERSION="${NODE_MAJOR}" \
    HSA_TOOLCHAIN_OPENSSL_VERSION="${OPENSSL_VERSION}" \
    HSA_TOOLCHAIN_CA_CERTIFICATES_VERSION="${CA_CERTIFICATES_VERSION}" \
    node /tmp/toolchain-verifier/verify-toolchain-lock.mjs \
      /tmp/toolchain.lock.json \
  && rm -rf /tmp/toolchain-verifier /tmp/toolchain.lock.json

LABEL se.kravhantering.hsa-provisioner.node-major="${NODE_MAJOR}" \
  se.kravhantering.hsa-provisioner.openssl-package="${OPENSSL_VERSION}" \
  se.kravhantering.hsa-provisioner.ca-certificates-package="${CA_CERTIFICATES_VERSION}"

WORKDIR /opt/kravhantering/hsa-mtls-provisioner

COPY containers/hsa-mtls-provisioner/package.json ./
COPY containers/hsa-mtls-provisioner/src ./src
COPY containers/hsa-mtls/certificate-profile.json \
  /opt/kravhantering/hsa-mtls/certificate-profile.json

USER 0:0

ENTRYPOINT ["node", "src/cli.mjs"]
CMD ["ensure"]
