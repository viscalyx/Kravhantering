import { describe, expect, it, vi } from 'vitest'
import {
  removeAiSafetyRuleTerms,
  updateAiSafetyRuleTerm,
} from '@/lib/dal/ai-safety-rules'
import type { SqlServerDatabase } from '@/lib/db'

function dbWithoutWork(): SqlServerDatabase {
  return {
    transaction: vi.fn(),
  } as unknown as SqlServerDatabase
}

describe('AI safety rules DAL validation', () => {
  it('rejects non-integer batch term ids before deduplicating or writing', async () => {
    const db = dbWithoutWork()

    await expect(removeAiSafetyRuleTerms(db, [12.7])).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_term_ids' },
    })
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('rejects non-integer term ids for single-term updates', async () => {
    const db = dbWithoutWork()

    await expect(
      updateAiSafetyRuleTerm(db, 12.7, { isActive: false }),
    ).rejects.toMatchObject({
      code: 'validation',
      details: { reason: 'invalid_term_id' },
    })
    expect(db.transaction).not.toHaveBeenCalled()
  })
})
