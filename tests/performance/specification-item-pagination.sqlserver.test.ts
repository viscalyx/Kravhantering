import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildSpecificationItemPageCandidateSql } from '@/lib/dal/specification-item-page'
import { getSqlServerDataSource, type SqlServerDatabase } from '@/lib/db'
import {
  REQUIREMENT_SORT_FIELDS,
  type RequirementSortDirection,
  type RequirementSortField,
} from '@/lib/requirements/list-view'
import { querySpecificationItemPage } from '@/lib/requirements/specification-item-page'

const enabled = process.env.SPECIFICATION_ITEM_SQLSERVER_PERFORMANCE === '1'
const outputDirectory = resolve(
  'test-results/specification-item-pagination-performance',
)
const baselinePath = resolve(
  'tests/performance/specification-item-pagination-baseline.json',
)
const fixtureIds = [
  9_300_001, 9_300_002, 9_300_003, 9_300_004, 9_300_005, 9_300_006,
]

interface Baseline {
  sqlEvidence: {
    maxLogicalReads: number
  }
  thresholds: Record<
    string,
    {
      maxCompleteTraversalMs: number
    }
  >
}

interface Measurement {
  candidateQueries: number
  diagnostic: boolean
  direction: RequirementSortDirection
  durationMs: number
  itemCount: number
  mix: '20-80' | '70-30'
  pageCount: number
  size: 200 | 500 | 1000
  sortBy: RequirementSortField
}

const measurements: Measurement[] = []
const sqlEvidence: Array<{
  hasKeyLookup: boolean
  hasMissingIndex: boolean
  hasSpill: boolean
  logicalReads: number
  mix: '20-80' | '70-30'
  planXml: string
  size: 200 | 500
}> = []
let db: SqlServerDatabase
let baseline: Baseline

const cleanupSql = `
  DELETE FROM requirements_specification_items
  WHERE requirements_specification_id IN (${fixtureIds.join(', ')});
  DELETE FROM specification_local_requirements
  WHERE specification_id IN (${fixtureIds.join(', ')});
  DELETE FROM requirements_specifications
  WHERE id IN (${fixtureIds.join(', ')});
  DELETE FROM requirement_versions
  WHERE requirement_id BETWEEN 9400001 AND 9407000;
  DELETE FROM requirements
  WHERE id BETWEEN 9400001 AND 9407000;
`

const seedSql = `
  ${cleanupSql}

  DECLARE @responsibleHsaId nvarchar(31) = (
    SELECT TOP (1) hsa_id FROM requirement_responsibility_people ORDER BY hsa_id
  );
  DECLARE @areaId int = (SELECT MIN(id) FROM requirement_areas);
  DECLARE @lifecycleStatusId int = (
    SELECT MIN(id) FROM specification_lifecycle_statuses
  );
  DECLARE @governanceObjectTypeId int = (
    SELECT MIN(id) FROM specification_governance_object_types
  );
  DECLARE @implementationTypeId int = (
    SELECT MIN(id) FROM specification_implementation_types
  );
  DECLARE @itemStatusId int = (SELECT MIN(id) FROM specification_item_statuses);
  DECLARE @categoryOne int = (SELECT MIN(id) FROM requirement_categories);
  DECLARE @categoryTwo int = (SELECT MAX(id) FROM requirement_categories);
  DECLARE @typeOne int = (SELECT MIN(id) FROM requirement_types);
  DECLARE @typeTwo int = (SELECT MAX(id) FROM requirement_types);
  DECLARE @qualityOne int = (SELECT MIN(id) FROM quality_characteristics);
  DECLARE @qualityTwo int = (SELECT MAX(id) FROM quality_characteristics);
  DECLARE @priorityOne int = (SELECT MIN(id) FROM priority_levels);
  DECLARE @priorityTwo int = (SELECT MAX(id) FROM priority_levels);

  IF @responsibleHsaId IS NULL OR @areaId IS NULL OR @lifecycleStatusId IS NULL
    OR @governanceObjectTypeId IS NULL OR @implementationTypeId IS NULL
    OR @itemStatusId IS NULL
    THROW 51000, 'Specification pagination fixture prerequisites are missing.', 1;

  DECLARE @fixtures table (
    fixture_ordinal int NOT NULL,
    specification_id int NOT NULL,
    item_count int NOT NULL,
    library_count int NOT NULL
  );
  INSERT INTO @fixtures (
    fixture_ordinal, specification_id, item_count, library_count
  )
  VALUES
    (1, 9300001, 200, 140),
    (2, 9300002, 500, 350),
    (3, 9300003, 200, 40),
    (4, 9300004, 500, 100),
    (5, 9300005, 1000, 700),
    (6, 9300006, 1000, 200);
  DECLARE @numbers table (n int NOT NULL PRIMARY KEY);
  INSERT INTO @numbers (n)
  SELECT TOP (1000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL))
  FROM sys.all_objects;

  SET IDENTITY_INSERT requirements_specifications ON;
  INSERT INTO requirements_specifications (
    id,
    specification_code,
    name,
    business_needs_reference,
    specification_governance_object_type_id,
    specification_implementation_type_id,
    specification_lifecycle_status_id,
    responsible_hsa_id,
    local_requirement_next_sequence,
    created_at,
    updated_at
  )
  SELECT
    fixture.specification_id,
    CONCAT(N'PERF-PAGE-', fixture.fixture_ordinal),
    CONCAT(N'Pagination performance ', fixture.fixture_ordinal),
    N'Deterministic SQL Server regression fixture',
    @governanceObjectTypeId,
    @implementationTypeId,
    @lifecycleStatusId,
    @responsibleHsaId,
    fixture.item_count - fixture.library_count + 1,
    CONVERT(datetime2, '2026-07-17T00:00:00'),
    CONVERT(datetime2, '2026-07-17T00:00:00')
  FROM @fixtures fixture;
  SET IDENTITY_INSERT requirements_specifications OFF;

  SET IDENTITY_INSERT requirements ON;
  INSERT INTO requirements (
    id, unique_id, sequence_number, requirement_area_id, is_archived, created_at
  )
  SELECT
    9400000 + fixture.fixture_ordinal * 1000 + tally.n,
    CONCAT(
      N'PERFSP', fixture.fixture_ordinal, N'-',
      RIGHT(CONCAT(N'0000', tally.n), 4)
    ),
    300000 + fixture.fixture_ordinal * 1000 + tally.n,
    @areaId,
    0,
    CONVERT(datetime2, '2026-07-17T00:00:00')
  FROM @fixtures fixture
  CROSS JOIN @numbers tally
  WHERE tally.n <= fixture.library_count;
  SET IDENTITY_INSERT requirements OFF;

  SET IDENTITY_INSERT requirement_versions ON;
  INSERT INTO requirement_versions (
    id,
    requirement_id,
    version_number,
    description,
    acceptance_criteria,
    is_verifiable,
    verification_method,
    requirement_status_id,
    requirement_category_id,
    requirement_type_id,
    quality_characteristic_id,
    priority_level_id,
    created_at,
    edited_at,
    published_at,
    archived_at,
    created_by,
    created_by_hsa_id,
    archive_initiated_at,
    status_updated_at,
    has_specification_item_history
  )
  SELECT
    9500000 + fixture.fixture_ordinal * 1000 + tally.n,
    9400000 + fixture.fixture_ordinal * 1000 + tally.n,
    1 + tally.n % 4,
    CASE
      WHEN tally.n % 11 = 0 THEN N' '
      ELSE CONCAT(N'Library pagination text ', tally.n % 23)
    END,
    NULL,
    tally.n % 2,
    NULL,
    1 + tally.n % 4,
    CASE WHEN tally.n % 7 = 0 THEN NULL
      WHEN tally.n % 2 = 0 THEN @categoryOne ELSE @categoryTwo END,
    CASE WHEN tally.n % 6 = 0 THEN NULL
      WHEN tally.n % 2 = 0 THEN @typeOne ELSE @typeTwo END,
    CASE WHEN tally.n % 5 = 0 THEN NULL
      WHEN tally.n % 2 = 0 THEN @qualityOne ELSE @qualityTwo END,
    CASE WHEN tally.n % 4 = 0 THEN NULL
      WHEN tally.n % 2 = 0 THEN @priorityOne ELSE @priorityTwo END,
    CONVERT(datetime2, '2026-07-17T00:00:00'),
    NULL,
    NULL,
    NULL,
    N'Pagination campaign',
    @responsibleHsaId,
    NULL,
    CONVERT(datetime2, '2026-07-17T00:00:00'),
    1
  FROM @fixtures fixture
  CROSS JOIN @numbers tally
  WHERE tally.n <= fixture.library_count;
  SET IDENTITY_INSERT requirement_versions OFF;

  SET IDENTITY_INSERT requirements_specification_items ON;
  INSERT INTO requirements_specification_items (
    id,
    requirements_specification_id,
    requirement_id,
    requirement_version_id,
    specification_item_status_id,
    needs_reference_id,
    note,
    status_updated_at,
    created_at
  )
  SELECT
    9600000 + fixture.fixture_ordinal * 1000 + tally.n,
    fixture.specification_id,
    9400000 + fixture.fixture_ordinal * 1000 + tally.n,
    9500000 + fixture.fixture_ordinal * 1000 + tally.n,
    @itemStatusId,
    NULL,
    NULL,
    CONVERT(datetime2, '2026-07-17T00:00:00'),
    CONVERT(datetime2, '2026-07-17T00:00:00')
  FROM @fixtures fixture
  CROSS JOIN @numbers tally
  WHERE tally.n <= fixture.library_count;
  SET IDENTITY_INSERT requirements_specification_items OFF;

  SET IDENTITY_INSERT specification_local_requirements ON;
  INSERT INTO specification_local_requirements (
    id,
    specification_id,
    unique_id,
    sequence_number,
    description,
    acceptance_criteria,
    is_verifiable,
    verification_method,
    note,
    status_updated_at,
    requirement_category_id,
    requirement_type_id,
    quality_characteristic_id,
    priority_level_id,
    needs_reference_id,
    specification_item_status_id,
    created_at,
    updated_at
  )
  SELECT
    9700000 + fixture.fixture_ordinal * 1000 + tally.n,
    fixture.specification_id,
    CONCAT(
      N'PERFSP', fixture.fixture_ordinal, N'-L',
      RIGHT(CONCAT(N'0000', tally.n), 4)
    ),
    tally.n,
    CASE
      WHEN tally.n % 11 = 0 THEN N' '
      ELSE CONCAT(N'Local pagination text ', tally.n % 23)
    END,
    NULL,
    tally.n % 2,
    NULL,
    NULL,
    CONVERT(datetime2, '2026-07-17T00:00:00'),
    CASE WHEN tally.n % 7 = 0 THEN NULL
      WHEN tally.n % 2 = 0 THEN @categoryOne ELSE @categoryTwo END,
    CASE WHEN tally.n % 6 = 0 THEN NULL
      WHEN tally.n % 2 = 0 THEN @typeOne ELSE @typeTwo END,
    CASE WHEN tally.n % 5 = 0 THEN NULL
      WHEN tally.n % 2 = 0 THEN @qualityOne ELSE @qualityTwo END,
    CASE WHEN tally.n % 4 = 0 THEN NULL
      WHEN tally.n % 2 = 0 THEN @priorityOne ELSE @priorityTwo END,
    NULL,
    @itemStatusId,
    CONVERT(datetime2, '2026-07-17T00:00:00'),
    CONVERT(datetime2, '2026-07-17T00:00:00')
  FROM @fixtures fixture
  CROSS JOIN @numbers tally
  WHERE tally.n <= fixture.item_count - fixture.library_count;
  SET IDENTITY_INSERT specification_local_requirements OFF;
`

function scenarioKey(mix: string, size: number): string {
  return `${mix}-${size}`
}

async function traverse(
  database: SqlServerDatabase,
  specificationId: number,
  sortBy: RequirementSortField,
  direction: RequirementSortDirection,
) {
  const refs: string[] = []
  let cursor: string | undefined
  let pageCount = 0
  let candidateQueries = 0
  const measuredDb = {
    query: async (sql: string, parameters?: unknown[]) => {
      if (
        sql.includes('SELECT TOP (') &&
        sql.includes('requirements_specification_items') &&
        sql.includes('UNION ALL')
      ) {
        candidateQueries += 1
        expect(sql).not.toMatch(/\bOFFSET\b|\bCOUNT\s*\(/iu)
      }
      return database.query(sql, parameters)
    },
  } as SqlServerDatabase
  const startedAt = performance.now()

  do {
    const page = await querySpecificationItemPage(measuredDb, {
      cursor,
      limit: 100,
      locale: 'sv',
      sort: { by: sortBy, direction },
      specificationId,
    })
    pageCount += 1
    refs.push(
      ...page.items.map(item => {
        expect(item.itemRef).toBeTruthy()
        return item.itemRef ?? ''
      }),
    )
    cursor = page.pagination.nextCursor ?? undefined
    if (!page.pagination.hasMore) break
    expect(cursor).toBeTruthy()
  } while (pageCount <= 10_000)

  return {
    candidateQueries,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    pageCount,
    refs,
  }
}

interface NativeSqlRequest {
  input: (name: string, value: unknown) => void
  on: (event: 'info', listener: (info: { message?: string }) => void) => void
  query: (sql: string) => Promise<unknown>
}

interface NativeSqlRunner {
  databaseConnection: unknown
  driver: {
    mssql: {
      Request: new (connection: unknown) => NativeSqlRequest
    }
  }
}

function logicalReadsFromMessages(messages: string[]): number {
  return messages.reduce((total, message) => {
    const matches = message.matchAll(/logical reads (\d+)/giu)
    return (
      total +
      [...matches].reduce(
        (messageTotal, match) => messageTotal + Number(match[1] ?? 0),
        0,
      )
    )
  }, 0)
}

function findShowplanXml(
  value: unknown,
  seen = new Set<object>(),
): string | undefined {
  if (typeof value === 'string') {
    return value.includes('<ShowPlanXML') ? value : undefined
  }
  if (Buffer.isBuffer(value)) {
    const text = value.toString('utf8')
    return text.includes('<ShowPlanXML') ? text : undefined
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return undefined
  seen.add(value)
  for (const nested of Object.values(value)) {
    const planXml = findShowplanXml(nested, seen)
    if (planXml) return planXml
  }
  return undefined
}

async function captureActualPlan(
  database: SqlServerDatabase,
  specificationId: number,
) {
  const { parameters, sqlText } = buildSpecificationItemPageCandidateSql({
    filters: {},
    limit: 101,
    locale: 'sv',
    sortBy: 'uniqueId',
    sortDirection: 'asc',
    specificationId,
  })
  const queryRunner = database.createQueryRunner()
  await queryRunner.connect()
  await queryRunner.startTransaction()

  try {
    const nativeRunner = queryRunner as unknown as NativeSqlRunner
    const createRequest = () =>
      new nativeRunner.driver.mssql.Request(nativeRunner.databaseConnection)
    const request = createRequest()
    parameters.forEach((parameter, index) => {
      request.input(String(index), parameter)
    })
    const messages: string[] = []
    request.on('info', info => {
      if (info.message) messages.push(info.message)
    })
    const raw = await request.query(
      `SET STATISTICS IO ON;
       SET STATISTICS XML ON;
       ${sqlText};
       SET STATISTICS XML OFF;
       SET STATISTICS IO OFF;`,
    )
    const planXml = findShowplanXml(raw) ?? ''

    return {
      hasKeyLookup:
        /Lookup="1"|PhysicalOp="Key Lookup"|PhysicalOp="RID Lookup"/iu.test(
          planXml,
        ),
      hasMissingIndex: /<MissingIndexes>/iu.test(planXml),
      hasSpill: /SpillToTempDb|SpillOccurred|HashSpillDetails/iu.test(planXml),
      logicalReads: logicalReadsFromMessages(messages),
      planXml,
    }
  } finally {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction()
    }
    await queryRunner.release()
  }
}

describe.runIf(enabled)('specification item pagination on SQL Server', () => {
  beforeAll(async () => {
    baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as Baseline
    db = await getSqlServerDataSource()
    await db.query(seedSql)
  }, 300_000)

  afterAll(async () => {
    if (!db) return
    try {
      await mkdir(outputDirectory, { recursive: true })
      await writeFile(
        resolve(outputDirectory, 'measurements.json'),
        `${JSON.stringify(
          {
            measurements,
            sqlEvidence: sqlEvidence.map(({ planXml: _planXml, ...entry }) => ({
              ...entry,
              planBytes: Buffer.byteLength(_planXml),
            })),
          },
          null,
          2,
        )}\n`,
      )
      for (const evidence of sqlEvidence) {
        await writeFile(
          resolve(
            outputDirectory,
            `actual-plan-${evidence.mix}-${evidence.size}.sqlplan`,
          ),
          evidence.planXml,
        )
      }
    } finally {
      await db.query(cleanupSql)
    }
  }, 120_000)

  const blockingFixtures = [
    { id: 9_300_001, mix: '70-30' as const, size: 200 as const },
    { id: 9_300_002, mix: '70-30' as const, size: 500 as const },
    { id: 9_300_003, mix: '20-80' as const, size: 200 as const },
    { id: 9_300_004, mix: '20-80' as const, size: 500 as const },
  ]
  const diagnosticFixtures = [
    { id: 9_300_005, mix: '70-30' as const, size: 1000 as const },
    { id: 9_300_006, mix: '20-80' as const, size: 1000 as const },
  ]

  it.each(
    blockingFixtures.flatMap(fixture =>
      REQUIREMENT_SORT_FIELDS.flatMap(sortBy =>
        (['asc', 'desc'] as const).map(direction => ({
          ...fixture,
          direction,
          sortBy,
        })),
      ),
    ),
  )(
    '$mix at $size items preserves exact $sortBy $direction traversal',
    async ({ direction, id, mix, size, sortBy }) => {
      const first = await traverse(db, id, sortBy, direction)
      const second = await traverse(db, id, sortBy, direction)
      const threshold =
        baseline.thresholds[scenarioKey(mix, size)]?.maxCompleteTraversalMs

      expect(first.refs).toHaveLength(size)
      expect(new Set(first.refs).size).toBe(size)
      expect(second.refs).toEqual(first.refs)
      expect(first.pageCount).toBe(Math.ceil(size / 100))
      expect(first.candidateQueries).toBe(first.pageCount)
      expect(threshold).toBeTypeOf('number')
      expect(second.durationMs).toBeLessThanOrEqual(threshold ?? 0)

      measurements.push({
        candidateQueries: second.candidateQueries,
        diagnostic: false,
        direction,
        durationMs: second.durationMs,
        itemCount: second.refs.length,
        mix,
        pageCount: second.pageCount,
        size,
        sortBy,
      })
    },
    60_000,
  )

  it.each(diagnosticFixtures)(
    '$mix at $size items records non-blocking diagnostic traversal',
    async ({ id, mix, size }) => {
      const first = await traverse(db, id, 'uniqueId', 'asc')
      const second = await traverse(db, id, 'uniqueId', 'asc')

      expect(first.refs).toHaveLength(size)
      expect(new Set(first.refs).size).toBe(size)
      expect(second.refs).toEqual(first.refs)
      expect(first.pageCount).toBe(Math.ceil(size / 100))
      expect(first.candidateQueries).toBe(first.pageCount)

      measurements.push({
        candidateQueries: second.candidateQueries,
        diagnostic: true,
        direction: 'asc',
        durationMs: second.durationMs,
        itemCount: second.refs.length,
        mix,
        pageCount: second.pageCount,
        size,
        sortBy: 'uniqueId',
      })
    },
    120_000,
  )

  it('captures actual plans, reads, spills, lookups, and missing-index evidence', async () => {
    for (const fixture of blockingFixtures) {
      const evidence = await captureActualPlan(db, fixture.id)
      sqlEvidence.push({
        ...evidence,
        mix: fixture.mix,
        size: fixture.size,
      })
      expect(evidence.planXml).toContain('<ShowPlanXML')
      expect(evidence.logicalReads).toBeGreaterThan(0)
      expect(evidence.logicalReads).toBeLessThanOrEqual(
        baseline.sqlEvidence.maxLogicalReads,
      )
      expect(evidence.hasSpill).toBe(false)
    }
  }, 120_000)
})
