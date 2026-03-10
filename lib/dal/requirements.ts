import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm'
import {
  requirementAreas,
  requirementCategories,
  requirementReferences,
  requirementStatuses,
  requirementStatusTransitions,
  requirements,
  requirementTypeCategories,
  requirementTypes,
  requirementVersionScenarios,
  requirementVersions,
} from '@/drizzle/schema'
import type { Database } from '@/lib/db'
import {
  conflictError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'

export const STATUS_DRAFT = 1
export const STATUS_REVIEW = 2
export const STATUS_PUBLISHED = 3
export const STATUS_ARCHIVED = 4

type ListRequirementsOptions = {
  includeArchived?: boolean
  areaIds?: number[]
  categoryIds?: number[]
  typeIds?: number[]
  typeCategoryIds?: number[]
  requiresTesting?: boolean[]
  statuses?: number[]
  uniqueIdSearch?: string
  descriptionSearch?: string
  limit?: number
  offset?: number
}

// Effective status uses priority: Published > Archived > Review > Draft.
// requirements.isArchived stays true while a replacement Draft/Review is being
// prepared for an archived requirement, so Archived continues to outrank Draft.
const effectiveStatusSql = sql<number>`CASE
  WHEN EXISTS (
    SELECT 1 FROM requirement_versions rv
    WHERE rv.requirement_id = ${requirements.id}
    AND rv.requirement_status_id = ${STATUS_PUBLISHED}
  ) THEN ${STATUS_PUBLISHED}
  WHEN ${requirements.isArchived} = 1 THEN ${STATUS_ARCHIVED}
  WHEN EXISTS (
    SELECT 1 FROM requirement_versions rv
    WHERE rv.requirement_id = ${requirements.id}
    AND rv.requirement_status_id = ${STATUS_REVIEW}
  ) THEN ${STATUS_REVIEW}
  ELSE ${STATUS_DRAFT}
END`

function buildRequirementListConditions(opts: ListRequirementsOptions) {
  const conditions = []

  if (!opts.includeArchived) {
    conditions.push(eq(requirements.isArchived, false))
  }
  if (opts.areaIds && opts.areaIds.length > 0) {
    conditions.push(inArray(requirements.requirementAreaId, opts.areaIds))
  }
  if (opts.uniqueIdSearch) {
    const pattern = `%${opts.uniqueIdSearch}%`
    conditions.push(like(requirements.uniqueId, pattern))
  }
  if (opts.descriptionSearch) {
    const pattern = `%${opts.descriptionSearch}%`
    conditions.push(
      or(
        like(requirementVersions.description, pattern),
        like(requirementVersions.acceptanceCriteria, pattern),
      ),
    )
  }
  if (opts.statuses && opts.statuses.length > 0) {
    conditions.push(inArray(effectiveStatusSql, opts.statuses))
  }
  if (opts.categoryIds && opts.categoryIds.length > 0) {
    conditions.push(
      inArray(requirementVersions.requirementCategoryId, opts.categoryIds),
    )
  }
  if (opts.typeIds && opts.typeIds.length > 0) {
    conditions.push(
      inArray(requirementVersions.requirementTypeId, opts.typeIds),
    )
  }
  if (opts.typeCategoryIds && opts.typeCategoryIds.length > 0) {
    conditions.push(
      inArray(
        requirementVersions.requirementTypeCategoryId,
        opts.typeCategoryIds,
      ),
    )
  }
  if (opts.requiresTesting && opts.requiresTesting.length > 0) {
    conditions.push(
      inArray(requirementVersions.requiresTesting, opts.requiresTesting),
    )
  }

  return conditions
}

function buildRequirementVersionSubqueries(db: Database) {
  const publishedVersions = db
    .select({
      requirementId: requirementVersions.requirementId,
      maxPublishedVersion:
        sql<number>`MAX(${requirementVersions.versionNumber})`.as(
          'max_published_version',
        ),
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.statusId, STATUS_PUBLISHED))
    .groupBy(requirementVersions.requirementId)
    .as('published')

  const archivedVersions = db
    .select({
      requirementId: requirementVersions.requirementId,
      maxArchivedVersion:
        sql<number>`MAX(${requirementVersions.versionNumber})`.as(
          'max_archived_version',
        ),
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.statusId, STATUS_ARCHIVED))
    .groupBy(requirementVersions.requirementId)
    .as('archived')

  const latestVersions = db
    .select({
      requirementId: requirementVersions.requirementId,
      maxVersion: sql<number>`MAX(${requirementVersions.versionNumber})`.as(
        'max_version',
      ),
    })
    .from(requirementVersions)
    .groupBy(requirementVersions.requirementId)
    .as('latest')

  return { archivedVersions, latestVersions, publishedVersions }
}

function buildDisplayVersionNumberSql(subqueries: {
  archivedVersions: {
    maxArchivedVersion: unknown
  }
  latestVersions: {
    maxVersion: unknown
  }
  publishedVersions: {
    maxPublishedVersion: unknown
  }
}) {
  return sql<number>`CASE
    WHEN ${subqueries.publishedVersions.maxPublishedVersion} IS NOT NULL
      THEN ${subqueries.publishedVersions.maxPublishedVersion}
    WHEN ${requirements.isArchived} = 1
      AND ${subqueries.archivedVersions.maxArchivedVersion} IS NOT NULL
      THEN ${subqueries.archivedVersions.maxArchivedVersion}
    ELSE ${subqueries.latestVersions.maxVersion}
  END`
}

export async function listRequirements(
  db: Database,
  opts: ListRequirementsOptions = {},
) {
  const conditions = buildRequirementListConditions(opts)
  const { archivedVersions, latestVersions, publishedVersions } =
    buildRequirementVersionSubqueries(db)
  const displayVersionNumberSql = buildDisplayVersionNumberSql({
    archivedVersions,
    latestVersions,
    publishedVersions,
  })

  // The display version is: published version if exists, otherwise archived
  // version for archived requirements, otherwise absolute latest.
  // hasPendingVersion = absolute latest > display version
  let query = db
    .select({
      id: requirements.id,
      uniqueId: requirements.uniqueId,
      requirementAreaId: requirements.requirementAreaId,
      isArchived: requirements.isArchived,
      createdAt: requirements.createdAt,
      versionId: requirementVersions.id,
      versionNumber: requirementVersions.versionNumber,
      description: requirementVersions.description,
      acceptanceCriteria: requirementVersions.acceptanceCriteria,
      requirementCategoryId: requirementVersions.requirementCategoryId,
      requirementTypeId: requirementVersions.requirementTypeId,
      requirementTypeCategoryId: requirementVersions.requirementTypeCategoryId,
      status: effectiveStatusSql.as('effective_status'),
      statusNameSv: sql<
        string | null
      >`(SELECT rs.name_sv FROM requirement_statuses rs WHERE rs.id = ${effectiveStatusSql})`.as(
        'effective_status_name_sv',
      ),
      statusNameEn: sql<
        string | null
      >`(SELECT rs.name_en FROM requirement_statuses rs WHERE rs.id = ${effectiveStatusSql})`.as(
        'effective_status_name_en',
      ),
      statusColor: sql<
        string | null
      >`(SELECT rs.color FROM requirement_statuses rs WHERE rs.id = ${effectiveStatusSql})`.as(
        'effective_status_color',
      ),
      requiresTesting: requirementVersions.requiresTesting,
      versionCreatedAt: requirementVersions.createdAt,
      areaName: requirementAreas.name,
      categoryNameSv: requirementCategories.nameSv,
      categoryNameEn: requirementCategories.nameEn,
      typeNameSv: requirementTypes.nameSv,
      typeNameEn: requirementTypes.nameEn,
      typeCategoryNameSv: requirementTypeCategories.nameSv,
      typeCategoryNameEn: requirementTypeCategories.nameEn,
      maxVersion: latestVersions.maxVersion,
      pendingVersionStatusColor: sql<string | null>`(
        SELECT CASE WHEN rv.requirement_status_id = ${STATUS_ARCHIVED} THEN NULL
          ELSE rs.color END
        FROM requirement_versions rv
        JOIN requirement_statuses rs ON rs.id = rv.requirement_status_id
        WHERE rv.requirement_id = ${requirements.id}
        ORDER BY rv.version_number DESC LIMIT 1
      )`.as('pending_version_status_color'),
      pendingVersionStatusId: sql<number | null>`(
        SELECT CASE WHEN rv.requirement_status_id = ${STATUS_ARCHIVED} THEN NULL
          ELSE rv.requirement_status_id END
        FROM requirement_versions rv
        WHERE rv.requirement_id = ${requirements.id}
        ORDER BY rv.version_number DESC LIMIT 1
      )`.as('pending_version_status_id'),
    })
    .from(requirements)
    .innerJoin(
      latestVersions,
      eq(requirements.id, latestVersions.requirementId),
    )
    .leftJoin(
      publishedVersions,
      eq(requirements.id, publishedVersions.requirementId),
    )
    .leftJoin(
      archivedVersions,
      eq(requirements.id, archivedVersions.requirementId),
    )
    .innerJoin(
      requirementVersions,
      and(
        eq(requirementVersions.requirementId, requirements.id),
        eq(requirementVersions.versionNumber, displayVersionNumberSql),
      ),
    )
    .leftJoin(
      requirementAreas,
      eq(requirements.requirementAreaId, requirementAreas.id),
    )
    .leftJoin(
      requirementCategories,
      eq(requirementVersions.requirementCategoryId, requirementCategories.id),
    )
    .leftJoin(
      requirementTypes,
      eq(requirementVersions.requirementTypeId, requirementTypes.id),
    )
    .leftJoin(
      requirementTypeCategories,
      eq(
        requirementVersions.requirementTypeCategoryId,
        requirementTypeCategories.id,
      ),
    )
    .$dynamic()

  if (conditions.length > 0) {
    query = query.where(and(...conditions))
  }

  query = query.orderBy(requirements.uniqueId)

  if (opts.limit != null) {
    query = query.limit(opts.limit)
  }
  if (opts.offset != null) {
    query = query.offset(opts.offset)
  }

  return query
}

export async function countRequirements(
  db: Database,
  opts: ListRequirementsOptions = {},
) {
  const conditions = buildRequirementListConditions(opts)
  const { archivedVersions, latestVersions, publishedVersions } =
    buildRequirementVersionSubqueries(db)
  const displayVersionNumberSql = buildDisplayVersionNumberSql({
    archivedVersions,
    latestVersions,
    publishedVersions,
  })

  let query = db
    .select({
      count: sql<number>`COUNT(DISTINCT ${requirements.id})`,
    })
    .from(requirements)
    .innerJoin(
      latestVersions,
      eq(requirements.id, latestVersions.requirementId),
    )
    .leftJoin(
      publishedVersions,
      eq(requirements.id, publishedVersions.requirementId),
    )
    .leftJoin(
      archivedVersions,
      eq(requirements.id, archivedVersions.requirementId),
    )
    .innerJoin(
      requirementVersions,
      and(
        eq(requirementVersions.requirementId, requirements.id),
        eq(requirementVersions.versionNumber, displayVersionNumberSql),
      ),
    )
    .$dynamic()

  if (conditions.length > 0) {
    query = query.where(and(...conditions))
  }

  const [result] = await query
  return result?.count ?? 0
}

export async function getRequirementById(db: Database, id: number) {
  const result = await db.query.requirements.findFirst({
    where: eq(requirements.id, id),
    with: {
      area: true,
      versions: {
        orderBy: [desc(requirementVersions.versionNumber)],
        with: {
          category: true,
          type: true,
          typeCategory: true,
          status: true,
          references: true,
          versionScenarios: {
            with: {
              scenario: true,
            },
          },
        },
      },
    },
  })

  if (!result) return null

  // Map versions to include statusNameSv/En/Color for the client
  return {
    ...result,
    versions: result.versions.map(v => ({
      ...v,
      status: v.statusId,
      statusNameSv: v.status?.nameSv ?? null,
      statusNameEn: v.status?.nameEn ?? null,
      statusColor: v.status?.color ?? null,
    })),
  }
}

export async function getRequirementByUniqueId(db: Database, uniqueId: string) {
  const req = await db.query.requirements.findFirst({
    where: eq(requirements.uniqueId, uniqueId),
  })
  if (!req) return null
  return getRequirementById(db, req.id)
}

export async function createRequirement(
  db: Database,
  data: {
    requirementAreaId: number
    description: string
    acceptanceCriteria?: string
    requirementCategoryId?: number
    requirementTypeId?: number
    requirementTypeCategoryId?: number
    requiresTesting?: boolean
    createdBy?: string
    referenceIds?: number[]
    scenarioIds?: number[]
  },
) {
  const area = await db.query.requirementAreas.findFirst({
    where: eq(requirementAreas.id, data.requirementAreaId),
  })
  if (!area) throw notFoundError('Requirement area not found')

  const seq = area.nextSequence
  const uniqueId = `${area.prefix}${String(seq).padStart(4, '0')}`

  // Update area next_sequence
  await db
    .update(requirementAreas)
    .set({ nextSequence: seq + 1 })
    .where(eq(requirementAreas.id, data.requirementAreaId))

  // Insert requirement
  const [req] = await db
    .insert(requirements)
    .values({
      uniqueId,
      requirementAreaId: data.requirementAreaId,
      sequenceNumber: seq,
    })
    .returning()

  // Insert first version (always starts as Utkast)
  const now = new Date().toISOString()
  const [version] = await db
    .insert(requirementVersions)
    .values({
      requirementId: req.id,
      versionNumber: 1,
      description: data.description,
      acceptanceCriteria: data.acceptanceCriteria,
      requirementCategoryId: data.requirementCategoryId,
      requirementTypeId: data.requirementTypeId,
      requirementTypeCategoryId: data.requirementTypeCategoryId,
      statusId: STATUS_DRAFT,
      requiresTesting: data.requiresTesting ?? false,
      createdBy: data.createdBy,
      editedAt: now,
    })
    .returning()

  // Link scenarios
  if (data.scenarioIds?.length) {
    await db.insert(requirementVersionScenarios).values(
      data.scenarioIds.map(scenarioId => ({
        requirementVersionId: version.id,
        scenarioId,
      })),
    )
  }

  return { requirement: req, version }
}

export async function editRequirement(
  db: Database,
  requirementId: number,
  data: {
    requirementAreaId?: number
    description: string
    acceptanceCriteria?: string
    requirementCategoryId?: number
    requirementTypeId?: number
    requirementTypeCategoryId?: number
    requiresTesting?: boolean
    createdBy?: string
    scenarioIds?: number[]
  },
) {
  // Update area on the requirement if provided
  if (data.requirementAreaId != null) {
    await db
      .update(requirements)
      .set({ requirementAreaId: data.requirementAreaId })
      .where(eq(requirements.id, requirementId))
  }

  // Get current latest version
  const latestRows = await db
    .select({
      maxVersion: sql<number>`MAX(${requirementVersions.versionNumber})`,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.requirementId, requirementId))

  const currentMax = latestRows[0]?.maxVersion ?? 0

  const currentVersion = await db.query.requirementVersions.findFirst({
    where: and(
      eq(requirementVersions.requirementId, requirementId),
      eq(requirementVersions.versionNumber, currentMax),
    ),
  })

  if (!currentVersion) {
    throw notFoundError('No version found for requirement')
  }

  // Review: must transition back to Draft first
  if (currentVersion.statusId === STATUS_REVIEW) {
    throw conflictError('Cannot edit a requirement in Review status')
  }

  // Archived: must be restored first (creates new Draft via restoreVersion)
  if (currentVersion.statusId === STATUS_ARCHIVED) {
    throw conflictError(
      'Cannot edit an archived requirement — restore it first',
    )
  }

  const now = new Date().toISOString()

  // Draft status: update the existing version row in place
  if (currentVersion.statusId === STATUS_DRAFT) {
    await db
      .update(requirementVersions)
      .set({
        description: data.description,
        acceptanceCriteria: data.acceptanceCriteria,
        requirementCategoryId: data.requirementCategoryId,
        requirementTypeId: data.requirementTypeId,
        requirementTypeCategoryId: data.requirementTypeCategoryId,
        requiresTesting: data.requiresTesting ?? false,
        editedAt: now,
      })
      .where(eq(requirementVersions.id, currentVersion.id))

    // Replace scenarios: delete existing, then insert new
    await db
      .delete(requirementVersionScenarios)
      .where(
        eq(requirementVersionScenarios.requirementVersionId, currentVersion.id),
      )

    if (data.scenarioIds?.length) {
      await db.insert(requirementVersionScenarios).values(
        data.scenarioIds.map(scenarioId => ({
          requirementVersionId: currentVersion.id,
          scenarioId,
        })),
      )
    }

    const updated = await db.query.requirementVersions.findFirst({
      where: eq(requirementVersions.id, currentVersion.id),
    })

    if (!updated) {
      throw notFoundError('Failed to retrieve updated version')
    }

    return updated
  }

  // Published status: create a new Draft version
  const nextVersion = currentMax + 1

  const [version] = await db
    .insert(requirementVersions)
    .values({
      requirementId,
      versionNumber: nextVersion,
      description: data.description,
      acceptanceCriteria: data.acceptanceCriteria,
      requirementCategoryId: data.requirementCategoryId,
      requirementTypeId: data.requirementTypeId,
      requirementTypeCategoryId: data.requirementTypeCategoryId,
      statusId: STATUS_DRAFT,
      requiresTesting: data.requiresTesting ?? false,
      editedAt: now,
      createdBy: data.createdBy,
    })
    .returning()

  // Link scenarios
  if (data.scenarioIds?.length) {
    await db.insert(requirementVersionScenarios).values(
      data.scenarioIds.map(scenarioId => ({
        requirementVersionId: version.id,
        scenarioId,
      })),
    )
  }

  return version
}

export async function archiveRequirement(
  db: Database,
  requirementId: number,
  _createdBy?: string,
) {
  // Set is_archived flag
  await db
    .update(requirements)
    .set({ isArchived: true })
    .where(eq(requirements.id, requirementId))

  // Get current latest version
  const latestRows = await db
    .select({
      maxVersion: sql<number>`MAX(${requirementVersions.versionNumber})`,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.requirementId, requirementId))

  const currentMax = latestRows[0]?.maxVersion ?? 0

  const currentVersion = await db.query.requirementVersions.findFirst({
    where: and(
      eq(requirementVersions.requirementId, requirementId),
      eq(requirementVersions.versionNumber, currentMax),
    ),
  })

  // In-place update: set status to Archived and archived_at timestamp
  if (currentVersion && currentVersion.statusId !== STATUS_ARCHIVED) {
    await db
      .update(requirementVersions)
      .set({
        statusId: STATUS_ARCHIVED,
        archivedAt: new Date().toISOString(),
      })
      .where(eq(requirementVersions.id, currentVersion.id))
  }
}

export async function deleteDraftVersion(db: Database, requirementId: number) {
  // Get the latest version
  const latestRows = await db
    .select({
      maxVersion: sql<number>`MAX(${requirementVersions.versionNumber})`,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.requirementId, requirementId))

  const currentMax = latestRows[0]?.maxVersion ?? 0

  const latestVersion = await db.query.requirementVersions.findFirst({
    where: and(
      eq(requirementVersions.requirementId, requirementId),
      eq(requirementVersions.versionNumber, currentMax),
    ),
  })

  if (!latestVersion || latestVersion.statusId !== STATUS_DRAFT) {
    throw conflictError('Only draft versions can be deleted')
  }

  // Delete related references and scenarios first
  await db
    .delete(requirementReferences)
    .where(eq(requirementReferences.requirementVersionId, latestVersion.id))
  await db
    .delete(requirementVersionScenarios)
    .where(
      eq(requirementVersionScenarios.requirementVersionId, latestVersion.id),
    )

  // Delete the draft version
  await db
    .delete(requirementVersions)
    .where(eq(requirementVersions.id, latestVersion.id))

  // If no versions remain, delete the requirement itself
  const remaining = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(requirementVersions)
    .where(eq(requirementVersions.requirementId, requirementId))

  if (remaining[0]?.count === 0) {
    await db.delete(requirements).where(eq(requirements.id, requirementId))
    return { deleted: 'requirement' as const }
  }

  return { deleted: 'version' as const }
}

export async function reactivateRequirement(
  db: Database,
  requirementId: number,
  createdBy?: string,
) {
  const latestRows = await db
    .select({
      maxVersion: sql<number>`MAX(${requirementVersions.versionNumber})`,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.requirementId, requirementId))

  const currentMax = latestRows[0]?.maxVersion ?? 0

  const latestVersion = await db.query.requirementVersions.findFirst({
    where: and(
      eq(requirementVersions.requirementId, requirementId),
      eq(requirementVersions.versionNumber, currentMax),
    ),
  })

  if (!latestVersion) {
    throw notFoundError('No version found for requirement')
  }

  if (latestVersion.statusId !== STATUS_ARCHIVED) {
    throw conflictError('Only fully archived requirements can be reactivated')
  }

  return restoreVersion(db, requirementId, latestVersion.id, createdBy)
}

export async function transitionStatus(
  db: Database,
  requirementId: number,
  newStatusId: number,
  _createdBy?: string,
) {
  // Validate that the target status exists
  const targetStatus = await db.query.requirementStatuses.findFirst({
    where: eq(requirementStatuses.id, newStatusId),
  })
  if (!targetStatus) {
    throw validationError(`Invalid status ID: ${newStatusId}`)
  }

  // Get current latest version
  const latestRows = await db
    .select({
      maxVersion: sql<number>`MAX(${requirementVersions.versionNumber})`,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.requirementId, requirementId))

  const currentMax = latestRows[0]?.maxVersion ?? 0

  const currentVersion = await db.query.requirementVersions.findFirst({
    where: and(
      eq(requirementVersions.requirementId, requirementId),
      eq(requirementVersions.versionNumber, currentMax),
    ),
  })

  if (!currentVersion) {
    throw notFoundError('No version found for requirement')
  }

  const currentRequirement = await db.query.requirements.findFirst({
    where: eq(requirements.id, requirementId),
    columns: {
      isArchived: true,
    },
  })

  if (!currentRequirement) {
    throw notFoundError('Requirement not found')
  }

  // Check transition is allowed via DB
  const transition = await db.query.requirementStatusTransitions.findFirst({
    where: and(
      eq(requirementStatusTransitions.fromStatusId, currentVersion.statusId),
      eq(requirementStatusTransitions.toStatusId, newStatusId),
    ),
  })
  if (!transition) {
    throw conflictError(
      `Invalid transition from status ${currentVersion.statusId} to ${newStatusId}`,
    )
  }

  // In-place status update — never create a new version row.
  // edited_at is intentionally NOT touched on status transitions.
  const now = new Date().toISOString()

  const updateFields: Record<string, unknown> = {
    statusId: newStatusId,
  }

  if (newStatusId === STATUS_PUBLISHED) {
    updateFields.publishedAt = now

    // Auto-archive any previously published version of this requirement
    await db
      .update(requirementVersions)
      .set({
        statusId: STATUS_ARCHIVED,
        archivedAt: now,
      })
      .where(
        and(
          eq(requirementVersions.requirementId, requirementId),
          eq(requirementVersions.statusId, STATUS_PUBLISHED),
        ),
      )
  }

  if (newStatusId === STATUS_ARCHIVED) {
    updateFields.archivedAt = now
  }

  const nextIsArchived =
    newStatusId === STATUS_ARCHIVED
      ? true
      : newStatusId === STATUS_PUBLISHED
        ? false
        : currentRequirement.isArchived

  await db
    .update(requirements)
    .set({ isArchived: nextIsArchived })
    .where(eq(requirements.id, requirementId))

  await db
    .update(requirementVersions)
    .set(updateFields)
    .where(eq(requirementVersions.id, currentVersion.id))

  // Return the updated version
  const updated = await db.query.requirementVersions.findFirst({
    where: eq(requirementVersions.id, currentVersion.id),
  })

  if (!updated) {
    throw notFoundError('Failed to retrieve updated version')
  }

  return updated
}

export async function restoreVersion(
  db: Database,
  requirementId: number,
  versionId: number,
  createdBy?: string,
) {
  // Fetch the version to restore
  const oldVersion = await db.query.requirementVersions.findFirst({
    where: eq(requirementVersions.id, versionId),
    with: {
      references: true,
      versionScenarios: true,
    },
  })

  if (!oldVersion || oldVersion.requirementId !== requirementId) {
    throw notFoundError('Version not found or does not belong to requirement')
  }

  // Get max version number
  const latest = await db
    .select({
      maxVersion: sql<number>`MAX(${requirementVersions.versionNumber})`,
    })
    .from(requirementVersions)
    .where(eq(requirementVersions.requirementId, requirementId))

  const nextVersion = (latest[0]?.maxVersion ?? 0) + 1

  const now = new Date().toISOString()

  // Create new version with old data but status Utkast
  const [newVersion] = await db
    .insert(requirementVersions)
    .values({
      requirementId,
      versionNumber: nextVersion,
      description: oldVersion.description,
      acceptanceCriteria: oldVersion.acceptanceCriteria,
      requirementCategoryId: oldVersion.requirementCategoryId,
      requirementTypeId: oldVersion.requirementTypeId,
      requirementTypeCategoryId: oldVersion.requirementTypeCategoryId,
      statusId: STATUS_DRAFT,
      requiresTesting: oldVersion.requiresTesting,
      createdBy: createdBy ?? oldVersion.createdBy,
      editedAt: now,
    })
    .returning()

  // Copy references
  if (oldVersion.references.length > 0) {
    await db.insert(requirementReferences).values(
      oldVersion.references.map(ref => ({
        requirementVersionId: newVersion.id,
        name: ref.name,
        owner: ref.owner,
        uri: ref.uri,
      })),
    )
  }

  if (oldVersion.versionScenarios.length > 0) {
    await db.insert(requirementVersionScenarios).values(
      oldVersion.versionScenarios.map(versionScenario => ({
        requirementVersionId: newVersion.id,
        scenarioId: versionScenario.scenarioId,
      })),
    )
  }

  return newVersion
}

export async function getVersionHistory(db: Database, requirementId: number) {
  const rows = await db.query.requirementVersions.findMany({
    where: eq(requirementVersions.requirementId, requirementId),
    orderBy: [desc(requirementVersions.versionNumber)],
    with: {
      category: true,
      type: true,
      typeCategory: true,
      status: true,
      references: true,
      versionScenarios: {
        with: {
          scenario: true,
        },
      },
    },
  })

  return rows.map(v => ({
    ...v,
    status: v.statusId,
    statusNameSv: v.status?.nameSv ?? null,
    statusNameEn: v.status?.nameEn ?? null,
    statusColor: v.status?.color ?? null,
  }))
}
