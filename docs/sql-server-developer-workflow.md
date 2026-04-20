# SQL Server Developer Workflow

This document describes the **approved target** developer workflow for the
SQL Server + TypeORM migration.

The repository is still carrying a large SQLite + Drizzle implementation while
the migration is in progress. Until the full DAL/runtime cutover is complete,
the SQL Server workflow below should be treated as the migration scaffold and
reference path for new work.

See also:

- [sql-server-typeorm-migration-plan.md](./sql-server-typeorm-migration-plan.md)
- [database-schema.md](./database-schema.md)

## Local SQL Server Container

Before using the host-side SQL Server scaffold, copy the example env file:

```bash
cp .env.sqlserver.example .env.sqlserver
```

Before rebuilding the default devcontainer profile, copy:

```bash
cp .devcontainer/.env.example .devcontainer/.env
```

Start the local SQL Server Developer container with:

```bash
npm run db:sqlserver:up
```

Stop it with:

```bash
npm run db:sqlserver:down
```

The default Compose file is [docker-compose.sqlserver.yml](../docker-compose.sqlserver.yml).
It exposes SQL Server on `127.0.0.1:1433` and persists data in a named Docker
volume.

If your machine already has a local SQL Server using `1433`, override
`SQLSERVER_HOST_PORT` in `.env.sqlserver` or `.devcontainer/.env`.

The local SQL Server workflow uses `encrypt=true` together with
`trustServerCertificate=true` by default. That is intentional for local
development because the SQL Server container presents a self-signed
certificate unless you add your own trusted certificate chain.

## Migration-Window Environment Variables

During the coexistence window, the SQL Server scaffold uses dedicated
variables so it does not collide with the current SQLite runtime:

`db:up` and `db:sqlserver:up` now read their SQL Server variables from
`.env.sqlserver`, not from committed Compose defaults.

The default devcontainer Compose stack now reads its SQL Server variables from
`.devcontainer/.env`.

The elevated devcontainer Compose stack reuses the same SQL Server variables
from `.devcontainer/.env`.

The SQL Server admin scaffold uses the `master` database for readiness checks
and reset/setup bootstrap steps, so `db:setup` can create `kravhantering`
even when that database does not exist yet.

After the full cutover, these temporary `SQLSERVER_*` variables should collapse
back to the canonical runtime contract:

```env
DATABASE_URL=...
DATABASE_READONLY_URL=...
```

## SQL Server Scaffold Commands

<!-- markdownlint-disable MD013 -->
| Command | Purpose |
| --- | --- |
| `npm run db:sqlserver:up` | Start the local SQL Server Developer container |
| `npm run db:sqlserver:down` | Stop the local SQL Server Developer container |
| `npm run db:sqlserver:wait` | Poll the configured SQL Server endpoint until it responds |
| `npm run db:sqlserver:health` | Run a simple `SELECT 1` health probe |
| `npm run db:sqlserver:browse` | Print a read-only VS Code SQLTools connection block |
<!-- markdownlint-enable MD013 -->

These scaffold commands do **not** mean the full TypeORM migration is complete.
They establish the container, connection, and browse surfaces needed to migrate
the repository safely.

## Read-Only Browse Workflow

The blessed VS Code-friendly path is:

1. Install or enable:
   - `mtxr.sqltools`
   - `mtxr.sqltools-driver-mssql`
2. Configure a least-privilege SQL Server login for browsing.
3. Set `SQLSERVER_DATABASE_READONLY_URL` during the coexistence window, or
   `DATABASE_READONLY_URL` after cutover.
4. Run:

   ```bash
   npm run db:sqlserver:browse
   ```

5. Copy the printed JSON into the SQLTools connection UI or workspace
   settings.

The scaffold intentionally avoids printing a real password. By default it emits
`${env:DATABASE_READONLY_PASSWORD}` so the UI connection can remain read-only
without committing secrets into the repo.

## Seed Data Preservation

The migration must preserve current dev/test seed data semantics unless a
change is absolutely necessary for SQL Server correctness.

That means:

- keep stable IDs and business identifiers where feasible
- preserve scenario coverage and edge-case fixtures
- preserve ordering assumptions that tests or guides rely on
- document every unavoidable change explicitly

## Current Cutover Status

As of April 19, 2026:

- SQL Server + TypeORM is the approved target architecture.
- SQL Server container, config, and browse scaffolding are being added.
- The main app runtime, DAL modules, and tests still require a larger port from
  SQLite + Drizzle.
- The detailed migration checklist lives in
  [sql-server-typeorm-migration-plan.md](./sql-server-typeorm-migration-plan.md).
