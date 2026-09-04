import { describe, expect, it } from 'vitest'
import type { SqlServerDatabase } from '@/lib/db'
import {
  inspectExpiredAiForensicEvidence,
  purgeExpiredAiForensicEvidence,
} from '@/lib/transient-cleanup/ai-forensic-evidence'
import {
  inspectExpiredHsaVerificationQuotaBuckets,
  purgeExpiredHsaVerificationQuotaBuckets,
} from '@/lib/transient-cleanup/hsa-verification-quota-buckets'
import {
  inspectExpiredRequirementImportValidationRateBuckets,
  purgeExpiredRequirementImportValidationRateBuckets,
} from '@/lib/transient-cleanup/requirement-import-validation-rate-buckets'
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
      creator_principal_fingerprint,
      payload_hash,
      destination_kind,
      destination_id,
      reference_data_fingerprint,
      reserved_bytes,
      destination_snapshot_json,
      submitted_payload_json,
      validation_result_json,
      execution_result_json,
      expires_at,
      created_at,
      updated_at
    ) VALUES
      (REPLICATE(N'a', 64), REPLICATE(N'p', 64), REPLICATE(N'b', 64), N'requirements_library',
       1, REPLICATE(N'c', 64), 4096, N'{}', N'{"expired":1}', N'{}', NULL,
       DATEADD(hour, -1, @now), DATEADD(hour, -2, @now), @now),
      (REPLICATE(N'd', 64), REPLICATE(N'p', 64), REPLICATE(N'e', 64), N'requirements_library',
       1, REPLICATE(N'f', 64), 4096, N'{}', N'{"expired":2}', N'{}', NULL,
       DATEADD(minute, -30, @now), DATEADD(hour, -1, @now), @now),
      (REPLICATE(N'g', 64), REPLICATE(N'p', 64), REPLICATE(N'h', 64), N'requirements_library',
       1, REPLICATE(N'i', 64), 4096, N'{}', N'{"expired":3}', N'{}', NULL,
       DATEADD(minute, -1, @now), DATEADD(hour, -1, @now), @now),
      (REPLICATE(N'j', 64), REPLICATE(N'p', 64), REPLICATE(N'k', 64), N'requirements_library',
       1, REPLICATE(N'l', 64), 4096, N'{}', N'{"active":true}', N'{}', NULL,
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

  it('purges expired creation-rate buckets while preserving active windows', async () => {
    await appDb().query(`
      DECLARE @now datetime2(3) = SYSUTCDATETIME();
      INSERT INTO requirement_import_validation_rate_buckets (
        principal_fingerprint, window_started_at, successful_creations,
        expires_at, created_at, updated_at
      ) VALUES
        (REPLICATE(N'a', 64), DATEADD(minute, -20, @now), 3,
         DATEADD(minute, -10, @now), DATEADD(minute, -20, @now), @now),
        (REPLICATE(N'b', 64), DATEADD(minute, -10, @now), 2,
         DATEADD(minute, 10, @now), DATEADD(minute, -10, @now), @now);
    `)

    expect(
      await inspectExpiredRequirementImportValidationRateBuckets(appDb()),
    ).toMatchObject({ expiredRowCount: 1 })
    await expect(
      purgeExpiredRequirementImportValidationRateBuckets(appDb(), 10),
    ).resolves.toEqual({ deletedRows: 1 })
    const rows = (await appDb().query(
      'SELECT principal_fingerprint AS principalFingerprint FROM requirement_import_validation_rate_buckets',
    )) as Array<{ principalFingerprint: string }>
    expect(rows).toEqual([{ principalFingerprint: 'b'.repeat(64) }])
  })

  it('purges expired HSA verification quota buckets in bounded batches', async () => {
    await appDb().query(`
      DECLARE @current_window datetime2(3) = DATEADD(
        minute, DATEDIFF_BIG(minute, CONVERT(datetime2(3), '1970-01-01'), SYSUTCDATETIME()),
        CONVERT(datetime2(3), '1970-01-01')
      );
      INSERT INTO hsa_verification_quota_buckets (
        bucket_kind, actor_fingerprint, target_fingerprint,
        actor_subject_fingerprint, request_count, window_started_at,
        expires_at, created_at, updated_at
      ) VALUES
        (N'actor', N'afp_aaaaaaaaaaaaaaaaaaaaaa', NULL,
         N'hfp_bbbbbbbbbbbbbbbbbbbbbb', 3,
         DATEADD(minute, -1, @current_window), @current_window,
         DATEADD(minute, -1, @current_window), @current_window),
        (N'target', NULL, N'hfp_cccccccccccccccccccccc', NULL, 2,
         @current_window, DATEADD(second, 60, @current_window),
         @current_window, @current_window);
    `)

    await expect(
      inspectExpiredHsaVerificationQuotaBuckets(appDb()),
    ).resolves.toMatchObject({ expiredRowCount: 1 })
    await expect(
      purgeExpiredHsaVerificationQuotaBuckets(appDb(), 10),
    ).resolves.toEqual({ deletedRows: 1 })
    const rows = (await appDb().query(
      'SELECT bucket_kind AS bucketKind FROM hsa_verification_quota_buckets',
    )) as Array<{ bucketKind: string }>
    expect(rows).toEqual([{ bucketKind: 'target' }])
  })

  it('purges forensic evidence 72 hours after capture stop', async () => {
    await appDb().query(`
      DECLARE @now datetime2(3) = SYSUTCDATETIME();
      INSERT INTO ai_forensic_capture_windows (
        operation, direction, requested_by_hsa_id,
        requested_by_display_name, requested_at, approved_by_hsa_id,
        approved_by_display_name, approved_at, expires_at,
        stopped_at, is_open, event_byte_limit, event_item_limit,
        collection_item_limit
      ) VALUES (
        N'ai.generate-requirement-import', N'output',
        N'SE5560000001-cleanup-admin1', N'Ada Admin', DATEADD(minute, -10, @now),
        N'SE5560000001-cleanup-privacy1', N'Disa Privacy Officer',
        DATEADD(hour, -74, @now), DATEADD(minute, 10, @now),
        DATEADD(hour, -73, @now), NULL, 8192, 8, 1000
      );
      DECLARE @captureId int = SCOPE_IDENTITY();
      DECLARE @evidence nvarchar(max) = N'[{"label":"output","excerpt":"[REDACTED_SECRET]"}]';
      INSERT INTO ai_forensic_evidence_events (
        ai_forensic_capture_window_id, event_id, actor_fingerprint,
        blocked_step, primary_rule_id, rule_ids_json, evidence_json,
        item_count, byte_count, captured_at
      ) VALUES (
        @captureId, NEWID(), NULL, N'final_model_output', N'sensitive_backend_leak',
        N'["sensitive_backend_leak"]', @evidence, 1, DATALENGTH(@evidence),
        DATEADD(hour, -73, @now)
      );
    `)

    await expect(
      inspectExpiredAiForensicEvidence(appDb()),
    ).resolves.toMatchObject({ expiredRowCount: 1 })
    await expect(purgeExpiredAiForensicEvidence(appDb(), 10)).resolves.toEqual({
      deletedRows: 1,
    })
    const rows = (await appDb().query(`
      SELECT capture.expiry_audited_at AS expiryAuditedAt,
        capture.purged_at AS purgedAt,
        COUNT_BIG(evidence.id) AS eventCount
      FROM ai_forensic_capture_windows capture
      LEFT JOIN ai_forensic_evidence_events evidence
        ON evidence.ai_forensic_capture_window_id = capture.id
      GROUP BY capture.expiry_audited_at, capture.purged_at
    `)) as Array<{
      eventCount: number | string
      expiryAuditedAt: Date | null
      purgedAt: Date | null
    }>
    expect(rows[0]?.expiryAuditedAt).toBeNull()
    expect(rows[0]?.purgedAt).toBeInstanceOf(Date)
    expect(Number(rows[0]?.eventCount)).toBe(0)
  })
})
