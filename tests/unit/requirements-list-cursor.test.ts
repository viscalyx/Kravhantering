import { describe, expect, it } from 'vitest'
import {
  assertRequirementListCursorMatches,
  decodeRequirementListCursor,
  encodeRequirementListCursor,
  hashRequirementListQuery,
} from '@/lib/requirements/list-cursor'

describe('requirement list cursor', () => {
  it('round-trips a versioned anchor without exposing query values', () => {
    const queryHash = hashRequirementListQuery({
      filters: { descriptionSearch: 'sensitive text' },
      locale: 'sv',
    })
    const cursor = encodeRequirementListCursor(42, queryHash)
    const decodedJson = Buffer.from(cursor, 'base64url').toString('utf8')
    const decodedCursor = decodeRequirementListCursor(cursor)

    expect(decodedJson).not.toContain('sensitive text')
    expect(decodedCursor).toEqual({
      anchorRequirementId: 42,
      queryHash,
      version: 1,
    })
  })

  it('round-trips non-zero internal identifiers regardless of sign', () => {
    const queryHash = 'a'.repeat(64)

    expect(
      decodeRequirementListCursor(encodeRequirementListCursor(-42, queryHash))
        .anchorRequirementId,
    ).toBe(-42)
    expect(() => encodeRequirementListCursor(0, queryHash)).toThrow()
  })

  it('canonicalizes object keys and set-like arrays before hashing', () => {
    expect(
      hashRequirementListQuery({ filters: { areaIds: [2, 1] }, locale: 'sv' }),
    ).toBe(
      hashRequirementListQuery({ locale: 'sv', filters: { areaIds: [1, 2] } }),
    )
  })

  it('rejects malformed, oversized, and mismatched cursors', () => {
    expect(() => decodeRequirementListCursor('not-json')).toThrowError(
      expect.objectContaining({ code: 'invalid_cursor' }),
    )
    expect(() => decodeRequirementListCursor('a'.repeat(513))).toThrowError(
      expect.objectContaining({ code: 'invalid_cursor' }),
    )

    const payload = decodeRequirementListCursor(
      encodeRequirementListCursor(1, 'a'.repeat(64)),
    )
    expect(() =>
      assertRequirementListCursorMatches(payload, 'b'.repeat(64)),
    ).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })
})
