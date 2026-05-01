import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createDeviation,
  createDeviationForItemRef,
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
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
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/lib/dal/improvement-suggestions'
import {
  createPackage,
  createPackageLocalRequirement,
  linkRequirementsToPackageAtomically,
  updatePackageItemFields,
  updatePackageLocalRequirementFields,
} from '@/lib/dal/requirement-packages'
import {
  approveArchiving,
  cancelArchiving,
  createRequirement,
  editRequirement,
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
import type { SqlServerDatabase } from '@/lib/db'
import {
  DEFAULT_PACKAGE_ITEM_STATUS_ID,
  DEVIATED_PACKAGE_ITEM_STATUS_ID,
} from '@/lib/package-item-status-constants'
import {
  attachVerifiedActor,
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import { createRequirementsService } from '@/lib/requirements/service'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import { tryGetSqlServerDatabaseUrl } from '@/lib/typeorm/sqlserver-config'
import {
  resetSqlServerDatabase,
  runSqlServerMigrations,
} from '@/scripts/db-sqlserver-admin.mjs'

/**
 * Fitness-to-purpose scenarios from tests/quality/QUALITY.md.
 *
 * Scenario names here must match the QUALITY.md `vitest -t "Scenario N: ..."`
 * invocations verbatim so that spec-referenced commands keep working.
 *
 * Scenario 10 is a pure file-content check and always runs as part of
 * `npm run test`.
 *
 * Scenarios 1-9 and 11 exercise lifecycle invariants that require a real
 * SQL Server instance. The harness derives a connection URL automatically from
 * the standard DB_* environment variables (the same ones used by the dev
 * scripts) and swaps the database name to a dedicated
 * `<DB_NAME>_functional_tests` instance so the development data is never
 * touched. Set `SQLSERVER_FUNCTIONAL_TESTS_URL` to override the derived URL,
 * or `SQLSERVER_FUNCTIONAL_TESTS_DB_NAME` to override only the database
 * name. When neither the env override nor the DB_* values are present the
 * scenarios are skipped.
 */

const repoRoot = process.cwd()
const mcpServerPath = join(repoRoot, 'lib', 'mcp', 'server.ts')
const contributorGuidePath = join(
  repoRoot,
  'docs',
  'mcp-server-contributor-guide.md',
)
const userGuidePath = join(repoRoot, 'docs', 'mcp-server-user-guide.md')

function countRegisterToolCalls(source: string): number {
  return source.match(/\bserver\.registerTool\s*\(/g)?.length ?? 0
}

function extractContributorGuideToolCount(source: string): number | null {
  const match = source.match(/Exposed MCP tools:\s*(\d+)/)
  return match ? Number.parseInt(match[1], 10) : null
}

function countUserGuideToolBullets(source: string): number {
  return source
    .split(/\r?\n/)
    .filter(line => /^- `requirements_[a-z_]+`/.test(line)).length
}

it('Scenario 10: MCP tool inventory matches documentation', () => {
  const mcpServerSource = readFileSync(mcpServerPath, 'utf8')
  const contributorGuideSource = readFileSync(contributorGuidePath, 'utf8')
  const userGuideSource = readFileSync(userGuidePath, 'utf8')

  const registerToolCount = countRegisterToolCalls(mcpServerSource)
  const contributorGuideToolCount = extractContributorGuideToolCount(
    contributorGuideSource,
  )
  const userGuideToolBullets = countUserGuideToolBullets(userGuideSource)

  expect(registerToolCount).toBeGreaterThan(0)
  expect(
    contributorGuideToolCount,
    'docs/mcp-server-contributor-guide.md must declare an "Exposed MCP tools: <n>" line',
  ).not.toBeNull()

  expect(
    contributorGuideToolCount,
    `contributor guide lists ${contributorGuideToolCount} tools but lib/mcp/server.ts registers ${registerToolCount}`,
  ).toBe(registerToolCount)

  expect(
    userGuideToolBullets,
    `user guide lists ${userGuideToolBullets} tool bullets but lib/mcp/server.ts registers ${registerToolCount}`,
  ).toBe(registerToolCount)
})

function resolveFunctionalTestsUrl(): string | null {
  const explicit = process.env.SQLSERVER_FUNCTIONAL_TESTS_URL?.trim()
  if (explicit) return explicit

  const baseUrl = tryGetSqlServerDatabaseUrl(process.env, false)
  if (!baseUrl) return null

  const url = new URL(baseUrl)
  const overrideDbName = process.env.SQLSERVER_FUNCTIONAL_TESTS_DB_NAME?.trim()
  const currentDbName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const nextDbName =
    overrideDbName ||
    (currentDbName
      ? `${currentDbName}_functional_tests`
      : 'kravhantering_functional_tests')
  url.pathname = `/${encodeURIComponent(nextDbName)}`
  return url.toString()
}

const FUNCTIONAL_TESTS_URL = resolveFunctionalTestsUrl()

// Tables that the lifecycle scenarios populate and need cleared between tests.
// Ordered child → parent so foreign key constraints never reject a DELETE.
const TRANSACTIONAL_TABLES = [
  'requirement_version_usage_scenarios',
  'requirement_version_norm_references',
  'package_local_requirement_usage_scenarios',
  'package_local_requirement_norm_references',
  'package_local_requirement_deviations',
  'deviations',
  'improvement_suggestions',
  'requirement_package_items',
  'package_local_requirements',
  'package_needs_references',
  'requirement_versions',
  'requirements',
  'requirement_packages',
  'requirement_areas',
  'usage_scenarios',
  'norm_references',
  'owners',
] as const

let db: SqlServerDatabase | null = null

async function seedLookups(target: SqlServerDatabase): Promise<void> {
  const statuses: Array<[number, string, string, string, number, number]> = [
    [STATUS_DRAFT, 'Utkast', 'Draft', '#3b82f6', 1, 1],
    [STATUS_REVIEW, 'Granskning', 'Review', '#eab308', 2, 1],
    [STATUS_PUBLISHED, 'Publicerad', 'Published', '#22c55e', 3, 1],
    [STATUS_ARCHIVED, 'Arkiverad', 'Archived', '#6b7280', 4, 1],
  ]
  for (const [id, nameSv, nameEn, color, sortOrder, isSystem] of statuses) {
    await target.query(
      `IF NOT EXISTS (SELECT 1 FROM requirement_statuses WHERE id = @0)
         BEGIN
           SET IDENTITY_INSERT requirement_statuses ON;
           INSERT INTO requirement_statuses (id, name_sv, name_en, color, sort_order, is_system)
             VALUES (@0, @1, @2, @3, @4, @5);
           SET IDENTITY_INSERT requirement_statuses OFF;
         END`,
      [id, nameSv, nameEn, color, sortOrder, isSystem],
    )
  }

  const transitions: Array<[number, number]> = [
    [STATUS_DRAFT, STATUS_REVIEW],
    [STATUS_REVIEW, STATUS_DRAFT],
    [STATUS_REVIEW, STATUS_PUBLISHED],
    [STATUS_PUBLISHED, STATUS_REVIEW],
    [STATUS_REVIEW, STATUS_ARCHIVED],
  ]
  for (const [from, to] of transitions) {
    await target.query(
      `IF NOT EXISTS (
         SELECT 1 FROM requirement_status_transitions
         WHERE from_requirement_status_id = @0 AND to_requirement_status_id = @1
       )
         INSERT INTO requirement_status_transitions
           (from_requirement_status_id, to_requirement_status_id)
           VALUES (@0, @1)`,
      [from, to],
    )
  }

  const itemStatuses: Array<[number, string, string, string, number]> = [
    [DEFAULT_PACKAGE_ITEM_STATUS_ID, 'Inkluderad', 'Included', '#94a3b8', 1],
    [DEVIATED_PACKAGE_ITEM_STATUS_ID, 'Avviken', 'Deviated', '#ef4444', 5],
  ]
  for (const [id, nameSv, nameEn, color, sortOrder] of itemStatuses) {
    await target.query(
      `IF NOT EXISTS (SELECT 1 FROM package_item_statuses WHERE id = @0)
         BEGIN
           SET IDENTITY_INSERT package_item_statuses ON;
           INSERT INTO package_item_statuses (id, name_sv, name_en, color, sort_order)
             VALUES (@0, @1, @2, @3, @4);
           SET IDENTITY_INSERT package_item_statuses OFF;
         END`,
      [id, nameSv, nameEn, color, sortOrder],
    )
  }
}

async function clearTransactionalTables(
  target: SqlServerDatabase,
): Promise<void> {
  for (const table of TRANSACTIONAL_TABLES) {
    await target.query(`DELETE FROM ${table}`)
    // Only RESEED if the table has an identity column AND has previously
    // contained rows. RESEED on a never-inserted table sets the next IDENTITY
    // value to the reseed value itself (e.g. 0) instead of seed+increment.
    await target.query(
      `IF EXISTS (
         SELECT 1 FROM sys.identity_columns ic
           JOIN sys.tables t ON t.object_id = ic.object_id
           WHERE t.name = '${table}'
       )
       AND (SELECT last_value FROM sys.identity_columns ic
              JOIN sys.tables t ON t.object_id = ic.object_id
              WHERE t.name = '${table}') IS NOT NULL
         DBCC CHECKIDENT ('${table}', RESEED, 0) WITH NO_INFOMSGS`,
    )
  }
}

function appDb(): SqlServerDatabase {
  if (!db) {
    throw new Error(
      'Functional-test DataSource is not initialized; did beforeAll run?',
    )
  }
  return db
}

function makeContext(headers?: HeadersInit): Promise<RequestContext> {
  const request = new Request('https://example.test', { headers })
  attachVerifiedActor(request, {
    id: 'functional-test-actor',
    displayName: 'Functional Test Actor',
    hsaId: 'SE2321000032-functional1',
    roles: ['Admin'],
    source: 'oidc',
    isAuthenticated: true,
  })
  return createRequestContext(request, 'rest')
}

async function createArea(
  target: SqlServerDatabase,
  overrides: { name?: string; prefix?: string } = {},
): Promise<{ id: number; name: string; prefix: string }> {
  const now = new Date()
  const rows = (await target.query(
    `INSERT INTO requirement_areas (prefix, name, next_sequence, created_at, updated_at)
       OUTPUT INSERTED.id AS id, INSERTED.name AS name, INSERTED.prefix AS prefix
       VALUES (@0, @1, 1, @2, @2)`,
    [overrides.prefix ?? 'INT', overrides.name ?? 'Integration', now],
  )) as Array<{ id: number; name: string; prefix: string }>
  return rows[0] as { id: number; name: string; prefix: string }
}

async function createPublishedRequirement(
  target: SqlServerDatabase,
  areaId: number,
  description: string,
): Promise<{
  requirementId: number
  revisionToken: string
  uniqueId: string
  publishedVersionId: number
}> {
  const created = await createRequirement(target, {
    description,
    requirementAreaId: areaId,
  })
  await transitionStatus(target, created.requirement.id, STATUS_REVIEW)
  const published = await transitionStatus(
    target,
    created.requirement.id,
    STATUS_PUBLISHED,
  )
  return {
    requirementId: created.requirement.id,
    revisionToken: published.revisionToken,
    uniqueId: created.requirement.uniqueId,
    publishedVersionId: published.id,
  }
}

async function getSinglePackageItem(
  target: SqlServerDatabase,
  packageId: number,
): Promise<{ id: number; packageItemStatusId: number } | null> {
  const rows = (await target.query(
    `SELECT TOP (1) id, package_item_status_id AS packageItemStatusId
       FROM requirement_package_items WHERE requirement_package_id = @0`,
    [packageId],
  )) as Array<{ id: number; packageItemStatusId: number }>
  return rows[0] ?? null
}

const describeIfSqlServer = FUNCTIONAL_TESTS_URL ? describe : describe.skip

describeIfSqlServer('Fitness Scenarios (SQL Server)', () => {
  beforeAll(async () => {
    if (!FUNCTIONAL_TESTS_URL) return
    await resetSqlServerDatabase(FUNCTIONAL_TESTS_URL)
    await runSqlServerMigrations(FUNCTIONAL_TESTS_URL)
    const dataSource = createAppDataSource({
      url: FUNCTIONAL_TESTS_URL,
      name: 'functional-tests',
    })
    await dataSource.initialize()
    db = dataSource
    await seedLookups(dataSource)
  }, 120_000)

  afterAll(async () => {
    if (db) {
      await db.destroy()
      db = null
    }
  })

  beforeEach(async () => {
    if (!db) return
    await clearTransactionalTables(db)
    await seedLookups(db)
  })

  it('Scenario 1: published detail never leaks draft content', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Published truth',
    )

    await editRequirement(appDb(), published.requirementId, {
      baseRevisionToken: published.revisionToken,
      baseVersionId: published.publishedVersionId,
      description: 'Draft replacement that must stay private',
    })

    const service = createRequirementsService(appDb())
    const detail = await service.getRequirement(await makeContext(), {
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
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Published baseline',
    )

    await editRequirement(appDb(), published.requirementId, {
      baseRevisionToken: published.revisionToken,
      baseVersionId: published.publishedVersionId,
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
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Version one',
    )

    await editRequirement(appDb(), published.requirementId, {
      baseRevisionToken: published.revisionToken,
      baseVersionId: published.publishedVersionId,
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
    const area = await createArea(appDb())
    const created = await createRequirement(appDb(), {
      description: 'Mutable only in draft',
      requirementAreaId: area.id,
    })

    const reviewVersion = await transitionStatus(
      appDb(),
      created.requirement.id,
      STATUS_REVIEW,
    )

    await expect(
      editRequirement(appDb(), created.requirement.id, {
        baseRevisionToken: reviewVersion.revisionToken,
        baseVersionId: reviewVersion.id,
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
    const [archivedVersion] = await getVersionHistory(
      appDb(),
      created.requirement.id,
    )

    await expect(
      editRequirement(appDb(), created.requirement.id, {
        baseRevisionToken: archivedVersion.revisionToken,
        baseVersionId: archivedVersion.id,
        description: 'Illegal archived edit',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'Cannot edit an archived requirement — restore it first',
    })
  })

  it('Scenario 5: archived requirements stay visible while a replacement draft exists', async () => {
    const area = await createArea(appDb())
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

    const rows = await listRequirements(appDb(), { includeArchived: true })

    expect(rows[0]).toMatchObject({
      description: 'Archived baseline',
      pendingVersionStatusId: STATUS_DRAFT,
      status: STATUS_ARCHIVED,
      versionNumber: 1,
    })
  })

  it('Scenario 6: deviated status requires an approved deviation for both library and package-local items', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Shared requirement',
    )
    const pkg = await createPackage(appDb(), {
      name: 'Scenario package',
      uniqueId: 'SCENARIO-PACKAGE',
    })

    await linkRequirementsToPackageAtomically(appDb(), pkg.id, {
      requirementIds: [published.requirementId],
    })

    const libraryItem = await getSinglePackageItem(appDb(), pkg.id)
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
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      updatePackageLocalRequirementFields(appDb(), localItem.id, {
        packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
      }),
    ).rejects.toMatchObject({ code: 'validation' })

    const libraryDeviation = await createDeviationForItemRef(appDb(), {
      itemRef: `lib:${libraryItem.id}`,
      motivation: 'Approved library deviation',
    })
    await requestDeviationReview(appDb(), libraryDeviation.id)
    await recordDecision(appDb(), libraryDeviation.id, {
      decidedBy: 'reviewer',
      decision: DEVIATION_APPROVED,
      decisionMotivation: 'Approved library deviation',
    })

    const localDeviation = await createDeviationForItemRef(appDb(), {
      itemRef: `local:${localItem.id}`,
      motivation: 'Approved local deviation',
    })
    await requestPackageLocalReview(appDb(), localDeviation.id)
    await recordPackageLocalDecision(appDb(), localDeviation.id, {
      decidedBy: 'reviewer',
      decision: DEVIATION_APPROVED,
      decisionMotivation: 'Approved local deviation',
    })

    await updatePackageItemFields(appDb(), libraryItem.id, {
      packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
    })
    await updatePackageLocalRequirementFields(appDb(), localItem.id, {
      packageItemStatusId: DEVIATED_PACKAGE_ITEM_STATUS_ID,
    })

    const updatedLibrary = await getSinglePackageItem(appDb(), pkg.id)
    const updatedLocalRows = (await appDb().query(
      `SELECT package_item_status_id AS packageItemStatusId
         FROM package_local_requirements WHERE id = @0`,
      [localItem.id],
    )) as Array<{ packageItemStatusId: number }>
    const updatedLocal = updatedLocalRows[0]

    expect(updatedLibrary?.packageItemStatusId).toBe(
      DEVIATED_PACKAGE_ITEM_STATUS_ID,
    )
    expect(updatedLocal?.packageItemStatusId).toBe(
      DEVIATED_PACKAGE_ITEM_STATUS_ID,
    )
  })

  it('Scenario 7: needs-reference linking never leaks orphan metadata', async () => {
    const area = await createArea(appDb())
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
      requirementIds: [published.requirementId],
    })

    const addedAgain = await linkRequirementsToPackageAtomically(
      appDb(),
      pkg.id,
      {
        requirementIds: [published.requirementId],
        needsReferenceText: '  Duplicate-only need  ',
      },
    )

    const needsReferences = (await appDb().query(
      `SELECT text FROM package_needs_references WHERE package_id = @0`,
      [pkg.id],
    )) as Array<{ text: string }>

    expect(addedAgain).toBe(0)
    expect(needsReferences).toEqual([])
  })

  it('Scenario 8: suggestion resolution is impossible without review', async () => {
    const area = await createArea(appDb())
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
        resolution: SUGGESTION_RESOLVED,
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
      resolution: SUGGESTION_RESOLVED,
      resolutionMotivation: 'Reviewed and resolved',
      resolvedBy: 'reviewer',
    })

    await expect(
      recordResolution(appDb(), suggestion.id, {
        resolution: SUGGESTION_DISMISSED,
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
    const area = await createArea(appDb())
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
      requirementIds: [published.requirementId],
    })

    const item = await getSinglePackageItem(appDb(), pkg.id)
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
      decision: DEVIATION_APPROVED,
      decisionMotivation: 'Approved once',
    })

    await expect(
      recordDecision(appDb(), deviation.id, {
        decidedBy: 'reviewer',
        decision: DEVIATION_REJECTED,
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
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(deleteDeviation(appDb(), deviation.id)).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('Scenario 11: stale draft edits are rejected before replacing latest content', async () => {
    const area = await createArea(appDb())
    const created = await createRequirement(appDb(), {
      description: 'Original draft',
      requirementAreaId: area.id,
    })

    const firstSave = await editRequirement(appDb(), created.requirement.id, {
      baseRevisionToken: created.version.revisionToken,
      baseVersionId: created.version.id,
      description: 'First saved draft',
    })

    await expect(
      editRequirement(appDb(), created.requirement.id, {
        baseRevisionToken: created.version.revisionToken,
        baseVersionId: created.version.id,
        description: 'Stale overwrite attempt',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      details: {
        baseVersionId: created.version.id,
        latestVersionId: created.version.id,
        reason: 'stale_requirement_edit',
      },
    })

    const history = await getVersionHistory(appDb(), created.requirement.id)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      description: 'First saved draft',
      editedAt: firstSave.editedAt,
      status: STATUS_DRAFT,
    })
  })

  it('Scenario 12: concurrent initiateArchiving attempts are serialized', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Concurrent initiate baseline',
    )

    const results = await Promise.allSettled([
      initiateArchiving(appDb(), published.requirementId),
      initiateArchiving(appDb(), published.requirementId),
    ])

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'conflict',
    })

    const history = await getVersionHistory(appDb(), published.requirementId)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      status: STATUS_REVIEW,
      versionNumber: 1,
    })
    expect(history[0]?.archiveInitiatedAt).not.toBeNull()
  })

  it('Scenario 12: concurrent approveArchiving attempts are serialized', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Concurrent approve baseline',
    )
    await initiateArchiving(appDb(), published.requirementId)

    const results = await Promise.allSettled([
      approveArchiving(appDb(), published.requirementId),
      approveArchiving(appDb(), published.requirementId),
    ])

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'conflict',
    })

    const history = await getVersionHistory(appDb(), published.requirementId)
    expect(history[0]).toMatchObject({
      status: STATUS_ARCHIVED,
      versionNumber: 1,
    })
    expect(history[0]?.archivedAt).not.toBeNull()
    const flagRows = (await appDb().query(
      `SELECT is_archived AS isArchived FROM requirements WHERE id = @0`,
      [published.requirementId],
    )) as Array<{ isArchived: number | boolean }>
    expect(Number(flagRows[0]?.isArchived)).toBe(1)
  })

  it('Scenario 12: concurrent approveArchiving and cancelArchiving cannot both succeed', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Concurrent approve-vs-cancel baseline',
    )
    await initiateArchiving(appDb(), published.requirementId)

    const results = await Promise.allSettled([
      approveArchiving(appDb(), published.requirementId),
      cancelArchiving(appDb(), published.requirementId),
    ])

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'conflict',
    })

    const history = await getVersionHistory(appDb(), published.requirementId)
    const v1 = history.find(v => v.versionNumber === 1)
    expect(v1).toBeDefined()
    expect([STATUS_ARCHIVED, STATUS_PUBLISHED]).toContain(v1?.status)
    expect(v1?.archiveInitiatedAt).toBeNull()

    const flagRows = (await appDb().query(
      `SELECT is_archived AS isArchived FROM requirements WHERE id = @0`,
      [published.requirementId],
    )) as Array<{ isArchived: number | boolean }>
    const isArchived = Number(flagRows[0]?.isArchived) === 1
    if (v1?.status === STATUS_ARCHIVED) {
      expect(isArchived).toBe(true)
    } else {
      expect(isArchived).toBe(false)
    }
  })

  it('Scenario 12: approve/cancel target only the version with archive_initiated_at and never archive a newer Draft/Review', async () => {
    // Seed a state that cannot be reached through the public API after the
    // initiateArchiving fix: V1 is in Review with archive_initiated_at set,
    // V2 exists as a newer Draft. Approve/cancel must operate strictly on V1
    // and leave V2 untouched.
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Strict-target baseline',
    )

    // Create V2 draft via a normal edit while V1 is still Published.
    const v2 = await editRequirement(appDb(), published.requirementId, {
      baseRevisionToken: published.revisionToken,
      baseVersionId: published.publishedVersionId,
      description: 'Successor draft (must never be archived)',
    })

    // Manually flip V1 to Review with archive_initiated_at set, simulating a
    // legacy/inconsistent state. The public API would now reject this via
    // initiateArchiving's "no newer Draft/Review" guard, so we bypass it.
    const initiatedAt = new Date()
    await appDb().query(
      `UPDATE requirement_versions
        SET requirement_status_id = @0,
            archive_initiated_at = @1,
            revision_token = NEWID()
        WHERE id = @2`,
      [STATUS_REVIEW, initiatedAt, published.publishedVersionId],
    )

    await approveArchiving(appDb(), published.requirementId)

    const historyAfterApprove = await getVersionHistory(
      appDb(),
      published.requirementId,
    )
    const v1After = historyAfterApprove.find(v => v.versionNumber === 1)
    const v2After = historyAfterApprove.find(v => v.versionNumber === 2)
    expect(v1After?.status).toBe(STATUS_ARCHIVED)
    expect(v1After?.archivedAt).not.toBeNull()
    expect(v2After?.id).toBe(v2.id)
    expect(v2After?.status).toBe(STATUS_DRAFT)
    expect(v2After?.revisionToken).toBe(v2.revisionToken)

    // Now repeat the same setup for cancelArchiving.
    const published2 = await createPublishedRequirement(
      appDb(),
      area.id,
      'Strict-target baseline (cancel)',
    )
    const v2b = await editRequirement(appDb(), published2.requirementId, {
      baseRevisionToken: published2.revisionToken,
      baseVersionId: published2.publishedVersionId,
      description: 'Successor draft (must never be cancelled into Published)',
    })
    await appDb().query(
      `UPDATE requirement_versions
        SET requirement_status_id = @0,
            archive_initiated_at = @1,
            revision_token = NEWID()
        WHERE id = @2`,
      [STATUS_REVIEW, new Date(), published2.publishedVersionId],
    )

    await cancelArchiving(appDb(), published2.requirementId)

    const historyAfterCancel = await getVersionHistory(
      appDb(),
      published2.requirementId,
    )
    const v1Cancel = historyAfterCancel.find(v => v.versionNumber === 1)
    const v2Cancel = historyAfterCancel.find(v => v.versionNumber === 2)
    expect(v1Cancel?.status).toBe(STATUS_PUBLISHED)
    expect(v1Cancel?.archiveInitiatedAt).toBeNull()
    expect(v2Cancel?.id).toBe(v2b.id)
    expect(v2Cancel?.status).toBe(STATUS_DRAFT)
    expect(v2Cancel?.revisionToken).toBe(v2b.revisionToken)
  })
})
