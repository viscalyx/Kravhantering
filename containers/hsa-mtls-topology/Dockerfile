# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /test
COPY containers/hsa-mtls-topology/topology-test.mjs ./topology-test.mjs
USER node
CMD ["node", "topology-test.mjs"]
