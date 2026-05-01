import { STATUS_PUBLISHED } from '@/lib/dal/requirements'
import type { SqlServerDatabase } from '@/lib/db'
import {
  DEFAULT_PACKAGE_ITEM_STATUS_ID,
  DEVIATED_PACKAGE_ITEM_STATUS_ID,
} from '@/lib/package-item-status-constants'
import { notFoundError, validationError } from '@/lib/requirements/errors'
import type { RequirementRow } from '@/lib/requirements/list-view'

const DEVIATION_APPROVED = 1

interface SqlExecutor {
  query: (sql: string, parameters?: unknown[]) => Promise<unknown>
}

type Row = Record<string, unknown>

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

// ─── Generic value coercion helpers ──────────────────────────────────────────

function toIso(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  const n = Number(value)
  return Number.isFinite(n) ? n !== 0 : false
}

function toNum(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toStr(value: unknown): string | null {
  if (value == null) return null
  return String(value)
}

function buildInClause(startIndex: number, values: number[]): string {
  return values.map((_, index) => `@${startIndex + index}`).join(', ')
}

// ─── Public ref helpers (UNCHANGED) ──────────────────────────────────────────

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

// ─── Packages ────────────────────────────────────────────────────────────────

export async function listPackages(db: SqlServerDatabase) {
  const rows = (await db.query(
    `
      SELECT
        package_record.id AS id,
        package_record.unique_id AS uniqueId,
        package_record.name AS name,
        package_record.package_responsibility_area_id AS packageResponsibilityAreaId,
        package_record.package_implementation_type_id AS packageImplementationTypeId,
        package_record.package_lifecycle_status_id AS packageLifecycleStatusId,
        package_record.business_needs_reference AS businessNeedsReference,
        package_record.created_at AS createdAt,
        package_record.updated_at AS updatedAt,
        responsibility_area.name_sv AS responsibilityAreaNameSv,
        responsibility_area.name_en AS responsibilityAreaNameEn,
        implementation_type.name_sv AS implementationTypeNameSv,
        implementation_type.name_en AS implementationTypeNameEn,
        lifecycle_status.name_sv AS lifecycleStatusNameSv,
        lifecycle_status.name_en AS lifecycleStatusNameEn
      FROM requirement_packages package_record
      LEFT JOIN package_responsibility_areas responsibility_area
        ON responsibility_area.id = package_record.package_responsibility_area_id
      LEFT JOIN package_implementation_types implementation_type
        ON implementation_type.id = package_record.package_implementation_type_id
      LEFT JOIN package_lifecycle_statuses lifecycle_status
        ON lifecycle_status.id = package_record.package_lifecycle_status_id
      ORDER BY package_record.name
    `,
  )) as Row[]

  const [libraryCounts, localCounts, libraryAreas, localAreas] =
    await Promise.all([
      db.query(
        `
          SELECT requirement_package_id AS packageId, COUNT(*) AS count
          FROM requirement_package_items
          GROUP BY requirement_package_id
        `,
      ) as Promise<Row[]>,
      db.query(
        `
          SELECT package_id AS packageId, COUNT(*) AS count
          FROM package_local_requirements
          GROUP BY package_id
        `,
      ) as Promise<Row[]>,
      db.query(
        `
          SELECT
            package_item.requirement_package_id AS packageId,
            requirement_area.id AS areaId,
            requirement_area.name AS areaName
          FROM requirement_package_items package_item
          INNER JOIN requirements requirement
            ON requirement.id = package_item.requirement_id
          INNER JOIN requirement_areas requirement_area
            ON requirement_area.id = requirement.requirement_area_id
          GROUP BY package_item.requirement_package_id, requirement_area.id, requirement_area.name
        `,
      ) as Promise<Row[]>,
      db.query(
        `
          SELECT
            local_requirement.package_id AS packageId,
            requirement_area.id AS areaId,
            requirement_area.name AS areaName
          FROM package_local_requirements local_requirement
          INNER JOIN requirement_areas requirement_area
            ON requirement_area.id = local_requirement.requirement_area_id
          GROUP BY local_requirement.package_id, requirement_area.id, requirement_area.name
        `,
      ) as Promise<Row[]>,
    ])

  const itemCounts = new Map<number, number>()
  for (const row of [...libraryCounts, ...localCounts]) {
    const packageId = Number(row.packageId)
    const count = Number(row.count) || 0
    itemCounts.set(packageId, (itemCounts.get(packageId) ?? 0) + count)
  }

  const requirementAreasByPackage = new Map<number, Map<number, string>>()
  for (const row of [...libraryAreas, ...localAreas]) {
    const packageId = Number(row.packageId)
    const areaId = Number(row.areaId)
    const areaName = String(row.areaName ?? '')
    const existing = requirementAreasByPackage.get(packageId) ?? new Map()
    existing.set(areaId, areaName)
    requirementAreasByPackage.set(packageId, existing)
  }

  return rows.map(row => {
    const id = Number(row.id)
    const packageResponsibilityAreaId = toNum(row.packageResponsibilityAreaId)
    const packageImplementationTypeId = toNum(row.packageImplementationTypeId)
    const packageLifecycleStatusId = toNum(row.packageLifecycleStatusId)

    const requirementAreas = [
      ...(requirementAreasByPackage.get(id)?.entries() ?? []),
    ]
      .map(([areaId, name]) => ({ id: areaId, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'sv'))

    return {
      id,
      uniqueId: String(row.uniqueId),
      name: String(row.name),
      packageResponsibilityAreaId,
      packageImplementationTypeId,
      packageLifecycleStatusId,
      businessNeedsReference: toStr(row.businessNeedsReference),
      createdAt: toIso(row.createdAt) ?? '',
      updatedAt: toIso(row.updatedAt) ?? '',
      responsibilityArea:
        row.responsibilityAreaNameSv && packageResponsibilityAreaId != null
          ? {
              id: packageResponsibilityAreaId,
              nameSv: String(row.responsibilityAreaNameSv),
              nameEn: row.responsibilityAreaNameEn
                ? String(row.responsibilityAreaNameEn)
                : '',
            }
          : null,
      implementationType:
        row.implementationTypeNameSv && packageImplementationTypeId != null
          ? {
              id: packageImplementationTypeId,
              nameSv: String(row.implementationTypeNameSv),
              nameEn: row.implementationTypeNameEn
                ? String(row.implementationTypeNameEn)
                : '',
            }
          : null,
      lifecycleStatus:
        row.lifecycleStatusNameSv && packageLifecycleStatusId != null
          ? {
              id: packageLifecycleStatusId,
              nameSv: String(row.lifecycleStatusNameSv),
              nameEn: row.lifecycleStatusNameEn
                ? String(row.lifecycleStatusNameEn)
                : '',
            }
          : null,
      itemCount: itemCounts.get(id) ?? 0,
      requirementAreas,
    }
  })
}

interface PackageRecord {
  businessNeedsReference: string | null
  createdAt: string
  id: number
  implementationType: { id: number; nameSv: string; nameEn: string } | null
  lifecycleStatus: { id: number; nameSv: string; nameEn: string } | null
  name: string
  packageImplementationTypeId: number | null
  packageLifecycleStatusId: number | null
  packageResponsibilityAreaId: number | null
  responsibilityArea: { id: number; nameSv: string; nameEn: string } | null
  uniqueId: string
  updatedAt: string
}

function mapPackageRow(row: Row | undefined): PackageRecord | null {
  if (!row) return null
  const packageResponsibilityAreaId = toNum(row.packageResponsibilityAreaId)
  const packageImplementationTypeId = toNum(row.packageImplementationTypeId)
  const packageLifecycleStatusId = toNum(row.packageLifecycleStatusId)
  return {
    id: Number(row.id),
    uniqueId: String(row.uniqueId),
    name: String(row.name),
    packageResponsibilityAreaId,
    packageImplementationTypeId,
    packageLifecycleStatusId,
    businessNeedsReference: toStr(row.businessNeedsReference),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
    responsibilityArea:
      row.responsibilityAreaNameSv && packageResponsibilityAreaId != null
        ? {
            id: packageResponsibilityAreaId,
            nameSv: String(row.responsibilityAreaNameSv),
            nameEn: row.responsibilityAreaNameEn
              ? String(row.responsibilityAreaNameEn)
              : '',
          }
        : null,
    implementationType:
      row.implementationTypeNameSv && packageImplementationTypeId != null
        ? {
            id: packageImplementationTypeId,
            nameSv: String(row.implementationTypeNameSv),
            nameEn: row.implementationTypeNameEn
              ? String(row.implementationTypeNameEn)
              : '',
          }
        : null,
    lifecycleStatus:
      row.lifecycleStatusNameSv && packageLifecycleStatusId != null
        ? {
            id: packageLifecycleStatusId,
            nameSv: String(row.lifecycleStatusNameSv),
            nameEn: row.lifecycleStatusNameEn
              ? String(row.lifecycleStatusNameEn)
              : '',
          }
        : null,
  }
}

const PACKAGE_SELECT_WITH_JOINS = `
  SELECT TOP (1)
    package_record.id AS id,
    package_record.unique_id AS uniqueId,
    package_record.name AS name,
    package_record.package_responsibility_area_id AS packageResponsibilityAreaId,
    package_record.package_implementation_type_id AS packageImplementationTypeId,
    package_record.package_lifecycle_status_id AS packageLifecycleStatusId,
    package_record.business_needs_reference AS businessNeedsReference,
    package_record.created_at AS createdAt,
    package_record.updated_at AS updatedAt,
    responsibility_area.name_sv AS responsibilityAreaNameSv,
    responsibility_area.name_en AS responsibilityAreaNameEn,
    implementation_type.name_sv AS implementationTypeNameSv,
    implementation_type.name_en AS implementationTypeNameEn,
    lifecycle_status.name_sv AS lifecycleStatusNameSv,
    lifecycle_status.name_en AS lifecycleStatusNameEn
  FROM requirement_packages package_record
  LEFT JOIN package_responsibility_areas responsibility_area
    ON responsibility_area.id = package_record.package_responsibility_area_id
  LEFT JOIN package_implementation_types implementation_type
    ON implementation_type.id = package_record.package_implementation_type_id
  LEFT JOIN package_lifecycle_statuses lifecycle_status
    ON lifecycle_status.id = package_record.package_lifecycle_status_id
`

export async function getPackageById(db: SqlServerDatabase, id: number) {
  const rows = (await db.query(
    `${PACKAGE_SELECT_WITH_JOINS} WHERE package_record.id = @0`,
    [id],
  )) as Row[]
  return mapPackageRow(rows[0])
}

export async function getPackageBySlug(db: SqlServerDatabase, slug: string) {
  const rows = (await db.query(
    `${PACKAGE_SELECT_WITH_JOINS} WHERE package_record.unique_id = @0`,
    [slug],
  )) as Row[]
  return mapPackageRow(rows[0])
}

export async function isSlugTaken(
  db: SqlServerDatabase,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const rows = (await db.query(
    `SELECT TOP (1) id AS id FROM requirement_packages WHERE unique_id = @0`,
    [slug],
  )) as Array<{ id: number }>
  if (rows.length === 0) return false
  if (excludeId !== undefined) return Number(rows[0].id) !== excludeId
  return true
}

export async function createPackage(
  db: SqlServerDatabase,
  data: {
    uniqueId: string
    name: string
    packageResponsibilityAreaId?: number | null
    packageImplementationTypeId?: number | null
    packageLifecycleStatusId?: number | null
    businessNeedsReference?: string | null
  },
) {
  const now = new Date()
  const rows = (await db.query(
    `
      INSERT INTO requirement_packages (
        unique_id,
        name,
        package_responsibility_area_id,
        package_implementation_type_id,
        package_lifecycle_status_id,
        business_needs_reference,
        created_at,
        updated_at
      )
      OUTPUT
        INSERTED.id AS id,
        INSERTED.unique_id AS uniqueId,
        INSERTED.name AS name,
        INSERTED.package_responsibility_area_id AS packageResponsibilityAreaId,
        INSERTED.package_implementation_type_id AS packageImplementationTypeId,
        INSERTED.package_lifecycle_status_id AS packageLifecycleStatusId,
        INSERTED.business_needs_reference AS businessNeedsReference,
        INSERTED.created_at AS createdAt,
        INSERTED.updated_at AS updatedAt
      VALUES (@0, @1, @2, @3, @4, @5, @6, @6)
    `,
    [
      data.uniqueId,
      data.name,
      data.packageResponsibilityAreaId ?? null,
      data.packageImplementationTypeId ?? null,
      data.packageLifecycleStatusId ?? null,
      data.businessNeedsReference ?? null,
      now,
    ],
  )) as Row[]

  const row = rows[0]
  if (!row) {
    throw new Error('Failed to create requirement package')
  }
  return {
    id: Number(row.id),
    uniqueId: String(row.uniqueId),
    name: String(row.name),
    packageResponsibilityAreaId: toNum(row.packageResponsibilityAreaId),
    packageImplementationTypeId: toNum(row.packageImplementationTypeId),
    packageLifecycleStatusId: toNum(row.packageLifecycleStatusId),
    businessNeedsReference: toStr(row.businessNeedsReference),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
  }
}

export async function updatePackage(
  db: SqlServerDatabase,
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
  const setClauses: string[] = []
  const params: unknown[] = []

  if ('uniqueId' in data) {
    setClauses.push(`unique_id = @${params.length}`)
    params.push(data.uniqueId)
  }
  if ('name' in data) {
    setClauses.push(`name = @${params.length}`)
    params.push(data.name)
  }
  if ('packageResponsibilityAreaId' in data) {
    setClauses.push(`package_responsibility_area_id = @${params.length}`)
    params.push(data.packageResponsibilityAreaId ?? null)
  }
  if ('packageImplementationTypeId' in data) {
    setClauses.push(`package_implementation_type_id = @${params.length}`)
    params.push(data.packageImplementationTypeId ?? null)
  }
  if ('packageLifecycleStatusId' in data) {
    setClauses.push(`package_lifecycle_status_id = @${params.length}`)
    params.push(data.packageLifecycleStatusId ?? null)
  }
  if ('businessNeedsReference' in data) {
    setClauses.push(`business_needs_reference = @${params.length}`)
    params.push(data.businessNeedsReference ?? null)
  }

  setClauses.push(`updated_at = @${params.length}`)
  params.push(new Date())

  const idPlaceholder = `@${params.length}`
  params.push(id)

  const rows = (await db.query(
    `
      UPDATE requirement_packages
      SET ${setClauses.join(', ')}
      OUTPUT
        INSERTED.id AS id,
        INSERTED.unique_id AS uniqueId,
        INSERTED.name AS name,
        INSERTED.package_responsibility_area_id AS packageResponsibilityAreaId,
        INSERTED.package_implementation_type_id AS packageImplementationTypeId,
        INSERTED.package_lifecycle_status_id AS packageLifecycleStatusId,
        INSERTED.business_needs_reference AS businessNeedsReference,
        INSERTED.created_at AS createdAt,
        INSERTED.updated_at AS updatedAt
      WHERE id = ${idPlaceholder}
    `,
    params,
  )) as Row[]

  const row = rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    uniqueId: String(row.uniqueId),
    name: String(row.name),
    packageResponsibilityAreaId: toNum(row.packageResponsibilityAreaId),
    packageImplementationTypeId: toNum(row.packageImplementationTypeId),
    packageLifecycleStatusId: toNum(row.packageLifecycleStatusId),
    businessNeedsReference: toStr(row.businessNeedsReference),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
  }
}

export async function deletePackage(db: SqlServerDatabase, id: number) {
  await db.transaction(async (manager: SqlExecutor) => {
    await manager.query(
      `DELETE FROM package_local_requirements WHERE package_id = @0`,
      [id],
    )
    await manager.query(
      `DELETE FROM requirement_package_items WHERE requirement_package_id = @0`,
      [id],
    )
    await manager.query(
      `DELETE FROM package_needs_references WHERE package_id = @0`,
      [id],
    )
    await manager.query(`DELETE FROM requirement_packages WHERE id = @0`, [id])
  })
}

// ─── Published version lookup ────────────────────────────────────────────────

export async function getPublishedVersionIdForRequirement(
  db: SqlExecutor,
  requirementId: number,
): Promise<number | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1) requirement_version.id AS id
      FROM requirement_versions requirement_version
      WHERE requirement_version.requirement_id = @0
        AND requirement_version.requirement_status_id = @1
      ORDER BY requirement_version.version_number DESC
    `,
    [requirementId, STATUS_PUBLISHED],
  )) as Array<{ id: number }>

  return rows[0] ? Number(rows[0].id) : null
}

async function resolveRequirementPackageLinkItems(
  db: SqlExecutor,
  requirementIds: number[],
): Promise<RequirementPackageLinkItem[]> {
  const items: RequirementPackageLinkItem[] = []

  for (const requirementId of requirementIds) {
    const requirementVersionId = await getPublishedVersionIdForRequirement(
      db,
      requirementId,
    )
    if (requirementVersionId == null) {
      throw validationError(
        `Requirement ${requirementId} has no published version and cannot be added to a package`,
        {
          httpStatus: 422,
          requirementId,
          reason: 'missing_published_version',
        },
      )
    }
    items.push({ requirementId, requirementVersionId })
  }

  return items
}

// ─── Package needs references ────────────────────────────────────────────────

export async function listPackageNeedsReferences(
  db: SqlServerDatabase,
  packageId: number,
): Promise<{ id: number; text: string }[]> {
  const rows = (await db.query(
    `
      SELECT needs_reference.id AS id, needs_reference.text AS text
      FROM package_needs_references needs_reference
      WHERE needs_reference.package_id = @0
      ORDER BY needs_reference.text
    `,
    [packageId],
  )) as Row[]
  return rows.map(row => ({
    id: Number(row.id),
    text: String(row.text ?? ''),
  }))
}

export async function getPackageNeedsReferenceById(
  db: SqlExecutor,
  packageId: number,
  id: number,
): Promise<{ id: number } | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1) needs_reference.id AS id
      FROM package_needs_references needs_reference
      WHERE needs_reference.id = @0 AND needs_reference.package_id = @1
    `,
    [id, packageId],
  )) as Array<{ id: number }>
  return rows[0] ? { id: Number(rows[0].id) } : null
}

async function getOrCreatePackageNeedsReferenceWithMetadata(
  db: SqlExecutor,
  packageId: number,
  text: string,
): Promise<{ created: boolean; id: number }> {
  const normalizedText = text.trim()
  const insertedRows = (await db.query(
    `
      INSERT INTO package_needs_references (package_id, text, created_at)
      OUTPUT INSERTED.id AS id
      SELECT @0, @1, @2
      WHERE NOT EXISTS (
        SELECT 1 FROM package_needs_references
        WHERE package_id = @0 AND text = @1
      )
    `,
    [packageId, normalizedText, new Date()],
  )) as Array<{ id: number }>

  if (insertedRows[0]) {
    return { created: true, id: Number(insertedRows[0].id) }
  }

  const existingRows = (await db.query(
    `
      SELECT TOP (1) id AS id
      FROM package_needs_references
      WHERE package_id = @0 AND text = @1
    `,
    [packageId, normalizedText],
  )) as Array<{ id: number }>

  if (!existingRows[0]) {
    throw new Error('Failed to resolve package needs reference')
  }
  return { created: false, id: Number(existingRows[0].id) }
}

export async function getOrCreatePackageNeedsReference(
  db: SqlServerDatabase,
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
  db: SqlExecutor,
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

// ─── Package-local requirements ──────────────────────────────────────────────

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
  db: SqlExecutor,
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
  db: SqlExecutor,
  packageId: number,
  packageLocalRequirementId: number,
): Promise<PackageLocalRequirementIdentity | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        local_requirement.id AS id,
        local_requirement.package_id AS packageId,
        local_requirement.sequence_number AS sequenceNumber,
        local_requirement.unique_id AS uniqueId
      FROM package_local_requirements local_requirement
      WHERE local_requirement.id = @0 AND local_requirement.package_id = @1
    `,
    [packageLocalRequirementId, packageId],
  )) as Row[]

  const row = rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    packageId: Number(row.packageId),
    sequenceNumber: Number(row.sequenceNumber),
    uniqueId: String(row.uniqueId),
  }
}

const LOCAL_REQUIREMENT_DETAIL_SELECT = `
  SELECT TOP (1)
    local_requirement.id AS id,
    local_requirement.package_id AS packageId,
    local_requirement.unique_id AS uniqueId,
    local_requirement.description AS description,
    local_requirement.acceptance_criteria AS acceptanceCriteria,
    local_requirement.is_testing_required AS requiresTesting,
    local_requirement.verification_method AS verificationMethod,
    local_requirement.created_at AS createdAt,
    local_requirement.updated_at AS updatedAt,
    local_requirement.needs_reference_id AS needsReferenceId,
    needs_reference.text AS needsReference,
    local_requirement.package_item_status_id AS packageItemStatusId,
    package_item_status.color AS packageItemStatusColor,
    package_item_status.description_en AS packageItemStatusDescriptionEn,
    package_item_status.description_sv AS packageItemStatusDescriptionSv,
    package_item_status.name_en AS packageItemStatusNameEn,
    package_item_status.name_sv AS packageItemStatusNameSv,
    local_requirement.quality_characteristic_id AS qualityCharacteristicId,
    quality_characteristic.name_en AS qualityCharacteristicNameEn,
    quality_characteristic.name_sv AS qualityCharacteristicNameSv,
    local_requirement.requirement_area_id AS requirementAreaId,
    requirement_area.name AS requirementAreaName,
    local_requirement.requirement_category_id AS requirementCategoryId,
    requirement_category.name_en AS requirementCategoryNameEn,
    requirement_category.name_sv AS requirementCategoryNameSv,
    local_requirement.requirement_type_id AS requirementTypeId,
    requirement_type.name_en AS requirementTypeNameEn,
    requirement_type.name_sv AS requirementTypeNameSv,
    local_requirement.risk_level_id AS riskLevelId,
    risk_level.color AS riskLevelColor,
    risk_level.name_en AS riskLevelNameEn,
    risk_level.name_sv AS riskLevelNameSv,
    risk_level.sort_order AS riskLevelSortOrder
  FROM package_local_requirements local_requirement
  LEFT JOIN package_needs_references needs_reference
    ON needs_reference.id = local_requirement.needs_reference_id
  LEFT JOIN package_item_statuses package_item_status
    ON package_item_status.id = local_requirement.package_item_status_id
  LEFT JOIN quality_characteristics quality_characteristic
    ON quality_characteristic.id = local_requirement.quality_characteristic_id
  LEFT JOIN requirement_areas requirement_area
    ON requirement_area.id = local_requirement.requirement_area_id
  LEFT JOIN requirement_categories requirement_category
    ON requirement_category.id = local_requirement.requirement_category_id
  LEFT JOIN requirement_types requirement_type
    ON requirement_type.id = local_requirement.requirement_type_id
  LEFT JOIN risk_levels risk_level
    ON risk_level.id = local_requirement.risk_level_id
`

function mapPackageLocalRequirementDetailFlat(
  row: Row,
  normReferenceRows: Row[],
  scenarioRows: Row[],
): PackageLocalRequirementDetail {
  const id = Number(row.id)
  const qualityCharacteristicId = toNum(row.qualityCharacteristicId)
  const requirementAreaId = toNum(row.requirementAreaId)
  const requirementCategoryId = toNum(row.requirementCategoryId)
  const requirementTypeId = toNum(row.requirementTypeId)
  const riskLevelId = toNum(row.riskLevelId)

  const sortedNormReferences = [...normReferenceRows]
    .map(reference => ({
      id: Number(reference.id),
      name: String(reference.name ?? ''),
      normReferenceId: String(reference.normReferenceId ?? ''),
      uri: reference.uri == null ? null : String(reference.uri),
    }))
    .sort((left, right) =>
      left.normReferenceId.localeCompare(right.normReferenceId, 'sv'),
    )
  const sortedScenarios = [...scenarioRows]
    .map(scenario => ({
      id: Number(scenario.id),
      nameEn: scenario.nameEn == null ? null : String(scenario.nameEn),
      nameSv: scenario.nameSv == null ? null : String(scenario.nameSv),
    }))
    .sort((left, right) =>
      (left.nameSv ?? left.nameEn ?? '').localeCompare(
        right.nameSv ?? right.nameEn ?? '',
        'sv',
      ),
    )

  return {
    acceptanceCriteria: toStr(row.acceptanceCriteria),
    createdAt: toIso(row.createdAt) ?? '',
    description: String(row.description ?? ''),
    id,
    isPackageLocal: true,
    itemRef: createPackageLocalItemRef(id),
    kind: 'packageLocal',
    needsReference: toStr(row.needsReference),
    needsReferenceId: toNum(row.needsReferenceId),
    normReferences: sortedNormReferences,
    packageId: Number(row.packageId),
    packageItemStatusColor: toStr(row.packageItemStatusColor),
    packageItemStatusDescriptionEn: toStr(row.packageItemStatusDescriptionEn),
    packageItemStatusDescriptionSv: toStr(row.packageItemStatusDescriptionSv),
    packageItemStatusId: toNum(row.packageItemStatusId),
    packageItemStatusNameEn: toStr(row.packageItemStatusNameEn),
    packageItemStatusNameSv: toStr(row.packageItemStatusNameSv),
    qualityCharacteristic:
      qualityCharacteristicId != null
        ? {
            id: qualityCharacteristicId,
            nameEn: String(row.qualityCharacteristicNameEn ?? ''),
            nameSv: String(row.qualityCharacteristicNameSv ?? ''),
          }
        : null,
    requirementArea:
      requirementAreaId != null
        ? {
            id: requirementAreaId,
            name: String(row.requirementAreaName ?? ''),
          }
        : null,
    requirementCategory:
      requirementCategoryId != null
        ? {
            id: requirementCategoryId,
            nameEn: String(row.requirementCategoryNameEn ?? ''),
            nameSv: String(row.requirementCategoryNameSv ?? ''),
          }
        : null,
    requirementType:
      requirementTypeId != null
        ? {
            id: requirementTypeId,
            nameEn: String(row.requirementTypeNameEn ?? ''),
            nameSv: String(row.requirementTypeNameSv ?? ''),
          }
        : null,
    requiresTesting: toBool(row.requiresTesting),
    riskLevel:
      riskLevelId != null
        ? {
            color: String(row.riskLevelColor ?? ''),
            id: riskLevelId,
            nameEn: String(row.riskLevelNameEn ?? ''),
            nameSv: String(row.riskLevelNameSv ?? ''),
            sortOrder: Number(row.riskLevelSortOrder ?? 0),
          }
        : null,
    scenarios: sortedScenarios,
    uniqueId: String(row.uniqueId),
    updatedAt: toIso(row.updatedAt) ?? '',
    verificationMethod: toStr(row.verificationMethod),
  }
}

export async function getPackageLocalRequirementDetail(
  db: SqlServerDatabase,
  packageId: number,
  packageLocalRequirementId: number,
): Promise<PackageLocalRequirementDetail | null> {
  const mainRows = (await db.query(
    `${LOCAL_REQUIREMENT_DETAIL_SELECT}
     WHERE local_requirement.id = @0 AND local_requirement.package_id = @1`,
    [packageLocalRequirementId, packageId],
  )) as Row[]

  const mainRow = mainRows[0]
  if (!mainRow) {
    return null
  }

  const [normReferenceRows, scenarioRows] = await Promise.all([
    db.query(
      `
        SELECT
          norm_reference.id AS id,
          norm_reference.name AS name,
          norm_reference.norm_reference_id AS normReferenceId,
          norm_reference.uri AS uri
        FROM package_local_requirement_norm_references link
        INNER JOIN norm_references norm_reference
          ON norm_reference.id = link.norm_reference_id
        WHERE link.package_local_requirement_id = @0
      `,
      [packageLocalRequirementId],
    ) as Promise<Row[]>,
    db.query(
      `
        SELECT
          usage_scenario.id AS id,
          usage_scenario.name_en AS nameEn,
          usage_scenario.name_sv AS nameSv
        FROM package_local_requirement_usage_scenarios link
        INNER JOIN usage_scenarios usage_scenario
          ON usage_scenario.id = link.usage_scenario_id
        WHERE link.package_local_requirement_id = @0
      `,
      [packageLocalRequirementId],
    ) as Promise<Row[]>,
  ])

  return mapPackageLocalRequirementDetailFlat(
    mainRow,
    normReferenceRows,
    scenarioRows,
  )
}

async function insertPackageLocalRequirementJoins(
  manager: SqlExecutor,
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
    const valuesSql = scenarioIds
      .map((_, index) => `(@0, @${index + 1})`)
      .join(', ')
    await manager.query(
      `
        INSERT INTO package_local_requirement_usage_scenarios
          (package_local_requirement_id, usage_scenario_id)
        VALUES ${valuesSql}
      `,
      [packageLocalRequirementId, ...scenarioIds],
    )
  }

  if (normReferenceIds.length > 0) {
    const valuesSql = normReferenceIds
      .map((_, index) => `(@0, @${index + 1})`)
      .join(', ')
    await manager.query(
      `
        INSERT INTO package_local_requirement_norm_references
          (package_local_requirement_id, norm_reference_id)
        VALUES ${valuesSql}
      `,
      [packageLocalRequirementId, ...normReferenceIds],
    )
  }
}

export async function createPackageLocalRequirement(
  db: SqlServerDatabase,
  packageId: number,
  data: PackageLocalRequirementMutationInput,
) {
  const normalized = await normalizePackageLocalRequirementInput(
    db,
    packageId,
    data,
  )

  const createdId = await db.transaction(async (manager: SqlExecutor) => {
    const sequenceRows = (await manager.query(
      `
        UPDATE requirement_packages
        SET local_requirement_next_sequence = local_requirement_next_sequence + 1
        OUTPUT INSERTED.local_requirement_next_sequence AS nextSequence
        WHERE id = @0
      `,
      [packageId],
    )) as Array<{ nextSequence: number }>

    const sequenceRow = sequenceRows[0]
    if (!sequenceRow) {
      throw notFoundError(`Requirement package ${packageId} not found`)
    }

    const sequenceNumber = Math.max(1, Number(sequenceRow.nextSequence) - 1)
    const uniqueId = formatPackageLocalRequirementUniqueId(sequenceNumber)
    const now = new Date()

    const insertedRows = (await manager.query(
      `
        INSERT INTO package_local_requirements (
          package_id,
          unique_id,
          sequence_number,
          requirement_area_id,
          description,
          acceptance_criteria,
          requirement_category_id,
          requirement_type_id,
          quality_characteristic_id,
          risk_level_id,
          is_testing_required,
          verification_method,
          needs_reference_id,
          package_item_status_id,
          created_at,
          updated_at
        )
        OUTPUT INSERTED.id AS id
        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14, @14)
      `,
      [
        packageId,
        uniqueId,
        sequenceNumber,
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
        DEFAULT_PACKAGE_ITEM_STATUS_ID,
        now,
      ],
    )) as Array<{ id: number }>

    const insertedRow = insertedRows[0]
    if (!insertedRow) {
      throw new Error('Failed to insert package-local requirement')
    }

    await insertPackageLocalRequirementJoins(
      manager,
      Number(insertedRow.id),
      normalized,
    )

    return Number(insertedRow.id)
  })

  const created = await getPackageLocalRequirementDetail(
    db,
    packageId,
    createdId,
  )
  if (!created) {
    throw notFoundError('Package-local requirement was created but not found')
  }
  return created
}

export async function updatePackageLocalRequirement(
  db: SqlServerDatabase,
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
  const updatedAt = new Date()

  await db.transaction(async (manager: SqlExecutor) => {
    await manager.query(
      `
        UPDATE package_local_requirements
        SET
          description = @0,
          acceptance_criteria = @1,
          needs_reference_id = @2,
          quality_characteristic_id = @3,
          requirement_area_id = @4,
          requirement_category_id = @5,
          requirement_type_id = @6,
          is_testing_required = @7,
          risk_level_id = @8,
          verification_method = @9,
          updated_at = @10
        WHERE id = @11 AND package_id = @12
      `,
      [
        normalized.description,
        normalized.acceptanceCriteria,
        normalized.needsReferenceId,
        normalized.qualityCharacteristicId,
        normalized.requirementAreaId,
        normalized.requirementCategoryId,
        normalized.requirementTypeId,
        normalized.requiresTesting ? 1 : 0,
        normalized.riskLevelId,
        normalized.verificationMethod,
        updatedAt,
        packageLocalRequirementId,
        packageId,
      ],
    )

    await manager.query(
      `
        DELETE FROM package_local_requirement_usage_scenarios
        WHERE package_local_requirement_id = @0
      `,
      [packageLocalRequirementId],
    )

    await manager.query(
      `
        DELETE FROM package_local_requirement_norm_references
        WHERE package_local_requirement_id = @0
      `,
      [packageLocalRequirementId],
    )

    await insertPackageLocalRequirementJoins(
      manager,
      packageLocalRequirementId,
      normalized,
    )
  })

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
  db: SqlServerDatabase,
  packageId: number,
  packageLocalRequirementId: number,
): Promise<boolean> {
  const deleted = (await db.query(
    `
      DELETE FROM package_local_requirements
      OUTPUT DELETED.id AS id
      WHERE id = @0 AND package_id = @1
    `,
    [packageLocalRequirementId, packageId],
  )) as Array<{ id: number }>

  return deleted.length > 0
}

// ─── Library item linking ────────────────────────────────────────────────────

export async function linkRequirementsToPackage(
  db: SqlExecutor,
  packageId: number,
  items: {
    requirementId: number
    requirementVersionId: number
    needsReferenceId?: number | null
  }[],
): Promise<number> {
  if (items.length === 0) return 0

  let inserted = 0
  for (const item of items) {
    const rows = (await db.query(
      `
        INSERT INTO requirement_package_items (
          requirement_package_id,
          requirement_id,
          requirement_version_id,
          needs_reference_id,
          package_item_status_id,
          created_at
        )
        OUTPUT INSERTED.id AS id
        SELECT @0, @1, @2, @3, @4, @5
        WHERE NOT EXISTS (
          SELECT 1 FROM requirement_package_items
          WHERE requirement_package_id = @0 AND requirement_id = @1
        )
      `,
      [
        packageId,
        item.requirementId,
        item.requirementVersionId,
        item.needsReferenceId ?? null,
        DEFAULT_PACKAGE_ITEM_STATUS_ID,
        new Date(),
      ],
    )) as Array<{ id: number }>
    if (rows.length > 0) {
      inserted += 1
    }
  }
  return inserted
}

export async function linkRequirementsToPackageAtomically(
  db: SqlServerDatabase,
  packageId: number,
  {
    requirementIds,
    needsReferenceId,
    needsReferenceText,
  }: {
    requirementIds: number[]
    needsReferenceId?: number | null
    needsReferenceText?: string | null
  },
): Promise<number> {
  if (requirementIds.length === 0) {
    return 0
  }

  const normalizedNeedsReferenceText = needsReferenceText?.trim() ?? null
  if (needsReferenceId != null && normalizedNeedsReferenceText) {
    throw validationError(
      'Provide either needsReferenceId or needsReferenceText, not both',
    )
  }

  return db.transaction(async (manager: SqlExecutor) => {
    const items = await resolveRequirementPackageLinkItems(
      manager,
      requirementIds,
    )

    if (normalizedNeedsReferenceText) {
      const resolvedNeedsReference =
        await getOrCreatePackageNeedsReferenceWithMetadata(
          manager,
          packageId,
          normalizedNeedsReferenceText,
        )

      const addedCount = await linkRequirementsToPackage(
        manager,
        packageId,
        items.map(item => ({
          ...item,
          needsReferenceId: resolvedNeedsReference.id,
        })),
      )

      if (addedCount === 0 && resolvedNeedsReference.created) {
        await manager.query(
          `
            DELETE FROM package_needs_references
            WHERE id = @0 AND package_id = @1
          `,
          [resolvedNeedsReference.id, packageId],
        )
      }

      return addedCount
    }

    const resolvedNeedsReferenceId =
      needsReferenceId == null
        ? null
        : await resolveExistingPackageNeedsReferenceForLinking(
            manager,
            packageId,
            needsReferenceId,
          )

    return linkRequirementsToPackage(
      manager,
      packageId,
      items.map(item => ({
        ...item,
        needsReferenceId: resolvedNeedsReferenceId,
      })),
    )
  })
}

export async function unlinkRequirementsFromPackage(
  db: SqlServerDatabase,
  packageId: number,
  requirementIds: number[],
): Promise<number> {
  if (requirementIds.length === 0) return 0

  const params: unknown[] = [packageId, ...requirementIds]
  const placeholders = requirementIds
    .map((_, index) => `@${index + 1}`)
    .join(', ')

  const deleted = (await db.query(
    `
      DELETE FROM requirement_package_items
      OUTPUT DELETED.id AS id
      WHERE requirement_package_id = @0 AND requirement_id IN (${placeholders})
    `,
    params,
  )) as Array<{ id: number }>
  return deleted.length
}

// ─── Listing items in a package ──────────────────────────────────────────────

interface LibraryPackageItemFlatRow {
  areaName: string | null
  categoryNameEn: string | null
  categoryNameSv: string | null
  description: string | null
  isArchived: unknown
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
  requiresTesting: unknown
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
}

function mapLibraryPackageItemRow(
  row: LibraryPackageItemFlatRow,
): RequirementRow {
  return {
    area: row.areaName ? { name: row.areaName } : null,
    id: Number(row.requirementId),
    isArchived: toBool(row.isArchived),
    itemRef: createLibraryItemRef(Number(row.packageItemId)),
    isPackageLocal: false,
    kind: 'library',
    needsReference: row.needsReferenceText ?? null,
    needsReferenceId: row.needsReferenceId ?? null,
    normReferenceIds: parseCsvTextList(row.normReferenceIds),
    packageItemId: Number(row.packageItemId),
    packageItemStatusColor: row.packageItemStatusColor ?? null,
    packageItemStatusDescriptionEn: row.packageItemStatusDescriptionEn ?? null,
    packageItemStatusDescriptionSv: row.packageItemStatusDescriptionSv ?? null,
    packageItemStatusId: row.packageItemStatusId ?? null,
    packageItemStatusNameEn: row.packageItemStatusNameEn ?? null,
    packageItemStatusNameSv: row.packageItemStatusNameSv ?? null,
    uniqueId: row.uniqueId,
    usageScenarioIds: parseCsvNumberList(row.usageScenarioIds),
    version: {
      archiveInitiatedAt: null,
      categoryNameEn: row.categoryNameEn ?? null,
      categoryNameSv: row.categoryNameSv ?? null,
      description: row.description,
      qualityCharacteristicNameEn: row.qualityCharacteristicNameEn ?? null,
      qualityCharacteristicNameSv: row.qualityCharacteristicNameSv ?? null,
      requiresTesting: toBool(row.requiresTesting),
      riskLevelColor: row.riskLevelColor ?? null,
      riskLevelId: row.riskLevelId ?? null,
      riskLevelNameEn: row.riskLevelNameEn ?? null,
      riskLevelNameSv: row.riskLevelNameSv ?? null,
      riskLevelSortOrder: row.riskLevelSortOrder ?? null,
      status: Number(row.statusId),
      statusColor: row.statusColor ?? null,
      statusNameEn: row.statusNameEn ?? null,
      statusNameSv: row.statusNameSv ?? null,
      typeNameEn: row.typeNameEn ?? null,
      typeNameSv: row.typeNameSv ?? null,
      versionNumber: Number(row.versionNumber),
    },
  }
}

interface PackageLocalListFlatRow {
  description: string
  id: number
  needsReferenceId: number | null
  needsReferenceText: string | null
  normReferenceIds: string | null
  packageItemStatusColor: string | null
  packageItemStatusDescriptionEn: string | null
  packageItemStatusDescriptionSv: string | null
  packageItemStatusId: number | null
  packageItemStatusNameEn: string | null
  packageItemStatusNameSv: string | null
  qualityCharacteristicNameEn: string | null
  qualityCharacteristicNameSv: string | null
  requirementAreaName: string | null
  requirementCategoryNameEn: string | null
  requirementCategoryNameSv: string | null
  requirementTypeNameEn: string | null
  requirementTypeNameSv: string | null
  requiresTesting: unknown
  riskLevelColor: string | null
  riskLevelId: number | null
  riskLevelNameEn: string | null
  riskLevelNameSv: string | null
  riskLevelSortOrder: number | null
  uniqueId: string
  usageScenarioIds: string | null
}

function mapPackageLocalRequirementListRow(
  row: PackageLocalListFlatRow,
): RequirementRow {
  return {
    area: row.requirementAreaName ? { name: row.requirementAreaName } : null,
    id: createPackageLocalRowId(Number(row.id)),
    isArchived: false,
    itemRef: createPackageLocalItemRef(Number(row.id)),
    isPackageLocal: true,
    kind: 'packageLocal',
    needsReference: row.needsReferenceText ?? null,
    needsReferenceId: row.needsReferenceId ?? null,
    normReferenceIds: parseCsvTextList(row.normReferenceIds),
    packageItemStatusColor: row.packageItemStatusColor ?? null,
    packageItemStatusDescriptionEn: row.packageItemStatusDescriptionEn ?? null,
    packageItemStatusDescriptionSv: row.packageItemStatusDescriptionSv ?? null,
    packageItemStatusId: row.packageItemStatusId ?? null,
    packageItemStatusNameEn: row.packageItemStatusNameEn ?? null,
    packageItemStatusNameSv: row.packageItemStatusNameSv ?? null,
    packageLocalRequirementId: Number(row.id),
    uniqueId: row.uniqueId,
    usageScenarioIds: parseCsvNumberList(row.usageScenarioIds),
    version: {
      archiveInitiatedAt: null,
      categoryNameEn: row.requirementCategoryNameEn ?? null,
      categoryNameSv: row.requirementCategoryNameSv ?? null,
      description: row.description,
      qualityCharacteristicNameEn: row.qualityCharacteristicNameEn ?? null,
      qualityCharacteristicNameSv: row.qualityCharacteristicNameSv ?? null,
      requiresTesting: toBool(row.requiresTesting),
      riskLevelColor: row.riskLevelColor ?? null,
      riskLevelId: row.riskLevelId ?? null,
      riskLevelNameEn: row.riskLevelNameEn ?? null,
      riskLevelNameSv: row.riskLevelNameSv ?? null,
      riskLevelSortOrder: row.riskLevelSortOrder ?? null,
      status: STATUS_PUBLISHED,
      statusColor: '#22c55e',
      statusNameEn: 'Published',
      statusNameSv: 'Publicerad',
      typeNameEn: row.requirementTypeNameEn ?? null,
      typeNameSv: row.requirementTypeNameSv ?? null,
      versionNumber: 1,
    },
  }
}

export async function listPackageItems(
  db: SqlServerDatabase,
  packageId: number,
): Promise<RequirementRow[]> {
  const [libraryRows, localRows] = await Promise.all([
    db.query(
      `
        SELECT
          requirement_area.name AS areaName,
          requirement_category.name_en AS categoryNameEn,
          requirement_category.name_sv AS categoryNameSv,
          requirement_version.description AS description,
          requirement.is_archived AS isArchived,
          package_item.needs_reference_id AS needsReferenceId,
          needs_reference.text AS needsReferenceText,
          (
            SELECT STRING_AGG(norm_reference.norm_reference_id, ',') WITHIN GROUP (ORDER BY norm_reference.norm_reference_id)
            FROM requirement_version_norm_references vnr
            INNER JOIN norm_references norm_reference ON norm_reference.id = vnr.norm_reference_id
            WHERE vnr.requirement_version_id = requirement_version.id
          ) AS normReferenceIds,
          package_item.id AS packageItemId,
          package_item_status.color AS packageItemStatusColor,
          package_item_status.description_en AS packageItemStatusDescriptionEn,
          package_item_status.description_sv AS packageItemStatusDescriptionSv,
          package_item.package_item_status_id AS packageItemStatusId,
          package_item_status.name_en AS packageItemStatusNameEn,
          package_item_status.name_sv AS packageItemStatusNameSv,
          quality_characteristic.name_en AS qualityCharacteristicNameEn,
          quality_characteristic.name_sv AS qualityCharacteristicNameSv,
          requirement.id AS requirementId,
          requirement_version.is_testing_required AS requiresTesting,
          risk_level.color AS riskLevelColor,
          requirement_version.risk_level_id AS riskLevelId,
          risk_level.name_en AS riskLevelNameEn,
          risk_level.name_sv AS riskLevelNameSv,
          risk_level.sort_order AS riskLevelSortOrder,
          requirement_status.color AS statusColor,
          requirement_version.requirement_status_id AS statusId,
          requirement_status.name_en AS statusNameEn,
          requirement_status.name_sv AS statusNameSv,
          requirement_type.name_en AS typeNameEn,
          requirement_type.name_sv AS typeNameSv,
          requirement.unique_id AS uniqueId,
          (
            SELECT STRING_AGG(CAST(rvus.usage_scenario_id AS varchar(20)), ',')
            FROM requirement_version_usage_scenarios rvus
            WHERE rvus.requirement_version_id = requirement_version.id
          ) AS usageScenarioIds,
          requirement_version.version_number AS versionNumber
        FROM requirement_package_items package_item
        INNER JOIN requirements requirement
          ON requirement.id = package_item.requirement_id
        INNER JOIN requirement_versions requirement_version
          ON requirement_version.id = package_item.requirement_version_id
        LEFT JOIN requirement_areas requirement_area
          ON requirement_area.id = requirement.requirement_area_id
        LEFT JOIN requirement_statuses requirement_status
          ON requirement_status.id = requirement_version.requirement_status_id
        LEFT JOIN requirement_categories requirement_category
          ON requirement_category.id = requirement_version.requirement_category_id
        LEFT JOIN requirement_types requirement_type
          ON requirement_type.id = requirement_version.requirement_type_id
        LEFT JOIN quality_characteristics quality_characteristic
          ON quality_characteristic.id = requirement_version.quality_characteristic_id
        LEFT JOIN risk_levels risk_level
          ON risk_level.id = requirement_version.risk_level_id
        LEFT JOIN package_needs_references needs_reference
          ON needs_reference.id = package_item.needs_reference_id
        LEFT JOIN package_item_statuses package_item_status
          ON package_item_status.id = package_item.package_item_status_id
        WHERE package_item.requirement_package_id = @0
        ORDER BY requirement.unique_id
      `,
      [packageId],
    ) as Promise<Row[]>,
    db.query(
      `
        SELECT
          local_requirement.id AS id,
          local_requirement.unique_id AS uniqueId,
          local_requirement.description AS description,
          local_requirement.needs_reference_id AS needsReferenceId,
          needs_reference.text AS needsReferenceText,
          (
            SELECT STRING_AGG(norm_reference.norm_reference_id, ',') WITHIN GROUP (ORDER BY norm_reference.norm_reference_id)
            FROM package_local_requirement_norm_references plrnr
            INNER JOIN norm_references norm_reference ON norm_reference.id = plrnr.norm_reference_id
            WHERE plrnr.package_local_requirement_id = local_requirement.id
          ) AS normReferenceIds,
          package_item_status.color AS packageItemStatusColor,
          package_item_status.description_en AS packageItemStatusDescriptionEn,
          package_item_status.description_sv AS packageItemStatusDescriptionSv,
          local_requirement.package_item_status_id AS packageItemStatusId,
          package_item_status.name_en AS packageItemStatusNameEn,
          package_item_status.name_sv AS packageItemStatusNameSv,
          quality_characteristic.name_en AS qualityCharacteristicNameEn,
          quality_characteristic.name_sv AS qualityCharacteristicNameSv,
          requirement_area.name AS requirementAreaName,
          requirement_category.name_en AS requirementCategoryNameEn,
          requirement_category.name_sv AS requirementCategoryNameSv,
          requirement_type.name_en AS requirementTypeNameEn,
          requirement_type.name_sv AS requirementTypeNameSv,
          local_requirement.is_testing_required AS requiresTesting,
          risk_level.color AS riskLevelColor,
          local_requirement.risk_level_id AS riskLevelId,
          risk_level.name_en AS riskLevelNameEn,
          risk_level.name_sv AS riskLevelNameSv,
          risk_level.sort_order AS riskLevelSortOrder,
          (
            SELECT STRING_AGG(CAST(plrus.usage_scenario_id AS varchar(20)), ',')
            FROM package_local_requirement_usage_scenarios plrus
            WHERE plrus.package_local_requirement_id = local_requirement.id
          ) AS usageScenarioIds
        FROM package_local_requirements local_requirement
        LEFT JOIN package_needs_references needs_reference
          ON needs_reference.id = local_requirement.needs_reference_id
        LEFT JOIN package_item_statuses package_item_status
          ON package_item_status.id = local_requirement.package_item_status_id
        LEFT JOIN quality_characteristics quality_characteristic
          ON quality_characteristic.id = local_requirement.quality_characteristic_id
        LEFT JOIN requirement_areas requirement_area
          ON requirement_area.id = local_requirement.requirement_area_id
        LEFT JOIN requirement_categories requirement_category
          ON requirement_category.id = local_requirement.requirement_category_id
        LEFT JOIN requirement_types requirement_type
          ON requirement_type.id = local_requirement.requirement_type_id
        LEFT JOIN risk_levels risk_level
          ON risk_level.id = local_requirement.risk_level_id
        WHERE local_requirement.package_id = @0
        ORDER BY local_requirement.unique_id
      `,
      [packageId],
    ) as Promise<Row[]>,
  ])

  return [
    ...(libraryRows as unknown as LibraryPackageItemFlatRow[]).map(
      mapLibraryPackageItemRow,
    ),
    ...(localRows as unknown as PackageLocalListFlatRow[]).map(
      mapPackageLocalRequirementListRow,
    ),
  ].sort((left, right) => left.uniqueId.localeCompare(right.uniqueId, 'sv'))
}

// ─── Item lookup & updates ───────────────────────────────────────────────────

export async function getPackageItemById(
  db: SqlServerDatabase,
  itemId: number,
) {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        package_item.id AS id,
        package_item.requirement_package_id AS packageId,
        package_item.requirement_id AS requirementId,
        package_item.requirement_version_id AS requirementVersionId,
        package_item.needs_reference_id AS needsReferenceId,
        package_item.package_item_status_id AS packageItemStatusId,
        package_item.note AS note,
        package_item.status_updated_at AS statusUpdatedAt,
        package_item.created_at AS createdAt
      FROM requirement_package_items package_item
      WHERE package_item.id = @0
    `,
    [itemId],
  )) as Row[]

  const row = rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    packageId: Number(row.packageId),
    requirementId: Number(row.requirementId),
    requirementVersionId: Number(row.requirementVersionId),
    needsReferenceId: toNum(row.needsReferenceId),
    packageItemStatusId: toNum(row.packageItemStatusId),
    note: toStr(row.note),
    statusUpdatedAt: toIso(row.statusUpdatedAt),
    createdAt: toIso(row.createdAt) ?? '',
  }
}

export async function getPackageItemByRef(
  db: SqlServerDatabase,
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

async function validatePackageItemStatus(
  db: SqlExecutor,
  statusId: number,
): Promise<void> {
  const rows = (await db.query(
    `
      SELECT TOP (1) package_item_status.id AS id
      FROM package_item_statuses package_item_status
      WHERE package_item_status.id = @0
    `,
    [statusId],
  )) as Array<{ id: number }>

  if (!rows[0]) {
    throw validationError('Invalid package item status ID', {
      packageItemStatusId: statusId,
    })
  }
}

export async function updatePackageItemFields(
  db: SqlServerDatabase,
  itemId: number,
  data: { packageItemStatusId?: number | null; note?: string | null },
): Promise<void> {
  const setClauses: string[] = []
  const params: unknown[] = []
  let nextStatusId: number | null | undefined

  if ('packageItemStatusId' in data) {
    nextStatusId = data.packageItemStatusId ?? null
    if (nextStatusId != null) {
      await validatePackageItemStatus(db, nextStatusId)
    }
    setClauses.push(`package_item_status_id = @${params.length}`)
    params.push(nextStatusId)
    setClauses.push(`status_updated_at = @${params.length}`)
    params.push(new Date().toISOString())
  }

  if ('note' in data) {
    setClauses.push(`note = @${params.length}`)
    params.push(data.note ?? null)
  }

  if (setClauses.length === 0) return

  if (nextStatusId === DEVIATED_PACKAGE_ITEM_STATUS_ID) {
    const approvedDeviationRows = (await db.query(
      `
        SELECT TOP (1) deviation.id AS id
        FROM deviations deviation
        WHERE deviation.package_item_id = @0 AND deviation.decision = @1
      `,
      [itemId, DEVIATION_APPROVED],
    )) as Array<{ id: number }>

    if (!approvedDeviationRows[0]) {
      throw validationError('Deviated status requires an approved deviation', {
        packageItemStatusId: nextStatusId,
        itemId,
      })
    }
  }

  const idPlaceholder = `@${params.length}`
  params.push(itemId)

  await db.query(
    `
      UPDATE requirement_package_items
      SET ${setClauses.join(', ')}
      WHERE id = ${idPlaceholder}
    `,
    params,
  )
}

export async function updatePackageLocalRequirementFields(
  db: SqlServerDatabase,
  packageLocalRequirementId: number,
  data: { packageItemStatusId?: number | null; note?: string | null },
): Promise<void> {
  const setClauses: string[] = []
  const params: unknown[] = []
  let nextStatusId: number | null | undefined

  if ('packageItemStatusId' in data) {
    nextStatusId = data.packageItemStatusId ?? null
    if (nextStatusId != null) {
      await validatePackageItemStatus(db, nextStatusId)
    }
    setClauses.push(`package_item_status_id = @${params.length}`)
    params.push(nextStatusId)
    setClauses.push(`status_updated_at = @${params.length}`)
    params.push(new Date().toISOString())
  }

  if ('note' in data) {
    setClauses.push(`note = @${params.length}`)
    params.push(data.note ?? null)
  }

  if (setClauses.length === 0) return

  if (nextStatusId === DEVIATED_PACKAGE_ITEM_STATUS_ID) {
    const approvedDeviationRows = (await db.query(
      `
        SELECT TOP (1) deviation.id AS id
        FROM package_local_requirement_deviations deviation
        WHERE deviation.package_local_requirement_id = @0
          AND deviation.decision = @1
      `,
      [packageLocalRequirementId, DEVIATION_APPROVED],
    )) as Array<{ id: number }>

    if (!approvedDeviationRows[0]) {
      throw validationError('Deviated status requires an approved deviation', {
        packageItemStatusId: nextStatusId,
        packageLocalRequirementId,
      })
    }
  }

  const idPlaceholder = `@${params.length}`
  params.push(packageLocalRequirementId)

  await db.query(
    `
      UPDATE package_local_requirements
      SET ${setClauses.join(', ')}
      WHERE id = ${idPlaceholder}
    `,
    params,
  )
}

export async function updatePackageItemFieldsByItemRef(
  db: SqlServerDatabase,
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

// ─── Bulk delete by refs ─────────────────────────────────────────────────────

async function deleteLibraryPackageItemsByIds(
  db: SqlExecutor,
  packageId: number,
  libraryIds: number[],
): Promise<number> {
  if (libraryIds.length === 0) return 0
  const placeholders = libraryIds.map((_, index) => `@${index + 1}`).join(', ')
  const rows = (await db.query(
    `
      DELETE FROM requirement_package_items
      OUTPUT DELETED.id AS id
      WHERE requirement_package_id = @0 AND id IN (${placeholders})
    `,
    [packageId, ...libraryIds],
  )) as Array<{ id: number }>
  return rows.length
}

async function deletePackageLocalRequirementsByIds(
  db: SqlExecutor,
  packageId: number,
  packageLocalRequirementIds: number[],
): Promise<number> {
  if (packageLocalRequirementIds.length === 0) return 0
  const placeholders = packageLocalRequirementIds
    .map((_, index) => `@${index + 1}`)
    .join(', ')
  const rows = (await db.query(
    `
      DELETE FROM package_local_requirements
      OUTPUT DELETED.id AS id
      WHERE package_id = @0 AND id IN (${placeholders})
    `,
    [packageId, ...packageLocalRequirementIds],
  )) as Array<{ id: number }>
  return rows.length
}

export async function deletePackageItemsByRefs(
  db: SqlServerDatabase,
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

  if (libraryIds.length === 0 || packageLocalRequirementIds.length === 0) {
    const deletedLibraryCount = await deleteLibraryPackageItemsByIds(
      db,
      packageId,
      libraryIds,
    )
    const deletedPackageLocalCount = await deletePackageLocalRequirementsByIds(
      db,
      packageId,
      packageLocalRequirementIds,
    )
    return { deletedLibraryCount, deletedPackageLocalCount }
  }

  return db.transaction(async (manager: SqlExecutor) => {
    const deletedLibraryCount = await deleteLibraryPackageItemsByIds(
      manager,
      packageId,
      libraryIds,
    )
    const deletedPackageLocalCount = await deletePackageLocalRequirementsByIds(
      manager,
      packageId,
      packageLocalRequirementIds,
    )
    return { deletedLibraryCount, deletedPackageLocalCount }
  })
}

// Re-export buildInClause-style helper to satisfy unused lint if any
void buildInClause
