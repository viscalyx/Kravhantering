#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import {
  buildRequirementCountSql,
  buildRequirementListSql,
} from '../lib/dal/requirements-list-sql.mjs'
import {
  STATUS_ARCHIVED,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  STATUS_REVIEW,
} from '../lib/requirements/status-constants.mjs'
import {
  createMssqlConfig,
  getSqlServerDatabaseUrl,
  loadEnvironmentFiles,
} from './db-sqlserver-admin.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
export const DEFAULT_BASELINE_PATH = resolve(
  REPO_ROOT,
  'tests/performance/requirements-list-baseline.json',
)
export const DEFAULT_OUTPUT_DIR = resolve(
  REPO_ROOT,
  'test-results/requirements-list-performance',
)
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000
const DEFAULT_DEVELOPER_BASELINE_PROFILE = 'developer'
const DEFAULT_CI_BASELINE_PROFILE = 'ci'
const USAGE =
  'Usage: node scripts/requirements-list-performance.mjs <check|update-baseline>'

function parsePositiveInteger(value, defaultValue) {
  if (value == null || String(value).trim() === '') return defaultValue
  const parsed = Number.parseInt(String(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function roundMetric(value) {
  return Math.round(value * 100) / 100
}

function percentileNearestRank(values, percentile) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  return sorted[Math.min(index, sorted.length - 1)]
}

export function createPerformanceFixtureConfig(overrides = {}) {
  return {
    areaCount: 4,
    areaIdBase: -9000,
    requirementCount: 10_000,
    requirementIdBase: -900_000,
    seededAt: '2026-05-09 00:00:00',
    uniqueIdPrefix: 'PERF',
    versionIdBase: -9_000_000,
    ...overrides,
  }
}

function areaId(config, areaIndex) {
  return config.areaIdBase - areaIndex
}

function integerRange(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

const PERFORMANCE_REFERENCE_REQUIREMENTS = [
  {
    ids: [1, 2, 3],
    optionKey: 'categoryIds',
    tableName: 'requirement_categories',
  },
  { ids: [1, 2], optionKey: 'typeIds', tableName: 'requirement_types' },
  {
    ids: integerRange(1, 48),
    optionKey: 'qualityCharacteristicIds',
    tableName: 'quality_characteristics',
  },
  { ids: [1, 2, 3], optionKey: 'riskLevelIds', tableName: 'risk_levels' },
  {
    ids: integerRange(1, 6),
    optionKey: 'normReferenceIds',
    tableName: 'norm_references',
  },
  {
    ids: integerRange(1, 9),
    optionKey: 'requirementPackageIds',
    tableName: 'requirement_packages',
  },
]

export function createRequirementListPerformanceScenarios(
  config = createPerformanceFixtureConfig(),
) {
  return [
    {
      name: 'default-published',
      options: {
        limit: 200,
        offset: 0,
        sortBy: 'uniqueId',
        sortDirection: 'asc',
        statuses: [STATUS_PUBLISHED],
      },
    },
    {
      name: 'status-sort-review',
      options: {
        includeArchived: true,
        limit: 200,
        offset: 0,
        sortBy: 'status',
        sortDirection: 'asc',
        statuses: [STATUS_REVIEW],
      },
    },
    {
      name: 'classification-filters',
      options: {
        areaIds: [areaId(config, 1), areaId(config, 2)],
        categoryIds: [1, 2],
        limit: 200,
        offset: 0,
        qualityCharacteristicIds: [6, 8, 23],
        requiresTesting: [true],
        riskLevelIds: [2, 3],
        sortBy: 'riskLevel',
        sortDirection: 'desc',
        statuses: [STATUS_PUBLISHED],
        typeIds: [1],
      },
    },
    {
      name: 'text-search',
      options: {
        descriptionSearch: 'needle',
        includeArchived: true,
        limit: 200,
        offset: 0,
        sortBy: 'description',
        sortDirection: 'asc',
        uniqueIdSearch: `${config.uniqueIdPrefix}-`,
      },
    },
    {
      name: 'join-table-filters',
      options: {
        limit: 200,
        normReferenceIds: [2, 5],
        offset: 0,
        requirementPackageIds: [3, 8],
        sortBy: 'uniqueId',
        sortDirection: 'asc',
        statuses: [STATUS_PUBLISHED],
      },
    },
    {
      name: 'deep-pagination',
      options: {
        limit: 200,
        offset: Math.floor(config.requirementCount / 2),
        sortBy: 'uniqueId',
        sortDirection: 'asc',
        statuses: [STATUS_PUBLISHED],
      },
    },
    {
      name: 'archived-included',
      options: {
        includeArchived: true,
        limit: 200,
        offset: 0,
        sortBy: 'version',
        sortDirection: 'desc',
        statuses: [STATUS_ARCHIVED],
      },
    },
  ]
}

function buildFixtureParameters(config) {
  return [
    config.requirementCount,
    config.requirementIdBase,
    config.versionIdBase,
    config.areaIdBase,
    config.areaCount,
    config.seededAt,
    config.uniqueIdPrefix,
  ]
}

export function buildPerformanceFixtureStatusSql() {
  return `
    SELECT
      COUNT(*) AS requirementCount,
      (
        SELECT COUNT(*)
        FROM requirement_versions rv
        INNER JOIN requirements r ON r.id = rv.requirement_id
        WHERE r.unique_id LIKE @0
      ) AS versionCount
    FROM requirements
    WHERE unique_id LIKE @0
  `
}

export function buildReferencePreconditionSql() {
  return PERFORMANCE_REFERENCE_REQUIREMENTS.flatMap(reference =>
    reference.ids.map(
      id => `
    SELECT
      N'${reference.optionKey}' AS optionKey,
      N'${reference.tableName}' AS tableName,
      ${id} AS id
    WHERE NOT EXISTS (
      SELECT 1 FROM ${reference.tableName} WHERE id = ${id}
    )`,
    ),
  ).join('\nUNION ALL\n')
}

export function formatMissingReferenceRows(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const optionKey = String(row.optionKey ?? 'unknown')
    const tableName = String(row.tableName ?? 'unknown')
    const key = `${optionKey} (${tableName})`
    const ids = grouped.get(key) ?? []
    ids.push(Number(row.id))
    grouped.set(key, ids)
  }

  return [...grouped.entries()]
    .map(([label, ids]) => `${label}: ${ids.sort((a, b) => a - b).join(', ')}`)
    .join('; ')
}

export function buildSeedPerformanceFixtureSql() {
  return `
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @requirementCount int = @0;
DECLARE @requirementIdBase int = @1;
DECLARE @versionIdBase int = @2;
DECLARE @areaIdBase int = @3;
DECLARE @areaCount int = @4;
DECLARE @seededAt datetime2(3) = CONVERT(datetime2(3), @5, 120);
DECLARE @uniqueIdPrefix nvarchar(32) = @6;
DECLARE @uniqueIdLike nvarchar(64) = @uniqueIdPrefix + N'-%';

DECLARE @perfRequirementIds TABLE (id int NOT NULL PRIMARY KEY);
INSERT INTO @perfRequirementIds (id)
SELECT id FROM requirements WHERE unique_id LIKE @uniqueIdLike;

DELETE d
FROM deviations d
INNER JOIN requirements_specification_items item
  ON item.id = d.specification_item_id
INNER JOIN @perfRequirementIds perf
  ON perf.id = item.requirement_id;

DELETE item
FROM requirements_specification_items item
INNER JOIN @perfRequirementIds perf
  ON perf.id = item.requirement_id;

DELETE vnr
FROM requirement_version_norm_references vnr
INNER JOIN requirement_versions rv
  ON rv.id = vnr.requirement_version_id
INNER JOIN @perfRequirementIds perf
  ON perf.id = rv.requirement_id;

DELETE vrp
FROM requirement_version_requirement_packages vrp
INNER JOIN requirement_versions rv
  ON rv.id = vrp.requirement_version_id
INNER JOIN @perfRequirementIds perf
  ON perf.id = rv.requirement_id;

DELETE s
FROM improvement_suggestions s
INNER JOIN @perfRequirementIds perf
  ON perf.id = s.requirement_id;

DELETE rv
FROM requirement_versions rv
INNER JOIN @perfRequirementIds perf
  ON perf.id = rv.requirement_id;

DELETE r
FROM requirements r
INNER JOIN @perfRequirementIds perf
  ON perf.id = r.id;

CREATE TABLE #perf_requirements (
  n int NOT NULL PRIMARY KEY,
  requirement_id int NOT NULL,
  area_index int NOT NULL,
  area_id int NOT NULL,
  version_count int NOT NULL,
  unique_id nvarchar(450) NOT NULL,
  is_archived bit NOT NULL
);

;WITH numbers AS (
  SELECT TOP (@requirementCount)
    ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
  FROM sys.all_objects a
  CROSS JOIN sys.all_objects b
)
INSERT INTO #perf_requirements (
  n,
  requirement_id,
  area_index,
  area_id,
  version_count,
  unique_id,
  is_archived
)
SELECT
  n,
  @requirementIdBase - n,
  ((n - 1) % @areaCount) + 1,
  @areaIdBase - (((n - 1) % @areaCount) + 1),
  2 + (n % 3),
  CONCAT(@uniqueIdPrefix, N'-', ((n - 1) % @areaCount) + 1, N'-', RIGHT(CONCAT(N'000000', CONVERT(varchar(12), n)), 6)),
  CASE WHEN n % 10 = 0 THEN 1 ELSE 0 END
FROM numbers;

SET IDENTITY_INSERT requirement_areas ON;

INSERT INTO requirement_areas (
  id,
  prefix,
  name,
  description,
  owner_id,
  next_sequence,
  created_at,
  updated_at
)
SELECT
  @areaIdBase - area_index,
  CONCAT(@uniqueIdPrefix, N'-', area_index, N'-'),
  CONCAT(N'Performance fixture area ', area_index),
  N'Dedicated requirement-list performance fixture area',
  NULL,
  (@requirementCount / @areaCount) + 2,
  @seededAt,
  @seededAt
FROM (VALUES (1), (2), (3), (4)) AS area(area_index)
WHERE area.area_index <= @areaCount
  AND NOT EXISTS (
    SELECT 1
    FROM requirement_areas existing
    WHERE existing.id = @areaIdBase - area.area_index
       OR existing.prefix = CONCAT(@uniqueIdPrefix, N'-', area.area_index, N'-')
  );

SET IDENTITY_INSERT requirement_areas OFF;

UPDATE requirement_areas
SET next_sequence = (@requirementCount / @areaCount) + 2,
    updated_at = @seededAt
WHERE id BETWEEN @areaIdBase - @areaCount AND @areaIdBase - 1;

SET IDENTITY_INSERT requirements ON;

INSERT INTO requirements (
  id,
  unique_id,
  requirement_area_id,
  sequence_number,
  is_archived,
  created_at
)
SELECT
  requirement_id,
  unique_id,
  area_id,
  ((n - 1) / @areaCount) + 1,
  is_archived,
  DATEADD(day, -(n % 365), @seededAt)
FROM #perf_requirements;

SET IDENTITY_INSERT requirements OFF;

CREATE TABLE #perf_versions (
  n int NOT NULL,
  requirement_id int NOT NULL,
  version_id int NOT NULL PRIMARY KEY,
  version_number int NOT NULL,
  requirement_status_id int NOT NULL,
  published_at datetime2(3) NULL,
  archived_at datetime2(3) NULL,
  archive_initiated_at datetime2(3) NULL
);

INSERT INTO #perf_versions (
  n,
  requirement_id,
  version_id,
  version_number,
  requirement_status_id,
  published_at,
  archived_at,
  archive_initiated_at
)
SELECT
  r.n,
  r.requirement_id,
  @versionIdBase - ((r.n - 1) * 4 + v.version_number),
  v.version_number,
  version_state.requirement_status_id,
  CASE
    WHEN version_state.requirement_status_id IN (${STATUS_PUBLISHED}, ${STATUS_ARCHIVED})
      OR (r.n % 10 = 1 AND v.version_number = r.version_count)
      THEN DATEADD(day, -(r.n % 180), @seededAt)
    ELSE NULL
  END,
  CASE
    WHEN version_state.requirement_status_id = ${STATUS_ARCHIVED}
      THEN DATEADD(day, -(r.n % 120), @seededAt)
    ELSE NULL
  END,
  CASE
    WHEN r.n % 20 = 1 AND v.version_number = r.version_count
      THEN DATEADD(day, -(r.n % 60), @seededAt)
    ELSE NULL
  END
FROM #perf_requirements r
CROSS APPLY (VALUES (1), (2), (3), (4)) AS v(version_number)
CROSS APPLY (
  SELECT CASE
    WHEN r.n % 10 IN (3, 4, 5, 6) AND r.n % 4 IN (0, 1)
      THEN r.version_count - 1
    WHEN r.n % 10 IN (3, 4, 5, 6) THEN r.version_count
  ELSE NULL
END AS published_version_number
) AS lifecycle
CROSS APPLY (
  SELECT CASE
    WHEN r.n % 10 = 0 THEN ${STATUS_ARCHIVED}
    WHEN r.n % 10 = 1 AND v.version_number = r.version_count
      THEN ${STATUS_REVIEW}
    WHEN r.n % 20 = 1 THEN ${STATUS_ARCHIVED}
    WHEN r.n % 10 = 2 THEN ${STATUS_DRAFT}
    WHEN v.version_number < lifecycle.published_version_number
      THEN ${STATUS_ARCHIVED}
    WHEN v.version_number = lifecycle.published_version_number
      THEN ${STATUS_PUBLISHED}
    WHEN r.n % 4 = 0 AND v.version_number = r.version_count
      THEN ${STATUS_DRAFT}
    WHEN r.n % 4 = 1 AND v.version_number = r.version_count
      THEN ${STATUS_REVIEW}
    ELSE ${STATUS_ARCHIVED}
  END AS requirement_status_id
) AS version_state
WHERE v.version_number <= r.version_count;

IF EXISTS (
  SELECT 1
  FROM #perf_versions
  WHERE requirement_status_id = ${STATUS_PUBLISHED}
  GROUP BY requirement_id
  HAVING COUNT_BIG(*) > 1
)
  THROW 51001, N'Performance fixture generated duplicate Published requirement_versions rows.', 1;

IF EXISTS (
  SELECT 1
  FROM #perf_versions
  WHERE archive_initiated_at IS NOT NULL
  GROUP BY requirement_id
  HAVING COUNT_BIG(*) > 1
)
  THROW 51002, N'Performance fixture generated duplicate archiving-in-progress requirement_versions rows.', 1;

SET IDENTITY_INSERT requirement_versions ON;

INSERT INTO requirement_versions (
  id,
  requirement_id,
  version_number,
  description,
  acceptance_criteria,
  requirement_category_id,
  requirement_type_id,
  quality_characteristic_id,
  requirement_status_id,
  is_testing_required,
  verification_method,
  created_at,
  edited_at,
  published_at,
  archived_at,
  created_by,
  archive_initiated_at,
  risk_level_id
)
SELECT
  v.version_id,
  v.requirement_id,
  v.version_number,
  CONCAT(
    N'Performance fixture requirement ',
    v.n,
    N' version ',
    v.version_number,
    N' with ',
    CASE WHEN v.n % 100 = 0 THEN N'needle' ELSE N'common' END,
    N' search marker for requirement-list measurement'
  ),
  CONCAT(
    N'Acceptance criteria for performance fixture requirement ',
    v.n,
    N' version ',
    v.version_number
  ),
  1 + (v.n % 3),
  1 + (v.n % 2),
  1 + (v.n % 48),
  v.requirement_status_id,
  CONVERT(bit, v.n % 2),
  CASE
    WHEN v.n % 2 = 0 THEN N'Automated verification in the performance fixture'
    ELSE NULL
  END,
  DATEADD(day, -(v.n % 365), @seededAt),
  DATEADD(day, -(v.n % 180), @seededAt),
  v.published_at,
  v.archived_at,
  N'perf-seed',
  v.archive_initiated_at,
  1 + (v.n % 3)
FROM #perf_versions v;

SET IDENTITY_INSERT requirement_versions OFF;

INSERT INTO requirement_version_norm_references (
  requirement_version_id,
  norm_reference_id
)
SELECT
  version_id,
  1 + (n % 6)
FROM #perf_versions;

INSERT INTO requirement_version_norm_references (
  requirement_version_id,
  norm_reference_id
)
SELECT
  version_id,
  1 + ((n + 2) % 6)
FROM #perf_versions
WHERE n % 7 = 0
  AND 1 + (n % 6) <> 1 + ((n + 2) % 6);

INSERT INTO requirement_version_requirement_packages (
  requirement_version_id,
  requirement_package_id
)
SELECT
  version_id,
  1 + (n % 9)
FROM #perf_versions;

INSERT INTO requirement_version_requirement_packages (
  requirement_version_id,
  requirement_package_id
)
SELECT
  version_id,
  1 + ((n + 4) % 9)
FROM #perf_versions
WHERE n % 11 = 0
  AND 1 + (n % 9) <> 1 + ((n + 4) % 9);

INSERT INTO improvement_suggestions (
  requirement_id,
  requirement_version_id,
  content,
  is_review_requested,
  resolution,
  resolution_motivation,
  resolved_by,
  resolved_at,
  created_by,
  created_at,
  updated_at,
  review_requested_at
)
SELECT
  r.requirement_id,
  v.version_id,
  CONCAT(N'Performance fixture improvement suggestion for ', r.unique_id),
  CONVERT(bit, CASE WHEN r.n % 10 = 5 THEN 1 ELSE 0 END),
  NULL,
  NULL,
  NULL,
  NULL,
  N'perf-seed',
  @seededAt,
  NULL,
  CASE WHEN r.n % 10 = 5 THEN @seededAt ELSE NULL END
FROM #perf_requirements r
INNER JOIN #perf_versions v
  ON v.requirement_id = r.requirement_id
 AND v.version_number = r.version_count
WHERE r.n % 5 = 0;

COMMIT TRANSACTION;
`
}

function createRequest(pool, parameters = []) {
  const request = pool.request()
  for (const [index, value] of parameters.entries()) {
    request.input(String(index), value)
  }
  return request
}

async function queryScalarRow(pool, sqlText, parameters = []) {
  const result = await createRequest(pool, parameters).query(sqlText)
  return result.recordset?.[0] ?? {}
}

async function executePlainStatement(pool, query) {
  await createRequest(pool, query.parameters).query(query.sqlText)
}

export function parseStatisticsIoMessages(messages) {
  let totalLogicalReads = 0
  for (const message of messages) {
    const text = String(message)
    for (const match of text.matchAll(/logical reads\s+(\d+)/gi)) {
      totalLogicalReads += Number(match[1])
    }
  }
  return {
    logicalReads: totalLogicalReads > 0 ? totalLogicalReads : null,
    messages,
  }
}

async function executeMeasuredStatement(pool, query) {
  const messages = []
  const request = createRequest(pool, query.parameters)
  request.on('info', info => {
    if (info?.message) messages.push(info.message)
  })

  const startedAt = performance.now()
  const result = await request.query(
    `SET STATISTICS IO ON;\n${query.sqlText};\nSET STATISTICS IO OFF;`,
  )
  const durationMs = performance.now() - startedAt
  const statistics = parseStatisticsIoMessages(messages)

  return {
    durationMs: roundMetric(durationMs),
    logicalReads: statistics.logicalReads,
    rowCount: result.recordset?.length ?? 0,
    statisticsMessages: messages,
  }
}

function combineLogicalReads(...values) {
  const numbers = values.filter(value => Number.isFinite(value))
  if (numbers.length === 0) return null
  return numbers.reduce((sum, value) => sum + value, 0)
}

async function runMeasuredSample(pool, listQuery, countQuery) {
  const list = await executeMeasuredStatement(pool, listQuery)
  const count = await executeMeasuredStatement(pool, countQuery)
  return {
    durationMs: roundMetric(list.durationMs + count.durationMs),
    logicalReads: combineLogicalReads(list.logicalReads, count.logicalReads),
    statements: { count, list },
  }
}

export function summarizeSamples(samples) {
  if (samples.length === 0) {
    return {
      maxDurationMs: null,
      maxLogicalReads: null,
      medianDurationMs: null,
      p95DurationMs: null,
      sampleCount: 0,
    }
  }

  const durations = samples.map(sample => sample.durationMs)
  const logicalReads = samples
    .map(sample => sample.logicalReads)
    .filter(value => Number.isFinite(value))

  return {
    maxDurationMs: roundMetric(Math.max(...durations)),
    maxLogicalReads: logicalReads.length > 0 ? Math.max(...logicalReads) : null,
    medianDurationMs: roundMetric(percentileNearestRank(durations, 50)),
    p95DurationMs: roundMetric(percentileNearestRank(durations, 95)),
    sampleCount: samples.length,
  }
}

export function extractShowPlanXmls(result) {
  const xmls = []
  for (const recordset of result.recordsets ?? []) {
    for (const row of recordset ?? []) {
      for (const value of Object.values(row)) {
        if (typeof value === 'string' && value.includes('<ShowPlanXML')) {
          xmls.push(value)
        }
      }
    }
  }
  return xmls
}

export function extractExecutionPlanFindings(planXmls) {
  const xml = Array.isArray(planXmls) ? planXmls.join('\n') : String(planXmls)
  const missingIndexImpacts = [
    ...xml.matchAll(/<MissingIndexGroup\b[^>]*\bImpact="([\d.]+)"/g),
  ]
    .map(match => Number(match[1]))
    .filter(Number.isFinite)
  return {
    hasMissingIndex: missingIndexImpacts.length > 0,
    hasSpill:
      /SpillToTempDb|SpillOccurred="1"|HashSpillDetails|SortSpillDetails/i.test(
        xml,
      ),
    maxMissingIndexImpact:
      missingIndexImpacts.length > 0 ? Math.max(...missingIndexImpacts) : 0,
    showPlanCount: Array.isArray(planXmls) ? planXmls.length : xml ? 1 : 0,
  }
}

async function collectExecutionPlan(
  pool,
  scenarioName,
  statementName,
  query,
  dir,
) {
  const result = await createRequest(pool, query.parameters).query(
    `SET STATISTICS XML ON;\n${query.sqlText};\nSET STATISTICS XML OFF;`,
  )
  const xmls = extractShowPlanXmls(result)
  if (xmls.length === 0) {
    throw new Error(
      `SQL Server did not return a showplan XML document for ${scenarioName}/${statementName}.`,
    )
  }

  const files = []
  for (const [index, xml] of xmls.entries()) {
    const file = resolve(
      dir,
      `${scenarioName}-${statementName}-${index + 1}.sqlplan`,
    )
    await writeFile(file, xml)
    files.push(relative(REPO_ROOT, file))
  }

  return {
    files,
    findings: extractExecutionPlanFindings(xmls),
  }
}

function combinePlanResults(...plans) {
  return {
    files: plans.flatMap(plan => plan.files),
    hasMissingIndex: plans.some(plan => plan.findings.hasMissingIndex),
    hasSpill: plans.some(plan => plan.findings.hasSpill),
    maxMissingIndexImpact: Math.max(
      ...plans.map(plan => plan.findings.maxMissingIndexImpact),
    ),
    showPlanCount: plans.reduce(
      (sum, plan) => sum + plan.findings.showPlanCount,
      0,
    ),
  }
}

async function runScenario(pool, scenario, options) {
  const listQuery = buildRequirementListSql(scenario.options)
  const countQuery = buildRequirementCountSql(scenario.options)

  const listPlan = await collectExecutionPlan(
    pool,
    scenario.name,
    'list',
    listQuery,
    options.outputDir,
  )
  const countPlan = await collectExecutionPlan(
    pool,
    scenario.name,
    'count',
    countQuery,
    options.outputDir,
  )

  for (let i = 0; i < options.warmupCount; i += 1) {
    await executePlainStatement(pool, listQuery)
    await executePlainStatement(pool, countQuery)
  }

  const samples = []
  for (let i = 0; i < options.sampleCount; i += 1) {
    samples.push(await runMeasuredSample(pool, listQuery, countQuery))
  }

  return {
    name: scenario.name,
    options: scenario.options,
    plan: combinePlanResults(listPlan, countPlan),
    samples,
    summary: summarizeSamples(samples),
  }
}

export function selectBaselineThresholds(baseline, options = {}) {
  const profile = options.profile?.trim()
  if (!profile) {
    return { profile: null, thresholds: baseline.thresholds ?? {} }
  }
  if (profile === DEFAULT_CI_BASELINE_PROFILE) {
    return { profile, thresholds: baseline.thresholds ?? {} }
  }
  const profileThresholds = baseline.thresholdProfiles?.[profile]
  if (profileThresholds) {
    return { profile, thresholds: profileThresholds }
  }
  return { missingProfile: true, profile, thresholds: {} }
}

export function compareAgainstBaseline(results, baseline, options = {}) {
  const failures = []
  const { missingProfile, profile, thresholds } = selectBaselineThresholds(
    baseline,
    options,
  )
  if (missingProfile) {
    failures.push(`baseline: missing threshold profile "${profile}"`)
  }
  if (
    baseline.fixture?.requirementCount != null &&
    results.fixture?.requirementCount !== baseline.fixture.requirementCount
  ) {
    failures.push(
      `fixture: requirement count ${results.fixture?.requirementCount} does not match baseline ${baseline.fixture.requirementCount}`,
    )
  }
  for (const result of results.scenarios ?? []) {
    const threshold = thresholds[result.name]
    if (!threshold) {
      failures.push(`${result.name}: missing baseline threshold`)
      continue
    }

    if (result.summary.medianDurationMs > threshold.maxMedianDurationMs) {
      failures.push(
        `${result.name}: median ${result.summary.medianDurationMs}ms exceeded ${threshold.maxMedianDurationMs}ms`,
      )
    }
    if (result.summary.p95DurationMs > threshold.maxP95DurationMs) {
      failures.push(
        `${result.name}: p95 ${result.summary.p95DurationMs}ms exceeded ${threshold.maxP95DurationMs}ms`,
      )
    }
    if (result.summary.maxLogicalReads == null) {
      failures.push(`${result.name}: STATISTICS IO logical reads were missing`)
    } else if (
      threshold.maxLogicalReads != null &&
      result.summary.maxLogicalReads > threshold.maxLogicalReads
    ) {
      failures.push(
        `${result.name}: logical reads ${result.summary.maxLogicalReads} exceeded ${threshold.maxLogicalReads}`,
      )
    }
    if (threshold.allowSpills !== true && result.plan.hasSpill) {
      failures.push(`${result.name}: execution plan contains a spill warning`)
    }
    const maxMissingIndexImpact = threshold.maxMissingIndexImpact ?? 75
    if (result.plan.maxMissingIndexImpact > maxMissingIndexImpact) {
      failures.push(
        `${result.name}: missing-index impact ${result.plan.maxMissingIndexImpact} exceeded ${maxMissingIndexImpact}`,
      )
    }
  }

  return {
    failures,
    ok: failures.length === 0,
  }
}

function formatNumber(value) {
  return value == null || !Number.isFinite(Number(value))
    ? 'n/a'
    : String(value)
}

function formatBoolean(value) {
  return value ? 'yes' : 'no'
}

function padCell(value, width) {
  return String(value).padEnd(width, ' ')
}

export function formatBaselineComparisonTable(results, baseline, options = {}) {
  const { profile, thresholds } = selectBaselineThresholds(baseline, options)
  const rows = [
    [
      'Scenario',
      'Median ms actual/max',
      'P95 ms actual/max',
      'Logical reads actual/max',
      'Spill actual/allowed',
      'Missing idx actual/max',
    ],
  ]

  for (const result of results.scenarios ?? []) {
    const threshold = thresholds[result.name]
    rows.push([
      result.name,
      `${formatNumber(result.summary.medianDurationMs)}/${formatNumber(threshold?.maxMedianDurationMs)}`,
      `${formatNumber(result.summary.p95DurationMs)}/${formatNumber(threshold?.maxP95DurationMs)}`,
      `${formatNumber(result.summary.maxLogicalReads)}/${formatNumber(threshold?.maxLogicalReads)}`,
      `${formatBoolean(result.plan.hasSpill)}/${threshold?.allowSpills === true ? 'yes' : 'no'}`,
      `${formatNumber(result.plan.maxMissingIndexImpact)}/${formatNumber(threshold?.maxMissingIndexImpact ?? 75)}`,
    ])
  }

  const widths = rows[0].map((_, index) =>
    Math.max(...rows.map(row => String(row[index]).length)),
  )
  const separator = widths.map(width => '-'.repeat(width)).join('-+-')
  const lines = rows.map(row =>
    row.map((cell, index) => padCell(cell, widths[index])).join(' | '),
  )
  lines.splice(1, 0, separator)

  return [
    `Requirement-list performance actuals vs baseline${profile ? ` (${profile} profile)` : ''}:`,
    'Legend: lower actual values are better for ms, logical reads, and missing-index impact; spill=no is better. Actual values should stay at or below max thresholds.',
    ...lines,
  ].join('\n')
}

function stableFixtureBaseline(fixture = {}) {
  return {
    areaCount: fixture.areaCount,
    areaIdBase: fixture.areaIdBase,
    requirementCount: fixture.requirementCount,
    requirementIdBase: fixture.requirementIdBase,
    seededAt: fixture.seededAt,
    uniqueIdPrefix: fixture.uniqueIdPrefix,
    versionIdBase: fixture.versionIdBase,
  }
}

export function createBaselineFromResults(results, options = {}) {
  const durationMultiplier = options.durationMultiplier ?? 2.5
  const logicalReadsMultiplier = options.logicalReadsMultiplier ?? 1.35
  const thresholds = {}

  for (const result of results.scenarios ?? []) {
    thresholds[result.name] = {
      allowSpills: result.plan?.hasSpill === true,
      maxLogicalReads:
        result.summary.maxLogicalReads == null
          ? null
          : Math.ceil(result.summary.maxLogicalReads * logicalReadsMultiplier),
      maxMedianDurationMs: Math.ceil(
        Math.max(250, result.summary.medianDurationMs * durationMultiplier),
      ),
      maxMissingIndexImpact: 75,
      maxP95DurationMs: Math.ceil(
        Math.max(500, result.summary.p95DurationMs * durationMultiplier),
      ),
    }
  }

  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    measurement: {
      sampleCount: results.sampleCount,
      warmupCount: results.warmupCount,
    },
    fixture: stableFixtureBaseline(results.fixture),
    thresholds,
  }
}

async function ensurePerformanceFixture(pool, config) {
  await assertPerformanceFixtureReferences(pool)

  const statusBefore = await queryScalarRow(
    pool,
    buildPerformanceFixtureStatusSql(),
    [`${config.uniqueIdPrefix}-%`],
  )
  const existingRequirementCount = Number(statusBefore.requirementCount ?? 0)
  const existingVersionCount = Number(statusBefore.versionCount ?? 0)
  const expectedMinimumVersionCount = config.requirementCount * 2

  if (
    existingRequirementCount === config.requirementCount &&
    existingVersionCount >= expectedMinimumVersionCount
  ) {
    return {
      inserted: false,
      requirementCount: existingRequirementCount,
      versionCount: existingVersionCount,
    }
  }

  await createRequest(pool, buildFixtureParameters(config)).query(
    buildSeedPerformanceFixtureSql(),
  )

  const statusAfter = await queryScalarRow(
    pool,
    buildPerformanceFixtureStatusSql(),
    [`${config.uniqueIdPrefix}-%`],
  )
  return {
    inserted: true,
    requirementCount: Number(statusAfter.requirementCount ?? 0),
    versionCount: Number(statusAfter.versionCount ?? 0),
  }
}

async function runSuite(pool, options) {
  await mkdir(options.outputDir, { recursive: true })
  const fixtureStatus = await ensurePerformanceFixture(pool, options.fixture)
  const scenarios = []
  for (const scenario of createRequirementListPerformanceScenarios(
    options.fixture,
  )) {
    scenarios.push(await runScenario(pool, scenario, options))
  }

  const results = {
    capturedAt: new Date().toISOString(),
    fixture: {
      ...options.fixture,
      inserted: fixtureStatus.inserted,
      seededRequirementCount: fixtureStatus.requirementCount,
      seededVersionCount: fixtureStatus.versionCount,
    },
    sampleCount: options.sampleCount,
    scenarios,
    warmupCount: options.warmupCount,
  }

  await writeFile(
    resolve(options.outputDir, 'requirements-list-performance-results.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  )
  return results
}

async function connectSqlServer(env) {
  const mssqlModule = await import('mssql')
  const connect =
    mssqlModule.connect ?? mssqlModule.default?.connect ?? mssqlModule.default
  if (typeof connect !== 'function') {
    throw new Error('Unable to load the mssql driver connect() function.')
  }
  const connectionString = getSqlServerDatabaseUrl(env, { readonly: false })
  const config = createMssqlConfig(connectionString, env)
  config.requestTimeout = parsePositiveInteger(
    env.PERF_REQUEST_TIMEOUT_MS,
    config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
  )
  return connect(config)
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function readOptionalJsonFile(path) {
  try {
    return await readJsonFile(path)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export function applyBaselineProfileUpdate(
  existingBaseline,
  generatedBaseline,
  profile,
) {
  if (!profile || profile === DEFAULT_CI_BASELINE_PROFILE) {
    return {
      ...generatedBaseline,
      thresholdProfiles: existingBaseline?.thresholdProfiles,
    }
  }

  return {
    ...(existingBaseline ?? {}),
    generatedAt: generatedBaseline.generatedAt,
    measurement: generatedBaseline.measurement,
    fixture: generatedBaseline.fixture,
    thresholds: existingBaseline?.thresholds ?? generatedBaseline.thresholds,
    thresholdProfiles: {
      ...(existingBaseline?.thresholdProfiles ?? {}),
      [profile]: generatedBaseline.thresholds,
    },
  }
}

function createRuntimeOptions(env = process.env) {
  const requestedBaselineProfile =
    env.PERF_REQUIREMENTS_BASELINE_PROFILE?.trim()
  return {
    baselineProfile:
      requestedBaselineProfile ||
      (env.CI === 'true'
        ? DEFAULT_CI_BASELINE_PROFILE
        : DEFAULT_DEVELOPER_BASELINE_PROFILE),
    baselinePath: env.PERF_REQUIREMENTS_BASELINE_PATH
      ? resolve(env.PERF_REQUIREMENTS_BASELINE_PATH)
      : DEFAULT_BASELINE_PATH,
    fixture: createPerformanceFixtureConfig({
      requirementCount: parsePositiveInteger(
        env.PERF_REQUIREMENT_COUNT,
        10_000,
      ),
    }),
    outputDir: env.PERF_REQUIREMENTS_OUTPUT_DIR
      ? resolve(env.PERF_REQUIREMENTS_OUTPUT_DIR)
      : DEFAULT_OUTPUT_DIR,
    sampleCount: parsePositiveInteger(env.PERF_SAMPLE_COUNT, 5),
    warmupCount: parsePositiveInteger(env.PERF_WARMUP_COUNT, 2),
  }
}

async function assertPerformanceFixtureReferences(pool) {
  const result = await createRequest(pool).query(
    buildReferencePreconditionSql(),
  )
  const missingRows = result.recordset ?? []
  if (missingRows.length === 0) return

  throw new Error(
    `Requirement list performance fixture is missing canonical reference rows for ${formatMissingReferenceRows(missingRows)}. Run npm run db:setup against the target SQL Server database before running the performance fixture.`,
  )
}

export async function main(args, dependencies = {}) {
  const consoleObj = dependencies.consoleObj ?? console
  const env = dependencies.env ? { ...dependencies.env } : process.env
  loadEnvironmentFiles(env)
  env.DB_REQUEST_TIMEOUT_MS =
    env.DB_REQUEST_TIMEOUT_MS ?? String(DEFAULT_REQUEST_TIMEOUT_MS)

  const [command] = args
  if (!['check', 'update-baseline'].includes(command)) {
    consoleObj.error(USAGE)
    return 1
  }

  const options = dependencies.options ?? createRuntimeOptions(env)
  let pool
  try {
    pool = dependencies.pool ?? (await connectSqlServer(env))
    const results = await runSuite(pool, options)

    if (command === 'update-baseline') {
      const generatedBaseline = createBaselineFromResults(results)
      const existingBaseline = await readOptionalJsonFile(options.baselinePath)
      const baseline = applyBaselineProfileUpdate(
        existingBaseline,
        generatedBaseline,
        options.baselineProfile,
      )
      await mkdir(dirname(options.baselinePath), { recursive: true })
      await writeFile(
        options.baselinePath,
        `${JSON.stringify(baseline, null, 2)}\n`,
      )
      consoleObj.log(
        `Updated requirement-list performance baseline (${options.baselineProfile} profile) at ${relative(REPO_ROOT, options.baselinePath)}.`,
      )
      return 0
    }

    const baseline = await readJsonFile(options.baselinePath)
    const comparison = compareAgainstBaseline(results, baseline, {
      profile: options.baselineProfile,
    })
    consoleObj.log(
      formatBaselineComparisonTable(results, baseline, {
        profile: options.baselineProfile,
      }),
    )
    await writeFile(
      resolve(
        options.outputDir,
        'requirements-list-performance-comparison.json',
      ),
      `${JSON.stringify(comparison, null, 2)}\n`,
    )

    if (!comparison.ok) {
      for (const failure of comparison.failures) {
        consoleObj.error(failure)
      }
      return 1
    }

    consoleObj.log('Requirement-list performance baseline passed.')
    return 0
  } catch (error) {
    consoleObj.error(
      error instanceof Error
        ? error.message
        : 'Requirement-list performance check failed.',
    )
    return 1
  } finally {
    if (!dependencies.pool && pool && typeof pool.close === 'function') {
      await pool.close()
    }
  }
}

const isMainEntry =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMainEntry) {
  const exitCode = await main(process.argv.slice(2))
  process.exit(exitCode)
}
