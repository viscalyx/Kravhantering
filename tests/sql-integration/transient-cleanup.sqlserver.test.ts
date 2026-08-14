import { describe, expect, it } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import {
  inspectExpiredRequirementImportValidationSessions,
  purgeExpiredRequirementImportValidationSessions,
} from '@/lib/transient-cleanup/requirement-import-validation-sessions'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

async function insertSessions(db: SqlServerDatabase): Promise<void> {
  await db.query(`
    DECLARE @now datetime2(3) = SYSUTCDATETIME();
    INSERT INTO requirement_import_validation_sessions (
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
      updated_at
    ) VALUES
      (REPLICATE(N'a', 64), REPLICATE(N'b', 64), N'requirements_library',
       1, REPLICATE(N'c', 64), N'{}', N'{"expired":1}', N'{}', NULL,
       DATEADD(hour, -1, @now), DATEADD(hour, -2, @now), @now),
      (REPLICATE(N'd', 64), REPLICATE(N'e', 64), N'requirements_library',
       1, REPLICATE(N'f', 64), N'{}', N'{"expired":2}', N'{}', NULL,
       DATEADD(minute, -30, @now), DATEADD(hour, -1, @now), @now),
      (REPLICATE(N'g', 64), REPLICATE(N'h', 64), N'requirements_library',
       1, REPLICATE(N'i', 64), N'{}', N'{"expired":3}', N'{}', NULL,
       DATEADD(minute, -1, @now), DATEADD(hour, -1, @now), @now),
      (REPLICATE(N'j', 64), REPLICATE(N'k', 64), N'requirements_library',
       1, REPLICATE(N'l', 64), N'{}', N'{"active":true}', N'{}', NULL,
       DATEADD(hour, 1, @now), @now, @now);
  `)
}

describe('transient cleanup against SQL Server', () => {
  const appDb = useSqlIntegrationDatabase()

  it('bounds overlapping batches and preserves unexpired sessions', async () => {
    await insertSessions(appDb())

    const before = await inspectExpiredRequirementImportValidationSessions(
      appDb(),
    )
    const batches = await Promise.all([
      purgeExpiredRequirementImportValidationSessions(appDb(), 2),
      purgeExpiredRequirementImportValidationSessions(appDb(), 2),
    ])
    const after = await inspectExpiredRequirementImportValidationSessions(
      appDb(),
    )
    const remaining = (await appDb().query(`
      SELECT submitted_payload_json AS submittedPayloadJson
      FROM requirement_import_validation_sessions
      ORDER BY id
    `)) as Array<{ submittedPayloadJson: string }>

    expect(before.expiredRowCount).toBe(3)
    expect(before.expiredStoredBytes).toBeGreaterThan(0)
    expect(before.oldestExpiredAgeMs).toBeGreaterThanOrEqual(60 * 60 * 1000)
    expect(batches.map(batch => batch.deletedRows)).toEqual(
      expect.arrayContaining([1, 2]),
    )
    expect(after).toEqual({
      expiredRowCount: 0,
      expiredStoredBytes: 0,
      oldestExpiredAgeMs: null,
    })
    expect(remaining).toEqual([{ submittedPayloadJson: '{"active":true}' }])
  })
})
