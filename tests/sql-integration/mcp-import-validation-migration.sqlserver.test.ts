import type { DataSource, QueryRunner } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSqlServerDataSource } from '@/lib/typeorm/sqlserver-config'
import { getSqlServerMigrationUrl } from '@/scripts/db-sqlserver-admin.mjs'
import { McpImportValidationOwnershipQuotas1720300000000 } from '@/typeorm/migrations/0056_mcp_import_validation_ownership_quotas.mjs'
import { resolveSqlIntegrationTestsUrl } from './helpers/sql-test-database'

function migrationTestUrl(): string {
  const url = new URL(getSqlServerMigrationUrl(process.env))
  url.pathname = new URL(resolveSqlIntegrationTestsUrl()).pathname
  return url.toString()
}

async function insertSession(
  queryRunner: QueryRunner,
  tokenHash: string,
  withOwnership: boolean,
): Promise<void> {
  await queryRunner.query(
    `INSERT INTO requirement_import_validation_sessions (
       token_hash,
       payload_hash,
       destination_kind,
       destination_id,
       reference_data_fingerprint,
       destination_snapshot_json,
       submitted_payload_json,
       validation_result_json,
       execution_result_json,
       expires_at,
       created_at,
       updated_at${withOwnership ? ', creator_principal_fingerprint, reserved_bytes' : ''}
     ) VALUES (
       @0, @1, N'requirements_library', 1, @2, N'{}', N'{}', N'{}', NULL,
       DATEADD(hour, 1, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME()
       ${withOwnership ? ', @3, 1280' : ''}
     )`,
    [
      tokenHash,
      'b'.repeat(64),
      'c'.repeat(64),
      ...(withOwnership ? ['d'.repeat(64)] : []),
    ],
  )
}

describe('MCP import-validation ownership migration against SQL Server', () => {
  let dataSource: DataSource
  let queryRunner: QueryRunner
  const migration = new McpImportValidationOwnershipQuotas1720300000000()

  beforeAll(async () => {
    dataSource = createSqlServerDataSource({
      entities: [],
      url: migrationTestUrl(),
    })
    await dataSource.initialize()
    queryRunner = dataSource.createQueryRunner()
    await queryRunner.connect()
  })

  afterAll(async () => {
    await queryRunner?.release()
    await dataSource?.destroy()
  })

  it('purges incompatible sessions on rollback and re-application', async () => {
    await insertSession(queryRunner, '1'.repeat(64), true)
    await queryRunner.query(
      `INSERT INTO requirement_import_validation_rate_buckets (
         principal_fingerprint,
         window_started_at,
         successful_creations,
         expires_at,
         created_at,
         updated_at
       ) VALUES (
         @0, DATEADD(minute, -1, SYSUTCDATETIME()), 1,
         DATEADD(minute, 9, SYSUTCDATETIME()),
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      ['d'.repeat(64)],
    )

    await migration.down(queryRunner)

    await expect(
      queryRunner.query(
        `SELECT COUNT(*) AS count
         FROM requirement_import_validation_sessions`,
      ),
    ).resolves.toMatchObject([{ count: 0 }])
    await expect(
      queryRunner.query(
        `SELECT
           COL_LENGTH(
             N'requirement_import_validation_sessions',
             N'creator_principal_fingerprint'
           ) AS creator_column,
           OBJECT_ID(
             N'requirement_import_validation_rate_buckets', N'U'
           ) AS rate_table`,
      ),
    ).resolves.toMatchObject([{ creator_column: null, rate_table: null }])

    await insertSession(queryRunner, '2'.repeat(64), false)
    await migration.up(queryRunner)

    await expect(
      queryRunner.query(
        `SELECT COUNT(*) AS count
         FROM requirement_import_validation_sessions`,
      ),
    ).resolves.toMatchObject([{ count: 0 }])
    await expect(
      queryRunner.query(
        `SELECT
           COL_LENGTH(
             N'requirement_import_validation_sessions',
             N'creator_principal_fingerprint'
           ) AS creator_column,
           OBJECT_ID(
             N'requirement_import_validation_rate_buckets', N'U'
           ) AS rate_table`,
      ),
    ).resolves.toEqual([
      {
        creator_column: expect.any(Number),
        rate_table: expect.any(Number),
      },
    ])
  })

  it('preserves owned sessions when up is repeated', async () => {
    await insertSession(queryRunner, '3'.repeat(64), true)

    await migration.up(queryRunner)

    await expect(
      queryRunner.query(
        `SELECT COUNT(*) AS count
         FROM requirement_import_validation_sessions
         WHERE token_hash = @0`,
        ['3'.repeat(64)],
      ),
    ).resolves.toEqual([{ count: 1 }])
  })
})
