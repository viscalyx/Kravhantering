import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeToggle from '@/components/ThemeToggle'

const setThemeMock = vi.fn()
const themeState = { value: 'system' }

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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

    fireEvent.click(screen.getByRole('button', { name: 'toggle (light)' }))

    expect(setThemeMock).toHaveBeenCalledWith('dark')
  })

  it('cycles from dark to system', () => {
    themeState.value = 'dark'
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle (dark)' }))

    expect(setThemeMock).toHaveBeenCalledWith('system')
  })

  it('cycles from system to light', () => {
    themeState.value = 'system'
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle (auto)' }))

    expect(setThemeMock).toHaveBeenCalledWith('light')
  })

  it('renders the correct icon for each theme', () => {
    for (const [theme, expectedLabel] of [
      ['light', 'toggle (light)'],
      ['dark', 'toggle (dark)'],
      ['system', 'toggle (auto)'],
    ] as const) {
      themeState.value = theme
      const { unmount } = render(<ThemeToggle />)

      expect(
        screen.getByRole('button', { name: expectedLabel }),
      ).toBeInTheDocument()

      unmount()
    }
  })
})
