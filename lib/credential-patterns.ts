// Shared recognition only: each redaction surface owns its replacement text,
// identifier handling, and any excerpt or SQL sanitization.
export const OPENROUTER_KEY_PATTERN = /\bsk-or-(?:v1|mgmt)-[A-Za-z0-9_-]+/g
const JWT_SHAPED_PATTERN =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const JWT_PATTERN = /\b([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
export const BEARER_TOKEN_PATTERN =
  /\b(authorization\s*:\s*)?bearer\s+[A-Za-z0-9._~+/=-]+/giu
export const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Za-z0-9_.-]*(?:api[_ -]?key|authorization[_ -]?code|code[_ -]?verifier|client[_ -]?secret|nonce|password|secret|state|token)[A-Za-z0-9_.-]*)["']?\s*[:=]\s*(?:"(?:\\[^\r\n]|[^"\\\r\n])*"?|'(?:\\[^\r\n]|[^'\\\r\n])*'?|[^,\s}]+)/giu

export function redactJwtCredentials(
  value: string,
  replacement: string,
): string {
  // Preserve conservative masking of JWT-shaped values, even malformed ones.
  // Broader candidates need a JSON object header to avoid masking ordinary
  // dotted text. Header validation is recognition, not token authentication.
  return value
    .replace(JWT_SHAPED_PATTERN, replacement)
    .replace(JWT_PATTERN, (token: string, encodedHeader: string): string => {
      try {
        const decodedHeader = Buffer.from(encodedHeader, 'base64url').toString(
          'utf8',
        )
        if (
          Buffer.from(decodedHeader).toString('base64url') !== encodedHeader
        ) {
          return token
        }
        const header: unknown = JSON.parse(decodedHeader)
        return header !== null &&
          typeof header === 'object' &&
          !Array.isArray(header)
          ? replacement
          : token
      } catch {
        return token
      }
    })
}
