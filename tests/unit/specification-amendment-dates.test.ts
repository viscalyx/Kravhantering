import { describe, expect, it, vi } from 'vitest'
import {
  amendmentEffectiveAt,
  decideAmendment,
} from '@/lib/specifications/amendments'

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

describe('amendment decision dates', () => {
  it('requires cancellation and re-preparation when the stored date has passed in Stockholm', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      {
        id: 17,
        effectiveDate: new Date('2027-06-01T00:00:00Z'),
        cancelledAt: null,
        decidedAt: null,
        changesJson: '[]',
      },
    ])
    await expect(
      decideAmendment(
        { query },
        {} as Parameters<typeof decideAmendment>[1],
        5,
        17,
        new Date('2027-06-01T22:30:00Z'),
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      message:
        'The amendment effective date has passed; cancel it and prepare a new amendment',
    })
    expect(query).toHaveBeenCalledTimes(1)
  })
})
