# SQL Server Container Contract

This directory owns the runtime contract for the Microsoft SQL Server vendor
container. It defines the SQL Server env contract, image lock, and expected
runtime volume. It does not add a Compose service or wrapper image.

## Owned Configuration

- SQL Server container env vars.
- Public example values in `.env.sqlserver.example`.
- The vendor image lock in `image.lock.json`.
- SQL Server runtime notes for the database volume.

The SQL Server container must stay a database engine only. Migrations,
required seed data, and demo seed data belong to `db-job`.

## Environment Variables

Required values:

- `ACCEPT_EULA=Y` accepts the Microsoft SQL Server container license.
- `MSSQL_PID` selects the SQL Server edition for the container.
- `MSSQL_SA_PASSWORD` sets the initial administrator password.

Local helper value:

- `SQLSERVER_HOST_PORT` can be used by future local Compose generation when a
  host port is needed.

For local PoC/demo runs, prefer a loopback-only value such as
`127.0.0.1:1433` so SQL Server is not exposed on every host interface.

## Runtime Volume

The SQL Server data directory is `/var/opt/mssql`. Compose generation should
mount a named volume there so database files survive container restarts.

PR, pre-release, and release smoke-test flows should use a run-specific
volume and remove it after collecting logs and status. Local PoC/demo may use
a stable named volume and should document a reset command in the later
Compose phase.

The SQL Server container remains the database engine only. Migrations,
required seed, demo seed, and release-smoke data stay in the `db-job` flow.

## Sensitive Values

These values are sensitive outside local demo and smoke-test contexts:

- `MSSQL_SA_PASSWORD`

The example file contains public demo values only. Treat them as unsafe for
any exposed environment.

## Image Lock Updates

`image.lock.json` pins the upstream image by tag and digest.

To update it manually:

1. Choose the new Microsoft SQL Server tag.
2. Resolve the current manifest digest from Microsoft Artifact Registry.
3. Update `tag` and `digest` together in `image.lock.json`.
4. In a later phase, run `scripts/containers/generate-stack-lock.mjs` to
   verify that the stack lock copies this vendor entry exactly.
5. Run the release smoke test when that flow exists.

## Update Rules

- Keep SQL Server-only env vars in this directory; do not introduce a shared
  env file for multiple containers.
- Use `.env.sqlserver.local` for local secrets. It matches the existing
  `.env.*.local` Git ignore pattern.
- Do not add Node.js, TypeORM, app code, migration code, or seed code to this
  vendor container.
- Do not add `mssql.conf` unless a later design decision requires concrete
  server-level SQL Server settings.
