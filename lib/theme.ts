import type { CSSProperties } from 'react'

export const THEME_STORAGE_KEY = 'theme'
export const THEME_COOKIE_KEY = 'theme'
export const THEME_DARK_CLASS = 'dark'
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
export const THEME_DARK_BACKGROUND = '#020617'
export const THEME_LIGHT_BACKGROUND = '#ffffff'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export interface CookieSetOptions {
  expires: Date
  name: string
  path: string
  sameSite?: string
  value: string
}

export interface CookieStore {
  set?: (options: CookieSetOptions) => Promise<unknown>
}

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

export function getServerThemeRootAttributes(
  value: string | null | undefined,
): {
  className?: string
  style?: CSSProperties
} {
  const preference = normalizeThemePreference(value)

  if (preference === 'system') {
    return {}
  }

  const resolvedTheme = resolveThemePreference(preference, false)

  return {
    className: resolvedTheme === 'dark' ? THEME_DARK_CLASS : undefined,
    style: getThemeRootStyle(resolvedTheme),
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

export function createThemeCookie(preference: ThemePreference): string {
  return `${THEME_COOKIE_KEY}=${encodeURIComponent(preference)}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`
}

export function persistThemePreference(
  preference: ThemePreference,
  doc: Document = document,
): void {
  const cookieStore = (
    globalThis as typeof globalThis & { cookieStore?: CookieStore }
  ).cookieStore

  if (typeof cookieStore?.set === 'function') {
    void cookieStore.set({
      expires: new Date(Date.now() + THEME_COOKIE_MAX_AGE_SECONDS * 1000),
      name: THEME_COOKIE_KEY,
      path: '/',
      sameSite: 'lax',
      value: preference,
    })
    return
  }

  doc.cookie = createThemeCookie(preference)
}
