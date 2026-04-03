'use client'

import { useTheme } from 'next-themes'
import { useEffect } from 'react'
import {
  applyResolvedThemeToRoot,
  normalizeThemePreference,
  persistThemePreference,
} from '@/lib/theme'

export default function ThemeRootSync() {
  const { resolvedTheme, theme } = useTheme()

  useEffect(() => {
    if (resolvedTheme !== 'dark' && resolvedTheme !== 'light') {
      return
    }

    applyResolvedThemeToRoot(document.documentElement, resolvedTheme)
    persistThemePreference(normalizeThemePreference(theme))
  }, [resolvedTheme, theme])

  return null
}
