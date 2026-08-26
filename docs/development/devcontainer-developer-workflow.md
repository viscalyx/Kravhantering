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

## GitHub Token Forwarding

Both devcontainer profiles forward two GitHub tokens from the environment that
launches VS Code:

- `GH_TOKEN` supplies the classic personal access token used by the Codex
  GitHub MCP server.
- `COPILOT_GITHUB_TOKEN` supplies the fine-grained personal access token used
  by GitHub Copilot CLI. The token requires the account-level
  `Copilot Requests` permission.

GitHub Copilot CLI checks `COPILOT_GITHUB_TOKEN` before `GH_TOKEN`, so the
classic token is never selected for Copilot authentication when both variables
are available. Keep both values in the workstation's secure credential store;
do not put them in the repository, `.devcontainer/.env`, or a shell profile.

Processes running as `vscode` inside the container, including workspace tasks
and remote extensions, can read the forwarded values. Use only trusted
devcontainers, workspaces, tasks, and extensions, and use short-lived,
least-privilege tokens.

After adding or rotating either variable, rebuild or reopen the devcontainer so
the VS Code remote extension host and its child processes receive the current
values.

Provider credentials are not forwarded through `remoteEnv` or read from local
environment variables. Write them through Admin Center so the application
stores encrypted provider-secret revisions.

Both devcontainer profiles provision the ignored, external AI provider-secret
root keyring at `.local/ai-provider-secret-keyring.json` during container
creation. The helper is idempotent: rebuilding or reopening a container never
prints or overwrites an existing keyring. It validates the owner, private file
and directory modes, readability, and keyring format before accepting it. The
Azure development host bootstrap performs the same step on its persistent
workspace data disk. See
[AI Connections Operations](../operations/ai-connections.md#external-root-keyring)
for the file contract and rotation boundary.

## Codex CLI

The devcontainer base image uses the exact semantic version tag recorded in
`containers/devcontainer-base/image.lock.json`. Its digest remains verification
evidence in the lock and is intentionally not appended to the Dockerfile
reference. The scheduled dependency-drift flow reports both newer supported
tags and digest changes under the current tag.

The locally built HSA support images share their Dockerfiles with release
builds. Their Node base references therefore retain the same tag and digest in
development and release builds.

Both profiles activate the same strict HSA topology. A one-shot provisioner
selects role-specific bundles before mock, Adapter, Kong, and App start in that
order. The services use HTTPS and mandatory mTLS on all three legs, mount only
their own bundle read-only, and expose health endpoints on loopback. Use the
authenticated capability route or the HSA verification control to check the
path; do not add plaintext listeners, shared certificate volumes, generated
runtime certificates, or TLS bypass variables.

Persistent certificate material renews automatically inside the 30-day
threshold. The post-start reconciliation is a fast no-op for an ordinary
reused generation. For a promotion it authenticates the complete chain before
finalization. A failed promotion rolls back and deletes the failed generation,
restarts mock, Adapter, and Kong in server-first order, and authenticates the
restored generation before development continues.

Both devcontainer profiles expose the Codex CLI system-wide from OpenAI's
current standalone release. The managed package root remains under
`/home/vscode/.codex`, where Codex can start and update its shared app-server
daemon. The build resolves the release metadata, requires the upstream SHA-256
digest for `install.sh`, and verifies the downloaded file before execution. A
missing or mismatched digest fails the devcontainer build. Rebuild the
devcontainer after changing branches or pulling this setup, then verify the
installation inside the container:

```bash
codex --version
codex app-server daemon version
```

The command is available to the `vscode` user in both profiles. Codex keeps
configuration, authentication, sessions, skills, and plugins under
`/home/vscode/.codex`. On every creation or rebuild, both profiles merge
`.devcontainer/codex-config.toml` into `config.toml` with the trust and
permission settings required inside the devcontainer. The merge preserves
unrelated personal settings and migrates obsolete managed profiles. Shared
project defaults, including the model, MCP servers, status line, and terminal
title, live in `.codex/config.toml` and apply in every trusted development
environment.

Every container start runs `codex app-server daemon start` before the other
post-start reconciliation. The command is idempotent and waits until the local
control socket is ready. New Codex CLI sessions therefore connect to the shared
background server immediately, and `/agents` works without restarting Codex.
If the daemon cannot start, the devcontainer post-start command fails visibly
instead of leaving a partially initialized Codex environment.

The image also resolves the current dotenv-linter release and verifies the
matching GitHub release-asset digest before installing it. Neither installer
stores a routine tool version in the repository. CI builds the complete
observable `development` image stage and runs both `codex --version` and
`dotenv-linter --version` whenever the Dockerfile or either installer changes.

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

## Codex Network Sandbox

The devcontainer initializes `/home/vscode/.codex/config.toml` from
`.devcontainer/codex-config.toml`. The template trusts `/workspace` and selects
the `kravhantering-development` permission profile. It grants write access to
the repository's `.codex` configuration and Git metadata, plus the user-level
`~/.codex/skills` directory so repository skills can be synchronized without
opening the rest of the user-level Codex state. It also enables network access
to the local Compose service names used by development checks, including `db`,
`idp`, `kong`, the HSA mock, and loopback.

This is required because the default Codex `workspace-write` sandbox blocks
network access. Without the devcontainer profile, Codex commands cannot resolve
`db` or open TCP sockets to SQL Server, even though the same command works from
a normal devcontainer terminal. Reload or restart Codex after changing the
user config so the new permission profile is loaded.
