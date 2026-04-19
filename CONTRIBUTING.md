# Contributing

## Getting Started

This project uses a [Dev Container](https://containers.dev/) for a
consistent development environment. Open the project in VS Code and
use **Reopen in Container** to get started automatically.

If VS Code prompts you to choose a configuration, use
**Kravhantering Development** for the default container. If you need
elevated container permissions (e.g. `SYS_ADMIN`, `seccomp=unconfined`)
for VS Code agent sandboxing features, choose
**Kravhantering Development (Elevated)** from
[`.devcontainer/elevated/devcontainer.json`](.devcontainer/elevated/devcontainer.json).

If you prefer host-based development outside the dev container, install Node.js
24+, npm, and a Docker-compatible `docker compose` runtime. The default local
workflow is `npm run db:up`, `npm run db:setup`, then `npm run dev`.

## Available Scripts

<!-- markdownlint-disable MD013 MD060 -->
| Command                    | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `npm run dev`              | Start Next.js development server                 |
| `npm run start:prodlike`   | Rebuild and start the prod-like app on port 3001 (`NODE_ENV=production`) |
| `npm run build`            | Production build                                 |
| `npm run start`            | Start the production server                      |
| `npm run check`            | Run all checks (TS, Python, format, lint, tests) |
| `npm run test`             | Run unit tests with Vitest                       |
| `npm run test:watch`       | Run unit tests in watch mode                     |
| `npm run test:coverage`    | Run unit tests with coverage                     |
| `npm run test:integration` | Run Playwright integration tests                 |
| `npm run test:integration:prodlike` | Run Playwright against the built app      |
| `npm run lint`             | Lint with Biome                                  |
| `npm run lint:fix`         | Lint and auto-fix with Biome                     |
| `npm run lint:py`          | Type-check Python scripts with Pyright           |
| `npm run format`           | Format code with Biome                           |
| `npm run spell`            | Spell check with cspell                          |
| `npm run lint:md`          | Lint Markdown files                              |
| `npm run fix`              | Auto-fix formatting, linting & Markdown          |
| `npm run type-check`       | TypeScript type checking                         |
<!-- markdownlint-enable MD013 MD060 -->

`npm run build` and `npm run start:prodlike` require the configured
`DATABASE_URL` to be available and initialized.

## Local HTTPS development (devcontainer-only mkcert)

This project is developed inside the VS Code Dev Container. The devcontainer
includes `mkcert`; use it inside the container to create the HTTPS certs the
app expects at `./certificates/localhost-key.pem` and
`./certificates/localhost.pem`.

1. `Reopen in Container` and open a shell inside the devcontainer.
2. Generate certificates in the repository (writes to `./certificates`):

<!-- markdownlint-disable MD013 -->
```bash
mkdir -p certificates
mkcert -key-file ./certificates/localhost-key.pem -cert-file ./certificates/localhost.pem localhost 127.0.0.1 ::1
```
<!-- markdownlint-enable MD013 -->

>[!NOTE]
> The repository's `.gitignore` already excludes `certificates` and `*.pem`.

1. Start the HTTPS dev server inside the container:

```bash
npm run dev:https
```

> [!IMPORTANT]
> This workflow is container-local and requires no host-side steps for the
>common devcontainer setups used by contributors. If your browser still
>warns about the certificate, you can export and import the container's CA
>root (`certificates/rootCA.pem`) into the host or browser trust store.
>If you prefer not to add certificates to any trust store, use `npm run dev`
>(HTTP) instead.

## Project Structure

```text
app/              Next.js App Router pages and API routes
  [locale]/       Locale-prefixed pages (sv, en)
  api/            REST API endpoints
components/       Reusable React components
drizzle/          Database schema, seed data & migrations
i18n/             Internationalization configuration
lib/              Shared utilities and data-access layer
  dal/            Data Access Layer modules
messages/         Translation files (en.json, sv.json)
docs/             Project documentation
tests/            Unit and integration tests
```

## Developer Mode / Developer Help

The hidden Developer Mode overlay is a maintained developer-help surface for AI
agents and humans who need stable UI names. If you change visible UI elements,
labels, layout surfaces, or interaction patterns, update the relevant:

- `devMarker(...)` usage or scanner heuristics
- [docs/developer-mode-overlay.md](docs/developer-mode-overlay.md)
- unit and integration tests that cover the affected surface
- repo instructions if the maintenance rule itself changes

Developer Mode is split into internal dev-only packages:

- `packages/developer-mode-core`
- `packages/developer-mode-react`
- README-style package drafts:
  - [docs/developer-mode-core-README.md](docs/developer-mode-core-README.md)
  - [docs/developer-mode-react-README.md](docs/developer-mode-react-README.md)

App code should use `devMarker(...)` from
[`lib/developer-mode-markers.ts`](lib/developer-mode-markers.ts) instead of
hardcoding `data-developer-mode-*` attributes directly. Local development
enables the real Developer Mode runtime automatically. Production
builds alias the Developer Mode packages to no-op entrypoints by default, so
the overlay runtime and curated marker output are excluded unless
`ENABLE_DEVELOPER_MODE=true` is set explicitly.

To enable Developer Mode in a browser, focus a non-editable part of the page and
press `Command+Option+Shift+H` on macOS or `Ctrl+Alt+Shift+H` on Windows/Linux.
See [docs/developer-mode-overlay.md](docs/developer-mode-overlay.md) for the full
behavior and maintenance rules.

## Dependency Management

### Purge Install

The `npm run purge:install` script uses a **two-phase install**:

1. Delete `node_modules`, clean cache, run `npm install`
   (rebuilds the tree but may produce a corrupt lockfile)
2. Delete `package-lock.json`, run `npm install` again
   (regenerates a clean lockfile with `node_modules` present)

<!-- cSpell:ignore EBADPLATFORM -->
This works around an npm bug where platform-specific optional
dependencies are written to the lockfile as `"extraneous"` instead
of `"optional"` when `node_modules` is absent during resolution.
A corrupt lockfile causes `npm ci` in CI to fail with `EBADPLATFORM`.

Do **not** simplify `purge:install` into a single
`rm -rf node_modules package-lock.json && npm install` — that
reproduces the bug.

## MCP Server

The repository includes an MCP server for requirements management. Use these
docs when working on it:

- [docs/mcp-server-user-guide.md](docs/mcp-server-user-guide.md)
- [docs/mcp-server-contributor-guide.md](docs/mcp-server-contributor-guide.md)
- [docs/TODO-mcp-server-auth-plan.md](docs/TODO-mcp-server-auth-plan.md)

## OpenRouter (AI Requirement Generation)

The application uses **OpenRouter** as its AI backend for requirement
generation. OpenRouter provides access to many reasoning models from
multiple providers (Anthropic, Google, OpenAI, DeepSeek, Qwen, etc.)
via a single API key.

### Configuration

| Variable                    | Default | Description                    |
| --------------------------- | ------- | ------------------------------ |
| `OPENROUTER_API_KEY`        | —       | OpenRouter API key             |
| `OPENROUTER_MGMT_API_KEY`   | —       | Management key (org credits)   |
| `NEXT_PUBLIC_DEFAULT_MODEL` | —       | Default model ID               |

1. Get an API key at <https://openrouter.ai/keys>
2. Add it to `.env.development.local`:

   ```env
   OPENROUTER_API_KEY=sk-or-v1-...
   ```

3. Restart the dev server — the AI modal will show available models.

### Verifying the Setup

```bash
# List available models via the app's API
curl -s http://localhost:3000/api/ai/models | jq '.models | length'

# Check credit balance
curl -s http://localhost:3000/api/ai/credits | jq .
```

## Internationalization

The application supports **Swedish** (default) and **English**.
Locale is determined by the URL prefix (`/sv/...` or `/en/...`).
Translation strings are stored in [messages/](messages/).

## Database

The application uses **SQLite** via Drizzle ORM. The default local and CI
workflow runs the database behind a small HTTP proxy service in a separate
container, which keeps the development shape close to the later container-based
production deployment.

For the full schema reference, see
[docs/database-schema.md](docs/database-schema.md). Status
transitions are documented in
[docs/lifecycle-workflow.md](docs/lifecycle-workflow.md), and version
lifecycle dates in
[docs/version-lifecycle-dates.md](docs/version-lifecycle-dates.md).

### Useful Commands

| Command               | Description                                  |
| --------------------- | -------------------------------------------- |
| `npm run db:generate` | Generate migrations from schema              |
| `npm run db:up`       | Start the local SQLite proxy DB container    |
| `npm run db:down`     | Stop the local SQLite proxy DB container     |
| `npm run db:health`   | Check the configured database endpoint       |
| `npm run db:migrate`  | Apply migrations to the configured SQLite DB |
| `npm run db:seed`     | Seed the configured SQLite DB with test data |
| `npm run db:reset`    | Reset the configured SQLite DB               |
| `npm run db:setup`    | Wait, reset, migrate, and seed in one step   |
| `npm run db:browse`   | Open the inspectable SQLite file in VS Code  |

### Browsing the Local Database

The recommended VS Code extension **SQLite Viewer**
(`qwtel.sqlite-viewer`) is included in the dev container. In both
devcontainer variants, the shared SQLite Docker volume is mounted
read-only into the app container, so you can inspect the live database
without opening a shell in the `db` service.

1. Run `npm run db:browse`, or open the database file in VS Code:

   ```text
   /var/lib/kravhantering/devcontainer.sqlite
   ```

1. For direct CLI inspection, run:

   ```bash
   sqlite3 /var/lib/kravhantering/devcontainer.sqlite
   ```

For host-based development outside the dev container, the database file
still lives inside the `db` service volume at
`/var/lib/kravhantering/dev.sqlite`. In that workflow, either inspect the
volume through Docker tooling or point `DATABASE_URL` at a local file such
as `file:./tmp/dev.sqlite` and rerun `npm run db:setup`. The `db:browse`
script works automatically in the devcontainer and in file-backed
`DATABASE_URL` mode. With the host-based Docker proxy workflow, it will
explain that the live SQLite file is not mounted locally.

> [!Tip]
> The default contributor path is:
>
> 1. `npm run db:up`
> 2. `npm run db:setup`
> 3. `npm run dev`
