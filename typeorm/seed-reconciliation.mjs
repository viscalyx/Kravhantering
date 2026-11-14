import { randomUUID } from 'node:crypto'
import { runSeedTransaction } from './seed-runner.mjs'

export function seedCounts(entries = []) {
  const counts = { inserted: 0, updated: 0, unchanged: 0, skipped: 0 }
  for (const entry of entries) counts[entry.outcome] += 1
  return counts
}

export function createSeedCommandReport(env = process.env) {
  return {
    version: 1,
    operation: 'seed:required',
    runId: env.DB_SEED_RUN_ID || randomUUID(),
    release: env.RELEASE_VERSION || env.BUILD_VERSION || null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'failed',
    phase: 'prepare',
    counts: seedCounts(),
    required: {
      profile: 'required',
      transaction: 'not_started',
      counts: seedCounts(),
      entries: [],
    },
  }
}

export function seedCommandSummary(report) {
  const { inserted, updated, unchanged, skipped } = report.counts
  return `SQL Server required seed ${report.status} (required transaction: ${report.required.transaction}; ${inserted} inserted, ${updated} updated/repaired, ${unchanged} unchanged, ${skipped} skipped; run ${report.runId}).`
}

export function seedConflict(table, identity, reason) {
  const error = new Error(
    `Required seed conflict: ${table} ${identity}: ${reason}`,
  )
  error.code = 'REQUIRED_SEED_CONFLICT'
  error.logicalRecord = `${table}:${identity}`
  return error
}

// All identifiers come from the shipped seed catalog, never command input.
export async function reconcileSeedRecord(
  target,
  {
    table,
    values,
    keys = ['id'],
    identity = true,
    update = [],
    unique = [],
    appendOrder = false,
    timestamp,
  },
) {
  const logicalIdentity = keys.map(key => `${key}=${values[key]}`).join(',')
  const where = keys.map((key, index) => `[${key}] = @${index}`).join(' AND ')
  const keyValues = keys.map(key => values[key])
  const selectedColumns = [
    ...new Set([
      'id',
      ...update,
      ...(table === 'priority_levels' ? ['code'] : []),
    ]),
  ]
  try {
    const matches = await target.query(
      `SELECT ${selectedColumns.map(column => `[${column}]`).join(', ')} FROM [${table}] WITH (UPDLOCK, HOLDLOCK) WHERE ${where}`,
      keyValues,
    )
    if (matches.length > 1)
      throw seedConflict(table, logicalIdentity, 'multiple matching records')
    const existing = matches[0]
    if (
      existing &&
      table === 'priority_levels' &&
      existing.code !== values.code
    ) {
      throw seedConflict(
        table,
        logicalIdentity,
        `expected ${values.code}, found code=${existing.code}`,
      )
    }
    let outcome = 'unchanged'
    let saved = existing
    if (existing) {
      const changed = update.filter(key => {
        const actual =
          typeof existing[key] === 'boolean'
            ? Number(existing[key])
            : existing[key]
        const expected =
          typeof values[key] === 'boolean' ? Number(values[key]) : values[key]
        return actual !== expected
      })
      if (changed.length) {
        if (timestamp) changed.push('updated_at')
        const parameters = changed.map(key =>
          key === 'updated_at' ? timestamp : values[key],
        )
        await target.query(
          `UPDATE [${table}] SET ${changed.map((key, index) => `[${key}] = @${index}`).join(', ')} WHERE [id] = @${parameters.length}`,
          [...parameters, existing.id],
        )
        outcome = 'updated'
      }
    } else {
      for (const key of unique) {
        const conflicts = await target.query(
          `SELECT [id] FROM [${table}] WITH (UPDLOCK, HOLDLOCK) WHERE [${key}] = @0`,
          [values[key]],
        )
        if (conflicts.length)
          throw seedConflict(
            table,
            logicalIdentity,
            `${key} is held by id=${conflicts[0].id}`,
          )
      }
      const insert = { ...values }
      if (!keys.includes('id')) {
        if (identity) delete insert.id
        else insert.id = randomUUID()
      }
      if (appendOrder) {
        const rows = await target.query(
          `SELECT MAX([sort_order]) AS [last_order], SUM(CASE WHEN [sort_order] = @0 THEN 1 ELSE 0 END) AS [occupied] FROM [${table}] WITH (UPDLOCK, HOLDLOCK)`,
          [values.sort_order],
        )
        if (rows[0]?.occupied > 0) insert.sort_order = rows[0].last_order + 1
      }
      const columns = Object.keys(insert)
      const sql = `INSERT INTO [${table}] (${columns.map(key => `[${key}]`).join(', ')}) OUTPUT INSERTED.[id] VALUES (${columns.map((_, index) => `@${index}`).join(', ')});`
      const explicitIdentity = identity && columns.includes('id')
      // Keep session state inside the transaction's reserved connection and
      // clear IDENTITY_INSERT on both SQL success and SQL failure.
      const batch = explicitIdentity
        ? `SET IDENTITY_INSERT [${table}] ON; BEGIN TRY ${sql} SET IDENTITY_INSERT [${table}] OFF; END TRY BEGIN CATCH SET IDENTITY_INSERT [${table}] OFF; THROW; END CATCH;`
        : sql
      const inserted = await target.query(
        batch,
        columns.map(key => insert[key]),
      )
      if (inserted.length !== 1 || inserted[0].id == null) {
        throw new Error('Seed insert did not return exactly one persisted ID')
      }
      saved = { ...insert, id: inserted[0].id }
      outcome = 'inserted'
    }
    return { table, identity: logicalIdentity, id: saved.id, outcome }
  } catch (cause) {
    if (cause?.logicalRecord) throw cause
    const error = new Error(
      `Seed failed while seeding ${table} ${logicalIdentity}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
    error.logicalRecord = `${table}:${logicalIdentity}`
    throw error
  }
}

export async function reconcileSeedProfile(executor, profile, work) {
  const entries = []
  const result = {
    profile,
    transaction: 'pending',
    counts: seedCounts(),
    entries,
  }
  try {
    await runSeedTransaction(executor, target => work(target, entries))
    result.transaction =
      typeof executor.createQueryRunner === 'function' ? 'committed' : 'pending'
    result.counts = seedCounts(entries)
    return result
  } catch (error) {
    result.transaction = error.seedTransactionOutcome ?? 'pending'
    // The owner of an outer transaction must commit before publishing counts.
    result.counts =
      result.transaction === 'committed' ? seedCounts(entries) : seedCounts()
    result.entries = result.transaction === 'committed' ? entries : []
    error.seedProfileResult = result
    throw error
  }
}
