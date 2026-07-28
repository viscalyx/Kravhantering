# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim@sha256:d45d78e7929b46875bbd4e29bea672d5bc48186c6c3588306521c815e78352d6 AS dependencies

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-bookworm-slim@sha256:d45d78e7929b46875bbd4e29bea672d5bc48186c6c3588306521c815e78352d6

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node fixtures ./fixtures
COPY --chown=node:node src ./src

USER node
EXPOSE 8080
CMD ["node", "src/server.mjs"]
