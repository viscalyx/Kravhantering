# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486 AS dependencies

ENV NODE_ENV=production
WORKDIR /app

COPY containers/hsa-person-lookup-adapter/package.json containers/hsa-person-lookup-adapter/package-lock.json containers/hsa-person-lookup-adapter/.npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-trixie-slim@sha256:f2925910482dc53394bc0034c5f4abffcd01de400794c050ca343fe0d733b486

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
WORKDIR /app/containers/hsa-person-lookup-adapter

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node containers/hsa-person-lookup-adapter/package.json ./
COPY --chown=node:node containers/hsa-person-lookup-adapter/src ./src
COPY --chown=node:node lib/hsa/strict-certificate-validation.mjs /app/lib/hsa/strict-certificate-validation.mjs

USER node
EXPOSE 8443
CMD ["node", "src/strict-server.mjs"]
