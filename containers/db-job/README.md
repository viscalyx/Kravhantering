# DB Job Container Contract

This directory owns the runtime contract for one-shot database jobs. Later
phases use the `db-job` target from the same app Dockerfile as the runtime app
image.

## Owned Configuration

- Env vars for migration, required seed, and optional demo seed jobs.
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

- `bootstrap` creates the database plus the app and job SQL principals.
- `migrate` applies TypeORM migrations.
- `seed:required` applies only required system and lookup seed data.
- `demo:clear --confirm-clear-non-required-data` clears non-required rows.
- `health` runs a simple SQL Server read check.
- `wait` polls SQL Server until it responds.

A production-like empty database is bootstrap, migration, and
`seed:required`. The image intentionally includes `typeorm/seed-required.mjs`
and excludes
`typeorm/seed.mjs`, dogfood seed, archiving-retention demo seed, tests, and
documentation.

The image installs only the dependency subset needed by the one-shot job:
`mssql`, `typeorm`, and `reflect-metadata`. It deliberately does not include
the Next.js application dependency tree.

`seed:demo` remains a local development and release-smoke command in the
source tree. The local container stack runs it only in release-smoke mode by
mounting the demo seed files read-only from the workspace. Demo/test data must
not be baked into this production `db-job` image. `demo:clear` is available in
the production image because it only removes non-required data and does not
load the demo seed files.

## Environment Variables

Required values:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` select the
  SQL Server database used for migrations and required seed data.
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
