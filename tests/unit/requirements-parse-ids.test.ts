import { describe, expect, it } from 'vitest'
import { parsePositiveIntegerIds } from '@/lib/requirements/parse-ids'

describe('parsePositiveIntegerIds', () => {
  it('filters invalid values and preserves first-seen positive integer ids', () => {
    expect(
      parsePositiveIntegerIds([1, '2', 2, 0, -1, 1.5, 'abc', '3']),
    ).toEqual([1, 2, 3])
  })
})
