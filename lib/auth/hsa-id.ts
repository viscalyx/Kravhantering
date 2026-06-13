/**
 * HSA-id format validator.
 *
 * HSA-id format:
 *   <country-code><organisation-number>-<suffix>
 *   - Country code: any two uppercase A-Z letters, not limited to Sweden.
 *   - Organisation number: exactly 10 digits, no hyphen.
 *   - Separator: a single `-`.
 *   - Suffix: one or more characters from `[A-Za-z0-9]`. The Swedish
 *     letters `å/ä/ö` and the `@` character are NOT allowed.
 *   - Total length must not exceed 31 characters.
 *
 * Examples: `SE5560000001-1003`, `NO5560000001-1003`.
 * `isHsaId` accepts the generalized two-letter country code plus
 * 10-digit organisation number and required separator/suffix pattern above.
 *
 * Non-HSA service identifiers are intentionally NOT valid HSA-ids.
 */

/** Maximum length of an HSA-id (inclusive). */
export const HSA_ID_MAX_LENGTH = 31
export const HSA_ID_PREFIX_LENGTH = 12

// Anchored regex with the unicode flag so `[A-Za-z]` cannot match `å/ä/ö`.
const HSA_ID_PATTERN = /^[A-Z]{2}\d{10}-[A-Za-z0-9]+$/u
const HSA_ID_PREFIX_PATTERN = /^[A-Z]{2}\d{10}$/u
const HSA_ID_SUFFIX_PATTERN = /^[A-Za-z0-9]+$/u

/** True when `value` is a syntactically valid HSA-id. */
export function isHsaId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length > HSA_ID_MAX_LENGTH) return false
  return HSA_ID_PATTERN.test(value)
}

export function isHsaIdPrefix(value: unknown): value is string {
  return typeof value === 'string' && HSA_ID_PREFIX_PATTERN.test(value)
}

export function isHsaIdSuffix(value: unknown): value is string {
  return typeof value === 'string' && HSA_ID_SUFFIX_PATTERN.test(value)
}

export function splitHsaId(value: string): { prefix: string; suffix: string } {
  const separatorIndex = value.indexOf('-')
  if (separatorIndex < 0) {
    return { prefix: '', suffix: value }
  }

  return {
    prefix: value.slice(0, separatorIndex),
    suffix: value.slice(separatorIndex + 1),
  }
}

export function composeHsaId(prefix: string, suffix: string): string {
  return prefix && suffix ? `${prefix}-${suffix}` : ''
}

/**
 * Throws when `value` is not a valid HSA-id. Returns the value typed as
 * `string` on success so the caller can use the result directly.
 */
export function assertHsaId(value: unknown): string {
  if (!isHsaId(value)) {
    throw new HsaIdFormatError(value)
  }
  return value
}

export class HsaIdFormatError extends Error {
  readonly value: unknown

  constructor(value: unknown) {
    super(
      `Invalid HSA-id: expected format <two-letter country code><10-digit org no>-<alphanumeric suffix>, length <= ${HSA_ID_MAX_LENGTH}.`,
    )
    this.name = 'HsaIdFormatError'
    this.value = value
  }
}
