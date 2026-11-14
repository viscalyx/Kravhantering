// Release-owned migration helper: preserve this version's semantics once used
// by a released migration. Keep each migration's old/new values in that file.
function identifier(value) {
  if (!/^[a-z][a-z0-9_]*$/i.test(value))
    throw new Error(`Invalid SQL identifier: ${value}`)
  return `[${value}]`
}

function matches(row, values) {
  return Object.entries(values).every(
    ([key, value]) =>
      (typeof row[key] === 'boolean' ? Number(row[key]) : row[key]) ===
      (typeof value === 'boolean' ? Number(value) : value),
  )
}

function predicate(values, parameters, join = ' AND ') {
  return Object.entries(values)
    .map(([key, value]) => {
      if (value === null) return `${identifier(key)} IS NULL`
      parameters.push(value)
      return `${identifier(key)} = @${parameters.length - 1}`
    })
    .join(join)
}

/**
 * Apply explicit additions and guarded changes in a migration transaction. Values and
 * uniqueness keys are release-owned definitions, never administrator input.
 * Returns resolved IDs so dependent entries keep existing surrogate identities.
 */
export async function evolveDefaults(queryRunner, migration, changes) {
  if (!queryRunner.isTransactionActive)
    throw new Error('Default evolution requires the migration transaction')
  // Fresh installations receive only the current catalog from initialization.
  if (queryRunner.connection.options.kravhanteringFreshInstallation === true)
    return []
  const entries = []
  const resolved = new Map()
  for (const change of changes) {
    const { logicalId, table, unique = [], dependencies = {} } = change
    if (!logicalId || resolved.has(logicalId))
      throw new Error('Default evolution requires distinct logical identifiers')
    const values = { ...change.values }
    const entry = {
      migration,
      logicalId,
      table,
      outcome: 'unchanged',
      id: null,
    }
    const omit = (reason, dependencyCause = null) => {
      if (change.required) {
        const error = new Error(
          `Required default conflict: ${logicalId}: ${reason}`,
        )
        error.code = 'REQUIRED_DEFAULT_CONFLICT'
        throw error
      }
      Object.assign(entry, {
        outcome: 'skipped',
        reason,
        dependencyCause,
        actionRequired: false,
        requiredAction:
          'To add this optional entry, use a deliberate later migration or a supported administrator action.',
        automaticRetry: false,
      })
    }
    for (const [column, dependency] of Object.entries(dependencies)) {
      if (!resolved.has(dependency))
        throw new Error(`Unresolved default dependency: ${dependency}`)
      const parent = resolved.get(dependency)
      if (parent.reason === 'customized_values_preserved') {
        omit('dependency_customized', dependency)
        break
      }
      if (parent.id === null || parent.outcome === 'skipped') {
        omit('dependency_omitted', dependency)
        break
      }
      values[column] = parent.id
    }
    if (entry.outcome !== 'skipped' && change.previous) {
      if (
        !change.identity ||
        !Object.keys(change.identity).length ||
        Object.keys(values).some(
          key => key === 'id' || !(key in change.previous),
        )
      )
        throw new Error(
          `Changed defaults require identity and previous affected values: ${logicalId}`,
        )
      const parameters = []
      const selected = [
        ...new Set([
          'id',
          ...Object.keys(change.previous),
          ...Object.keys(values),
        ]),
      ]
      const rows = await queryRunner.query(
        `SELECT ${selected.map(identifier).join(', ')} FROM ${identifier(table)} WITH (UPDLOCK, HOLDLOCK) WHERE ${predicate(change.identity, parameters)}`,
        parameters,
      )
      if (rows.length > 1)
        throw new Error(`Ambiguous default identity: ${logicalId}`)
      const row = rows[0]
      if (!row) {
        if (change.required) omit('required_record_missing')
        entry.reason = 'absent_optional_record'
      } else {
        entry.id = row.id
        if (!matches(row, change.previous))
          entry.reason = 'customized_values_preserved'
        else if (!matches(row, values)) {
          const columns = Object.keys(values)
          await queryRunner.query(
            `UPDATE ${identifier(table)} SET ${columns.map((key, index) => `${identifier(key)} = @${index}`).join(', ')} WHERE [id] = @${columns.length}`,
            [...Object.values(values), row.id],
          )
          entry.outcome = 'updated'
        }
      }
    } else if (entry.outcome !== 'skipped') {
      if (values.id == null)
        throw new Error(
          `Default addition requires an intended ID: ${logicalId}`,
        )
      const parameters = []
      const candidates = await queryRunner.query(
        `SELECT ${Object.keys(values).map(identifier).join(', ')} FROM ${identifier(table)} WITH (UPDLOCK, HOLDLOCK) WHERE ${predicate(Object.fromEntries(['id', ...unique].map(key => [key, values[key]])), parameters, ' OR ')}`,
        parameters,
      )
      // Equivalence includes every coupled structural value, not names alone.
      const equivalent = candidates.filter(
        row =>
          (!change.required || row.id === values.id) &&
          matches(
            row,
            Object.fromEntries(
              Object.entries(values).filter(([key]) => key !== 'id'),
            ),
          ),
      )
      if (equivalent.length === 1) entry.id = equivalent[0].id
      else if (candidates.length) omit('identity_or_value_conflict')
      else {
        const columns = Object.keys(values)
        const sql = `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(', ')}) OUTPUT INSERTED.[id] VALUES (${columns.map((_, index) => `@${index}`).join(', ')});`
        const rows = await queryRunner.query(
          `SET IDENTITY_INSERT ${identifier(table)} ON; BEGIN TRY ${sql} SET IDENTITY_INSERT ${identifier(table)} OFF; END TRY BEGIN CATCH SET IDENTITY_INSERT ${identifier(table)} OFF; THROW; END CATCH;`,
          Object.values(values),
        )
        if (rows.length !== 1 || rows[0].id == null)
          throw new Error('Default insert did not return one ID')
        entry.id = rows[0].id
        entry.outcome = 'inserted'
      }
    }
    entries.push(entry)
    resolved.set(logicalId, entry)
  }
  queryRunner.connection.options.kravhanteringMigrationEntries?.push(...entries)
  return entries
}
