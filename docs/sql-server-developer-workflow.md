# SQL Server Developer Workflow

This document describes the developer workflow for the application's sole
database stack: **Microsoft SQL Server + TypeORM**.

See also:

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
npm run db:up
```

Stop it with:

```bash
npm run db:down
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

## Environment Variables

The SQL Server admin scripts and runtime read environment variables from
`.env.sqlserver` (host) and `.devcontainer/.env` (devcontainer).

`db:up` reads its SQL Server variables from `.env.sqlserver`, not from
committed Compose defaults.

The default devcontainer Compose stack now reads its SQL Server variables from
`.devcontainer/.env`.

The elevated devcontainer Compose stack reuses the same SQL Server variables
from `.devcontainer/.env`.

The SQL Server admin scaffold uses the `master` database for readiness checks
and reset/setup bootstrap steps, so `db:setup` can create `kravhantering`
even when that database does not exist yet.

Local/dev SQL Server connection strings are normally **derived in code** from:

```env
DB_HOST=...
DB_PORT=...
DB_NAME=...
DB_READONLY_USER=...
DB_READONLY_PASSWORD=...
DB_ENCRYPT=...
DB_TRUST_SERVER_CERTIFICATE=...
```

The write connection defaults to the `sa` login using `MSSQL_SA_PASSWORD`
unless you explicitly set `DB_USER` / `DB_PASSWORD`.

For the read-only login, avoid passwords that contain the login name
(`readonly`) because SQL Server password policy can reject them even when they
otherwise look complex.

`DATABASE_URL` and `DATABASE_READONLY_URL` are the canonical runtime contract
when you need to point at an explicit connection string instead of the derived
local/dev settings. `SQLSERVER_DATABASE_URL` and
`SQLSERVER_DATABASE_READONLY_URL` are accepted aliases used by the admin CLI;
the Next.js runtime only reads `DATABASE_URL`.

The canonical runtime contract is:

```env
DATABASE_URL=...
DATABASE_READONLY_URL=...
```

## SQL Server Admin Commands

<!-- markdownlint-disable MD013 -->
| Command | Purpose |
| --- | --- |
| `npm run db:up` | Start the local SQL Server Developer container |
| `npm run db:down` | Stop the local SQL Server Developer container |
| `npm run db:wait` | Poll the configured SQL Server endpoint until it responds |
| `npm run db:health` | Run a simple `SELECT 1` health probe |
| `npm run db:browse` | Print a read-only VS Code SQLTools connection block |
| `npm run db:setup` | Wait, reset, run TypeORM migrations, seed, and configure the read-only login |
| `npm run db:generate` | Generate a new TypeORM migration based on entity changes |
| `npm run db:migrate` | Run TypeORM migrations only |
| `npm run db:seed` | Apply `typeorm/seed.mjs` only |
| `npm run db:reset` | Drop and recreate the database |
<!-- markdownlint-enable MD013 -->

Under the hood `scripts/db-sqlserver-admin.mjs` builds a TypeORM `DataSource`,
applies the migrations in `typeorm/migrations/`, and seeds via
`typeorm/seed.mjs`.

## Read-Only Browse Workflow

The blessed VS Code-friendly path is:

1. Install or enable:
   - `mtxr.sqltools`
   - `mtxr.sqltools-driver-mssql`
2. Configure a least-privilege SQL Server login for browsing.
3. Set `DATABASE_READONLY_URL` if you need an explicit browse connection
   override. Otherwise the tool derives the read-only connection from the
   `DB_*` values and `DB_READONLY_PASSWORD`.
4. Run:

   ```bash
   npm run db:browse
   ```

5. Copy the printed JSON into the SQLTools connection UI or workspace
   settings.

The scaffold intentionally avoids printing a real password. By default it emits
`${env:DB_READONLY_PASSWORD}` so the UI connection can remain read-only without
committing secrets into the repo.

## Seed Data Preservation

Keep current dev/test seed data semantics stable unless a change is absolutely
necessary. That means:

- keep stable IDs and business identifiers where feasible
- preserve scenario coverage and edge-case fixtures
- preserve ordering assumptions that tests or guides rely on
- document every unavoidable change explicitly

Seed inserts in `typeorm/seed.mjs` must be idempotent: guard with
`IF NOT EXISTS` (or composite-PK equivalent) and wrap identity-bearing tables
in `SET IDENTITY_INSERT [table] ON/OFF` so the seed can be re-run safely.
