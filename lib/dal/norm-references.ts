import { eq, inArray, sql } from 'drizzle-orm'
import {
  normReferences,
  requirementStatuses,
  requirements,
  requirementVersionNormReferences,
  requirementVersions,
} from '@/drizzle/schema'
import {
  isSqlServerDatabaseConnection,
  type AppDatabaseConnection,
} from '@/lib/db'
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

export async function listNormReferences(
  db: AppDatabaseConnection,
): Promise<NormReferenceRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(`
      SELECT
        id,
        norm_reference_id AS normReferenceId,
        name,
        type,
        reference,
        version,
        issuer,
        uri,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM norm_references
      ORDER BY norm_reference_id ASC
    `)
    return (rows as Array<
      Omit<NormReferenceRow, 'createdAt' | 'updatedAt'> & {
        createdAt: Date | string
        updatedAt: Date | string
      }
    >).map(row => ({
      ...row,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    }))
  }

  return db.query.normReferences.findMany({
    orderBy: [normReferences.normReferenceId],
  })
}

export async function getNormReferenceById(
  db: AppDatabaseConnection,
  id: number,
): Promise<NormReferenceRow | null> {
  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        SELECT
          id,
          norm_reference_id AS normReferenceId,
          name,
          type,
          reference,
          version,
          issuer,
          uri,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM norm_references
        WHERE id = @0
      `,
      [id],
    )
    return rows[0]
      ? ({
          ...rows[0],
          createdAt: toIsoString(rows[0].createdAt),
          updatedAt: toIsoString(rows[0].updatedAt),
        } as NormReferenceRow)
      : null
  }

  return (
    (await db.query.normReferences.findFirst({
      where: eq(normReferences.id, id),
    })) ?? null
  )
}

export async function countLinkedRequirements(
  db: AppDatabaseConnection,
  options?: { statuses?: number[] },
): Promise<Record<number, number>> {
  if (isSqlServerDatabaseConnection(db)) {
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

  const query = db
    .select({
      normReferenceId: requirementVersionNormReferences.normReferenceId,
      count:
        sql<number>`COUNT(DISTINCT ${requirementVersions.requirementId})`.as(
          'count',
        ),
    })
    .from(requirementVersionNormReferences)
    .innerJoin(
      requirementVersions,
      eq(
        requirementVersionNormReferences.requirementVersionId,
        requirementVersions.id,
      ),
    )
    .groupBy(requirementVersionNormReferences.normReferenceId)
  if (options?.statuses && options.statuses.length > 0) {
    query.where(inArray(requirementVersions.statusId, options.statuses))
  }
  const rows = await query
  const counts: Record<number, number> = {}
  for (const row of rows) {
    counts[row.normReferenceId] = row.count
  }
  return counts
}

export async function getLinkedRequirements(
  db: AppDatabaseConnection,
  normReferenceDbId: number,
): Promise<LinkedRequirementRow[]> {
  if (isSqlServerDatabaseConnection(db)) {
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

  return db
    .select({
      id: requirements.id,
      uniqueId: requirements.uniqueId,
      description: requirementVersions.description,
      versionNumber: requirementVersions.versionNumber,
      statusId: requirementVersions.statusId,
      statusNameSv: requirementStatuses.nameSv,
      statusNameEn: requirementStatuses.nameEn,
      statusColor: requirementStatuses.color,
    })
    .from(requirementVersionNormReferences)
    .innerJoin(
      requirementVersions,
      eq(
        requirementVersionNormReferences.requirementVersionId,
        requirementVersions.id,
      ),
    )
    .innerJoin(
      requirements,
      eq(requirementVersions.requirementId, requirements.id),
    )
    .leftJoin(
      requirementStatuses,
      eq(requirementVersions.statusId, requirementStatuses.id),
    )
    .where(
      eq(requirementVersionNormReferences.normReferenceId, normReferenceDbId),
    )
    .orderBy(requirements.uniqueId)
}

async function deriveNormReferenceId(
  db: AppDatabaseConnection,
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
  if (isSqlServerDatabaseConnection(db)) {
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

  const result = await db
    .select({
      maxSeq: sql<
        number | null
      >`COALESCE(MAX(CAST(SUBSTR(${normReferences.normReferenceId}, 4) AS INTEGER)), 0)`,
    })
    .from(normReferences)
    .where(sql`${normReferences.normReferenceId} LIKE 'NR-%'`)
  const nextSeq = ((result[0]?.maxSeq ?? 0) as number) + 1
  return resolveCollision(db, `NR-${String(nextSeq).padStart(3, '0')}`)
}

async function resolveCollision(
  db: AppDatabaseConnection,
  base: string,
): Promise<string> {
  if (isSqlServerDatabaseConnection(db)) {
    const existing = await db.query(
      `
        SELECT id
        FROM norm_references
        WHERE norm_reference_id = @0
      `,
      [base],
    )
    if (existing.length === 0) {
      return base
    }

    for (let i = 2; i <= 999; i++) {
      const candidate = `${base}-${i}`
      const conflict = await db.query(
        `
          SELECT id
          FROM norm_references
          WHERE norm_reference_id = @0
        `,
        [candidate],
      )
      if (conflict.length === 0) {
        return candidate
      }
    }

    return `${base}-${Date.now()}`
  }

  const existing = await db.query.normReferences.findFirst({
    where: eq(normReferences.normReferenceId, base),
  })
  if (!existing) return base
  // Try suffixes -2, -3, ...
  for (let i = 2; i <= 999; i++) {
    const candidate = `${base}-${i}`
    const conflict = await db.query.normReferences.findFirst({
      where: eq(normReferences.normReferenceId, candidate),
    })
    if (!conflict) return candidate
  }
  return `${base}-${Date.now()}`
}

export async function createNormReference(
  db: AppDatabaseConnection,
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

  if (isSqlServerDatabaseConnection(db)) {
    const rows = await db.query(
      `
        INSERT INTO norm_references (
          norm_reference_id,
          name,
          type,
          reference,
          version,
          issuer,
          uri
        )
        OUTPUT
          inserted.id AS id,
          inserted.norm_reference_id AS normReferenceId,
          inserted.name AS name,
          inserted.type AS type,
          inserted.reference AS reference,
          inserted.version AS version,
          inserted.issuer AS issuer,
          inserted.uri AS uri,
          inserted.created_at AS createdAt,
          inserted.updated_at AS updatedAt
        VALUES (@0, @1, @2, @3, @4, @5, @6)
      `,
      [
        normReferenceId,
        data.name,
        data.type,
        data.reference,
        data.version ?? null,
        data.issuer,
        data.uri ?? null,
      ],
    )
    return {
      ...(rows[0] as NormReferenceRow),
      createdAt: toIsoString(rows[0].createdAt),
      updatedAt: toIsoString(rows[0].updatedAt),
    }
  }

  const [row] = await db
    .insert(normReferences)
    .values({
      normReferenceId,
      name: data.name,
      type: data.type,
      reference: data.reference,
      version: data.version ?? null,
      issuer: data.issuer,
      uri: data.uri ?? null,
    })
    .returning()
  return row
}

export async function updateNormReference(
  db: AppDatabaseConnection,
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
  if (isSqlServerDatabaseConnection(db)) {
    const sets = []
    const params = []

    if (data.normReferenceId !== undefined) {
      params.push(data.normReferenceId)
      sets.push(`norm_reference_id = @${params.length - 1}`)
    }
    if (data.name !== undefined) {
      params.push(data.name)
      sets.push(`name = @${params.length - 1}`)
    }
    if (data.type !== undefined) {
      params.push(data.type)
      sets.push(`type = @${params.length - 1}`)
    }
    if (data.reference !== undefined) {
      params.push(data.reference)
      sets.push(`reference = @${params.length - 1}`)
    }
    if (data.version !== undefined) {
      params.push(data.version)
      sets.push(`version = @${params.length - 1}`)
    }
    if (data.issuer !== undefined) {
      params.push(data.issuer)
      sets.push(`issuer = @${params.length - 1}`)
    }
    if (data.uri !== undefined) {
      params.push(data.uri)
      sets.push(`uri = @${params.length - 1}`)
    }

    params.push(new Date())
    sets.push(`updated_at = @${params.length - 1}`)
    params.push(id)

    const rows = await db.query(
      `
        UPDATE norm_references
        SET ${sets.join(', ')}
        OUTPUT
          inserted.id AS id,
          inserted.norm_reference_id AS normReferenceId,
          inserted.name AS name,
          inserted.type AS type,
          inserted.reference AS reference,
          inserted.version AS version,
          inserted.issuer AS issuer,
          inserted.uri AS uri,
          inserted.created_at AS createdAt,
          inserted.updated_at AS updatedAt
        WHERE id = @${params.length - 1}
      `,
      params,
    )

    return rows[0]
      ? {
          ...(rows[0] as NormReferenceRow),
          createdAt: toIsoString(rows[0].createdAt),
          updatedAt: toIsoString(rows[0].updatedAt),
        }
      : undefined
  }

  const [updated] = await db
    .update(normReferences)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(normReferences.id, id))
    .returning()
  return updated
}

export async function deleteNormReference(
  db: AppDatabaseConnection,
  id: number,
): Promise<void> {
  if (isSqlServerDatabaseConnection(db)) {
    await db.query(`DELETE FROM norm_references WHERE id = @0`, [id])
    return
  }

  await db.delete(normReferences).where(eq(normReferences.id, id))
}
