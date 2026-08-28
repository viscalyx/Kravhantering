# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600 AS dependencies

ENV NODE_ENV=production
WORKDIR /app

COPY containers/hsa-directory-mock/package.json containers/hsa-directory-mock/package-lock.json containers/hsa-directory-mock/.npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-trixie-slim@sha256:a747ad80c8a161b650d79a6da9c422005b91148b18b8d2c669eb5a0b7c07e600

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
WORKDIR /app/containers/hsa-directory-mock

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node containers/hsa-directory-mock/package.json ./
COPY --chown=node:node containers/hsa-directory-mock/fixtures ./fixtures
COPY --chown=node:node containers/hsa-directory-mock/src ./src
COPY --chown=node:node lib/hsa/strict-certificate-validation.mjs /app/lib/hsa/strict-certificate-validation.mjs

USER node
EXPOSE 8443
CMD ["node", "src/strict-server.mjs"]
