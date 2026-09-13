import { describe, expect, it } from 'vitest'
import { amendmentEffectiveAt } from '@/lib/specifications/amendments'

describe('agreement calendar boundary', () => {
  it.each([
    ['2027-03-28', '2027-03-27T23:00:00.000Z'],
    ['2027-03-29', '2027-03-28T22:00:00.000Z'],
    ['2027-10-31', '2027-10-30T22:00:00.000Z'],
    ['2027-11-01', '2027-10-31T23:00:00.000Z'],
  ])(
    'resolves %s to the correct Stockholm midnight across daylight saving',
    (date, expected) => {
      expect(
        amendmentEffectiveAt(
          date,
          new Date('2027-01-01T10:00:00Z'),
        ).toISOString(),
      ).toBe(expected)
    },
  )
  it('uses the Stockholm calendar date and the actual decision time for today', () => {
    const now = new Date('2027-06-01T22:30:00Z')
    expect(amendmentEffectiveAt('2027-06-02', now)).toEqual(now)
    expect(() => amendmentEffectiveAt('2027-06-01', now)).toThrow('backdated')
    expect(() => amendmentEffectiveAt('2027-02-30', now)).toThrow(
      'valid calendar date',
    )
  })
})
