# DB Job Container Contract

This directory owns the runtime contract for one-shot database jobs, built with
the `db-job` target from the same app Dockerfile as the runtime app image.

The dependency stage uses the pinned UBI 10 Node.js 24 builder; the final image
uses the independent minimal runtime pin and
[shared UBI adaptation](../node/README.md). It runs directly through Node.js
without npm, as UID/GID `1000:1000`, with supported administrative user
overrides. Read-only roots, writable `/tmp`, and SQL Server CA mounts selected
with `NODE_EXTRA_CA_CERTS` retain their existing contract. Scheduled transient
cleanup continues to use `/usr/local/bin/node` through the compatibility link.

## Owned Configuration

- Env vars for migration and required seed jobs.
- Public example values in `.env.db-job.example`.
- One-shot command documentation for migration and required seed jobs.

The `db-job` image must not be a long-running service. It runs before the app
container and exits after the requested job succeeds or fails.

## One-Shot Commands

Build the image from the repository root:

```bash
npm run container:build:db-job
```

The image entrypoint is `node scripts/db-sqlserver-admin.mjs`, so Compose or
manual runs pass the admin command as arguments:

- `bootstrap` creates the database plus distinct app and job SQL principals,
  their `dbo` default schema, and the `kravhantering_runtime` role membership.
  Password rotation is outside this command's scope.
- `migration-status` prints JSON evidence with expected, observed, pending and
  unknown TypeORM migrations without modifying the database.
- `migrate` applies TypeORM migrations, reconciles the runtime permission
  manifest, and fails if grants or managed-user membership do not verify.
- `migrate --json` applies TypeORM migrations and prints the preflight,
  migration execution, final migration status, and runtime-permission evidence
  as versioned JSON on stdout, with separate diagnostics and summary on stderr.
- `permission-status` prints secret-free JSON evidence without changing state.
- `permission-reconcile` reapplies the manifest and managed memberships, then
  prints the verified JSON status.
- `seed:required` reconciles required records in one transaction.
- `seed:optional` initializes starter catalogs once for a fresh installation.
  Completed initialization is a no-op, including on existing installations.
- `seed:required --json` writes a versioned result to stdout and a concise
  summary to stderr.
- `health` runs a simple SQL Server read check.
- `wait` polls SQL Server until it responds.

A production-like empty database is bootstrap, migration, and
`seed:required`, then `seed:optional`. The image includes
`typeorm/seed-required.mjs`, `typeorm/seed-optional.mjs`,
`typeorm/seed-optional-data.mjs`, and their seed helper modules. It excludes
`typeorm/seed.mjs`, dogfood seed, archiving-retention demo seed, tests, and
documentation.

[`runtime-permission-manifest.mjs`](../../typeorm/runtime-permission-manifest.mjs)
is the release-versioned authority for exact object, operation, and
column-scoped grants. New objects require manifest inclusion for access through
the custom `kravhantering_runtime` role. Within the custom role, the runtime can
read but not write `dbo.migrations`; protected audit and review tables have
narrower insert, update-column, and delete boundaries. The reconciler removes
unexpected direct permissions from the project role. For every managed runtime
user, it establishes and verifies the custom grants and membership. If that
user also belongs to `db_datareader` or `db_datawriter`, the reconciler removes
those broad memberships only after the custom contract verifies. It does not
modify other user roles, direct user grants, or site-owned extension-role
memberships. Verification nevertheless fails when those permissions give a
managed runtime user effective schema-migration or protected-audit mutation
access. Custom-role parent nesting also fails verification for an operator to
resolve explicitly. Migrations and required seed continue to use the separate
db-job login with `db_owner`. Reconciliation, broad-role removal, and final
effective-permission verification commit as one transaction; a final failure
leaves no partial permission or membership changes.

The image installs only the dependency subset needed by the one-shot job:
`mssql`, `typeorm`, and `reflect-metadata`. It deliberately does not include
the Next.js application dependency tree.

Demo/test data must not be baked into this production `db-job` image. See
[../app/README.md](../app/README.md) for the separate opt-in
`kravhantering-demo-seed` image contract.

## Migration Results

For operators and pipeline authors, `migrate --json` emits one JSON document
on success or failure. Version 1 adds `operation: "migrate"`, `runId`, `release`,
timestamps, `status` and `phase` to the migration evidence. Existing
`preflight`, `postMigration`, `migration.applied`, `migrationsApplied` and
`runtimePermissions` remain available when their phase completes. Supply a
unique non-secret `DB_MIGRATION_RUN_ID` per attempt, or retain the generated
UUID. Set `RELEASE_VERSION` (or `BUILD_VERSION`) for release correlation.

`migration.transaction` is `not_started`, `not_needed` (no pending migrations),
`committed`, `rolled_back` or `unknown`. TypeORM owns the transaction covering
all pending migrations and their history. Commit/rollback acknowledgements
determine the outcome; a lost acknowledgement remains unknown. A rollback or
unknown outcome has no confirmed applied list, entries or counts. Inspect the
database before deciding what to do with an unknown outcome.

`migration.entries` records default changes with migration name, stable
`logicalId`, table, resolved ID and `outcome`: `inserted`, `updated`,
`unchanged` or `skipped`. Counts describe confirmed committed default entries;
they do not count every DDL statement or writes in older migrations without
entry reporting. Changed-value guards preserve customized or missing optional
entries as unchanged with a reason.

Optional omissions have `reason`, `dependencyCause` (null for a direct
conflict), `actionRequired: false`, `requiredAction` and
`automaticRetry: false`. `completed_with_omissions` retains exit status zero.
The summary identifies omitted entries and dependencies, confirms existing
data was preserved and explains that there is no automatic retry. TypeORM
history prevents retries even when the conflict disappears. To add an omitted
entry, use a deliberate later migration or a supported administrator action;
do not delete history or clear initialization completion to retry it.

Unexpected errors and required conflicts return nonzero and `status: failed`.
`phase` identifies preparation, preflight, migrations, post-check, permissions
or cleanup (`prepare`, `preflight`, `migrations`, `post_check`, `permissions`,
`cleanup`); successful completion is `complete`.
`permissions.status` is `not_started`, `completed` or `failed`. A permission
failure after migration commit retains the applied list and committed entries.
Its original `error` is preserved; any later cleanup failure is separate in
`cleanupError`. This is not a whole-deployment rollback. The tested recovery
set and restore procedure still apply once migrations start.

Save JSON and stderr under distinct attempt names, including failures, with
the release, image and restore-point evidence. Retain earlier omission reports
when a later no-op succeeds. Publish the concise summary with a link to the
retained details through the company pipeline. The company chooses retention
duration, publication, notifications and any stricter review policy.

Both database images include the result module and versioned default-evolution
helper.

## Required Seed Results

`seed:required --json` emits one JSON document with `version: 1`, `operation`,
`runId`, `release`, `startedAt`, `completedAt`, `status` and `phase`. Supply
`DB_SEED_RUN_ID` for company pipeline correlation, or retain the generated UUID.
Supply `RELEASE_VERSION` (or `BUILD_VERSION`) to identify the deployed release;
when neither is available, `release` is null. These values contain no secrets.

`required` contains its profile, transaction outcome, counts and per-record
entries. Each entry has a table, logical identity, resolved ID and outcome:
`inserted`, `updated`, `unchanged` or `skipped`. `updated` includes invariant
repair and release-owned AI synchronization. Top-level `counts` and
`insertedRows` count confirmed committed work. AI rules and terms
are included. Existing rows are not counted as inserted. A no-op rerun reports
unchanged entries and does not alter metadata timestamps.

Transaction outcomes are `committed`, `rolled_back`, `not_started`, `unknown`
and, for a transaction-bound in-process caller, `pending`. That caller owns the
commit and must not publish pending counts as committed work. Failed or unknown
transactions publish zero committed counts and no committed entries. Original
errors remain available to in-process callers with their cause and any rollback
or cleanup error. Command failures include an error code, message and logical
record when known. The command returns nonzero for conflicts and unexpected
failures. A later browse-access failure preserves the profile's committed
counts. A failed commit or rollback acknowledgement reports `unknown`; inspect
saved state before retrying.

Retain JSON and stderr with the deployment evidence, including failed attempts.
Publish the summary with a link to the retained report through the company's
pipeline. A later no-op report does not replace the earlier attempt's evidence.
Required identity conflicts require administrator review of the reported
mapping; editable labels are not authority to reassign identities. Keep the documented
recovery procedure for failures after migrations start.

The canonical [ownership table](../../docs/reference/database-schema.md#seed-ownership-and-upgrades)
defines required, optional and configuration families. Saved column layouts
are left intact. Both `db-job` and `demo-seed` include `seed-reconciliation.mjs`,
`seed-runner.mjs`, `seed-required.mjs`, `seed-optional.mjs`,
`seed-optional-data.mjs` and `ai-safety-seed-data.mjs`; demo fixture modules
remain exclusive to the demo image.

### Optional Initialization Results

`seed:optional --json` uses the same version 1 envelope and correlation fields,
with operation `seed:optional` and an `optional` profile result.
`optional.initialization` is `initialized` or `already_complete` on success.
A completed no-op returns zero counts and an empty entry list. The completion
record is not counted as a catalog entry. An equivalent existing entry counts
as unchanged, with its actual saved ID.

Conflicts return nonzero status and `OPTIONAL_SEED_CONFLICT` with the logical
record; unexpected errors also fail. Rolled-back or uncertain transactions
report zero committed counts. Inspect persisted state before retrying an
uncertain outcome. A late cleanup failure can occur after data and completion
commit; its transaction outcome remains committed. Keep each attempt's JSON
and stderr summary with deployment evidence, using distinct filenames and a
shared run/release correlation. A later no-op does not replace earlier evidence.
Company pipelines control publication and notifications.

Fresh deployment runs migrations, required reconciliation and initialization
before admitting traffic. Upgrade runs migrations and required reconciliation;
the transition records existing installations as complete without restoring
missing catalogs. Never clear completion to force a refill. Later default
changes use one-time migrations. Demo fixture loading is a separate operation.

## Environment Variables

Required values:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` select the
  SQL Server database used for migrations and required seed data.
- `DB_RUNTIME_USER` names the application runtime database user whose custom-role
  membership must verify. It is non-secret and never authorizes login creation,
  password rotation, or a runtime connection. Additional managed users may be
  listed comma-separated in `DB_RUNTIME_USERS`.
- `DB_ENCRYPT` and `DB_TRUST_SERVER_CERTIFICATE` configure the SQL Server TLS
  connection.
- `DB_CONNECTION_TIMEOUT_MS` and `DB_REQUEST_TIMEOUT_MS` bound database
  operations.

Required when the job creates or refreshes read-only browse access:

- `DB_READONLY_USER`
- `DB_READONLY_PASSWORD`
- `DATABASE_READONLY_PASSWORD_ENV`

Required for `bootstrap`:

- `DB_BOOTSTRAP_ADMIN_USER` and `DB_BOOTSTRAP_ADMIN_PASSWORD` select the SQL
  Server administrator login used only for bootstrap.
- `DB_BOOTSTRAP_APP_USER` and `DB_BOOTSTRAP_APP_PASSWORD` create the app
  runtime database principal.
- `DB_USER` and `DB_PASSWORD` create the database-job principal used by
  migration and seed commands.

## Sensitive Values

These values are sensitive outside local test and smoke-test contexts:

- `DB_PASSWORD`
- `DB_READONLY_PASSWORD`
- `DB_BOOTSTRAP_ADMIN_PASSWORD`
- `DB_BOOTSTRAP_APP_PASSWORD`

The example file contains public demo values only. Treat them as unsafe for
any exposed environment.

## Update Rules

- Keep job-only env vars in this directory; do not introduce a shared env
  file for multiple containers.
- Keep migration and required seed configuration separate from demo data.
- Use `.env.db-job.local` for local secrets. It matches the existing
  `.env.*.local` Git ignore pattern.
- Keep new demo-only data in the demo profile and outside the production
  `db-job` image.
