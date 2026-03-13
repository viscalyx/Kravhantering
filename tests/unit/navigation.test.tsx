import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Navigation from '@/components/Navigation'

const pathnameState = vi.hoisted(() => ({
  value: '/kravkatalog',
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  usePathname: () => pathnameState.value,
}))

vi.mock('@/components/LanguageSwitcher', () => ({
  default: () => <div data-testid="language-switcher" />,
}))

vi.mock('@/components/Logo', () => ({
  default: () => <div data-testid="logo" />,
}))

vi.mock('@/components/ThemePicker', () => ({
  default: () => <div data-testid="theme-picker" />,
}))

vi.mock('@/components/ThemeToggle', () => ({
  default: () => <div data-testid="theme-toggle" />,
}))

describe('Navigation', () => {
  beforeEach(() => {
    pathnameState.value = '/kravkatalog'
  })

  it('shows a global settings link and removes reference data from the desktop navigation', () => {
    render(<Navigation />)

    const settingsLink = screen.getByRole('link', { name: 'admin.settings' })

    expect(settingsLink).toHaveAttribute('href', '/admin')
    expect(settingsLink.className).toContain('min-h-[44px]')
    expect(settingsLink.className).toContain('min-w-[44px]')
    expect(screen.queryByText('nav.taxonomy')).toBeNull()
    expect(screen.queryByRole('link', { name: 'nav.areas' })).toBeNull()
    expect(screen.getByRole('link', { name: 'nav.catalog' })).toHaveAttribute(
      'href',
      '/kravkatalog',
    )
    expect(screen.getByRole('link', { name: 'nav.packages' })).toHaveAttribute(
      'href',
      '/kravpaket',
    )
  })

  it('keeps mobile navigation limited to the primary items', () => {
    render(<Navigation />)

    fireEvent.click(screen.getByRole('button', { name: 'nav.openMenu' }))

    expect(
      screen
        .getAllByRole('link', { name: 'nav.catalog' })
        .map(link => link.getAttribute('href')),
    ).toContain('/kravkatalog')
    expect(
      screen
        .getAllByRole('link', { name: 'nav.packages' })
        .map(link => link.getAttribute('href')),
    ).toContain('/kravpaket')
    expect(screen.queryByRole('link', { name: 'nav.areas' })).toBeNull()
    expect(screen.queryByText('nav.referenceData')).toBeNull()
  })
})
