import type { SqlServerDatabase } from '@/lib/db'
import {
  type NormReferenceEntity,
  normReferenceEntity,
} from '@/lib/typeorm/entities'
import { toIsoString } from '@/lib/typeorm/value-mappers'

interface NormReferenceRow {
  createdAt: string
  id: number
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
  description: string | null
  id: number
  statusColor: string | null
  statusId: number | null
  statusNameEn: string | null
  statusNameSv: string | null
  uniqueId: string
  versionNumber: number
}

export type { LinkedRequirementRow, NormReferenceRow }

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
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  }
}

export async function listNormReferences(
  db: SqlServerDatabase,
): Promise<NormReferenceRow[]> {
  const rows = await db
    .getRepository(normReferenceEntity)
    .find({ order: { normReferenceId: 'ASC' } })
  return rows.map(map)
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
  return db.query(
    `
      SELECT
        requirements.id AS id,
        requirements.unique_id AS uniqueId,
        requirement_versions.description AS description,
        requirement_versions.version_number AS versionNumber,
        requirement_versions.requirement_status_id AS statusId,
        requirement_statuses.name_sv AS statusNameSv,
        requirement_statuses.name_en AS statusNameEn,
        requirement_statuses.color AS statusColor
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

  for (let i = 2; i <= 999; i++) {
    const candidate = `${base}-${i}`
    const conflict = await repository.findOne({
      where: { normReferenceId: candidate },
    })
    if (!conflict) {
      return candidate
    }
  }

  return `${base}-${Date.now()}`
}

export async function createNormReference(
  db: SqlServerDatabase,
  data: {
    normReferenceId?: string
    name: string
    type: string
    reference: string
    version?: string | null
    issuer: string
    uri?: string | null
  },
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
      createdAt: now,
      updatedAt: now,
    }),
  )
  return map(row)
}

export async function updateNormReference(
  db: SqlServerDatabase,
  id: number,
  data: {
    normReferenceId?: string
    name?: string
    type?: string
    reference?: string
    version?: string | null
    issuer?: string
    uri?: string | null
  },
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

export async function deleteNormReference(
  db: SqlServerDatabase,
  id: number,
): Promise<void> {
  await db.getRepository(normReferenceEntity).delete(id)
}
