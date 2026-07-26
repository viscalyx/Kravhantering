import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  createVersionedCursorCodec,
  fingerprintCursorQuery,
} from '@/lib/requirements/cursor-codec'

const CURSOR_VERSION = 3
const QUERY_FINGERPRINT = 'a'.repeat(64)
const boundary = {
  id: 42,
  label: 'Nästa sida',
}
const boundarySchema = z
  .object({
    id: z.number().int().positive(),
    label: z.string().max(50),
  })
  .strict()

function createCodec(maxLength = 1024) {
  return createVersionedCursorCodec({
    boundarySchema,
    maxLength,
    version: CURSOR_VERSION,
  })
}

function expectInvalidCursor(action: () => unknown) {
  expect(action).toThrowError(
    expect.objectContaining({
      code: 'invalid_cursor',
      status: 400,
    }),
  )
}

describe('cursor codec', () => {
  it('encodes and decodes a versioned boundary as canonical Base64URL', () => {
    const codec = createCodec()
    const cursor = codec.encode(boundary, QUERY_FINGERPRINT)

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/u)
    expect(cursor).not.toContain('=')
    expect(codec.decode(cursor)).toEqual({
      boundary,
      queryFingerprint: QUERY_FINGERPRINT,
      version: CURSOR_VERSION,
    })
  })

  it.each([
    '',
    '*invalid-base64url',
    `${createCodec().encode(boundary, QUERY_FINGERPRINT)}=`,
  ])('rejects empty, invalid, or non-canonical Base64URL', cursor => {
    expectInvalidCursor(() => createCodec().decode(cursor))
  })

  it('accepts the exact cursor length limit and rejects longer cursors', () => {
    const cursor = createCodec().encode(boundary, QUERY_FINGERPRINT)
    const exactLengthCodec = createCodec(cursor.length)
    const undersizedCodec = createCodec(cursor.length - 1)

    expect(exactLengthCodec.encode(boundary, QUERY_FINGERPRINT)).toBe(cursor)
    expect(exactLengthCodec.decode(cursor).boundary).toEqual(boundary)
    expectInvalidCursor(() =>
      undersizedCodec.encode(boundary, QUERY_FINGERPRINT),
    )
    expectInvalidCursor(() => undersizedCodec.decode(cursor))
  })

  it('rejects payloads with another cursor version', () => {
    const wrongVersionCursor = Buffer.from(
      JSON.stringify({
        boundary,
        queryFingerprint: QUERY_FINGERPRINT,
        version: CURSOR_VERSION + 1,
      }),
    ).toString('base64url')

    expectInvalidCursor(() => createCodec().decode(wrongVersionCursor))
  })

  it('requires a valid fingerprint when encoding and a matching fingerprint when continuing', () => {
    const codec = createCodec()
    expect(() => codec.encode(boundary, 'not-a-fingerprint')).toThrowError(
      z.ZodError,
    )

    const payload = codec.decode(codec.encode(boundary, QUERY_FINGERPRINT))
    expect(() => codec.assertMatches(payload, QUERY_FINGERPRINT)).not.toThrow()
    expectInvalidCursor(() => codec.assertMatches(payload, 'b'.repeat(64)))
  })

  it('fingerprints normalized query identities deterministically', () => {
    const normalizedFingerprint = fingerprintCursorQuery(
      { filters: { areaIds: [2, 1] } },
      () => ({ filters: { areaIds: [1, 2] } }),
    )

    expect(normalizedFingerprint).toMatch(/^[a-f0-9]{64}$/u)
    expect(normalizedFingerprint).toBe(
      fingerprintCursorQuery({ filters: { areaIds: [1, 2] } }),
    )
  })
})
