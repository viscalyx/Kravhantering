// Shared recognition only: each redaction surface owns its replacement text,
// identifier handling, and any excerpt or SQL sanitization.
export const OPENROUTER_KEY_PATTERN = /\bsk-or-(?:v1|mgmt)-[A-Za-z0-9_-]+/g
export const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
export const BEARER_TOKEN_PATTERN =
  /\b(authorization\s*:\s*)?bearer\s+[A-Za-z0-9._~+/=-]+/giu
export const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Za-z0-9_.-]*(?:api[_ -]?key|authorization[_ -]?code|code[_ -]?verifier|client[_ -]?secret|nonce|password|secret|state|token)[A-Za-z0-9_.-]*)["']?\s*[:=]\s*(?:"(?:\\[^\r\n]|[^"\\\r\n])*"?|'(?:\\[^\r\n]|[^'\\\r\n])*'?|[^,\s}]+)/giu
