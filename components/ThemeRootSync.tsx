'use client'

import { useTheme } from 'next-themes'
import { useEffect } from 'react'
import { applyResolvedThemeToRoot } from '@/lib/theme'

export default function ThemeRootSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (resolvedTheme !== 'dark' && resolvedTheme !== 'light') {
      return
    }

    applyResolvedThemeToRoot(document.documentElement, resolvedTheme)
  }, [resolvedTheme])

  return null
}
