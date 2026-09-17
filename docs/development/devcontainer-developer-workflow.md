# Dev Container Developer Workflow

This document covers Dev Container-specific developer workflows that are too
detailed for `CONTRIBUTING.md`.

## Configurations

Use **Kravhantering Development** for normal work.

Use **Kravhantering Development (Elevated)** only when VS Code agent sandboxing
needs elevated container permissions such as `SYS_ADMIN` and
`seccomp=unconfined`. The elevated configuration lives at
[.devcontainer/elevated/devcontainer.json](../../.devcontainer/elevated/devcontainer.json).

Before the first rebuild, run this from the repository root if
`.devcontainer/.env` does not exist:

```bash
cp .devcontainer/.env.example .devcontainer/.env
```

Review the local database settings in that file. Keep it on subsequent
rebuilds so your settings are preserved. For the elevated profile, also copy
the configured file to `.devcontainer/elevated/.env` and keep both copies in
sync: the services read the parent file, while Compose resolves variables such
as `MSSQL_SA_PASSWORD` from the elevated project directory.

```bash
cp .devcontainer/.env .devcontainer/elevated/.env
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
are available. See the
[Copilot CLI authentication guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli)
for token setup. Keep both values in the workstation's secure credential store;
do not put them in the repository, `.devcontainer/.env`, or a shell profile.

Processes running as `vscode` inside the container, including workspace tasks
and remote extensions, can read the forwarded values. Use only trusted
devcontainers, workspaces, tasks, and extensions, and use short-lived,
least-privilege tokens.

After adding or rotating either variable, rebuild or reopen the devcontainer so
the VS Code remote extension host and its child processes receive the current
values.

## Codex CLI

Both devcontainer profiles install the Codex CLI for the `vscode` user.
After changes to the container tooling, rebuild the devcontainer and verify
the installation inside it:

```bash
codex --version
codex app-server daemon version
```

Codex keeps configuration, authentication, sessions, skills, and plugins under
`/home/vscode/.codex`. On every creation or rebuild, both profiles merge
`.devcontainer/codex-config.toml` into `config.toml` with the trust and
permission settings required inside the devcontainer. The merge preserves
unrelated personal settings. Shared project defaults, including the model,
MCP servers, status line, and terminal title, live in `.codex/config.toml` and
apply in every trusted development environment.

Every container start runs `codex app-server daemon start` before the other
startup hooks. If the daemon cannot start, the startup command fails before
database setup. Check the Dev Containers startup log and retry the command
inside the container after correcting the cause.

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

The HTTPS server uses `https://localhost:4443`. The committed Keycloak client
and app settings use HTTP on port 3000, so authenticated HTTPS development
also requires adding these values to the local `kravhantering-app` client:

- Valid redirect URI: `https://localhost:4443/api/auth/callback`.
- Web origin: `https://localhost:4443`.
- Valid post-logout redirect URI: `https://localhost:4443/`.

Keep the existing HTTP values for normal development. See the
[auth developer workflow](./auth-developer-workflow.md) for local Keycloak
access. Start the HTTPS server with matching command-scoped app settings:

```bash
AUTH_OIDC_REDIRECT_URI=https://localhost:4443/api/auth/callback \
AUTH_OIDC_POST_LOGOUT_REDIRECT_URI=https://localhost:4443/ \
NEXT_PUBLIC_SITE_URL=https://localhost:4443 \
npm run dev:https
```

Generating certificates inside the container does not make the host browser
trust them. Export the public CA certificate from the directory printed by
`mkcert -CAROOT`, then import it into the host or browser trust store:

```bash
cp "$(mkcert -CAROOT)/rootCA.pem" certificates/rootCA.pem
```

Copy only `rootCA.pem`; keep the CA private key inside the container. See the
[mkcert documentation](https://github.com/FiloSottile/mkcert#installing-the-ca-on-other-systems)
for importing the CA on another system. If you prefer not to trust the local
CA, use `npm run dev` over HTTP instead.

## Stale `.next/` Cache After Route Changes

If routes return unexpected 404 responses after adding, moving, or renaming
route folders under `app/`, cached build output may be stale.

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

Both devcontainer profiles start the local SQL Server and Keycloak services.
Every container start also runs `npm run db:setup`, which resets the local
database, applies migrations, and seeds required and demo data. Local database
edits are lost on restart; export anything you need to retain before restarting
or rebuilding. If automatic setup fails, the startup hook retries once, then
logs a warning; a running container alone does not confirm that database setup
succeeded. Inspect the database logs, correct the cause, and rerun
`npm run db:setup`. For detailed database and auth workflows, use:

- [SQL Server Developer Workflow](./sql-server-developer-workflow.md)
- [Auth developer workflow](./auth-developer-workflow.md)

Both profiles also start the HSA mock, Adapter, and Kong with mTLS between
services. Startup checks renew certificates when needed. For verification and
troubleshooting, use the
[HSA integration guide](../integrations/hsa-person-lookup-integration.md).

AI provider credentials are configured through Admin Center, which stores
encrypted provider-secret revisions. Both profiles provision the ignored root
keyring at `.local/ai-provider-secret-keyring.json` during container creation
and preserve an existing valid keyring. Do not replace that file to resolve a
startup validation error: existing secrets depend on it. See
[AI Connections Operations](../operations/ai-connections.md#external-root-keyring)
for validation and rotation guidance.

## Codex Network Sandbox

The devcontainer initializes `/home/vscode/.codex/config.toml` from
`.devcontainer/codex-config.toml`. The template trusts `/workspace` and selects
the `kravhantering-development` permission profile. It grants write access to
the repository's `.codex` configuration and Git metadata, plus the user-level
`~/.codex/skills` directory so repository skills can be synchronized without
opening the rest of the user-level Codex state. It also enables network access
to the local Compose service names used by development checks, including `db`,
`idp`, `kong`, the HSA mock, and loopback.

If Codex cannot reach `db` while the same database command works in a normal
devcontainer terminal, check that this permission profile is loaded. Reload or
restart Codex after changing the user config.
