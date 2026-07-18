import { describe, expect, it } from 'vitest'
import {
  assertSpecificationItemPageCursorMatches,
  decodeSpecificationItemPageCursor,
  encodeSpecificationItemPageCursor,
  fingerprintSpecificationItemPageQuery,
  SPECIFICATION_ITEM_CURSOR_MAX_LENGTH,
} from '@/lib/requirements/specification-item-page-cursor'

const boundary = {
  kindRank: 1 as const,
  nullRank: 0 as const,
  sortValue: 'Integration',
  sourceId: 42,
  uniqueId: 'INT0042',
}

describe('specification item page cursor', () => {
  it('round-trips canonical unpadded base64url JSON', () => {
    const queryFingerprint = fingerprintSpecificationItemPageQuery({
      locale: 'en',
      specificationId: 7,
    })
    const cursor = encodeSpecificationItemPageCursor(boundary, queryFingerprint)

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u)
    expect(cursor).not.toContain('=')
    expect(cursor.length).toBeLessThanOrEqual(
      SPECIFICATION_ITEM_CURSOR_MAX_LENGTH,
    )
    expect(decodeSpecificationItemPageCursor(cursor)).toEqual({
      boundary,
      queryFingerprint,
      version: 2,
    })
  })

  it('rejects boundaries that exceed the cursor size limit', () => {
    expect(() =>
      encodeSpecificationItemPageCursor(
        {
          ...boundary,
          sortValue: 'x'.repeat(20_000),
          uniqueId: 'y'.repeat(20_000),
        },
        'a'.repeat(64),
      ),
    ).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })

  it.each([
    '',
    'not base64url',
    Buffer.from(
      JSON.stringify({
        boundary: { kindRank: 1, sourceId: 42 },
        queryFingerprint: 'a'.repeat(64),
        version: 1,
      }),
    ).toString('base64url'),
    `${encodeSpecificationItemPageCursor(boundary, 'a'.repeat(64))}=`,
    'a'.repeat(SPECIFICATION_ITEM_CURSOR_MAX_LENGTH + 1),
  ])('strictly rejects malformed cursor state', cursor => {
    expect(() => decodeSpecificationItemPageCursor(cursor)).toThrowError(
      expect.objectContaining({ code: 'invalid_cursor' }),
    )
  })

  it('rejects a cursor for different normalized query identity', () => {
    const payload = decodeSpecificationItemPageCursor(
      encodeSpecificationItemPageCursor(boundary, 'a'.repeat(64)),
    )

    expect(() =>
      assertSpecificationItemPageCursorMatches(payload, 'b'.repeat(64)),
    ).toThrowError(expect.objectContaining({ code: 'invalid_cursor' }))
  })
})
