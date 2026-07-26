import { z } from 'zod'
import {
  createVersionedCursorCodec,
  fingerprintCursorQuery,
  type VersionedCursorPayload,
} from '@/lib/requirements/cursor-codec'

const CURSOR_VERSION = 1
export const SPECIFICATION_REQUIREMENT_PACKAGE_CURSOR_MAX_LENGTH = 2048

const boundarySchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().max(450),
  })
  .strict()

export type SpecificationRequirementPackagePageBoundary = z.infer<
  typeof boundarySchema
>

export type SpecificationRequirementPackageCursorPayload =
  VersionedCursorPayload<
    SpecificationRequirementPackagePageBoundary,
    typeof CURSOR_VERSION
  >

export function fingerprintSpecificationRequirementPackageQuery(
  value: unknown,
): string {
  return fingerprintCursorQuery(value)
}

const cursorCodec = createVersionedCursorCodec({
  boundarySchema,
  maxLength: SPECIFICATION_REQUIREMENT_PACKAGE_CURSOR_MAX_LENGTH,
  version: CURSOR_VERSION,
})

export function encodeSpecificationRequirementPackageCursor(
  boundary: SpecificationRequirementPackagePageBoundary,
  queryFingerprint: string,
): string {
  return cursorCodec.encode(boundary, queryFingerprint)
}

export function decodeSpecificationRequirementPackageCursor(
  cursor: string,
): SpecificationRequirementPackageCursorPayload {
  return cursorCodec.decode(cursor)
}

export function assertSpecificationRequirementPackageCursorMatches(
  payload: SpecificationRequirementPackageCursorPayload,
  queryFingerprint: string,
): void {
  cursorCodec.assertMatches(payload, queryFingerprint)
}
