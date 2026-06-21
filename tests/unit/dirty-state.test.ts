import { describe, expect, it } from 'vitest'
import { createDirtySnapshot, hasDirtyPayload } from '@/lib/forms/dirty-state'

describe('dirty-state', () => {
  it('normalizes trimmed empty values like null and undefined', () => {
    expect(
      createDirtySnapshot({
        description: '   ',
        notes: undefined,
        owner: null,
      }),
    ).toBe(createDirtySnapshot({}))
  })

  it('compares string values after trimming', () => {
    expect(createDirtySnapshot({ name: '  Förvaltning  ' })).toBe(
      createDirtySnapshot({ name: 'Förvaltning' }),
    )
  })

  it('uses stable object key ordering', () => {
    expect(createDirtySnapshot({ b: 2, a: 1 })).toBe(
      createDirtySnapshot({ a: 1, b: 2 }),
    )
  })

  it('sorts configured unordered id lists', () => {
    const options = { unorderedArrayPaths: ['requirementIds'] }

    expect(createDirtySnapshot({ requirementIds: [3, 1, 2] }, options)).toBe(
      createDirtySnapshot({ requirementIds: [1, 2, 3] }, options),
    )
  })

  it('preserves array order when the path is ordered', () => {
    expect(createDirtySnapshot({ sortOrder: [3, 1, 2] })).not.toBe(
      createDirtySnapshot({ sortOrder: [1, 2, 3] }),
    )
  })

  it('detects reset back to the original normalized payload', () => {
    const baseline = { name: 'Krav', requirementIds: [1, 2] }
    const changed = { name: 'Krav  ', requirementIds: [2, 1] }

    expect(
      hasDirtyPayload(baseline, changed, {
        unorderedArrayPaths: ['requirementIds'],
      }),
    ).toBe(false)
  })
})
