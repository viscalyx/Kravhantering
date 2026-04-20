import { asc } from 'drizzle-orm'
import { requirementListColumnDefaults, uiTerminology } from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'
import {
  normalizeRequirementListColumnDefaults,
  type RequirementColumnId,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import { toBoolean } from '@/lib/typeorm/value-mappers'
import {
  buildUiTerminologyPayload,
  normalizeUiTerminology,
  type UiTermKey,
  type UiTermTranslation,
} from '@/lib/ui-terminology'

export interface UiSettingsLoader {
  getColumnDefaults: () => Promise<RequirementListColumnDefault[]>
  getTerminology: () => Promise<Record<UiTermKey, UiTermTranslation>>
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

interface SqlServerUiTerminologyRow {
  definitePluralEn: string
  definitePluralSv: string
  key: UiTermKey
  pluralEn: string
  pluralSv: string
  singularEn: string
  singularSv: string
}

interface SqlServerRequirementListColumnDefaultRow {
  columnId: RequirementColumnId
  isDefaultVisible: boolean | number | string
  sortOrder: number
}

function mapUiTerminologyRow(
  row: typeof uiTerminology.$inferSelect,
): UiTermTranslation {
  return {
    en: {
      definitePlural: row.definitePluralEn,
      plural: row.pluralEn,
      singular: row.singularEn,
    },
    key: row.key as UiTermKey,
    sv: {
      definitePlural: row.definitePluralSv,
      plural: row.pluralSv,
      singular: row.singularSv,
    },
  } as UiTermTranslation
}

function mapSqlServerUiTerminologyRow(
  row: SqlServerUiTerminologyRow,
): UiTermTranslation {
  return {
    en: {
      definitePlural: row.definitePluralEn,
      plural: row.pluralEn,
      singular: row.singularEn,
    },
    key: row.key,
    sv: {
      definitePlural: row.definitePluralSv,
      plural: row.pluralSv,
      singular: row.singularSv,
    },
  }
}

async function loadTerminology(db: AppDatabaseConnection) {
  try {
    if (isSqlServerDatabaseConnection(db)) {
      const rows = await db.query(`
        SELECT
          [key] AS [key],
          singular_sv AS singularSv,
          plural_sv AS pluralSv,
          definite_plural_sv AS definitePluralSv,
          singular_en AS singularEn,
          plural_en AS pluralEn,
          definite_plural_en AS definitePluralEn
        FROM ui_terminology
        ORDER BY [key] ASC
      `)
      return normalizeUiTerminology(
        (rows as SqlServerUiTerminologyRow[]).map(mapSqlServerUiTerminologyRow),
      )
    }

    const rows = await db.select().from(uiTerminology)
    return normalizeUiTerminology(rows.map(mapUiTerminologyRow))
  } catch (error) {
    throw new Error('Failed to load UI terminology from the database.', {
      cause: error,
    })
  }
}

async function loadColumnDefaults(db: AppDatabaseConnection) {
  try {
    if (isSqlServerDatabaseConnection(db)) {
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
    }

    const rows = await db
      .select()
      .from(requirementListColumnDefaults)
      .orderBy(asc(requirementListColumnDefaults.sortOrder))

    return normalizeRequirementListColumnDefaults(
      rows.map(row => ({
        columnId: row.columnId as RequirementColumnId,
        defaultVisible: row.isDefaultVisible,
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
  db: AppDatabaseConnection,
): UiSettingsLoader {
  let terminologyPromise: Promise<Record<UiTermKey, UiTermTranslation>> | null =
    null
  let columnDefaultsPromise: Promise<RequirementListColumnDefault[]> | null =
    null

  return {
    getColumnDefaults() {
      columnDefaultsPromise ??= loadColumnDefaults(db)
      return columnDefaultsPromise
    },
    getTerminology() {
      terminologyPromise ??= loadTerminology(db)
      return terminologyPromise
    },
  }
}

export async function getUiTerminology(db: AppDatabaseConnection) {
  return createUiSettingsLoader(db).getTerminology()
}

export async function getRequirementListColumnDefaults(
  db: AppDatabaseConnection,
) {
  return createUiSettingsLoader(db).getColumnDefaults()
}

export async function updateUiTerminology(
  db: AppDatabaseConnection,
  values: readonly Partial<UiTermTranslation>[],
) {
  const normalized = normalizeUiTerminology(values)
  const updatedAt = new Date().toISOString()

  if (isSqlServerDatabaseConnection(db)) {
    for (const entry of buildUiTerminologyPayload(normalized)) {
      await db.query(
        `
          UPDATE ui_terminology
          SET
            singular_sv = @1,
            plural_sv = @2,
            definite_plural_sv = @3,
            singular_en = @4,
            plural_en = @5,
            definite_plural_en = @6,
            updated_at = @7
          WHERE [key] = @0

          IF @@ROWCOUNT = 0
          BEGIN
            INSERT INTO ui_terminology (
              [key],
              singular_sv,
              plural_sv,
              definite_plural_sv,
              singular_en,
              plural_en,
              definite_plural_en,
              updated_at
            )
            VALUES (@0, @1, @2, @3, @4, @5, @6, @7)
          END
        `,
        [
          entry.key,
          entry.sv.singular,
          entry.sv.plural,
          entry.sv.definitePlural,
          entry.en.singular,
          entry.en.plural,
          entry.en.definitePlural,
          updatedAt,
        ],
      )
    }

    return normalized
  }

  for (const entry of buildUiTerminologyPayload(normalized)) {
    await db
      .insert(uiTerminology)
      .values({
        definitePluralEn: entry.en.definitePlural,
        pluralEn: entry.en.plural,
        singularEn: entry.en.singular,
        key: entry.key,
        definitePluralSv: entry.sv.definitePlural,
        pluralSv: entry.sv.plural,
        singularSv: entry.sv.singular,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: uiTerminology.key,
        set: {
          definitePluralEn: entry.en.definitePlural,
          pluralEn: entry.en.plural,
          singularEn: entry.en.singular,
          definitePluralSv: entry.sv.definitePlural,
          pluralSv: entry.sv.plural,
          singularSv: entry.sv.singular,
          updatedAt,
        },
      })
  }

  return normalized
}

export async function updateRequirementListColumnDefaults(
  db: AppDatabaseConnection,
  values: readonly Partial<RequirementListColumnDefault>[],
) {
  const normalized = normalizeRequirementListColumnDefaults(values)
  const updatedAt = new Date().toISOString()

  if (isSqlServerDatabaseConnection(db)) {
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
          [
            entry.columnId,
            entry.sortOrder,
            entry.defaultVisible,
            updatedAt,
          ],
        )
      }
    })

    return normalized
  }

  const temporarySortOrderOffset = normalized.length

  for (const entry of normalized) {
    await db
      .insert(requirementListColumnDefaults)
      .values({
        columnId: entry.columnId,
        isDefaultVisible: entry.defaultVisible,
        sortOrder: entry.sortOrder + temporarySortOrderOffset,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: requirementListColumnDefaults.columnId,
        set: {
          isDefaultVisible: entry.defaultVisible,
          sortOrder: entry.sortOrder + temporarySortOrderOffset,
          updatedAt,
        },
      })
  }

  for (const entry of normalized) {
    await db
      .insert(requirementListColumnDefaults)
      .values({
        columnId: entry.columnId,
        isDefaultVisible: entry.defaultVisible,
        sortOrder: entry.sortOrder,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: requirementListColumnDefaults.columnId,
        set: {
          isDefaultVisible: entry.defaultVisible,
          sortOrder: entry.sortOrder,
          updatedAt,
        },
      })
  }

  return normalized
}
