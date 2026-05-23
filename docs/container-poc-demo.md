# Container PoC and Demo

This page is the canonical runbook for a local PoC/demo of the container-based
stack. It uses the same production-like container flow as the release smoke
test, but with the demo profile and a stable SQL Server volume so data can
survive restarts.

The public example values in `containers/*/.env.*.example` and
`containers/keycloak/realm-kravhantering-test.json` are only for local demos
and smoke tests. Do not use them when the environment is reachable outside a
local or controlled test machine.

## Prerequisites

Run from the repository root on a host or devcontainer where Docker Buildx and
Podman Compose work:

```bash
docker --version
docker buildx version
podman --version
PODMAN_COMPOSE_PROVIDER=podman-compose podman compose version
podman info
```

The demo stack uses `https://kravhantering.test`. Make sure that name resolves
to the local host before starting the stack:

```bash
echo "127.0.0.1 kravhantering.test" | sudo tee -a /etc/hosts
```

The stack creates a short-lived local CA under `tmp/container-tls`. In a local
devcontainer, release-smoke startup imports the CA automatically. For a plain
demo run, trust the CA after the stack has created the file:

```bash
bash .devcontainer/trust-container-ca.sh
```

Outside a devcontainer, configure equivalent CA trust for both Node and the
browser that will open `https://kravhantering.test`.

## Start Demo

Create per-container `.local` files from the public example values:

```bash
npm run container:env:local
```

Start the demo profile:

```bash
npm run container:local:demo
```

When the command completes, the stack is ready at:

```text
https://kravhantering.test
```

The demo profile runs `db-bootstrap`, `db-migrate`, `db-seed-required` and
`db-seed-demo`, starts the app and nginx, and waits for nginx, Keycloak
discovery, `/api/health` and `/api/ready`.

## Sign In

The container stack uses the `kravhantering-test` Keycloak realm. The public
demo and smoke-test accounts are:

<!-- markdownlint-disable MD013 -->
| Username | Role | Password |
| - | - | - |
| `release-smoke-user` | No global role | `release-smoke-user-not-for-production` |
| `release-smoke-admin` | `Admin` | `release-smoke-admin-not-for-production` |
<!-- markdownlint-enable MD013 -->

The accounts and client secrets are committed test values. Replace them before
an environment is exposed to anyone beyond local demo or smoke-test users.

## Stop Demo

Stop the most recent local demo stack:

```bash
npm run container:local:down
```

Demo mode uses a stable SQL Server volume and does not remove it during normal
shutdown.

## Reset Demo Data

Stop the stack and remove the demo volume when PoC or demo data can be
discarded:

```bash
npm run container:local:down
podman volume rm kravhantering-container-stack-demo-sqlserver-data
```

The next `npm run container:local:demo` creates the volume again and reruns
migration plus required and demo seed from the beginning.

## Values to Replace Before Exposure

Replace at least these public example values with environment-specific secrets
or certificates before the environment is reachable outside local demo or smoke
testing:

- `AUTH_SESSION_COOKIE_PASSWORD` in `containers/app/.env.app.local`
- `AUTH_OIDC_CLIENT_SECRET` in `containers/app/.env.app.local`
- `KEYCLOAK_ADMIN_PASSWORD` in `containers/keycloak/.env.keycloak.local`
- client secrets in `containers/keycloak/realm-kravhantering-test.json`
- test user passwords in `containers/keycloak/realm-kravhantering-test.json`
- `MSSQL_SA_PASSWORD` in `containers/sqlserver/.env.sqlserver.local`
- `DB_PASSWORD`, `DB_BOOTSTRAP_APP_PASSWORD`,
  `DB_BOOTSTRAP_ADMIN_PASSWORD` and `DB_READONLY_PASSWORD` in
  `containers/db-job/.env.db-job.local`
- TLS certificates and private keys under `tmp/container-tls`
- any MCP client secrets, for example
  `container-demo-mcp-secret-not-for-production`
- any AI keys, for example `OPENROUTER_API_KEY` and
  `OPENROUTER_MGMT_API_KEY`

This is not a new production deployment model. It is a local PoC/demo mode for
the container-based stack.

## Image Locks and Evidence

Vendor images are locked per container in:

- `containers/nginx/image.lock.json`
- `containers/sqlserver/image.lock.json`
- `containers/keycloak/image.lock.json`

Update tag and digest together in the relevant `image.lock.json`, start
release-smoke so a new stack lock is created, run the check and verify the
stack:

```bash
npm run container:release-smoke:up
npm run container:stack-lock:check
npm run test:release-smoke
npm run container:release-smoke:down
```

The local run writes `container-stack.lock.json`,
`container-stack.compose.yml`, `container-status.txt`,
`container-status.json`, `hashes.sha256` and `public/build.json`. For
published versions, tested version, digest, checksums and smoke-test evidence
are available in GitHub Release notes and in the artifacts from the
container-release workflow.
