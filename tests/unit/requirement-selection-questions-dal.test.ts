import { describe, expect, it, vi } from 'vitest'
import { getExistingSpecificationRequirementIds } from '@/lib/dal/requirement-selection-questions'

function createDb(rows: unknown[]) {
  return {
    query: vi.fn(async () => rows),
  } as unknown as Parameters<typeof getExistingSpecificationRequirementIds>[0]
}

describe('requirement selection questions DAL', () => {
  it('loads existing requirement ids through the specification item foreign key', async () => {
    const db = createDb([{ requirementId: 101 }, { requirementId: 102 }])

    await expect(getExistingSpecificationRequirementIds(db, 6)).resolves.toEqual(
      [101, 102],
    )

    const query = vi.mocked(db.query)
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('item.requirements_specification_id = @0'),
      [6],
    )
    expect(String(query.mock.calls[0]?.[0])).not.toContain(
      'item.specification_id',
    )
  })
})
