import { asc } from 'drizzle-orm'
import { requirementListColumnDefaults, uiTerminology } from '@/drizzle/schema'
import type { Database } from '@/lib/db'
import {
  normalizeRequirementListColumnDefaults,
  type RequirementColumnId,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import { createRequirementsLogger } from '@/lib/requirements/logging'
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

const logger = createRequirementsLogger()

function mapUiTerminologyRow(
  row: typeof uiTerminology.$inferSelect,
): UiTermTranslation {
  return {
    en: {
      definitePlural: row.enDefinitePlural,
      plural: row.enPlural,
      singular: row.enSingular,
    },
    key: row.key as UiTermKey,
    sv: {
      definitePlural: row.svDefinitePlural,
      plural: row.svPlural,
      singular: row.svSingular,
    },
  } as UiTermTranslation
}

async function loadTerminology(db: Database) {
  try {
    const rows = await db.select().from(uiTerminology)
    return normalizeUiTerminology(rows.map(mapUiTerminologyRow))
  } catch (error) {
    logger.error('ui_settings.load_terminology_failed', {
      error:
        error instanceof Error
          ? error.message
          : 'Unknown terminology storage error',
    })
    throw error
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
        defaultVisible: row.defaultVisible,
        sortOrder: row.sortOrder,
      })),
    )
  } catch (error) {
    logger.error('ui_settings.load_column_defaults_failed', {
      error:
        error instanceof Error
          ? error.message
          : 'Unknown column defaults storage error',
    })
    throw error
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
        enDefinitePlural: entry.en.definitePlural,
        enPlural: entry.en.plural,
        enSingular: entry.en.singular,
        key: entry.key,
        svDefinitePlural: entry.sv.definitePlural,
        svPlural: entry.sv.plural,
        svSingular: entry.sv.singular,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: uiTerminology.key,
        set: {
          enDefinitePlural: entry.en.definitePlural,
          enPlural: entry.en.plural,
          enSingular: entry.en.singular,
          svDefinitePlural: entry.sv.definitePlural,
          svPlural: entry.sv.plural,
          svSingular: entry.sv.singular,
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
        defaultVisible: entry.defaultVisible,
        sortOrder: entry.sortOrder + temporarySortOrderOffset,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: requirementListColumnDefaults.columnId,
        set: {
          defaultVisible: entry.defaultVisible,
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
        defaultVisible: entry.defaultVisible,
        sortOrder: entry.sortOrder,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: requirementListColumnDefaults.columnId,
        set: {
          defaultVisible: entry.defaultVisible,
          sortOrder: entry.sortOrder,
          updatedAt,
        },
      })
  }

  return normalized
}
