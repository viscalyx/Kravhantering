import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/drizzle/schema'
import {
  createDeviation,
  createDeviationForItemRef,
  deleteDeviation,
  recordDecision,
  recordPackageLocalDecision,
  requestReview as requestDeviationReview,
  requestPackageLocalReview,
  updateDeviation,
} from '@/lib/dal/deviations'
import {
  createSuggestion,
  recordResolution,
  requestReview,
  revertToDraft,
} from '@/lib/dal/improvement-suggestions'
import {
  createPackage,
  createPackageLocalRequirement,
  DEFAULT_PACKAGE_ITEM_STATUS_ID,
  DEVIATED_PACKAGE_ITEM_STATUS_ID,
  linkRequirementsToPackageAtomically,
  parsePackageItemRef,
  updatePackageItemFields,
  updatePackageLocalRequirementFields,
} from '@/lib/dal/requirement-packages'
import {
  approveArchiving,
  createRequirement,
  editRequirement,
  getRequirementById,
  getVersionHistory,
  initiateArchiving,
  listRequirements,
  restoreVersion,
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
  transitionStatus,
} from '@/lib/dal/requirements'
import type { Database as AppDatabase } from '@/lib/db'
import { exportToCsv } from '@/lib/export-csv'
import { handleRequirementsMcpRequest } from '@/lib/mcp/http'
import {
  createRequestContext,
  type RequestContext,
  RoleBasedAuthorizationService,
} from '@/lib/requirements/auth'
import {
  clampRequirementColumnWidth,
  clearRequirementFiltersForHiddenColumns,
  DEFAULT_FILTERS,
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  getRequirementColumnWidth,
  normalizeRequirementListColumnDefaults,
  parseRequirementVisibleColumns,
} from '@/lib/requirements/list-view'
import { createRequirementsService } from '@/lib/requirements/service'

function applyMigrations(sqlite: BetterSqlite3.Database) {
  const migrationsDir = join(process.cwd(), 'drizzle/migrations')
  const sqlFiles = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort()

  for (const file of sqlFiles) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) {
        sqlite.exec(trimmed)
      }
    }
  }
}

function createTestDb() {
  const sqlite = new BetterSqlite3(':memory:')
  applyMigrations(sqlite)
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

type TestDb = ReturnType<typeof createTestDb>['db']

let currentDb: ReturnType<typeof createTestDb>

function appDb(): AppDatabase {
  return currentDb.db as unknown as AppDatabase
}

function makeContext(headers?: HeadersInit): RequestContext {
  return createRequestContext(
    new Request('https://example.test', {
      headers,
    }),
    'rest',
  )
}

async function seedRequirementLifecycleLookups(db: TestDb) {
  await db.insert(schema.requirementStatuses).values([
    {
      color: '#3b82f6',
      id: STATUS_DRAFT,
      isSystem: true,
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
    },
    {
      color: '#eab308',
      id: STATUS_REVIEW,
      isSystem: true,
      nameEn: 'Review',
      nameSv: 'Granskning',
      sortOrder: 2,
    },
    {
      color: '#22c55e',
      id: STATUS_PUBLISHED,
      isSystem: true,
      nameEn: 'Published',
      nameSv: 'Publicerad',
      sortOrder: 3,
    },
    {
      color: '#6b7280',
      id: STATUS_ARCHIVED,
      isSystem: true,
      nameEn: 'Archived',
      nameSv: 'Arkiverad',
      sortOrder: 4,
    },
  ])

  await db.insert(schema.requirementStatusTransitions).values([
    { fromStatusId: STATUS_DRAFT, toStatusId: STATUS_REVIEW },
    { fromStatusId: STATUS_REVIEW, toStatusId: STATUS_DRAFT },
    { fromStatusId: STATUS_REVIEW, toStatusId: STATUS_PUBLISHED },
    { fromStatusId: STATUS_PUBLISHED, toStatusId: STATUS_REVIEW },
    { fromStatusId: STATUS_REVIEW, toStatusId: STATUS_ARCHIVED },
  ])
}

async function seedPackageLookups(db: TestDb) {
  await db.insert(schema.packageItemStatuses).values([
    {
      color: '#94a3b8',
      id: DEFAULT_PACKAGE_ITEM_STATUS_ID,
      nameEn: 'Included',
      nameSv: 'Inkluderad',
      sortOrder: 1,
    },
    {
      color: '#ef4444',
      id: DEVIATED_PACKAGE_ITEM_STATUS_ID,
      nameEn: 'Deviated',
      nameSv: 'Avviken',
      sortOrder: 5,
    },
  ])
}

async function createArea(
  db: TestDb,
  overrides: Partial<typeof schema.requirementAreas.$inferInsert> = {},
) {
  const [area] = await db
    .insert(schema.requirementAreas)
    .values({
      name: 'Integration',
      nextSequence: 1,
      prefix: 'INT',
      ...overrides,
    })
    .returning()

  return area
}

async function createScenario(
  db: TestDb,
  nameEn = 'Login',
  nameSv = 'Inloggning',
) {
  const [scenario] = await db
    .insert(schema.usageScenarios)
    .values({
      nameEn,
      nameSv,
    })
    .returning()

  return scenario
}

async function createNormReference(db: TestDb) {
  const [reference] = await db
    .insert(schema.normReferences)
    .values({
      issuer: 'ISO',
      name: 'ISO 25010',
      normReferenceId: 'ISO25010',
      reference: '25010',
      type: 'Standard',
      uri: 'https://example.test/iso-25010',
    })
    .returning()

  return reference
}

async function createPublishedRequirement(
  db: AppDatabase,
  areaId: number,
  description: string,
) {
  const created = await createRequirement(db, {
    description,
    requirementAreaId: areaId,
  })

  await transitionStatus(db, created.requirement.id, STATUS_REVIEW)
  const published = await transitionStatus(
    db,
    created.requirement.id,
    STATUS_PUBLISHED,
  )

  return {
    publishedVersionId: published.id,
    requirementId: created.requirement.id,
    uniqueId: created.requirement.uniqueId,
  }
}

async function getSinglePackageItem(packageId: number) {
  const [row] = await appDb()
    .select({
      id: schema.requirementPackageItems.id,
      needsReferenceId: schema.requirementPackageItems.needsReferenceId,
      packageItemStatusId: schema.requirementPackageItems.packageItemStatusId,
    })
    .from(schema.requirementPackageItems)
    .where(eq(schema.requirementPackageItems.packageId, packageId))

  return row
}

async function createPackageWithLocalSequence(
  db: TestDb,
  data: {
    name: string
    uniqueId: string
  },
) {
  const [pkg] = await db
    .insert(schema.requirementPackages)
    .values({
      ...data,
      localRequirementNextSequence: 1,
    })
    .returning()

  return pkg
}

beforeEach(() => {
  currentDb = createTestDb()
})

afterEach(() => {
  currentDb.sqlite.close()
})

describe('Spec Requirements', () => {
  it(
    '[Req: formal — README "Register" + docs/lifecycle-workflow.md] ' +
      'creates a draft requirement with an area-prefixed unique ID',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      const area = await createArea(currentDb.db)

      const created = await createRequirement(appDb(), {
        description: 'Support secure integration',
        requirementAreaId: area.id,
      })

      expect(created.requirement.uniqueId).toBe('INT0001')
      expect(created.version.statusId).toBe(STATUS_DRAFT)
      expect(created.version.versionNumber).toBe(1)
    },
  )

  it(
    '[Req: formal — docs/lifecycle-workflow.md "Published -> Draft : ' +
      'New version created"] editing a published requirement creates a new ' +
      'draft while published detail remains current',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const published = await createPublishedRequirement(
        appDb(),
        area.id,
        'Published baseline',
      )

      const nextDraft = await editRequirement(
        appDb(),
        published.requirementId,
        {
          description: 'Draft replacement',
        },
      )
      const service = createRequirementsService(appDb())

      const detail = await service.getRequirement(makeContext(), {
        id: published.requirementId,
        responseFormat: 'json',
        view: 'detail',
      })
      const history = await service.getRequirement(makeContext(), {
        id: published.requirementId,
        responseFormat: 'json',
        view: 'history',
      })

      expect(nextDraft.statusId).toBe(STATUS_DRAFT)
      expect(nextDraft.versionNumber).toBe(2)
      expect(detail.requirement.versions).toHaveLength(1)
      expect(detail.requirement.versions[0].description).toBe(
        'Published baseline',
      )
      expect(
        history.requirement.versions.map(version => version.versionNumber),
      ).toEqual([2, 1])
    },
  )

  it(
    '[Req: formal — docs/lifecycle-workflow.md "Two-Step Archiving"] ' +
      'requires initiate then approve before a requirement becomes archived',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const published = await createPublishedRequirement(
        appDb(),
        area.id,
        'Archive me safely',
      )

      await initiateArchiving(appDb(), published.requirementId)

      const inReview = await appDb().query.requirementVersions.findFirst({
        where: eq(schema.requirementVersions.id, published.publishedVersionId),
      })

      await approveArchiving(appDb(), published.requirementId)

      const archived = await appDb().query.requirementVersions.findFirst({
        where: eq(schema.requirementVersions.id, published.publishedVersionId),
      })
      const requirement = await appDb().query.requirements.findFirst({
        where: eq(schema.requirements.id, published.requirementId),
      })

      expect(inReview?.statusId).toBe(STATUS_REVIEW)
      expect(inReview?.archiveInitiatedAt).not.toBeNull()
      expect(archived?.statusId).toBe(STATUS_ARCHIVED)
      expect(archived?.archivedAt).not.toBeNull()
      expect(archived?.archiveInitiatedAt).toBeNull()
      expect(requirement?.isArchived).toBe(true)
    },
  )

  it(
    '[Req: formal — docs/lifecycle-workflow.md "Initiate archiving" ] ' +
      'blocks archiving when a newer draft already exists',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const published = await createPublishedRequirement(
        appDb(),
        area.id,
        'Published baseline',
      )

      await editRequirement(appDb(), published.requirementId, {
        description: 'Pending replacement',
      })

      await expect(
        initiateArchiving(appDb(), published.requirementId),
      ).rejects.toMatchObject({
        code: 'conflict',
        message:
          'Cannot initiate archiving while there is a pending draft or review version',
      })
    },
  )

  it(
    '[Req: formal — docs/version-lifecycle-dates.md "Effective Status"] ' +
      'keeps archived requirements visible while a replacement draft exists',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const published = await createPublishedRequirement(
        appDb(),
        area.id,
        'Published baseline',
      )

      await initiateArchiving(appDb(), published.requirementId)
      await approveArchiving(appDb(), published.requirementId)
      await restoreVersion(
        appDb(),
        published.requirementId,
        published.publishedVersionId,
      )

      const rows = await listRequirements(appDb(), {
        includeArchived: true,
        statuses: [STATUS_ARCHIVED],
      })

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        description: 'Published baseline',
        maxVersion: 2,
        pendingVersionStatusId: STATUS_DRAFT,
        status: STATUS_ARCHIVED,
        versionNumber: 1,
      })
    },
  )

  it(
    '[Req: formal — docs/lifecycle-workflow.md "Package Item Status"] ' +
      'links package items with the Included status and a trimmed needs reference',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      await seedPackageLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const published = await createPublishedRequirement(
        appDb(),
        area.id,
        'Package me',
      )
      const pkg = await createPackage(appDb(), {
        name: 'Shared package',
        uniqueId: 'SHARED-PACKAGE',
      })

      const added = await linkRequirementsToPackageAtomically(appDb(), pkg.id, {
        items: [
          {
            requirementId: published.requirementId,
            requirementVersionId: published.publishedVersionId,
          },
        ],
        needsReferenceText: '  Shared need  ',
      })

      const item = await getSinglePackageItem(pkg.id)
      const [needsReference] = await appDb()
        .select({
          id: schema.packageNeedsReferences.id,
          text: schema.packageNeedsReferences.text,
        })
        .from(schema.packageNeedsReferences)
        .where(eq(schema.packageNeedsReferences.packageId, pkg.id))

      expect(added).toBe(1)
      expect(item?.packageItemStatusId).toBe(DEFAULT_PACKAGE_ITEM_STATUS_ID)
      expect(item?.needsReferenceId).toBe(needsReference.id)
      expect(needsReference.text).toBe('Shared need')
    },
  )

  it(
    '[Req: formal — docs/lifecycle-workflow.md "Deviation Effect on Package ' +
      'Item Status"] only allows the Deviated status after an approved deviation',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      await seedPackageLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const published = await createPublishedRequirement(
        appDb(),
        area.id,
        'Need deviation evidence',
      )
      const pkg = await createPackage(appDb(), {
        name: 'Deviation package',
        uniqueId: 'DEVIATION-PACKAGE',
      })

      await linkRequirementsToPackageAtomically(appDb(), pkg.id, {
        items: [
          {
            requirementId: published.requirementId,
            requirementVersionId: published.publishedVersionId,
          },
        ],
      })

      const item = await getSinglePackageItem(pkg.id)
      if (!item) {
        throw new Error('Package item was not created')
      }

      await expect(
        updatePackageItemFields(appDb(), item.id, {
          packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
        }),
      ).rejects.toMatchObject({
        code: 'validation',
        message: 'Deviated status requires an approved deviation',
      })

      const deviation = await createDeviation(appDb(), {
        motivation: 'Approved exception',
        packageItemId: item.id,
      })
      await requestDeviationReview(appDb(), deviation.id)
      await recordDecision(appDb(), deviation.id, {
        decidedBy: 'reviewer',
        decision: schema.DEVIATION_APPROVED,
        decisionMotivation: 'Approved for package use',
      })

      await updatePackageItemFields(appDb(), item.id, {
        packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
      })

      const updatedItem = await getSinglePackageItem(pkg.id)
      expect(updatedItem?.packageItemStatusId).toBe(
        DEVIATED_PACKAGE_ITEM_STATUS_ID,
      )
    },
  )

  it(
    '[Req: formal — docs/lifecycle-workflow.md "Improvement Suggestion ' +
      'Lifecycle"] requestReview and revertToDraft toggle the review state',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const created = await createRequirement(appDb(), {
        description: 'Collect feedback',
        requirementAreaId: area.id,
      })

      const suggestion = await createSuggestion(appDb(), {
        content: 'Clarify the acceptance criteria',
        requirementId: created.requirement.id,
      })

      await requestReview(appDb(), suggestion.id)

      let row = await appDb().query.improvementSuggestions.findFirst({
        where: eq(schema.improvementSuggestions.id, suggestion.id),
      })

      expect(row?.isReviewRequested).toBe(1)
      expect(row?.reviewRequestedAt).not.toBeNull()

      await revertToDraft(appDb(), suggestion.id)

      row = await appDb().query.improvementSuggestions.findFirst({
        where: eq(schema.improvementSuggestions.id, suggestion.id),
      })

      expect(row?.isReviewRequested).toBe(0)
      expect(row?.reviewRequestedAt).toBeNull()
    },
  )

  it(
    '[Req: formal — docs/requirements-ui-behaviour.md "Filters"] clears ' +
      'filters when their columns become hidden',
    () => {
      const cleared = clearRequirementFiltersForHiddenColumns(
        {
          ...DEFAULT_FILTERS,
          areaIds: [1],
          statuses: [STATUS_PUBLISHED],
        },
        ['uniqueId', 'description', 'status'],
      )

      expect(cleared.areaIds).toBeUndefined()
      expect(cleared.statuses).toEqual([STATUS_PUBLISHED])
    },
  )

  it(
    '[Req: formal — docs/mcp-server-user-guide.md "Transport"] returns 405 ' +
      'for unsupported MCP methods',
    async () => {
      const response = await handleRequirementsMcpRequest(
        new Request('https://example.test/api/mcp', {
          method: 'PATCH',
        }),
        {} as AppDatabase,
      )

      expect(response.status).toBe(405)
      expect(await response.json()).toEqual({
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
        jsonrpc: '2.0',
      })
    },
  )

  it(
    '[Req: formal — README "Export" + docs/reports.md] emits ' +
      'semicolon CSV that preserves embedded delimiters',
    () => {
      const csv = exportToCsv(
        ['Name', 'Description'],
        [
          {
            Description: 'Line 1\nLine 2',
            Name: 'Needs; "quotes"',
          },
        ],
      )

      expect(csv.startsWith('Name;Description\r\n')).toBe(true)
      expect(csv).not.toContain('\uFEFF')
      expect(csv).toContain('"Needs; ""quotes"""')
      expect(csv).toContain('"Line 1\nLine 2"')
    },
  )
})

describe('Fitness Scenarios', () => {
  it('Scenario 1: published detail never leaks draft content', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Published truth',
    )

    await editRequirement(appDb(), published.requirementId, {
      description: 'Draft replacement that must stay private',
    })

    const service = createRequirementsService(appDb())
    const detail = await service.getRequirement(makeContext(), {
      id: published.requirementId,
      responseFormat: 'json',
      view: 'detail',
    })

    expect(detail.requirement.versions[0]).toMatchObject({
      description: 'Published truth',
      status: STATUS_PUBLISHED,
      versionNumber: 1,
    })
  })

  it('Scenario 2: pending replacement blocks archiving', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Published baseline',
    )

    await editRequirement(appDb(), published.requirementId, {
      description: 'Pending replacement',
    })

    await expect(
      initiateArchiving(appDb(), published.requirementId),
    ).rejects.toMatchObject({
      code: 'conflict',
      message:
        'Cannot initiate archiving while there is a pending draft or review version',
    })
  })

  it('Scenario 3: publishing a successor auto-archives its predecessor at the same instant', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Version one',
    )

    await editRequirement(appDb(), published.requirementId, {
      description: 'Version two draft',
    })
    await transitionStatus(appDb(), published.requirementId, STATUS_REVIEW)
    const republished = await transitionStatus(
      appDb(),
      published.requirementId,
      STATUS_PUBLISHED,
    )

    const history = await getVersionHistory(appDb(), published.requirementId)
    const archivedPredecessor = history.find(
      version => version.versionNumber === 1,
    )
    const currentPublished = history.find(
      version => version.versionNumber === 2,
    )

    expect(currentPublished?.publishedAt).not.toBeNull()
    expect(archivedPredecessor?.archivedAt).toBe(republished.publishedAt)
    expect(archivedPredecessor?.status).toBe(STATUS_ARCHIVED)
  })

  it('Scenario 4: review and archived versions are immutable until the state changes', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const created = await createRequirement(appDb(), {
      description: 'Mutable only in draft',
      requirementAreaId: area.id,
    })

    await transitionStatus(appDb(), created.requirement.id, STATUS_REVIEW)

    await expect(
      editRequirement(appDb(), created.requirement.id, {
        description: 'Illegal review edit',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Cannot edit a requirement in Review status',
    })

    await transitionStatus(appDb(), created.requirement.id, STATUS_DRAFT)
    await transitionStatus(appDb(), created.requirement.id, STATUS_REVIEW)
    await transitionStatus(appDb(), created.requirement.id, STATUS_PUBLISHED)
    await initiateArchiving(appDb(), created.requirement.id)
    await approveArchiving(appDb(), created.requirement.id)

    await expect(
      editRequirement(appDb(), created.requirement.id, {
        description: 'Illegal archived edit',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Cannot edit an archived requirement — restore it first',
    })
  })

  it('Scenario 5: archived requirements stay visible while a replacement draft exists', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Archived baseline',
    )

    await initiateArchiving(appDb(), published.requirementId)
    await approveArchiving(appDb(), published.requirementId)
    await restoreVersion(
      appDb(),
      published.requirementId,
      published.publishedVersionId,
    )

    const rows = await listRequirements(appDb(), {
      includeArchived: true,
    })

    expect(rows[0]).toMatchObject({
      description: 'Archived baseline',
      pendingVersionStatusId: STATUS_DRAFT,
      status: STATUS_ARCHIVED,
      versionNumber: 1,
    })
  })

  it('Scenario 6: deviated status requires an approved deviation for both library and package-local items', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    await seedPackageLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Shared requirement',
    )
    const pkg = await createPackageWithLocalSequence(currentDb.db, {
      name: 'Scenario package',
      uniqueId: 'SCENARIO-PACKAGE',
    })

    await linkRequirementsToPackageAtomically(appDb(), pkg.id, {
      items: [
        {
          requirementId: published.requirementId,
          requirementVersionId: published.publishedVersionId,
        },
      ],
    })

    const libraryItem = await getSinglePackageItem(pkg.id)
    if (!libraryItem) {
      throw new Error('Expected a library package item')
    }

    const localItem = await createPackageLocalRequirement(appDb(), pkg.id, {
      description: 'Package-local requirement',
    })

    await expect(
      updatePackageItemFields(appDb(), libraryItem.id, {
        packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
    })
    await expect(
      updatePackageLocalRequirementFields(appDb(), localItem.id, {
        packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
    })

    const libraryDeviation = await createDeviationForItemRef(appDb(), {
      itemRef: `lib:${libraryItem.id}`,
      motivation: 'Approved library deviation',
    })
    await requestDeviationReview(appDb(), libraryDeviation.id)
    await recordDecision(appDb(), libraryDeviation.id, {
      decidedBy: 'reviewer',
      decision: schema.DEVIATION_APPROVED,
      decisionMotivation: 'Approved library deviation',
    })

    const localDeviation = await createDeviationForItemRef(appDb(), {
      itemRef: `local:${localItem.id}`,
      motivation: 'Approved local deviation',
    })
    await requestPackageLocalReview(appDb(), localDeviation.id)
    await recordPackageLocalDecision(appDb(), localDeviation.id, {
      decidedBy: 'reviewer',
      decision: schema.DEVIATION_APPROVED,
      decisionMotivation: 'Approved local deviation',
    })

    await updatePackageItemFields(appDb(), libraryItem.id, {
      packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
    })
    await updatePackageLocalRequirementFields(appDb(), localItem.id, {
      packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
    })

    const updatedLibrary = await getSinglePackageItem(pkg.id)
    const updatedLocal = await appDb().query.packageLocalRequirements.findFirst(
      {
        where: eq(schema.packageLocalRequirements.id, localItem.id),
      },
    )

    expect(updatedLibrary?.packageItemStatusId).toBe(
      DEVIATED_PACKAGE_ITEM_STATUS_ID,
    )
    expect(updatedLocal?.packageItemStatusId).toBe(
      DEVIATED_PACKAGE_ITEM_STATUS_ID,
    )
  })

  it('Scenario 7: needs-reference linking never leaks orphan metadata', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    await seedPackageLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Link me once',
    )
    const pkg = await createPackage(appDb(), {
      name: 'Link package',
      uniqueId: 'LINK-PACKAGE',
    })

    await linkRequirementsToPackageAtomically(appDb(), pkg.id, {
      items: [
        {
          requirementId: published.requirementId,
          requirementVersionId: published.publishedVersionId,
        },
      ],
    })

    const addedAgain = await linkRequirementsToPackageAtomically(
      appDb(),
      pkg.id,
      {
        items: [
          {
            requirementId: published.requirementId,
            requirementVersionId: published.publishedVersionId,
          },
        ],
        needsReferenceText: '  Duplicate-only need  ',
      },
    )

    const needsReferences = await appDb()
      .select({
        text: schema.packageNeedsReferences.text,
      })
      .from(schema.packageNeedsReferences)
      .where(eq(schema.packageNeedsReferences.packageId, pkg.id))

    expect(addedAgain).toBe(0)
    expect(needsReferences).toEqual([])
  })

  it('Scenario 8: suggestion resolution is impossible without review', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const created = await createRequirement(appDb(), {
      description: 'Feedback-heavy requirement',
      requirementAreaId: area.id,
    })
    const suggestion = await createSuggestion(appDb(), {
      content: 'Clarify the scope',
      requirementId: created.requirement.id,
    })

    await expect(
      recordResolution(appDb(), suggestion.id, {
        resolution: schema.SUGGESTION_RESOLVED,
        resolutionMotivation: 'Should fail before review',
        resolvedBy: 'reviewer',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message:
        'Can only resolve or dismiss suggestions that have been submitted for review',
    })

    await requestReview(appDb(), suggestion.id)
    await recordResolution(appDb(), suggestion.id, {
      resolution: schema.SUGGESTION_RESOLVED,
      resolutionMotivation: 'Reviewed and resolved',
      resolvedBy: 'reviewer',
    })

    await expect(
      recordResolution(appDb(), suggestion.id, {
        resolution: schema.SUGGESTION_DISMISSED,
        resolutionMotivation: 'Second resolution must fail',
        resolvedBy: 'reviewer',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message:
        'A resolution has already been recorded for this improvement suggestion',
    })
  })

  it('Scenario 9: deviation decisions are write-once audit events', async () => {
    await seedRequirementLifecycleLookups(currentDb.db)
    await seedPackageLookups(currentDb.db)
    const area = await createArea(currentDb.db)
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Deviation source',
    )
    const pkg = await createPackage(appDb(), {
      name: 'Decision package',
      uniqueId: 'DECISION-PACKAGE',
    })

    await linkRequirementsToPackageAtomically(appDb(), pkg.id, {
      items: [
        {
          requirementId: published.requirementId,
          requirementVersionId: published.publishedVersionId,
        },
      ],
    })

    const item = await getSinglePackageItem(pkg.id)
    if (!item) {
      throw new Error('Expected package item')
    }

    const deviation = await createDeviation(appDb(), {
      motivation: 'One final decision only',
      packageItemId: item.id,
    })
    await requestDeviationReview(appDb(), deviation.id)
    await recordDecision(appDb(), deviation.id, {
      decidedBy: 'reviewer',
      decision: schema.DEVIATION_APPROVED,
      decisionMotivation: 'Approved once',
    })

    await expect(
      recordDecision(appDb(), deviation.id, {
        decidedBy: 'reviewer',
        decision: schema.DEVIATION_REJECTED,
        decisionMotivation: 'Second decision must fail',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'A decision has already been recorded for this deviation',
    })

    await expect(
      updateDeviation(appDb(), deviation.id, {
        motivation: 'Mutating a decided deviation should fail',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
    })
    await expect(deleteDeviation(appDb(), deviation.id)).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('Scenario 10: MCP tool inventory matches documentation', () => {
    const serverSrc = readFileSync(
      join(__dirname, '../../lib/mcp/server.ts'),
      'utf-8',
    )
    const registrations = serverSrc.match(/server\.registerTool\(/g)
    const codeCount = registrations ? registrations.length : 0

    const contributorGuide = readFileSync(
      join(__dirname, '../../docs/mcp-server-contributor-guide.md'),
      'utf-8',
    )
    const countMatch = contributorGuide.match(/Exposed MCP tools:\s*(\d+)/)
    expect(countMatch).not.toBeNull()
    const docCount = Number(countMatch?.[1])

    const userGuide = readFileSync(
      join(__dirname, '../../docs/mcp-server-user-guide.md'),
      'utf-8',
    )
    const toolsSection =
      userGuide.split('### Tools')[1]?.split('### Resources')[0] ?? ''
    const toolEntries = toolsSection.match(/^- `requirements_\w+`/gm)
    const userGuideCount = toolEntries ? toolEntries.length : 0

    expect(codeCount).toBeGreaterThan(0)
    expect(docCount).toBe(codeCount)
    expect(userGuideCount).toBe(codeCount)
  })
})

describe('Boundaries and Edge Cases', () => {
  it(
    '[Req: inferred — from createRequirement() dedupe guards] deduplicates ' +
      'scenario and norm-reference joins for draft creation',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const scenario = await createScenario(currentDb.db)
      const reference = await createNormReference(currentDb.db)

      const created = await createRequirement(appDb(), {
        description: 'Deduplicate joins',
        normReferenceIds: [reference.id, reference.id],
        requirementAreaId: area.id,
        scenarioIds: [scenario.id, scenario.id],
      })
      const detail = await getRequirementById(appDb(), created.requirement.id)

      expect(detail?.versions[0].versionNormReferences).toHaveLength(1)
      expect(detail?.versions[0].versionScenarios).toHaveLength(1)
    },
  )

  it(
    '[Req: inferred — from normalizePackageLocalRequirementInput() guards] ' +
      'requires verificationMethod when package-local requirements require testing',
    async () => {
      await seedPackageLookups(currentDb.db)
      const pkg = await createPackageWithLocalSequence(currentDb.db, {
        name: 'Local package',
        uniqueId: 'LOCAL-PACKAGE',
      })

      await expect(
        createPackageLocalRequirement(appDb(), pkg.id, {
          description: 'Needs verification details',
          requiresTesting: true,
        }),
      ).rejects.toMatchObject({
        code: 'validation',
        message: 'verificationMethod is required when requiresTesting is true',
      })
    },
  )

  it(
    '[Req: inferred — from createPackageLocalRequirement() normalization] ' +
      'deduplicates package-local scenario and norm-reference joins',
    async () => {
      await seedPackageLookups(currentDb.db)
      const pkg = await createPackageWithLocalSequence(currentDb.db, {
        name: 'Local package',
        uniqueId: 'LOCAL-DEDUPE',
      })
      const scenario = await createScenario(currentDb.db)
      const reference = await createNormReference(currentDb.db)

      const created = await createPackageLocalRequirement(appDb(), pkg.id, {
        description: '  Package-local requirement  ',
        normReferenceIds: [reference.id, reference.id, 0],
        requiresTesting: true,
        scenarioIds: [scenario.id, scenario.id, -1],
        verificationMethod: '  Manual review  ',
      })

      expect(created.description).toBe('Package-local requirement')
      expect(created.verificationMethod).toBe('Manual review')
      expect(created.normReferences).toHaveLength(1)
      expect(created.scenarios).toHaveLength(1)
      expect(created.packageItemStatusId).toBe(DEFAULT_PACKAGE_ITEM_STATUS_ID)
    },
  )

  it(
    '[Req: regression — createPackageLocalRequirement() allocator] ' +
      'assigns sequential KRAV unique IDs across back-to-back creates',
    async () => {
      await seedPackageLookups(currentDb.db)
      const pkg = await createPackageWithLocalSequence(currentDb.db, {
        name: 'Sequence package',
        uniqueId: 'SEQ-PKG',
      })

      const first = await createPackageLocalRequirement(appDb(), pkg.id, {
        description: 'First local requirement',
      })
      const second = await createPackageLocalRequirement(appDb(), pkg.id, {
        description: 'Second local requirement',
      })

      expect(first.uniqueId).toBe('KRAV0001')
      expect(second.uniqueId).toBe('KRAV0002')

      // A validation failure must not advance the sequence counter
      await expect(
        createPackageLocalRequirement(appDb(), pkg.id, {
          description: '',
        }),
      ).rejects.toMatchObject({ code: 'validation' })

      const third = await createPackageLocalRequirement(appDb(), pkg.id, {
        description: 'Third local requirement',
      })
      expect(third.uniqueId).toBe('KRAV0003')
    },
  )

  it(
    '[Req: inferred — from normalizeRequirementListColumnDefaults() fallback] ' +
      'reverts corrupted admin defaults to the safe baseline',
    () => {
      const normalized = normalizeRequirementListColumnDefaults([
        {
          columnId: 'status',
          defaultVisible: true,
          sortOrder: 2,
        },
        {
          columnId: 'area',
          defaultVisible: true,
          sortOrder: 2,
        },
      ])

      expect(normalized).toEqual(DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS)
    },
  )

  it(
    '[Req: inferred — from parseRequirementVisibleColumns() fallback] ' +
      'falls back to default visible columns when persisted JSON is malformed',
    () => {
      const parsed = parseRequirementVisibleColumns('{"broken"', {
        columnDefaults: DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
      })

      expect(parsed).toEqual(DEFAULT_VISIBLE_REQUIREMENT_COLUMNS)
    },
  )

  it(
    '[Req: inferred — from clampRequirementColumnWidth() and ' +
      'getRequirementColumnWidth()] clamps and defaults column widths safely',
    () => {
      const defaultWidth = getRequirementColumnWidth('status', undefined)

      expect(clampRequirementColumnWidth('status', 0)).toBeGreaterThan(0)
      expect(getRequirementColumnWidth('status', { status: Number.NaN })).toBe(
        defaultWidth,
      )
    },
  )

  it.each([
    {
      expected: { id: 7, kind: 'library' },
      input: 'lib:7',
    },
    {
      expected: { id: 11, kind: 'packageLocal' },
      input: 'local:11',
    },
    {
      expected: null,
      input: 'local:0',
    },
    {
      expected: null,
      input: 'oops',
    },
  ])('[Req: inferred — from parsePackageItemRef() guard] parses $input safely', ({
    expected,
    input,
  }) => {
    expect(parsePackageItemRef(input)).toEqual(expected)
  })

  it(
    '[Req: inferred — from createRequestContext() and ' +
      'RoleBasedAuthorizationService] derives actor context from headers and ' +
      'enforces explicit role policies',
    async () => {
      const context = createRequestContext(
        new Request('https://example.test', {
          headers: {
            'x-user-id': 'alice',
            'x-user-roles': 'Admin, Reviewer, ',
          },
        }),
        'mcp',
        'requirements_get_requirement',
      )
      const auth = new RoleBasedAuthorizationService({
        get_requirement: ['Reviewer'],
      })

      expect(context.actor).toEqual({
        id: 'alice',
        isAuthenticated: true,
        roles: ['Admin', 'Reviewer'],
        source: 'headers',
      })
      expect(context.toolName).toBe('requirements_get_requirement')
      expect(context.requestId).not.toBe('')

      await expect(
        auth.assertAuthorized(
          {
            id: 1,
            kind: 'get_requirement',
          },
          context,
        ),
      ).resolves.toBeUndefined()

      await expect(
        auth.assertAuthorized(
          {
            kind: 'manage_requirement',
            operation: 'edit',
            id: 1,
          },
          context,
        ),
      ).rejects.toMatchObject({
        code: 'forbidden',
        message: 'No policy defined for action manage_requirement',
      })
    },
  )

  it(
    '[Req: inferred — from transitionStatus() context-aware review guards] ' +
      'distinguishes publishing review from archiving review and preserves ' +
      'publishedAt when archiving is canceled',
    async () => {
      await seedRequirementLifecycleLookups(currentDb.db)
      const area = await createArea(currentDb.db)
      const created = await createRequirement(appDb(), {
        description: 'Transition guard',
        requirementAreaId: area.id,
      })

      await transitionStatus(appDb(), created.requirement.id, STATUS_REVIEW)

      await expect(
        transitionStatus(appDb(), created.requirement.id, STATUS_ARCHIVED),
      ).rejects.toMatchObject({
        code: 'conflict',
        message:
          'Cannot archive from publishing review; initiate archiving from Published state first',
      })

      await transitionStatus(appDb(), created.requirement.id, STATUS_DRAFT)
      await transitionStatus(appDb(), created.requirement.id, STATUS_REVIEW)
      const published = await transitionStatus(
        appDb(),
        created.requirement.id,
        STATUS_PUBLISHED,
      )
      const firstPublishedAt = published.publishedAt

      await transitionStatus(appDb(), created.requirement.id, STATUS_REVIEW)
      const canceled = await transitionStatus(
        appDb(),
        created.requirement.id,
        STATUS_PUBLISHED,
      )

      expect(canceled.publishedAt).toBe(firstPublishedAt)
      expect(canceled.archiveInitiatedAt).toBeNull()
    },
  )
})
