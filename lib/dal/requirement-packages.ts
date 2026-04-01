import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  packageNeedsReferences,
  qualityCharacteristics,
  requirementAreas,
  requirementCategories,
  requirementPackageItems,
  requirementPackages,
  requirementStatuses,
  requirements,
  requirementTypes,
  requirementVersions,
} from '@/drizzle/schema'
import { STATUS_PUBLISHED } from '@/lib/dal/requirements'
import type { Database } from '@/lib/db'

type DatabaseReader = Pick<Database, 'select'>
type DatabaseWriter = DatabaseReader & Pick<Database, 'delete' | 'insert'>

function parseRequirementAreas(
  value: string | null,
): { id: number; name: string }[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (
        area,
      ): area is {
        id: number
        name: string
      } =>
        typeof area === 'object' &&
        area !== null &&
        typeof (area as { id?: unknown }).id === 'number' &&
        typeof (area as { name?: unknown }).name === 'string',
    )
  } catch {
    return []
  }
}

export async function listPackages(db: Database) {
  const rows = await db
    .select({
      id: requirementPackages.id,
      uniqueId: requirementPackages.uniqueId,
      name: requirementPackages.name,
      packageResponsibilityAreaId:
        requirementPackages.packageResponsibilityAreaId,
      packageImplementationTypeId:
        requirementPackages.packageImplementationTypeId,
      businessNeedsReference: requirementPackages.businessNeedsReference,
      createdAt: requirementPackages.createdAt,
      updatedAt: requirementPackages.updatedAt,
      responsibilityAreaNameSv: sql<string | null>`ra.name_sv`.as(
        'responsibility_area_name_sv',
      ),
      responsibilityAreaNameEn: sql<string | null>`ra.name_en`.as(
        'responsibility_area_name_en',
      ),
      implementationTypeNameSv: sql<string | null>`it.name_sv`.as(
        'implementation_type_name_sv',
      ),
      implementationTypeNameEn: sql<string | null>`it.name_en`.as(
        'implementation_type_name_en',
      ),
      itemCount: sql<number>`COUNT(DISTINCT rpi.requirement_id)`.as(
        'item_count',
      ),
      areaPairs: sql<
        string | null
      >`json_group_array(DISTINCT CASE WHEN req_area.id IS NOT NULL THEN json_object('id', req_area.id, 'name', req_area.name) END)`.as(
        'area_pairs',
      ),
    })
    .from(requirementPackages)
    .leftJoin(
      sql`package_responsibility_areas ra`,
      sql`ra.id = ${requirementPackages.packageResponsibilityAreaId}`,
    )
    .leftJoin(
      sql`package_implementation_types it`,
      sql`it.id = ${requirementPackages.packageImplementationTypeId}`,
    )
    .leftJoin(
      sql`requirement_package_items rpi`,
      sql`rpi.requirement_package_id = ${requirementPackages.id}`,
    )
    .leftJoin(sql`requirements req`, sql`req.id = rpi.requirement_id`)
    .leftJoin(
      sql`requirement_areas req_area`,
      sql`req_area.id = req.requirement_area_id`,
    )
    .groupBy(requirementPackages.id)
    .orderBy(requirementPackages.name)

  return rows.map(row => {
    const requirementAreas = parseRequirementAreas(row.areaPairs).filter(
      area => area.id > 0,
    )

    return {
      id: row.id,
      uniqueId: row.uniqueId,
      name: row.name,
      packageResponsibilityAreaId: row.packageResponsibilityAreaId,
      packageImplementationTypeId: row.packageImplementationTypeId,
      businessNeedsReference: row.businessNeedsReference,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      responsibilityArea:
        row.responsibilityAreaNameSv && row.packageResponsibilityAreaId
          ? {
              id: row.packageResponsibilityAreaId,
              nameSv: row.responsibilityAreaNameSv,
              nameEn: row.responsibilityAreaNameEn ?? '',
            }
          : null,
      implementationType:
        row.implementationTypeNameSv && row.packageImplementationTypeId
          ? {
              id: row.packageImplementationTypeId,
              nameSv: row.implementationTypeNameSv,
              nameEn: row.implementationTypeNameEn ?? '',
            }
          : null,
      itemCount: row.itemCount,
      requirementAreas,
    }
  })
}

export async function getPackageById(db: Database, id: number) {
  const result = await db.query.requirementPackages.findFirst({
    where: eq(requirementPackages.id, id),
    with: {
      responsibilityArea: true,
      implementationType: true,
    },
  })
  return result ?? null
}

export async function getPackageBySlug(db: Database, slug: string) {
  const result = await db.query.requirementPackages.findFirst({
    where: eq(requirementPackages.uniqueId, slug),
    with: {
      responsibilityArea: true,
      implementationType: true,
    },
  })
  return result ?? null
}

export async function isSlugTaken(
  db: Database,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: requirementPackages.id })
    .from(requirementPackages)
    .where(eq(requirementPackages.uniqueId, slug))
    .limit(1)
  if (rows.length === 0) return false
  if (excludeId !== undefined) return rows[0].id !== excludeId
  return true
}

export async function createPackage(
  db: Database,
  data: {
    uniqueId: string
    name: string
    packageResponsibilityAreaId?: number | null
    packageImplementationTypeId?: number | null
    businessNeedsReference?: string | null
  },
) {
  const [pkg] = await db.insert(requirementPackages).values(data).returning()
  return pkg
}

export async function updatePackage(
  db: Database,
  id: number,
  data: {
    uniqueId?: string
    name?: string
    packageResponsibilityAreaId?: number | null
    packageImplementationTypeId?: number | null
    businessNeedsReference?: string | null
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
  const sessionName = (
    db as {
      session?: {
        constructor?: {
          name?: string
        }
      }
    }
  ).session?.constructor?.name

  if (sessionName === 'BetterSQLiteSession') {
    ;(
      db as unknown as {
        transaction: (callback: (tx: Pick<Database, 'delete'>) => void) => void
      }
    ).transaction(tx => {
      tx.delete(requirementPackageItems)
        .where(eq(requirementPackageItems.packageId, id))
        .run()
      tx.delete(packageNeedsReferences)
        .where(eq(packageNeedsReferences.packageId, id))
        .run()
      tx.delete(requirementPackages).where(eq(requirementPackages.id, id)).run()
    })
    return
  }

  await db.transaction(async tx => {
    await tx
      .delete(requirementPackageItems)
      .where(eq(requirementPackageItems.packageId, id))
    await tx
      .delete(packageNeedsReferences)
      .where(eq(packageNeedsReferences.packageId, id))
    await tx.delete(requirementPackages).where(eq(requirementPackages.id, id))
  })
}

export async function getPublishedVersionIdForRequirement(
  db: Database,
  requirementId: number,
): Promise<number | null> {
  const rows = await db
    .select({ id: requirementVersions.id })
    .from(requirementVersions)
    .where(
      and(
        eq(requirementVersions.requirementId, requirementId),
        eq(requirementVersions.statusId, STATUS_PUBLISHED),
      ),
    )
    .orderBy(sql`${requirementVersions.versionNumber} DESC`)
    .limit(1)
  return rows[0]?.id ?? null
}

export async function listPackageNeedsReferences(
  db: DatabaseReader,
  packageId: number,
): Promise<{ id: number; text: string }[]> {
  return db
    .select({
      id: packageNeedsReferences.id,
      text: packageNeedsReferences.text,
    })
    .from(packageNeedsReferences)
    .where(eq(packageNeedsReferences.packageId, packageId))
    .orderBy(packageNeedsReferences.text)
}

export async function getPackageNeedsReferenceById(
  db: DatabaseReader,
  packageId: number,
  id: number,
): Promise<{ id: number } | null> {
  const [needsReference] = await db
    .select({ id: packageNeedsReferences.id })
    .from(packageNeedsReferences)
    .where(
      and(
        eq(packageNeedsReferences.id, id),
        eq(packageNeedsReferences.packageId, packageId),
      ),
    )
    .limit(1)

  return needsReference ?? null
}

export async function getOrCreatePackageNeedsReference(
  db: DatabaseWriter,
  packageId: number,
  text: string,
): Promise<number> {
  const [created] = await db
    .insert(packageNeedsReferences)
    .values({ packageId, text })
    .onConflictDoNothing({
      target: [packageNeedsReferences.packageId, packageNeedsReferences.text],
    })
    .returning({ id: packageNeedsReferences.id })

  if (created) {
    return created.id
  }

  const existing = await db
    .select({ id: packageNeedsReferences.id })
    .from(packageNeedsReferences)
    .where(
      and(
        eq(packageNeedsReferences.packageId, packageId),
        eq(packageNeedsReferences.text, text),
      ),
    )
    .limit(1)

  if (!existing[0]) {
    throw new Error('Failed to resolve package needs reference')
  }

  return existing[0].id
}

export async function linkRequirementsToPackage(
  db: Pick<Database, 'insert'>,
  packageId: number,
  items: {
    requirementId: number
    requirementVersionId: number
    needsReferenceId?: number | null
  }[],
) {
  if (items.length === 0) return 0
  const inserted = await db
    .insert(requirementPackageItems)
    .values(items.map(item => ({ packageId, ...item })))
    .onConflictDoNothing()
    .returning({ id: requirementPackageItems.id })
  return inserted.length
}

export async function unlinkRequirementsFromPackage(
  db: Pick<Database, 'delete'>,
  packageId: number,
  requirementIds: number[],
) {
  if (requirementIds.length === 0) return 0
  const deleted = await db
    .delete(requirementPackageItems)
    .where(
      and(
        eq(requirementPackageItems.packageId, packageId),
        inArray(requirementPackageItems.requirementId, requirementIds),
      ),
    )
    .returning({ id: requirementPackageItems.id })
  return deleted.length
}

export async function listPackageItems(db: DatabaseReader, packageId: number) {
  const rows = await db
    .select({
      id: requirements.id,
      uniqueId: requirements.uniqueId,
      isArchived: requirements.isArchived,
      requirementAreaId: requirements.requirementAreaId,
      areaName: requirementAreas.name,
      versionId: requirementVersions.id,
      versionNumber: requirementVersions.versionNumber,
      description: requirementVersions.description,
      requirementCategoryId: requirementVersions.requirementCategoryId,
      requirementTypeId: requirementVersions.requirementTypeId,
      qualityCharacteristicId: requirementVersions.qualityCharacteristicId,
      statusId: requirementVersions.statusId,
      requiresTesting: requirementVersions.requiresTesting,
      statusNameSv: requirementStatuses.nameSv,
      statusNameEn: requirementStatuses.nameEn,
      statusColor: requirementStatuses.color,
      categoryNameSv: requirementCategories.nameSv,
      categoryNameEn: requirementCategories.nameEn,
      typeNameSv: requirementTypes.nameSv,
      typeNameEn: requirementTypes.nameEn,
      qualityCharacteristicNameSv: qualityCharacteristics.nameSv,
      qualityCharacteristicNameEn: qualityCharacteristics.nameEn,
      needsReferenceId: requirementPackageItems.needsReferenceId,
      needsReferenceText: packageNeedsReferences.text,
      usageScenarioIds: sql<string | null>`(
        SELECT GROUP_CONCAT(rvus.usage_scenario_id)
        FROM requirement_version_usage_scenarios rvus
        WHERE rvus.requirement_version_id = ${requirementVersions.id}
      )`.as('usage_scenario_ids'),
    })
    .from(requirementPackageItems)
    .innerJoin(
      requirements,
      eq(requirements.id, requirementPackageItems.requirementId),
    )
    .innerJoin(
      requirementVersions,
      eq(requirementVersions.id, requirementPackageItems.requirementVersionId),
    )
    .leftJoin(
      requirementAreas,
      eq(requirementAreas.id, requirements.requirementAreaId),
    )
    .leftJoin(
      requirementStatuses,
      eq(requirementStatuses.id, requirementVersions.statusId),
    )
    .leftJoin(
      requirementCategories,
      eq(requirementCategories.id, requirementVersions.requirementCategoryId),
    )
    .leftJoin(
      requirementTypes,
      eq(requirementTypes.id, requirementVersions.requirementTypeId),
    )
    .leftJoin(
      qualityCharacteristics,
      eq(
        qualityCharacteristics.id,
        requirementVersions.qualityCharacteristicId,
      ),
    )
    .leftJoin(
      packageNeedsReferences,
      eq(packageNeedsReferences.id, requirementPackageItems.needsReferenceId),
    )
    .where(eq(requirementPackageItems.packageId, packageId))
    .orderBy(requirements.uniqueId)

  return rows.map(row => ({
    id: row.id,
    uniqueId: row.uniqueId,
    isArchived: row.isArchived,
    needsReference: row.needsReferenceText ?? null,
    needsReferenceId: row.needsReferenceId ?? null,
    usageScenarioIds: row.usageScenarioIds
      ? row.usageScenarioIds.split(',').map(Number)
      : [],
    area: row.areaName ? { name: row.areaName } : null,
    version: {
      versionNumber: row.versionNumber,
      description: row.description,
      requiresTesting: row.requiresTesting,
      status: row.statusId,
      statusNameSv: row.statusNameSv ?? null,
      statusNameEn: row.statusNameEn ?? null,
      statusColor: row.statusColor ?? null,
      categoryNameSv: row.categoryNameSv ?? null,
      categoryNameEn: row.categoryNameEn ?? null,
      typeNameSv: row.typeNameSv ?? null,
      typeNameEn: row.typeNameEn ?? null,
      qualityCharacteristicNameSv: row.qualityCharacteristicNameSv ?? null,
      qualityCharacteristicNameEn: row.qualityCharacteristicNameEn ?? null,
    },
  }))
}

// Keep legacy single-item functions for backwards compat
export async function linkRequirementToPackage(
  db: Database,
  data: {
    packageId: number
    requirementId: number
    requirementVersionId: number
    needsReferenceId?: number | null
  },
) {
  const [item] = await db
    .insert(requirementPackageItems)
    .values(data)
    .onConflictDoNothing()
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
