import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Navigation from '@/components/Navigation'

const pathnameState = vi.hoisted(() => ({
  value: '/requirements',
}))

const searchParamsState = vi.hoisted(() => ({
  value: new URLSearchParams(),
}))

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

const helpState = vi.hoisted(() => ({
  value: {
    content: null as { sections: never[]; titleKey: string } | null,
    isOpen: false,
    toggle: vi.fn(),
  },
}))

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: Record<string, string | number>) => {
      const label = namespace ? `${namespace}.${key}` : key
      return values?.version ? `${label} ${values.version}` : label
    },
  useLocale: () => 'en',
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.value,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  usePathname: () => pathnameState.value,
  useRouter: () => routerState,
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

vi.mock('@/components/AuthMenu', () => ({
  default: ({ variant }: { variant: 'desktop' | 'mobile' }) => (
    <div data-testid={`auth-menu-${variant}`} />
  ),
}))

vi.mock('@/components/HelpPanel', () => ({
  useHelp: () => helpState.value,
}))

describe('Navigation', () => {
  beforeEach(() => {
    pathnameState.value = '/requirements'
    searchParamsState.value = new URLSearchParams()
    routerState.push.mockClear()
    routerState.replace.mockClear()
    localStorage.clear()
    helpState.value = {
      content: null,
      isOpen: false,
      toggle: vi.fn(),
    }
  })

  it('exposes build version on the app title tooltip', () => {
    render(
      <Navigation
        buildMetadata={{
          builtAt: '2026-05-21T19:00:00.000Z',
          commitSha: 'abc123',
          imageTag: 'registry.example/app:1.2.3',
          version: '1.2.3',
        }}
      />,
    )

    const appTitle = screen.getByRole('link', { name: 'common.appName' })

    expect(appTitle).toHaveAttribute(
      'title',
      'common.buildVersionTooltip 1.2.3',
    )
    expect(appTitle).toHaveAttribute(
      'data-developer-mode-context',
      'navigation',
    )
    expect(appTitle).toHaveAttribute('data-developer-mode-name', 'link')
    expect(appTitle).toHaveAttribute('data-developer-mode-value', 'app title')
  })

  it('shows global settings and opens default stewardship from desktop', () => {
    render(<Navigation />)

    const settingsLink = screen.getByRole('link', { name: 'admin.settings' })
    const stewardshipButton = screen.getByRole('button', {
      name: 'nav.stewardship',
    })

    expect(settingsLink).toHaveAttribute('href', '/admin')
    expect(settingsLink.className).toContain('min-h-11')
    expect(settingsLink.className).toContain('min-w-11')
    expect(screen.queryByText('nav.taxonomy')).toBeNull()
    expect(screen.queryByRole('link', { name: 'nav.areas' })).toBeNull()
    expect(screen.getByRole('link', { name: 'nav.catalog' })).toHaveAttribute(
      'href',
      '/requirements',
    )
    expect(stewardshipButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: 'nav.stewardship' })).toBeNull()
    fireEvent.click(stewardshipButton)
    expect(routerState.push).toHaveBeenCalledWith(
      '/requirements/stewardship?tab=packages',
    )
    expect(stewardshipButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('link', { name: 'nav.requirementPackages' }),
    ).toHaveAttribute('href', '/requirements/stewardship?tab=packages')
    expect(
      screen.getByRole('link', { name: 'nav.requirementSelectionQuestions' }),
    ).toHaveAttribute('href', '/requirements/stewardship?tab=questions')
    expect(
      screen.getByRole('link', { name: 'nav.specifications' }),
    ).toHaveAttribute('href', '/specifications')
  })

  it('uses distinct navigation icons for the library, stewardship, and packages', () => {
    render(<Navigation />)

    const catalogLink = screen.getByRole('link', { name: 'nav.catalog' })
    const stewardshipButton = screen.getByRole('button', {
      name: 'nav.stewardship',
    })

    expect(catalogLink.querySelector('.lucide-library-big')).toBeInTheDocument()
    expect(
      stewardshipButton.querySelector('.lucide-folder-cog'),
    ).toBeInTheDocument()

    fireEvent.click(stewardshipButton)

    const packageLink = screen.getByRole('link', {
      name: 'nav.requirementPackages',
    })

    expect(packageLink.querySelector('.lucide-package')).toBeInTheDocument()
  })

  it('opens the remembered stewardship tab from desktop', () => {
    localStorage.setItem('requirements.stewardship.tab', 'questions')

    render(<Navigation />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'nav.stewardship',
      }),
    )

    expect(routerState.push).toHaveBeenCalledWith(
      '/requirements/stewardship?tab=questions',
    )
  })

  it('closes desktop stewardship subnavigation when sibling primary links are selected', () => {
    render(<Navigation />)

    const stewardshipButton = screen.getByRole('button', {
      name: 'nav.stewardship',
    })

    fireEvent.click(stewardshipButton)
    expect(
      screen.getByRole('link', { name: 'nav.requirementPackages' }),
    ).toHaveAttribute('href', '/requirements/stewardship?tab=packages')

    fireEvent.click(screen.getByRole('link', { name: 'nav.specifications' }))

    expect(stewardshipButton).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('link', { name: 'nav.requirementPackages' }),
    ).toBeNull()

    fireEvent.click(stewardshipButton)
    expect(
      screen.getByRole('link', { name: 'nav.requirementPackages' }),
    ).toHaveAttribute('href', '/requirements/stewardship?tab=packages')

    fireEvent.click(screen.getByRole('link', { name: 'nav.catalog' }))

    expect(stewardshipButton).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('link', { name: 'nav.requirementPackages' }),
    ).toBeNull()
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
        .getAllByRole('link', { name: 'nav.specifications' })
        .map(link => link.getAttribute('href')),
    ).toContain('/specifications')
    const stewardshipButtons = screen.getAllByRole('button', {
      name: 'nav.stewardship',
    })
    fireEvent.click(stewardshipButtons[stewardshipButtons.length - 1])
    expect(
      screen
        .getAllByRole('link', { name: 'nav.requirementPackages' })
        .map(link => link.getAttribute('href')),
    ).toContain('/requirements/stewardship?tab=packages')
    expect(
      screen
        .getAllByRole('link', { name: 'nav.requirementSelectionQuestions' })
        .map(link => link.getAttribute('href')),
    ).toContain('/requirements/stewardship?tab=questions')
    expect(screen.queryByRole('link', { name: 'nav.stewardship' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'nav.areas' })).toBeNull()
    expect(screen.queryByText('nav.referenceData')).toBeNull()
  })

  it('keeps stewardship subnavigation expanded on the stewardship route', () => {
    pathnameState.value = '/requirements/stewardship'
    searchParamsState.value = new URLSearchParams('tab=questions')

    render(<Navigation />)

    const stewardshipButton = screen.getByRole('button', {
      name: 'nav.stewardship',
    })
    expect(stewardshipButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('link', { name: 'nav.requirementSelectionQuestions' }),
    ).toHaveAttribute('aria-current', 'page')

    fireEvent.click(stewardshipButton)

    expect(stewardshipButton).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('link', { name: 'nav.requirementSelectionQuestions' }),
    ).toBeNull()
  })

  it.each([
    ['packages', 'nav.requirementPackages'],
    ['questions', 'nav.requirementSelectionQuestions'],
  ])('uses the primary selected background for desktop stewardship %s navigation', (tab, label) => {
    pathnameState.value = '/requirements/stewardship'
    searchParamsState.value = new URLSearchParams(`tab=${tab}`)

    render(<Navigation />)

    const stewardshipButton = screen.getByRole('button', {
      name: 'nav.stewardship',
    })
    const stewardshipTab = screen.getByRole('link', { name: label })
    const stewardshipShell = stewardshipButton.closest(
      '[data-developer-mode-name="stewardship submenu"]',
    )

    expect(stewardshipShell?.className).toContain('bg-secondary-50/90')
    expect(stewardshipShell?.className).toContain('dark:bg-secondary-800/70')
    expect(stewardshipButton.className).toContain('bg-primary-50')
    expect(stewardshipButton.className).not.toContain('bg-white')
    expect(stewardshipTab).toHaveAttribute('aria-current', 'page')
    expect(stewardshipTab.className).toContain('bg-primary-50')
    expect(stewardshipTab.className).not.toContain('bg-white')
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
