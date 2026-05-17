import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { recordActionAuditEvent } from '@/lib/audit/action-audit'
import {
  createDeviation,
  createDeviationForItemRef,
  DEVIATION_APPROVED,
  DEVIATION_REJECTED,
  deleteDeviation,
  deleteSpecificationLocalDeviation,
  recordDecision,
  recordSpecificationLocalDecision,
  requestReview as requestDeviationReview,
  requestSpecificationLocalReview,
  updateDeviation,
  updateSpecificationLocalDeviation,
} from '@/lib/dal/deviations'
import {
  createSuggestion,
  recordResolution,
  requestReview,
  SUGGESTION_DISMISSED,
  SUGGESTION_RESOLVED,
} from '@/lib/dal/improvement-suggestions'
import {
  approveArchiving,
  cancelArchiving,
  createRequirement,
  editRequirement,
  getVersionHistory,
  initiateArchiving,
  listRequirements,
  restoreVersion,
  transitionStatus,
} from '@/lib/dal/requirements'
import {
  createSpecification,
  createSpecificationLocalRequirement,
  graduateSpecificationLocalRequirementToLibrary,
  linkRequirementsToSpecificationAtomically,
  updateSpecificationItemFields,
  updateSpecificationLocalRequirementFields,
} from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import {
  isStatusIconName,
  STATUS_ICON_NAMES,
} from '@/lib/icons/status-icon-allowlist'
import {
  attachVerifiedActor,
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
import { createRequirementsService } from '@/lib/requirements/service'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '@/lib/requirements/status-constants.mjs'
import {
  DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
  DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
} from '@/lib/specification-item-status-constants'
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
 * Scenarios 10 and 15 are pure file-content checks and always run as part of
 * `npm run test`.
 *
 * Scenarios 1-9, 11-12, 14, and 16 exercise lifecycle/audit invariants that
 * require a real SQL Server instance. The harness derives a connection URL automatically from
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
const statusIconAllowlistPath = join(
  repoRoot,
  'lib',
  'icons',
  'status-icon-allowlist.ts',
)
const statusIconSchemaPath = join(
  repoRoot,
  'lib',
  'icons',
  'status-icon-schema.ts',
)
const statusIconMigrationPath = join(
  repoRoot,
  'typeorm',
  'migrations',
  '0014_status_and_risk_icons.mjs',
)
const requirementStatusesRoutePath = join(
  repoRoot,
  'app',
  'api',
  'requirement-statuses',
  '[id]',
  'route.ts',
)
const specificationItemStatusesRoutePath = join(
  repoRoot,
  'app',
  'api',
  'catalog',
  'specification-item-statuses',
  '[id]',
  'route.ts',
)
const riskLevelsRoutePath = join(
  repoRoot,
  'app',
  'api',
  'risk-levels',
  '[id]',
  'route.ts',
)
const adminCenterDocPath = join(repoRoot, 'docs', 'admin-center.md')
const databaseSchemaDocPath = join(repoRoot, 'docs', 'database-schema.md')
const requirementsServicePath = join(
  repoRoot,
  'lib',
  'requirements',
  'service-requirements.ts',
)
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

it('Scenario 15: configurable status and risk icons use an allowlist and stay additive', () => {
  const allowlistSource = readFileSync(statusIconAllowlistPath, 'utf8')
  const schemaSource = readFileSync(statusIconSchemaPath, 'utf8')
  const migrationSource = readFileSync(statusIconMigrationPath, 'utf8')
  const requirementStatusesRouteSource = readFileSync(
    requirementStatusesRoutePath,
    'utf8',
  )
  const specificationItemStatusesRouteSource = readFileSync(
    specificationItemStatusesRoutePath,
    'utf8',
  )
  const riskLevelsRouteSource = readFileSync(riskLevelsRoutePath, 'utf8')
  const adminCenterDoc = readFileSync(adminCenterDocPath, 'utf8')
  const databaseSchemaDoc = readFileSync(databaseSchemaDocPath, 'utf8')
  const requirementsServiceSource = readFileSync(
    requirementsServicePath,
    'utf8',
  )
  const userGuideSource = readFileSync(userGuidePath, 'utf8')

  for (const iconName of [
    'AlertCircle',
    'AlertTriangle',
    'Archive',
    'CheckCircle2',
    'Circle',
    'CircleDot',
    'Clock',
    'Eye',
    'Flag',
    'Hourglass',
    'Lock',
    'PenLine',
    'Play',
    'ShieldAlert',
    'ShieldCheck',
    'Sparkles',
    'Star',
    'ThumbsUp',
    'XCircle',
    'Zap',
  ]) {
    expect(isStatusIconName(iconName)).toBe(true)
  }
  expect(STATUS_ICON_NAMES).toContain('Camera')
  expect(STATUS_ICON_NAMES).toContain('Wifi')
  expect(STATUS_ICON_NAMES.length).toBeGreaterThan(1000)

  expect(allowlistSource).toContain("from 'lucide-react/dynamicIconImports'")
  expect(allowlistSource).toContain('isStatusIconName')
  expect(allowlistSource).toContain('loadStatusIconNodes')
  expect(allowlistSource).toContain('collectStatusIconNames')
  expect(migrationSource).toContain(
    'ALTER TABLE [requirement_statuses] ADD [icon_name] nvarchar(64) NULL;',
  )
  expect(migrationSource).toContain(
    'ALTER TABLE [specification_item_statuses] ADD [icon_name] nvarchar(64) NULL;',
  )
  expect(migrationSource).toContain(
    'ALTER TABLE [risk_levels] ADD [icon_name] nvarchar(64) NULL;',
  )
  expect(migrationSource).toContain(
    'ALTER TABLE [requirement_statuses] DROP COLUMN [icon_name];',
  )

  for (const routeSource of [
    requirementStatusesRouteSource,
    specificationItemStatusesRouteSource,
    riskLevelsRouteSource,
  ]) {
    expect(routeSource).toContain('nullableOptionalStatusIconNameSchema')
    expect(routeSource).toContain(
      'iconName: nullableOptionalStatusIconNameSchema',
    )
  }
  expect(schemaSource).toContain('isStatusIconName')

  expect(requirementsServiceSource).toContain(
    'statusIconName: version.statusIconName',
  )
  expect(requirementsServiceSource).toContain(
    'iconName: version.riskLevel.iconName',
  )
  expect(requirementsServiceSource).toContain('specification_item_statuses')
  expect(userGuideSource).toContain('specification item statuses')
  expect(userGuideSource).toContain('iconName')
  expect(adminCenterDoc).toContain('nullable icon')
  expect(databaseSchemaDoc).toContain('icon_name')
  expect(databaseSchemaDoc).toContain('`PenLine`')
  expect(databaseSchemaDoc).toContain('`ShieldCheck`')
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
  'action_audit_events',
  'requirement_version_requirement_packages',
  'requirement_version_norm_references',
  'specification_local_requirement_requirement_packages',
  'specification_local_requirement_norm_references',
  'specification_local_requirement_deviations',
  'deviations',
  'improvement_suggestions',
  'requirements_specification_items',
  'specification_local_requirements',
  'specification_needs_references',
  'requirement_versions',
  'requirements',
  'requirements_specifications',
  'requirement_areas',
  'requirement_packages',
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
    [
      DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
      'Inkluderad',
      'Included',
      '#94a3b8',
      1,
    ],
    [
      DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
      'Avviken',
      'Deviated',
      '#ef4444',
      5,
    ],
  ]
  for (const [id, nameSv, nameEn, color, sortOrder] of itemStatuses) {
    await target.query(
      `IF NOT EXISTS (SELECT 1 FROM specification_item_statuses WHERE id = @0)
         BEGIN
           SET IDENTITY_INSERT specification_item_statuses ON;
           INSERT INTO specification_item_statuses (id, name_sv, name_en, color, sort_order)
             VALUES (@0, @1, @2, @3, @4);
           SET IDENTITY_INSERT specification_item_statuses OFF;
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

async function createRequirementPackage(
  target: SqlServerDatabase,
): Promise<{ id: number }> {
  const now = new Date()
  const rows = (await target.query(
    `INSERT INTO requirement_packages (name_sv, name_en, created_at, updated_at)
       OUTPUT INSERTED.id AS id
       VALUES (@0, @1, @2, @2)`,
    ['Säkerhetspaket', 'Security package', now],
  )) as Array<{ id: number }>
  return rows[0] as { id: number }
}

async function createNormReference(
  target: SqlServerDatabase,
): Promise<{ id: number }> {
  const now = new Date()
  const rows = (await target.query(
    `INSERT INTO norm_references (
       norm_reference_id,
       name,
       type,
       reference,
       version,
       issuer,
       uri,
       created_at,
       updated_at
     )
       OUTPUT INSERTED.id AS id
       VALUES (@0, @1, @2, @3, @4, @5, @6, @7, @7)`,
    [
      `REF-${now.getTime()}`,
      'Security reference',
      'standard',
      'section 1',
      null,
      'Test issuer',
      null,
      now,
    ],
  )) as Array<{ id: number }>
  return rows[0] as { id: number }
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

async function getSingleSpecificationItem(
  target: SqlServerDatabase,
  specificationId: number,
): Promise<{ id: number; specificationItemStatusId: number } | null> {
  const rows = (await target.query(
    `SELECT TOP (1) id, specification_item_status_id AS specificationItemStatusId
       FROM requirements_specification_items WHERE requirements_specification_id = @0`,
    [specificationId],
  )) as Array<{ id: number; specificationItemStatusId: number }>
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

  it('Scenario 6: deviated status requires an approved deviation for both library and specification-local items', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Shared requirement',
    )
    const spec = await createSpecification(appDb(), {
      name: 'Scenario specification',
      uniqueId: 'SCENARIO-SPECIFICATION',
    })

    await linkRequirementsToSpecificationAtomically(appDb(), spec.id, {
      requirementIds: [published.requirementId],
    })

    const libraryItem = await getSingleSpecificationItem(appDb(), spec.id)
    if (!libraryItem) {
      throw new Error('Expected a library specification item')
    }

    const localItem = await createSpecificationLocalRequirement(
      appDb(),
      spec.id,
      {
        description: 'Specification-local requirement',
      },
    )

    await expect(
      updateSpecificationItemFields(appDb(), libraryItem.id, {
        specificationItemStatusId: DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
      }),
    ).rejects.toMatchObject({ code: 'validation' })
    await expect(
      updateSpecificationLocalRequirementFields(appDb(), localItem.id, {
        specificationItemStatusId: DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
      }),
    ).rejects.toMatchObject({ code: 'validation' })

    const libraryDeviation = await createDeviationForItemRef(appDb(), {
      itemRef: `lib:${libraryItem.id}`,
      motivation: 'Approved library deviation',
    })
    await requestDeviationReview(appDb(), libraryDeviation.id)
    await recordDecision(appDb(), libraryDeviation.id, {
      decidedBy: 'reviewer',
      decidedByHsaId: 'SE2321000032-reviewer1',
      decision: DEVIATION_APPROVED,
      decisionMotivation: 'Approved library deviation',
    })

    const localDeviation = await createDeviationForItemRef(appDb(), {
      itemRef: `local:${localItem.id}`,
      motivation: 'Approved local deviation',
    })
    await requestSpecificationLocalReview(appDb(), localDeviation.id)
    await recordSpecificationLocalDecision(appDb(), localDeviation.id, {
      decidedBy: 'reviewer',
      decidedByHsaId: 'SE2321000032-reviewer1',
      decision: DEVIATION_APPROVED,
      decisionMotivation: 'Approved local deviation',
    })

    await updateSpecificationItemFields(appDb(), libraryItem.id, {
      specificationItemStatusId: DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
    })
    await updateSpecificationLocalRequirementFields(appDb(), localItem.id, {
      specificationItemStatusId: DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
    })

    const updatedLibrary = await getSingleSpecificationItem(appDb(), spec.id)
    const updatedLocalRows = (await appDb().query(
      `SELECT specification_item_status_id AS specificationItemStatusId
         FROM specification_local_requirements WHERE id = @0`,
      [localItem.id],
    )) as Array<{ specificationItemStatusId: number }>
    const updatedLocal = updatedLocalRows[0]

    expect(updatedLibrary?.specificationItemStatusId).toBe(
      DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
    )
    expect(updatedLocal?.specificationItemStatusId).toBe(
      DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
    )
  })

  it('Scenario 16: requirements specification item usage status cannot be cleared once assigned', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Status clearing baseline',
    )
    const spec = await createSpecification(appDb(), {
      name: 'Status clearing specification',
      uniqueId: 'STATUS-CLEARING-SPECIFICATION',
    })

    await linkRequirementsToSpecificationAtomically(appDb(), spec.id, {
      requirementIds: [published.requirementId],
    })

    const libraryItem = await getSingleSpecificationItem(appDb(), spec.id)
    if (!libraryItem) {
      throw new Error('Expected a library specification item')
    }
    const localItem = await createSpecificationLocalRequirement(
      appDb(),
      spec.id,
      {
        description: 'Specification-local status clearing baseline',
      },
    )

    expect(libraryItem.specificationItemStatusId).toBe(
      DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
    )
    expect(localItem.specificationItemStatusId).toBe(
      DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
    )

    await expect(
      updateSpecificationItemFields(appDb(), libraryItem.id, {
        specificationItemStatusId: null,
      } as unknown as Parameters<typeof updateSpecificationItemFields>[2]),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Specification item status cannot be cleared',
    })
    await expect(
      updateSpecificationLocalRequirementFields(appDb(), localItem.id, {
        specificationItemStatusId: null,
      } as unknown as Parameters<
        typeof updateSpecificationLocalRequirementFields
      >[2]),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'Specification item status cannot be cleared',
    })
  })

  it('Scenario 13: specification-local graduation is copy-only into a draft library requirement', async () => {
    const sourceArea = await createArea(appDb(), {
      name: 'Source hint',
      prefix: 'SRC',
    })
    const targetArea = await createArea(appDb(), {
      name: 'Target library',
      prefix: 'TGT',
    })
    const requirementPackage = await createRequirementPackage(appDb())
    const normReference = await createNormReference(appDb())
    const spec = await createSpecification(appDb(), {
      name: 'Graduation specification',
      uniqueId: 'GRADUATION-SPECIFICATION',
    })
    const localItem = await createSpecificationLocalRequirement(
      appDb(),
      spec.id,
      {
        acceptanceCriteria: 'Copied acceptance',
        description: 'Copied local requirement',
        normReferenceIds: [normReference.id],
        requirementAreaId: sourceArea.id,
        requirementPackageIds: [requirementPackage.id],
        requiresTesting: true,
        verificationMethod: 'Inspection',
      },
    )
    await appDb().query(
      `UPDATE specification_local_requirements SET note = @0 WHERE id = @1`,
      ['Keep source note', localItem.id],
    )
    await createDeviationForItemRef(appDb(), {
      itemRef: `local:${localItem.id}`,
      motivation: 'Keep source deviation',
    })

    const result = await graduateSpecificationLocalRequirementToLibrary(
      appDb(),
      {
        actorDisplayName: 'Functional Test Actor',
        actorHsaId: 'SE2321000032-functional1',
        specificationId: spec.id,
        specificationLocalRequirementId: localItem.id,
        targetRequirementAreaId: targetArea.id,
      },
    )

    expect(result.requirement.requirementAreaId).toBe(targetArea.id)
    expect(result.sourceLocalRequirement.id).toBe(localItem.id)

    const [sourceRows, targetRows, targetPackageRows, targetNormRows] =
      await Promise.all([
        appDb().query(
          `SELECT
             requirement_area_id AS requirementAreaId,
             specification_item_status_id AS specificationItemStatusId,
             note
           FROM specification_local_requirements
           WHERE id = @0`,
          [localItem.id],
        ) as Promise<
          Array<{
            note: string | null
            requirementAreaId: number
            specificationItemStatusId: number
          }>
        >,
        appDb().query(
          `SELECT
             requirement.unique_id AS uniqueId,
             requirement.requirement_area_id AS requirementAreaId,
             version.description,
             version.acceptance_criteria AS acceptanceCriteria,
             version.requirement_status_id AS statusId,
             CAST(version.is_testing_required AS int) AS requiresTesting,
             version.verification_method AS verificationMethod,
             version.created_by AS createdBy,
             version.created_by_hsa_id AS createdByHsaId
           FROM requirements requirement
           INNER JOIN requirement_versions version
             ON version.requirement_id = requirement.id
           WHERE requirement.id = @0`,
          [result.requirement.id],
        ) as Promise<
          Array<{
            acceptanceCriteria: string
            createdBy: string
            createdByHsaId: string
            description: string
            requirementAreaId: number
            requiresTesting: number
            statusId: number
            uniqueId: string
            verificationMethod: string
          }>
        >,
        appDb().query(
          `SELECT requirement_package_id AS requirementPackageId
           FROM requirement_version_requirement_packages
           WHERE requirement_version_id = @0`,
          [result.version.id],
        ) as Promise<Array<{ requirementPackageId: number }>>,
        appDb().query(
          `SELECT norm_reference_id AS normReferenceId
           FROM requirement_version_norm_references
           WHERE requirement_version_id = @0`,
          [result.version.id],
        ) as Promise<Array<{ normReferenceId: number }>>,
      ])
    const deviationRows = (await appDb().query(
      `SELECT COUNT(*) AS count
       FROM specification_local_requirement_deviations
       WHERE specification_local_requirement_id = @0`,
      [localItem.id],
    )) as Array<{ count: number }>

    expect(sourceRows).toEqual([
      {
        note: 'Keep source note',
        requirementAreaId: sourceArea.id,
        specificationItemStatusId: DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
      },
    ])
    expect(targetRows).toEqual([
      expect.objectContaining({
        acceptanceCriteria: 'Copied acceptance',
        createdBy: 'Functional Test Actor',
        createdByHsaId: 'SE2321000032-functional1',
        description: 'Copied local requirement',
        requirementAreaId: targetArea.id,
        requiresTesting: 1,
        statusId: STATUS_DRAFT,
        uniqueId: 'TGT0001',
        verificationMethod: 'Inspection',
      }),
    ])
    expect(targetPackageRows).toEqual([
      { requirementPackageId: requirementPackage.id },
    ])
    expect(targetNormRows).toEqual([{ normReferenceId: normReference.id }])
    expect(Number(deviationRows[0]?.count ?? 0)).toBe(1)
  })

  it('Scenario 7: needs-reference linking never leaks orphan metadata', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Link me once',
    )
    const spec = await createSpecification(appDb(), {
      name: 'Link specification',
      uniqueId: 'LINK-SPECIFICATION',
    })

    await linkRequirementsToSpecificationAtomically(appDb(), spec.id, {
      requirementIds: [published.requirementId],
    })

    const addedAgain = await linkRequirementsToSpecificationAtomically(
      appDb(),
      spec.id,
      {
        requirementIds: [published.requirementId],
        needsReferenceText: '  Duplicate-only need  ',
      },
    )

    const needsReferences = (await appDb().query(
      `SELECT text FROM specification_needs_references WHERE specification_id = @0`,
      [spec.id],
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
        resolvedByHsaId: 'SE2321000032-reviewer1',
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
      resolvedByHsaId: 'SE2321000032-reviewer1',
    })

    await expect(
      recordResolution(appDb(), suggestion.id, {
        resolution: SUGGESTION_DISMISSED,
        resolutionMotivation: 'Second resolution must fail',
        resolvedBy: 'reviewer',
        resolvedByHsaId: 'SE2321000032-reviewer1',
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
    const spec = await createSpecification(appDb(), {
      name: 'Decision specification',
      uniqueId: 'DECISION-SPECIFICATION',
    })

    await linkRequirementsToSpecificationAtomically(appDb(), spec.id, {
      requirementIds: [published.requirementId],
    })

    const item = await getSingleSpecificationItem(appDb(), spec.id)
    if (!item) {
      throw new Error('Expected specification item')
    }

    const deviation = await createDeviation(appDb(), {
      motivation: 'One final decision only',
      specificationItemId: item.id,
    })
    await requestDeviationReview(appDb(), deviation.id)
    await recordDecision(appDb(), deviation.id, {
      decidedBy: 'reviewer',
      decidedByHsaId: 'SE2321000032-reviewer1',
      decision: DEVIATION_APPROVED,
      decisionMotivation: 'Approved once',
    })

    await expect(
      recordDecision(appDb(), deviation.id, {
        decidedBy: 'reviewer',
        decidedByHsaId: 'SE2321000032-reviewer1',
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

    const localItem = await createSpecificationLocalRequirement(
      appDb(),
      spec.id,
      {
        description: 'Specification-local decision source',
      },
    )
    const localDeviation = await createDeviationForItemRef(appDb(), {
      itemRef: `local:${localItem.id}`,
      motivation: 'One final local decision only',
    })
    await requestSpecificationLocalReview(appDb(), localDeviation.id)
    await recordSpecificationLocalDecision(appDb(), localDeviation.id, {
      decidedBy: 'reviewer',
      decidedByHsaId: 'SE2321000032-reviewer1',
      decision: DEVIATION_APPROVED,
      decisionMotivation: 'Approved local once',
    })

    await expect(
      recordSpecificationLocalDecision(appDb(), localDeviation.id, {
        decidedBy: 'reviewer',
        decidedByHsaId: 'SE2321000032-reviewer1',
        decision: DEVIATION_REJECTED,
        decisionMotivation: 'Second local decision must fail',
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'A decision has already been recorded for this deviation',
    })

    await expect(
      updateSpecificationLocalDeviation(appDb(), localDeviation.id, {
        motivation: 'Mutating a decided local deviation should fail',
      }),
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      deleteSpecificationLocalDeviation(appDb(), localDeviation.id),
    ).rejects.toMatchObject({
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

  it('Scenario 12a: concurrent initiateArchiving attempts are atomic and strictly targeted', async () => {
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

  it('Scenario 12b: concurrent approveArchiving attempts are atomic and strictly targeted', async () => {
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

  it('Scenario 12c: concurrent approveArchiving vs cancelArchiving are atomic and strictly targeted', async () => {
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

  it('Scenario 12d: strict-target behavior with manual state manipulation', async () => {
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

  it('Scenario 12e: storage constraints reject duplicate archiving targets', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Duplicate archive target baseline',
    )
    const v2 = await editRequirement(appDb(), published.requirementId, {
      baseRevisionToken: published.revisionToken,
      baseVersionId: published.publishedVersionId,
      description: 'Successor draft with duplicate archive flag attempt',
    })

    await appDb().query(
      `UPDATE requirement_versions
        SET requirement_status_id = @0,
            archive_initiated_at = @1,
            revision_token = NEWID()
        WHERE id = @2`,
      [STATUS_REVIEW, new Date(), published.publishedVersionId],
    )

    await expect(
      appDb().query(
        `UPDATE requirement_versions
          SET archive_initiated_at = @0,
              revision_token = NEWID()
          WHERE id = @1`,
        [new Date(), v2.id],
      ),
    ).rejects.toThrow(
      'uq_requirement_versions_archive_initiated_requirement_id',
    )

    const history = await getVersionHistory(appDb(), published.requirementId)
    const v1After = history.find(v => v.versionNumber === 1)
    const v2After = history.find(v => v.versionNumber === 2)
    expect(v1After?.archiveInitiatedAt).not.toBeNull()
    expect(v2After?.archiveInitiatedAt).toBeNull()
  })

  it('Scenario 12f: storage constraints reject duplicate Published versions', async () => {
    const area = await createArea(appDb())
    const published = await createPublishedRequirement(
      appDb(),
      area.id,
      'Duplicate published baseline',
    )
    const v2 = await editRequirement(appDb(), published.requirementId, {
      baseRevisionToken: published.revisionToken,
      baseVersionId: published.publishedVersionId,
      description: 'Successor draft with duplicate published attempt',
    })

    await expect(
      appDb().query(
        `UPDATE requirement_versions
          SET requirement_status_id = @0,
              published_at = @1,
              revision_token = NEWID()
          WHERE id = @2`,
        [STATUS_PUBLISHED, new Date(), v2.id],
      ),
    ).rejects.toThrow('uq_requirement_versions_published_requirement_id')

    const history = await getVersionHistory(appDb(), published.requirementId)
    const v1After = history.find(v => v.versionNumber === 1)
    const v2After = history.find(v => v.versionNumber === 2)
    expect(v1After?.status).toBe(STATUS_PUBLISHED)
    expect(v2After?.status).toBe(STATUS_DRAFT)
  })

  it('Scenario 14: action audit rows fail closed with the business transaction', async () => {
    await expect(
      appDb().transaction(async manager => {
        await recordActionAuditEvent(manager, {
          action: 'requirement.create',
          actorDisplayName: 'Functional Test Actor',
          actorHsaId: 'SE2321000032-functional1',
          actorKind: 'user',
          clientIp: '203.0.113.40',
          decision: 'allowed',
          details: { operation: 'create', route: '/quality/functional' },
          requestId: 'quality-request-rollback',
          targetId: 'rollback-target',
          targetKind: 'Requirement',
        })
        throw new Error('rollback audit transaction')
      }),
    ).rejects.toThrow('rollback audit transaction')

    const rollbackRows = (await appDb().query(
      `SELECT COUNT(*) AS count
       FROM action_audit_events
       WHERE request_id = @0`,
      ['quality-request-rollback'],
    )) as Array<{ count: number }>
    expect(Number(rollbackRows[0]?.count ?? 0)).toBe(0)

    await appDb().transaction(async manager => {
      await recordActionAuditEvent(manager, {
        action: 'requirement.create',
        actorDisplayName: 'Functional Test Actor',
        actorHsaId: 'SE2321000032-functional1',
        actorKind: 'user',
        clientIp: '203.0.113.41',
        decision: 'allowed',
        details: {
          operation: 'create',
          prompt: 'must not be persisted',
          route: '/quality/functional',
        },
        requestId: 'quality-request-commit',
        targetId: 'commit-target',
        targetKind: 'Requirement',
      })
    })

    const committedRows = (await appDb().query(
      `SELECT action, client_ip AS clientIp, details_json AS detailsJson
       FROM action_audit_events
       WHERE request_id = @0`,
      ['quality-request-commit'],
    )) as Array<{
      action: string
      clientIp: string | null
      detailsJson: string | null
    }>
    expect(committedRows).toHaveLength(1)
    expect(committedRows[0]).toEqual(
      expect.objectContaining({
        action: 'requirement.create',
        clientIp: '203.0.113.41',
      }),
    )
    expect(committedRows[0]?.detailsJson).toContain('/quality/functional')
    expect(committedRows[0]?.detailsJson).not.toContain('must not be persisted')
  })
})
