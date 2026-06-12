import { isHsaIdPrefix } from '@/lib/auth/hsa-id'
import type { SqlServerDatabase } from '@/lib/db'
import {
  normalizeRequirementListColumnDefaults,
  type RequirementColumnId,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import { toBoolean } from '@/lib/typeorm/value-mappers'

export interface UiSettingsLoader {
  getColumnDefaults: () => Promise<RequirementListColumnDefault[]>
  getHsaIdPrefixes: () => Promise<HsaIdPrefixOption[]>
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

export interface HsaIdPrefixOption {
  id: number
  isDefault: boolean
  label: string | null
  prefix: string
}

export interface HsaIdPrefixAdminRow extends HsaIdPrefixOption {
  isUsed: boolean
  isVisible: boolean
}

export interface HsaIdPrefixInput {
  id?: number
  isDefault: boolean
  isVisible: boolean
  label?: string | null
  prefix: string
}

interface SqlServerHsaIdPrefixRow {
  id: number
  isDefault: boolean | number | string
  isVisible: boolean | number | string
  label: string | null
  prefix: string
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

const HSA_ID_PREFIX_USAGE_QUERIES = [
  `SELECT TOP (1) [owner_hsa_id] AS hsaId FROM [requirement_areas] WHERE [owner_hsa_id] LIKE @0`,
  `SELECT TOP (1) [hsa_id] AS hsaId FROM [requirement_area_co_authors] WHERE [hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [requirement_area_co_authors] WHERE [created_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [responsible_hsa_id] AS hsaId FROM [requirements_specifications] WHERE [responsible_hsa_id] LIKE @0`,
  `SELECT TOP (1) [hsa_id] AS hsaId FROM [specification_co_authors] WHERE [hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [specification_co_authors] WHERE [created_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [lead_hsa_id] AS hsaId FROM [requirement_packages] WHERE [lead_hsa_id] LIKE @0`,
  `SELECT TOP (1) [hsa_id] AS hsaId FROM [requirement_package_co_authors] WHERE [hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [requirement_package_co_authors] WHERE [created_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [hsa_id] AS hsaId FROM [requirement_responsibility_people] WHERE [hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [requirement_versions] WHERE [created_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [changed_by_hsa_id] AS hsaId FROM [specification_requirement_selection_answers] WHERE [changed_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [deviations] WHERE [created_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [decided_by_hsa_id] AS hsaId FROM [deviations] WHERE [decided_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [specification_local_requirement_deviations] WHERE [created_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [decided_by_hsa_id] AS hsaId FROM [specification_local_requirement_deviations] WHERE [decided_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [improvement_suggestions] WHERE [created_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [resolved_by_hsa_id] AS hsaId FROM [improvement_suggestions] WHERE [resolved_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [access_review_runs] WHERE [created_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [reviewer_hsa_id] AS hsaId FROM [access_review_runs] WHERE [reviewer_hsa_id] LIKE @0`,
  `SELECT TOP (1) [completed_by_hsa_id] AS hsaId FROM [access_review_runs] WHERE [completed_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [principal_hsa_id] AS hsaId FROM [access_review_items] WHERE [principal_hsa_id] LIKE @0`,
  `SELECT TOP (1) [decided_by_hsa_id] AS hsaId FROM [access_review_items] WHERE [decided_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [actor_hsa_id] AS hsaId FROM [action_audit_events] WHERE [actor_hsa_id] LIKE @0`,
  `SELECT TOP (1) [executed_by_hsa_id] AS hsaId FROM [archiving_retention_runs] WHERE [executed_by_hsa_id] LIKE @0`,
  `SELECT TOP (1) [created_by_hsa_id] AS hsaId FROM [archiving_retention_exceptions] WHERE [created_by_hsa_id] LIKE @0`,
]

export class HsaIdPrefixSettingsError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'HsaIdPrefixSettingsError'
    this.code = code
  }
}

function mapHsaIdPrefixRow(row: SqlServerHsaIdPrefixRow): HsaIdPrefixAdminRow {
  return {
    id: row.id,
    isDefault: toBoolean(row.isDefault),
    isUsed: false,
    isVisible: toBoolean(row.isVisible),
    label: row.label,
    prefix: row.prefix,
  }
}

function sortHsaIdPrefixes<T extends { label: string | null; prefix: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((left, right) =>
    (left.label ?? left.prefix).localeCompare(
      right.label ?? right.prefix,
      'sv',
      {
        sensitivity: 'base',
      },
    ),
  )
}

async function isHsaIdPrefixUsed(
  db: QueryExecutor,
  prefix: string,
): Promise<boolean> {
  const pattern = `${prefix}-%`
  for (const sql of HSA_ID_PREFIX_USAGE_QUERIES) {
    const rows = (await db.query(sql, [pattern])) as unknown[]
    if (rows.length > 0) return true
  }
  return false
}

async function listStoredHsaIdPrefixes(
  db: QueryExecutor,
): Promise<HsaIdPrefixAdminRow[]> {
  const rows = (await db.query(`
    SELECT
      id,
      prefix,
      label,
      is_visible AS isVisible,
      is_default AS isDefault
    FROM hsa_id_prefixes
  `)) as SqlServerHsaIdPrefixRow[]

  const mapped = rows.map(mapHsaIdPrefixRow)
  const withUsage = await Promise.all(
    mapped.map(async row => ({
      ...row,
      isUsed: await isHsaIdPrefixUsed(db, row.prefix),
    })),
  )
  return sortHsaIdPrefixes(withUsage)
}

async function loadHsaIdPrefixOptions(
  db: SqlServerDatabase,
): Promise<HsaIdPrefixOption[]> {
  try {
    const rows = (await db.query(`
      SELECT
        id,
        prefix,
        label,
        is_visible AS isVisible,
        is_default AS isDefault
      FROM hsa_id_prefixes
      WHERE is_visible = 1
    `)) as SqlServerHsaIdPrefixRow[]

    return sortHsaIdPrefixes(rows.map(mapHsaIdPrefixRow)).map(row => ({
      id: row.id,
      isDefault: row.isDefault,
      label: row.label,
      prefix: row.prefix,
    }))
  } catch (error) {
    throw new Error('Failed to load HSA-id prefixes from the database.', {
      cause: error,
    })
  }
}

function normalizeHsaIdPrefixInputs(
  values: readonly HsaIdPrefixInput[],
): HsaIdPrefixInput[] {
  const normalized = values.map(value => {
    const prefix = value.prefix.trim()
    const label = value.label?.trim() || null
    if (!isHsaIdPrefix(prefix)) {
      throw new HsaIdPrefixSettingsError(
        'invalid_prefix',
        'HSA-id prefix must use two uppercase letters followed by ten digits.',
      )
    }
    if (value.isDefault && !value.isVisible) {
      throw new HsaIdPrefixSettingsError(
        'default_hidden',
        'The default HSA-id prefix must be visible.',
      )
    }
    return {
      ...value,
      label,
      prefix,
    }
  })

  const prefixSet = new Set(normalized.map(value => value.prefix))
  if (prefixSet.size !== normalized.length) {
    throw new HsaIdPrefixSettingsError(
      'duplicate_prefix',
      'Each HSA-id prefix must be unique.',
    )
  }

  const idValues = normalized
    .map(value => value.id)
    .filter((id): id is number => id !== undefined)
  if (new Set(idValues).size !== idValues.length) {
    throw new HsaIdPrefixSettingsError(
      'duplicate_id',
      'Each HSA-id prefix id must be unique.',
    )
  }

  const visibleCount = normalized.filter(value => value.isVisible).length
  const defaultCount = normalized.filter(value => value.isDefault).length
  if (visibleCount === 0 && defaultCount > 0) {
    throw new HsaIdPrefixSettingsError(
      'default_without_visible_prefix',
      'No HSA-id prefix can be default when every prefix is hidden.',
    )
  }
  if (visibleCount > 0 && defaultCount !== 1) {
    throw new HsaIdPrefixSettingsError(
      'default_required',
      'Exactly one visible HSA-id prefix must be selected as default.',
    )
  }

  return sortHsaIdPrefixes(normalized)
}

export function createUiSettingsLoader(
  db: SqlServerDatabase,
): UiSettingsLoader {
  let columnDefaultsPromise: Promise<RequirementListColumnDefault[]> | null =
    null
  let hsaIdPrefixesPromise: Promise<HsaIdPrefixOption[]> | null = null

  return {
    getColumnDefaults() {
      columnDefaultsPromise ??= loadColumnDefaults(db)
      return columnDefaultsPromise
    },
    getHsaIdPrefixes() {
      hsaIdPrefixesPromise ??= loadHsaIdPrefixOptions(db)
      return hsaIdPrefixesPromise
    },
  }
}

export async function getRequirementListColumnDefaults(db: SqlServerDatabase) {
  return createUiSettingsLoader(db).getColumnDefaults()
}

export async function getVisibleHsaIdPrefixes(db: SqlServerDatabase) {
  return createUiSettingsLoader(db).getHsaIdPrefixes()
}

export async function listHsaIdPrefixesForAdmin(db: SqlServerDatabase) {
  return listStoredHsaIdPrefixes(db)
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

export async function updateHsaIdPrefixes(
  db: SqlServerDatabase,
  values: readonly HsaIdPrefixInput[],
  options: UiSettingsWriteOptions = {},
) {
  const normalized = normalizeHsaIdPrefixInputs(values)
  const existing = await listStoredHsaIdPrefixes(db)
  const existingById = new Map(existing.map(row => [row.id, row]))
  const nextIds = new Set(
    normalized.map(value => value.id).filter((id): id is number => id != null),
  )

  for (const value of normalized) {
    if (value.id === undefined) continue
    const current = existingById.get(value.id)
    if (!current) {
      throw new HsaIdPrefixSettingsError(
        'unknown_id',
        'Cannot update an unknown HSA-id prefix.',
      )
    }
    if (current.prefix !== value.prefix && current.isUsed) {
      throw new HsaIdPrefixSettingsError(
        'used_prefix_cannot_change',
        'A used HSA-id prefix cannot be changed. Hide it and add a new prefix instead.',
      )
    }
  }

  for (const current of existing) {
    if (nextIds.has(current.id)) continue
    if (current.isUsed) {
      throw new HsaIdPrefixSettingsError(
        'used_prefix_cannot_delete',
        'A used HSA-id prefix cannot be deleted. Hide it instead.',
      )
    }
  }

  const now = new Date().toISOString()
  await db.transaction(async manager => {
    for (const current of existing) {
      if (nextIds.has(current.id)) continue
      await manager.query(`DELETE FROM hsa_id_prefixes WHERE id = @0`, [
        current.id,
      ])
    }

    await manager.query(`UPDATE hsa_id_prefixes SET is_default = 0`)

    for (const entry of normalized) {
      if (entry.id === undefined) {
        await manager.query(
          `
            INSERT INTO hsa_id_prefixes (
              prefix,
              label,
              is_visible,
              is_default,
              created_at,
              updated_at
            )
            VALUES (@0, @1, @2, @3, @4, @4)
          `,
          [
            entry.prefix,
            entry.label ?? null,
            entry.isVisible,
            entry.isDefault,
            now,
          ],
        )
      } else {
        await manager.query(
          `
            UPDATE hsa_id_prefixes
            SET
              prefix = @1,
              label = @2,
              is_visible = @3,
              is_default = @4,
              updated_at = @5
            WHERE id = @0
          `,
          [
            entry.id,
            entry.prefix,
            entry.label ?? null,
            entry.isVisible,
            entry.isDefault,
            now,
          ],
        )
      }
    }
    await options.audit?.(manager)
  })

  return listHsaIdPrefixesForAdmin(db)
}
