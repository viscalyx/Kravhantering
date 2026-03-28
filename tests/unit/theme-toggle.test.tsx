import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeToggle from '@/components/ThemeToggle'

const setThemeMock = vi.fn()
const themeState: { value: string | undefined } = { value: 'system' }

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    (
      ({
        auto: 'Automatiskt',
        dark: 'Morkt',
        light: 'Ljust',
        toggle: 'Vaxla tema',
      }) as const
    )[key] ?? key,
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: themeState.value, setTheme: setThemeMock }),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    themeState.value = 'system'
    setThemeMock.mockClear()
  })

  it('cycles from light to dark', () => {
    themeState.value = 'light'
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'Vaxla tema (Ljust)' }))

    expect(setThemeMock).toHaveBeenCalledWith('dark')
  })

  it('cycles from dark to system', () => {
    themeState.value = 'dark'
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'Vaxla tema (Morkt)' }))

    expect(setThemeMock).toHaveBeenCalledWith('system')
  })

  it('cycles from system to light', () => {
    themeState.value = 'system'
    render(<ThemeToggle />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Vaxla tema (Automatiskt)' }),
    )

    expect(setThemeMock).toHaveBeenCalledWith('light')
  })

  it.each([
    {
      theme: 'light',
      expectedLabel: 'Vaxla tema (Ljust)',
      developerValue: 'light',
    },
    {
      theme: 'dark',
      expectedLabel: 'Vaxla tema (Morkt)',
      developerValue: 'dark',
    },
    {
      theme: 'system',
      expectedLabel: 'Vaxla tema (Automatiskt)',
      developerValue: 'auto',
    },
  ] as const)('keeps translated labels and English developer-mode values aligned for $theme', ({
    theme,
    expectedLabel,
    developerValue,
  }) => {
    themeState.value = theme
    render(<ThemeToggle />)

    const button = screen.getByRole('button', { name: expectedLabel })

    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('data-developer-mode-value', developerValue)
    expect(button).toHaveAttribute('title', expectedLabel)
  })

  it('does not cycle before the theme is available', () => {
    themeState.value = undefined
    render(<ThemeToggle />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Vaxla tema (Automatiskt)' }),
    )

    expect(setThemeMock).not.toHaveBeenCalled()
  })

  it('adds keyboard-visible focus styling', () => {
    render(<ThemeToggle />)

    const button = screen.getByRole('button', {
      name: 'Vaxla tema (Automatiskt)',
    })

    expect(button.className).toContain('focus-visible:outline-none')
    expect(button.className).toContain('focus-visible:ring-2')
    expect(button.className).toContain('focus-visible:ring-primary-400/50')
    expect(button.className).toContain('focus-visible:ring-offset-2')
    expect(button.className).toContain('focus-visible:ring-offset-white')
    expect(button.className).toContain('dark:focus-visible:ring-primary-400/60')
    expect(button.className).toContain(
      'dark:focus-visible:ring-offset-secondary-950',
    )
  })
})
