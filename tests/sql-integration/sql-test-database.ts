import { afterAll, beforeAll, beforeEach } from 'vitest'
import { createRequirement, transitionStatus } from '@/lib/dal/requirements'
import { createSpecification } from '@/lib/dal/requirements-specifications'
import type { SqlServerDatabase } from '@/lib/db'
import {
  attachVerifiedActor,
  createRequestContext,
  type RequestContext,
} from '@/lib/requirements/auth'
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

const TRANSACTIONAL_TABLES = [
  'action_audit_events',
  'requirement_version_requirement_packages',
  'requirement_version_norm_references',
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
] as const

let db: SqlServerDatabase | null = null

export function resolveSqlIntegrationTestsUrl(): string {
  const explicit = process.env.SQLSERVER_INTEGRATION_TESTS_URL?.trim()
  if (explicit) return explicit

  const baseUrl = tryGetSqlServerDatabaseUrl(process.env, false)
  if (!baseUrl) {
    throw new Error(
      'SQL integration tests require SQLSERVER_INTEGRATION_TESTS_URL or the standard DB_* environment variables.',
    )
  }

  const url = new URL(baseUrl)
  const overrideDbName = process.env.SQLSERVER_INTEGRATION_TESTS_DB_NAME?.trim()
  const currentDbName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const nextDbName =
    overrideDbName ||
    (currentDbName
      ? `${currentDbName}_sql_integration_tests`
      : 'kravhantering_sql_integration_tests')
  url.pathname = `/${encodeURIComponent(nextDbName)}`
  return url.toString()
}

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

export function useSqlIntegrationDatabase(): () => SqlServerDatabase {
  beforeAll(async () => {
    const dataSource = createAppDataSource({
      url: resolveSqlIntegrationTestsUrl(),
    })
    await dataSource.initialize()
    db = dataSource
    await seedLookups(dataSource)
  })

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

  return () => {
    if (!db) {
      throw new Error('SQL integration test DataSource is not initialized.')
    }
    return db
  }
}

export async function ensureResponsibilityPerson(
  target: SqlServerDatabase,
  hsaId: string,
  now = new Date(),
): Promise<void> {
  await target.query(
    `IF NOT EXISTS (
        SELECT 1 FROM requirement_responsibility_people WHERE hsa_id = @0
      )
      INSERT INTO requirement_responsibility_people (
        hsa_id,
        given_name,
        middle_name,
        surname,
        email,
        last_fetched_at,
        created_at,
        updated_at
      )
      VALUES (@0, @1, NULL, NULL, NULL, NULL, @2, @2)`,
    [hsaId, '(saknar namn, kräver nytt uppslag)', now],
  )
}

export async function createArea(
  target: SqlServerDatabase,
  overrides: { name?: string; ownerHsaId?: string; prefix?: string } = {},
): Promise<{ id: number; name: string; prefix: string }> {
  const now = new Date()
  const ownerHsaId = overrides.ownerHsaId ?? 'SE5560000001-sqltest1'
  await ensureResponsibilityPerson(target, ownerHsaId, now)
  const rows = (await target.query(
    `INSERT INTO requirement_areas (prefix, name, owner_hsa_id, next_sequence, created_at, updated_at)
       OUTPUT INSERTED.id AS id, INSERTED.name AS name, INSERTED.prefix AS prefix
       VALUES (@0, @1, @2, 1, @3, @3)`,
    [
      overrides.prefix ?? 'SQL',
      overrides.name ?? 'SQL integration',
      ownerHsaId,
      now,
    ],
  )) as Array<{ id: number; name: string; prefix: string }>
  return rows[0] as { id: number; name: string; prefix: string }
}

export async function createPublishedRequirement(
  target: SqlServerDatabase,
  areaId: number,
  description: string,
): Promise<{
  publishedVersionId: number
  requirementId: number
  revisionToken: string
  uniqueId: string
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
    publishedVersionId: published.id,
    requirementId: created.requirement.id,
    revisionToken: published.revisionToken,
    uniqueId: created.requirement.uniqueId,
  }
}

export async function createSpecificationFixture(
  target: SqlServerDatabase,
  code: string,
): Promise<{ id: number }> {
  const hsaId = 'SE5560000001-sqltest1'
  return createSpecification(target, {
    name: `${code} specification`,
    responsibleHsaId: hsaId,
    responsiblePerson: {
      email: null,
      givenName: 'SQL',
      hsaId,
      middleName: null,
      surname: 'Integration Test',
    },
    specificationCode: code,
    specificationLifecycleStatusId: 4,
  })
}

export function makeRequestContext(): Promise<RequestContext> {
  const request = new Request('https://example.test/sql-integration')
  attachVerifiedActor(request, {
    id: 'sql-integration-actor',
    displayName: 'SQL Integration Actor',
    hsaId: 'SE5560000001-sqltest1',
    roles: ['Admin'],
    source: 'oidc',
    isAuthenticated: true,
  })
  return createRequestContext(request, 'rest')
}
