import { describe, expect, it } from 'vitest'
import {
  assertRequirementListCursorMatches,
  decodeRequirementListCursor,
  encodeRequirementListCursor,
  fingerprintRequirementListQuery,
} from '@/lib/requirements/list-cursor'

describe('requirement list cursor', () => {
  it('round-trips a versioned full boundary without exposing query values', () => {
    const queryFingerprint = fingerprintRequirementListQuery({
      filters: { descriptionSearch: 'sensitive text' },
      locale: 'sv',
    })
    const boundary = {
      requirementId: 42,
    }
    const cursor = encodeRequirementListCursor(boundary, queryFingerprint)
    const decodedJson = Buffer.from(cursor, 'base64url').toString('utf8')

    expect(decodedJson).not.toContain('sensitive text')
    expect(decodeRequirementListCursor(cursor)).toEqual({
      boundary,
      queryFingerprint,
      version: 3,
    })
  })

  it('keeps sort values and null ranks out of the encoded boundary', () => {
    const queryFingerprint = 'a'.repeat(64)
    const cursor = encodeRequirementListCursor(
      { requirementId: 2_147_483_647 },
      queryFingerprint,
    )

    expect(decodeRequirementListCursor(cursor).boundary).toEqual({
      requirementId: 2_147_483_647,
    })
    expect(cursor.length).toBeLessThanOrEqual(512)
  })

  it('canonicalizes object keys and set-like arrays before fingerprinting', () => {
    expect(
      fingerprintRequirementListQuery({
        filters: { areaIds: [2, 1] },
        locale: 'sv',
      }),
    ).toBe(
      fingerprintRequirementListQuery({
        locale: 'sv',
        filters: { areaIds: [1, 2] },
      }),
    )
  })

  it('rejects malformed, non-canonical, oversized, and mismatched cursors', () => {
    expect(() => decodeRequirementListCursor('not-json')).toThrowError(
      expect.objectContaining({ code: 'invalid_cursor' }),
    )
    expect(() => decodeRequirementListCursor('a'.repeat(513))).toThrowError(
      expect.objectContaining({ code: 'invalid_cursor' }),
    )

    const cursor = encodeRequirementListCursor(
      { requirementId: 1 },
      'a'.repeat(64),
    )
    expect(() => decodeRequirementListCursor(`${cursor}=`)).toThrowError(
      expect.objectContaining({ code: 'invalid_cursor' }),
    )
    const payload = decodeRequirementListCursor(cursor)
    expect(() =>
      assertRequirementListCursorMatches(payload, 'b'.repeat(64)),
    ).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })

  it('rejects legacy boundaries that provide SQL sort values', () => {
    const cursor = Buffer.from(
      JSON.stringify({
        boundary: {
          nullRank: 0,
          requirementId: 1,
          sortValue: 'untrusted',
        },
        queryFingerprint: 'a'.repeat(64),
        version: 3,
      }),
    ).toString('base64url')

    expect(() => decodeRequirementListCursor(cursor)).toThrowError(
      expect.objectContaining({ code: 'invalid_cursor' }),
    )
  })
})
