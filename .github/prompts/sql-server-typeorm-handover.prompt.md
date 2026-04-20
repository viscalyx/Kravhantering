---
agent: agent
description: 'AI-only handover prompt for continuing the SQL Server + TypeORM migration'
---

# SQL Server + TypeORM Migration Handover

Use this prompt when taking over the in-progress migration from
**SQLite + Drizzle** to **Microsoft SQL Server + TypeORM** in this repository.

Do not restart the analysis from scratch. Continue from the current migration
state, preserve existing progress, and focus on the remaining SQLite-bound
runtime slices.

## Mission

- Complete the application cutover to **SQL Server + TypeORM**.
- Treat the existing SQLite + Drizzle runtime as **migration debt**, not a
  second supported architecture.
- Prefer **small, complete migration slices** over broad partial rewrites.
- Do not revert unrelated user changes already present in the worktree.
- Preserve existing **seed-data meaning and coverage** unless a change is
  absolutely necessary for SQL Server correctness.

## Canonical References

Read these first:

- [docs/sql-server-typeorm-migration-plan.md](../../docs/sql-server-typeorm-migration-plan.md)
- [docs/sql-server-developer-workflow.md](../../docs/sql-server-developer-workflow.md)
- [.github/instructions/typeorm-sqlserver.instruction.md](../instructions/typeorm-sqlserver.instruction.md)
- [.github/instructions/database-schema.instructions.md](../instructions/database-schema.instructions.md)
- [.github/instructions/database-writes.instructions.md](../instructions/database-writes.instructions.md)
- [.github/instructions/tests.instructions.md](../instructions/tests.instructions.md)

## Approved Target Architecture

- **Database:** Microsoft SQL Server only
- **ORM:** TypeORM
- **Pattern:** TypeORM Data Mapper only
- **Runtime:** one SQL Server connection contract after cutover
- **Non-prod:** containerized SQL Server Developer
- **Prod/shared envs:** external SQL Server endpoint

Do not introduce new SQLite-first code paths.

## Important Environment Constraints

Current known blocker:

- The current developer machine is **macOS on Apple Silicon (M4 / ARM)**.
- The SQL Server container image in the current workflow is **not usable there**,
  so live SQL Server container validation is currently blocked until work can
  continue on a **Windows/x64-capable environment** or another environment that
  can run the chosen SQL Server image.

Current practical consequences:

- Continue migrating code, routes, DALs, docs, and tests **without waiting**
  for a live SQL Server container.
- Do not spend time trying to force the current SQL Server container to work on
  this ARM machine unless the stack itself changes.
- The host shell used during recent migration work may also lack `node` / `npm`
  outside the devcontainer, so automated verification may need to wait for a
  working devcontainer or another machine.

## What Has Already Been Done

### 1. Canonical plan and docs

The approved migration plan and scaffold docs are already written:

- [docs/sql-server-typeorm-migration-plan.md](../../docs/sql-server-typeorm-migration-plan.md)
- [docs/sql-server-developer-workflow.md](../../docs/sql-server-developer-workflow.md)

Relevant repo docs and AI instructions have already been updated toward the
approved SQL Server + TypeORM direction.

### 2. SQL Server / TypeORM scaffolding exists

The repo already contains:

- SQL Server compose/devcontainer scaffolding
- shared devcontainer env flow using `.devcontainer/.env`
- default SQL Server host port changed to **1433**
- SQL Server admin/setup scaffolding
- SQL Server schema bootstrap logic from the legacy SQLite schema snapshot
- initial TypeORM SQL Server migration and config files

Important files:

- [docker-compose.sqlserver.yml](../../docker-compose.sqlserver.yml)
- [.devcontainer/docker-compose.yml](../../.devcontainer/docker-compose.yml)
- [.devcontainer/elevated/docker-compose.yml](../../.devcontainer/elevated/docker-compose.yml)
- [lib/typeorm/sqlserver-config.ts](../../lib/typeorm/sqlserver-config.ts)
- [lib/typeorm/data-source.ts](../../lib/typeorm/data-source.ts)
- [scripts/db-sqlserver-admin.mjs](../../scripts/db-sqlserver-admin.mjs)
- [scripts/sqlserver-bootstrap.mjs](../../scripts/sqlserver-bootstrap.mjs)
- [typeorm/migrations/0001_initial_sqlserver.mjs](../../typeorm/migrations/0001_initial_sqlserver.mjs)

### 3. Provider-aware DB bridge exists

[lib/db.ts](../../lib/db.ts) already supports:

- provider detection (`legacy-sqlite` vs `sqlserver-typeorm`)
- SQL Server `DataSource` caching
- `getRequestDatabaseConnection()`

Important rule:

- `getRequestDatabase()` is still the **legacy SQLite-only** helper
- `getRequestDatabaseConnection()` is the bridge for migrated routes/DALs

Do not point newly migrated routes back to `getRequestDatabase()`.

### 4. These slices are already migrated to the shared request DB connection

These routes/DALs already use `getRequestDatabaseConnection()` and should be
treated as established migration examples:

- owners
- requirement areas
- requirement categories
- requirement types
- requirement statuses
- quality characteristics
- risk levels
- usage scenarios
- norm references
- package responsibility areas
- package implementation types
- package lifecycle statuses
- package item statuses
- admin terminology
- admin requirement columns
- UI settings loader and affected pages
- AI taxonomy/system prompt surfaces
- improvement suggestions

Examples:

- [lib/dal/owners.ts](../../lib/dal/owners.ts)
- [lib/dal/improvement-suggestions.ts](../../lib/dal/improvement-suggestions.ts)
- [app/api/owners/route.ts](../../app/api/owners/route.ts)
- [app/api/requirement-suggestions/[id]/route.ts](../../app/api/requirement-suggestions/[id]/route.ts)
- [app/api/improvement-suggestions/[id]/route.ts](../../app/api/improvement-suggestions/[id]/route.ts)

### 5. Tests already added for migrated SQL Server-compatible slices

Examples:

- [tests/unit/owners-dal.typeorm.test.ts](../../tests/unit/owners-dal.typeorm.test.ts)
- [tests/unit/improvement-suggestions-dal.typeorm.test.ts](../../tests/unit/improvement-suggestions-dal.typeorm.test.ts)
- [tests/unit/improvement-suggestions-route.test.ts](../../tests/unit/improvement-suggestions-route.test.ts)

Use these as the testing pattern for new migration slices.

## What Is Still Left

The remaining work is concentrated in the **core requirement/package/deviation**
runtime. These still rely on `getRequestDatabase()` and/or SQLite-shaped DALs.

### Primary remaining blockers

These are the biggest migration blockers and should be treated as the core
cutover backlog:

- [lib/requirements/service.ts](../../lib/requirements/service.ts)
  This still takes `Database` instead of `AppDatabaseConnection`.
- [lib/dal/requirements.ts](../../lib/dal/requirements.ts)
  This is still heavily Drizzle/SQLite-shaped.
- [lib/dal/requirement-packages.ts](../../lib/dal/requirement-packages.ts)
  Still legacy.
- [lib/dal/deviations.ts](../../lib/dal/deviations.ts)
  Still legacy and still depends on SQLite-specific behavior such as
  `unionAll` from `drizzle-orm/sqlite-core`.

### Remaining legacy route clusters

These routes still call `getRequestDatabase()` and are not yet migrated:

#### Requirements / requirement transitions / MCP

- [app/api/requirements/route.ts](../../app/api/requirements/route.ts)
- [app/api/requirements/[id]/route.ts](../../app/api/requirements/[id]/route.ts)
- [app/api/requirements/[id]/delete-draft/route.ts](../../app/api/requirements/%5Bid%5D/delete-draft/route.ts)
- [app/api/requirements/[id]/reactivate/route.ts](../../app/api/requirements/%5Bid%5D/reactivate/route.ts)
- [app/api/requirements/[id]/restore/route.ts](../../app/api/requirements/%5Bid%5D/restore/route.ts)
- [app/api/requirements/[id]/versions/[version]/route.ts](../../app/api/requirements/%5Bid%5D/versions/%5Bversion%5D/route.ts)
- [app/api/requirement-transitions/[id]/route.ts](../../app/api/requirement-transitions/%5Bid%5D/route.ts)
- [app/api/mcp/route.ts](../../app/api/mcp/route.ts)

These remain blocked on the requirements service and requirements DAL.

#### Requirement packages

- [app/api/requirement-packages/route.ts](../../app/api/requirement-packages/route.ts)
- [app/api/requirement-packages/[id]/route.ts](../../app/api/requirement-packages/%5Bid%5D/route.ts)
- [app/api/requirement-packages/[id]/needs-references/route.ts](../../app/api/requirement-packages/%5Bid%5D/needs-references/route.ts)
- [app/api/requirement-packages/[id]/items/route.ts](../../app/api/requirement-packages/%5Bid%5D/items/route.ts)
- [app/api/requirement-packages/[id]/items/[itemId]/route.ts](../../app/api/requirement-packages/%5Bid%5D/items/%5BitemId%5D/route.ts)
- [app/api/requirement-packages/[id]/report-items/route.ts](../../app/api/requirement-packages/%5Bid%5D/report-items/route.ts)
- [app/api/requirement-packages/[id]/deviations/route.ts](../../app/api/requirement-packages/%5Bid%5D/deviations/route.ts)
- [app/api/requirement-packages/[id]/local-requirements/route.ts](../../app/api/requirement-packages/%5Bid%5D/local-requirements/route.ts)
- [app/api/requirement-packages/[id]/local-requirements/[localRequirementId]/route.ts](../../app/api/requirement-packages/%5Bid%5D/local-requirements/%5BlocalRequirementId%5D/route.ts)

#### Deviations / package-local deviations / package-item deviations

- [app/api/deviations/[id]/route.ts](../../app/api/deviations/%5Bid%5D/route.ts)
- [app/api/deviations/[id]/decision/route.ts](../../app/api/deviations/%5Bid%5D/decision/route.ts)
- [app/api/deviations/[id]/request-review/route.ts](../../app/api/deviations/%5Bid%5D/request-review/route.ts)
- [app/api/deviations/[id]/revert-to-draft/route.ts](../../app/api/deviations/%5Bid%5D/revert-to-draft/route.ts)
- [app/api/package-local-deviations/[id]/route.ts](../../app/api/package-local-deviations/%5Bid%5D/route.ts)
- [app/api/package-local-deviations/[id]/decision/route.ts](../../app/api/package-local-deviations/%5Bid%5D/decision/route.ts)
- [app/api/package-local-deviations/[id]/request-review/route.ts](../../app/api/package-local-deviations/%5Bid%5D/request-review/route.ts)
- [app/api/package-local-deviations/[id]/revert-to-draft/route.ts](../../app/api/package-local-deviations/%5Bid%5D/revert-to-draft/route.ts)
- [app/api/package-item-deviations/[itemId]/route.ts](../../app/api/package-item-deviations/%5BitemId%5D/route.ts)

## Recommended Next Order

Follow this order unless fresh repo evidence makes a different order clearly
lower risk:

1. **Port deviations next**
   - They are conceptually close to improvement suggestions.
   - They should be easier than the full requirements service rewrite.
   - This removes another meaningful chunk of `getRequestDatabase()` usage.

2. **Port package-local deviations and package-item deviations**
   - Keep the deviation family together.

3. **Port requirement packages**
   - Migrate `lib/dal/requirement-packages.ts` and the package routes.

4. **Port requirements + requirements service**
   - Widen [lib/requirements/service.ts](../../lib/requirements/service.ts)
     from `Database` to `AppDatabaseConnection`.
   - Rework [lib/dal/requirements.ts](../../lib/dal/requirements.ts) away from
     SQLite-only assumptions.

5. **Finish the final route cleanup**
   - requirement transitions
   - MCP route

6. **Only then remove the legacy request helper**
   - After all route call sites are migrated, remove or hard-fail the legacy
     runtime path behind `getRequestDatabase()`.

## Migration Pattern To Follow

When migrating a new slice:

1. Change the route to use `getRequestDatabaseConnection()`.
2. Widen the DAL to accept `AppDatabaseConnection`.
3. Preserve the existing SQLite/Drizzle path during coexistence.
4. Add a SQL Server-compatible path using:
   - TypeORM repository methods where that is straightforward
   - QueryBuilder or parameterized `query(...)` when the SQL is more direct
5. Keep the behavior, validation messages, and business rules unchanged.
6. Add focused tests for:
   - the new SQL Server-compatible path
   - the route switching to `getRequestDatabaseConnection()`

Good current examples:

- [lib/dal/owners.ts](../../lib/dal/owners.ts)
- [lib/dal/improvement-suggestions.ts](../../lib/dal/improvement-suggestions.ts)

## Seed Data Rule

Preserve existing seed-data behavior:

- stable IDs where feasible
- current scenario coverage
- edge-case fixtures
- user-visible example data
- status/version/reference relationships

Do not “clean up” seed data casually during migration.

## Devcontainer / Env Notes

These decisions are already in place:

- shared `.devcontainer/.env` for both default and elevated profiles
- no separate elevated env file is required anymore
- SQL Server host port default is now **1433**

If you touch container/devcontainer files again, preserve those decisions unless
there is a strong reason not to.

## Verification Expectations

When a working Node/devcontainer environment is available:

- run focused unit tests for touched DALs/routes
- run `npm run type-check`
- run targeted lint checks

When a working SQL Server environment is available:

- run SQL Server health/setup workflow
- validate `db:setup`
- smoke-test the newly migrated slices against SQL Server

Current limitation:

- On the current host session used during recent migration work, `node` and
  `npm` were not available outside the devcontainer, so some recent migration
  slices were verified by direct code review only.

## Final Goal

The end-state is:

- no app/API route depends on `getRequestDatabase()`
- no supported runtime path depends on SQLite
- SQL Server + TypeORM is the only supported application database path
- legacy SQLite tooling remains only as temporary migration scaffolding, or is
  removed once no longer needed
