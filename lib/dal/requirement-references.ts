import { eq, inArray } from 'drizzle-orm'
import { requirementReferences } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listReferencesForVersion(
  db: Database,
  versionId: number,
) {
  return db.query.requirementReferences.findMany({
    where: eq(requirementReferences.requirementVersionId, versionId),
    orderBy: [requirementReferences.name],
  })
}

export async function createReference(
  db: Database,
  data: {
    requirementVersionId: number
    name: string
    uri?: string
    owner?: string
  },
) {
  const [ref] = await db.insert(requirementReferences).values(data).returning()
  return ref
}

export async function updateReference(
  db: Database,
  id: number,
  data: {
    name?: string
    uri?: string
    owner?: string
  },
) {
  const [updated] = await db
    .update(requirementReferences)
    .set(data)
    .where(eq(requirementReferences.id, id))
    .returning()
  return updated
}

export async function deleteReference(db: Database, id: number) {
  await db.delete(requirementReferences).where(eq(requirementReferences.id, id))
}

export async function replaceReferencesForVersion(
  db: Database,
  versionId: number,
  references: {
    id?: number
    name: string
    owner?: string
    uri?: string
  }[],
) {
  const existing = await listReferencesForVersion(db, versionId)
  const existingIds = new Set(existing.map(reference => reference.id))
  const nextIds = new Set(
    references
      .map(reference => reference.id)
      .filter((id): id is number => typeof id === 'number'),
  )

  for (const reference of references) {
    if (reference.id && existingIds.has(reference.id)) {
      await updateReference(db, reference.id, {
        name: reference.name,
        owner: reference.owner,
        uri: reference.uri,
      })
      continue
    }

    await createReference(db, {
      name: reference.name,
      owner: reference.owner,
      requirementVersionId: versionId,
      uri: reference.uri,
    })
  }

  const deletedIds = existing
    .map(reference => reference.id)
    .filter(id => !nextIds.has(id))

  if (deletedIds.length > 0) {
    await db
      .delete(requirementReferences)
      .where(inArray(requirementReferences.id, deletedIds))
  }
}
