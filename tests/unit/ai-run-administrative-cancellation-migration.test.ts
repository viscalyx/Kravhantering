import { describe, expect, it, vi } from 'vitest'
import AiRunAdministrativeCancellation from '@/typeorm/migrations/0064_ai_run_administrative_cancellation.mjs'
import {
  RUNTIME_PERMISSION_MANIFEST,
  RUNTIME_PERMISSION_MANIFEST_VERSION,
} from '@/typeorm/runtime-permission-manifest.mjs'

describe('AI run administrative cancellation migration', () => {
  it('adds nullable transient cancellation state, its constraint and index, and only column-scoped runtime updates', async () => {
    const query = vi.fn(async (_statement: string) => undefined)

    await new AiRunAdministrativeCancellation().up({ query })

    const sql = query.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('[cancellation_requested_at] datetime2(3) NULL')
    expect(sql).toContain('[cancellation_reason] nvarchar(40) NULL')
    expect(sql).toContain('chk_ai_run_coordination_entries_cancellation')
    expect(sql).toContain("N'connection_suspended'")
    expect(sql).toContain("N'connection_retired'")
    expect(sql).toContain("N'profile_suspended'")
    expect(sql).toContain(
      'idx_ai_run_coordination_entries_cancellation_requested_at',
    )
    expect(sql).toContain(
      'GRANT UPDATE ([cancellation_requested_at], [cancellation_reason])',
    )
    expect(sql).not.toContain('GRANT UPDATE ON OBJECT')
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE)\s+\[ai_run_coordination_entries\]/u,
    )
    expect(RUNTIME_PERMISSION_MANIFEST_VERSION).toBe('2026.08.20.1')
    expect(
      RUNTIME_PERMISSION_MANIFEST.find(
        permission => permission.object === 'dbo.ai_run_coordination_entries',
      ),
    ).toMatchObject({
      updateColumns: expect.arrayContaining([
        'cancellation_requested_at',
        'cancellation_reason',
      ]),
    })
  })

  it('drops the filtered index and constraint before both columns', async () => {
    const query = vi.fn(async (_statement: string) => undefined)

    await new AiRunAdministrativeCancellation().down({ query })

    const sql = query.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql.indexOf('DROP INDEX')).toBeLessThan(
      sql.indexOf('DROP CONSTRAINT'),
    )
    expect(sql.indexOf('DROP CONSTRAINT')).toBeLessThan(
      sql.indexOf('DROP COLUMN'),
    )
    expect(sql).toContain(
      'DROP COLUMN [cancellation_requested_at], [cancellation_reason]',
    )
  })
})
