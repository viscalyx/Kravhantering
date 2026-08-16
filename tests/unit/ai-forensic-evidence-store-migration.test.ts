import { describe, expect, it, vi } from 'vitest'
import { aiSettingEntity } from '@/lib/typeorm/entities/ai-setting'

describe('AI forensic evidence store migration', () => {
  it('replaces the global forensic toggle with bounded isolated tables', async () => {
    const migration = await import(
      '@/typeorm/migrations/0058_ai_forensic_evidence_store.mjs'
    )
    const queryRunner = { query: vi.fn(async (_statement: string) => {}) }

    await new migration.default().up(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(sql).toContain('CREATE TABLE [ai_forensic_capture_windows]')
    expect(sql).toContain('CREATE TABLE [ai_forensic_evidence_events]')
    expect(sql).toContain('[evidence_json] nvarchar(max) NOT NULL')
    expect(sql).toContain(
      'CONSTRAINT [chk_ai_forensic_evidence_events_byte_count]',
    )
    expect(sql).toContain(
      'CHECK ([expires_at] BETWEEN DATEADD(minute, 5, [requested_at])',
    )
    expect(sql).toContain('AND DATEADD(minute, 60, [requested_at]))')
    expect(sql).toContain('DROP COLUMN [ai_safety_forensic_logging_enabled]')
    expect(
      (aiSettingEntity.options.columns as Record<string, unknown> | undefined)
        ?.aiSafetyForensicLoggingEnabled,
    ).toBeUndefined()
  })

  it('drops the isolated tables and restores the global toggle on rollback', async () => {
    const migration = await import(
      '@/typeorm/migrations/0058_ai_forensic_evidence_store.mjs'
    )
    const queryRunner = { query: vi.fn(async (_statement: string) => {}) }

    await new migration.default().down(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(sql).toContain(
      'ADD [ai_safety_forensic_logging_enabled] bit NOT NULL',
    )
    expect(sql).toContain('DROP TABLE [ai_forensic_evidence_events]')
    expect(sql).toContain('DROP TABLE [ai_forensic_capture_windows]')
  })
})
