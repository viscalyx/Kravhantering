# Container Compose Contract

This directory owns the source-controlled Compose template for the
production-like container stack. The template is not run directly. Generate a
runtime Compose file from a `container-stack.lock.json` artifact instead.

## Generated Files

Generate a stack lock after `app-runtime` and `db-job` have been built and
their manifest digests and image IDs are known:

<!-- markdownlint-disable MD013 -->
```bash
npm run container:stack-lock:generate -- \
  --release-version 0.1.0-pr.1 \
  --commit-sha "$(git rev-parse HEAD)" \
  --app-image localhost/kravhantering/app-runtime \
  --app-tag pr-1-run-deadbeef \
  --app-manifest-digest sha256:<app-runtime-manifest-digest> \
  --app-image-id sha256:<app-runtime-image-id> \
  --db-job-image localhost/kravhantering/db-job \
  --db-job-tag pr-1-run-deadbeef \
  --db-job-manifest-digest sha256:<db-job-manifest-digest> \
  --db-job-image-id sha256:<db-job-image-id>
```
<!-- markdownlint-enable MD013 -->

Check that the generated lock still copies the vendor image locks exactly:

```bash
npm run container:stack-lock:check
```

`container:stack-lock:check` first validates the generated
`container-stack.lock.json` against
[`container-stack-lock.schema.json`](./container-stack-lock.schema.json), then
verifies that the nginx, SQL Server and Keycloak entries exactly match their
`containers/*/image.lock.json` files. The schema is strict: unknown top-level
or service fields fail validation, `schemaVersion` is fixed to `2`, the
production stack contains only `app-runtime`, `db-job`, nginx, SQL Server and
Keycloak, and `manifestDigest` plus `imageId` values must be prefixed with
`sha256:`.

Generated stack locks intentionally do not include a top-level `$schema`
property. The check command supplies the schema explicitly so the runtime
artifact stays limited to release evidence and service identity data.

Generate a PR-mode Compose file with local project image tags and
manifest-locked vendor images:

```bash
npm run container:compose:generate:pr
```

Generate a release-mode Compose file where `app-runtime`, `db-job`, nginx,
SQL Server and Keycloak are all manifest-locked:

```bash
npm run container:compose:generate:release
```

The generated files are runtime artifacts and are ignored by Git:
`container-stack.lock.json` and `container-stack.compose.yml`.

## Local Podman Stack

This file keeps the lower-level Compose contract and troubleshooting details.
For the release-artifact deployment flow and optional test and development
demo-data commands, see
[docs/operations/rhel10-production-single-node-self-contained-deploy.md](../../docs/operations/rhel10-production-single-node-self-contained-deploy.md).

The local Podman workflow runs the generated Compose stack with Podman Compose.
The devcontainer image installs Podman tooling, but nested Podman support
requires either the opt-in elevated devcontainer profile or a host shell with
Podman available.
The elevated profile exposes `/dev/fuse` and `/dev/net/tun` for rootless
Podman storage and networking. The devcontainer image installs
`netavark`/`aardvark-dns` for service-name DNS and sets `STORAGE_DRIVER=vfs`
because Docker Desktop on Apple Silicon can expose the devices while still
failing to execute nested containers from rootless overlay storage. `vfs` is
slower, but the local stack favours predictable verification over runtime
storage performance.

Verify the runtime before starting the stack:

```bash
podman --version
PODMAN_COMPOSE_PROVIDER=podman-compose podman compose version
podman info
```

If Podman was already initialized with `overlay` storage before this setting
was added, `STORAGE_DRIVER=vfs` may be ignored until the local Podman store is
reset. In a disposable devcontainer, run `podman system reset --force` or
rebuild the devcontainer.

Start a fresh test stack without Playwright:

```bash
npm run container:local:up
```

Stop the most recent local stack:

```bash
npm run container:local:down
```

The test mode uses a run-specific SQL Server volume and removes it during
shutdown. To avoid colliding with the existing developer SQL Server on `1433`,
the local stack binds SQL Server to `127.0.0.1:15433` by default.
The generated stack uses the shared internal network name
`kravhantering-internal`. This Compose network is limited to local test
orchestration; production Quadlet topologies use their own stable network
names. Run only one active local app-stack test at a time with this default
network.

The local orchestration does the same explicit ordering intended for CI:

1. Generate short-lived TLS files in `tmp/container-tls`.
2. Build `app-runtime` and `db-job` with Docker Buildx.
3. Load both local images into Podman.
4. Generate `container-stack.lock.json` and `container-stack.compose.yml`.
5. Start SQL Server and Keycloak.
6. Run `db-bootstrap`, `db-migrate` and `db-seed-required`.
7. Start `app-runtime` and nginx, then wait for nginx, Keycloak discovery,
   `/api/health` and `/api/ready`. The non-production Nginx configuration
   admits readiness only from loopback and private container networks.

Status and hash artifacts are written to `container-status.txt`,
`container-status.json` and `hashes.sha256`. They intentionally contain only
allowlisted runtime metadata and redacted log tails, not `.env.*.local` files,
TLS private keys or raw container inspect output.

## PR Smoke Workflow

The PR workflow builds the candidate images and installs the real production
deployment archive under a dedicated rootless service account on Ubuntu. It
starts the production `single-node` Quadlet topology plus a separately named
CI-only HSA overlay; it does not use this local Compose orchestration.

The workflow exports and verifies separate short-lived OCI archives for the
project images:

```bash
npm run container:oci:export -- --output-dir tmp/container-pr-artifacts/oci
npm run container:oci:verify -- \
  --output-dir tmp/container-pr-artifacts/oci \
  --verify-root "/tmp/kh-oci-$CONTAINER_STACK_RUN_ID"
```

Verification loads each archive into an isolated Podman store and compares the
loaded image ID with the `imageId` recorded in `container-stack.lock.json`.
When `--verify-root` is supplied, that path is used as the parent for
short-lived per-service stores so CI does not keep multiple expanded images in
one Podman graph root. Podman temp staging is scoped to the same per-service
directory, and each isolated store prunes its loaded images before the directory
is removed.
Workflow uploads keep OCI archives separate from the longer-lived Playwright,
status, Quadlet, stack-lock, build-metadata and hash artifacts.

## Local Env Files

Compose reads per-container `.local` env files. Create them from the public
example values with:

```bash
npm run container:env:local
```

To replace one file and override runtime values:

```bash
node scripts/containers/write-env-local.mjs app \
  --set DB_PASSWORD=<runtime-value> \
  --force
```

The helper writes only files under the owning container directory, for example
`containers/app/.env.app.local`. It does not create a shared env file.
`.local` files may contain secrets, are ignored by Git, and must not be saved
as artifacts.

## Wait Helpers

The wait helper is intentionally separate from Compose dependency rules so CI
and local debugging can use the same checks:

```bash
npm run container:wait -- sqlserver
NODE_EXTRA_CA_CERTS=tmp/container-tls/ca.crt npm run container:wait -- nginx
NODE_EXTRA_CA_CERTS=tmp/container-tls/ca.crt npm run container:wait -- keycloak
NODE_EXTRA_CA_CERTS=tmp/container-tls/ca.crt npm run container:wait -- health
NODE_EXTRA_CA_CERTS=tmp/container-tls/ca.crt npm run container:wait -- ready
```

Each wait command accepts `--timeout-ms`, `--interval-ms` and, for HTTP-based
checks, `--request-timeout-ms`. HTTP checks also accept `--resolve-host-to`,
which lets local automation connect to `127.0.0.1` while preserving
`kravhantering.test` for TLS verification and the HTTP Host header. `nginx`
succeeds once a TLS-verified HTTP response is received. `health` requires
`{ "status": "ok" }`; `ready` requires `{ "status": "ready" }`.
