import { describe, expect, it, vi } from 'vitest'
import { seedRequiredDatabase } from '@/typeorm/seed-required.mjs'

describe('required seed reconciliation', () => {
  it('retains per-table developer diagnostics when seed debugging is enabled', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('SEED_DEBUG', '1')
    try {
      await expect(
        seedRequiredDatabase({
          isTransactionActive: true,
          query: async () => {
            throw new Error('database unavailable')
          },
        }),
      ).rejects.toThrow('database unavailable')
      expect(diagnostic).toHaveBeenCalledWith(
        '[seed] table=archiving_retention_policies rows=6 identityInsert=false',
      )
    } finally {
      vi.unstubAllEnvs()
      diagnostic.mockRestore()
    }
  })

  it('does not commit ordinary writes when required AI synchronization fails', async () => {
    const failure = new Error('AI storage unavailable')
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('[ai_safety_rules]')) throw failure
      if (sql.includes('OUTPUT INSERTED.')) return [{ id: 1 }]
      return []
    })
    const runner = {
      connect: vi.fn(),
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn(),
      release: vi.fn(),
      query,
      isTransactionActive: true,
    }
    const source = { createQueryRunner: () => runner, query }

    await expect(seedRequiredDatabase(source)).rejects.toThrow(
      'AI storage unavailable',
    )
    expect(runner.commitTransaction).not.toHaveBeenCalled()
    expect(runner.rollbackTransaction).toHaveBeenCalledOnce()
  })
})
