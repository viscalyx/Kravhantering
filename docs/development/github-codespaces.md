# Running Kravhantering in GitHub Codespaces

<!-- cSpell:ignore codespace,codespaces,seccomp,sandboxing,bwrap -->

This guide covers running the **main** branch of
[viscalyx/Kravhantering](https://github.com/viscalyx/Kravhantering)
in a GitHub Codespace, accessing the application, sharing an MCP endpoint,
and cleaning up afterwards.

The committed devcontainer configuration assumes a prepared Docker host.
A fresh Codespace needs the configuration below before the application can
start; creating a Codespace alone does not complete setup.

## Prerequisites

- A GitHub account with Codespaces access and available usage quota.
- A modern web browser (Chrome, Edge, Firefox, or Safari).

The browser editor needs no local development runtime. To use the committed
localhost login configuration, use VS Code desktop with Codespaces support
and local port forwarding as described in step 4.

### Repository configuration required before startup

- Provide `.devcontainer/.env` from `.devcontainer/.env.example` and configure
  the database credentials. Compose requires `MSSQL_SA_PASSWORD` before it
  can create services; the app also needs the matching `DB_*` settings.
  The elevated profile additionally needs `.devcontainer/elevated/.env`
  for Compose variable substitution. Follow the
  [devcontainer configuration instructions](./devcontainer-developer-workflow.md#configurations).
- Both Compose profiles bind-mount `${HOME}/.codex/auth.json` and several
  host directories. These paths refer to the Docker host, not your local
  computer. A fresh Codespace does not inherit your workstation files;
  review these mounts for the cloud host before building. Do not commit
  credentials to make a mount available.

If creation fails, inspect the build log for missing environment variables
or mount sources. GitHub's
[creation troubleshooting guide](https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-creation-and-deletion-of-codespaces)
explains how to open recovery mode, fix configuration, and rebuild. The
repository does not provide a separate Codespaces bootstrap that prepares
these host dependencies.

## 1 — Create a Codespace

1. Open <https://github.com/viscalyx/Kravhantering> in your
   browser.
2. Click the green **Code** button near the top-right of the
   repository page.
3. Switch to the **Codespaces** tab in the dropdown.
4. Click **Create codespace on main**.

If you need elevated container permissions for VS Code agent
sandboxing (e.g. `SYS_ADMIN`, `seccomp=unconfined`), choose the
**Kravhantering Development (Elevated)** dev container
configuration before you create the Codespace. The default
configuration uses the standard Docker security profile.

> **Visual reference:** GitHub's documentation has annotated
> screenshots of this flow — see
> [Creating a codespace for a repository](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository#creating-a-codespace-for-a-repository).

GitHub provisions a cloud VM, builds the dev container, and opens a VS Code
editor. Continue once the required configuration above is in place and the
build succeeds.

## 2 — Wait for automatic setup

The sole database stack is SQL Server + TypeORM; see
[sql-server-developer-workflow.md](./sql-server-developer-workflow.md)
for setup, migrations, and the read-only browse workflow.

The dev container runs two lifecycle scripts automatically.
You can follow their progress in the integrated terminal.

### Post-create (runs when the container is created or rebuilt)

The hook installs dependencies and development tools and prepares the
container configuration. Wait for it to finish before using the workspace.

### Post-start (runs on every container start/restart)

The hook starts supporting services and runs `npm run db:setup`. Database
setup retries once on failure.

**Every start resets the development database.** `db:setup` recreates and
seeds it with development data. Save any application data you need before
stopping or restarting the Codespace.

Check the lifecycle output for `SQL Server setup completed`. A terminal
prompt alone does not prove success: the hook can finish after printing that
both database setup attempts failed. Diagnose that failure before starting
the app.

The devcontainer starts SQL Server (`db`), Keycloak (`idp`), and the HSA
support services automatically. Database connections come from the configured
`DB_*` values or explicit connection-string overrides; there is no need to
start a second database service.

To inspect table data, run `npm run db:browse` and follow the SQLTools +
MSSQL workflow described in
[sql-server-developer-workflow.md](./sql-server-developer-workflow.md).

## 3 — Start the dev server

Once the automatic setup is complete, open the terminal
(`Ctrl` + `` ` ``) and run:

```bash
npm run dev
```

Next.js starts on port **3000**. You will see output similar
to:

```text
▲ Next.js 16.x.x
- Local:   http://localhost:3000
```

## 4 — Forward ports for sign-in

The committed authentication settings use `http://localhost:3000` for the
application and `http://localhost:8080` for Keycloak. The Keycloak client
registers the callback at `http://localhost:3000/api/auth/callback`.

Open the Codespace in VS Code desktop and use its **Ports** panel to forward
both **3000** and **8080** to the same ports on your computer. Keep them
private, and ensure neither local port is already occupied. The browser and
the app must reach the same issuer URL. See
[GitHub's port-forwarding guide](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace)
for desktop forwarding controls.

Opening only `https://<codespace-name>-3000.app.github.dev` does not adapt
these settings. Making that port public removes GitHub's access gate, but
application sign-in still requires a valid OIDC configuration. Browser-only
access through that hostname requires a browser- and server-reachable issuer,
matching application callback/logout settings, and matching client
registrations. That configuration is not supplied by the committed realm;
see the [auth developer workflow](./auth-developer-workflow.md).

## 5 — Access the application

With both local forwards active and the dev server running, open
`http://localhost:3000` directly in your browser. Sign in with a seeded
development account, for example `ada.admin` with password `devpass`.
See the [auth developer workflow](./auth-developer-workflow.md) for the other
roles and sign-in troubleshooting.

## 6 — Stop the Codespace

When you are done working, stop the Codespace to conserve
your monthly quota. A stopped Codespace keeps its files and
state but does not consume compute hours. The repository startup hook still
resets the application database the next time the container starts.

### From the browser

1. Go to <https://github.com/codespaces>.
2. Find your Codespace in the list.
3. Click the **⋯** (three-dot) menu on the right.
4. Select **Stop codespace**.

> **Visual reference:** see
> [Stopping and starting a codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/stopping-and-starting-a-codespace#stopping-a-codespace).

### From the terminal (inside the Codespace)

```bash
gh codespace stop
```

### From VS Code

Open the Command Palette
(`Ctrl`+`Shift`+`P`) and run
**Codespaces: Stop Codespace**, then select the Codespace to stop.

## 7 — Delete the Codespace

Stopped Codespaces still consume storage. Push any commits and copy out any
uncommitted files you need before deleting a Codespace.

### From the Codespaces dashboard

1. Go to <https://github.com/codespaces>.
2. Click the **⋯** menu next to the Codespace.
3. Select **Delete**.

> **Visual reference:** see
> [Deleting a codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/deleting-a-codespace#deleting-a-codespace).

### From the terminal (on your local machine)

```bash
# List your codespaces
gh codespace list

# Delete a specific codespace
gh codespace delete --codespace <name>
```

## 8 — Expose the MCP endpoint for remote clients (optional)

The dev server exposes an MCP endpoint at `/api/mcp`. External clients that
cannot authenticate to the GitHub forwarding layer need a public forwarded
port. In the **Ports** panel, right-click **3000**, choose **Port Visibility**,
and select **Public**, if organization policy allows it. Keep database and
Keycloak ports private.

Public visibility exposes the development server to anyone who knows the URL.
Use only disposable demo data; the committed development accounts and
passwords are public. Application authentication still applies. See
[GitHub's sharing controls](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).

### Build the remote endpoint URL

1. Open the **Ports** tab in the Codespace editor.
2. Copy the forwarded URL for port **3000**. It looks like
   `https://<codespace-name>-3000.app.github.dev`.
3. Append `/api/mcp` to form the full endpoint, for example
   `https://<codespace-name>-3000.app.github.dev/api/mcp`.

### Important notes

- The Codespace must be **running** and the dev server started
  (`npm run dev`) for remote MCP clients to reach the endpoint.
- A private remote port requires separate GitHub forwarding authentication
  in addition to the application Bearer token. Public visibility avoids that
  extra gate for clients that cannot supply it.
- When you **stop** the Codespace, the MCP endpoint becomes
  unreachable. Restart it and verify the forwarded URL has not
  changed before using remote MCP clients again.
- MCP requests must include the required Bearer token. For client
  configuration, token setup, available tools, and usage examples, see
  [MCP Server User Guide](../integrations/mcp-server-user-guide.md).

## Troubleshooting

<!-- markdownlint-disable MD013 -->

| Problem | Solution |
| ------- | -------- |
| Dependencies failed to install | Inspect the installation error; `npm run purge:install` reinstalls dependencies and regenerates `package-lock.json`, so review its diff. |
| Database errors | Check lifecycle output and run `npm run db:health`; use `npm run db:setup` only when discarding local database data is intended. |
| Port 3000 already in use | Run `npm run kill:port` |
| Login redirects to localhost or fails | Forward both 3000 and 8080 locally; see steps 4–5. |

<!-- markdownlint-enable MD013 -->

### Codex namespace errors

If Codex agent tools fail with `bwrap` or `unshare` namespace errors,
check which devcontainer profile is selected. The default profile uses the
standard Docker security settings; rebuilding that profile does not grant
elevated permissions. The elevated profile defines its permissions in
`.devcontainer/elevated/docker-compose.yml`. Rebuild after changing profiles.

For more on Codespaces billing, quotas, and machine types see
[About billing for GitHub Codespaces](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-codespaces/about-billing-for-github-codespaces).

## Further reading

- [GitHub Codespaces overview](https://docs.github.com/en/codespaces/overview)
- [Dev Containers specification](https://containers.dev/)
- [MCP Server User Guide](../integrations/mcp-server-user-guide.md)
  — MCP tools and client setup
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — project contribution guidelines
- [README.md](../../README.md) — project overview and local quick-start
