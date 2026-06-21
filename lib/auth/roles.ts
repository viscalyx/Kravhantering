/**
 * Parses the OIDC roles claim into the canonical app role list.
 *
 * Per the committed auth contract, PhenixID emits
 * `roles` as a JSON array of strings with values exactly `Reviewer`,
 * `Admin`, or the narrow privacy-erasure role `PrivacyOfficer`.
 * Author/Steward have been dropped — non-elevated users have an empty
 * `roles` array.
 *
 * Non-array claims and unknown role values (including legacy `Author` and
 * `Steward`) are dropped so a stale IdP configuration never grants more
 * capability than intended.
 */

export const CANONICAL_ROLES = ['Reviewer', 'Admin', 'PrivacyOfficer'] as const
export type CanonicalRole = (typeof CANONICAL_ROLES)[number]

function isCanonicalRole(value: string): value is CanonicalRole {
  return (CANONICAL_ROLES as readonly string[]).includes(value)
}

/**
 * Parse the roles claim into a deduplicated list of canonical app role names.
 * Unknown or malformed entries are dropped.
 */
export function parseRolesClaim(claim: unknown): CanonicalRole[] {
  const collected: CanonicalRole[] = []
  const push = (value: string) => {
    if (isCanonicalRole(value) && !collected.includes(value)) {
      collected.push(value)
    }
  }

  if (Array.isArray(claim)) {
    for (const entry of claim) {
      if (typeof entry === 'string') push(entry)
    }
  }

  return collected
}

/**
 * Resolve the display name from the standard OIDC fallback chain:
 * `name` → `given_name + family_name` → `preferred_username` → `email` →
 * `sub`. Returns the first non-empty value.
 */
export interface DisplayNameClaims {
  email?: unknown
  family_name?: unknown
  given_name?: unknown
  name?: unknown
  preferred_username?: unknown
  sub?: unknown
}

export function resolveDisplayName(claims: DisplayNameClaims): string {
  const pick = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

  const name = pick(claims.name)
  if (name) return name

  const given = pick(claims.given_name)
  const family = pick(claims.family_name)
  if (given || family) {
    return [given, family].filter(Boolean).join(' ')
  }

  return (
    pick(claims.preferred_username) ??
    pick(claims.email) ??
    pick(claims.sub) ??
    ''
  )
}
