import type { SqlServerDatabase } from '@/lib/db'
import {
  normalizeRequirementListColumnDefaults,
  type RequirementColumnId,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import { toBoolean } from '@/lib/typeorm/value-mappers'

export interface UiSettingsLoader {
  getColumnDefaults: () => Promise<RequirementListColumnDefault[]>
}

export function formatUiSettingsLoadError(
  error: unknown,
): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      cause: error.cause,
      message: error.message,
      stack: error.stack,
    }
  }

  return { error }
}

interface SqlServerRequirementListColumnDefaultRow {
  columnId: RequirementColumnId
  isDefaultVisible: boolean | number | string
  sortOrder: number
}

interface QueryExecutor {
  query<T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T>
}

interface UiSettingsWriteOptions {
  audit?: (executor: QueryExecutor) => Promise<void>
}

async function loadColumnDefaults(db: SqlServerDatabase) {
  try {
    const rows = await db.query(`
      SELECT
        column_id AS columnId,
        sort_order AS sortOrder,
        is_default_visible AS isDefaultVisible
      FROM requirement_list_column_defaults
      ORDER BY sort_order ASC
    `)

    return normalizeRequirementListColumnDefaults(
      (rows as SqlServerRequirementListColumnDefaultRow[]).map(row => ({
        columnId: row.columnId,
        defaultVisible: toBoolean(row.isDefaultVisible),
        sortOrder: row.sortOrder,
      })),
    )
  } catch (error) {
    throw new Error(
      'Failed to load requirement column defaults from the database.',
      {
        cause: error,
      },
    )
  }
}

export function createUiSettingsLoader(
  db: SqlServerDatabase,
): UiSettingsLoader {
  let columnDefaultsPromise: Promise<RequirementListColumnDefault[]> | null =
    null

  return {
    getColumnDefaults() {
      columnDefaultsPromise ??= loadColumnDefaults(db)
      return columnDefaultsPromise
    },
  }
}

export async function getRequirementListColumnDefaults(db: SqlServerDatabase) {
  return createUiSettingsLoader(db).getColumnDefaults()
}

export async function updateRequirementListColumnDefaults(
  db: SqlServerDatabase,
  values: readonly Partial<RequirementListColumnDefault>[],
  options: UiSettingsWriteOptions = {},
) {
  const normalized = normalizeRequirementListColumnDefaults(values)
  const updatedAt = new Date().toISOString()

  await db.transaction(async manager => {
    await manager.query(`DELETE FROM requirement_list_column_defaults`)

    for (const entry of normalized) {
      await manager.query(
        `
          INSERT INTO requirement_list_column_defaults (
            column_id,
            sort_order,
            is_default_visible,
            updated_at
          )
          VALUES (@0, @1, @2, @3)
        `,
        [entry.columnId, entry.sortOrder, entry.defaultVisible, updatedAt],
      )
    }
    await options.audit?.(manager)
  })

  return normalized
}
