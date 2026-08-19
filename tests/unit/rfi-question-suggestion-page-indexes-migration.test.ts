import { describe, expect, it, vi } from 'vitest'
import RfiQuestionSuggestionPageIndexes from '@/typeorm/migrations/0059_rfi_question_suggestion_page_indexes.mjs'

describe('RFI question suggestion page indexes migration', () => {
  it('indexes the stable page order and its common filters', async () => {
    const query = vi.fn(async (_sql: string) => undefined)

    await new RfiQuestionSuggestionPageIndexes().up({ query })

    const sql = query.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('[idx_rfi_question_suggestions_created_at_id]')
    expect(sql).toContain('([created_at], [id])')
    expect(sql).toContain(
      '[idx_rfi_question_suggestions_area_id_created_at_id]',
    )
    expect(sql).toContain('([area_id], [created_at], [id])')
    expect(sql).toContain(
      '[idx_rfi_question_suggestions_specification_id_created_at_id]',
    )
    expect(sql).toContain('([specification_id], [created_at], [id])')
  })

  it('restores the former area and specification indexes on rollback', async () => {
    const query = vi.fn(async (_sql: string) => undefined)

    await new RfiQuestionSuggestionPageIndexes().down({ query })

    const sql = query.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('[idx_rfi_question_suggestions_area_id]')
    expect(sql).toContain('[idx_rfi_question_suggestions_specification_id]')
  })
})
