import { eq, inArray, sql } from 'drizzle-orm'
import {
  normReferences,
  requirementStatuses,
  requirements,
  requirementVersionNormReferences,
  requirementVersions,
} from '@/drizzle/schema'
import type { Database } from '@/lib/db'

interface NormReferenceRow {
  createdAt: string
  id: number
  issuer: string
  name: string
  normReferenceId: string
  reference: string
  type: string
  updatedAt: string
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
  db: Database,
): Promise<NormReferenceRow[]> {
  return db.query.normReferences.findMany({
    orderBy: [normReferences.normReferenceId],
  })
}

export async function getNormReferenceById(
  db: Database,
  id: number,
): Promise<NormReferenceRow | null> {
  return (
    (await db.query.normReferences.findFirst({
      where: eq(normReferences.id, id),
    })) ?? null
  )
}

export async function countLinkedRequirements(
  db: Database,
  options?: { statuses?: number[] },
): Promise<Record<number, number>> {
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
  db: Database,
  normReferenceDbId: number,
): Promise<LinkedRequirementRow[]> {
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
  db: Database,
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

async function resolveCollision(db: Database, base: string): Promise<string> {
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
  db: Database,
  data: {
    normReferenceId?: string
    name: string
    type: string
    reference: string
    version?: string | null
    issuer: string
  },
): Promise<NormReferenceRow> {
  const normReferenceId =
    data.normReferenceId?.trim() ||
    (await deriveNormReferenceId(db, data.reference, data.name))
  const [row] = await db
    .insert(normReferences)
    .values({
      normReferenceId,
      name: data.name,
      type: data.type,
      reference: data.reference,
      version: data.version ?? null,
      issuer: data.issuer,
    })
    .returning()
  return row
}

export async function updateNormReference(
  db: Database,
  id: number,
  data: {
    normReferenceId?: string
    name?: string
    type?: string
    reference?: string
    version?: string | null
    issuer?: string
  },
): Promise<NormReferenceRow | undefined> {
  const [updated] = await db
    .update(normReferences)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(normReferences.id, id))
    .returning()
  return updated
}

export async function deleteNormReference(
  db: Database,
  id: number,
): Promise<void> {
  await db.delete(normReferences).where(eq(normReferences.id, id))
}
