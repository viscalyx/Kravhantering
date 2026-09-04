import type { DataSource, QueryRunner } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createSqlServerDataSource } from '@/lib/typeorm/sqlserver-config'
import { getSqlServerMigrationUrl } from '@/scripts/db-sqlserver-admin.mjs'
import { HsaVerificationQuota1720800000000 } from '@/typeorm/migrations/0061_hsa_verification_quota.mjs'
import { resolveSqlIntegrationTestsUrl } from './helpers/sql-test-database'

function migrationTestUrl(): string {
  const url = new URL(getSqlServerMigrationUrl(process.env))
  url.pathname = new URL(resolveSqlIntegrationTestsUrl()).pathname
  return url.toString()
}

describe('HSA verification quota migration against SQL Server', () => {
  let dataSource: DataSource
  let queryRunner: QueryRunner
  const migration = new HsaVerificationQuota1720800000000()

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

  it('supports idempotent application and destructive schema rollback', async () => {
    await migration.up(queryRunner)
    await queryRunner.query(
      `INSERT INTO hsa_verification_quota_buckets (
         bucket_kind,
         actor_fingerprint,
         target_fingerprint,
         actor_subject_fingerprint,
         request_count,
         window_started_at,
         expires_at,
         created_at,
         updated_at
       ) VALUES (
         N'actor', @0, NULL, @1, 1,
         DATEADD(minute, DATEDIFF(minute, 0, SYSUTCDATETIME()), 0),
         DATEADD(second, 60, DATEADD(minute, DATEDIFF(minute, 0, SYSUTCDATETIME()), 0)),
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [actorFingerprint(), targetFingerprint()],
    )

    await migration.up(queryRunner)
    await expect(
      queryRunner.query(
        'SELECT COUNT(*) AS count FROM hsa_verification_quota_buckets',
      ),
    ).resolves.toEqual([{ count: 1 }])

    await migration.down(queryRunner)
    await expect(
      queryRunner.query(
        "SELECT OBJECT_ID(N'hsa_verification_quota_buckets', N'U') AS tableId",
      ),
    ).resolves.toEqual([{ tableId: null }])
    await migration.up(queryRunner)
  })

  it('rejects bucket timestamps outside their fixed window order', async () => {
    await expect(
      queryRunner.query(
        `DECLARE @window_start datetime2(3) =
           DATEADD(minute, DATEDIFF(minute, 0, SYSUTCDATETIME()), 0);
         INSERT INTO hsa_verification_quota_buckets (
           bucket_kind,
           actor_fingerprint,
           target_fingerprint,
           actor_subject_fingerprint,
           request_count,
           window_started_at,
           expires_at,
           created_at,
           updated_at
         ) VALUES (
           N'actor', @0, NULL, @1, 1, @window_start,
           DATEADD(second, 60, @window_start),
           DATEADD(second, 2, @window_start),
           DATEADD(second, 1, @window_start)
         )`,
        [actorFingerprint(), targetFingerprint()],
      ),
    ).rejects.toThrow()
  })
})

function actorFingerprint(): string {
  return `afp_${'a'.repeat(22)}`
}

function targetFingerprint(): string {
  return `hfp_${'b'.repeat(22)}`
}
