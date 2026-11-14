import {
  resetSqlServerDatabase,
  runSqlServerMigrations,
} from '@/scripts/db-sqlserver-admin.mjs'
import { resolveSqlIntegrationTestsUrl } from './sql-test-database'

export default async function setup(): Promise<void> {
  const url = resolveSqlIntegrationTestsUrl()
  await resetSqlServerDatabase(url)
  // This isolated database has no application login. Runtime-role tests create
  // their own principals; development runtime users belong to the dev database.
  await runSqlServerMigrations(url, { expectedRuntimeUsers: [] })
}
