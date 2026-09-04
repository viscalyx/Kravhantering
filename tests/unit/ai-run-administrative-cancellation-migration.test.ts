import { describe, expect, it, vi } from 'vitest'
import AiConnectionsDataModel from '@/typeorm/migrations/0060_ai_connections_data_model.mjs'
import {
  RUNTIME_PERMISSION_MANIFEST,
  RUNTIME_PERMISSION_MANIFEST_VERSION,
} from '@/typeorm/runtime-permission-manifest.mjs'

describe('AI run administrative cancellation migration', () => {
  it('adds nullable transient cancellation state, its constraint and index, and only column-scoped runtime updates', async () => {
    const query = vi.fn(async (_statement: string) => undefined)

    await new AiConnectionsDataModel().up({ query })

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
      '[cancellation_requested_at], [cancellation_reason], [updated_at]) ON OBJECT::[dbo].[ai_run_coordination_entries]',
    )
    expect(sql).not.toContain('GRANT UPDATE ON OBJECT')
    expect(sql).not.toMatch(
      /\b(?:INSERT|UPDATE)\s+\[ai_run_coordination_entries\]/u,
    )
    expect(RUNTIME_PERMISSION_MANIFEST_VERSION).toBe('2026.09.04.1')
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

  it('drops the owning coordination table before its dependencies', async () => {
    const query = vi.fn(async (_statement: string) => undefined)

    await new AiConnectionsDataModel().down({ query })

    const sql = query.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('DROP TABLE [ai_run_coordination_entries]')
    expect(
      sql.indexOf('DROP TABLE [ai_run_coordination_entries]'),
    ).toBeLessThan(sql.indexOf('DROP TABLE [ai_run_profiles]'))
  })
})
