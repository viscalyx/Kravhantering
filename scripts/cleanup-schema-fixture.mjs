import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  selectCleanupSourceMigrations,
  validateCleanupFixtureInputs,
} from './containers/cleanup-source-schema.mjs'
import {
  bootstrapSqlServerDatabase,
  getSqlServerMigrationUrl,
  loadMigrationDescriptors,
  MIGRATIONS_DIR,
  runSqlServerMigrations,
} from './db-sqlserver-admin.mjs'

export async function createCleanupSchemaFixture(
  source,
  databaseName,
  env = process.env,
) {
  validateCleanupFixtureInputs(
    source,
    databaseName,
    env,
    fs.readFileSync(
      path.join(MIGRATIONS_DIR, '../runtime-permission-manifest.mjs'),
    ),
  )
  const migrations = selectCleanupSourceMigrations(
    source,
    await loadMigrationDescriptors(),
    file => fs.readFileSync(path.join(MIGRATIONS_DIR, file)),
  )
  const url = new URL(getSqlServerMigrationUrl(env))
  url.pathname = `/${databaseName}`
  const options = { env, migrationDescriptors: migrations }
  await bootstrapSqlServerDatabase(url.toString(), options)
  await runSqlServerMigrations(url.toString(), options)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length !== 4) throw new Error('fixture arguments required')
    await createCleanupSchemaFixture(
      JSON.parse(fs.readFileSync(process.argv[2], 'utf8')),
      process.argv[3],
    )
    console.info(
      JSON.stringify({
        event: 'transient_cleanup.fixture.prepared',
        outcome: 'success',
      }),
    )
  } catch {
    console.error(
      JSON.stringify({
        event: 'transient_cleanup.fixture.prepared',
        outcome: 'failure',
      }),
    )
    process.exitCode = 1
  }
}
