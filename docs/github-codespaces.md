# Running Kravhantering in GitHub Codespaces

<!-- markdownlint-disable MD013 -->
<!-- cSpell:ignore codespace,codespaces -->

This guide walks through launching the **main** branch of [viscalyx/Kravhantering](https://github.com/viscalyx/Kravhantering) in a GitHub Codespace, running the dev server, making the forwarded port public, and cleaning up afterwards.

<!-- markdownlint-enable MD013 -->

## Prerequisites

- A GitHub account (free tier is fine — you get 120 core-hours
  per month of Codespaces usage).
- A modern web browser (Chrome, Edge, Firefox, or Safari).

No local installs are required — everything runs in the cloud.

## 1 — Create a Codespace

<!-- markdownlint-disable MD013 -->

1. Open <https://github.com/viscalyx/Kravhantering> in your
   browser.
2. Click the green **Code** button near the top-right of the
   repository page.
3. Switch to the **Codespaces** tab in the dropdown.
4. Click **Create codespace on main**.

> **Visual reference:** GitHub's documentation has annotated
> screenshots of this flow — see
> [Creating a codespace for a repository](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository#creating-a-codespace-for-a-repository).

GitHub will provision a cloud VM, build the dev container, and
open a VS Code editor in your browser. This typically takes
1–3 minutes for the first launch.

<!-- markdownlint-enable MD013 -->

## 2 — Wait for automatic setup

The dev container runs two lifecycle scripts automatically.
You can follow their progress in the integrated terminal.

### Post-create (runs once when the container is first built)

```text
npm install -g npm@latest && npm install && npx playwright install --with-deps
```

This installs all Node.js dependencies and the Playwright
browser binaries. It can take a few minutes on first creation.

### Post-start (runs on every container start/restart)

```text
npm run cf-typegen && npm run db:setup
```

This generates Cloudflare type bindings and sets up the local
D1 (SQLite) database — reset, migrate, and seed.

> **Tip:** Wait until both scripts finish before running any
> commands. The terminal prompt reappears when they are done.

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

## 4 — Make the forwarded port public

By default, forwarded ports in Codespaces are **private**
(only accessible to you while signed in). To share the URL
with others — or to avoid authentication redirects — make the
port public:

<!-- markdownlint-disable MD013 -->

1. Click the **Ports** tab at the bottom of the VS Code editor
   (next to the Terminal tab). If you do not see it, open it
   via the Command Palette:
   `Ctrl`+`Shift`+`P` →
   **Ports: Focus on Ports View**.
2. Find port **3000** in the list (labeled *Next.js Dev
   Server 1* if the devcontainer label is present).
3. **Right-click** the row for port 3000.
4. Hover over **Port Visibility** in the context menu.
5. Select **Public**.

The Visibility column now shows *Public* and the forwarded URL
is accessible to anyone with the link.

> **Visual reference:** GitHub's documentation has screenshots
> of the Ports panel and visibility menu — see
> [Forwarding ports in your codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).

<!-- markdownlint-enable MD013 -->

## 5 — Access the application

With the dev server running and the port forwarded:

- **Click the globe icon** (🌐) next to port 3000 in the
  Ports tab, or
- **Copy the forwarded URL** from the Ports tab and paste it
  into any browser.

The URL looks like
`https://<codespace-name>-3000.app.github.dev`.

## 6 — Stop the Codespace

When you are done working, stop the Codespace to conserve
your monthly quota. A stopped Codespace keeps its files and
state but does not consume compute hours.

### From the browser

<!-- markdownlint-disable MD013 -->

1. Go to <https://github.com/codespaces>.
2. Find your Codespace in the list.
3. Click the **⋯** (three-dot) menu on the right.
4. Select **Stop codespace**.

> **Visual reference:** see
> [Stopping and starting a codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/stopping-and-starting-a-codespace#stopping-a-codespace).

<!-- markdownlint-enable MD013 -->

### From the terminal (inside the Codespace)

```bash
gh codespace stop
```

### From VS Code

Open the Command Palette
(`Ctrl`+`Shift`+`P`) and run
**Codespaces: Stop Current Codespace**.

## 7 — Delete the Codespace

Stopped Codespaces still consume storage. Delete them when
you no longer need them.

### From the Codespaces dashboard

<!-- markdownlint-disable MD013 -->

1. Go to <https://github.com/codespaces>.
2. Click the **⋯** menu next to the Codespace.
3. Select **Delete**.

> **Visual reference:** see
> [Deleting a codespace](https://docs.github.com/en/codespaces/developing-in-a-codespace/deleting-a-codespace#deleting-a-codespace).

<!-- markdownlint-enable MD013 -->

### From the terminal (on your local machine)

```bash
# List your codespaces
gh codespace list

# Delete a specific codespace
gh codespace delete --codespace <name>
```

## 8 — Connect the MCP server to ChatGPT (optional)

<!-- markdownlint-disable MD013 -->

The dev server exposes an MCP endpoint at `/api/mcp`. Once the
Codespace is running with a **public** forwarded port (see
step 4), you can connect ChatGPT to it.

### Copy the Codespace URL

1. Open the **Ports** tab in the Codespace editor.
2. Copy the forwarded URL for port **3000**. It looks like
   `https://<codespace-name>-3000.app.github.dev`.
3. Append `/api/mcp` to form the full endpoint, for example
   `https://<codespace-name>-3000.app.github.dev/api/mcp`.

### Add the MCP server in ChatGPT

1. Open [ChatGPT](https://chatgpt.com) in your browser (a
   Plus, Team, or Enterprise plan is required for MCP
   connectors).
2. Click your profile icon in the top-right corner and
   select **Settings**.
3. In the left sidebar, click **Connectors** (under the
   *Personalization* group).
4. Click **Add connector** → **MCP Server**.
5. Fill in the form:
   - **Name:** `Kravhantering` (or any label you prefer)
   - **URL:** paste the full Codespace MCP endpoint from
     above, e.g.
     `https://<codespace-name>-3000.app.github.dev/api/mcp`
6. Click **Add** to save the connector.

> **Visual reference:** OpenAI's documentation includes
> screenshots of the connector setup — see
> [Use remote MCP servers in ChatGPT](https://platform.openai.com/docs/guides/tools/mcp#use-remote-mcp-servers-in-chatgpt).

### Use it in a chat

1. Start a new ChatGPT conversation (or open an existing one).
2. In the message composer, click the **tools** icon (wrench /
   connector icon).
3. Enable the **Kravhantering** connector or individual tools
   from it.
4. Ask a question, for example:
   - `List all published requirements`
   - `Show requirement INT0001`
   - `List available areas and categories`

ChatGPT will call the MCP tools and display the results inline
in the conversation.

### Important notes

- The Codespace must be **running** and the dev server started
  (`npm run dev`) for ChatGPT to reach the endpoint.
- The port must be set to **Public** (step 4). A private port
  returns authentication errors for external clients.
- When you **stop** the Codespace, the MCP endpoint becomes
  unreachable. Restart it and verify the forwarded URL has not
  changed before using ChatGPT again.
- For the available MCP tools and usage tips, see
  [MCP Server User Guide](./mcp-server-user-guide.md).

<!-- markdownlint-enable MD013 -->

## Troubleshooting

| Problem | Solution |
| ------- | -------- |
| Dependencies failed to install | Run `npm run purge:install` |
| Database errors | Run `npm run db:setup` |
| Port 3000 already in use | Run `npm run kill:port` |
| Slow first build | Normal — the container image is ~1 GB |
| Need to re-run all checks | Run `npm run check` |

### Codex namespace errors

If Codex agent tools fail with `bwrap` or `unshare` namespace errors
after you pull the latest repo changes, rebuild the
Codespace/devcontainer so the updated `.devcontainer/docker-compose.yml`
security setting takes effect.

<!-- markdownlint-disable MD013 -->

For more on Codespaces billing, quotas, and machine types see
[About billing for GitHub Codespaces](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-codespaces/about-billing-for-github-codespaces).

<!-- markdownlint-enable MD013 -->

## Further reading

<!-- markdownlint-disable MD013 -->

- [GitHub Codespaces overview](https://docs.github.com/en/codespaces/overview)
- [Dev Containers specification](https://containers.dev/)
- [MCP Server User Guide](./mcp-server-user-guide.md) — MCP tools and client setup
- [CONTRIBUTING.md](../CONTRIBUTING.md) — project contribution guidelines
- [README.md](../README.md) — project overview and local quick-start

<!-- markdownlint-enable MD013 -->
