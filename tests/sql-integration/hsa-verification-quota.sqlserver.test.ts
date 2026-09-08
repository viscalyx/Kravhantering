import { setTimeout as delay } from 'node:timers/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  consumeHsaVerificationQuota,
  type HsaVerificationQuotaInput,
} from '@/lib/dal/hsa-verification-quota'
import type { SqlServerDatabase } from '@/lib/db'
import { createAppDataSource } from '@/lib/typeorm/data-source'
import {
  resolveSqlIntegrationTestsUrl,
  useSqlIntegrationDatabase,
} from './helpers/sql-test-database'

function actorFingerprint(index: number): string {
  return `afp_${index.toString(36).padStart(22, '0')}`
}

function targetFingerprint(index: number): string {
  return `hfp_${index.toString(36).padStart(22, '0')}`
}

function quotaInput(actor: number, target: number): HsaVerificationQuotaInput {
  return {
    actorFingerprint: actorFingerprint(actor),
    actorSubjectFingerprint: targetFingerprint(actor + 10_000),
    targetFingerprint: targetFingerprint(target),
  }
}

describe('HSA verification quota against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()
  let secondAppDb: SqlServerDatabase

  beforeAll(async () => {
    secondAppDb = createAppDataSource({ url: resolveSqlIntegrationTestsUrl() })
    await secondAppDb.initialize()
  })

  afterAll(async () => {
    await secondAppDb?.destroy()
  })

  beforeEach(async () => {
    // Admission counts are per SQL minute. Leave enough time for the whole
    // scenario after fixture setup, including concurrent clients on CI.
    for (;;) {
      const [clock] = await appDb().query<Array<{ remainingMs: number }>>(`
        DECLARE @now datetime2(3) = SYSUTCDATETIME();
        SELECT (60 - DATEPART(second, @now)) * 1000
          - DATEPART(millisecond, @now) AS remainingMs;
      `)
      if (clock.remainingMs >= 15_000) return
      // Keep the wait outside a query so it cannot hit the SQL request timeout.
      await delay(clock.remainingMs)
    }
  })

  it('shares target consumption across two application clients', async () => {
    for (let index = 0; index < 10; index += 1) {
      const db = index % 2 === 0 ? appDb() : secondAppDb
      await expect(
        consumeHsaVerificationQuota(db, quotaInput(index + 1, 1)),
      ).resolves.toEqual({ allowed: true })
    }

    await expect(
      consumeHsaVerificationQuota(secondAppDb, quotaInput(11, 1)),
    ).resolves.toMatchObject({ allowed: false, bucket: 'target' })

    const earlierBucketRows = (await appDb().query(
      `SELECT bucket_kind AS bucketKind, request_count AS requestCount
       FROM hsa_verification_quota_buckets
       WHERE actor_fingerprint = @0
       ORDER BY bucket_kind`,
      [actorFingerprint(11)],
    )) as Array<{ bucketKind: string; requestCount: number }>
    expect(earlierBucketRows).toEqual([
      { bucketKind: 'actor', requestCount: 1 },
      { bucketKind: 'actor_target', requestCount: 1 },
    ])
  })

  it('shares actor consumption and stops before later buckets on denial', async () => {
    const actor = 50
    const input = quotaInput(actor, 50)
    await appDb().query(
      `DECLARE @now datetime2(3) = SYSUTCDATETIME();
       DECLARE @window_start datetime2(3) = DATEADD(
         minute,
         DATEDIFF_BIG(minute, CONVERT(datetime2(3), '1970-01-01'), @now),
         CONVERT(datetime2(3), '1970-01-01')
       );
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
         N'actor', @0, NULL, @1, 49, @window_start,
         DATEADD(second, 60, @window_start), @now, @now
       );`,
      [input.actorFingerprint, input.actorSubjectFingerprint],
    )

    await expect(
      consumeHsaVerificationQuota(secondAppDb, input),
    ).resolves.toEqual({ allowed: true })
    const deniedInput = quotaInput(actor, 51)
    await expect(
      consumeHsaVerificationQuota(appDb(), deniedInput),
    ).resolves.toMatchObject({ allowed: false, bucket: 'actor' })

    const rows = (await appDb().query(
      `SELECT bucket_kind AS bucketKind, request_count AS requestCount
       FROM hsa_verification_quota_buckets
       WHERE actor_fingerprint = @0
       ORDER BY bucket_kind`,
      [input.actorFingerprint],
    )) as Array<{ bucketKind: string; requestCount: number }>
    expect(rows).toEqual([
      { bucketKind: 'actor', requestCount: 50 },
      { bucketKind: 'actor_target', requestCount: 1 },
    ])
    const deniedTargetRows = (await appDb().query(
      `SELECT COUNT_BIG(*) AS count
       FROM hsa_verification_quota_buckets
       WHERE target_fingerprint = @0`,
      [deniedInput.targetFingerprint],
    )) as Array<{ count: number }>
    expect(Number(deniedTargetRows[0]?.count)).toBe(0)
  })

  it('creates each bucket once for concurrent first admissions', async () => {
    const input = quotaInput(125, 125)
    const results = await Promise.all([
      consumeHsaVerificationQuota(appDb(), input),
      consumeHsaVerificationQuota(secondAppDb, input),
    ])

    expect(results).toEqual([{ allowed: true }, { allowed: true }])
    const rows = await appDb().query<
      Array<{ bucketKind: string; requestCount: number }>
    >(
      `SELECT bucket_kind AS bucketKind, request_count AS requestCount
       FROM hsa_verification_quota_buckets
       WHERE actor_fingerprint = @0 OR target_fingerprint = @1
       ORDER BY bucket_kind`,
      [input.actorFingerprint, input.targetFingerprint],
    )
    expect(rows).toEqual([
      { bucketKind: 'actor', requestCount: 2 },
      { bucketKind: 'actor_target', requestCount: 2 },
      { bucketKind: 'target', requestCount: 2 },
    ])
  })

  it('atomically admits only one client to the final target slot', async () => {
    // Fill the window before racing the final slot. A large burst can validly
    // exhaust the production one-second lock wait on a busy SQL Server.
    for (let index = 0; index < 9; index += 1) {
      await expect(
        consumeHsaVerificationQuota(appDb(), quotaInput(index + 100, 100)),
      ).resolves.toEqual({ allowed: true })
    }
    const results = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        consumeHsaVerificationQuota(
          index % 2 === 0 ? appDb() : secondAppDb,
          quotaInput(index + 109, 100),
        ),
      ),
    )

    expect(results.filter(result => result.allowed)).toHaveLength(1)
    expect(
      results.filter(result => !result.allowed && result.bucket === 'target'),
    ).toHaveLength(1)
    const rows = (await appDb().query(
      `SELECT request_count AS requestCount
       FROM hsa_verification_quota_buckets
       WHERE bucket_kind = N'target'
         AND target_fingerprint = @0`,
      [targetFingerprint(100)],
    )) as Array<{ requestCount: number }>
    expect(rows).toEqual([{ requestCount: 10 }])
  })

  it('atomically admits only one client to the final actor slot', async () => {
    const actor = 150
    const input = quotaInput(actor, 150)
    await appDb().query(
      `DECLARE @now datetime2(3) = SYSUTCDATETIME();
       DECLARE @window_start datetime2(3) = DATEADD(
         minute,
         DATEDIFF_BIG(minute, CONVERT(datetime2(3), '1970-01-01'), @now),
         CONVERT(datetime2(3), '1970-01-01')
       );
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
         N'actor', @0, NULL, @1, 49, @window_start,
         DATEADD(second, 60, @window_start), @now, @now
       );`,
      [input.actorFingerprint, input.actorSubjectFingerprint],
    )

    const results = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        consumeHsaVerificationQuota(
          index % 2 === 0 ? appDb() : secondAppDb,
          quotaInput(actor, 151 + index),
        ),
      ),
    )

    expect(results.filter(result => result.allowed)).toHaveLength(1)
    expect(
      results.filter(result => !result.allowed && result.bucket === 'actor'),
    ).toHaveLength(1)
    const rows = (await appDb().query(
      `SELECT request_count AS requestCount
       FROM hsa_verification_quota_buckets
       WHERE bucket_kind = N'actor' AND actor_fingerprint = @0`,
      [input.actorFingerprint],
    )) as Array<{ requestCount: number }>
    expect(rows).toEqual([{ requestCount: 50 }])
  })

  it('atomically admits only one client to the final actor-target slot', async () => {
    const input = quotaInput(175, 175)
    for (let index = 0; index < 9; index += 1) {
      await expect(
        consumeHsaVerificationQuota(appDb(), input),
      ).resolves.toEqual({
        allowed: true,
      })
    }
    const results = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        consumeHsaVerificationQuota(
          index % 2 === 0 ? appDb() : secondAppDb,
          input,
        ),
      ),
    )

    expect(results.filter(result => result.allowed)).toHaveLength(1)
    expect(
      results.filter(
        result => !result.allowed && result.bucket === 'actor_target',
      ),
    ).toHaveLength(1)
    const rows = (await appDb().query(
      `SELECT bucket_kind AS bucketKind, request_count AS requestCount
       FROM hsa_verification_quota_buckets
       WHERE actor_fingerprint = @0 OR target_fingerprint = @1
       ORDER BY bucket_kind`,
      [input.actorFingerprint, input.targetFingerprint],
    )) as Array<{ bucketKind: string; requestCount: number }>
    expect(rows).toEqual([
      { bucketKind: 'actor', requestCount: 11 },
      { bucketKind: 'actor_target', requestCount: 10 },
      { bucketKind: 'target', requestCount: 10 },
    ])
  })

  it('commits earlier consumption and stops after the first denied bucket', async () => {
    const input = quotaInput(200, 200)
    for (let index = 0; index < 10; index += 1) {
      await expect(
        consumeHsaVerificationQuota(appDb(), input),
      ).resolves.toEqual({ allowed: true })
    }

    await expect(
      consumeHsaVerificationQuota(appDb(), input),
    ).resolves.toMatchObject({ allowed: false, bucket: 'actor_target' })
    const rows = (await appDb().query(
      `SELECT bucket_kind AS bucketKind, request_count AS requestCount
       FROM hsa_verification_quota_buckets
       WHERE actor_fingerprint = @0 OR target_fingerprint = @1
       ORDER BY bucket_kind`,
      [input.actorFingerprint, input.targetFingerprint],
    )) as Array<{ bucketKind: string; requestCount: number }>
    expect(rows).toEqual([
      { bucketKind: 'actor', requestCount: 11 },
      { bucketKind: 'actor_target', requestCount: 10 },
      { bucketKind: 'target', requestCount: 10 },
    ])
  })

  it('admits requests in a new SQL minute after earlier buckets reach their limits', async () => {
    const input = quotaInput(250, 250)
    await consumeHsaVerificationQuota(appDb(), input)
    await appDb().query(
      `UPDATE hsa_verification_quota_buckets
       SET request_count = CASE WHEN bucket_kind = N'actor' THEN 50 ELSE 10 END,
           window_started_at = DATEADD(minute, -1, window_started_at),
           expires_at = DATEADD(minute, -1, expires_at),
           created_at = DATEADD(minute, -1, created_at),
           updated_at = DATEADD(minute, -1, updated_at)
       WHERE actor_fingerprint = @0 OR target_fingerprint = @1`,
      [input.actorFingerprint, input.targetFingerprint],
    )

    await expect(
      consumeHsaVerificationQuota(secondAppDb, input),
    ).resolves.toEqual({ allowed: true })
    const rows = (await appDb().query(
      `SELECT bucket_kind AS bucketKind, request_count AS requestCount
       FROM hsa_verification_quota_buckets
       WHERE actor_fingerprint = @0 OR target_fingerprint = @1
       ORDER BY bucket_kind, window_started_at`,
      [input.actorFingerprint, input.targetFingerprint],
    )) as Array<{ bucketKind: string; requestCount: number }>
    expect(rows).toEqual([
      { bucketKind: 'actor', requestCount: 50 },
      { bucketKind: 'actor', requestCount: 1 },
      { bucketKind: 'actor_target', requestCount: 10 },
      { bucketKind: 'actor_target', requestCount: 1 },
      { bucketKind: 'target', requestCount: 10 },
      { bucketKind: 'target', requestCount: 1 },
    ])
  })

  it('rolls back earlier buckets when target persistence fails', async () => {
    const input = quotaInput(300, 300)
    await appDb().query(`
      CREATE TRIGGER trg_test_hsa_quota_target_failure
      ON hsa_verification_quota_buckets
      AFTER INSERT AS
      BEGIN
        IF EXISTS (SELECT 1 FROM inserted WHERE bucket_kind = N'target')
          THROW 51062, 'Synthetic target failure.', 1;
      END
    `)
    try {
      await expect(
        consumeHsaVerificationQuota(appDb(), input),
      ).rejects.toThrow()
    } finally {
      await appDb().query(
        'DROP TRIGGER IF EXISTS trg_test_hsa_quota_target_failure',
      )
    }

    const rows = (await appDb().query(
      `SELECT COUNT_BIG(*) AS count
       FROM hsa_verification_quota_buckets
       WHERE actor_fingerprint = @0 OR target_fingerprint = @1`,
      [input.actorFingerprint, input.targetFingerprint],
    )) as Array<{ count: number }>
    expect(Number(rows[0]?.count)).toBe(0)
  })

  it('keeps updates monotonic when lock order differs from clock order', async () => {
    const input = quotaInput(350, 350)
    await appDb().query(
      `DECLARE @now datetime2(3) = SYSUTCDATETIME();
       DECLARE @window_start datetime2(3) = DATEADD(
         minute,
         DATEDIFF_BIG(
           minute,
           CONVERT(datetime2(3), '1970-01-01'),
           @now
         ),
         CONVERT(datetime2(3), '1970-01-01')
       );
       DECLARE @expires_at datetime2(3) =
         DATEADD(second, 60, @window_start);
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
         N'target', NULL, @0, NULL, 1, @window_start,
         @expires_at, @expires_at, @expires_at
       );`,
      [input.targetFingerprint],
    )

    await expect(
      consumeHsaVerificationQuota(secondAppDb, input),
    ).resolves.toEqual({ allowed: true })
    const rows = (await appDb().query(
      `SELECT
         created_at AS createdAt,
         request_count AS requestCount,
         updated_at AS updatedAt
       FROM hsa_verification_quota_buckets
       WHERE bucket_kind = N'target' AND target_fingerprint = @0`,
      [input.targetFingerprint],
    )) as Array<{ createdAt: Date; requestCount: number; updatedAt: Date }>
    expect(rows).toHaveLength(1)
    expect(rows[0]?.requestCount).toBe(2)
    expect(rows[0]?.updatedAt).toEqual(rows[0]?.createdAt)
  })

  it('uses minute-aligned SQL time and permits independent buckets concurrently', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        consumeHsaVerificationQuota(
          index % 2 === 0 ? appDb() : secondAppDb,
          quotaInput(index + 400, index + 400),
        ),
      ),
    )
    expect(results).toEqual(
      Array.from({ length: 8 }, () => ({ allowed: true })),
    )

    const rows = (await appDb().query(
      `SELECT DISTINCT
         DATEPART(second, window_started_at) AS seconds,
         DATEPART(millisecond, window_started_at) AS milliseconds,
         DATEDIFF(second, window_started_at, expires_at) AS windowSeconds
       FROM hsa_verification_quota_buckets`,
    )) as Array<{
      milliseconds: number
      seconds: number
      windowSeconds: number
    }>
    expect(rows).toEqual([{ milliseconds: 0, seconds: 0, windowSeconds: 60 }])
  })

  it('fails coordination after the one-second lock wait without retry', async () => {
    const input = quotaInput(500, 500)
    let releaseLock: () => void = () => undefined
    let announceLock: () => void = () => undefined
    const lockAcquired = new Promise<void>(resolve => {
      announceLock = resolve
    })
    const keepLock = new Promise<void>(resolve => {
      releaseLock = resolve
    })
    const holder = secondAppDb.transaction(async manager => {
      await manager.query(
        `DECLARE @lock_result int;
         EXEC @lock_result = sys.sp_getapplock
           @Resource = @0,
           @LockMode = N'Exclusive',
           @LockOwner = N'Transaction',
           @LockTimeout = 1000;
         IF @lock_result < 0 THROW 51063, 'Test lock failed.', 1;`,
        [
          `kravhantering:hsa-verification-quota:v1:actor:${input.actorFingerprint}:-`,
        ],
      )
      announceLock()
      await keepLock
    })
    await lockAcquired

    const startedAt = Date.now()
    try {
      await expect(
        consumeHsaVerificationQuota(appDb(), input),
      ).rejects.toThrow()
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900)
      expect(Date.now() - startedAt).toBeLessThan(2_500)
    } finally {
      releaseLock()
      await holder
    }
  })
})
