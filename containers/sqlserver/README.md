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

For local test runs, prefer a loopback-only value such as
`127.0.0.1:1433` so SQL Server is not exposed on every host interface.

## Runtime Volume

The SQL Server data directory is `/var/opt/mssql`. Compose generation should
mount a named volume there so database files survive container restarts.

PR, pre-release, release smoke-test, and local test flows should use a
run-specific volume and remove it after collecting logs and status.

The SQL Server container remains the database engine only. Migrations,
required seed, demo seed, and release-smoke data stay in the `db-job` flow.

## Sensitive Values

These values are sensitive outside local test and smoke-test contexts:

- `MSSQL_SA_PASSWORD`

The example file contains public demo values only. Treat them as unsafe for
any exposed environment.

## Image Lock Updates

`image.lock.json` pins the upstream image by tag, manifest digest and image ID.

The normal update path is `.github/workflows/vendor-image-updates.yml`. It runs
weekly from `main` and can also be started manually with `workflow_dispatch`.
The updater opens or refreshes one PR per SQL Server product-year lane, updates
`tag`, `manifestDigest` and `imageId` together, and keeps static SQL Server
Compose references aligned with the lock. Review the generated PR and let the
normal PR workflows, including Container PR Smoke, validate the change before
merging.

Use the manual path when selecting an exceptional tag, recovering a failed
automation run, or changing registry or pinning policy:

1. Choose the new Microsoft SQL Server tag. Prefer a version- or CU-specific
   tag and avoid moving tags such as `2025-latest` for release locks.
2. Resolve the current manifest digest and image ID from Microsoft Artifact
   Registry.
3. Update `tag`, `manifestDigest` and `imageId` together in
   `image.lock.json`.
4. Run `npm run container:stack-lock:check` after generating a stack lock to
   verify that the stack lock copies this vendor entry exactly.
5. Verify the updated image with the local release-smoke flow:
   `npm run container:release-smoke:up`,
   `npm run test:release-smoke`, and
   `npm run container:release-smoke:down`.

## Update Rules

- Keep SQL Server-only env vars in this directory; do not introduce a shared
  env file for multiple containers.
- Use `.env.sqlserver.local` for local secrets. It matches the existing
  `.env.*.local` Git ignore pattern.
- Do not add Node.js, TypeORM, app code, migration code, or seed code to this
  vendor container.
- Do not add `mssql.conf` unless a later design decision requires concrete
  server-level SQL Server settings.
