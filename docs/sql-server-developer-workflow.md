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
| `npm run db:setup` | Wait, reset, run TypeORM migrations, seed required + demo profiles, and configure the read-only login |
| `npm run db:migrate` | Run TypeORM migrations only |
| `npm run db:seed:required` | Apply only required system and lookup seed data |
| `npm run db:seed:demo` | Apply optional demo, PoC, smoke-test, and integration seed data |
| `npm run db:reset` | Drop and recreate the database |
<!-- markdownlint-enable MD013 -->

Under the hood `scripts/db-sqlserver-admin.mjs` builds a TypeORM `DataSource`,
applies the migrations in `typeorm/migrations/`, and seeds via the required
profile in `typeorm/seed-required.mjs` or the demo-capable profile in
`typeorm/seed.mjs`.

Use `npm run db:migrate` plus `npm run db:seed:required` for an empty
production-like database. Add `npm run db:seed:demo` only when you need the
local development, integration-test, PoC, guide, or smoke-test fixtures.

## Requirement List Performance Baseline

The requirement list SQL path has a required SQL Server performance check for
`listRequirements` and `countRequirements`. It uses the same parameterized SQL
builder as production code and seeds a dedicated medium fixture of roughly
10,000 `PERF-*` requirements with two to four versions each.

Use the regular check when you want to verify that the current branch still
fits the committed baseline:

```bash
npm run db:setup
npm run perf:requirements-list
```

Use the update command only when the measured baseline is intentionally
changing, for example after a deliberate query rewrite, a measured index
change, a SQL Server image/runtime change, or a fixture-size change:

```bash
npm run db:setup
npm run perf:requirements-list:update
npm run perf:requirements-list
```

The update command rewrites
`tests/performance/requirements-list-baseline.json`. Review the diff and
commit it with the code or schema change that justifies the new numbers. Do
not use it to silence a one-off noisy failure; first rerun the check on an
idle, comparable SQL Server environment.

The baseline has profiles because SQL Server can choose different execution
plans in GitHub Actions and in local containers, especially on Apple Silicon.
CI runs with the strict `ci` profile from the top-level `thresholds` object.
Normal local runs use the `developer` profile from `thresholdProfiles`, which
allows the higher logical-read plan seen in local Mac containers while keeping
the CI gate tighter. Override the profile explicitly when needed:

```bash
PERF_REQUIREMENTS_BASELINE_PROFILE=ci npm run perf:requirements-list
PERF_REQUIREMENTS_BASELINE_PROFILE=developer npm run perf:requirements-list
```

`perf:requirements-list:update` updates the active profile. On a normal local
machine that means the `developer` profile; in CI, or when
`PERF_REQUIREMENTS_BASELINE_PROFILE=ci` is set, it updates the top-level CI
thresholds. Commit profile changes only when that environment was intentionally
remeasured.

Run baseline updates against an isolated local or CI-like SQL Server Developer
container, not a shared or production database. The script creates or refreshes
the `PERF-*` fixture rows in the target database. The fixture is created
outside `typeorm/seed.mjs` so normal seed identifiers and business examples
stay stable. It uses dedicated `PERF-*` requirement areas and negative
database IDs to avoid advancing normal SQL Server identity counters.

For each scenario, the script:

1. Builds the list and count SQL from the same helpers used by the DAL.
2. Captures actual SQL Server execution plans with `STATISTICS XML`.
3. Runs warm-up queries so cold connection/setup cost is not the baseline.
4. Runs measured samples with `STATISTICS IO` enabled.
5. Writes results and `.sqlplan` files under
   `test-results/requirements-list-performance/`.

The baseline file contains threshold counters:

- `sampleCount` and `warmupCount`: how many measured and warm-up runs were
  used per scenario.
- `maxMedianDurationMs`: maximum allowed median elapsed time across measured
  warm-cache samples.
- `maxP95DurationMs`: maximum allowed 95th-percentile elapsed time. This
  catches occasional slow samples better than the median.
- `maxLogicalReads`: maximum allowed SQL Server logical page reads reported by
  `STATISTICS IO` for the combined list and count query. This is usually the
  most stable regression signal because it tracks work done by SQL Server
  rather than host CPU noise.
- `allowSpills`: whether execution-plan spill warnings are accepted. Keep this
  `false` unless a spill has been reviewed and deliberately accepted. The
  console table shows this as `actual/allowed`, so `yes/no` means SQL Server
  produced a spill warning and the committed baseline does not accept it. When
  `update-baseline` is used, scenarios with measured spills are recorded with
  `allowSpills: true`; review the saved `.sqlplan` files before committing that
  change. In practical terms, a spill means SQL Server needed more working
  memory for a query step than it was granted, so it used `tempdb` scratch
  space instead. The query result is still correct, but the plan may be slower
  or more sensitive under load. Treat a spill as a performance warning: fix or
  investigate it when it comes with high duration, high logical reads, `tempdb`
  pressure, or a new plan change; accept it only when the measured timings and
  reads are still comfortably inside the baseline budget.
- `maxMissingIndexImpact`: maximum accepted SQL Server missing-index impact in
  the captured plan. A high value is not proof that the suggested index is
  correct, but it is a prompt to inspect the plan before raising thresholds.

Only refactor the query, add indexes, or introduce projections after the
captured SQL Server execution plans and baseline results show a real
bottleneck. If the update lowers thresholds after an improvement, keep the
stricter baseline so future regressions are caught.

### Adding a new migration

Create a new file in `typeorm/migrations/` named `NNNN_short_description.mjs`
(zero-padded, monotonically increasing). Both
`lib/typeorm/sqlserver-config.ts` and `scripts/db-sqlserver-admin.mjs`
auto-discover migration files in that directory (alphabetical filename order
drives execution order, which matches the numeric prefix). No manual import
list to update; a guard test in
`scripts/__tests__/db-sqlserver-admin.test.mjs` enforces this.

Existing dev or production databases that are already at an earlier migration
will pick up new files on the next `npm run db:migrate`. Clean databases run
the full set in order via `npm run db:setup`.

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

Seed inserts in `typeorm/seed.mjs` must be idempotent in both profiles: guard
with `IF NOT EXISTS` (or composite-PK equivalent) and wrap identity-bearing
tables in `SET IDENTITY_INSERT [table] ON/OFF` so the seed can be re-run
safely.

Put new system or lookup rows that the app needs to boot in the required
profile. Put examples, screenshots, privacy exercises, Playwright fixtures,
PoC scenarios, dogfood Krav, and other disposable data in the demo profile.
