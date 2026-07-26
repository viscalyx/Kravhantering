import { createHash } from 'node:crypto'
import { z } from 'zod'
import { invalidCursorError } from '@/lib/requirements/errors'

const queryFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/u)

export interface VersionedCursorPayload<Boundary, Version extends number> {
  boundary: Boundary
  queryFingerprint: string
  version: Version
}

interface VersionedCursorCodecOptions<Boundary, Version extends number> {
  boundarySchema: z.ZodType<Boundary>
  maxLength: number
  version: Version
}

export interface VersionedCursorCodec<Boundary, Version extends number> {
  assertMatches: (
    payload: VersionedCursorPayload<Boundary, Version>,
    queryFingerprint: string,
  ) => void
  decode: (cursor: string) => VersionedCursorPayload<Boundary, Version>
  encode: (boundary: Boundary, queryFingerprint: string) => string
}

function invalidCursor(): never {
  throw invalidCursorError()
}

export function fingerprintCursorQuery(
  value: unknown,
  normalize: (value: unknown) => unknown = current => current,
): string {
  return createHash('sha256')
    .update(JSON.stringify(normalize(value)))
    .digest('hex')
}

export function createVersionedCursorCodec<
  Boundary,
  const Version extends number,
>({
  boundarySchema,
  maxLength,
  version,
}: VersionedCursorCodecOptions<Boundary, Version>): VersionedCursorCodec<
  Boundary,
  Version
> {
  const payloadSchema = z
    .object({
      boundary: boundarySchema,
      queryFingerprint: queryFingerprintSchema,
      version: z.literal(version),
    })
    .strict()

  return {
    assertMatches(payload, queryFingerprint) {
      if (payload.queryFingerprint !== queryFingerprint) invalidCursor()
    },
    decode(cursor) {
      if (!cursor || cursor.length > maxLength) invalidCursor()

      try {
        const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
        if (Buffer.from(decoded).toString('base64url') !== cursor) {
          invalidCursor()
        }
        return payloadSchema.parse(
          JSON.parse(decoded),
        ) as VersionedCursorPayload<Boundary, Version>
      } catch {
        return invalidCursor()
      }
    },
    encode(boundary, queryFingerprint) {
      const payload = payloadSchema.parse({
        boundary,
        queryFingerprint,
        version,
      })
      const cursor = Buffer.from(JSON.stringify(payload)).toString('base64url')
      if (cursor.length > maxLength) invalidCursor()
      return cursor
    },
  }
}
