import { describe, expect, it } from 'vitest'
import { normalizedBatchGroups } from '@/lib/dal/batch-groups'

describe('normalizedBatchGroups', () => {
  it('normalizes bounds and preserves each source start index', () => {
    expect(normalizedBatchGroups([1, 2, 3], 2)).toEqual([
      { items: [1, 2], startIndex: 0 },
      { items: [3], startIndex: 2 },
    ])
    expect(normalizedBatchGroups([1, 2], 0)).toEqual([
      { items: [1], startIndex: 0 },
      { items: [2], startIndex: 1 },
    ])
    expect(normalizedBatchGroups([1, 2], 10)).toEqual([
      { items: [1, 2], startIndex: 0 },
    ])
    expect(normalizedBatchGroups([])).toEqual([])
  })
})
