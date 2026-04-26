import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeRootSync from '@/components/ThemeRootSync'
import {
  THEME_DARK_BACKGROUND,
  THEME_DARK_CLASS,
  THEME_LIGHT_BACKGROUND,
} from '@/lib/theme'

const themeState: {
  resolvedTheme: string | undefined
  theme: string | undefined
} = {
  resolvedTheme: 'dark',
  theme: 'dark',
}

vi.mock('next-themes', () => ({
  useTheme: () => themeState,
}))

function toDomColor(value: string) {
  const element = document.createElement('div')
  element.style.backgroundColor = value
  return element.style.backgroundColor
}

describe('ThemeRootSync', () => {
  beforeEach(() => {
    themeState.resolvedTheme = 'dark'
    themeState.theme = 'dark'
    document.documentElement.className = ''
    document.documentElement.style.backgroundColor = ''
    document.documentElement.style.colorScheme = ''
  })

  it('applies the resolved dark theme to the document root', () => {
    render(<ThemeRootSync />)

    expect(document.documentElement.classList.contains(THEME_DARK_CLASS)).toBe(
      true,
    )
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.documentElement.style.backgroundColor).toBe(
      toDomColor(THEME_DARK_BACKGROUND),
    )
    expect(document.cookie).toBe('')
  })

  it('applies the resolved light theme to the document root', () => {
    themeState.resolvedTheme = 'light'
    themeState.theme = 'system'

    render(<ThemeRootSync />)

    expect(document.documentElement.classList.contains(THEME_DARK_CLASS)).toBe(
      false,
    )
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.documentElement.style.backgroundColor).toBe(
      toDomColor(THEME_LIGHT_BACKGROUND),
    )
    expect(document.cookie).toBe('')
  })
})
