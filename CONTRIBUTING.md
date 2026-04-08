# Contributing

## Getting Started

This project uses a [Dev Container](https://containers.dev/) for a
consistent development environment. Open the project in VS Code and
use **Reopen in Container** to get started automatically.

If VS Code prompts you to choose a configuration, use
**Kravhantering Development** for the default container. If you want
the stricter opt-out variant that does not set
`seccomp=unconfined`, choose
**Kravhantering Development (Strict)** from
[`.devcontainer/strict/devcontainer.json`](.devcontainer/strict/devcontainer.json).
That stricter variant can prevent AI agents from working correctly
when they rely on nested sandboxing features.

## Available Scripts

<!-- markdownlint-disable MD013 -->
| Command                    | Description                                      |
| -------------------------- | ------------------------------------------------ |
| `npm run dev`              | Start Next.js development server                 |
| `npm run build`            | Production build                                 |
| `npm run start`            | Start the production server                      |
| `npm run check`            | Run all checks (TS, Python, format, lint, tests) |
| `npm run test`             | Run unit tests with Vitest                       |
| `npm run test:watch`       | Run unit tests in watch mode                     |
| `npm run test:coverage`    | Run unit tests with coverage                     |
| `npm run test:integration` | Run Playwright integration tests                 |
| `npm run lint`             | Lint with Biome                                  |
| `npm run lint:fix`         | Lint and auto-fix with Biome                     |
| `npm run lint:py`          | Type-check Python scripts with Pyright           |
| `npm run format`           | Format code with Biome                           |
| `npm run spell`            | Spell check with cspell                          |
| `npm run lint:md`          | Lint Markdown files                              |
| `npm run fix`              | Auto-fix formatting, linting & Markdown          |
| `npm run type-check`       | TypeScript type checking                         |
| `npm run preview`          | Build and preview with Wrangler                  |
| `npm run deploy`           | Build and deploy to Cloudflare                   |
<!-- markdownlint-enable MD013 -->

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
`build`/`preview`/`deploy` flows alias the Developer Mode packages to no-op
entrypoints by default, so the overlay runtime and curated marker output are
excluded unless `ENABLE_DEVELOPER_MODE=true` is set explicitly.

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

## Ollama (AI Requirement Generation)

The dev container includes an **Ollama** sidecar for local AI-powered
requirement generation. Ollama runs as a separate Docker Compose
service and auto-pulls the configured model on first start.

### Configuration

| Variable       | Default                         | Description               |
| -------------- | ------------------------------- | ------------------------- |
| `OLLAMA_HOST`  | `http://ollama:11434`           | Ollama API URL            |
| `OLLAMA_MODEL` | `qwen3:14b`                     | Model to auto-pull        |

Override these in `.env` or `.devcontainer/docker-compose.yml`.

### Checking Ollama Status (Inside Dev Container)

```bash
# Is Ollama running?
curl -sf http://ollama:11434/
# → "Ollama is running"

# List downloaded models
curl -s http://ollama:11434/api/tags | jq .

# List models via the app's API
curl -s http://localhost:3000/api/ai/models | jq .
```

### Checking Ollama Status (From Host)

VS Code starts the Compose project with its own project name, so
bare `docker compose` commands won't find the containers. Use
`docker ps` to find the actual Ollama container first:

```bash
# Find the Ollama container name/ID
docker ps --filter "ancestor=ollama/ollama" \
  --format "{{.ID}}  {{.Names}}  {{.Status}}"

# View its logs (shows entrypoint + pull progress)
docker logs -f <container_name>

# Exec into the Ollama container
docker exec -it <container_name> bash

# Once inside, test the entrypoint logic
ollama list
```

To restart the Ollama sidecar (re-runs the entrypoint):

```bash
docker restart <container_name>
docker logs -f <container_name>
```

### Pulling Models Manually

If the auto-pull didn't run (e.g. first start before the
entrypoint fix), pull from inside the dev container:

```bash
# Pull the default model (~9 GB)
curl -X POST http://ollama:11434/api/pull \
  -d '{"name": "qwen3:14b"}' --no-buffer

# Or pull a smaller model for quick testing (~1.5 GB)
curl -X POST http://ollama:11434/api/pull \
  -d '{"name": "qwen3:1.7b"}' --no-buffer
```

### GPU Acceleration

For NVIDIA GPU support, add the GPU override when starting:

```bash
docker compose -f .devcontainer/docker-compose.yml \
  -f .devcontainer/docker-compose.gpu.yml up -d
```

### Persistent Storage

Downloaded models are stored in the `ollama-data` Docker volume.
Models persist across container rebuilds — only the first start
requires a download.

## Internationalization

The application supports **Swedish** (default) and **English**.
Locale is determined by the URL prefix (`/sv/...` or `/en/...`).
Translation strings are stored in [messages/](messages/).

## Database

The application uses **Cloudflare D1** (SQLite) for its database.
Locally, Wrangler stores the D1 database as a SQLite file under the
`.wrangler/` directory.

For the full schema reference, see
[docs/database-schema.md](docs/database-schema.md). Status
transitions are documented in
[docs/lifecycle-workflow.md](docs/lifecycle-workflow.md), and version
lifecycle dates in
[docs/version-lifecycle-dates.md](docs/version-lifecycle-dates.md).

### Useful Commands

| Command              | Description                            |
| -------------------- | -------------------------------------- |
| `npm run db:generate`| Generate migrations from schema        |
| `npm run db:migrate` | Apply migrations to the local D1 DB    |
| `npm run db:seed`    | Seed the local database with test data |
| `npm run db:reset`   | Delete the local D1 database files     |
| `npm run db:setup`   | Reset, migrate & seed in one step      |
| `npm run db:browse`  | Open the local SQLite DB in VS Code    |
| `npm run db:studio`  | Open Drizzle Studio                    |

### Browsing the Local Database

The recommended VS Code extension **SQLite Viewer**
(`qwtel.sqlite-viewer`) is included in the dev container. To inspect
the database:

1. Open the **Explorer** sidebar.
2. Navigate to the `.wrangler/` folder. The SQLite file is located at
   a path like:

   ```text
   .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
   ```

3. Click the `.sqlite` file. SQLite Viewer opens it in a visual table
   browser where you can inspect schema and data.

> [!Tip]
> Run `npm run db:browse` to open the database file directly
> in VS Code with SQLite Viewer.
