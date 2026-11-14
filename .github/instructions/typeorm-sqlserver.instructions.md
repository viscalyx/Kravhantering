---
applyTo: "{lib/typeorm/**/*.ts,typeorm/**/*.ts,typeorm/migrations/**/*.mjs,typeorm/*seed*.mjs,lib/db.ts,scripts/db-admin.mjs,scripts/db-sqlserver-admin.mjs,scripts/__tests__/db-sqlserver-admin*.test.mjs,docker-compose.sqlserver.yml,package.json,docs/development/sql-server-developer-workflow.md}"
---

# TypeORM + Microsoft SQL Server

## Core Position

- Use TypeORM Data Mapper, not Active Record.
- Default to repositories and QueryBuilder.
- Use parameterized raw SQL when QueryBuilder would be materially worse or a SQL Server feature is required.
- Use stored procedures selectively, not as the default for CRUD.
- Prefer explicit, predictable SQL behavior over ORM convenience in performance-sensitive paths.

## DataSource And Connection Rules

- Create one shared `DataSource` per app process. Do not create a connection per request.
- Reuse connection pooling.
- Keep configuration centralized in `lib/typeorm/sqlserver-config.ts` and `lib/typeorm/data-source.ts`.
- Explicit URL contract: `DATABASE_URL` and `DATABASE_READONLY_URL`.
- Admin scripts may derive connection strings from `DB_*` scaffold values.
- Production defaults:
  - `synchronize: false`
  - `schema: "dbo"` unless a different schema is explicitly required
  - minimal logging, usually errors only
  - `options.encrypt: true`
  - `options.trustServerCertificate: false`
  - `options.useUTC: true` when the driver/settings surface supports it
  - `options.abortTransactionOnError: true` when the driver/settings surface supports it
  - explicit timeout values
- Configure pool and timeout values explicitly.

### Preferred Pool Baseline

- `pool.max`: moderate and capacity-aware
- `pool.min`: low but nonzero
- `idleTimeoutMillis`: explicit
- `acquireTimeoutMillis`: explicit when the chosen driver surface supports it
- `requestTimeout`: explicit

## Schema And Migration Rules

- Use TypeORM migrations for schema changes.
- Do not recommend `synchronize: true` for production or shared environments.
- Treat procedures, views, indexes, and constraints as versioned schema assets.
- See `.github/instructions/database-schema.instructions.md` for naming, versioning, and migration workflow rules.

## Query Decision Order

1. Repository methods for simple CRUD, direct lookup, counts, existence checks, and direct `insert` / `update` / `delete`.
2. QueryBuilder for joins, filtering, sorting, projections, pagination, and most non-trivial reads.
3. Raw SQL for SQL Server-specific features, CTE-heavy queries, window functions, complex reporting, and performance-critical queries.
4. Stored procedures only when SQL Server is clearly the right abstraction.

### Repository And QueryBuilder Preferences

- Use `save()` only when insert-or-update entity behavior is truly needed.
- Prefer explicit `select` clauses.
- Prefer `getRawMany()` / `getRawOne()` when full entity hydration is unnecessary.
- Avoid blanket eager loading and lazy loading in hot paths.
- Do not create N+1 query patterns.

## Transactions And Session State

- Follow `database-writes.instructions.md` for application mutation boundaries.
- Retain TypeORM ownership of the pending-migration transaction and history.
- Use a verified supported connection boundary for work that depends on one
  SQL Server session. A nontransactional QueryRunner alone does not reserve
  a physical connection.
- Verify session-setting scope and restoration before relying on pooled
  connection state.
- Verify supported nested-error recovery before continuing a transaction.
- Preserve each caller's result-set, affected-row and procedure-return
  contract; verify changes through the actual SQL Server driver.
- Apply `NOCOUNT`, SQL error handling and procedure-return interpretation to
  the caller's contract; do not impose one wrapper on every SQL call.

## Performance Rules

- Select only required columns.
- Avoid loading full entities for list/report endpoints.
- Avoid relation-heavy object graphs unless they are truly needed.
- Paginate large result sets.
- Use streaming for very large result sets only when the calling path requires it.
- Add indexes for real filter/join/sort patterns.
- Prefer direct `insert` / `update` / `delete` over `save()` in hot paths.
- Do not assume stored procedures are automatically faster than QueryBuilder or parameterized raw SQL.

## Stored Procedure Policy

- Do not recommend stored procedures for all CRUD.
- Use procedures for:
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

- Use `dataSource.query(...)` for simple procedure calls.
- For procedure calls that depend on transaction or session state, follow
  Transactions And Session State above.
- Always parameterize inputs. Never concatenate user input into `EXEC` strings.
- Keep procedure calls isolated in repository or service-layer code.
- Map results to typed DTOs or interfaces in TypeScript.
- If a path needs output parameters, multiple recordsets, or SQL Server-specific execution semantics, consider a direct `node-mssql` integration for that path instead of TypeORM.

## Security Rules

- Parameterize all raw SQL and procedure calls.
- Do not recommend `trustServerCertificate: true` in production unless there is an explicit, documented reason.
- Prefer least-privilege DB permissions.
- Procedures may be used to reduce direct table permissions when that improves the security model.

## Developer Browse Workflow

- Preserve the SQLTools + MSSQL workflow documented in
  `docs/development/sql-server-developer-workflow.md`.
- Let the developer choose the development browse credential's write access.
- Keep developer connection material separate from production secrets.

## Required Documentation Updates

When SQL Server + TypeORM behavior changes, update the relevant docs:

- `docs/development/sql-server-developer-workflow.md`
- `docs/reference/database-schema.md`
- any other `docs/*.md` or repo `**/*.md` files that describe the supported database workflow

## Required Verification

- Add or update focused tests for changed DB/admin logic.
- Run `npm run type-check`.
- Run the most direct Vitest coverage for the changed SQL Server scaffold or TypeORM code.
- If markdown docs changed, run `npm run lint:md`.
