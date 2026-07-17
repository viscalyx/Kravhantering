import {
  resetSqlServerDatabase,
  runSqlServerMigrations,
} from '@/scripts/db-sqlserver-admin.mjs'
import { resolveSqlIntegrationTestsUrl } from './sql-test-database'

export default async function setup(): Promise<void> {
  const url = resolveSqlIntegrationTestsUrl()
  await resetSqlServerDatabase(url)
  await runSqlServerMigrations(url)
}
