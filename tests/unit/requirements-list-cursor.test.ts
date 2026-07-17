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
      nullRank: 0 as const,
      requirementId: 42,
      sortValue: 'sort value',
    }
    const cursor = encodeRequirementListCursor(boundary, queryFingerprint)
    const decodedJson = Buffer.from(cursor, 'base64url').toString('utf8')

    expect(decodedJson).not.toContain('sensitive text')
    expect(decodeRequirementListCursor(cursor)).toEqual({
      boundary,
      queryFingerprint,
      version: 4,
    })
  })

  it('round-trips nullable and numeric boundary values', () => {
    const queryFingerprint = 'a'.repeat(64)

    expect(
      decodeRequirementListCursor(
        encodeRequirementListCursor(
          { nullRank: 1, requirementId: 1, sortValue: null },
          queryFingerprint,
        ),
      ).boundary,
    ).toEqual({ nullRank: 1, requirementId: 1, sortValue: null })
    expect(
      decodeRequirementListCursor(
        encodeRequirementListCursor(
          { nullRank: 0, requirementId: 2, sortValue: 42 },
          queryFingerprint,
        ),
      ).boundary.sortValue,
    ).toBe(42)
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
      { nullRank: 0, requirementId: 1, sortValue: 'REQ-1' },
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

  it('enforces the encoded 512-character maximum', () => {
    expect(() =>
      encodeRequirementListCursor(
        { nullRank: 0, requirementId: 1, sortValue: 'x'.repeat(600) },
        'a'.repeat(64),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })
})
