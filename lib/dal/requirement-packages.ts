import { eq } from 'drizzle-orm'
import { requirementPackageItems, requirementPackages } from '@/drizzle/schema'
import type { Database } from '@/lib/db'

export async function listPackages(db: Database) {
  return db.query.requirementPackages.findMany({
    orderBy: [requirementPackages.nameSv],
    with: {
      responsibilityArea: true,
      implementationType: true,
      items: {
        with: {
          requirement: true,
          version: true,
        },
      },
    },
  })
}

export async function getPackageById(db: Database, id: number) {
  return (
    db.query.requirementPackages.findFirst({
      where: eq(requirementPackages.id, id),
      with: {
        responsibilityArea: true,
        implementationType: true,
        items: {
          with: {
            requirement: true,
            version: true,
          },
        },
      },
    }) ?? null
  )
}

export async function createPackage(
  db: Database,
  data: {
    nameSv: string
    nameEn: string
    packageResponsibilityAreaId?: number
    packageImplementationTypeId?: number
  },
) {
  const [pkg] = await db.insert(requirementPackages).values(data).returning()
  return pkg
}

export async function updatePackage(
  db: Database,
  id: number,
  data: {
    nameSv?: string
    nameEn?: string
    packageResponsibilityAreaId?: number
    packageImplementationTypeId?: number
  },
) {
  const [updated] = await db
    .update(requirementPackages)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(requirementPackages.id, id))
    .returning()
  return updated
}

export async function deletePackage(db: Database, id: number) {
  await db
    .delete(requirementPackageItems)
    .where(eq(requirementPackageItems.packageId, id))
  await db.delete(requirementPackages).where(eq(requirementPackages.id, id))
}

export async function linkRequirementToPackage(
  db: Database,
  data: {
    packageId: number
    requirementId: number
    requirementVersionId: number
    needsReference?: string
  },
) {
  const [item] = await db
    .insert(requirementPackageItems)
    .values(data)
    .returning()
  return item
}

export async function unlinkRequirementFromPackage(
  db: Database,
  itemId: number,
) {
  await db
    .delete(requirementPackageItems)
    .where(eq(requirementPackageItems.id, itemId))
}
