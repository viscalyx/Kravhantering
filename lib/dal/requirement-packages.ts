import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  packageItemStatuses,
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
import { validationError } from '@/lib/requirements/errors'

/**
 * Seed ID for the "Included" / "Inkluderad" package-item status.
 * Every newly added package item starts here.
 */
export const DEFAULT_PACKAGE_ITEM_STATUS_ID = 1

/**
 * Seed ID for the "Deviated" / "Avviken" package-item status.
 * Only selectable when the package item has an approved deviation.
 */
export const DEVIATED_PACKAGE_ITEM_STATUS_ID = 5

type DatabaseReader = Pick<Database, 'select'>
type DatabaseWriter = DatabaseReader & Pick<Database, 'delete' | 'insert'>
interface RequirementPackageLinkItem {
  requirementId: number
  requirementVersionId: number
}
interface D1BatchResult {
  meta?: {
    changes?: number
  }
  results?: Record<string, unknown>[]
}
interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement
  run(): Promise<D1BatchResult>
}
interface D1BatchClient {
  batch(statements: D1PreparedStatement[]): Promise<D1BatchResult[]>
  prepare(query: string): {
    bind(...params: unknown[]): D1PreparedStatement
  }
}

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
      packageLifecycleStatusId: requirementPackages.packageLifecycleStatusId,
      lifecycleStatusNameSv: sql<string | null>`ls.name_sv`.as(
        'lifecycle_status_name_sv',
      ),
      lifecycleStatusNameEn: sql<string | null>`ls.name_en`.as(
        'lifecycle_status_name_en',
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
      sql`package_lifecycle_statuses ls`,
      sql`ls.id = ${requirementPackages.packageLifecycleStatusId}`,
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
      packageLifecycleStatusId: row.packageLifecycleStatusId,
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
      lifecycleStatus:
        row.lifecycleStatusNameSv && row.packageLifecycleStatusId
          ? {
              id: row.packageLifecycleStatusId,
              nameSv: row.lifecycleStatusNameSv,
              nameEn: row.lifecycleStatusNameEn ?? '',
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
      lifecycleStatus: true,
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
      lifecycleStatus: true,
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
    packageLifecycleStatusId?: number | null
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
    packageLifecycleStatusId?: number | null
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

async function getOrCreatePackageNeedsReferenceWithMetadata(
  db: DatabaseWriter,
  packageId: number,
  text: string,
): Promise<{ created: boolean; id: number }> {
  const normalizedText = text.trim()
  const [created] = await db
    .insert(packageNeedsReferences)
    .values({ packageId, text: normalizedText })
    .onConflictDoNothing({
      target: [packageNeedsReferences.packageId, packageNeedsReferences.text],
    })
    .returning({ id: packageNeedsReferences.id })

  if (created) {
    return { created: true, id: created.id }
  }

  const existing = await db
    .select({ id: packageNeedsReferences.id })
    .from(packageNeedsReferences)
    .where(
      and(
        eq(packageNeedsReferences.packageId, packageId),
        eq(packageNeedsReferences.text, normalizedText),
      ),
    )
    .limit(1)

  if (!existing[0]) {
    throw new Error('Failed to resolve package needs reference')
  }

  return { created: false, id: existing[0].id }
}

export async function getOrCreatePackageNeedsReference(
  db: DatabaseWriter,
  packageId: number,
  text: string,
): Promise<number> {
  const { id } = await getOrCreatePackageNeedsReferenceWithMetadata(
    db,
    packageId,
    text,
  )
  return id
}

async function resolveExistingPackageNeedsReferenceForLinking(
  db: DatabaseReader,
  packageId: number,
  needsReferenceId: number,
): Promise<number> {
  const existingNeedsReference = await getPackageNeedsReferenceById(
    db,
    packageId,
    needsReferenceId,
  )
  if (!existingNeedsReference) {
    throw validationError(
      'needsReferenceId does not belong to this requirement package',
    )
  }

  return existingNeedsReference.id
}

function getD1BatchClient(db: Database): D1BatchClient | null {
  const client = (db as { $client?: D1BatchClient }).$client

  if (
    typeof client?.batch === 'function' &&
    typeof client?.prepare === 'function'
  ) {
    return client
  }

  return null
}

async function linkRequirementsToPackageWithD1Batch(
  client: D1BatchClient,
  packageId: number,
  items: RequirementPackageLinkItem[],
  needsReferenceText: string,
): Promise<number> {
  const normalizedNeedsReferenceText = needsReferenceText.trim()
  const createdAt = new Date().toISOString()
  const insertNeedsReference = client
    .prepare(
      `
        INSERT INTO package_needs_references (package_id, text, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(package_id, text) DO NOTHING
      `,
    )
    .bind(packageId, normalizedNeedsReferenceText, createdAt)

  const insertItems = items.map(item =>
    client
      .prepare(
        `
          INSERT INTO requirement_package_items (
            requirement_package_id,
            requirement_id,
            requirement_version_id,
            needs_reference_id,
            package_item_status_id,
            created_at
          )
          VALUES (
            ?,
            ?,
            ?,
            (
              SELECT id
              FROM package_needs_references
              WHERE package_id = ?
                AND text = ?
              LIMIT 1
            ),
            ?,
            ?
          )
          ON CONFLICT(requirement_package_id, requirement_id) DO NOTHING
        `,
      )
      .bind(
        packageId,
        item.requirementId,
        item.requirementVersionId,
        packageId,
        normalizedNeedsReferenceText,
        DEFAULT_PACKAGE_ITEM_STATUS_ID,
        createdAt,
      ),
  )
  const selectNeedsReference = client
    .prepare(
      `
        SELECT id
        FROM package_needs_references
        WHERE package_id = ?
          AND text = ?
        LIMIT 1
      `,
    )
    .bind(packageId, normalizedNeedsReferenceText)

  const batchResults = await client.batch([
    insertNeedsReference,
    ...insertItems,
    selectNeedsReference,
  ])

  const createdNeedsReference = Number(batchResults[0]?.meta?.changes ?? 0) > 0
  const addedCount = batchResults
    .slice(1, 1 + insertItems.length)
    .reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0)
  const resolvedNeedsReference = batchResults.at(-1)?.results?.[0] as
    | { id?: unknown }
    | undefined
  const resolvedNeedsReferenceId = resolvedNeedsReference?.id

  if (typeof resolvedNeedsReferenceId !== 'number') {
    throw new Error('Failed to resolve package needs reference')
  }

  if (addedCount === 0 && createdNeedsReference) {
    await client
      .prepare(
        `
          DELETE FROM package_needs_references
          WHERE id = ?
            AND package_id = ?
            AND NOT EXISTS (
              SELECT 1
              FROM requirement_package_items
              WHERE requirement_package_id = ?
                AND needs_reference_id = ?
            )
        `,
      )
      .bind(
        resolvedNeedsReferenceId,
        packageId,
        packageId,
        resolvedNeedsReferenceId,
      )
      .run()
  }

  return addedCount
}

export async function linkRequirementsToPackageAtomically(
  db: Database,
  packageId: number,
  {
    items,
    needsReferenceId,
    needsReferenceText,
  }: {
    items: RequirementPackageLinkItem[]
    needsReferenceId?: number | null
    needsReferenceText?: string | null
  },
): Promise<number> {
  if (items.length === 0) {
    return 0
  }

  const normalizedNeedsReferenceText = needsReferenceText?.trim() ?? null
  if (needsReferenceId != null && normalizedNeedsReferenceText) {
    throw validationError(
      'Provide either needsReferenceId or needsReferenceText, not both',
    )
  }

  if (normalizedNeedsReferenceText) {
    const d1BatchClient = getD1BatchClient(db)

    if (d1BatchClient) {
      return linkRequirementsToPackageWithD1Batch(
        d1BatchClient,
        packageId,
        items,
        normalizedNeedsReferenceText,
      )
    }
  } else {
    const resolvedNeedsReferenceId =
      needsReferenceId == null
        ? null
        : await resolveExistingPackageNeedsReferenceForLinking(
            db,
            packageId,
            needsReferenceId,
          )

    return linkRequirementsToPackage(
      db,
      packageId,
      items.map(item => ({
        ...item,
        needsReferenceId: resolvedNeedsReferenceId,
      })),
    )
  }

  return db.transaction(async tx => {
    const resolvedNeedsReference =
      await getOrCreatePackageNeedsReferenceWithMetadata(
        tx,
        packageId,
        normalizedNeedsReferenceText,
      )

    const addedCount = await linkRequirementsToPackage(
      tx,
      packageId,
      items.map(item => ({
        ...item,
        needsReferenceId: resolvedNeedsReference.id,
      })),
    )

    if (addedCount === 0 && resolvedNeedsReference.created) {
      await tx
        .delete(packageNeedsReferences)
        .where(
          and(
            eq(packageNeedsReferences.id, resolvedNeedsReference.id),
            eq(packageNeedsReferences.packageId, packageId),
          ),
        )
    }

    return addedCount
  })
}

export async function linkRequirementsToPackage(
  db: Pick<Database, 'insert'>,
  packageId: number,
  items: {
    requirementId: number
    requirementVersionId: number
    needsReferenceId?: number | null
  }[],
): Promise<number> {
  if (items.length === 0) return 0
  const inserted = await db
    .insert(requirementPackageItems)
    .values(
      items.map(item => ({
        packageId,
        ...item,
        packageItemStatusId: DEFAULT_PACKAGE_ITEM_STATUS_ID,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: requirementPackageItems.id })
  return inserted.length
}

export async function unlinkRequirementsFromPackage(
  db: Pick<Database, 'delete'>,
  packageId: number,
  requirementIds: number[],
): Promise<number> {
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
      packageItemId: requirementPackageItems.id,
      packageItemStatusId: requirementPackageItems.packageItemStatusId,
      packageItemStatusNameSv: packageItemStatuses.nameSv,
      packageItemStatusNameEn: packageItemStatuses.nameEn,
      packageItemStatusColor: packageItemStatuses.color,
      packageItemStatusDescriptionSv: packageItemStatuses.descriptionSv,
      packageItemStatusDescriptionEn: packageItemStatuses.descriptionEn,
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
    .leftJoin(
      packageItemStatuses,
      eq(packageItemStatuses.id, requirementPackageItems.packageItemStatusId),
    )
    .where(eq(requirementPackageItems.packageId, packageId))
    .orderBy(requirements.uniqueId)

  return rows.map(row => ({
    id: row.id,
    uniqueId: row.uniqueId,
    isArchived: row.isArchived,
    needsReference: row.needsReferenceText ?? null,
    needsReferenceId: row.needsReferenceId ?? null,
    packageItemId: row.packageItemId,
    packageItemStatusId: row.packageItemStatusId ?? null,
    packageItemStatusNameSv: row.packageItemStatusNameSv ?? null,
    packageItemStatusNameEn: row.packageItemStatusNameEn ?? null,
    packageItemStatusColor: row.packageItemStatusColor ?? null,
    packageItemStatusDescriptionSv: row.packageItemStatusDescriptionSv ?? null,
    packageItemStatusDescriptionEn: row.packageItemStatusDescriptionEn ?? null,
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

export async function updatePackageItemFields(
  db: Database,
  itemId: number,
  data: { packageItemStatusId?: number | null; note?: string | null },
): Promise<void> {
  const updates: Record<string, unknown> = {}
  if ('packageItemStatusId' in data) {
    updates.packageItemStatusId = data.packageItemStatusId ?? null
    updates.statusUpdatedAt = new Date().toISOString()
  }
  if ('note' in data) {
    updates.note = data.note ?? null
  }
  if (Object.keys(updates).length > 0) {
    await db
      .update(requirementPackageItems)
      .set(updates)
      .where(eq(requirementPackageItems.id, itemId))
  }
}
