import { asc } from 'drizzle-orm'
import { requirementListColumnDefaults, uiTerminology } from '@/drizzle/schema'
import type { Database } from '@/lib/db'
import {
  normalizeRequirementListColumnDefaults,
  type RequirementColumnId,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
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

async function loadTerminology(db: Database) {
  try {
    const rows = await db.select().from(uiTerminology)
    return normalizeUiTerminology(rows.map(mapUiTerminologyRow))
  } catch (error) {
    throw new Error('Failed to load UI terminology from the database.', {
      cause: error,
    })
  }
}

async function loadColumnDefaults(db: Database) {
  try {
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

export function createUiSettingsLoader(db: Database): UiSettingsLoader {
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

export async function getUiTerminology(db: Database) {
  return createUiSettingsLoader(db).getTerminology()
}

export async function getRequirementListColumnDefaults(db: Database) {
  return createUiSettingsLoader(db).getColumnDefaults()
}

export async function updateUiTerminology(
  db: Database,
  values: readonly Partial<UiTermTranslation>[],
) {
  const normalized = normalizeUiTerminology(values)
  const updatedAt = new Date().toISOString()

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
  db: Database,
  values: readonly Partial<RequirementListColumnDefault>[],
) {
  const normalized = normalizeRequirementListColumnDefaults(values)
  const updatedAt = new Date().toISOString()
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
