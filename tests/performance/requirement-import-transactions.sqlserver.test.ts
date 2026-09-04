import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { availableParallelism, totalmem } from 'node:os'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import sqlServer from 'mssql'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRequirementImportValidationSessionAtomically } from '@/lib/dal/requirement-import-validation-sessions'
import type { SqlServerDatabase } from '@/lib/db'
import type { RequestContext } from '@/lib/requirements/auth'
import type {
  ImportRequirementsPayload,
  ImportReviewRowInput,
} from '@/lib/requirements/import-schema'
import { REQUIREMENTS_IMPORT_SCHEMA_VERSION } from '@/lib/requirements/import-schema'
import { createRequirementsService } from '@/lib/requirements/service'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import { getSqlServerDatabaseUrl } from '@/lib/typeorm/sqlserver-config'
import {
  createMssqlConfig,
  resetSqlServerDatabase,
  runSqlServerMigrations,
  seedSqlServerDatabase,
} from '@/scripts/db-sqlserver-admin.mjs'
import {
  assertBoundedBenchmarkEvidence,
  classifyDatabaseOutcome,
  createScreeningMatrix,
  summarizeDurations,
} from '@/scripts/lib/requirement-import-benchmark.mjs'

const enabled = process.env.REQUIREMENT_IMPORT_SQLSERVER_BENCHMARK === '1'
process.env.AUTH_OIDC_ISSUER_URL ??= 'http://localhost:8080/realms/benchmark'
process.env.AUTH_OIDC_CLIENT_ID ??= 'requirement-import-benchmark'
process.env.AUTH_OIDC_CLIENT_SECRET ??= 'synthetic-benchmark-client-secret'
process.env.AUTH_OIDC_REDIRECT_URI ??= 'http://localhost:3000/api/auth/callback'
process.env.AUTH_OIDC_POST_LOGOUT_REDIRECT_URI ??= 'http://localhost:3000/'
process.env.AUTH_SESSION_COOKIE_PASSWORD ??=
  'synthetic-requirement-import-benchmark-cookie-password'
const updateBaseline =
  process.env.REQUIREMENT_IMPORT_BENCHMARK_UPDATE_BASELINE === '1'
const candidateRowCount = Number.parseInt(
  process.env.REQUIREMENT_IMPORT_BENCHMARK_CANDIDATE_ROWS ?? '100',
  10,
)
const confirmationRepetitions = Number.parseInt(
  process.env.REQUIREMENT_IMPORT_BENCHMARK_REPETITIONS ?? '30',
  10,
)
const screeningMaximumRows = Number.parseInt(
  process.env.REQUIREMENT_IMPORT_BENCHMARK_SCREENING_MAX_ROWS ?? '500',
  10,
)
const outputDirectory = resolve(
  'test-results/requirement-import-transaction-benchmark',
)
const outputPath = resolve(outputDirectory, 'measurements.json')
const baselinePath = resolve(
  'tests/performance/requirement-import-transaction-baseline.json',
)
const BENCHMARK_AREA_ID = 9_806_001
const BENCHMARK_SPECIFICATION_ID = 9_806_002
const BENCHMARK_HSA_ID = 'SE1659999999-bench'
const RELATED_COLLECTION_SIZE = 200
const LOCK_HOLD_MILLISECONDS = 250

type BenchmarkDestination =
  | 'requirements_library'
  | 'requirements_specification'
type BenchmarkRowShape = 'light' | 'maximum-related'
type BenchmarkSource = 'mcp' | 'rest'
type BoundedOutcome =
  | 'application_lock_timeout'
  | 'deadlock'
  | 'failure'
  | 'lock_timeout'
  | 'statement_timeout'
  | 'success'

interface BenchmarkCase {
  destination: BenchmarkDestination
  rowCount: number
  rowShape: BenchmarkRowShape
  source: BenchmarkSource
}

interface LockEvidence {
  maximumWaitMs: number
  samples: number
  waitType: string
}

interface Measurement {
  durationMs: number
  lockEvidence: LockEvidence[]
  outcome: BoundedOutcome
  retryCount: number
}

interface PreparedImport {
  execute: () => Promise<unknown>
}

const context = (source: BenchmarkSource): RequestContext => ({
  actor: {
    displayName: 'Synthetic benchmark actor',
    hsaId: BENCHMARK_HSA_ID,
    id: 'synthetic-benchmark-actor',
    isAuthenticated: true,
    roles: ['Admin'],
    source: source === 'mcp' ? 'mcp' : 'oidc',
  },
  correlationId: 'synthetic-benchmark-correlation',
  requestId: 'synthetic-benchmark-request',
  source,
  ...(source === 'mcp' ? { toolName: 'requirements_manage_import' } : {}),
})

let benchmarkUrl = ''
let db: SqlServerDatabase | undefined
let service: ReturnType<typeof createRequirementsService> | undefined
let normReferenceBusinessIds: string[] = []
let requirementPackageIds: number[] = []
let categoryId = 0
let priorityLevelId = 0
let qualityCharacteristicId = 0
let requirementTypeId = 0
let consoleInfoSpy: ReturnType<typeof vi.spyOn> | undefined
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined

function deriveBenchmarkUrl(): string {
  const url = new URL(getSqlServerDatabaseUrl(process.env, false))
  const baseName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  url.pathname = `/${encodeURIComponent(
    `${baseName || 'kravhantering'}_requirement_import_benchmark`,
  )}`
  return url.toString()
}

async function dropBenchmarkDatabase(urlString: string): Promise<void> {
  const parsed = new URL(urlString)
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  parsed.pathname = '/master'
  const pool = await sqlServer.connect(createMssqlConfig(parsed.toString()))
  try {
    const request = pool.request()
    request.input('databaseName', databaseName)
    await request.query(`
      IF DB_ID(@databaseName) IS NOT NULL
      BEGIN
        DECLARE @dropSql nvarchar(max) =
          N'ALTER DATABASE ' + QUOTENAME(@databaseName) +
          N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ' +
          QUOTENAME(@databaseName) + N';';
        EXEC sys.sp_executesql @dropSql;
      END
    `)
  } finally {
    await pool.close()
  }
}

async function seedBenchmarkFixtures(
  database: SqlServerDatabase,
): Promise<void> {
  await database.query(
    `
      DECLARE @created_at datetime2 = CONVERT(datetime2, '2026-09-04T00:00:00');

      IF NOT EXISTS (
        SELECT 1 FROM requirement_responsibility_people WHERE hsa_id = @0
      )
        INSERT INTO requirement_responsibility_people (
          hsa_id, given_name, middle_name, surname, email,
          has_protected_personal_data, last_fetched_at, created_at, updated_at
        ) VALUES (
          @0, N'Synthetic', NULL, N'Benchmark', NULL,
          0, NULL, @created_at, @created_at
        );

      SET IDENTITY_INSERT requirement_areas ON;
      INSERT INTO requirement_areas (
        id, prefix, name, description, owner_hsa_id, next_sequence,
        created_at, updated_at
      ) VALUES (
        ${BENCHMARK_AREA_ID}, N'BMK', N'Synthetic benchmark area',
        N'Deterministic requirement-import benchmark fixture', @0, 1,
        @created_at, @created_at
      );
      SET IDENTITY_INSERT requirement_areas OFF;

      SET IDENTITY_INSERT requirements_specifications ON;
      INSERT INTO requirements_specifications (
        id, specification_governance_object_type_id,
        specification_implementation_type_id,
        specification_lifecycle_status_id, responsible_hsa_id,
        business_needs_reference, specification_code, name,
        local_requirement_next_sequence, created_at, updated_at
      ) VALUES (
        ${BENCHMARK_SPECIFICATION_ID}, 1, 1, 1, @0,
        N'Deterministic synthetic benchmark fixture', N'BMK-IMPORT',
        N'Synthetic import benchmark specification', 1,
        @created_at, @created_at
      );
      SET IDENTITY_INSERT requirements_specifications OFF;

      ;WITH numbers AS (
        SELECT TOP (${RELATED_COLLECTION_SIZE})
          ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
        FROM sys.all_objects
      )
      INSERT INTO norm_references (
        norm_reference_id, name, type, reference, version, issuer,
        is_archived, created_at, updated_at, uri
      )
      SELECT
        CONCAT(N'BMK-NORM-', RIGHT(CONCAT(N'000', n), 3)),
        CONCAT(N'Synthetic benchmark norm ', n), N'Benchmark',
        CONCAT(N'BMK-', n), N'1', N'Synthetic benchmark issuer',
        0, @created_at, @created_at, NULL
      FROM numbers;

      ;WITH numbers AS (
        SELECT TOP (${RELATED_COLLECTION_SIZE})
          ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
        FROM sys.all_objects
      )
      INSERT INTO requirement_packages (
        name, purpose_and_scope, lead_hsa_id, is_archived,
        created_at, updated_at
      )
      SELECT
        CONCAT(N'Synthetic benchmark package ', n),
        N'Deterministic requirement-import benchmark fixture', @0, 0,
        @created_at, @created_at
      FROM numbers;

      UPDATE ai_settings
      SET mcp_import_max_active_sessions_per_principal = 100,
          mcp_import_max_active_sessions_per_destination = 1000,
          mcp_import_max_creations_per_window = 200,
          mcp_import_max_reserved_bytes = 8589934592
      WHERE id = 1;
    `,
    [BENCHMARK_HSA_ID],
  )

  const [normRows, packageRows, taxonomyRows] = await Promise.all([
    database.query<Array<{ normReferenceId: string }>>(
      `SELECT norm_reference_id AS normReferenceId
       FROM norm_references
       WHERE norm_reference_id LIKE N'BMK-NORM-%'
       ORDER BY norm_reference_id`,
    ),
    database.query<Array<{ id: number }>>(
      `SELECT id FROM requirement_packages
       WHERE name LIKE N'Synthetic benchmark package %'
       ORDER BY id`,
    ),
    database.query<
      Array<{
        categoryId: number
        priorityLevelId: number
        qualityCharacteristicId: number
        requirementTypeId: number
      }>
    >(
      `SELECT TOP (1)
         category.id AS categoryId,
         priority.id AS priorityLevelId,
         quality.id AS qualityCharacteristicId,
         type.id AS requirementTypeId
       FROM requirement_categories category
       CROSS JOIN priority_levels priority
       CROSS JOIN quality_characteristics quality
       INNER JOIN requirement_types type
         ON type.id = quality.requirement_type_id
       ORDER BY category.id, priority.id, quality.id`,
    ),
  ])
  normReferenceBusinessIds = normRows.map(row => row.normReferenceId)
  requirementPackageIds = packageRows.map(row => Number(row.id))
  const taxonomy = taxonomyRows[0]
  if (
    !taxonomy ||
    normReferenceBusinessIds.length !== RELATED_COLLECTION_SIZE ||
    requirementPackageIds.length !== RELATED_COLLECTION_SIZE
  ) {
    throw new Error('Requirement-import benchmark fixture is incomplete')
  }
  categoryId = Number(taxonomy.categoryId)
  priorityLevelId = Number(taxonomy.priorityLevelId)
  qualityCharacteristicId = Number(taxonomy.qualityCharacteristicId)
  requirementTypeId = Number(taxonomy.requirementTypeId)
}

function buildPayload(
  rowCount: number,
  rowShape: BenchmarkRowShape,
): ImportRequirementsPayload {
  return {
    requirements: Array.from({ length: rowCount }, (_, index) => ({
      description: `Synthetic benchmark requirement ${index + 1}`,
      ...(rowShape === 'maximum-related'
        ? {
            acceptanceCriteria: 'Synthetic deterministic acceptance criterion',
            categoryId,
            normReferenceIds: normReferenceBusinessIds,
            priorityLevelId,
            qualityCharacteristicId,
            requirementPackageIds,
            typeId: requirementTypeId,
            verifiable: true,
            verificationMethod: 'Synthetic deterministic inspection',
          }
        : {}),
    })),
    schemaVersion: REQUIREMENTS_IMPORT_SCHEMA_VERSION,
  }
}

function toExecuteRows(
  rows: Array<{
    reviewRowId: string
    sourceIndex: number
    values: Omit<ImportReviewRowInput, 'reviewRowId' | 'sourceIndex'>
  }>,
): ImportReviewRowInput[] {
  return rows.map(row => ({
    ...row.values,
    reviewRowId: row.reviewRowId,
    sourceIndex: row.sourceIndex,
  }))
}

async function prepareImport(testCase: BenchmarkCase): Promise<PreparedImport> {
  if (!service) throw new Error('Benchmark service is not initialized')
  const payload = buildPayload(testCase.rowCount, testCase.rowShape)
  const requestContext = context(testCase.source)

  if (testCase.source === 'rest') {
    if (testCase.destination === 'requirements_library') {
      const preview = await service.previewLibraryImport(requestContext, {
        areaId: BENCHMARK_AREA_ID,
        locale: 'en',
        payload,
      })
      const rows = toExecuteRows(preview.rows)
      return {
        execute: () =>
          service?.executeLibraryImport(requestContext, {
            areaId: BENCHMARK_AREA_ID,
            locale: 'en',
            previewToken: preview.previewToken,
            rows,
          }) ?? Promise.reject(new Error('Benchmark service is unavailable')),
      }
    }

    const preview = await service.previewSpecificationLocalImport(
      requestContext,
      {
        locale: 'en',
        payload,
        specificationId: BENCHMARK_SPECIFICATION_ID,
      },
    )
    const rows = toExecuteRows(preview.rows)
    return {
      execute: () =>
        service?.executeSpecificationLocalImport(requestContext, {
          locale: 'en',
          previewToken: preview.previewToken,
          rows,
          specificationId: BENCHMARK_SPECIFICATION_ID,
        }) ?? Promise.reject(new Error('Benchmark service is unavailable')),
    }
  }

  const destination =
    testCase.destination === 'requirements_library'
      ? ({
          areaId: BENCHMARK_AREA_ID,
          kind: 'requirements_library' as const,
        } as const)
      : ({
          kind: 'requirements_specification' as const,
          specificationId: BENCHMARK_SPECIFICATION_ID,
        } as const)
  const validation = await service.manageImport(requestContext, {
    destination,
    operation: 'validate',
    payload,
  })
  if (!('validationToken' in validation) || !validation.validationToken) {
    throw new Error('MCP benchmark validation did not return a token')
  }
  const validationToken = validation.validationToken
  return {
    execute: () =>
      service?.manageImport(requestContext, {
        operation: 'execute',
        validationToken,
      }) ?? Promise.reject(new Error('Benchmark service is unavailable')),
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds))
}

async function sampleLockWaits(
  operation: () => Promise<unknown>,
): Promise<Measurement> {
  if (!db) throw new Error('Benchmark database is not initialized')
  let sampling = true
  const byWaitType = new Map<
    string,
    { maximumWaitMs: number; samples: number }
  >()
  const sampler = (async () => {
    while (sampling) {
      const rows = await db?.query<
        Array<{
          maximumWaitMs: number | string
          samples: number | string
          waitType: string
        }>
      >(
        `SELECT
           waiting.wait_type AS waitType,
           MAX(waiting.wait_duration_ms) AS maximumWaitMs,
           COUNT_BIG(*) AS samples
         FROM sys.dm_os_waiting_tasks waiting
         INNER JOIN sys.dm_exec_requests requests
           ON requests.session_id = waiting.session_id
         WHERE requests.database_id = DB_ID()
           AND waiting.wait_type LIKE N'LCK[_]%'
         GROUP BY waiting.wait_type`,
      )
      for (const row of rows ?? []) {
        const current = byWaitType.get(row.waitType) ?? {
          maximumWaitMs: 0,
          samples: 0,
        }
        current.maximumWaitMs = Math.max(
          current.maximumWaitMs,
          Number(row.maximumWaitMs),
        )
        current.samples += Number(row.samples)
        byWaitType.set(row.waitType, current)
      }
      await delay(10)
    }
  })()
  const startedAt = performance.now()
  let outcome: BoundedOutcome = 'success'
  try {
    await operation()
  } catch (error) {
    outcome = classifyDatabaseOutcome(error)
  } finally {
    sampling = false
    await sampler
  }
  return {
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    lockEvidence: [...byWaitType.entries()]
      .map(([waitType, evidence]) => ({ waitType, ...evidence }))
      .sort((left, right) => left.waitType.localeCompare(right.waitType)),
    outcome,
    retryCount: 0,
  }
}

async function cleanupMeasurements(): Promise<void> {
  if (!db) return
  await db.query(`
    DELETE FROM requirement_import_validation_sessions;
    DELETE FROM requirement_import_validation_rate_buckets;
    DELETE FROM action_audit_events;
    DELETE joins
    FROM requirement_version_requirement_packages joins
    INNER JOIN requirement_versions versions
      ON versions.id = joins.requirement_version_id
    INNER JOIN requirements requirements
      ON requirements.id = versions.requirement_id
    WHERE requirements.requirement_area_id = ${BENCHMARK_AREA_ID};
    DELETE joins
    FROM requirement_version_norm_references joins
    INNER JOIN requirement_versions versions
      ON versions.id = joins.requirement_version_id
    INNER JOIN requirements requirements
      ON requirements.id = versions.requirement_id
    WHERE requirements.requirement_area_id = ${BENCHMARK_AREA_ID};
    DELETE FROM requirement_versions
    WHERE requirement_id IN (
      SELECT id FROM requirements
      WHERE requirement_area_id = ${BENCHMARK_AREA_ID}
    );
    DELETE FROM requirements
    WHERE requirement_area_id = ${BENCHMARK_AREA_ID};
    DELETE FROM specification_local_requirement_norm_references
    WHERE specification_local_requirement_id IN (
      SELECT id FROM specification_local_requirements
      WHERE specification_id = ${BENCHMARK_SPECIFICATION_ID}
    );
    DELETE FROM specification_local_requirements
    WHERE specification_id = ${BENCHMARK_SPECIFICATION_ID};
    UPDATE requirement_areas SET next_sequence = 1
    WHERE id = ${BENCHMARK_AREA_ID};
    UPDATE requirements_specifications SET local_requirement_next_sequence = 1
    WHERE id = ${BENCHMARK_SPECIFICATION_ID};
  `)
}

function aggregateMeasurements(measurements: Measurement[]) {
  const failureCounts = {
    application_lock_timeout: 0,
    deadlock: 0,
    failure: 0,
    lock_timeout: 0,
    statement_timeout: 0,
  }
  const locks = new Map<string, { maximumWaitMs: number; samples: number }>()
  for (const measurement of measurements) {
    if (measurement.outcome !== 'success')
      failureCounts[measurement.outcome] += 1
    for (const lock of measurement.lockEvidence) {
      const current = locks.get(lock.waitType) ?? {
        maximumWaitMs: 0,
        samples: 0,
      }
      current.maximumWaitMs = Math.max(
        current.maximumWaitMs,
        lock.maximumWaitMs,
      )
      current.samples += lock.samples
      locks.set(lock.waitType, current)
    }
  }
  return {
    ...summarizeDurations(measurements.map(entry => entry.durationMs)),
    durationsMs: measurements.map(entry => entry.durationMs),
    failureCounts,
    lockEvidence: [...locks.entries()]
      .map(([waitType, evidence]) => ({ waitType, ...evidence }))
      .sort((left, right) => left.waitType.localeCompare(right.waitType)),
    measuredRepetitions: measurements.length,
    retryCount: measurements.reduce(
      (total, entry) => total + entry.retryCount,
      0,
    ),
  }
}

async function runCase(testCase: BenchmarkCase): Promise<Measurement> {
  const prepared = await prepareImport(testCase)
  const measurement = await sampleLockWaits(prepared.execute)
  await cleanupMeasurements()
  return measurement
}

async function runSameDestinationContention(
  testCase: BenchmarkCase,
): Promise<Measurement> {
  const [first, second] = await Promise.all([
    prepareImport(testCase),
    prepareImport(testCase),
  ])
  const measurement = await sampleLockWaits(async () => {
    const results = await Promise.allSettled([
      first.execute(),
      second.execute(),
    ])
    const rejection = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (rejection) throw rejection.reason
  })
  await cleanupMeasurements()
  return measurement
}

async function runOrdinaryWriteContention(
  testCase: BenchmarkCase,
): Promise<Measurement> {
  if (!db) throw new Error('Benchmark database is not initialized')
  const prepared = await prepareImport(testCase)
  const locker = db.createQueryRunner()
  await locker.connect()
  await locker.startTransaction()
  try {
    if (testCase.destination === 'requirements_library') {
      await locker.query(
        `UPDATE requirement_areas SET updated_at = updated_at WHERE id = @0`,
        [BENCHMARK_AREA_ID],
      )
    } else {
      await locker.query(
        `UPDATE requirements_specifications
         SET updated_at = updated_at WHERE id = @0`,
        [BENCHMARK_SPECIFICATION_ID],
      )
    }
    const pending = sampleLockWaits(prepared.execute)
    await delay(LOCK_HOLD_MILLISECONDS)
    await locker.commitTransaction()
    const measurement = await pending
    await cleanupMeasurements()
    return measurement
  } finally {
    if (locker.isTransactionActive) await locker.rollbackTransaction()
    await locker.release()
  }
}

async function runRepresentativeReads(
  testCase: BenchmarkCase,
): Promise<Measurement> {
  if (!db) throw new Error('Benchmark database is not initialized')
  const prepared = await prepareImport(testCase)
  const measurement = await sampleLockWaits(async () => {
    const execution = prepared.execute()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (testCase.destination === 'requirements_library') {
        await db?.query(
          `SELECT COUNT_BIG(*) AS [rowCount] FROM requirements
           WHERE requirement_area_id = @0`,
          [BENCHMARK_AREA_ID],
        )
      } else {
        await db?.query(
          `SELECT COUNT_BIG(*) AS [rowCount]
           FROM specification_local_requirements
           WHERE specification_id = @0`,
          [BENCHMARK_SPECIFICATION_ID],
        )
      }
    }
    await execution
  })
  await cleanupMeasurements()
  return measurement
}

async function runValidationAdmissionContention(): Promise<Measurement> {
  if (!db) throw new Error('Benchmark database is not initialized')
  const expiresAt = new Date(Date.now() + 60_000)
  const fingerprint = (value: string) =>
    createHash('sha256').update(value).digest('hex')
  const create = (ordinal: number) =>
    createRequirementImportValidationSessionAtomically(
      db as SqlServerDatabase,
      {
        creatorPrincipalFingerprint: fingerprint(
          `benchmark-principal-${ordinal}`,
        ),
        destinationId: BENCHMARK_AREA_ID,
        destinationKind: 'requirements_library',
        destinationSnapshotJson: '{"kind":"requirements_library"}',
        expiresAt,
        payloadHash: fingerprint(`benchmark-payload-${ordinal}`),
        referenceDataFingerprint: fingerprint('benchmark-reference-data'),
        reservedBytes: 1024,
        submittedPayloadJson: '{"schemaVersion":"requirement-import.v4"}',
        tokenHash: fingerprint(
          `benchmark-token-${ordinal}-${performance.now()}`,
        ),
        validationResultJson:
          '{"schemaVersion":"mcp-requirement-import-validation.v1","rows":[]}',
      },
    )
  const measurement = await sampleLockWaits(async () => {
    const results = await Promise.allSettled([create(1), create(2)])
    const rejection = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (rejection) throw rejection.reason
  })
  await cleanupMeasurements()
  return measurement
}

async function readCgroupLimit(path: string): Promise<number | null> {
  try {
    const value = (await readFile(path, 'utf8')).trim()
    if (value === 'max') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function collectEnvironment() {
  if (!db) throw new Error('Benchmark database is not initialized')
  const [sqlEnvironment] = await db.query<
    Array<{
      cpuCount: number | string
      physicalMemoryMb: number | string
      productVersion: string
    }>
  >(
    `SELECT
       cpu_count AS cpuCount,
       physical_memory_kb / 1024 AS physicalMemoryMb,
       CONVERT(nvarchar(128), SERVERPROPERTY('ProductVersion')) AS productVersion
     FROM sys.dm_os_sys_info`,
  )
  const runtime = await db.query<
    Array<{ requirementImportMaxRows: number | string }>
  >(
    `SELECT requirement_import_max_rows AS requirementImportMaxRows
     FROM application_settings WHERE id = 1`,
  )
  const memoryLimitBytes = await readCgroupLimit('/sys/fs/cgroup/memory.max')
  const cpuInfo = await readFile('/proc/cpuinfo', 'utf8')
  const hostLogicalCpuCount = cpuInfo
    .split('\n')
    .filter(line => line.startsWith('processor')).length
  return {
    applicationRuntime: {
      cpuLimit: availableParallelism(),
      memoryLimitMiB:
        memoryLimitBytes == null
          ? null
          : Math.round(memoryLimitBytes / 1024 / 1024),
      nodeVersion: process.version,
    },
    documentedReferenceHost: {
      memoryMiB: 16_384,
      virtualCpuCount: 8,
    },
    hostObservedByRunner: {
      memoryMiB: Math.round(totalmem() / 1024 / 1024),
      virtualCpuCount: hostLogicalCpuCount,
    },
    runtime: {
      benchmarkStatementTimeoutMs: Number.parseInt(
        process.env.DB_REQUEST_TIMEOUT_MS ?? '300000',
        10,
      ),
      databaseBatchSize: 50,
      productionDefaultStatementTimeoutMs: 15_000,
      requirementImportConcurrencyPerNode: 2,
      requirementImportMaxRows: Number(runtime[0]?.requirementImportMaxRows),
    },
    sqlServer: {
      configuredCpuLimit: Number.parseInt(
        process.env.REQUIREMENT_IMPORT_BENCHMARK_SQL_CPU_LIMIT ?? '2',
        10,
      ),
      configuredMemoryLimitMiB: Number.parseInt(
        process.env.REQUIREMENT_IMPORT_BENCHMARK_SQL_MEMORY_LIMIT_MIB ?? '4096',
        10,
      ),
      reportedLogicalCpuCount: Number(sqlEnvironment?.cpuCount),
      reportedPhysicalMemoryMiB: Number(sqlEnvironment?.physicalMemoryMb),
      productVersion: String(sqlEnvironment?.productVersion ?? ''),
    },
  }
}

describe.runIf(enabled)(
  'requirement-import SQL Server transaction benchmark',
  () => {
    beforeAll(async () => {
      if (
        !Number.isInteger(candidateRowCount) ||
        candidateRowCount < 1 ||
        candidateRowCount > 500 ||
        !Number.isInteger(confirmationRepetitions) ||
        confirmationRepetitions < 1
      ) {
        throw new Error('Benchmark row count or repetition count is invalid')
      }
      benchmarkUrl = deriveBenchmarkUrl()
      await resetSqlServerDatabase(benchmarkUrl)
      await runSqlServerMigrations(benchmarkUrl)
      await seedSqlServerDatabase(benchmarkUrl, {
        configureReadonlyAccess: false,
        profile: 'demo',
      })
      db = createAppDataSource({ url: benchmarkUrl })
      await db.initialize()
      await seedBenchmarkFixtures(db)
      consoleInfoSpy = vi
        .spyOn(console, 'info')
        .mockImplementation(() => undefined)
      consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      service = createRequirementsService(db, {
        logger: {
          error: () => undefined,
          info: () => undefined,
        },
      })
    }, 600_000)

    afterAll(async () => {
      try {
        if (db?.isInitialized) await db.destroy()
      } finally {
        consoleInfoSpy?.mockRestore()
        consoleErrorSpy?.mockRestore()
        if (benchmarkUrl) await dropBenchmarkDatabase(benchmarkUrl)
      }
    }, 300_000)

    it('screens the matrix and confirms the candidate with contention evidence', async () => {
      const screening = []
      for (const testCase of (
        createScreeningMatrix() as BenchmarkCase[]
      ).filter(entry => entry.rowCount <= screeningMaximumRows)) {
        await runCase(testCase)
        const measurement = await runCase(testCase)
        screening.push({ ...testCase, ...aggregateMeasurements([measurement]) })
        expect(measurement.outcome).toBe('success')
      }

      const refinement = []
      for (const rowCount of [125, 150]) {
        for (const source of ['rest', 'mcp'] as const) {
          const testCase: BenchmarkCase = {
            destination: 'requirements_library',
            rowCount,
            rowShape: 'maximum-related',
            source,
          }
          await runCase(testCase)
          const measurement = await runCase(testCase)
          refinement.push({
            ...testCase,
            ...aggregateMeasurements([measurement]),
          })
        }
      }

      const candidateCase: BenchmarkCase = {
        destination: 'requirements_library',
        rowCount: candidateRowCount,
        rowShape: 'maximum-related',
        source: 'mcp',
      }
      await runCase(candidateCase)
      const candidateMeasurements: Measurement[] = []
      for (
        let repetition = 0;
        repetition < confirmationRepetitions;
        repetition += 1
      ) {
        candidateMeasurements.push(await runCase(candidateCase))
      }

      const contentionCases = [
        {
          destination: 'requirements_library' as const,
          name: 'same-destination-imports',
          operationsPerRepetition: 2,
          rowShape: 'maximum-related' as const,
          run: () => runSameDestinationContention(candidateCase),
          source: 'mcp' as const,
        },
        {
          destination: 'requirements_library' as const,
          name: 'ordinary-write-to-same-destination',
          operationsPerRepetition: 2,
          rowShape: 'light' as const,
          run: () =>
            runOrdinaryWriteContention({
              ...candidateCase,
              rowShape: 'light' as const,
              source: 'rest' as const,
            }),
          source: 'rest' as const,
        },
        {
          concurrentReadCount: 3,
          destination: 'requirements_specification' as const,
          name: 'representative-reads',
          operationsPerRepetition: 4,
          rowShape: 'maximum-related' as const,
          run: () =>
            runRepresentativeReads({
              ...candidateCase,
              destination: 'requirements_specification' as const,
            }),
          source: 'mcp' as const,
        },
        {
          destination: 'requirements_library' as const,
          name: 'mcp-validation-session-admissions',
          operationsPerRepetition: 2,
          rowShape: 'not-applicable' as const,
          run: runValidationAdmissionContention,
          source: 'mcp' as const,
        },
      ]
      const contention = []
      for (const contentionCase of contentionCases) {
        await contentionCase.run()
        const measurements: Measurement[] = []
        for (
          let repetition = 0;
          repetition < confirmationRepetitions;
          repetition += 1
        ) {
          measurements.push(await contentionCase.run())
        }
        contention.push({
          ...('concurrentReadCount' in contentionCase
            ? { concurrentReadCount: contentionCase.concurrentReadCount }
            : {}),
          destination: contentionCase.destination,
          name: contentionCase.name,
          operationsPerRepetition: contentionCase.operationsPerRepetition,
          rowCount:
            contentionCase.name === 'mcp-validation-session-admissions'
              ? 0
              : candidateRowCount,
          rowShape: contentionCase.rowShape,
          source: contentionCase.source,
          ...aggregateMeasurements(measurements),
        })
      }

      const candidate = aggregateMeasurements(candidateMeasurements)
      const transactionDurationObjectiveMs = Math.max(
        15_000,
        Math.ceil((candidate.p95Ms * 1.25) / 5000) * 5000,
      )
      const lockWaitLimitMs = Math.max(
        1_000,
        Math.min(
          5_000,
          Math.floor(transactionDurationObjectiveMs / 2_000) * 1000,
        ),
      )
      const evidence = assertBoundedBenchmarkEvidence({
        capturedAt: new Date().toISOString(),
        candidate: {
          destination: candidateCase.destination,
          rowCount: candidateRowCount,
          rowShape: candidateCase.rowShape,
          source: candidateCase.source,
          ...candidate,
        },
        contention,
        environment: await collectEnvironment(),
        methodology: {
          contentionLockHoldMs: LOCK_HOLD_MILLISECONDS,
          databaseNativeEvidence: 'sys.dm_os_waiting_tasks',
          fixtureScale: {
            maximumRelatedNormReferencesPerRow: RELATED_COLLECTION_SIZE,
            maximumRelatedRequirementPackagesPerRow: RELATED_COLLECTION_SIZE,
            syntheticDestinations: 2,
          },
          maximumRelatedItemsPerCollection: RELATED_COLLECTION_SIZE,
          measuredRepetitions: confirmationRepetitions,
          screeningMeasuredRepetitions: 1,
          warmupRepetitions: 1,
        },
        recommendations: {
          alertThresholds: {
            contentionFailureCount: 1,
            durationCriticalMs: transactionDurationObjectiveMs,
            durationWarningMs: Math.round(transactionDurationObjectiveMs * 0.8),
            evaluationWindowMinutes: 5,
          },
          databaseBatchSize: 50,
          deadlockRetries: 1,
          lockWaitLimitMs,
          requirementImportMaxRows: candidateRowCount,
          timeoutRetries: 0,
          transactionDurationObjectiveMs,
        },
        schemaVersion: 'requirement-import-transaction-benchmark.v1',
        refinement,
        screening,
        transactionContracts: {
          mcpExecutionIsolation: 'SERIALIZABLE',
          mcpValidationAdmissionIsolation: 'SERIALIZABLE',
          restExecutionIsolation: 'READ COMMITTED',
        },
      })

      await mkdir(outputDirectory, { recursive: true })
      await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
      if (updateBaseline) {
        await writeFile(baselinePath, `${JSON.stringify(evidence, null, 2)}\n`)
      }

      expect(candidate.measuredRepetitions).toBe(confirmationRepetitions)
      expect(contention).toHaveLength(4)
      expect(candidate.measuredRepetitions).toBeGreaterThan(0)
    })
  },
)
