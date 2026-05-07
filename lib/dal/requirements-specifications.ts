import { STATUS_PUBLISHED } from '@/lib/dal/requirements'
import type { SqlServerDatabase } from '@/lib/db'
import { notFoundError, validationError } from '@/lib/requirements/errors'
import type { RequirementRow } from '@/lib/requirements/list-view'
import {
  DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
  DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
} from '@/lib/specification-item-status-constants'

const DEVIATION_APPROVED = 1

interface SqlExecutor {
  query: (sql: string, parameters?: unknown[]) => Promise<unknown>
}

type Row = Record<string, unknown>

interface RequirementsSpecificationLinkItem {
  requirementId: number
  requirementVersionId: number
}

export type SpecificationItemKind = 'library' | 'specificationLocal'
export type SpecificationItemRef = `lib:${number}` | `local:${number}`

interface SpecificationLocalRequirementMutationInput {
  acceptanceCriteria?: string | null
  description: string
  needsReferenceId?: number | null
  normReferenceIds?: number[]
  qualityCharacteristicId?: number | null
  requirementAreaId?: number | null
  requirementCategoryId?: number | null
  requirementPackageIds?: number[]
  requirementTypeId?: number | null
  requiresTesting?: boolean
  riskLevelId?: number | null
  verificationMethod?: string | null
}

export interface SpecificationLocalRequirementDetail {
  acceptanceCriteria: string | null
  createdAt: string
  description: string
  id: number
  isSpecificationLocal: true
  itemRef: SpecificationItemRef
  kind: 'specificationLocal'
  needsReference: string | null
  needsReferenceId: number | null
  normReferences: {
    id: number
    name: string
    normReferenceId: string
    uri: string | null
  }[]
  qualityCharacteristic: { id: number; nameEn: string; nameSv: string } | null
  requirementArea: { id: number; name: string } | null
  requirementCategory: { id: number; nameEn: string; nameSv: string } | null
  requirementPackages: {
    id: number
    nameEn: string | null
    nameSv: string | null
  }[]
  requirementType: { id: number; nameEn: string; nameSv: string } | null
  requiresTesting: boolean
  riskLevel: {
    color: string
    id: number
    nameEn: string
    nameSv: string
    sortOrder: number
  } | null
  specificationId: number
  specificationItemStatusColor: string | null
  specificationItemStatusDescriptionEn: string | null
  specificationItemStatusDescriptionSv: string | null
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
  uniqueId: string
  updatedAt: string
  verificationMethod: string | null
}

interface SpecificationLocalRequirementIdentity {
  id: number
  sequenceNumber: number
  specificationId: number
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

export function createLibraryItemRef(
  specificationItemId: number,
): SpecificationItemRef {
  return `lib:${specificationItemId}`
}

export function createSpecificationLocalItemRef(
  specificationLocalRequirementId: number,
): SpecificationItemRef {
  return `local:${specificationLocalRequirementId}`
}

export function parseSpecificationItemRef(
  value: string,
):
  | { kind: 'library'; id: number }
  | { kind: 'specificationLocal'; id: number }
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
    kind: match[1] === 'local' ? 'specificationLocal' : 'library',
  }
}

function createSpecificationLocalRowId(
  specificationLocalRequirementId: number,
): number {
  return specificationLocalRequirementId * -1
}

function formatSpecificationLocalRequirementUniqueId(
  sequenceNumber: number,
): string {
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

// ─── Specifications ──────────────────────────────────────────────────────────

export async function listSpecifications(db: SqlServerDatabase) {
  const rows = (await db.query(
    `
      SELECT
        specification_record.id AS id,
        specification_record.unique_id AS uniqueId,
        specification_record.name AS name,
        specification_record.specification_responsibility_area_id AS specificationResponsibilityAreaId,
        specification_record.specification_implementation_type_id AS specificationImplementationTypeId,
        specification_record.specification_lifecycle_status_id AS specificationLifecycleStatusId,
        specification_record.business_needs_reference AS businessNeedsReference,
        specification_record.created_at AS createdAt,
        specification_record.updated_at AS updatedAt,
        responsibility_area.name_sv AS responsibilityAreaNameSv,
        responsibility_area.name_en AS responsibilityAreaNameEn,
        implementation_type.name_sv AS implementationTypeNameSv,
        implementation_type.name_en AS implementationTypeNameEn,
        lifecycle_status.name_sv AS lifecycleStatusNameSv,
        lifecycle_status.name_en AS lifecycleStatusNameEn
      FROM requirements_specifications specification_record
      LEFT JOIN specification_responsibility_areas responsibility_area
        ON responsibility_area.id = specification_record.specification_responsibility_area_id
      LEFT JOIN specification_implementation_types implementation_type
        ON implementation_type.id = specification_record.specification_implementation_type_id
      LEFT JOIN specification_lifecycle_statuses lifecycle_status
        ON lifecycle_status.id = specification_record.specification_lifecycle_status_id
      ORDER BY specification_record.name
    `,
  )) as Row[]

  const [libraryCounts, localCounts, libraryAreas, localAreas] =
    await Promise.all([
      db.query(
        `
          SELECT requirements_specification_id AS specificationId, COUNT(*) AS count
          FROM requirements_specification_items
          GROUP BY requirements_specification_id
        `,
      ) as Promise<Row[]>,
      db.query(
        `
          SELECT specification_id AS specificationId, COUNT(*) AS count
          FROM specification_local_requirements
          GROUP BY specification_id
        `,
      ) as Promise<Row[]>,
      db.query(
        `
          SELECT
            specification_item.requirements_specification_id AS specificationId,
            requirement_area.id AS areaId,
            requirement_area.name AS areaName
          FROM requirements_specification_items specification_item
          INNER JOIN requirements requirement
            ON requirement.id = specification_item.requirement_id
          INNER JOIN requirement_areas requirement_area
            ON requirement_area.id = requirement.requirement_area_id
          GROUP BY specification_item.requirements_specification_id, requirement_area.id, requirement_area.name
        `,
      ) as Promise<Row[]>,
      db.query(
        `
          SELECT
            local_requirement.specification_id AS specificationId,
            requirement_area.id AS areaId,
            requirement_area.name AS areaName
          FROM specification_local_requirements local_requirement
          INNER JOIN requirement_areas requirement_area
            ON requirement_area.id = local_requirement.requirement_area_id
          GROUP BY local_requirement.specification_id, requirement_area.id, requirement_area.name
        `,
      ) as Promise<Row[]>,
    ])

  const itemCounts = new Map<number, number>()
  for (const row of [...libraryCounts, ...localCounts]) {
    const specificationId = Number(row.specificationId)
    const count = Number(row.count) || 0
    itemCounts.set(
      specificationId,
      (itemCounts.get(specificationId) ?? 0) + count,
    )
  }

  const requirementAreasBySpecification = new Map<number, Map<number, string>>()
  for (const row of [...libraryAreas, ...localAreas]) {
    const specificationId = Number(row.specificationId)
    const areaId = Number(row.areaId)
    const areaName = String(row.areaName ?? '')
    const existing =
      requirementAreasBySpecification.get(specificationId) ?? new Map()
    existing.set(areaId, areaName)
    requirementAreasBySpecification.set(specificationId, existing)
  }

  return rows.map(row => {
    const id = Number(row.id)
    const specificationResponsibilityAreaId = toNum(
      row.specificationResponsibilityAreaId,
    )
    const specificationImplementationTypeId = toNum(
      row.specificationImplementationTypeId,
    )
    const specificationLifecycleStatusId = toNum(
      row.specificationLifecycleStatusId,
    )

    const requirementAreas = [
      ...(requirementAreasBySpecification.get(id)?.entries() ?? []),
    ]
      .map(([areaId, name]) => ({ id: areaId, name }))
      .sort((left, right) => left.name.localeCompare(right.name, 'sv'))

    return {
      id,
      uniqueId: String(row.uniqueId),
      name: String(row.name),
      specificationResponsibilityAreaId,
      specificationImplementationTypeId,
      specificationLifecycleStatusId,
      businessNeedsReference: toStr(row.businessNeedsReference),
      createdAt: toIso(row.createdAt) ?? '',
      updatedAt: toIso(row.updatedAt) ?? '',
      responsibilityArea:
        row.responsibilityAreaNameSv &&
        specificationResponsibilityAreaId != null
          ? {
              id: specificationResponsibilityAreaId,
              nameSv: String(row.responsibilityAreaNameSv),
              nameEn: row.responsibilityAreaNameEn
                ? String(row.responsibilityAreaNameEn)
                : '',
            }
          : null,
      implementationType:
        row.implementationTypeNameSv &&
        specificationImplementationTypeId != null
          ? {
              id: specificationImplementationTypeId,
              nameSv: String(row.implementationTypeNameSv),
              nameEn: row.implementationTypeNameEn
                ? String(row.implementationTypeNameEn)
                : '',
            }
          : null,
      lifecycleStatus:
        row.lifecycleStatusNameSv && specificationLifecycleStatusId != null
          ? {
              id: specificationLifecycleStatusId,
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

interface SpecificationRecord {
  businessNeedsReference: string | null
  createdAt: string
  id: number
  implementationType: { id: number; nameSv: string; nameEn: string } | null
  lifecycleStatus: { id: number; nameSv: string; nameEn: string } | null
  name: string
  responsibilityArea: { id: number; nameSv: string; nameEn: string } | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  specificationResponsibilityAreaId: number | null
  uniqueId: string
  updatedAt: string
}

function mapSpecificationRow(row: Row | undefined): SpecificationRecord | null {
  if (!row) return null
  const specificationResponsibilityAreaId = toNum(
    row.specificationResponsibilityAreaId,
  )
  const specificationImplementationTypeId = toNum(
    row.specificationImplementationTypeId,
  )
  const specificationLifecycleStatusId = toNum(
    row.specificationLifecycleStatusId,
  )
  return {
    id: Number(row.id),
    uniqueId: String(row.uniqueId),
    name: String(row.name),
    specificationResponsibilityAreaId,
    specificationImplementationTypeId,
    specificationLifecycleStatusId,
    businessNeedsReference: toStr(row.businessNeedsReference),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
    responsibilityArea:
      row.responsibilityAreaNameSv && specificationResponsibilityAreaId != null
        ? {
            id: specificationResponsibilityAreaId,
            nameSv: String(row.responsibilityAreaNameSv),
            nameEn: row.responsibilityAreaNameEn
              ? String(row.responsibilityAreaNameEn)
              : '',
          }
        : null,
    implementationType:
      row.implementationTypeNameSv && specificationImplementationTypeId != null
        ? {
            id: specificationImplementationTypeId,
            nameSv: String(row.implementationTypeNameSv),
            nameEn: row.implementationTypeNameEn
              ? String(row.implementationTypeNameEn)
              : '',
          }
        : null,
    lifecycleStatus:
      row.lifecycleStatusNameSv && specificationLifecycleStatusId != null
        ? {
            id: specificationLifecycleStatusId,
            nameSv: String(row.lifecycleStatusNameSv),
            nameEn: row.lifecycleStatusNameEn
              ? String(row.lifecycleStatusNameEn)
              : '',
          }
        : null,
  }
}

const SPECIFICATION_SELECT_WITH_JOINS = `
  SELECT TOP (1)
    specification_record.id AS id,
    specification_record.unique_id AS uniqueId,
    specification_record.name AS name,
    specification_record.specification_responsibility_area_id AS specificationResponsibilityAreaId,
    specification_record.specification_implementation_type_id AS specificationImplementationTypeId,
    specification_record.specification_lifecycle_status_id AS specificationLifecycleStatusId,
    specification_record.business_needs_reference AS businessNeedsReference,
    specification_record.created_at AS createdAt,
    specification_record.updated_at AS updatedAt,
    responsibility_area.name_sv AS responsibilityAreaNameSv,
    responsibility_area.name_en AS responsibilityAreaNameEn,
    implementation_type.name_sv AS implementationTypeNameSv,
    implementation_type.name_en AS implementationTypeNameEn,
    lifecycle_status.name_sv AS lifecycleStatusNameSv,
    lifecycle_status.name_en AS lifecycleStatusNameEn
  FROM requirements_specifications specification_record
  LEFT JOIN specification_responsibility_areas responsibility_area
    ON responsibility_area.id = specification_record.specification_responsibility_area_id
  LEFT JOIN specification_implementation_types implementation_type
    ON implementation_type.id = specification_record.specification_implementation_type_id
  LEFT JOIN specification_lifecycle_statuses lifecycle_status
    ON lifecycle_status.id = specification_record.specification_lifecycle_status_id
`

export async function getSpecificationById(db: SqlServerDatabase, id: number) {
  const rows = (await db.query(
    `${SPECIFICATION_SELECT_WITH_JOINS} WHERE specification_record.id = @0`,
    [id],
  )) as Row[]
  return mapSpecificationRow(rows[0])
}

export async function getSpecificationBySlug(
  db: SqlServerDatabase,
  slug: string,
) {
  const rows = (await db.query(
    `${SPECIFICATION_SELECT_WITH_JOINS} WHERE specification_record.unique_id = @0`,
    [slug],
  )) as Row[]
  return mapSpecificationRow(rows[0])
}

export async function isSlugTaken(
  db: SqlServerDatabase,
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const rows = (await db.query(
    `SELECT TOP (1) id AS id FROM requirements_specifications WHERE unique_id = @0`,
    [slug],
  )) as Array<{ id: number }>
  if (rows.length === 0) return false
  if (excludeId !== undefined) return Number(rows[0].id) !== excludeId
  return true
}

export async function createSpecification(
  db: SqlServerDatabase,
  data: {
    uniqueId: string
    name: string
    specificationResponsibilityAreaId?: number | null
    specificationImplementationTypeId?: number | null
    specificationLifecycleStatusId?: number | null
    businessNeedsReference?: string | null
  },
) {
  const now = new Date()
  const rows = (await db.query(
    `
      INSERT INTO requirements_specifications (
        unique_id,
        name,
        specification_responsibility_area_id,
        specification_implementation_type_id,
        specification_lifecycle_status_id,
        business_needs_reference,
        created_at,
        updated_at
      )
      OUTPUT
        INSERTED.id AS id,
        INSERTED.unique_id AS uniqueId,
        INSERTED.name AS name,
        INSERTED.specification_responsibility_area_id AS specificationResponsibilityAreaId,
        INSERTED.specification_implementation_type_id AS specificationImplementationTypeId,
        INSERTED.specification_lifecycle_status_id AS specificationLifecycleStatusId,
        INSERTED.business_needs_reference AS businessNeedsReference,
        INSERTED.created_at AS createdAt,
        INSERTED.updated_at AS updatedAt
      VALUES (@0, @1, @2, @3, @4, @5, @6, @6)
    `,
    [
      data.uniqueId,
      data.name,
      data.specificationResponsibilityAreaId ?? null,
      data.specificationImplementationTypeId ?? null,
      data.specificationLifecycleStatusId ?? null,
      data.businessNeedsReference ?? null,
      now,
    ],
  )) as Row[]

  const row = rows[0]
  if (!row) {
    throw new Error('Failed to create requirements specification')
  }
  return {
    id: Number(row.id),
    uniqueId: String(row.uniqueId),
    name: String(row.name),
    specificationResponsibilityAreaId: toNum(
      row.specificationResponsibilityAreaId,
    ),
    specificationImplementationTypeId: toNum(
      row.specificationImplementationTypeId,
    ),
    specificationLifecycleStatusId: toNum(row.specificationLifecycleStatusId),
    businessNeedsReference: toStr(row.businessNeedsReference),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
  }
}

export async function updateSpecification(
  db: SqlServerDatabase,
  id: number,
  data: {
    uniqueId?: string
    name?: string
    specificationResponsibilityAreaId?: number | null
    specificationImplementationTypeId?: number | null
    specificationLifecycleStatusId?: number | null
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
  if ('specificationResponsibilityAreaId' in data) {
    setClauses.push(`specification_responsibility_area_id = @${params.length}`)
    params.push(data.specificationResponsibilityAreaId ?? null)
  }
  if ('specificationImplementationTypeId' in data) {
    setClauses.push(`specification_implementation_type_id = @${params.length}`)
    params.push(data.specificationImplementationTypeId ?? null)
  }
  if ('specificationLifecycleStatusId' in data) {
    setClauses.push(`specification_lifecycle_status_id = @${params.length}`)
    params.push(data.specificationLifecycleStatusId ?? null)
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
      UPDATE requirements_specifications
      SET ${setClauses.join(', ')}
      OUTPUT
        INSERTED.id AS id,
        INSERTED.unique_id AS uniqueId,
        INSERTED.name AS name,
        INSERTED.specification_responsibility_area_id AS specificationResponsibilityAreaId,
        INSERTED.specification_implementation_type_id AS specificationImplementationTypeId,
        INSERTED.specification_lifecycle_status_id AS specificationLifecycleStatusId,
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
    specificationResponsibilityAreaId: toNum(
      row.specificationResponsibilityAreaId,
    ),
    specificationImplementationTypeId: toNum(
      row.specificationImplementationTypeId,
    ),
    specificationLifecycleStatusId: toNum(row.specificationLifecycleStatusId),
    businessNeedsReference: toStr(row.businessNeedsReference),
    createdAt: toIso(row.createdAt) ?? '',
    updatedAt: toIso(row.updatedAt) ?? '',
  }
}

export async function deleteSpecification(db: SqlServerDatabase, id: number) {
  await db.transaction(async (manager: SqlExecutor) => {
    await manager.query(
      `DELETE FROM specification_local_requirements WHERE specification_id = @0`,
      [id],
    )
    await manager.query(
      `DELETE FROM requirements_specification_items WHERE requirements_specification_id = @0`,
      [id],
    )
    await manager.query(
      `DELETE FROM specification_needs_references WHERE specification_id = @0`,
      [id],
    )
    await manager.query(
      `DELETE FROM requirements_specifications WHERE id = @0`,
      [id],
    )
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

async function resolveRequirementsSpecificationLinkItems(
  db: SqlExecutor,
  requirementIds: number[],
): Promise<RequirementsSpecificationLinkItem[]> {
  const items: RequirementsSpecificationLinkItem[] = []

  for (const requirementId of requirementIds) {
    const requirementVersionId = await getPublishedVersionIdForRequirement(
      db,
      requirementId,
    )
    if (requirementVersionId == null) {
      throw validationError(
        `Requirement ${requirementId} has no published version and cannot be added to a specification`,
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

// ─── Specification needs references ────────────────────────────────────────────────

export async function listSpecificationNeedsReferences(
  db: SqlServerDatabase,
  specificationId: number,
): Promise<{ id: number; text: string }[]> {
  const rows = (await db.query(
    `
      SELECT needs_reference.id AS id, needs_reference.text AS text
      FROM specification_needs_references needs_reference
      WHERE needs_reference.specification_id = @0
      ORDER BY needs_reference.text
    `,
    [specificationId],
  )) as Row[]
  return rows.map(row => ({
    id: Number(row.id),
    text: String(row.text ?? ''),
  }))
}

export async function getSpecificationNeedsReferenceById(
  db: SqlExecutor,
  specificationId: number,
  id: number,
): Promise<{ id: number } | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1) needs_reference.id AS id
      FROM specification_needs_references needs_reference
      WHERE needs_reference.id = @0 AND needs_reference.specification_id = @1
    `,
    [id, specificationId],
  )) as Array<{ id: number }>
  return rows[0] ? { id: Number(rows[0].id) } : null
}

async function getOrCreateSpecificationNeedsReferenceWithMetadata(
  db: SqlExecutor,
  specificationId: number,
  text: string,
): Promise<{ created: boolean; id: number }> {
  const normalizedText = text.trim()
  const insertedRows = (await db.query(
    `
      INSERT INTO specification_needs_references (specification_id, text, created_at)
      OUTPUT INSERTED.id AS id
      SELECT @0, @1, @2
      WHERE NOT EXISTS (
        SELECT 1 FROM specification_needs_references
        WHERE specification_id = @0 AND text = @1
      )
    `,
    [specificationId, normalizedText, new Date()],
  )) as Array<{ id: number }>

  if (insertedRows[0]) {
    return { created: true, id: Number(insertedRows[0].id) }
  }

  const existingRows = (await db.query(
    `
      SELECT TOP (1) id AS id
      FROM specification_needs_references
      WHERE specification_id = @0 AND text = @1
    `,
    [specificationId, normalizedText],
  )) as Array<{ id: number }>

  if (!existingRows[0]) {
    throw new Error('Failed to resolve specification needs reference')
  }
  return { created: false, id: Number(existingRows[0].id) }
}

export async function getOrCreateSpecificationNeedsReference(
  db: SqlServerDatabase,
  specificationId: number,
  text: string,
): Promise<number> {
  const { id } = await getOrCreateSpecificationNeedsReferenceWithMetadata(
    db,
    specificationId,
    text,
  )
  return id
}

async function resolveExistingSpecificationNeedsReferenceForLinking(
  db: SqlExecutor,
  specificationId: number,
  needsReferenceId: number,
): Promise<number> {
  const existingNeedsReference = await getSpecificationNeedsReferenceById(
    db,
    specificationId,
    needsReferenceId,
  )
  if (!existingNeedsReference) {
    throw validationError(
      'needsReferenceId does not belong to this requirements specification',
    )
  }

  return existingNeedsReference.id
}

// ─── Specification-local requirements ──────────────────────────────────────────────

function normalizeOptionalForeignKeyId(value: number | null | undefined) {
  if (value == null) {
    return null
  }

  if (!Number.isInteger(value) || value < 1) {
    throw validationError('Expected a positive integer ID')
  }

  return value
}

async function normalizeSpecificationLocalRequirementInput(
  db: SqlExecutor,
  specificationId: number,
  data: SpecificationLocalRequirementMutationInput,
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
    const needsReference = await getSpecificationNeedsReferenceById(
      db,
      specificationId,
      needsReferenceId,
    )
    if (!needsReference) {
      throw validationError(
        'needsReferenceId does not belong to this requirements specification',
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
    requirementPackageIds: dedupePositiveIntegerIds(data.requirementPackageIds),
    verificationMethod,
  }
}

async function getSpecificationLocalRequirementIdentity(
  db: SqlExecutor,
  specificationId: number,
  specificationLocalRequirementId: number,
): Promise<SpecificationLocalRequirementIdentity | null> {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        local_requirement.id AS id,
        local_requirement.specification_id AS specificationId,
        local_requirement.sequence_number AS sequenceNumber,
        local_requirement.unique_id AS uniqueId
      FROM specification_local_requirements local_requirement
      WHERE local_requirement.id = @0 AND local_requirement.specification_id = @1
    `,
    [specificationLocalRequirementId, specificationId],
  )) as Row[]

  const row = rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    specificationId: Number(row.specificationId),
    sequenceNumber: Number(row.sequenceNumber),
    uniqueId: String(row.uniqueId),
  }
}

const LOCAL_REQUIREMENT_DETAIL_SELECT = `
  SELECT TOP (1)
    local_requirement.id AS id,
    local_requirement.specification_id AS specificationId,
    local_requirement.unique_id AS uniqueId,
    local_requirement.description AS description,
    local_requirement.acceptance_criteria AS acceptanceCriteria,
    local_requirement.is_testing_required AS requiresTesting,
    local_requirement.verification_method AS verificationMethod,
    local_requirement.created_at AS createdAt,
    local_requirement.updated_at AS updatedAt,
    local_requirement.needs_reference_id AS needsReferenceId,
    needs_reference.text AS needsReference,
    local_requirement.specification_item_status_id AS specificationItemStatusId,
    specification_item_status.color AS specificationItemStatusColor,
    specification_item_status.description_en AS specificationItemStatusDescriptionEn,
    specification_item_status.description_sv AS specificationItemStatusDescriptionSv,
    specification_item_status.name_en AS specificationItemStatusNameEn,
    specification_item_status.name_sv AS specificationItemStatusNameSv,
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
  FROM specification_local_requirements local_requirement
  LEFT JOIN specification_needs_references needs_reference
    ON needs_reference.id = local_requirement.needs_reference_id
  LEFT JOIN specification_item_statuses specification_item_status
    ON specification_item_status.id = local_requirement.specification_item_status_id
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

function mapSpecificationLocalRequirementDetailFlat(
  row: Row,
  normReferenceRows: Row[],
  requirementPackageRows: Row[],
): SpecificationLocalRequirementDetail {
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
  const sortedRequirementPackages = [...requirementPackageRows]
    .map(requirementPackage => ({
      id: Number(requirementPackage.id),
      nameEn:
        requirementPackage.nameEn == null
          ? null
          : String(requirementPackage.nameEn),
      nameSv:
        requirementPackage.nameSv == null
          ? null
          : String(requirementPackage.nameSv),
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
    isSpecificationLocal: true,
    itemRef: createSpecificationLocalItemRef(id),
    kind: 'specificationLocal',
    needsReference: toStr(row.needsReference),
    needsReferenceId: toNum(row.needsReferenceId),
    normReferences: sortedNormReferences,
    specificationId: Number(row.specificationId),
    specificationItemStatusColor: toStr(row.specificationItemStatusColor),
    specificationItemStatusDescriptionEn: toStr(
      row.specificationItemStatusDescriptionEn,
    ),
    specificationItemStatusDescriptionSv: toStr(
      row.specificationItemStatusDescriptionSv,
    ),
    specificationItemStatusId: toNum(row.specificationItemStatusId),
    specificationItemStatusNameEn: toStr(row.specificationItemStatusNameEn),
    specificationItemStatusNameSv: toStr(row.specificationItemStatusNameSv),
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
    requirementPackages: sortedRequirementPackages,
    uniqueId: String(row.uniqueId),
    updatedAt: toIso(row.updatedAt) ?? '',
    verificationMethod: toStr(row.verificationMethod),
  }
}

export async function getSpecificationLocalRequirementDetail(
  db: SqlServerDatabase,
  specificationId: number,
  specificationLocalRequirementId: number,
): Promise<SpecificationLocalRequirementDetail | null> {
  const mainRows = (await db.query(
    `${LOCAL_REQUIREMENT_DETAIL_SELECT}
     WHERE local_requirement.id = @0 AND local_requirement.specification_id = @1`,
    [specificationLocalRequirementId, specificationId],
  )) as Row[]

  const mainRow = mainRows[0]
  if (!mainRow) {
    return null
  }

  const [normReferenceRows, requirementPackageRows] = await Promise.all([
    db.query(
      `
        SELECT
          norm_reference.id AS id,
          norm_reference.name AS name,
          norm_reference.norm_reference_id AS normReferenceId,
          norm_reference.uri AS uri
        FROM specification_local_requirement_norm_references link
        INNER JOIN norm_references norm_reference
          ON norm_reference.id = link.norm_reference_id
        WHERE link.specification_local_requirement_id = @0
      `,
      [specificationLocalRequirementId],
    ) as Promise<Row[]>,
    db.query(
      `
        SELECT
          requirement_package.id AS id,
          requirement_package.name_en AS nameEn,
          requirement_package.name_sv AS nameSv
        FROM specification_local_requirement_requirement_packages link
        INNER JOIN requirement_packages requirement_package
          ON requirement_package.id = link.requirement_package_id
        WHERE link.specification_local_requirement_id = @0
      `,
      [specificationLocalRequirementId],
    ) as Promise<Row[]>,
  ])

  return mapSpecificationLocalRequirementDetailFlat(
    mainRow,
    normReferenceRows,
    requirementPackageRows,
  )
}

async function insertSpecificationLocalRequirementJoins(
  manager: SqlExecutor,
  specificationLocalRequirementId: number,
  {
    normReferenceIds,
    requirementPackageIds,
  }: {
    normReferenceIds: number[]
    requirementPackageIds: number[]
  },
) {
  if (requirementPackageIds.length > 0) {
    const valuesSql = requirementPackageIds
      .map((_, index) => `(@0, @${index + 1})`)
      .join(', ')
    await manager.query(
      `
        INSERT INTO specification_local_requirement_requirement_packages
          (specification_local_requirement_id, requirement_package_id)
        VALUES ${valuesSql}
      `,
      [specificationLocalRequirementId, ...requirementPackageIds],
    )
  }

  if (normReferenceIds.length > 0) {
    const valuesSql = normReferenceIds
      .map((_, index) => `(@0, @${index + 1})`)
      .join(', ')
    await manager.query(
      `
        INSERT INTO specification_local_requirement_norm_references
          (specification_local_requirement_id, norm_reference_id)
        VALUES ${valuesSql}
      `,
      [specificationLocalRequirementId, ...normReferenceIds],
    )
  }
}

export async function createSpecificationLocalRequirement(
  db: SqlServerDatabase,
  specificationId: number,
  data: SpecificationLocalRequirementMutationInput,
) {
  const normalized = await normalizeSpecificationLocalRequirementInput(
    db,
    specificationId,
    data,
  )

  const createdId = await db.transaction(async (manager: SqlExecutor) => {
    const sequenceRows = (await manager.query(
      `
        UPDATE requirements_specifications
        SET local_requirement_next_sequence = local_requirement_next_sequence + 1
        OUTPUT INSERTED.local_requirement_next_sequence AS nextSequence
        WHERE id = @0
      `,
      [specificationId],
    )) as Array<{ nextSequence: number }>

    const sequenceRow = sequenceRows[0]
    if (!sequenceRow) {
      throw notFoundError(
        `Requirement specification ${specificationId} not found`,
      )
    }

    const sequenceNumber = Math.max(1, Number(sequenceRow.nextSequence) - 1)
    const uniqueId = formatSpecificationLocalRequirementUniqueId(sequenceNumber)
    const now = new Date()

    const insertedRows = (await manager.query(
      `
        INSERT INTO specification_local_requirements (
          specification_id,
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
          specification_item_status_id,
          created_at,
          updated_at
        )
        OUTPUT INSERTED.id AS id
        VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @8, @9, @10, @11, @12, @13, @14, @14)
      `,
      [
        specificationId,
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
        DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
        now,
      ],
    )) as Array<{ id: number }>

    const insertedRow = insertedRows[0]
    if (!insertedRow) {
      throw new Error('Failed to insert specification-local requirement')
    }

    await insertSpecificationLocalRequirementJoins(
      manager,
      Number(insertedRow.id),
      normalized,
    )

    return Number(insertedRow.id)
  })

  const created = await getSpecificationLocalRequirementDetail(
    db,
    specificationId,
    createdId,
  )
  if (!created) {
    throw notFoundError(
      'Specification-local requirement was created but not found',
    )
  }
  return created
}

export async function updateSpecificationLocalRequirement(
  db: SqlServerDatabase,
  specificationId: number,
  specificationLocalRequirementId: number,
  data: SpecificationLocalRequirementMutationInput,
) {
  const existing = await getSpecificationLocalRequirementIdentity(
    db,
    specificationId,
    specificationLocalRequirementId,
  )
  if (!existing) {
    throw notFoundError('Specification-local requirement not found')
  }

  const normalized = await normalizeSpecificationLocalRequirementInput(
    db,
    specificationId,
    data,
  )
  const updatedAt = new Date()

  await db.transaction(async (manager: SqlExecutor) => {
    await manager.query(
      `
        UPDATE specification_local_requirements
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
        WHERE id = @11 AND specification_id = @12
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
        specificationLocalRequirementId,
        specificationId,
      ],
    )

    await manager.query(
      `
        DELETE FROM specification_local_requirement_requirement_packages
        WHERE specification_local_requirement_id = @0
      `,
      [specificationLocalRequirementId],
    )

    await manager.query(
      `
        DELETE FROM specification_local_requirement_norm_references
        WHERE specification_local_requirement_id = @0
      `,
      [specificationLocalRequirementId],
    )

    await insertSpecificationLocalRequirementJoins(
      manager,
      specificationLocalRequirementId,
      normalized,
    )
  })

  const updated = await getSpecificationLocalRequirementDetail(
    db,
    specificationId,
    specificationLocalRequirementId,
  )
  if (!updated) {
    throw notFoundError(
      'Specification-local requirement not found after update',
    )
  }
  return updated
}

export async function deleteSpecificationLocalRequirement(
  db: SqlServerDatabase,
  specificationId: number,
  specificationLocalRequirementId: number,
): Promise<boolean> {
  const deleted = (await db.query(
    `
      DELETE FROM specification_local_requirements
      OUTPUT DELETED.id AS id
      WHERE id = @0 AND specification_id = @1
    `,
    [specificationLocalRequirementId, specificationId],
  )) as Array<{ id: number }>

  return deleted.length > 0
}

// ─── Library item linking ────────────────────────────────────────────────────

export async function linkRequirementsToSpecification(
  db: SqlExecutor,
  specificationId: number,
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
        INSERT INTO requirements_specification_items (
          requirements_specification_id,
          requirement_id,
          requirement_version_id,
          needs_reference_id,
          specification_item_status_id,
          created_at
        )
        OUTPUT INSERTED.id AS id
        SELECT @0, @1, @2, @3, @4, @5
        WHERE NOT EXISTS (
          SELECT 1 FROM requirements_specification_items
          WHERE requirements_specification_id = @0 AND requirement_id = @1
        )
      `,
      [
        specificationId,
        item.requirementId,
        item.requirementVersionId,
        item.needsReferenceId ?? null,
        DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
        new Date(),
      ],
    )) as Array<{ id: number }>
    if (rows.length > 0) {
      inserted += 1
    }
  }
  return inserted
}

export async function linkRequirementsToSpecificationAtomically(
  db: SqlServerDatabase,
  specificationId: number,
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
    const items = await resolveRequirementsSpecificationLinkItems(
      manager,
      requirementIds,
    )

    if (normalizedNeedsReferenceText) {
      const resolvedNeedsReference =
        await getOrCreateSpecificationNeedsReferenceWithMetadata(
          manager,
          specificationId,
          normalizedNeedsReferenceText,
        )

      const addedCount = await linkRequirementsToSpecification(
        manager,
        specificationId,
        items.map(item => ({
          ...item,
          needsReferenceId: resolvedNeedsReference.id,
        })),
      )

      if (addedCount === 0 && resolvedNeedsReference.created) {
        await manager.query(
          `
            DELETE FROM specification_needs_references
            WHERE id = @0 AND specification_id = @1
          `,
          [resolvedNeedsReference.id, specificationId],
        )
      }

      return addedCount
    }

    const resolvedNeedsReferenceId =
      needsReferenceId == null
        ? null
        : await resolveExistingSpecificationNeedsReferenceForLinking(
            manager,
            specificationId,
            needsReferenceId,
          )

    return linkRequirementsToSpecification(
      manager,
      specificationId,
      items.map(item => ({
        ...item,
        needsReferenceId: resolvedNeedsReferenceId,
      })),
    )
  })
}

export async function unlinkRequirementsFromSpecification(
  db: SqlServerDatabase,
  specificationId: number,
  requirementIds: number[],
): Promise<number> {
  if (requirementIds.length === 0) return 0

  const params: unknown[] = [specificationId, ...requirementIds]
  const placeholders = requirementIds
    .map((_, index) => `@${index + 1}`)
    .join(', ')

  const deleted = (await db.query(
    `
      DELETE FROM requirements_specification_items
      OUTPUT DELETED.id AS id
      WHERE requirements_specification_id = @0 AND requirement_id IN (${placeholders})
    `,
    params,
  )) as Array<{ id: number }>
  return deleted.length
}

// ─── Listing items in a specification ──────────────────────────────────────────────

interface LibrarySpecificationItemFlatRow {
  areaName: string | null
  categoryNameEn: string | null
  categoryNameSv: string | null
  description: string | null
  isArchived: unknown
  needsReferenceId: number | null
  needsReferenceText: string | null
  normReferenceIds: string | null
  qualityCharacteristicNameEn: string | null
  qualityCharacteristicNameSv: string | null
  requirementId: number
  requirementPackageIds: string | null
  requiresTesting: unknown
  riskLevelColor: string | null
  riskLevelId: number | null
  riskLevelNameEn: string | null
  riskLevelNameSv: string | null
  riskLevelSortOrder: number | null
  specificationItemId: number
  specificationItemStatusColor: string | null
  specificationItemStatusDescriptionEn: string | null
  specificationItemStatusDescriptionSv: string | null
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
  statusColor: string | null
  statusId: number
  statusNameEn: string | null
  statusNameSv: string | null
  typeNameEn: string | null
  typeNameSv: string | null
  uniqueId: string
  versionNumber: number
}

function mapLibrarySpecificationItemRow(
  row: LibrarySpecificationItemFlatRow,
): RequirementRow {
  return {
    area: row.areaName ? { name: row.areaName } : null,
    id: Number(row.requirementId),
    isArchived: toBool(row.isArchived),
    itemRef: createLibraryItemRef(Number(row.specificationItemId)),
    isSpecificationLocal: false,
    kind: 'library',
    needsReference: row.needsReferenceText ?? null,
    needsReferenceId: row.needsReferenceId ?? null,
    normReferenceIds: parseCsvTextList(row.normReferenceIds),
    specificationItemId: Number(row.specificationItemId),
    specificationItemStatusColor: row.specificationItemStatusColor ?? null,
    specificationItemStatusDescriptionEn:
      row.specificationItemStatusDescriptionEn ?? null,
    specificationItemStatusDescriptionSv:
      row.specificationItemStatusDescriptionSv ?? null,
    specificationItemStatusId: row.specificationItemStatusId ?? null,
    specificationItemStatusNameEn: row.specificationItemStatusNameEn ?? null,
    specificationItemStatusNameSv: row.specificationItemStatusNameSv ?? null,
    uniqueId: row.uniqueId,
    requirementPackageIds: parseCsvNumberList(row.requirementPackageIds),
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

interface SpecificationLocalListFlatRow {
  description: string
  id: number
  needsReferenceId: number | null
  needsReferenceText: string | null
  normReferenceIds: string | null
  qualityCharacteristicNameEn: string | null
  qualityCharacteristicNameSv: string | null
  requirementAreaName: string | null
  requirementCategoryNameEn: string | null
  requirementCategoryNameSv: string | null
  requirementPackageIds: string | null
  requirementTypeNameEn: string | null
  requirementTypeNameSv: string | null
  requiresTesting: unknown
  riskLevelColor: string | null
  riskLevelId: number | null
  riskLevelNameEn: string | null
  riskLevelNameSv: string | null
  riskLevelSortOrder: number | null
  specificationItemStatusColor: string | null
  specificationItemStatusDescriptionEn: string | null
  specificationItemStatusDescriptionSv: string | null
  specificationItemStatusId: number | null
  specificationItemStatusNameEn: string | null
  specificationItemStatusNameSv: string | null
  uniqueId: string
}

function mapSpecificationLocalRequirementListRow(
  row: SpecificationLocalListFlatRow,
): RequirementRow {
  return {
    area: row.requirementAreaName ? { name: row.requirementAreaName } : null,
    id: createSpecificationLocalRowId(Number(row.id)),
    isArchived: false,
    itemRef: createSpecificationLocalItemRef(Number(row.id)),
    isSpecificationLocal: true,
    kind: 'specificationLocal',
    needsReference: row.needsReferenceText ?? null,
    needsReferenceId: row.needsReferenceId ?? null,
    normReferenceIds: parseCsvTextList(row.normReferenceIds),
    specificationItemStatusColor: row.specificationItemStatusColor ?? null,
    specificationItemStatusDescriptionEn:
      row.specificationItemStatusDescriptionEn ?? null,
    specificationItemStatusDescriptionSv:
      row.specificationItemStatusDescriptionSv ?? null,
    specificationItemStatusId: row.specificationItemStatusId ?? null,
    specificationItemStatusNameEn: row.specificationItemStatusNameEn ?? null,
    specificationItemStatusNameSv: row.specificationItemStatusNameSv ?? null,
    specificationLocalRequirementId: Number(row.id),
    uniqueId: row.uniqueId,
    requirementPackageIds: parseCsvNumberList(row.requirementPackageIds),
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

export async function listSpecificationItems(
  db: SqlServerDatabase,
  specificationId: number,
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
          specification_item.needs_reference_id AS needsReferenceId,
          needs_reference.text AS needsReferenceText,
          (
            SELECT STRING_AGG(norm_reference.norm_reference_id, ',') WITHIN GROUP (ORDER BY norm_reference.norm_reference_id)
            FROM requirement_version_norm_references vnr
            INNER JOIN norm_references norm_reference ON norm_reference.id = vnr.norm_reference_id
            WHERE vnr.requirement_version_id = requirement_version.id
          ) AS normReferenceIds,
          specification_item.id AS specificationItemId,
          specification_item_status.color AS specificationItemStatusColor,
          specification_item_status.description_en AS specificationItemStatusDescriptionEn,
          specification_item_status.description_sv AS specificationItemStatusDescriptionSv,
          specification_item.specification_item_status_id AS specificationItemStatusId,
          specification_item_status.name_en AS specificationItemStatusNameEn,
          specification_item_status.name_sv AS specificationItemStatusNameSv,
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
            SELECT STRING_AGG(CAST(rvus.requirement_package_id AS varchar(20)), ',')
            FROM requirement_version_requirement_packages rvus
            WHERE rvus.requirement_version_id = requirement_version.id
          ) AS requirementPackageIds,
          requirement_version.version_number AS versionNumber
        FROM requirements_specification_items specification_item
        INNER JOIN requirements requirement
          ON requirement.id = specification_item.requirement_id
        INNER JOIN requirement_versions requirement_version
          ON requirement_version.id = specification_item.requirement_version_id
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
        LEFT JOIN specification_needs_references needs_reference
          ON needs_reference.id = specification_item.needs_reference_id
        LEFT JOIN specification_item_statuses specification_item_status
          ON specification_item_status.id = specification_item.specification_item_status_id
        WHERE specification_item.requirements_specification_id = @0
        ORDER BY requirement.unique_id
      `,
      [specificationId],
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
            FROM specification_local_requirement_norm_references plrnr
            INNER JOIN norm_references norm_reference ON norm_reference.id = plrnr.norm_reference_id
            WHERE plrnr.specification_local_requirement_id = local_requirement.id
          ) AS normReferenceIds,
          specification_item_status.color AS specificationItemStatusColor,
          specification_item_status.description_en AS specificationItemStatusDescriptionEn,
          specification_item_status.description_sv AS specificationItemStatusDescriptionSv,
          local_requirement.specification_item_status_id AS specificationItemStatusId,
          specification_item_status.name_en AS specificationItemStatusNameEn,
          specification_item_status.name_sv AS specificationItemStatusNameSv,
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
            SELECT STRING_AGG(CAST(plrus.requirement_package_id AS varchar(20)), ',')
            FROM specification_local_requirement_requirement_packages plrus
            WHERE plrus.specification_local_requirement_id = local_requirement.id
          ) AS requirementPackageIds
        FROM specification_local_requirements local_requirement
        LEFT JOIN specification_needs_references needs_reference
          ON needs_reference.id = local_requirement.needs_reference_id
        LEFT JOIN specification_item_statuses specification_item_status
          ON specification_item_status.id = local_requirement.specification_item_status_id
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
        WHERE local_requirement.specification_id = @0
        ORDER BY local_requirement.unique_id
      `,
      [specificationId],
    ) as Promise<Row[]>,
  ])

  return [
    ...(libraryRows as unknown as LibrarySpecificationItemFlatRow[]).map(
      mapLibrarySpecificationItemRow,
    ),
    ...(localRows as unknown as SpecificationLocalListFlatRow[]).map(
      mapSpecificationLocalRequirementListRow,
    ),
  ].sort((left, right) => left.uniqueId.localeCompare(right.uniqueId, 'sv'))
}

// ─── Item lookup & updates ───────────────────────────────────────────────────

export async function getSpecificationItemById(
  db: SqlServerDatabase,
  itemId: number,
) {
  const rows = (await db.query(
    `
      SELECT TOP (1)
        specification_item.id AS id,
        specification_item.requirements_specification_id AS specificationId,
        specification_item.requirement_id AS requirementId,
        specification_item.requirement_version_id AS requirementVersionId,
        specification_item.needs_reference_id AS needsReferenceId,
        specification_item.specification_item_status_id AS specificationItemStatusId,
        specification_item.note AS note,
        specification_item.status_updated_at AS statusUpdatedAt,
        specification_item.created_at AS createdAt
      FROM requirements_specification_items specification_item
      WHERE specification_item.id = @0
    `,
    [itemId],
  )) as Row[]

  const row = rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    specificationId: Number(row.specificationId),
    requirementId: Number(row.requirementId),
    requirementVersionId: Number(row.requirementVersionId),
    needsReferenceId: toNum(row.needsReferenceId),
    specificationItemStatusId: toNum(row.specificationItemStatusId),
    note: toStr(row.note),
    statusUpdatedAt: toIso(row.statusUpdatedAt),
    createdAt: toIso(row.createdAt) ?? '',
  }
}

export async function getSpecificationItemByRef(
  db: SqlServerDatabase,
  specificationId: number,
  itemRef: string,
) {
  const parsed = parseSpecificationItemRef(itemRef)
  if (!parsed) {
    return null
  }

  if (parsed.kind === 'library') {
    const specificationItem = await getSpecificationItemById(db, parsed.id)
    if (
      !specificationItem ||
      specificationItem.specificationId !== specificationId
    ) {
      return null
    }

    return {
      id: parsed.id,
      itemRef: createLibraryItemRef(parsed.id),
      kind: 'library' as const,
    }
  }

  const localRequirement = await getSpecificationLocalRequirementIdentity(
    db,
    specificationId,
    parsed.id,
  )
  if (!localRequirement) {
    return null
  }

  return {
    id: parsed.id,
    itemRef: createSpecificationLocalItemRef(parsed.id),
    kind: 'specificationLocal' as const,
  }
}

async function validateSpecificationItemStatus(
  db: SqlExecutor,
  statusId: number,
): Promise<void> {
  const rows = (await db.query(
    `
      SELECT TOP (1) specification_item_status.id AS id
      FROM specification_item_statuses specification_item_status
      WHERE specification_item_status.id = @0
    `,
    [statusId],
  )) as Array<{ id: number }>

  if (!rows[0]) {
    throw validationError('Invalid specification item status ID', {
      specificationItemStatusId: statusId,
    })
  }
}

export async function updateSpecificationItemFields(
  db: SqlServerDatabase,
  itemId: number,
  data: { specificationItemStatusId?: number | null; note?: string | null },
): Promise<void> {
  const setClauses: string[] = []
  const params: unknown[] = []
  let nextStatusId: number | null | undefined

  if ('specificationItemStatusId' in data) {
    nextStatusId = data.specificationItemStatusId ?? null
    if (nextStatusId != null) {
      await validateSpecificationItemStatus(db, nextStatusId)
    }
    setClauses.push(`specification_item_status_id = @${params.length}`)
    params.push(nextStatusId)
    setClauses.push(`status_updated_at = @${params.length}`)
    params.push(new Date().toISOString())
  }

  if ('note' in data) {
    setClauses.push(`note = @${params.length}`)
    params.push(data.note ?? null)
  }

  if (setClauses.length === 0) return

  if (nextStatusId === DEVIATED_SPECIFICATION_ITEM_STATUS_ID) {
    const approvedDeviationRows = (await db.query(
      `
        SELECT TOP (1) deviation.id AS id
        FROM deviations deviation
        WHERE deviation.specification_item_id = @0 AND deviation.decision = @1
      `,
      [itemId, DEVIATION_APPROVED],
    )) as Array<{ id: number }>

    if (!approvedDeviationRows[0]) {
      throw validationError('Deviated status requires an approved deviation', {
        specificationItemStatusId: nextStatusId,
        itemId,
      })
    }
  }

  const idPlaceholder = `@${params.length}`
  params.push(itemId)

  await db.query(
    `
      UPDATE requirements_specification_items
      SET ${setClauses.join(', ')}
      WHERE id = ${idPlaceholder}
    `,
    params,
  )
}

export async function updateSpecificationLocalRequirementFields(
  db: SqlServerDatabase,
  specificationLocalRequirementId: number,
  data: { specificationItemStatusId?: number | null; note?: string | null },
): Promise<void> {
  const setClauses: string[] = []
  const params: unknown[] = []
  let nextStatusId: number | null | undefined

  if ('specificationItemStatusId' in data) {
    nextStatusId = data.specificationItemStatusId ?? null
    if (nextStatusId != null) {
      await validateSpecificationItemStatus(db, nextStatusId)
    }
    setClauses.push(`specification_item_status_id = @${params.length}`)
    params.push(nextStatusId)
    setClauses.push(`status_updated_at = @${params.length}`)
    params.push(new Date().toISOString())
  }

  if ('note' in data) {
    setClauses.push(`note = @${params.length}`)
    params.push(data.note ?? null)
  }

  if (setClauses.length === 0) return

  if (nextStatusId === DEVIATED_SPECIFICATION_ITEM_STATUS_ID) {
    const approvedDeviationRows = (await db.query(
      `
        SELECT TOP (1) deviation.id AS id
        FROM specification_local_requirement_deviations deviation
        WHERE deviation.specification_local_requirement_id = @0
          AND deviation.decision = @1
      `,
      [specificationLocalRequirementId, DEVIATION_APPROVED],
    )) as Array<{ id: number }>

    if (!approvedDeviationRows[0]) {
      throw validationError('Deviated status requires an approved deviation', {
        specificationItemStatusId: nextStatusId,
        specificationLocalRequirementId,
      })
    }
  }

  const idPlaceholder = `@${params.length}`
  params.push(specificationLocalRequirementId)

  await db.query(
    `
      UPDATE specification_local_requirements
      SET ${setClauses.join(', ')}
      WHERE id = ${idPlaceholder}
    `,
    params,
  )
}

export async function updateSpecificationItemFieldsByItemRef(
  db: SqlServerDatabase,
  specificationId: number,
  itemRef: string,
  data: { specificationItemStatusId?: number | null; note?: string | null },
) {
  const item = await getSpecificationItemByRef(db, specificationId, itemRef)
  if (!item) {
    throw notFoundError('Item not found in specification', {
      itemRef,
      specificationId,
    })
  }

  if (item.kind === 'library') {
    await updateSpecificationItemFields(db, item.id, data)
    return
  }

  await updateSpecificationLocalRequirementFields(db, item.id, data)
}

// ─── Bulk delete by refs ─────────────────────────────────────────────────────

async function deleteLibrarySpecificationItemsByIds(
  db: SqlExecutor,
  specificationId: number,
  libraryIds: number[],
): Promise<number> {
  if (libraryIds.length === 0) return 0
  const placeholders = libraryIds.map((_, index) => `@${index + 1}`).join(', ')
  const rows = (await db.query(
    `
      DELETE FROM requirements_specification_items
      OUTPUT DELETED.id AS id
      WHERE requirements_specification_id = @0 AND id IN (${placeholders})
    `,
    [specificationId, ...libraryIds],
  )) as Array<{ id: number }>
  return rows.length
}

async function deleteSpecificationLocalRequirementsByIds(
  db: SqlExecutor,
  specificationId: number,
  specificationLocalRequirementIds: number[],
): Promise<number> {
  if (specificationLocalRequirementIds.length === 0) return 0
  const placeholders = specificationLocalRequirementIds
    .map((_, index) => `@${index + 1}`)
    .join(', ')
  const rows = (await db.query(
    `
      DELETE FROM specification_local_requirements
      OUTPUT DELETED.id AS id
      WHERE specification_id = @0 AND id IN (${placeholders})
    `,
    [specificationId, ...specificationLocalRequirementIds],
  )) as Array<{ id: number }>
  return rows.length
}

export async function deleteSpecificationItemsByRefs(
  db: SqlServerDatabase,
  specificationId: number,
  itemRefs: string[],
) {
  const libraryIds: number[] = []
  const specificationLocalRequirementIds: number[] = []

  for (const itemRef of itemRefs) {
    const parsed = parseSpecificationItemRef(itemRef)
    if (!parsed) {
      throw validationError('Invalid itemRef', { itemRef })
    }

    if (parsed.kind === 'library') {
      libraryIds.push(parsed.id)
    } else {
      specificationLocalRequirementIds.push(parsed.id)
    }
  }

  if (
    libraryIds.length === 0 ||
    specificationLocalRequirementIds.length === 0
  ) {
    const deletedLibraryCount = await deleteLibrarySpecificationItemsByIds(
      db,
      specificationId,
      libraryIds,
    )
    const deletedSpecificationLocalCount =
      await deleteSpecificationLocalRequirementsByIds(
        db,
        specificationId,
        specificationLocalRequirementIds,
      )
    return { deletedLibraryCount, deletedSpecificationLocalCount }
  }

  return db.transaction(async (manager: SqlExecutor) => {
    const deletedLibraryCount = await deleteLibrarySpecificationItemsByIds(
      manager,
      specificationId,
      libraryIds,
    )
    const deletedSpecificationLocalCount =
      await deleteSpecificationLocalRequirementsByIds(
        manager,
        specificationId,
        specificationLocalRequirementIds,
      )
    return { deletedLibraryCount, deletedSpecificationLocalCount }
  })
}

// Re-export buildInClause-style helper to satisfy unused lint if any
void buildInClause
