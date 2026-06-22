# Contributing

This file is the short entry point for contributors. Detailed setup and
subsystem workflows live under `docs/development/`, `docs/integrations/`, and
`docs/governance/`.

## Quick Start

The default development environment is the VS Code Dev Container.

1. Open the repository in VS Code.
2. Run **Dev Containers: Reopen in Container**.
3. Use **Kravhantering Development** when VS Code asks for a configuration.
4. Run `npm run dev`.

Use **Kravhantering Development (Elevated)** only when agent sandboxing needs
extra container permissions such as `SYS_ADMIN` and `seccomp=unconfined`.

Host-based development also works when Node.js 24, npm, and a Docker-compatible
`docker compose` runtime are installed:

```sh
npm run db:up
npm run db:setup
npm run dev
```

Core setup docs:

- [Dev Container workflow](docs/development/devcontainer-developer-workflow.md)
- [SQL Server workflow](docs/development/sql-server-developer-workflow.md)
- [Auth workflow](docs/development/auth-developer-workflow.md)
- [Developer tools guide](docs/development/utvecklarguide.md)

Alternative environments:

- [GitHub Codespaces](docs/development/github-codespaces.md)
- [OpenShift Dev Spaces](docs/development/openshift-devspaces.md)
- [Remote SSH on RHEL 10](docs/development/remote-ssh-rhel10-development.md)

## Contributor Checklist

Before opening or updating a PR:

- Run `npm run check` when feasible. If a narrower command is more appropriate,
  state what you ran.
- Add or update automated tests for changed behavior.
- Update relevant `docs/**/*.md` when behavior, workflow, setup, or contracts
  change.
- For user-facing functionality, roles/permissions, reports, lifecycle, privacy,
  admin behavior, or visible workflows, update
  [manual test cases](docs/governance/manuella-testfall.md).
- Keep secrets out of commits. Use `.env.*.local`, Dev Spaces Secrets, or the
  organization's secret manager.
- Follow the matching `.github/instructions/*.md` file for specialized areas
  such as schema changes, translations, reports, Developer Mode, auth, and tests.

## Common Commands

<!-- markdownlint-disable MD013 -->
| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run dev:fresh` | Restart development with a clean `.next/` cache after route-folder changes |
| `npm run check` | Run the full local quality gate |
| `npm run test` | Run unit tests |
| `npm run test:integration` | Run Playwright integration tests |
| `npm run test:integration:prodlike` | Run Playwright against the built prodlike app |
| `npm run lint:fix` | Run Biome autofix |
| `npm run fix` | Run formatting, lint, Markdown, dotenv, and spell fixers |
| `npm run db:setup` | Reset, migrate, seed, and configure the local SQL Server database |
<!-- markdownlint-enable MD013 -->

Use [dependency workflow](docs/development/dependency-workflow.md) for
`npm run purge:install` and package-install recovery details.

## Project Structure

```text
app/              Next.js App Router pages and API routes
  [locale]/       Locale-prefixed pages (sv, en)
  api/            REST API endpoints
components/       Reusable React components
lib/typeorm/      TypeORM entities, data source, and SQL Server config
typeorm/          Migrations and seed data
i18n/             Internationalization configuration
lib/              Shared utilities and data-access layer
  dal/            Data Access Layer modules
messages/         Translation files (en.json, sv.json)
docs/             Project documentation
tests/            Unit and integration tests
```

## Key Development Docs

- Database stack: [SQL Server workflow](docs/development/sql-server-developer-workflow.md)
  and [database schema](docs/development/database-schema.md).
- Auth and authenticated local HTTP calls:
  [auth developer workflow](docs/development/auth-developer-workflow.md).
- Developer Mode markers:
  [Developer Mode overlay](docs/development/developer-mode-overlay.md).
- MCP server:
  [user guide](docs/integrations/mcp-server-user-guide.md) and
  [contributor guide](docs/integrations/mcp-server-contributor-guide.md).
- Report generation implementation:
  [report generation workflow](docs/development/report-generation-developer-workflow.md).
- AI-assisted authoring local setup and OpenRouter test policy:
  [AI-assisted authoring workflow](docs/development/ai-assisted-authoring-developer-workflow.md).
- AI-assisted authoring behavioral contracts:
  [reference data and AI](docs/governance/reference-data-and-ai.md).
- Internationalization: translation strings live in [messages/](messages/), and
  locale routes use `/sv/...` and `/en/...`.

## Developer Mode

Developer Mode gives visible UI surfaces stable English names for contributors,
tests, and AI-assisted workflows. When changing visible UI surfaces, update the
relevant `devMarker(...)` call sites or scanner heuristics and the tests that
assert those surfaces.

Update [Developer Mode overlay](docs/development/developer-mode-overlay.md) only
when the naming policy, runtime wiring, common marker vocabulary, or contributor
checklist changes.

## Database

The only database stack is Microsoft SQL Server + TypeORM. Schema lives in
`lib/typeorm/entities/`, migrations in `typeorm/migrations/`, and seed data in
`typeorm/seed.mjs`.

For commands, browse workflow, migrations, and seed policy, use
[SQL Server workflow](docs/development/sql-server-developer-workflow.md). For
schema details, use [database schema](docs/development/database-schema.md).

## MCP Server

The repository includes an in-app MCP server for requirements management.
Authentication is enforced for `/api/mcp`; clients must send
`Authorization: Bearer <token>`.

Use the MCP [user guide](docs/integrations/mcp-server-user-guide.md) and
[contributor guide](docs/integrations/mcp-server-contributor-guide.md) when
working on MCP behavior.
