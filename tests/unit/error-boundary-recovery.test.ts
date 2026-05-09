import { describe, expect, it } from 'vitest'
import {
  buildErrorRecoveryHref,
  getErrorRecoveryCopy,
  getErrorRecoveryLocale,
  getErrorRecoveryTargets,
  getLocaleFromPathname,
  isAdminRecoveryPath,
  normalizePathname,
  stripLocaleFromPathname,
} from '@/lib/error-boundary-recovery'

describe('error boundary recovery helpers', () => {
  it('normalizes paths and reads supported locale prefixes', () => {
    expect(normalizePathname('sv/admin?tab=referenceData')).toBe('/sv/admin')
    expect(normalizePathname(null)).toBe('/')
    expect(getLocaleFromPathname('/en/requirements')).toBe('en')
    expect(getLocaleFromPathname('/sv/admin')).toBe('sv')
    expect(getLocaleFromPathname('/requirements')).toBeNull()
    expect(stripLocaleFromPathname('/sv/admin/settings')).toBe(
      '/admin/settings',
    )
  })

  it('falls back to stored locale and then Swedish when the path has no locale', () => {
    expect(getErrorRecoveryLocale('/admin', { getItem: () => 'en' })).toBe('en')
    expect(
      getErrorRecoveryLocale('/admin', { getItem: () => 'not-a-locale' }),
    ).toBe('sv')
    expect(getErrorRecoveryLocale('/en/admin', { getItem: () => 'sv' })).toBe(
      'en',
    )
  })

  it('classifies admin and reference-data paths for safe recovery', () => {
    expect(isAdminRecoveryPath('/sv/admin')).toBe(true)
    expect(isAdminRecoveryPath('/en/admin/settings')).toBe(true)
    expect(isAdminRecoveryPath('/sv/requirement-areas')).toBe(true)
    expect(isAdminRecoveryPath('/en/specifications/responsibility-areas')).toBe(
      true,
    )
    expect(isAdminRecoveryPath('/sv/specifications/project-alpha')).toBe(false)
    expect(isAdminRecoveryPath('/sv/requirements')).toBe(false)
  })

  it('builds locale-prefixed primary and secondary recovery targets', () => {
    expect(buildErrorRecoveryHref('en', 'admin')).toBe('/en/admin')
    expect(buildErrorRecoveryHref('sv', 'requirements')).toBe(
      '/sv/requirements',
    )

    expect(
      getErrorRecoveryTargets({
        locale: 'sv',
        pathname: '/sv/admin',
      }),
    ).toEqual({
      primary: { href: '/sv/admin', kind: 'admin' },
      secondary: { href: '/sv/requirements', kind: 'requirements' },
    })

    expect(
      getErrorRecoveryTargets({
        locale: 'en',
        pathname: '/en/requirements/REQ-001',
      }),
    ).toEqual({
      primary: { href: '/en/requirements', kind: 'requirements' },
      secondary: { href: '/en/admin', kind: 'admin' },
    })
  })

  it('keeps fallback copy localized without exposing technical wording', () => {
    expect(getErrorRecoveryCopy('en').title).toBe('Something went wrong')
    expect(getErrorRecoveryCopy('sv').title).toBe('Något gick fel')
    expect(getErrorRecoveryCopy('en').description).not.toContain('stack')
    expect(getErrorRecoveryCopy('sv').description).not.toContain('stack')
  })
})
