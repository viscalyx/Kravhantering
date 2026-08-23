# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486

ARG OPENSSL_VERSION=3.5.6-1~deb13u2
ARG CA_CERTIFICATES_VERSION=20250419

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    "ca-certificates=${CA_CERTIFICATES_VERSION}" \
    "openssl=${OPENSSL_VERSION}" \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /opt/kravhantering/hsa-mtls-provisioner

COPY containers/hsa-mtls-provisioner/package.json ./
COPY containers/hsa-mtls-provisioner/src ./src
COPY containers/hsa-mtls/certificate-profile.json \
  /opt/kravhantering/hsa-mtls/certificate-profile.json

ENTRYPOINT ["node", "src/cli.mjs"]
CMD ["ensure"]
