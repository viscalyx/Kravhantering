export function seedPositionDetail({
  table,
  rowIndex,
  primaryKeyDetail = 'pk={}',
}) {
  return table != null
    ? ` while seeding table='${table}' rowIndex=${rowIndex} ${primaryKeyDetail}`
    : ` while seeding table=${String(table)} rowIndex=${rowIndex}`
}

function normalizeTableSet(value) {
  if (value == null) return null
  return value instanceof Set ? value : new Set(value)
}

export async function runSeedData(
  executor,
  seedData,
  tableOrder,
  options = {},
) {
  const includeTables = normalizeTableSet(options.includeTables)
  const excludeTables = normalizeTableSet(options.excludeTables)
  let runner = null
  let queryTarget = executor
  let startedTransaction = false
  if (typeof executor?.createQueryRunner === 'function') {
    runner = executor.createQueryRunner()
    await runner.connect()
    if (typeof runner.startTransaction === 'function') {
      await runner.startTransaction()
      startedTransaction = true
    }
    queryTarget = runner
  }
  const query = queryTarget?.query
    ? (sql, params) => queryTarget.query(sql, params)
    : null
  if (!query) {
    if (runner) await runner.release()
    throw new Error(
      'runSeedData requires a DataSource, QueryRunner, or EntityManager with a .query method',
    )
  }
  const debug =
    process.env.SEED_DEBUG === '1' || process.env.SEED_DEBUG === 'true'
  let inserted = 0
  let currentTable = null
  let currentEntry = null
  let currentRowIndex = -1
  let currentRow = null
  const seedPrimaryKeyDetail = () => {
    if (!currentEntry || !currentRow || currentEntry.pk.length === 0) {
      return 'pk={}'
    }

    const values = currentEntry.pk.map(pkCol => {
      const columnIndex = currentEntry.columns.indexOf(pkCol)
      const value = columnIndex >= 0 ? currentRow[columnIndex] : undefined
      return `${pkCol}=${String(value)}`
    })

    return `pk={${values.join(', ')}}`
  }
  const currentSeedPositionDetail = () =>
    seedPositionDetail({
      primaryKeyDetail: seedPrimaryKeyDetail(),
      rowIndex: currentRowIndex,
      table: currentTable,
    })
  let commitError = null
  try {
    for (const table of tableOrder) {
      if (includeTables && !includeTables.has(table)) continue
      if (excludeTables?.has(table)) continue

      const entry = seedData[table]
      if (!entry || entry.rows.length === 0) continue
      currentTable = table
      currentEntry = entry
      const colList = entry.columns.map(c => `[${c}]`).join(', ')
      const hasIdentityId =
        entry.columns.includes('id') &&
        entry.pk.length === 1 &&
        entry.pk[0] === 'id'
      if (debug) {
        console.error(
          `[seed] table=${table} rows=${entry.rows.length} identityInsert=${hasIdentityId}`,
        )
      }
      try {
        for (let rowIndex = 0; rowIndex < entry.rows.length; rowIndex += 1) {
          const row = entry.rows[rowIndex]
          currentRowIndex = rowIndex
          currentRow = row
          const placeholders = row.map((_, i) => `@${i}`).join(', ')
          let insertSql
          if (entry.pk.length > 0) {
            const whereClause = entry.pk
              .map(pkCol => `[${pkCol}] = @${entry.columns.indexOf(pkCol)}`)
              .join(' AND ')
            insertSql = `IF NOT EXISTS (SELECT 1 FROM [${table}] WHERE ${whereClause}) INSERT INTO [${table}] (${colList}) VALUES (${placeholders});`
          } else {
            insertSql = `INSERT INTO [${table}] (${colList}) VALUES (${placeholders});`
          }
          const sql = hasIdentityId
            ? `SET IDENTITY_INSERT [${table}] ON; ${insertSql} SET IDENTITY_INSERT [${table}] OFF;`
            : insertSql
          await query(sql, row)
          inserted += 1
        }
      } finally {
        // No-op: IDENTITY_INSERT is bundled per-row above.
      }
      currentTable = null
      currentEntry = null
      currentRowIndex = -1
      currentRow = null
    }
  } catch (error) {
    let rollbackError = null
    if (startedTransaction && runner) {
      try {
        await runner.rollbackTransaction()
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError
      } finally {
        startedTransaction = false
      }
    }
    const detail = currentSeedPositionDetail()
    const message = error instanceof Error ? error.message : String(error)
    const rollbackMessage =
      rollbackError instanceof Error
        ? rollbackError.message
        : rollbackError == null
          ? null
          : String(rollbackError)
    const wrapped = new Error(
      rollbackMessage
        ? `Seed failed${detail}: ${message}; rollback also failed: ${rollbackMessage}`
        : `Seed failed${detail}: ${message}`,
    )
    if (error instanceof Error && error.stack) wrapped.stack = error.stack
    if (rollbackError != null) {
      wrapped.rollbackError = rollbackError
    }
    throw wrapped
  } finally {
    if (startedTransaction && runner) {
      try {
        await runner.commitTransaction()
        startedTransaction = false
      } catch (caughtCommitError) {
        commitError = caughtCommitError
      }
    }
    if (runner) {
      try {
        await runner.release()
      } catch {
        // ignore release errors
      }
    }
  }
  if (commitError != null) {
    const detail = currentSeedPositionDetail()
    const message =
      commitError instanceof Error ? commitError.message : String(commitError)
    throw new Error(`Seed commit failed${detail}: ${message}`)
  }
  return inserted
}
