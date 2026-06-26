import { describe, expect, it } from 'vitest'
import {
  CANONICAL_ROLES,
  parseRolesClaim,
  resolveDisplayName,
} from '@/lib/auth/roles'

describe('CANONICAL_ROLES', () => {
  it('enumerates the canonical roles in spec order', () => {
    expect(CANONICAL_ROLES).toEqual(['Reviewer', 'Admin', 'PrivacyOfficer'])
  })
})

describe('parseRolesClaim', () => {
  it('accepts JSON array form', () => {
    expect(parseRolesClaim(['Reviewer', 'Admin', 'PrivacyOfficer'])).toEqual([
      'Reviewer',
      'Admin',
      'PrivacyOfficer',
    ])
  })

  it('deduplicates canonical role values while preserving claim order', () => {
    expect(parseRolesClaim(['Admin', 'Reviewer', 'Admin'])).toEqual([
      'Admin',
      'Reviewer',
    ])
  })

  it('drops non-canonical Author/Steward role claims', () => {
    expect(parseRolesClaim(['Author', 'Steward', 'Admin'])).toEqual(['Admin'])
  })

  it('drops non-canonical array entries', () => {
    expect(
      parseRolesClaim([
        'reviewer',
        ' Reviewer ',
        'CN=kravhantering-admin,OU=Groups,DC=example,DC=com',
        42,
        'Admin',
      ]),
    ).toEqual(['Admin'])
  })

  it('does not parse non-array role claims', () => {
    expect(parseRolesClaim('Reviewer Admin')).toEqual([])
    expect(parseRolesClaim('Admin, Reviewer')).toEqual([])
    expect(
      parseRolesClaim('CN=kravhantering-admin,OU=Groups,DC=example,DC=com'),
    ).toEqual([])
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
