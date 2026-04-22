import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ROLES,
  parseRolesClaim,
  resolveDisplayName,
} from '@/lib/auth/roles'

describe('CANONICAL_ROLES', () => {
  it('enumerates the four canonical roles in spec order', () => {
    expect(CANONICAL_ROLES).toEqual(['Author', 'Reviewer', 'Steward', 'Admin'])
  })
})

describe('parseRolesClaim', () => {
  it('accepts JSON array form', () => {
    expect(parseRolesClaim(['Author', 'Admin'])).toEqual(['Author', 'Admin'])
  })

  it('parses space/comma-separated strings', () => {
    expect(parseRolesClaim('Author Admin')).toEqual(['Author', 'Admin'])
    expect(parseRolesClaim('Author, Reviewer')).toEqual(['Author', 'Reviewer'])
  })

  it('maps LDAP group CNs to canonical roles', () => {
    const result = parseRolesClaim([
      'CN=kravhantering-author,OU=Groups,DC=example,DC=com',
      'CN=kravhantering-admin,OU=Groups,DC=example,DC=com',
    ])
    expect(result).toContain('Author')
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
