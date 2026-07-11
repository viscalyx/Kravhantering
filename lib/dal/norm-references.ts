import type { SqlServerDatabase } from '@/lib/db'
import { conflictError } from '@/lib/requirements/errors'
import {
  type NormReferenceEntity,
  normReferenceEntity,
} from '@/lib/typeorm/entities'
import { toBoolean, toIsoString } from '@/lib/typeorm/value-mappers'

interface NormReferenceRow {
  createdAt: string
  id: number
  isArchived: boolean
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  updatedAt: string
  uri: string | null
  version: string | null
}

interface LinkedRequirementRow {
  archiveInitiatedAt: string | null
  description: string | null
  id: number
  statusColor: string | null
  statusIconName: string | null
  statusId: number | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

interface ConnectedRequirementIdRow {
  id: number
  uniqueId: string
}

interface NormReferenceUsage {
  libraryRequirementCount: number
  localRequirementCount: number
}

export interface NormReferenceCreateData {
  issuer: string
  name: string
  normReferenceId?: string
  reference: string
  type: string
  uri?: string | null
  version?: string | null
}

export interface NormReferenceUpdateData {
  issuer?: string
  name?: string
  normReferenceId?: string
  reference?: string
  type?: string
  uri?: string | null
  version?: string | null
}

interface NormReferenceDbRow {
  createdAt: Date | string
  id: number
  isArchived: boolean | number | string
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  updatedAt: Date | string
  uri: string | null
  version: string | null
}

interface LinkedRequirementDbRow
  extends Omit<LinkedRequirementRow, 'archiveInitiatedAt'> {
  archiveInitiatedAt: Date | string | null
}

export type {
  ConnectedRequirementIdRow,
  LinkedRequirementRow,
  NormReferenceRow,
  NormReferenceUsage,
}

export const MAX_GENERATED_NORM_REFERENCE_ID_ATTEMPTS = 999

function map(row: NormReferenceEntity): NormReferenceRow {
  return {
    id: row.id,
    normReferenceId: row.normReferenceId,
    name: row.name,
    type: row.type,
    reference: row.reference,
    version: row.version,
    issuer: row.issuer,
    uri: row.uri,
    isArchived: row.isArchived,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

function mapDbRow(row: NormReferenceDbRow): NormReferenceRow {
  return {
    id: row.id,
    normReferenceId: row.normReferenceId,
    name: row.name,
    type: row.type,
    reference: row.reference,
    version: row.version,
    issuer: row.issuer,
    uri: row.uri,
    isArchived: toBoolean(row.isArchived),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

export async function listNormReferences(
  db: SqlServerDatabase,
  options: { includeArchived?: boolean; includeIds?: number[] } = {},
): Promise<NormReferenceRow[]> {
  const params: number[] = [options.includeArchived ? 1 : 0]
  const conditions = ['@0 = 1 OR normReferences.is_archived = 0']
  const includeIds = [...new Set(options.includeIds ?? [])].filter(
    id => Number.isInteger(id) && id > 0,
  )

  if (includeIds.length > 0) {
    const placeholders = includeIds.map(id => {
      params.push(id)
      return `@${params.length - 1}`
    })
    conditions.push(`normReferences.id IN (${placeholders.join(', ')})`)
  }

  const rows = await db.query<NormReferenceDbRow[]>(
    `
      SELECT
        normReferences.id AS id,
        normReferences.norm_reference_id AS normReferenceId,
        normReferences.name AS name,
        normReferences.type AS type,
        normReferences.reference AS reference,
        normReferences.version AS version,
        normReferences.issuer AS issuer,
        normReferences.uri AS uri,
        normReferences.is_archived AS isArchived,
        normReferences.created_at AS createdAt,
        normReferences.updated_at AS updatedAt
      FROM norm_references AS normReferences
      WHERE ${conditions.map(condition => `(${condition})`).join(' OR ')}
      ORDER BY normReferences.is_archived ASC, normReferences.norm_reference_id ASC
    `,
    params,
  )
  return rows.map(mapDbRow)
}

export async function getNormReferenceById(
  db: SqlServerDatabase,
  id: number,
): Promise<NormReferenceRow | null> {
  const row = await db
    .getRepository(normReferenceEntity)
    .findOne({ where: { id } })
  return row ? map(row) : null
}

export async function getNormReferenceByNormReferenceId(
  db: SqlServerDatabase,
  normReferenceId: string,
): Promise<NormReferenceRow | null> {
  const rows = await db.query<NormReferenceDbRow[]>(
    `
      SELECT TOP (1)
        normReferences.id AS id,
        normReferences.norm_reference_id AS normReferenceId,
        normReferences.name AS name,
        normReferences.type AS type,
        normReferences.reference AS reference,
        normReferences.version AS version,
        normReferences.issuer AS issuer,
        normReferences.uri AS uri,
        normReferences.is_archived AS isArchived,
        normReferences.created_at AS createdAt,
        normReferences.updated_at AS updatedAt
      FROM norm_references AS normReferences
      WHERE normReferences.norm_reference_id = @0
    `,
    [normReferenceId],
  )
  return rows[0] ? mapDbRow(rows[0]) : null
}

// Note: kept on raw SQL because this is a join/aggregation query against
// requirement_versions; per the Query Decision Order, raw SQL is the right
// tool for reporting-style reads that don't need full entity hydration.
export async function countLinkedRequirements(
  db: SqlServerDatabase,
  options?: { statuses?: number[] },
): Promise<Record<number, number>> {
  const statuses = options?.statuses?.filter(
    status => Number.isInteger(status) && status > 0,
  )
  const params: number[] = []
  const conditions = ['1 = 1']

  if (statuses?.length) {
    const placeholders = statuses.map(status => {
      params.push(status)
      return `@${params.length - 1}`
    })
    conditions.push(
      `requirement_versions.requirement_status_id IN (${placeholders.join(', ')})`,
    )
  }

  const rows = await db.query(
    `
      SELECT
        links.norm_reference_id AS normReferenceId,
        COUNT(DISTINCT requirement_versions.requirement_id) AS count
      FROM requirement_version_norm_references AS links
      INNER JOIN requirement_versions
        ON links.requirement_version_id = requirement_versions.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY links.norm_reference_id
    `,
    params,
  )

  const counts: Record<number, number> = {}
  for (const row of rows as Array<{ count: number; normReferenceId: number }>) {
    counts[row.normReferenceId] = row.count
  }
  return counts
}

// Note: kept on raw SQL because of the multi-table join and explicit column
// projection.
export async function getLinkedRequirements(
  db: SqlServerDatabase,
  normReferenceDbId: number,
): Promise<LinkedRequirementRow[]> {
  const rows = await db.query<LinkedRequirementDbRow[]>(
    `
      SELECT
        requirements.id AS id,
        requirements.unique_id AS uniqueId,
        requirement_versions.description AS description,
        requirement_versions.version_number AS versionNumber,
        requirement_versions.requirement_status_id AS statusId,
        requirement_versions.archive_initiated_at AS archiveInitiatedAt,
        requirement_statuses.name_sv AS statusNameSv,
        requirement_statuses.name_en AS statusNameEn,
        requirement_statuses.color AS statusColor,
        requirement_statuses.icon_name AS statusIconName
      FROM requirement_version_norm_references AS links
      INNER JOIN requirement_versions
        ON links.requirement_version_id = requirement_versions.id
      INNER JOIN requirements
        ON requirement_versions.requirement_id = requirements.id
      LEFT JOIN requirement_statuses
        ON requirement_versions.requirement_status_id = requirement_statuses.id
      WHERE links.norm_reference_id = @0
      ORDER BY requirements.unique_id ASC
    `,
    [normReferenceDbId],
  )
  return rows.map(row => ({
    ...row,
    archiveInitiatedAt:
      row.archiveInitiatedAt == null
        ? null
        : toIsoString(row.archiveInitiatedAt),
  }))
}

// Note: kept on raw SQL because the MCP contract intentionally exposes only
// stable library Krav identifiers, not the broader REST/UI detail projection.
export async function listConnectedLibraryRequirementIds(
  db: SqlServerDatabase,
  normReferenceDbId: number,
): Promise<ConnectedRequirementIdRow[]> {
  return db.query<ConnectedRequirementIdRow[]>(
    `
      SELECT DISTINCT
        requirements.id AS id,
        requirements.unique_id AS uniqueId
      FROM requirement_version_norm_references AS links
      INNER JOIN requirement_versions
        ON links.requirement_version_id = requirement_versions.id
      INNER JOIN requirements
        ON requirement_versions.requirement_id = requirements.id
      WHERE links.norm_reference_id = @0
      ORDER BY requirements.unique_id ASC
    `,
    [normReferenceDbId],
  )
}

export async function getNormReferenceUsage(
  db: SqlServerDatabase,
  id: number,
): Promise<NormReferenceUsage> {
  const [row] = await db.query<
    Array<{
      libraryRequirementCount: number
      localRequirementCount: number
    }>
  >(
    `
      SELECT
        (
          SELECT COUNT(DISTINCT versions.requirement_id)
          FROM requirement_version_norm_references AS links
          INNER JOIN requirement_versions AS versions
            ON links.requirement_version_id = versions.id
          WHERE links.norm_reference_id = @0
        ) AS libraryRequirementCount,
        (
          SELECT COUNT(DISTINCT links.specification_local_requirement_id)
          FROM specification_local_requirement_norm_references AS links
          WHERE links.norm_reference_id = @0
        ) AS localRequirementCount
    `,
    [id],
  )
  return {
    libraryRequirementCount: Number(row?.libraryRequirementCount ?? 0),
    localRequirementCount: Number(row?.localRequirementCount ?? 0),
  }
}

async function deriveNormReferenceId(
  db: SqlServerDatabase,
  reference: string,
  name: string,
): Promise<string> {
  // 1. Try to extract a natural ID from the reference field
  // Matches patterns like: SFS 2018:218 → SFS-2018-218, ISO 27001:2022 → ISO-27001-2022
  const naturalMatch = reference
    .trim()
    .match(/^([A-ZÅÄÖ]{2,10})\s*(\d{4})[:\-/](\d+)/i)
  if (naturalMatch) {
    const candidate = `${naturalMatch[1].toUpperCase()}-${naturalMatch[2]}-${naturalMatch[3]}`
    return resolveCollision(db, candidate)
  }

  // 2. Slug from name (uppercase, strip non-alphanumeric, max 20 chars)
  const slug = name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20)
    .replace(/-+$/, '')
  if (slug.length >= 2) {
    return resolveCollision(db, slug)
  }

  // 3. Last resort: NR-001, NR-002 ...
  const rows = await db.query(`
    SELECT norm_reference_id AS normReferenceId
    FROM norm_references
    WHERE norm_reference_id LIKE 'NR-%'
  `)
  const maxSeq = (rows as Array<{ normReferenceId: string }>).reduce(
    (max, row) => {
      const match = /^NR-(\d+)$/.exec(row.normReferenceId)
      if (!match) {
        return max
      }
      return Math.max(max, Number.parseInt(match[1], 10))
    },
    0,
  )
  return resolveCollision(db, `NR-${String(maxSeq + 1).padStart(3, '0')}`)
}

async function resolveCollision(
  db: SqlServerDatabase,
  base: string,
): Promise<string> {
  const repository = db.getRepository(normReferenceEntity)
  const existing = await repository.findOne({
    where: { normReferenceId: base },
  })
  if (!existing) {
    return base
  }

  for (let i = 2; i <= MAX_GENERATED_NORM_REFERENCE_ID_ATTEMPTS; i++) {
    const candidate = `${base}-${i}`
    const conflict = await repository.findOne({
      where: { normReferenceId: candidate },
    })
    if (!conflict) {
      return candidate
    }
  }

  throw conflictError('Generated norm reference ID candidates are exhausted', {
    reason: 'norm_reference_id_generation_exhausted',
  })
}

export async function createNormReference(
  db: SqlServerDatabase,
  data: NormReferenceCreateData,
): Promise<NormReferenceRow> {
  const normReferenceId =
    data.normReferenceId?.trim() ||
    (await deriveNormReferenceId(db, data.reference, data.name))

  const repository = db.getRepository(normReferenceEntity)
  const now = new Date()
  const row = await repository.save(
    repository.create({
      normReferenceId,
      name: data.name,
      type: data.type,
      reference: data.reference,
      version: data.version ?? null,
      issuer: data.issuer,
      uri: data.uri ?? null,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    }),
  )
  return map(row)
}

export async function updateNormReference(
  db: SqlServerDatabase,
  id: number,
  data: NormReferenceUpdateData,
): Promise<NormReferenceRow | undefined> {
  const repository = db.getRepository(normReferenceEntity)
  const patch: Partial<NormReferenceEntity> = {}
  if (data.normReferenceId !== undefined)
    patch.normReferenceId = data.normReferenceId
  if (data.name !== undefined) patch.name = data.name
  if (data.type !== undefined) patch.type = data.type
  if (data.reference !== undefined) patch.reference = data.reference
  if (data.version !== undefined) patch.version = data.version
  if (data.issuer !== undefined) patch.issuer = data.issuer
  if (data.uri !== undefined) patch.uri = data.uri
  patch.updatedAt = new Date()
  await repository.update(id, patch)
  const row = await repository.findOne({ where: { id } })
  return row ? map(row) : undefined
}

async function setNormReferenceArchived(
  db: SqlServerDatabase,
  id: number,
  isArchived: boolean,
): Promise<NormReferenceRow | undefined> {
  const rows = await db.query<NormReferenceDbRow[]>(
    `
      UPDATE norm_references
      SET is_archived = @0, updated_at = @1
      OUTPUT
        inserted.id AS id,
        inserted.norm_reference_id AS normReferenceId,
        inserted.name AS name,
        inserted.type AS type,
        inserted.reference AS reference,
        inserted.version AS version,
        inserted.issuer AS issuer,
        inserted.uri AS uri,
        inserted.is_archived AS isArchived,
        inserted.created_at AS createdAt,
        inserted.updated_at AS updatedAt
      WHERE id = @2
    `,
    [isArchived ? 1 : 0, new Date(), id],
  )
  return rows[0] ? mapDbRow(rows[0]) : undefined
}

export async function archiveNormReference(
  db: SqlServerDatabase,
  id: number,
): Promise<NormReferenceRow | undefined> {
  return setNormReferenceArchived(db, id, true)
}

export async function reactivateNormReference(
  db: SqlServerDatabase,
  id: number,
): Promise<NormReferenceRow | undefined> {
  return setNormReferenceArchived(db, id, false)
}

export async function deleteNormReference(
  db: SqlServerDatabase,
  id: number,
): Promise<number> {
  const rows = await db.query<Array<{ id: number }>>(
    `
      DELETE norm_reference
      OUTPUT deleted.id AS id
      FROM norm_references AS norm_reference
      WHERE norm_reference.id = @0
        AND NOT EXISTS (
          SELECT 1
          FROM requirement_version_norm_references AS links
          WHERE links.norm_reference_id = norm_reference.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM specification_local_requirement_norm_references AS links
          WHERE links.norm_reference_id = norm_reference.id
        )
    `,
    [id],
  )
  return rows.length
}
