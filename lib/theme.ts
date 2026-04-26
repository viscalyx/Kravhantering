import type { CSSProperties } from 'react'

export const THEME_STORAGE_KEY = 'theme'
export const THEME_DARK_CLASS = 'dark'
export const THEME_DARK_BACKGROUND = '#020617'
export const THEME_LIGHT_BACKGROUND = '#ffffff'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export function normalizeThemePreference(
  value: string | null | undefined,
): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : 'system'
}

export function getRequestNonce(
  values: Array<string | null | undefined>,
): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return undefined
}

export function resolveThemePreference(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light'
  }

  return preference
}

export function getThemeRootStyle(resolvedTheme: ResolvedTheme): CSSProperties {
  return {
    backgroundColor:
      resolvedTheme === 'dark' ? THEME_DARK_BACKGROUND : THEME_LIGHT_BACKGROUND,
    colorScheme: resolvedTheme,
  }
}

export function applyResolvedThemeToRoot(
  root: HTMLElement,
  resolvedTheme: ResolvedTheme,
): void {
  root.classList.toggle(THEME_DARK_CLASS, resolvedTheme === 'dark')
  root.style.colorScheme = resolvedTheme
  root.style.backgroundColor =
    resolvedTheme === 'dark' ? THEME_DARK_BACKGROUND : THEME_LIGHT_BACKGROUND
}
