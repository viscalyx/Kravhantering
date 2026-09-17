# SQL Server Developer Workflow

Use this guide to configure a local **Microsoft SQL Server + TypeORM**
database, apply migrations and seeds, browse data, and run database checks.

See also:

- [database-schema.md](../reference/database-schema.md)

## Local SQL Server Container

For host-side development, create the local environment file if it does not
already exist:

```bash
cp .env.sqlserver.example .env.sqlserver
```

For the default devcontainer profile, create its environment file if it does
not already exist, then rebuild the devcontainer:

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

The default Compose file is [docker-compose.sqlserver.yml](../../docker-compose.sqlserver.yml).
For host-side development, it publishes SQL Server on `127.0.0.1:1433`
(loopback only) and persists data in a named Docker volume. The separate
devcontainer Compose profiles publish their SQL Server port on all host
interfaces; restrict access through the host's network controls when using
those profiles.

If your machine already has a local SQL Server using `1433`, override
`SQLSERVER_HOST_PORT` in `.env.sqlserver` or `.devcontainer/.env`. Match
`DB_PORT` to that published port for host-side clients; clients inside the
devcontainer still connect to `db:1433`.

For explicit remote access to the host-side database, use an SSH tunnel from
the client workstation to a trusted development host:

```bash
ssh -N -L 127.0.0.1:11433:127.0.0.1:1433 user@development-host
```

Connect the client to `127.0.0.1:11433` while the tunnel is open. Replace the
remote `1433` with the published `SQLSERVER_HOST_PORT` when it differs. Use an
authorized SSH account, verify the host key, and restrict SSH access to
trusted networks or a VPN. Keep the SQL Server port closed to public ingress.

The local SQL Server workflow uses `encrypt=true` together with
`trustServerCertificate=true` by default. That is intentional for local
development because the SQL Server container presents a self-signed
certificate unless you add your own trusted certificate chain.

## Environment Variables

`db:up` and `db:down` pass `.env.sqlserver` to Docker Compose. The admin CLI
loads `.env`, `.env.development`, `.env.local`, then `.env.development.local`
from the working directory. Later files override earlier files, but variables
already in the process environment take precedence over all four files.
Run the commands from the repository root.

The Next.js development runtime uses its standard environment-file loading;
neither it nor the admin CLI automatically loads `.env.sqlserver`. Put host
connection overrides in `.env.development.local` or the process environment.
When changing the container password or published port in `.env.sqlserver`,
keep the client settings in sync. The SQL integration and specification
performance npm commands explicitly load `.env.sqlserver` through `dotenv`.
The requirement-list performance script uses the admin CLI's four-file loader.

The default and elevated devcontainer Compose stacks inject variables from
`.devcontainer/.env` into the development container. Those process variables
take precedence over workspace environment files, including local overrides.
Use command-scoped variables when temporarily targeting another database.

The SQL Server admin scaffold uses the `master` database for readiness checks
and reset/setup bootstrap steps, so `db:setup` can create `kravhantering`
even when that database does not exist yet.

Local/dev SQL Server connection strings are normally **derived in code** from:

```env
DB_HOST=...
DB_PORT=...
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
DB_READONLY_USER=...
DB_READONLY_PASSWORD=...
DB_ENCRYPT=...
DB_TRUST_SERVER_CERTIFICATE=...
```

The committed development defaults use `kravhantering_app` for the application,
`kravhantering_job` for migration and required seed, and `sa` only for
principal/database bootstrap. `db:setup` creates and maps those principals
idempotently. Password rotation is outside `db:setup`'s scope.

For the read-only login, avoid passwords that contain the login name
(`readonly`) because SQL Server password policy can reject them even when they
otherwise look complex.

`DATABASE_URL` and `DATABASE_READONLY_URL` are the canonical explicit
connection string contract when you need to override the derived local/dev
settings. The Next.js runtime and admin CLI both use these names. Migration
connections replace the credentials in `DATABASE_URL` with
`DB_MIGRATION_USER` and `DB_MIGRATION_PASSWORD`.

The canonical runtime contract is:

```env
DATABASE_URL=... # runtime identity
DATABASE_READONLY_URL=...
DB_MIGRATION_USER=... # migration identity name
DB_MIGRATION_PASSWORD=... # migration identity secret
```

Application runtime and schema migration use separate SQL Server credentials.
The release-versioned manifest in
[`typeorm/runtime-permission-manifest.mjs`](../../typeorm/runtime-permission-manifest.mjs)
lists exact object/operation grants, including protected column-scoped updates;
new tables receive nothing implicitly through `kravhantering_runtime`.
`db:migrate` applies migrations and then reconciles direct grants and verifies
`DB_RUNTIME_USER` membership. If that user belongs to `db_datareader` or
`db_datawriter`, reconciliation removes those broad memberships only after the
custom contract verifies. It does not alter other user roles or direct user
permissions. Verification fails when those permissions give the runtime user
effective schema-migration or protected-audit mutation access. Reconciliation,
broad-role removal, and final effective verification are atomic, and a
role-only runtime login cannot run TypeORM migrations.

Use `npm run db:permission-status` for secret-free JSON evidence or
`npm run db:permission-reconcile` for an explicit repair. Both report the
manifest version/digest, role presence, missing/unexpected grants, managed-user
presence and membership, broad-role memberships, and unexpected parent roles.
A compatible report has empty `legacyRoles` and
`prohibitedEffectivePermissions` arrays for every managed runtime user.

The Next.js runtime builds one shared TypeORM `DataSource` per process. The
runtime DataSource keeps SQL Server behavior explicit:

- `synchronize` is disabled.
- TypeORM high-level where clauses throw on `null` or `undefined` values.
- SQL Server date/time values use UTC.
- SQL Server transactions use `XACT_ABORT` through
  `abortTransactionOnError=true`.
- TypeORM transactions default to `READ COMMITTED` through the DataSource-level
  `isolationLevel`. DAL paths that need stronger ordering pass
  `SERIALIZABLE` explicitly at the transaction call site.
- Connection and request timeouts are explicit.
- Connection pool sizing and idle/acquire timeouts are explicit.

The runtime does not set SQL Server `options.connectionIsolationLevel` for
out-of-transaction reads. SQL Server and the `tedious` driver already default
new connections to `READ COMMITTED`, and TypeORM documents that connection
isolation settings may not be reliably preserved across pooled connection reuse.
Treat `connectionIsolationLevel` as a new-connection default, not as a
checkout reset; a reused session can retain a prior transaction's isolation
level.

Runtime pool defaults are conservative for a single app process:

<!-- markdownlint-disable MD013 -->
| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_POOL_MAX` | `10` | Maximum SQL Server connections in the TypeORM runtime pool |
| `DB_POOL_MIN` | `1` | Minimum SQL Server connections kept in the TypeORM runtime pool |
| `DB_POOL_IDLE_TIMEOUT_MS` | `30000` | Time before an idle runtime pool connection is eligible for eviction |
| `DB_POOL_ACQUIRE_TIMEOUT_MS` | `15000` | Time a runtime request may wait for a pool connection |
<!-- markdownlint-enable MD013 -->

## SQL Server Admin Commands

<!-- markdownlint-disable MD013 -->
| Command | Purpose |
| --- | --- |
| `npm run db:up` | Start the local SQL Server Developer container |
| `npm run db:down` | Stop the local SQL Server Developer container |
| `npm run db:wait` | Poll the configured SQL Server endpoint until it responds |
| `npm run db:health` | Run a simple `SELECT 1` health probe |
| `npm run db:browse` | Print a read-only VS Code SQLTools connection block |
| `npm run db:setup` | Wait, reset, bootstrap principals, migrate and reconcile permissions, seed required + demo profiles, and configure the read-only login |
| `npm run db:migration-status` | Report expected, observed, pending, and unknown TypeORM migrations as JSON |
| `npm run db:migrate` | Run TypeORM migrations and reconcile runtime permissions |
| `npm run db:seed:required` | Apply only required system and lookup seed data |
| `npm run db:seed:demo` | Reset non-required rows, then apply optional demo, smoke-test, guide, and integration seed data |
| `npm run db:reset` | Drop and recreate the database |
| `npm run test:sql-integration` | Reset a dedicated test database and run focused SQL Server invariant tests |
<!-- markdownlint-enable MD013 -->

Seed execution requires a DataSource that creates a transaction-owning
QueryRunner, or a QueryRunner/EntityManager already bound to an active
transaction. Query-only executors without an active transaction are rejected
before seeding so lookup locks remain held through the associated insert and
lifecycle transitions.

`db:setup` drops and recreates the configured database. Use it only for
disposable development data; use `db:migrate` to preserve existing data.

For an empty production-like database, first run
`node scripts/db-sqlserver-admin.mjs bootstrap` with bootstrap administrator
credentials to create the database and principals if they do not exist.
Then run `npm run db:migrate` plus `npm run db:seed:required`.
Add `npm run db:seed:demo` only when you need the
local development, integration-test, guide, or smoke-test fixtures. The demo
profile is destructive: it clears non-required data before reseeding the
current fixtures.

## Focused SQL Integration Tests

Run database concurrency, constraint, transaction, rollback, and pagination
invariants with:

```bash
npm run db:up
npm run test:sql-integration
```

The npm command loads `.env.sqlserver`; existing process variables take
precedence. The suite replaces the resolved database name with
`<database>_sql_integration_tests`. It resets and
migrates only that dedicated database. Set
`SQLSERVER_INTEGRATION_TESTS_URL` to provide an explicit test database URL, or
`SQLSERVER_INTEGRATION_TESTS_DB_NAME` to override only the derived database
name. Both overrides select a database that the suite will reset; use only
a disposable test database.

To run one contract, append its test file, for example:

```bash
npm run test:sql-integration -- \
  tests/sql-integration/rfi-assessments.sqlserver.test.ts
```

The ordinary `npm test` command excludes `tests/sql-integration/`. The
`Integration Tests` workflow runs the SQL suite as a separate required job
against its own test database.

## Requirement List Performance Baseline

The requirement list SQL path has a required SQL Server performance check for
`listRequirements` and production-style cursor continuation. It seeds roughly
10,000 `PERF-*` requirements with two to four versions each and compares
first-page and deep-page queries within that fixture.

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
the `PERF-*` fixture rows in the target database. Use a disposable database for
the `db:setup` examples above: that command resets all existing data.

The script captures actual execution plans and measures warm-cache samples.
Results and `.sqlplan` files are written under
`test-results/requirements-list-performance/`.

The baseline file contains threshold counters:

- `sampleCount` and `warmupCount`: how many measured and warm-up runs were
  used per scenario.
- `maxMedianDurationMs`: maximum allowed median elapsed time across measured
  warm-cache samples.
- `maxP95DurationMs`: maximum allowed 95th-percentile elapsed time. This
  catches occasional slow samples better than the median.
- `maxLogicalReads`: maximum allowed SQL Server logical page reads reported by
  `STATISTICS IO` for the list query. This is usually the
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

### Requirements specification pagination baseline

Run the mixed requirements specification campaign against a migrated, seeded
local SQL Server database. This command loads `.env.sqlserver` and creates and
cleans up fixtures in the configured database; it does not derive a separate
test database. Use a disposable target:

```bash
npm run perf:specification-items
```

The blocking CI job runs the same command for pull requests and pushes to
`main`. It creates isolated 70/30 and 20/80
library/specification-local fixtures at 200 and 500 items. For every supported
sort and direction it traverses the unchanged result twice and requires exact
stable-reference order with no missing or duplicate rows.

The same run records one Requirement ID traversal for both mixes at 1,000
items. Those 1,000-item results are diagnostic artifacts only: they have no
duration or logical-read regression threshold and do not change the supported
500-item sizing target.

The committed regression thresholds in
`tests/performance/specification-item-pagination-baseline.json` are separate
from product-decision response budgets. The campaign records warm complete
traversal duration and captures representative actual plans, logical reads,
spills, key/RID lookups, and missing-index evidence under
`test-results/specification-item-pagination-performance/`. CI retains those
artifacts on failure.

Keep the existing membership indexes while warm traversals and logical reads
remain inside this baseline and plans show no spill-driven or material
missing-index regression. A key lookup alone does not justify another index.
Replace a simple membership index with one measured covering index only when
fresh 200/500 evidence exceeds the baseline and the captured plan identifies
that lookup as the cause. Do not add one index per sort.

## Adding a new migration

Create a new file in `typeorm/migrations/` named `NNNN_short_description.mjs`
(zero-padded, monotonically increasing). The admin CLI auto-discovers `.mjs`
migration files in that directory. The numeric filename prefix
keeps discovery deterministic and reviewable, while TypeORM uses the
timestamp suffix in the migration `name` as the executable order. There is no
manual import list to update. Do not edit a released migration; add a new
migration and update the corresponding entities and
[canonical schema reference](../reference/database-schema.md).

Existing dev or production databases that are already at an earlier migration
will show pending migrations in `npm run db:migration-status` and pick up new
files on the next `npm run db:migrate`. Clean databases run the full set in
order via `npm run db:setup`. The status command accepts empty migration
history as a valid migration-job state, but app runtime readiness requires the
database to have reached the build metadata field
`expectedDatabaseSchemaVersion`.

## Read-Only Browse Workflow

Use VS Code SQLTools with a read-only login:

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

Seed inserts in `typeorm/seed-required.mjs` must be idempotent: guard with
`IF NOT EXISTS` (or composite-PK equivalent) and wrap identity-bearing tables
in `SET IDENTITY_INSERT [table] ON/OFF` so the required seed can be re-run
safely. The demo profile in `typeorm/seed.mjs` is reseeded from a clean
non-required data set by `npm run db:seed:demo`.

Put new system or lookup rows that the app needs to boot in the required
profile. Put examples, screenshots, privacy exercises, Playwright fixtures,
dogfood Krav and other disposable data in the demo profile.

## Verify Disposable Demo Reset

Use only a disposable demo/test database and the migration identity. The
explicitly confirmed demo clear removes non-required data, including seeded
RFI suggestions that have entered review or been handled. Required lookup
data remains.

For a manual CLI check, select the disposable database through the documented
`DB_*` configuration, then:

1. Run `npm run db:seed:demo` and confirm that the demo seed completes.
2. Run `node scripts/db-sqlserver-admin.mjs demo:clear` and confirm rejection
   requiring `--confirm-clear-non-required-data`.
3. Run the same command with `--confirm-clear-non-required-data`; confirm the
   reported non-required table count and a successful exit.
4. Run `npm run db:seed:demo` again and confirm that the current demo fixtures
   can be recreated.
