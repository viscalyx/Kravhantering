import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import {
  DEVIATION_APPROVED,
  deviations,
  packageItemStatuses,
  packageLocalRequirementDeviations,
  packageLocalRequirementNormReferences,
  packageLocalRequirements,
  packageLocalRequirementUsageScenarios,
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
  riskLevels,
} from '@/drizzle/schema'
import { STATUS_PUBLISHED } from '@/lib/dal/requirements'
import type { Database } from '@/lib/db'
import { notFoundError, validationError } from '@/lib/requirements/errors'
import type { RequirementRow } from '@/lib/requirements/list-view'

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

export type PackageItemKind = 'library' | 'packageLocal'
export type PackageItemRef = `lib:${number}` | `local:${number}`

interface PackageLocalRequirementMutationInput {
  acceptanceCriteria?: string | null
  description: string
  needsReferenceId?: number | null
  normReferenceIds?: number[]
  qualityCharacteristicId?: number | null
  requirementAreaId?: number | null
  requirementCategoryId?: number | null
  requirementTypeId?: number | null
  requiresTesting?: boolean
  riskLevelId?: number | null
  scenarioIds?: number[]
  verificationMethod?: string | null
}

export interface PackageLocalRequirementDetail {
  acceptanceCriteria: string | null
  createdAt: string
  description: string
  id: number
  isPackageLocal: true
  itemRef: PackageItemRef
  kind: 'packageLocal'
  needsReference: string | null
  needsReferenceId: number | null
  normReferences: {
    id: number
    name: string
    normReferenceId: string
    uri: string | null
  }[]
  packageId: number
  packageItemStatusColor: string | null
  packageItemStatusDescriptionEn: string | null
  packageItemStatusDescriptionSv: string | null
  packageItemStatusId: number | null
  packageItemStatusNameEn: string | null
  packageItemStatusNameSv: string | null
  qualityCharacteristic: { id: number; nameEn: string; nameSv: string } | null
  requirementArea: { id: number; name: string } | null
  requirementCategory: { id: number; nameEn: string; nameSv: string } | null
  requirementType: { id: number; nameEn: string; nameSv: string } | null
  requiresTesting: boolean
  riskLevel: {
    color: string
    id: number
    nameEn: string
    nameSv: string
    sortOrder: number
  } | null
  scenarios: {
    id: number
    nameEn: string | null
    nameSv: string | null
  }[]
  uniqueId: string
  updatedAt: string
  verificationMethod: string | null
}

interface PackageLocalRequirementIdentity {
  id: number
  packageId: number
  sequenceNumber: number
  uniqueId: string
}

interface PackageLocalRequirementDetailRecord {
  acceptanceCriteria: string | null
  createdAt: string
  description: string
  id: number
  needsReference: { text: string } | null
  needsReferenceId: number | null
  normReferences: {
    normReference: {
      id: number
      name: string
      normReferenceId: string
      uri: string | null
    }
  }[]
  packageId: number
  packageItemStatus: {
    color: string | null
    descriptionEn: string | null
    descriptionSv: string | null
    nameEn: string
    nameSv: string
  } | null
  packageItemStatusId: number | null
  qualityCharacteristic: { id: number; nameEn: string; nameSv: string } | null
  requirementArea: { id: number; name: string } | null
  requirementCategory: { id: number; nameEn: string; nameSv: string } | null
  requirementType: { id: number; nameEn: string; nameSv: string } | null
  requiresTesting: boolean
  riskLevel: {
    color: string
    id: number
    nameEn: string
    nameSv: string
    sortOrder: number
  } | null
  uniqueId: string
  updatedAt: string
  usageScenarios: {
    scenario: {
      id: number
      nameEn: string | null
      nameSv: string | null
    }
  }[]
  verificationMethod: string | null
}

interface PackageLocalRequirementListRow {
  description: string
  id: number
  needsReference: { text: string } | null
  needsReferenceId: number | null
  normReferences: {
    normReference: {
      normReferenceId: string
    }
  }[]
  packageItemStatus: {
    color: string | null
    descriptionEn: string | null
    descriptionSv: string | null
    nameEn: string
    nameSv: string
  } | null
  packageItemStatusId: number | null
  qualityCharacteristic: { nameEn: string; nameSv: string } | null
  requirementArea: { name: string } | null
  requirementCategory: { nameEn: string; nameSv: string } | null
  requirementType: { nameEn: string; nameSv: string } | null
  requiresTesting: boolean
  riskLevel: {
    color: string
    nameEn: string
    nameSv: string
    sortOrder: number
  } | null
  riskLevelId: number | null
  uniqueId: string
  usageScenarios: {
    usageScenarioId: number
  }[]
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

export function createLibraryItemRef(packageItemId: number): PackageItemRef {
  return `lib:${packageItemId}`
}

export function createPackageLocalItemRef(
  packageLocalRequirementId: number,
): PackageItemRef {
  return `local:${packageLocalRequirementId}`
}

export function parsePackageItemRef(
  value: string,
):
  | { kind: 'library'; id: number }
  | { kind: 'packageLocal'; id: number }
  | null {
  const match = /^(lib|local):(\d+)$/.exec(value.trim())
  if (!match) {
    return null
  }

  const id = Number(match[2])
  if (!Number.isInteger(id) || id < 1) {
    return null
  }

  return {
    id,
    kind: match[1] === 'local' ? 'packageLocal' : 'library',
  }
}

function createPackageLocalRowId(packageLocalRequirementId: number): number {
  return packageLocalRequirementId * -1
}

function formatPackageLocalRequirementUniqueId(sequenceNumber: number): string {
  return `KRAV${String(sequenceNumber).padStart(4, '0')}`
}

function getSessionName(db: Database): string | undefined {
  return (
    db as {
      session?: {
        constructor?: {
          name?: string
        }
      }
    }
  ).session?.constructor?.name
}

function isBetterSqliteSession(db: Database): boolean {
  return getSessionName(db) === 'BetterSQLiteSession'
}

function dedupePositiveIntegerIds(values?: number[]): number[] {
  if (!values?.length) {
    return []
  }

  return [...new Set(values)].filter(
    value => Number.isInteger(value) && value > 0,
  )
}

function parseCsvNumberList(value: string | null): number[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map(entry => Number(entry))
    .filter(entry => Number.isInteger(entry) && entry > 0)
}

function parseCsvTextList(value: string | null): string[] {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
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
    .orderBy(requirementPackages.name)

  const [libraryCounts, localCounts, libraryAreas, localAreas] =
    await Promise.all([
      db
        .select({
          count: sql<number>`COUNT(*)`.as('count'),
          packageId: requirementPackageItems.packageId,
        })
        .from(requirementPackageItems)
        .groupBy(requirementPackageItems.packageId),
      db
        .select({
          count: sql<number>`COUNT(*)`.as('count'),
          packageId: packageLocalRequirements.packageId,
        })
        .from(packageLocalRequirements)
        .groupBy(packageLocalRequirements.packageId),
      db
        .select({
          areaId: requirementAreas.id,
          areaName: requirementAreas.name,
          packageId: requirementPackageItems.packageId,
        })
        .from(requirementPackageItems)
        .innerJoin(
          requirements,
          eq(requirements.id, requirementPackageItems.requirementId),
        )
        .innerJoin(
          requirementAreas,
          eq(requirementAreas.id, requirements.requirementAreaId),
        )
        .groupBy(
          requirementPackageItems.packageId,
          requirementAreas.id,
          requirementAreas.name,
        ),
      db
        .select({
          areaId: requirementAreas.id,
          areaName: requirementAreas.name,
          packageId: packageLocalRequirements.packageId,
        })
        .from(packageLocalRequirements)
        .innerJoin(
          requirementAreas,
          eq(requirementAreas.id, packageLocalRequirements.requirementAreaId),
        )
        .groupBy(
          packageLocalRequirements.packageId,
          requirementAreas.id,
          requirementAreas.name,
        ),
    ])

  const itemCounts = new Map<number, number>()
  for (const row of [...libraryCounts, ...localCounts]) {
    itemCounts.set(
      row.packageId,
      (itemCounts.get(row.packageId) ?? 0) + row.count,
    )
  }

  const requirementAreasByPackage = new Map<number, Map<number, string>>()
  const registerArea = (
    packageId: number,
    areaId: number,
    areaName: string,
  ) => {
    const existing = requirementAreasByPackage.get(packageId) ?? new Map()
    existing.set(areaId, areaName)
    requirementAreasByPackage.set(packageId, existing)
  }

  for (const row of [...libraryAreas, ...localAreas]) {
    registerArea(row.packageId, row.areaId, row.areaName)
  }

  return rows.map(row => {
    const requirementAreas = [
      ...(requirementAreasByPackage.get(row.id)?.entries() ?? []),
    ]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'sv'))

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
      itemCount: itemCounts.get(row.id) ?? 0,
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
  if (isBetterSqliteSession(db)) {
    ;(
      db as unknown as {
        transaction: (callback: (tx: Pick<Database, 'delete'>) => void) => void
      }
    ).transaction(tx => {
      tx.delete(packageLocalRequirements)
        .where(eq(packageLocalRequirements.packageId, id))
        .run()
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

  await db
    .delete(packageLocalRequirements)
    .where(eq(packageLocalRequirements.packageId, id))
  await db
    .delete(requirementPackageItems)
    .where(eq(requirementPackageItems.packageId, id))
  await db
    .delete(packageNeedsReferences)
    .where(eq(packageNeedsReferences.packageId, id))
  await db.delete(requirementPackages).where(eq(requirementPackages.id, id))
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

function normalizeOptionalForeignKeyId(value: number | null | undefined) {
  if (value == null) {
    return null
  }

  if (!Number.isInteger(value) || value < 1) {
    throw validationError('Expected a positive integer ID')
  }

  return value
}

async function normalizePackageLocalRequirementInput(
  db: Database,
  packageId: number,
  data: PackageLocalRequirementMutationInput,
) {
  const description = data.description.trim()
  if (!description) {
    throw validationError('Description is required')
  }

  if (
    data.requirementAreaId != null &&
    (!Number.isInteger(data.requirementAreaId) ||
      Number(data.requirementAreaId) < 1)
  ) {
    throw validationError('requirementAreaId must be a positive integer')
  }

  const requiresTesting = data.requiresTesting ?? false
  const verificationMethod = requiresTesting
    ? (data.verificationMethod?.trim() ?? '')
    : null

  if (requiresTesting && !verificationMethod) {
    throw validationError(
      'verificationMethod is required when requiresTesting is true',
    )
  }

  const needsReferenceId = normalizeOptionalForeignKeyId(data.needsReferenceId)
  if (needsReferenceId != null) {
    const needsReference = await getPackageNeedsReferenceById(
      db,
      packageId,
      needsReferenceId,
    )
    if (!needsReference) {
      throw validationError(
        'needsReferenceId does not belong to this requirement package',
      )
    }
  }

  return {
    acceptanceCriteria: data.acceptanceCriteria?.trim() || null,
    description,
    needsReferenceId,
    normReferenceIds: dedupePositiveIntegerIds(data.normReferenceIds),
    qualityCharacteristicId: normalizeOptionalForeignKeyId(
      data.qualityCharacteristicId,
    ),
    requirementAreaId: normalizeOptionalForeignKeyId(data.requirementAreaId),
    requirementCategoryId: normalizeOptionalForeignKeyId(
      data.requirementCategoryId,
    ),
    requirementTypeId: normalizeOptionalForeignKeyId(data.requirementTypeId),
    requiresTesting,
    riskLevelId: normalizeOptionalForeignKeyId(data.riskLevelId),
    scenarioIds: dedupePositiveIntegerIds(data.scenarioIds),
    verificationMethod,
  }
}

async function getPackageLocalRequirementIdentity(
  db: Database,
  packageId: number,
  packageLocalRequirementId: number,
): Promise<PackageLocalRequirementIdentity | null> {
  const requirement = await db.query.packageLocalRequirements.findFirst({
    columns: {
      id: true,
      packageId: true,
      sequenceNumber: true,
      uniqueId: true,
    },
    where: and(
      eq(packageLocalRequirements.id, packageLocalRequirementId),
      eq(packageLocalRequirements.packageId, packageId),
    ),
  })

  return requirement ?? null
}

async function insertPackageLocalRequirementJoins(
  db: Pick<Database, 'insert'>,
  packageLocalRequirementId: number,
  {
    normReferenceIds,
    scenarioIds,
  }: {
    normReferenceIds: number[]
    scenarioIds: number[]
  },
) {
  if (scenarioIds.length > 0) {
    await db.insert(packageLocalRequirementUsageScenarios).values(
      scenarioIds.map(usageScenarioId => ({
        packageLocalRequirementId,
        usageScenarioId,
      })),
    )
  }

  if (normReferenceIds.length > 0) {
    await db.insert(packageLocalRequirementNormReferences).values(
      normReferenceIds.map(normReferenceId => ({
        normReferenceId,
        packageLocalRequirementId,
      })),
    )
  }
}

async function replacePackageLocalRequirementJoins(
  db: Pick<Database, 'delete' | 'insert'>,
  packageLocalRequirementId: number,
  {
    normReferenceIds,
    scenarioIds,
  }: {
    normReferenceIds: number[]
    scenarioIds: number[]
  },
) {
  await db
    .delete(packageLocalRequirementUsageScenarios)
    .where(
      eq(
        packageLocalRequirementUsageScenarios.packageLocalRequirementId,
        packageLocalRequirementId,
      ),
    )

  await db
    .delete(packageLocalRequirementNormReferences)
    .where(
      eq(
        packageLocalRequirementNormReferences.packageLocalRequirementId,
        packageLocalRequirementId,
      ),
    )

  await insertPackageLocalRequirementJoins(db, packageLocalRequirementId, {
    normReferenceIds,
    scenarioIds,
  })
}

function mapPackageLocalRequirementDetail(
  requirement: PackageLocalRequirementDetailRecord | undefined,
): PackageLocalRequirementDetail {
  if (!requirement) {
    throw notFoundError('Package-local requirement not found')
  }

  const sortedNormReferences = [...requirement.normReferences]
    .map(reference => reference.normReference)
    .sort((left, right) =>
      left.normReferenceId.localeCompare(right.normReferenceId, 'sv'),
    )
  const sortedScenarios = [...requirement.usageScenarios]
    .map(scenario => scenario.scenario)
    .sort((left, right) =>
      (left.nameSv ?? left.nameEn ?? '').localeCompare(
        right.nameSv ?? right.nameEn ?? '',
        'sv',
      ),
    )

  return {
    acceptanceCriteria: requirement.acceptanceCriteria,
    createdAt: requirement.createdAt,
    description: requirement.description,
    id: requirement.id,
    isPackageLocal: true,
    itemRef: createPackageLocalItemRef(requirement.id),
    kind: 'packageLocal',
    needsReference: requirement.needsReference?.text ?? null,
    needsReferenceId: requirement.needsReferenceId,
    normReferences: sortedNormReferences.map(reference => ({
      id: reference.id,
      name: reference.name,
      normReferenceId: reference.normReferenceId,
      uri: reference.uri,
    })),
    packageId: requirement.packageId,
    packageItemStatusColor: requirement.packageItemStatus?.color ?? null,
    packageItemStatusDescriptionEn:
      requirement.packageItemStatus?.descriptionEn ?? null,
    packageItemStatusDescriptionSv:
      requirement.packageItemStatus?.descriptionSv ?? null,
    packageItemStatusId: requirement.packageItemStatusId,
    packageItemStatusNameEn: requirement.packageItemStatus?.nameEn ?? null,
    packageItemStatusNameSv: requirement.packageItemStatus?.nameSv ?? null,
    qualityCharacteristic: requirement.qualityCharacteristic
      ? {
          id: requirement.qualityCharacteristic.id,
          nameEn: requirement.qualityCharacteristic.nameEn,
          nameSv: requirement.qualityCharacteristic.nameSv,
        }
      : null,
    requirementArea: requirement.requirementArea
      ? {
          id: requirement.requirementArea.id,
          name: requirement.requirementArea.name,
        }
      : null,
    requirementCategory: requirement.requirementCategory
      ? {
          id: requirement.requirementCategory.id,
          nameEn: requirement.requirementCategory.nameEn,
          nameSv: requirement.requirementCategory.nameSv,
        }
      : null,
    requirementType: requirement.requirementType
      ? {
          id: requirement.requirementType.id,
          nameEn: requirement.requirementType.nameEn,
          nameSv: requirement.requirementType.nameSv,
        }
      : null,
    requiresTesting: requirement.requiresTesting,
    riskLevel: requirement.riskLevel
      ? {
          color: requirement.riskLevel.color,
          id: requirement.riskLevel.id,
          nameEn: requirement.riskLevel.nameEn,
          nameSv: requirement.riskLevel.nameSv,
          sortOrder: requirement.riskLevel.sortOrder,
        }
      : null,
    scenarios: sortedScenarios.map(scenario => ({
      id: scenario.id,
      nameEn: scenario.nameEn,
      nameSv: scenario.nameSv,
    })),
    uniqueId: requirement.uniqueId,
    updatedAt: requirement.updatedAt,
    verificationMethod: requirement.verificationMethod,
  }
}

export async function getPackageLocalRequirementDetail(
  db: Database,
  packageId: number,
  packageLocalRequirementId: number,
): Promise<PackageLocalRequirementDetail | null> {
  const requirement = (await db.query.packageLocalRequirements.findFirst({
    where: and(
      eq(packageLocalRequirements.id, packageLocalRequirementId),
      eq(packageLocalRequirements.packageId, packageId),
    ),
    with: {
      needsReference: true,
      normReferences: {
        with: {
          normReference: true,
        },
      },
      packageItemStatus: true,
      qualityCharacteristic: true,
      requirementArea: true,
      requirementCategory: true,
      requirementType: true,
      riskLevel: true,
      usageScenarios: {
        with: {
          scenario: true,
        },
      },
    },
  })) as PackageLocalRequirementDetailRecord | undefined

  return requirement ? mapPackageLocalRequirementDetail(requirement) : null
}

export async function createPackageLocalRequirement(
  db: Database,
  packageId: number,
  data: PackageLocalRequirementMutationInput,
) {
  const normalized = await normalizePackageLocalRequirementInput(
    db,
    packageId,
    data,
  )

  if (isBetterSqliteSession(db)) {
    let createdId: number | null = null

    ;(
      db as unknown as {
        // biome-ignore lint/suspicious/noExplicitAny: BetterSqlite3 synchronous transaction type not exposed by Drizzle
        transaction: (callback: (tx: any) => void) => void
      }
    ).transaction(tx => {
      const pkg = tx.query.requirementPackages.findFirst({
        columns: {
          localRequirementNextSequence: true,
        },
        where: eq(requirementPackages.id, packageId),
      })

      if (!pkg) {
        throw notFoundError(`Requirement package ${packageId} not found`)
      }

      const sequenceNumber = pkg.localRequirementNextSequence
      const uniqueId = formatPackageLocalRequirementUniqueId(sequenceNumber)
      const now = new Date().toISOString()

      tx.update(requirementPackages)
        .set({
          localRequirementNextSequence: sequenceNumber + 1,
        })
        .where(eq(requirementPackages.id, packageId))
        .run()

      const [inserted] = tx
        .insert(packageLocalRequirements)
        .values({
          ...normalized,
          createdAt: now,
          packageId,
          packageItemStatusId: DEFAULT_PACKAGE_ITEM_STATUS_ID,
          sequenceNumber,
          uniqueId,
          updatedAt: now,
        })
        .returning({ id: packageLocalRequirements.id })
        .all() as unknown as { id: number }[]

      createdId = inserted.id

      if (normalized.scenarioIds.length > 0) {
        tx.insert(packageLocalRequirementUsageScenarios)
          .values(
            normalized.scenarioIds.map(usageScenarioId => ({
              packageLocalRequirementId: inserted.id,
              usageScenarioId,
            })),
          )
          .run()
      }

      if (normalized.normReferenceIds.length > 0) {
        tx.insert(packageLocalRequirementNormReferences)
          .values(
            normalized.normReferenceIds.map(normReferenceId => ({
              normReferenceId,
              packageLocalRequirementId: inserted.id,
            })),
          )
          .run()
      }
    })

    const created = createdId
      ? await getPackageLocalRequirementDetail(db, packageId, createdId)
      : null
    if (!created) {
      throw notFoundError('Package-local requirement was created but not found')
    }
    return created
  }

  const [packageState] = await db
    .update(requirementPackages)
    .set({
      localRequirementNextSequence: sql`${requirementPackages.localRequirementNextSequence} + 1`,
    })
    .where(eq(requirementPackages.id, packageId))
    .returning({
      nextSequence: requirementPackages.localRequirementNextSequence,
    })

  if (!packageState) {
    throw notFoundError(`Requirement package ${packageId} not found`)
  }

  const sequenceNumber = Math.max(1, packageState.nextSequence - 1)
  const uniqueId = formatPackageLocalRequirementUniqueId(sequenceNumber)
  const now = new Date().toISOString()

  const [inserted] = await db
    .insert(packageLocalRequirements)
    .values({
      ...normalized,
      createdAt: now,
      packageId,
      packageItemStatusId: DEFAULT_PACKAGE_ITEM_STATUS_ID,
      sequenceNumber,
      uniqueId,
      updatedAt: now,
    })
    .returning({ id: packageLocalRequirements.id })

  try {
    await insertPackageLocalRequirementJoins(db, inserted.id, normalized)
  } catch (error) {
    await db
      .delete(packageLocalRequirements)
      .where(eq(packageLocalRequirements.id, inserted.id))
    throw error
  }

  const created = await getPackageLocalRequirementDetail(
    db,
    packageId,
    inserted.id,
  )
  if (!created) {
    throw notFoundError('Package-local requirement was created but not found')
  }
  return created
}

export async function updatePackageLocalRequirement(
  db: Database,
  packageId: number,
  packageLocalRequirementId: number,
  data: PackageLocalRequirementMutationInput,
) {
  const existing = await getPackageLocalRequirementIdentity(
    db,
    packageId,
    packageLocalRequirementId,
  )
  if (!existing) {
    throw notFoundError('Package-local requirement not found')
  }

  const normalized = await normalizePackageLocalRequirementInput(
    db,
    packageId,
    data,
  )
  const updatedAt = new Date().toISOString()

  if (isBetterSqliteSession(db)) {
    ;(
      db as unknown as {
        transaction: (
          callback: (
            tx: Pick<Database, 'delete' | 'insert' | 'update'>,
          ) => void,
        ) => void
      }
    ).transaction(tx => {
      tx.update(packageLocalRequirements)
        .set({
          ...normalized,
          updatedAt,
        })
        .where(eq(packageLocalRequirements.id, packageLocalRequirementId))
        .run()

      tx.delete(packageLocalRequirementUsageScenarios)
        .where(
          eq(
            packageLocalRequirementUsageScenarios.packageLocalRequirementId,
            packageLocalRequirementId,
          ),
        )
        .run()

      tx.delete(packageLocalRequirementNormReferences)
        .where(
          eq(
            packageLocalRequirementNormReferences.packageLocalRequirementId,
            packageLocalRequirementId,
          ),
        )
        .run()

      if (normalized.scenarioIds.length > 0) {
        tx.insert(packageLocalRequirementUsageScenarios)
          .values(
            normalized.scenarioIds.map(usageScenarioId => ({
              packageLocalRequirementId,
              usageScenarioId,
            })),
          )
          .run()
      }

      if (normalized.normReferenceIds.length > 0) {
        tx.insert(packageLocalRequirementNormReferences)
          .values(
            normalized.normReferenceIds.map(normReferenceId => ({
              normReferenceId,
              packageLocalRequirementId,
            })),
          )
          .run()
      }
    })
  } else {
    const d1BatchClient = getD1BatchClient(db)
    if (d1BatchClient) {
      const statements: D1PreparedStatement[] = [
        d1BatchClient
          .prepare(
            `
              UPDATE package_local_requirements
              SET requirement_area_id = ?, description = ?, acceptance_criteria = ?,
                  requirement_category_id = ?, requirement_type_id = ?,
                  quality_characteristic_id = ?, risk_level_id = ?,
                  is_testing_required = ?, verification_method = ?,
                  needs_reference_id = ?, updated_at = ?
              WHERE id = ? AND package_id = ?
            `,
          )
          .bind(
            normalized.requirementAreaId,
            normalized.description,
            normalized.acceptanceCriteria,
            normalized.requirementCategoryId,
            normalized.requirementTypeId,
            normalized.qualityCharacteristicId,
            normalized.riskLevelId,
            normalized.requiresTesting ? 1 : 0,
            normalized.verificationMethod,
            normalized.needsReferenceId,
            updatedAt,
            packageLocalRequirementId,
            packageId,
          ),
        d1BatchClient
          .prepare(
            `
              DELETE FROM package_local_requirement_usage_scenarios
              WHERE package_local_requirement_id = ?
            `,
          )
          .bind(packageLocalRequirementId),
        d1BatchClient
          .prepare(
            `
              DELETE FROM package_local_requirement_norm_references
              WHERE package_local_requirement_id = ?
            `,
          )
          .bind(packageLocalRequirementId),
      ]

      for (const usageScenarioId of normalized.scenarioIds) {
        statements.push(
          d1BatchClient
            .prepare(
              `
                INSERT INTO package_local_requirement_usage_scenarios (
                  package_local_requirement_id,
                  usage_scenario_id
                ) VALUES (?, ?)
              `,
            )
            .bind(packageLocalRequirementId, usageScenarioId),
        )
      }

      for (const normReferenceId of normalized.normReferenceIds) {
        statements.push(
          d1BatchClient
            .prepare(
              `
                INSERT INTO package_local_requirement_norm_references (
                  package_local_requirement_id,
                  norm_reference_id
                ) VALUES (?, ?)
              `,
            )
            .bind(packageLocalRequirementId, normReferenceId),
        )
      }

      await d1BatchClient.batch(statements)
    } else {
      await db
        .update(packageLocalRequirements)
        .set({
          ...normalized,
          updatedAt,
        })
        .where(eq(packageLocalRequirements.id, packageLocalRequirementId))
      await replacePackageLocalRequirementJoins(
        db,
        packageLocalRequirementId,
        normalized,
      )
    }
  }

  const updated = await getPackageLocalRequirementDetail(
    db,
    packageId,
    packageLocalRequirementId,
  )
  if (!updated) {
    throw notFoundError('Package-local requirement not found after update')
  }
  return updated
}

export async function deletePackageLocalRequirement(
  db: Database,
  packageId: number,
  packageLocalRequirementId: number,
): Promise<boolean> {
  const deleted = await db
    .delete(packageLocalRequirements)
    .where(
      and(
        eq(packageLocalRequirements.id, packageLocalRequirementId),
        eq(packageLocalRequirements.packageId, packageId),
      ),
    )
    .returning({ id: packageLocalRequirements.id })

  return deleted.length > 0
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

  const resolvedNeedsReference =
    await getOrCreatePackageNeedsReferenceWithMetadata(
      db,
      packageId,
      normalizedNeedsReferenceText,
    )

  const addedCount = await linkRequirementsToPackage(
    db,
    packageId,
    items.map(item => ({
      ...item,
      needsReferenceId: resolvedNeedsReference.id,
    })),
  )

  if (addedCount === 0 && resolvedNeedsReference.created) {
    await db
      .delete(packageNeedsReferences)
      .where(
        and(
          eq(packageNeedsReferences.id, resolvedNeedsReference.id),
          eq(packageNeedsReferences.packageId, packageId),
        ),
      )
  }

  return addedCount
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

function mapLibraryPackageItemRow(row: {
  areaName: string | null
  categoryNameEn: string | null
  categoryNameSv: string | null
  description: string | null
  isArchived: boolean
  needsReferenceId: number | null
  needsReferenceText: string | null
  normReferenceIds: string | null
  packageItemId: number
  packageItemStatusColor: string | null
  packageItemStatusDescriptionEn: string | null
  packageItemStatusDescriptionSv: string | null
  packageItemStatusId: number | null
  packageItemStatusNameEn: string | null
  packageItemStatusNameSv: string | null
  qualityCharacteristicNameEn: string | null
  qualityCharacteristicNameSv: string | null
  requirementId: number
  requiresTesting: boolean
  riskLevelColor: string | null
  riskLevelId: number | null
  riskLevelNameEn: string | null
  riskLevelNameSv: string | null
  riskLevelSortOrder: number | null
  statusColor: string | null
  statusId: number
  statusNameEn: string | null
  statusNameSv: string | null
  typeNameEn: string | null
  typeNameSv: string | null
  uniqueId: string
  usageScenarioIds: string | null
  versionNumber: number
}): RequirementRow {
  return {
    area: row.areaName ? { name: row.areaName } : null,
    id: row.requirementId,
    isArchived: row.isArchived,
    itemRef: createLibraryItemRef(row.packageItemId),
    isPackageLocal: false,
    kind: 'library',
    needsReference: row.needsReferenceText ?? null,
    needsReferenceId: row.needsReferenceId ?? null,
    normReferenceIds: parseCsvTextList(row.normReferenceIds),
    packageItemId: row.packageItemId,
    packageItemStatusColor: row.packageItemStatusColor ?? null,
    packageItemStatusDescriptionEn: row.packageItemStatusDescriptionEn ?? null,
    packageItemStatusDescriptionSv: row.packageItemStatusDescriptionSv ?? null,
    packageItemStatusId: row.packageItemStatusId ?? null,
    packageItemStatusNameEn: row.packageItemStatusNameEn ?? null,
    packageItemStatusNameSv: row.packageItemStatusNameSv ?? null,
    uniqueId: row.uniqueId,
    usageScenarioIds: parseCsvNumberList(row.usageScenarioIds),
    version: {
      categoryNameEn: row.categoryNameEn ?? null,
      categoryNameSv: row.categoryNameSv ?? null,
      description: row.description,
      qualityCharacteristicNameEn: row.qualityCharacteristicNameEn ?? null,
      qualityCharacteristicNameSv: row.qualityCharacteristicNameSv ?? null,
      requiresTesting: row.requiresTesting,
      riskLevelColor: row.riskLevelColor ?? null,
      riskLevelId: row.riskLevelId ?? null,
      riskLevelNameEn: row.riskLevelNameEn ?? null,
      riskLevelNameSv: row.riskLevelNameSv ?? null,
      riskLevelSortOrder: row.riskLevelSortOrder ?? null,
      status: row.statusId,
      statusColor: row.statusColor ?? null,
      statusNameEn: row.statusNameEn ?? null,
      statusNameSv: row.statusNameSv ?? null,
      typeNameEn: row.typeNameEn ?? null,
      typeNameSv: row.typeNameSv ?? null,
      versionNumber: row.versionNumber,
    },
  }
}

function mapPackageLocalRequirementRow(
  requirement: PackageLocalRequirementListRow,
): RequirementRow {
  return {
    area: requirement.requirementArea
      ? { name: requirement.requirementArea.name }
      : null,
    id: createPackageLocalRowId(requirement.id),
    isArchived: false,
    itemRef: createPackageLocalItemRef(requirement.id),
    isPackageLocal: true,
    kind: 'packageLocal',
    needsReference: requirement.needsReference?.text ?? null,
    needsReferenceId: requirement.needsReferenceId ?? null,
    normReferenceIds: requirement.normReferences.map(
      reference => reference.normReference.normReferenceId,
    ),
    packageItemStatusColor: requirement.packageItemStatus?.color ?? null,
    packageItemStatusDescriptionEn:
      requirement.packageItemStatus?.descriptionEn ?? null,
    packageItemStatusDescriptionSv:
      requirement.packageItemStatus?.descriptionSv ?? null,
    packageItemStatusId: requirement.packageItemStatusId ?? null,
    packageItemStatusNameEn: requirement.packageItemStatus?.nameEn ?? null,
    packageItemStatusNameSv: requirement.packageItemStatus?.nameSv ?? null,
    packageLocalRequirementId: requirement.id,
    uniqueId: requirement.uniqueId,
    usageScenarioIds: requirement.usageScenarios.map(
      scenario => scenario.usageScenarioId,
    ),
    version: {
      categoryNameEn: requirement.requirementCategory?.nameEn ?? null,
      categoryNameSv: requirement.requirementCategory?.nameSv ?? null,
      description: requirement.description,
      qualityCharacteristicNameEn:
        requirement.qualityCharacteristic?.nameEn ?? null,
      qualityCharacteristicNameSv:
        requirement.qualityCharacteristic?.nameSv ?? null,
      requiresTesting: requirement.requiresTesting,
      riskLevelColor: requirement.riskLevel?.color ?? null,
      riskLevelId: requirement.riskLevelId ?? null,
      riskLevelNameEn: requirement.riskLevel?.nameEn ?? null,
      riskLevelNameSv: requirement.riskLevel?.nameSv ?? null,
      riskLevelSortOrder: requirement.riskLevel?.sortOrder ?? null,
      status: STATUS_PUBLISHED,
      statusColor: '#22c55e',
      statusNameEn: 'Published',
      statusNameSv: 'Publicerad',
      typeNameEn: requirement.requirementType?.nameEn ?? null,
      typeNameSv: requirement.requirementType?.nameSv ?? null,
      versionNumber: 1,
    },
  }
}

export async function listPackageItems(
  db: Database,
  packageId: number,
): Promise<RequirementRow[]> {
  const [libraryRows, localRows] = await Promise.all([
    db
      .select({
        areaName: requirementAreas.name,
        categoryNameEn: requirementCategories.nameEn,
        categoryNameSv: requirementCategories.nameSv,
        description: requirementVersions.description,
        isArchived: requirements.isArchived,
        needsReferenceId: requirementPackageItems.needsReferenceId,
        needsReferenceText: packageNeedsReferences.text,
        normReferenceIds: sql<string | null>`(
          SELECT GROUP_CONCAT(nr.norm_reference_id, ',')
          FROM requirement_version_norm_references vnr
          JOIN norm_references nr ON nr.id = vnr.norm_reference_id
          WHERE vnr.requirement_version_id = ${requirementVersions.id}
        )`.as('norm_reference_ids'),
        packageItemId: requirementPackageItems.id,
        packageItemStatusColor: packageItemStatuses.color,
        packageItemStatusDescriptionEn: packageItemStatuses.descriptionEn,
        packageItemStatusDescriptionSv: packageItemStatuses.descriptionSv,
        packageItemStatusId: requirementPackageItems.packageItemStatusId,
        packageItemStatusNameEn: packageItemStatuses.nameEn,
        packageItemStatusNameSv: packageItemStatuses.nameSv,
        qualityCharacteristicNameEn: qualityCharacteristics.nameEn,
        qualityCharacteristicNameSv: qualityCharacteristics.nameSv,
        requirementId: requirements.id,
        requiresTesting: requirementVersions.requiresTesting,
        riskLevelColor: riskLevels.color,
        riskLevelId: requirementVersions.riskLevelId,
        riskLevelNameEn: riskLevels.nameEn,
        riskLevelNameSv: riskLevels.nameSv,
        riskLevelSortOrder: riskLevels.sortOrder,
        statusColor: requirementStatuses.color,
        statusId: requirementVersions.statusId,
        statusNameEn: requirementStatuses.nameEn,
        statusNameSv: requirementStatuses.nameSv,
        typeNameEn: requirementTypes.nameEn,
        typeNameSv: requirementTypes.nameSv,
        uniqueId: requirements.uniqueId,
        usageScenarioIds: sql<string | null>`(
          SELECT GROUP_CONCAT(rvus.usage_scenario_id, ',')
          FROM requirement_version_usage_scenarios rvus
          WHERE rvus.requirement_version_id = ${requirementVersions.id}
        )`.as('usage_scenario_ids'),
        versionNumber: requirementVersions.versionNumber,
      })
      .from(requirementPackageItems)
      .innerJoin(
        requirements,
        eq(requirements.id, requirementPackageItems.requirementId),
      )
      .innerJoin(
        requirementVersions,
        eq(
          requirementVersions.id,
          requirementPackageItems.requirementVersionId,
        ),
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
      .leftJoin(riskLevels, eq(riskLevels.id, requirementVersions.riskLevelId))
      .leftJoin(
        packageNeedsReferences,
        eq(packageNeedsReferences.id, requirementPackageItems.needsReferenceId),
      )
      .leftJoin(
        packageItemStatuses,
        eq(packageItemStatuses.id, requirementPackageItems.packageItemStatusId),
      )
      .where(eq(requirementPackageItems.packageId, packageId))
      .orderBy(requirements.uniqueId),
    db.query.packageLocalRequirements.findMany({
      orderBy: [asc(packageLocalRequirements.uniqueId)],
      where: eq(packageLocalRequirements.packageId, packageId),
      with: {
        needsReference: true,
        normReferences: {
          with: {
            normReference: true,
          },
        },
        packageItemStatus: true,
        qualityCharacteristic: true,
        requirementArea: true,
        requirementCategory: true,
        requirementType: true,
        riskLevel: true,
        usageScenarios: true,
      },
    }),
  ])

  return [
    ...libraryRows.map(mapLibraryPackageItemRow),
    ...(localRows as PackageLocalRequirementListRow[]).map(
      mapPackageLocalRequirementRow,
    ),
  ].sort((left, right) => left.uniqueId.localeCompare(right.uniqueId, 'sv'))
}

export async function getPackageItemById(db: Database, itemId: number) {
  const result = await db.query.requirementPackageItems.findFirst({
    where: eq(requirementPackageItems.id, itemId),
  })
  return result ?? null
}

export async function getPackageItemByRef(
  db: Database,
  packageId: number,
  itemRef: string,
) {
  const parsed = parsePackageItemRef(itemRef)
  if (!parsed) {
    return null
  }

  if (parsed.kind === 'library') {
    const packageItem = await getPackageItemById(db, parsed.id)
    if (!packageItem || packageItem.packageId !== packageId) {
      return null
    }

    return {
      id: parsed.id,
      itemRef: createLibraryItemRef(parsed.id),
      kind: 'library' as const,
    }
  }

  const localRequirement = await getPackageLocalRequirementIdentity(
    db,
    packageId,
    parsed.id,
  )
  if (!localRequirement) {
    return null
  }

  return {
    id: parsed.id,
    itemRef: createPackageLocalItemRef(parsed.id),
    kind: 'packageLocal' as const,
  }
}

export async function updatePackageItemFields(
  db: Database,
  itemId: number,
  data: { packageItemStatusId?: number | null; note?: string | null },
): Promise<void> {
  const updates: Record<string, unknown> = {}
  if ('packageItemStatusId' in data) {
    const statusId = data.packageItemStatusId ?? null
    if (statusId != null) {
      const status = await db.query.packageItemStatuses.findFirst({
        where: eq(packageItemStatuses.id, statusId),
      })
      if (!status) {
        throw validationError('Invalid package item status ID', {
          packageItemStatusId: statusId,
        })
      }
    }
    updates.packageItemStatusId = statusId
    updates.statusUpdatedAt = new Date().toISOString()
  }
  if ('note' in data) {
    updates.note = data.note ?? null
  }
  if (Object.keys(updates).length === 0) return

  const needsDeviationCheck =
    updates.packageItemStatusId === DEVIATED_PACKAGE_ITEM_STATUS_ID

  if (isBetterSqliteSession(db)) {
    ;(
      db as unknown as {
        transaction: (
          callback: (
            tx: Pick<
              Database,
              'delete' | 'insert' | 'query' | 'select' | 'update'
            >,
          ) => void,
        ) => void
      }
    ).transaction(tx => {
      if (needsDeviationCheck) {
        const rows = tx
          .select({ id: deviations.id })
          .from(deviations)
          .where(
            and(
              eq(deviations.packageItemId, itemId),
              eq(deviations.decision, DEVIATION_APPROVED),
            ),
          )
          .limit(1)
          .all() as unknown as { id: number }[]
        if (!rows.length) {
          throw validationError(
            'Deviated status requires an approved deviation',
            { packageItemStatusId: updates.packageItemStatusId, itemId },
          )
        }
      }
      tx.update(requirementPackageItems)
        .set(updates)
        .where(eq(requirementPackageItems.id, itemId))
        .run()
    })
    return
  }

  if (needsDeviationCheck) {
    const approvedDeviation = await db.query.deviations.findFirst({
      where: and(
        eq(deviations.packageItemId, itemId),
        eq(deviations.decision, DEVIATION_APPROVED),
      ),
    })
    if (!approvedDeviation) {
      throw validationError('Deviated status requires an approved deviation', {
        packageItemStatusId: updates.packageItemStatusId,
        itemId,
      })
    }
  }
  await db
    .update(requirementPackageItems)
    .set(updates)
    .where(eq(requirementPackageItems.id, itemId))
}

export async function updatePackageLocalRequirementFields(
  db: Database,
  packageLocalRequirementId: number,
  data: { packageItemStatusId?: number | null; note?: string | null },
): Promise<void> {
  const updates: Record<string, unknown> = {}
  if ('packageItemStatusId' in data) {
    const statusId = data.packageItemStatusId ?? null
    if (statusId != null) {
      const status = await db.query.packageItemStatuses.findFirst({
        where: eq(packageItemStatuses.id, statusId),
      })
      if (!status) {
        throw validationError('Invalid package item status ID', {
          packageItemStatusId: statusId,
        })
      }
    }
    updates.packageItemStatusId = statusId
    updates.statusUpdatedAt = new Date().toISOString()
  }
  if ('note' in data) {
    updates.note = data.note ?? null
  }
  if (Object.keys(updates).length === 0) return

  const needsDeviationCheck =
    updates.packageItemStatusId === DEVIATED_PACKAGE_ITEM_STATUS_ID

  if (needsDeviationCheck) {
    const approvedDeviation =
      await db.query.packageLocalRequirementDeviations.findFirst({
        where: and(
          eq(
            packageLocalRequirementDeviations.packageLocalRequirementId,
            packageLocalRequirementId,
          ),
          eq(packageLocalRequirementDeviations.decision, DEVIATION_APPROVED),
        ),
      })
    if (!approvedDeviation) {
      throw validationError('Deviated status requires an approved deviation', {
        packageItemStatusId: updates.packageItemStatusId,
        packageLocalRequirementId,
      })
    }
  }

  await db
    .update(packageLocalRequirements)
    .set(updates)
    .where(eq(packageLocalRequirements.id, packageLocalRequirementId))
}

export async function updatePackageItemFieldsByItemRef(
  db: Database,
  packageId: number,
  itemRef: string,
  data: { packageItemStatusId?: number | null; note?: string | null },
) {
  const item = await getPackageItemByRef(db, packageId, itemRef)
  if (!item) {
    throw notFoundError('Item not found in package', { itemRef, packageId })
  }

  if (item.kind === 'library') {
    await updatePackageItemFields(db, item.id, data)
    return
  }

  await updatePackageLocalRequirementFields(db, item.id, data)
}

export async function deletePackageItemsByRefs(
  db: Database,
  packageId: number,
  itemRefs: string[],
) {
  const libraryIds: number[] = []
  const packageLocalRequirementIds: number[] = []

  for (const itemRef of itemRefs) {
    const parsed = parsePackageItemRef(itemRef)
    if (!parsed) {
      throw validationError('Invalid itemRef', { itemRef })
    }

    if (parsed.kind === 'library') {
      libraryIds.push(parsed.id)
    } else {
      packageLocalRequirementIds.push(parsed.id)
    }
  }

  const deletedLibraryCount =
    libraryIds.length === 0
      ? 0
      : (
          await db
            .delete(requirementPackageItems)
            .where(
              and(
                eq(requirementPackageItems.packageId, packageId),
                inArray(requirementPackageItems.id, libraryIds),
              ),
            )
            .returning({ id: requirementPackageItems.id })
        ).length

  const deletedPackageLocalCount =
    packageLocalRequirementIds.length === 0
      ? 0
      : (
          await db
            .delete(packageLocalRequirements)
            .where(
              and(
                eq(packageLocalRequirements.packageId, packageId),
                inArray(
                  packageLocalRequirements.id,
                  packageLocalRequirementIds,
                ),
              ),
            )
            .returning({ id: packageLocalRequirements.id })
        ).length

  return {
    deletedLibraryCount,
    deletedPackageLocalCount,
  }
}
