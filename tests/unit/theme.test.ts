import { describe, expect, it } from 'vitest'
import {
  applyResolvedThemeToRoot,
  getRequestNonce,
  normalizeThemePreference,
  resolveThemePreference,
  THEME_DARK_BACKGROUND,
  THEME_DARK_CLASS,
  THEME_LIGHT_BACKGROUND,
} from '@/lib/theme'

function toDomColor(value: string) {
  const element = document.createElement('div')
  element.style.backgroundColor = value
  return element.style.backgroundColor
}

describe('theme utilities', () => {
  it('normalizes unsupported theme values to system', () => {
    expect(normalizeThemePreference('dark')).toBe('dark')
    expect(normalizeThemePreference('light')).toBe('light')
    expect(normalizeThemePreference('system')).toBe('system')
    expect(normalizeThemePreference('sepia')).toBe('system')
    expect(normalizeThemePreference(null)).toBe('system')
  })

  it('returns the first trimmed non-empty request nonce', () => {
    expect(getRequestNonce([undefined, '', '  ', '  nonce-123  '])).toBe(
      'nonce-123',
    )
    expect(getRequestNonce([null, undefined, ''])).toBeUndefined()
  })

  it('resolves system preferences from the media preference', () => {
    expect(resolveThemePreference('dark', false)).toBe('dark')
    expect(resolveThemePreference('light', true)).toBe('light')
    expect(resolveThemePreference('system', true)).toBe('dark')
    expect(resolveThemePreference('system', false)).toBe('light')
  })

  it('applies the resolved theme styles to the document root', () => {
    document.documentElement.className = ''
    document.documentElement.style.backgroundColor = ''
    document.documentElement.style.colorScheme = ''

    applyResolvedThemeToRoot(document.documentElement, 'light')

    expect(document.documentElement.classList.contains(THEME_DARK_CLASS)).toBe(
      false,
    )
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.documentElement.style.backgroundColor).toBe(
      toDomColor(THEME_LIGHT_BACKGROUND),
    )

    applyResolvedThemeToRoot(document.documentElement, 'dark')

    expect(document.documentElement.classList.contains(THEME_DARK_CLASS)).toBe(
      true,
    )
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.documentElement.style.backgroundColor).toBe(
      toDomColor(THEME_DARK_BACKGROUND),
    )
  })
})
