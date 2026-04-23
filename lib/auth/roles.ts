/**
 * Parses the OIDC roles claim into the canonical app role list.
 *
 * Per the prescribed contract (see docs/plan-auth.md), PhenixID emits
 * `roles` as a JSON array of strings with values exactly `Reviewer` or
 * `Admin`. Author/Steward have been dropped — non-elevated users have an
 * empty `roles` array. This parser additionally tolerates two legacy shapes
 * for robustness:
 *   - space-separated string: "Reviewer"
 *   - LDAP group DNs: "CN=kravhantering-admin,OU=Groups,DC=example,DC=test"
 *
 * Unknown role values (including legacy `Author`/`Steward`) are dropped so a
 * stale IdP configuration never grants more capability than intended.
 */

export const CANONICAL_ROLES = ['Reviewer', 'Admin'] as const
export type CanonicalRole = (typeof CANONICAL_ROLES)[number]

const CANONICAL_BY_LOWER: Record<string, CanonicalRole> = Object.fromEntries(
  CANONICAL_ROLES.map(role => [role.toLowerCase(), role]),
) as Record<string, CanonicalRole>

/**
 * Suggested LDAP group CN → canonical role mapping. Only used when the
 * roles claim still carries group DNs (legacy / fallback). The prescribed
 * PhenixID contract emits the canonical names directly.
 */
const GROUP_CN_TO_ROLE: Record<string, CanonicalRole> = {
  'kravhantering-reviewer': 'Reviewer',
  'kravhantering-admin': 'Admin',
}

function extractCnFromDn(value: string): string | undefined {
  // LDAP DNs are case-insensitive on attribute names. Match the first CN=...
  const match = value.match(/(?:^|,)\s*CN=([^,]+)/i)
  return match?.[1]?.trim()
}

function normalizeOne(raw: string): CanonicalRole | undefined {
  const trimmed = raw.trim()
  if (trimmed === '') return undefined

  const lower = trimmed.toLowerCase()
  if (CANONICAL_BY_LOWER[lower]) {
    return CANONICAL_BY_LOWER[lower]
  }

  const cn = extractCnFromDn(trimmed)
  if (cn) {
    const mapped = GROUP_CN_TO_ROLE[cn.toLowerCase()]
    if (mapped) return mapped
    const lowerCn = cn.toLowerCase()
    if (CANONICAL_BY_LOWER[lowerCn]) {
      return CANONICAL_BY_LOWER[lowerCn]
    }
  }

  return undefined
}

/**
 * Parse a roles claim (in any of the supported shapes) into a deduplicated
 * list of canonical app role names. Unknown/malformed entries are dropped.
 */
export function parseRolesClaim(claim: unknown): CanonicalRole[] {
  const collected: CanonicalRole[] = []
  const push = (value: CanonicalRole | undefined) => {
    if (value && !collected.includes(value)) collected.push(value)
  }

  if (Array.isArray(claim)) {
    for (const entry of claim) {
      if (typeof entry === 'string') push(normalizeOne(entry))
    }
    return collected
  }

  if (typeof claim === 'string') {
    // Could be space-separated, comma-separated, or a single DN.
    // Split on whitespace OR comma — but DNs contain commas, so try DN
    // first if it looks like one.
    if (/CN=/i.test(claim) && claim.includes(',')) {
      // Split DN list on a separator that is unambiguous for our shapes:
      // semicolon, or newline. If neither, treat as single DN.
      const parts = claim
        .split(/[;\n]+/)
        .map(s => s.trim())
        .filter(Boolean)
      if (parts.length === 1) {
        push(normalizeOne(claim))
      } else {
        for (const part of parts) push(normalizeOne(part))
      }
      return collected
    }
    for (const part of claim.split(/[\s,]+/)) {
      push(normalizeOne(part))
    }
    return collected
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
