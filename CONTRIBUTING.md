# Contributing

## Getting Started

This project uses a [Dev Container](https://containers.dev/) for a
consistent development environment. Open the project in VS Code and
use **Reopen in Container** to get started automatically.

## Available Scripts

<!-- markdownlint-disable MD013 -->
| Command                          | Description                                   |
| -------------------------------- | --------------------------------------------- |
| `npm run dev`                    | Start Next.js development server              |
| `npm run build`                  | Production build                              |
| `npm run start`                  | Start the production server                   |
| `npm run check`                  | Run all checks (types, format, lint, tests)   |
| `npm run test`                   | Run unit tests with Vitest                    |
| `npm run test:watch`             | Run unit tests in watch mode                  |
| `npm run test:coverage`          | Run unit tests with coverage                  |
| `npm run test:integration`       | Run Playwright integration tests              |
| `npm run lint`                   | Lint with Biome                               |
| `npm run lint:fix`               | Lint and auto-fix with Biome                  |
| `npm run format`                 | Format code with Biome                        |
| `npm run spell`                  | Spell check with cspell                       |
| `npm run lint:md`                | Lint Markdown files                           |
| `npm run fix`                    | Auto-fix formatting, linting & Markdown       |
| `npm run type-check`             | TypeScript type checking                      |
| `npm run preview`                | Build and preview with Wrangler               |
| `npm run deploy`                 | Build and deploy to Cloudflare                |
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

## MCP Server

The repository includes an MCP server for requirements management. Use these
docs when working on it:

- [docs/mcp-server-user-guide.md](docs/mcp-server-user-guide.md)
- [docs/mcp-server-contributor-guide.md](docs/mcp-server-contributor-guide.md)
- [docs/TODO-mcp-server-auth-plan.md](docs/TODO-mcp-server-auth-plan.md)

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
