# Dev Container Developer Workflow

This document covers Dev Container-specific developer workflows that are too
detailed for `CONTRIBUTING.md`.

## Configurations

Use **Kravhantering Development** for normal work.

Use **Kravhantering Development (Elevated)** only when VS Code agent sandboxing
needs elevated container permissions such as `SYS_ADMIN` and
`seccomp=unconfined`. The elevated configuration lives at
[.devcontainer/elevated/devcontainer.json](../../.devcontainer/elevated/devcontainer.json).

Before rebuilding either devcontainer profile, copy:

```bash
cp .devcontainer/.env.example .devcontainer/.env
```

## Local HTTPS Development

The devcontainer includes `mkcert`. Use it inside the container to create the
HTTPS certificates expected by `npm run dev:https`:

```bash
mkdir -p certificates
mkcert \
  -key-file ./certificates/localhost-key.pem \
  -cert-file ./certificates/localhost.pem \
  localhost 127.0.0.1 ::1
```

The repository's `.gitignore` already excludes `certificates` and `*.pem`.

Start the HTTPS development server inside the container:

```bash
npm run dev:https
```

This workflow is container-local and requires no host-side steps for the common
devcontainer setup. If your browser still warns about the certificate, export
and import the container's CA root (`certificates/rootCA.pem`) into the host or
browser trust store. If you prefer not to trust the local CA, use
`npm run dev` over HTTP instead.

## Stale `.next/` Cache After Route Changes

Turbopack's dev manifest is built from `.next/dev/` on first start. If you add,
move, or rename a route folder under `app/` while the dev server is off, or
while it still has a cache from an earlier `next build`, sibling routes may 404
even though the `page.tsx` exists on disk.

Symptoms:

- `/sv/requirements/IDN0001` returns 200 but `/sv/requirements/IDN0001/4`
  or `/sv/requirements/IDN0001/edit` returns 404.
- Touching the affected `page.tsx` makes it work.

Fix: start the dev server with a clean cache.

```sh
npm run dev:fresh
```

This is equivalent to `npm run kill:port && npm run clean && npm run dev`: it
stops any process on port 3000, removes `.next/` and `out/`, then runs
`next dev`. Use it after a `git pull` or branch switch that reshuffles route
folders. Use plain `npm run dev` for normal work so Turbopack can keep its
incremental compile cache.

## Supporting Services

The default devcontainer starts the local SQL Server and Keycloak services for
normal development. For detailed database and auth workflows, use:

- [SQL Server Developer Workflow](./sql-server-developer-workflow.md)
- [Auth developer workflow](./auth-developer-workflow.md)
