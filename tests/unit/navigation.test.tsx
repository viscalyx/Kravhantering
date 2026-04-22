import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Navigation from '@/components/Navigation'

const pathnameState = vi.hoisted(() => ({
  value: '/requirements',
}))

const helpState = vi.hoisted(() => ({
  value: {
    content: null as { sections: never[]; titleKey: string } | null,
    isOpen: false,
    toggle: vi.fn(),
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
  useLocale: () => 'en',
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

vi.mock('@/components/ThemeToggle', () => ({
  default: () => <div data-testid="theme-toggle" />,
}))

vi.mock('@/components/HelpPanel', () => ({
  useHelp: () => helpState.value,
}))

describe('Navigation', () => {
  beforeEach(() => {
    pathnameState.value = '/requirements'
    helpState.value = {
      content: null,
      isOpen: false,
      toggle: vi.fn(),
    }
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
      '/requirements',
    )
    expect(screen.getByRole('link', { name: 'nav.packages' })).toHaveAttribute(
      'href',
      '/requirement-packages',
    )
  })

  it('keeps mobile navigation limited to the primary items', () => {
    render(<Navigation />)

    fireEvent.click(screen.getByRole('button', { name: 'nav.openMenu' }))

    expect(
      screen
        .getAllByRole('link', { name: 'nav.catalog' })
        .map(link => link.getAttribute('href')),
    ).toContain('/requirements')
    expect(
      screen
        .getAllByRole('link', { name: 'nav.packages' })
        .map(link => link.getAttribute('href')),
    ).toContain('/requirement-packages')
    expect(screen.queryByRole('link', { name: 'nav.areas' })).toBeNull()
    expect(screen.queryByText('nav.referenceData')).toBeNull()
  })

  it('renders the help toggle with focus styles and developer-mode metadata', () => {
    const toggleHelp = vi.fn()
    helpState.value = {
      content: { sections: [], titleKey: 'help.navigation' },
      isOpen: true,
      toggle: toggleHelp,
    }

    render(<Navigation />)

    const helpButton = screen.getByRole('button', { name: 'common.help' })

    expect(helpButton.className).toContain('focus:outline-none')
    expect(helpButton.className).toContain('focus-visible:ring-2')
    expect(helpButton.className).toContain('focus-visible:ring-offset-2')
    expect(helpButton.className).toContain(
      'dark:focus-visible:ring-offset-secondary-950',
    )
    expect(helpButton).toHaveAttribute(
      'data-developer-mode-context',
      'navigation',
    )
    expect(helpButton).toHaveAttribute('data-developer-mode-name', 'button')
    expect(helpButton).toHaveAttribute(
      'data-developer-mode-value',
      'help toggle open',
    )

    fireEvent.click(helpButton)

    expect(toggleHelp).toHaveBeenCalledOnce()
  })
})
