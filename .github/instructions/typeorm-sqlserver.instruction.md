---
applyTo: "{lib/typeorm/**/*.ts,typeorm/**/*.ts,lib/db.ts,scripts/db-admin.mjs,scripts/db-sqlserver-admin.mjs,scripts/__tests__/db-sqlserver-admin.test.mjs,docker-compose.sqlserver.yml,package.json,docs/sql-server-*.md}"
---

# TypeORM + Microsoft SQL Server

Use this guidance when generating or revising the SQL Server + TypeORM path in
this repository.

## Migration Direction

- The approved target architecture is **SQL Server + TypeORM**.
- Follow `docs/sql-server-typeorm-migration-plan.md`.
- Treat the current SQLite + Drizzle runtime as **migration debt**, not as a
  second long-term architecture.
- Do not add new permanent features that depend on the SQLite proxy model.
- Preserve current dev/test seed-data meaning and identifiers unless a change is
  absolutely necessary for SQL Server correctness.

## Core Position

- Use **TypeORM Data Mapper**, not Active Record.
- Default to **repositories** and **QueryBuilder**.
- Use **parameterized raw SQL** when QueryBuilder would be materially worse or a
  SQL Server feature is required.
- Use **stored procedures selectively**, not as the default for CRUD.
- Prefer **explicit, predictable SQL behavior** over ORM convenience in
  performance-sensitive paths.

## DataSource And Connection Rules

- Create **one shared `DataSource` per app process**.
- Do **not** create a new connection per request.
- Reuse connection pooling.
- Keep configuration centralized in `lib/typeorm/sqlserver-config.ts` and
  `lib/typeorm/data-source.ts`.
- During the coexistence window, SQL Server scaffolding may use:
  - `SQLSERVER_DATABASE_URL`
  - `SQLSERVER_DATABASE_READONLY_URL`
- After cutover, the canonical runtime contract should be:
  - `DATABASE_URL`
  - `DATABASE_READONLY_URL`
- Production defaults:
  - `synchronize: false`
  - `schema: "dbo"` unless a different schema is explicitly required
  - minimal logging, usually errors only
  - `options.encrypt: true`
  - `options.trustServerCertificate: false`
  - `options.useUTC: true` when the driver/settings surface supports it
  - `options.abortTransactionOnError: true` when the driver/settings surface
    supports it
  - explicit timeout values
- Configure pool and timeout values explicitly.

### Preferred Pool Baseline

- `pool.max`: moderate and capacity-aware
- `pool.min`: low but nonzero
- `idleTimeoutMillis`: explicit
- `acquireTimeoutMillis`: explicit when the chosen driver surface supports it
- `requestTimeout`: explicit

## Schema And Migration Rules

- Use **TypeORM migrations** for schema changes.
- Do **not** recommend `synchronize: true` for production or shared
  environments.
- Treat procedures, views, indexes, and constraints as versioned schema assets.
- Keep the future SQL Server schema, docs, and migration plan aligned.
- If a migration-phase change still has to touch legacy Drizzle assets, keep
  them internally consistent and document the bridge clearly.

## Query Decision Order

Use this order:

1. Repository methods for simple CRUD, direct lookup, counts, existence checks,
   and direct `insert` / `update` / `delete`.
2. QueryBuilder for joins, filtering, sorting, projections, pagination, and
   most non-trivial reads.
3. Raw SQL for SQL Server-specific features, CTE-heavy queries, window
   functions, complex reporting, and performance-critical queries.
4. Stored procedures only when SQL Server is clearly the right abstraction.

### Repository And QueryBuilder Preferences

- Use `save()` only when insert-or-update entity behavior is truly needed.
- Prefer explicit `select` clauses.
- Prefer `getRawMany()` / `getRawOne()` when full entity hydration is
  unnecessary.
- Avoid blanket eager loading and lazy loading in hot paths.
- Do not create N+1 query patterns.

## Transaction Rules

- Use `DataSource.transaction(...)` or `QueryRunner`.
- Inside a TypeORM transaction, use **only** the provided transactional
  manager.
- Keep one logical multi-table mutation inside one atomic helper.
- Do not split transaction orchestration across route handlers and DAL helpers.
- If a transaction must share one dedicated connection or mix multiple low-level
  operations, prefer `QueryRunner`.

## Performance Rules

- Select **only required columns**.
- Avoid loading full entities for list/report endpoints.
- Avoid relation-heavy object graphs unless they are truly needed.
- Paginate large result sets.
- Use streaming for very large result sets if the calling path truly needs it.
- Add indexes for real filter/join/sort patterns.
- Prefer direct `insert` / `update` / `delete` over `save()` in hot paths.
- Do not claim stored procedures are automatically faster than QueryBuilder or
  parameterized raw SQL.

## Stored Procedure Policy

- Do **not** recommend stored procedures for all CRUD.
- Good use cases:
  - complex multi-step write workflows
  - set-based bulk operations
  - reporting and aggregation
  - temp-table or multi-statement T-SQL workflows
  - stable database-side contracts
- Avoid procedures for:
  - simple `get by id`
  - trivial CRUD wrappers
  - logic that is clearer and safer in TypeScript

### Procedure Design Rules

- Use `CREATE OR ALTER PROCEDURE`.
- Prefer `SET NOCOUNT ON`.
- For write-heavy or transactional procedures, prefer `SET XACT_ABORT ON`.
- Use `TRY...CATCH` for important business procedures.
- Prefer predictable result sets over magic return codes.

## Calling Stored Procedures From TypeORM

### Preferred Default

- Use `dataSource.query(...)` for simple procedure calls.
- Use `queryRunner.query(...)` when transaction boundaries or connection
  affinity matter.

### Safety Rules

- Always parameterize inputs.
- Never concatenate user input into `EXEC` strings.
- Keep procedure calls isolated in repository or service-layer code.
- Map results to typed DTOs or interfaces in TypeScript.

### Escalation Rule

- If the system becomes heavily procedure-driven and needs output parameters,
  multiple recordsets, or SQL Server-specific execution semantics, note that a
  direct `node-mssql` integration may be a better caller for that specific path
  than forcing everything through TypeORM.

## Security Rules

- Parameterize all raw SQL and procedure calls.
- Do not recommend `trustServerCertificate: true` in production unless there is
  an explicit, documented reason.
- Prefer least-privilege DB permissions.
- Procedures may be used to reduce direct table permissions when that improves
  the security model.

## Read-Only Browse Workflow

- Preserve a supported **read-only** database browsing path for developers.
- Prefer the VS Code-friendly SQLTools + MSSQL driver workflow documented in
  `docs/sql-server-developer-workflow.md`.
- Do not document or generate browse flows that require write-capable
  credentials.
- Keep read-only connection material separate from production secrets.

## Required Documentation Updates

When SQL Server + TypeORM behavior changes, update the relevant docs:

- `docs/sql-server-typeorm-migration-plan.md`
- `docs/sql-server-developer-workflow.md`
- `docs/database-schema.md`
- `docs/arkitekturbeskrivning-kravhantering.md`
- any other `docs/*.md` or repo `**/*.md` files that describe the supported
  database workflow

## Required Verification

- Add or update focused tests for changed DB/admin logic.
- Run `npm run type-check`.
- Run the most direct Vitest coverage for the changed SQL Server scaffold or
  TypeORM code.
- If markdown docs changed, run `npm run lint:md`.
