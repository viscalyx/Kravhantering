# App Container Contract

This directory owns the runtime contract for the Next.js application
container and the Dockerfile used to build the app runtime and database-job
production images.

## Owned Configuration

- Application runtime environment variables.
- Public example values in `.env.app.example`.
- `Dockerfile` and `Dockerfile.dockerignore` for production image builds.

The application image must not bake in `.env` files, certificates,
Playwright configuration, Compose files, or other environment-specific
runtime data. Runtime configuration must be passed through env vars or mounted
files at startup.

## Build Targets

The Dockerfile is built from the repository root as context:

```bash
npm run container:build:app-runtime
npm run container:build:db-job
```

Use the no-cache variants when dependency or base-image cache reuse needs to
be bypassed:

```bash
npm run container:build:app-runtime:no-cache
npm run container:build:db-job:no-cache
```

The app build stage sets `NEXT_PUBLIC_SITE_URL` to
`http://localhost:3000` by default so local image builds do not depend on a
developer `.env` file. Pass `--build-arg NEXT_PUBLIC_SITE_URL=<origin>` when
building a deployable image for another origin.

`app-runtime` is the long-running Next.js image. It is based on
`output: "standalone"` and only copies `.next/standalone`, `.next/static`, and
`public` into the final runtime stage. The stage runs as the non-root `node`
user and starts `node server.js` on port `3000`.

`db-job` is built from the same Dockerfile for release consistency, but it is
documented in [../db-job/README.md](../db-job/README.md) because it has a
separate runtime contract.

The Node base image is pinned directly in the Dockerfile with both tag and
digest. Update the tag and digest together in a pull request, then rebuild both
targets locally.

## Docker Tooling

<!-- cSpell:ignore buildx keyrings dearmor dpkg VERSION_CODENAME fsSL -->

The devcontainer installs Docker CLI, Docker Compose v2, and Buildx through
Docker outside-of-Docker. Rebuild the devcontainer after changes to
`.devcontainer/devcontainer.json` or
`.devcontainer/elevated/devcontainer.json`, then verify:

```bash
docker --version
docker buildx version
docker info
docker buildx ls
```

If the current container was created before Docker tooling was added, install
the tools manually inside the devcontainer:

<!-- markdownlint-disable MD013 -->
```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce-cli docker-buildx-plugin docker-compose-plugin
docker --version
docker buildx version
docker info
docker buildx ls
```
<!-- markdownlint-enable MD013 -->

If `docker info` cannot reach a daemon after the CLI is installed, rebuild the
devcontainer with the host Docker socket available or run the image build
commands from a host shell with Docker Desktop or Docker Engine running.

## Environment Variables

Required application values:

- `NEXT_PUBLIC_SITE_URL` is the public HTTPS origin.
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` select the
  SQL Server database.
- `DB_ENCRYPT` and `DB_TRUST_SERVER_CERTIFICATE` configure the SQL Server TLS
  connection.
- `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`, and
  `AUTH_OIDC_ISSUER_URL` configure OIDC discovery and token exchange.
- `AUTH_OIDC_REDIRECT_URI` and `AUTH_OIDC_POST_LOGOUT_REDIRECT_URI` must
  match the Keycloak realm imported for the stack.
- `AUTH_SESSION_COOKIE_PASSWORD` must be at least 32 characters.

Optional application values:

- `BUILD_VERSION`, `BUILD_COMMIT_SHA`, `BUILD_TIME`, and `BUILD_IMAGE_TAG`
  populate generated public build metadata before `next build`.
- `AUTH_OIDC_API_AUDIENCE` configures token audiences for MCP traffic.
- `MCP_CLIENT_ID` selects the local MCP service-account client for token
  helper scripts.
- `AUTH_OIDC_ROLES_CLAIM`, `AUTH_OIDC_SCOPES`,
  `AUTH_SESSION_COOKIE_NAME`, and `AUTH_SESSION_TTL_SECONDS` override
  defaults.
- `OPENROUTER_API_KEY`, `OPENROUTER_MGMT_API_KEY`, and
  `NEXT_PUBLIC_DEFAULT_MODEL` enable optional AI integrations.

## Sensitive Values

These values are sensitive outside local demo and smoke-test contexts:

- `DB_PASSWORD`
- `AUTH_OIDC_CLIENT_SECRET`
- `AUTH_SESSION_COOKIE_PASSWORD`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MGMT_API_KEY`

The example file contains public demo values only. Treat them as unsafe for
any exposed environment.

## Update Rules

- Keep app-only env vars in this directory; do not introduce a shared env
  file for multiple containers.
- If a value is also needed by another container, duplicate it in that
  container's own env contract during generation or startup.
- Use `.env.app.local` for local secrets. It matches the existing
  `.env.*.local` Git ignore pattern.
- When the application runtime contract changes, update this README and
  `.env.app.example` together.
