import {
  OPTIONAL_SEED_DATA,
  OPTIONAL_SEED_TABLES,
} from './seed-optional-data.mjs'
import {
  reconcileSeedProfile,
  reconcileSeedRecord,
} from './seed-reconciliation.mjs'

function conflict(table, id, reason) {
  const error = new Error(
    `Optional initialization conflict: ${table} id=${id}: ${reason}`,
  )
  error.code = 'OPTIONAL_SEED_CONFLICT'
  error.logicalRecord = `${table}:id=${id}`
  return error
}

export async function seedOptionalDatabase(executor) {
  let initialization = 'already_complete'
  const optional = await reconcileSeedProfile(
    executor,
    'optional',
    async (target, entries) => {
      const state = await target.query(
        'SELECT [completed_at] FROM [optional_catalog_initializations] WITH (UPDLOCK, HOLDLOCK) WHERE [id] = 1',
      )
      if (state.length !== 1)
        throw new Error(
          'Optional initialization state is missing; run migrations before initialization.',
        )
      if (state[0].completed_at !== null) return
      const resolved = new Map()
      for (const table of OPTIONAL_SEED_TABLES) {
        const definition = OPTIONAL_SEED_DATA[table]
        for (const row of definition.rows) {
          const values = Object.fromEntries(
            definition.columns.map((column, index) => [column, row[index]]),
          )
          const shippedId = values.id
          if (table === 'quality_characteristics') {
            values.requirement_type_id = resolved.get(
              `requirement_types:${values.requirement_type_id}`,
            )
            if (values.parent_id !== null)
              values.parent_id = resolved.get(`${table}:${values.parent_id}`)
            if (
              values.requirement_type_id == null ||
              values.parent_id === undefined
            ) {
              throw conflict(table, shippedId, 'unresolved catalog dependency')
            }
          }
          // Names alone cannot establish equivalence: compare the entire coupled entry.
          const candidates = await target.query(
            `SELECT ${definition.columns.map(column => `[${column}]`).join(', ')} FROM [${table}] WITH (UPDLOCK, HOLDLOCK)
           WHERE [id] = @0 OR [name_sv] = @1 OR [name_en] = @2`,
            [shippedId, values.name_sv, values.name_en],
          )
          const equivalent = candidates.filter(candidate =>
            definition.columns.every(
              column => column === 'id' || candidate[column] === values[column],
            ),
          )
          if (equivalent.length > 1)
            throw conflict(table, shippedId, 'multiple equivalent entries')
          let entry
          if (equivalent.length === 1) {
            entry = {
              table,
              identity: `id=${shippedId}`,
              id: equivalent[0].id,
              outcome: 'unchanged',
            }
          } else {
            if (candidates.length)
              throw conflict(
                table,
                shippedId,
                `occupied or inconsistent entry id=${candidates[0].id}`,
              )
            entry = await reconcileSeedRecord(target, { table, values })
          }
          resolved.set(`${table}:${shippedId}`, entry.id)
          entries.push(entry)
        }
      }
      await target.query(
        'UPDATE [optional_catalog_initializations] SET [completed_at] = SYSUTCDATETIME() WHERE [id] = 1',
      )
      initialization = 'initialized'
    },
  ).catch(error => {
    if (error.seedProfileResult) {
      error.seedProfileResult.initialization =
        error.seedProfileResult.transaction === 'committed'
          ? initialization
          : error.seedProfileResult.transaction === 'unknown'
            ? 'unknown'
            : 'incomplete'
    }
    throw error
  })
  optional.initialization = initialization
  return { optional, counts: optional.counts }
}
