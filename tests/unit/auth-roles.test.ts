import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ROLES,
  parseRolesClaim,
  resolveDisplayName,
} from '@/lib/auth/roles'

describe('CANONICAL_ROLES', () => {
  it('enumerates the canonical roles in spec order', () => {
    expect(CANONICAL_ROLES).toEqual(['Reviewer', 'Admin'])
  })
})

describe('parseRolesClaim', () => {
  it('accepts JSON array form', () => {
    expect(parseRolesClaim(['Reviewer', 'Admin'])).toEqual([
      'Reviewer',
      'Admin',
    ])
  })

  it('parses space/comma-separated strings', () => {
    expect(parseRolesClaim('Reviewer Admin')).toEqual(['Reviewer', 'Admin'])
    expect(parseRolesClaim('Admin, Reviewer')).toEqual(['Admin', 'Reviewer'])
  })

  it('drops legacy Author/Steward role values', () => {
    expect(parseRolesClaim(['Author', 'Steward', 'Admin'])).toEqual(['Admin'])
  })

  it('maps LDAP group CNs to canonical roles', () => {
    const result = parseRolesClaim([
      'CN=kravhantering-reviewer,OU=Groups,DC=example,DC=com',
      'CN=kravhantering-admin,OU=Groups,DC=example,DC=com',
    ])
    expect(result).toContain('Reviewer')
    expect(result).toContain('Admin')
  })

  it('returns an empty array for unknown shapes', () => {
    expect(parseRolesClaim(null)).toEqual([])
    expect(parseRolesClaim(undefined)).toEqual([])
    expect(parseRolesClaim(42)).toEqual([])
  })
})

describe('resolveDisplayName', () => {
  it('prefers name over given+family, preferred_username, email, sub', () => {
    expect(
      resolveDisplayName({
        name: 'Ada A.',
        given_name: 'Ada',
        family_name: 'Admin',
        preferred_username: 'ada',
        email: 'ada@example.com',
        sub: 'sub-1',
      }),
    ).toBe('Ada A.')
  })

  it('falls back through given+family, preferred_username, email, sub', () => {
    expect(
      resolveDisplayName({
        given_name: 'Ada',
        family_name: 'Admin',
        preferred_username: 'ada',
        sub: 'sub-1',
      }),
    ).toBe('Ada Admin')

    expect(
      resolveDisplayName({ preferred_username: 'ada', sub: 'sub-1' }),
    ).toBe('ada')
    expect(resolveDisplayName({ email: 'a@x', sub: 'sub-1' })).toBe('a@x')
    expect(resolveDisplayName({ sub: 'sub-1' })).toBe('sub-1')
  })
})
