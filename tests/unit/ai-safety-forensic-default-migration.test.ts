import { describe, expect, it, vi } from 'vitest'
import { AI_SAFETY_FORENSIC_LOGGING_DEFAULT } from '@/lib/ai/generation-availability'
import { aiSettingEntity } from '@/lib/typeorm/entities/ai-setting'
import { REQUIRED_SEED_DATA } from '@/typeorm/seed-required.mjs'

describe('AI safety forensic capture default migration', () => {
  it('disables raw forensic capture in code, entity, and required seed defaults', () => {
    const seed = REQUIRED_SEED_DATA.ai_settings
    const forensicColumnIndex = seed.columns.indexOf(
      'ai_safety_forensic_logging_enabled',
    )

    expect(AI_SAFETY_FORENSIC_LOGGING_DEFAULT).toBe(false)
    expect(
      aiSettingEntity.options.columns?.aiSafetyForensicLoggingEnabled,
    ).toMatchObject({ default: false })
    expect(forensicColumnIndex).toBeGreaterThanOrEqual(0)
    expect(seed.rows[0]?.[forensicColumnIndex]).toBe(0)
  })

  it('sorts after the previous migration by TypeORM timestamp', async () => {
    const [previousMigration, migration] = await Promise.all([
      import(
        '@/typeorm/migrations/0056_mcp_import_validation_ownership_quotas.mjs'
      ),
      import('@/typeorm/migrations/0057_ai_safety_forensic_default.mjs'),
    ])
    const previousName = new previousMigration.default().name
    const name = new migration.default().name

    expect(name).toBe('AiSafetyForensicDefault1720400000000')
    expect(Number(name.match(/\d+$/)?.[0])).toBeGreaterThan(
      Number(previousName.match(/\d+$/)?.[0]),
    )
  })

  it('changes only the database default to disabled during upgrade', async () => {
    const migration = await import(
      '@/typeorm/migrations/0057_ai_safety_forensic_default.mjs'
    )
    const queryRunner = { query: vi.fn(async (_statement: string) => {}) }

    await new migration.default().up(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(sql).toContain(
      'DROP CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled]',
    )
    expect(sql).toContain(
      'ADD CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled] DEFAULT (0)',
    )
    expect(sql).not.toMatch(/UPDATE\s+\[ai_settings\]/i)
  })

  it('applies the disabled value to the migration-created fresh-install row', async () => {
    const migration = await import(
      '@/typeorm/migrations/0057_ai_safety_forensic_default.mjs'
    )
    const queryRunner = {
      connection: {
        options: { kravhanteringFreshInstallation: true },
      },
      query: vi.fn(async (_statement: string) => {}),
    }

    await new migration.default().up(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(sql).toMatch(/UPDATE\s+\[ai_settings\]/i)
    expect(sql).toContain('SET [ai_safety_forensic_logging_enabled] = 0')
    expect(sql).toContain('WHERE [id] = 1')
  })

  it('restores only the previous enabled default during rollback', async () => {
    const migration = await import(
      '@/typeorm/migrations/0057_ai_safety_forensic_default.mjs'
    )
    const queryRunner = { query: vi.fn(async (_statement: string) => {}) }

    await new migration.default().down(queryRunner)

    const sql = queryRunner.query.mock.calls
      .map(([statement]) => String(statement))
      .join('\n')
    expect(sql).toContain(
      'ADD CONSTRAINT [df_ai_settings_ai_safety_forensic_logging_enabled] DEFAULT (1)',
    )
    expect(sql).not.toMatch(/UPDATE\s+\[ai_settings\]/i)
  })
})
