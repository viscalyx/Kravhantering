import { randomUUID } from 'node:crypto'
import { AbstractLogger } from 'typeorm'
import { seedCounts } from './seed-reconciliation.mjs'

// TypeORM emits migration failures even with logging disabled. Keep its
// diagnostics off stdout so the command emits one parseable JSON document.
export class MigrationDiagnosticsLogger extends AbstractLogger {
  constructor(consoleObj) {
    super(false)
    this.consoleObj = consoleObj
  }
  writeLog(_level, messages) {
    for (const message of Array.isArray(messages) ? messages : [messages])
      this.consoleObj.error(String(message.message ?? message))
  }
}

export function createMigrationReport(env = process.env) {
  return {
    version: 1,
    operation: 'migrate',
    runId: env.DB_MIGRATION_RUN_ID || randomUUID(),
    release: env.RELEASE_VERSION || env.BUILD_VERSION || null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'failed',
    phase: 'prepare',
    migration: {
      transaction: 'not_started',
      applied: [],
      entries: [],
      counts: seedCounts(),
    },
    migrationsApplied: 0,
    permissions: { status: 'not_started' },
  }
}

export function commitMigrationReport(report, migrations, entries) {
  report.migration = {
    transaction: migrations.length ? 'committed' : 'not_needed',
    applied: migrations.map(({ name, timestamp }) => ({
      name,
      timestamp: typeof timestamp === 'number' ? timestamp : null,
    })),
    entries: [...entries],
    counts: seedCounts(entries),
  }
  report.migrationsApplied = migrations.length
}

export function migrationError(error) {
  return {
    code: error?.code ?? 'MIGRATION_COMMAND_FAILED',
    message: error?.message ?? String(error),
  }
}

export function migrationSummary(report) {
  const { inserted, updated, unchanged, skipped } = report.migration.counts
  const omissions = report.migration.entries.filter(
    entry => entry.outcome === 'skipped',
  )
  const details = omissions
    .map(
      entry =>
        `${entry.logicalId}: ${entry.reason}${entry.dependencyCause ? ` (dependency: ${entry.dependencyCause})` : ''}; ${entry.requiredAction}`,
    )
    .join('; ')
  return `SQL Server migrate ${report.status} (phase: ${report.phase}; migrations: ${report.migration.transaction}; ${report.migrationsApplied} applied; permissions: ${report.permissions.status}; ${inserted} inserted, ${updated} updated, ${unchanged} unchanged, ${skipped} skipped; run ${report.runId}).${omissions.length ? ` Optional additions omitted; existing data preserved. No automatic retry. ${details}` : ''}${report.error ? ` ${report.error.message}` : ''}`
}
