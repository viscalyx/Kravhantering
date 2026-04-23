/**
 * HSA-ID format validator.
 *
 * HSA-id format (per the Swedish HSA catalog spec):
 *   <country>SE<organisation-number><sep>-<sep><suffix>
 *   - Country code: literal `SE`.
 *   - Organisation number: exactly 10 digits, no hyphen.
 *   - Separator: a single `-`.
 *   - Suffix: one or more characters from `[A-Za-z0-9]`. The Swedish
 *     letters `å/ä/ö` and the `@` character are NOT allowed.
 *   - Total length must not exceed 31 characters.
 *
 * Example: `SE2321000032-1003`.
 *
 * The synthetic MCP namespace `mcp-client:<client_id>` is intentionally
 * NOT a valid HSA-id and must be checked for separately by the caller.
 */

/** Maximum length of an HSA-id (inclusive). */
export const HSA_ID_MAX_LENGTH = 31

// Anchored regex with the unicode flag so `[A-Za-z]` cannot match `å/ä/ö`.
const HSA_ID_PATTERN = /^SE\d{10}-[A-Za-z0-9]+$/u

/** True when `value` is a syntactically valid HSA-id. */
export function isHsaId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (value.length > HSA_ID_MAX_LENGTH) return false
  return HSA_ID_PATTERN.test(value)
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
      `Invalid HSA-id: expected format SE<10-digit org no>-<alphanumeric suffix>, length <= ${HSA_ID_MAX_LENGTH}.`,
    )
    this.name = 'HsaIdFormatError'
    this.value = value
  }
}
