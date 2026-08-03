# syntax=docker/dockerfile:1.7

FROM node:24-trixie-slim@sha256:10c950bed4f33b3cedac92b6a46a14f18b8bf4bed18affbf86c871d9bc0d0a91 AS dependencies

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm install --global "npm@$(node -p 'require("./package.json").packageManager.slice(4)')"
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:24-trixie-slim@sha256:10c950bed4f33b3cedac92b6a46a14f18b8bf4bed18affbf86c871d9bc0d0a91

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

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
