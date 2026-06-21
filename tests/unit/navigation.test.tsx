import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Navigation from '@/components/Navigation'
import { GLOBAL_NAVIGATION_LAYOUT_EVENT } from '@/lib/navigation-layout-events'

const pathnameState = vi.hoisted(() => ({
  value: '/requirements',
}))

const searchParamsState = vi.hoisted(() => ({
  value: new URLSearchParams(),
}))

const authState = vi.hoisted(() => ({
  value: {
    authenticated: true,
    roles: [] as string[],
  },
}))

const areasState = vi.hoisted(() => ({
  value: {
    areas: [] as Array<{
      permissions?: { canManageAssignments?: boolean }
    }>,
  },
}))

const helpState = vi.hoisted(() => ({
  value: {
    content: null as { sections: never[]; titleKey: string } | null,
    isOpen: false,
    toggle: vi.fn(),
  },
}))

function okJson(value: unknown) {
  return {
    json: vi.fn(async () => value),
    ok: true,
  } as unknown as Response
}

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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/components/LanguageSwitcher', () => ({
  default: ({ expanded }: { expanded?: boolean }) => (
    <div data-expanded={String(expanded)} data-testid="language-switcher" />
  ),
}))

vi.mock('@/components/Logo', () => ({
  default: () => <div data-testid="logo" />,
}))

vi.mock('@/components/ThemeToggle', () => ({
  default: ({ expanded }: { expanded?: boolean }) => (
    <div data-expanded={String(expanded)} data-testid="theme-toggle" />
  ),
}))

vi.mock('@/components/AuthMenu', () => ({
  default: ({
    expanded,
    variant,
  }: {
    expanded?: boolean
    variant: 'desktop' | 'mobile' | 'rail'
  }) => (
    <div
      data-expanded={String(expanded)}
      data-testid={`auth-menu-${variant}`}
    />
  ),
}))

vi.mock('@/components/HelpPanel', () => ({
  useHelp: () => helpState.value,
}))

describe('Navigation', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    pathnameState.value = '/requirements'
    searchParamsState.value = new URLSearchParams()
    authState.value = { authenticated: true, roles: [] }
    areasState.value = { areas: [] }
    localStorage.clear()
    document.documentElement.style.removeProperty('--global-nav-width')
    helpState.value = {
      content: null,
      isOpen: false,
      toggle: vi.fn(),
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        if (url.includes('/api/auth/me')) return okJson(authState.value)
        if (url.includes('/api/requirement-areas')) {
          return okJson(areasState.value)
        }
        throw new Error(`Unexpected fetch ${url}`)
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('starts collapsed and persists the expanded rail state', async () => {
    const layoutListener = vi.fn()
    window.addEventListener(GLOBAL_NAVIGATION_LAYOUT_EVENT, layoutListener)

    render(<Navigation />)
    layoutListener.mockClear()

    const navigation = screen.getByRole('navigation', {
      name: 'nav.mainNavigation',
    })
    expect(navigation).toHaveStyle({ width: '4.5rem' })
    expect(
      screen.getByRole('button', { name: 'nav.expandRail' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('common.appName')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'nav.expandRail' }))

    expect(navigation).toHaveStyle({ width: '18rem' })
    expect(
      screen.getByRole('button', { name: 'nav.collapseRail' }),
    ).toBeInTheDocument()
    expect(
      localStorage.getItem('requirements.navigationRail.expanded.v1'),
    ).toBe('expanded')
    await waitFor(() => expect(layoutListener).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue('--global-nav-width'),
      ).toBe('18rem'),
    )
    expect(screen.getByText('common.appName')).toBeInTheDocument()
    window.removeEventListener(GLOBAL_NAVIGATION_LAYOUT_EVENT, layoutListener)
  })

  it('does not render a duplicate collapsed divider below the rail header', () => {
    render(<Navigation />)

    const workSection = screen.getByRole('region', { name: 'nav.work' })
    const stewardshipSection = screen.getByRole('region', {
      name: 'nav.stewardship',
    })

    expect(
      within(workSection).queryByTestId('navigation-group-divider'),
    ).toBeNull()
    expect(
      within(stewardshipSection).getByTestId('navigation-group-divider'),
    ).toBeInTheDocument()
  })

  it('renders direct stewardship links and remembers the selected tab', () => {
    render(<Navigation />)

    expect(
      screen.getByRole('link', { name: 'nav.requirementPackages' }),
    ).toHaveAttribute('href', '/requirements/stewardship?tab=packages')
    expect(
      screen.getByRole('link', { name: 'nav.requirementSelectionQuestions' }),
    ).toHaveAttribute('href', '/requirements/stewardship?tab=questions')
    expect(
      screen.getByRole('link', { name: 'nav.rfiQuestions' }),
    ).toHaveAttribute('href', '/requirements/stewardship?tab=rfi')
    expect(
      screen.getByRole('link', { name: 'nav.normLibrary' }),
    ).toHaveAttribute('href', '/requirements/stewardship?tab=norms')
    expect(screen.queryByRole('button', { name: 'nav.stewardship' })).toBeNull()

    fireEvent.click(
      screen.getByRole('link', {
        name: 'nav.requirementSelectionQuestions',
      }),
    )

    expect(localStorage.getItem('requirements.stewardship.tab')).toBe(
      'questions',
    )
  })

  it('marks the active flattened stewardship item', () => {
    pathnameState.value = '/requirements/stewardship'
    searchParamsState.value = new URLSearchParams('tab=rfi')

    render(<Navigation />)

    expect(
      screen.getByRole('link', { name: 'nav.rfiQuestions' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      screen.getByRole('link', { name: 'nav.requirementPackages' }),
    ).not.toHaveAttribute('aria-current')
  })

  it('shows requirement areas for admins even when no areas exist', async () => {
    authState.value = { authenticated: true, roles: ['Admin'] }

    render(<Navigation />)

    expect(
      await screen.findByRole('link', { name: 'nav.areas' }),
    ).toHaveAttribute('href', '/requirement-areas')
  })

  it('shows requirement areas for area owners', async () => {
    areasState.value = {
      areas: [{ permissions: { canManageAssignments: true } }],
    }

    render(<Navigation />)

    expect(
      await screen.findByRole('link', { name: 'nav.areas' }),
    ).toHaveAttribute('href', '/requirement-areas')
  })

  it('hides requirement areas for non-owner non-admin users', async () => {
    areasState.value = {
      areas: [{ permissions: { canManageAssignments: false } }],
    }

    render(<Navigation />)

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('link', { name: 'nav.areas' })).toBeNull()
  })

  it('opens the mobile drawer with expanded navigation items', () => {
    render(<Navigation />)

    fireEvent.click(screen.getByRole('button', { name: 'nav.openMenu' }))

    const dialog = screen.getByRole('dialog', { name: 'nav.mainMenu' })
    expect(
      within(dialog).getByRole('link', { name: 'nav.catalog' }),
    ).toHaveAttribute('href', '/requirements')
    expect(
      within(dialog).getByRole('link', { name: 'nav.specifications' }),
    ).toHaveAttribute('href', '/specifications')
    expect(within(dialog).getByTestId('language-switcher')).toHaveAttribute(
      'data-expanded',
      'true',
    )
    expect(within(dialog).getByTestId('auth-menu-mobile')).toBeInTheDocument()

    const closeButtons = within(dialog).getAllByRole('button', {
      name: 'nav.closeMenu',
    })
    fireEvent.click(closeButtons[closeButtons.length - 1])

    expect(screen.queryByRole('dialog', { name: 'nav.mainMenu' })).toBeNull()
  })

  it('traps focus in the mobile drawer and restores it to the trigger', async () => {
    render(<Navigation />)

    const openButton = screen.getByRole('button', { name: 'nav.openMenu' })
    openButton.focus()
    fireEvent.click(openButton)

    const dialog = screen.getByRole('dialog', { name: 'nav.mainMenu' })
    const closeButtons = within(dialog).getAllByRole('button', {
      name: 'nav.closeMenu',
    })
    const closeButton = closeButtons[closeButtons.length - 1]
    const firstLink = within(dialog).getByRole('link', {
      name: 'common.appName',
    })
    const lastLink = within(dialog).getByRole('link', {
      name: 'admin.settings',
    })

    await waitFor(() => expect(closeButton).toHaveFocus())

    firstLink.focus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(lastLink).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(firstLink).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'nav.mainMenu' })).toBeNull(),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'nav.openMenu' }),
      ).toHaveFocus(),
    )
  })

  it('renders utility actions in the rail', () => {
    const toggleHelp = vi.fn()
    helpState.value = {
      content: { sections: [], titleKey: 'help.navigation' },
      isOpen: true,
      toggle: toggleHelp,
    }

    render(<Navigation />)

    const helpButton = screen.getByRole('button', { name: 'common.help' })
    expect(helpButton).toHaveAttribute(
      'data-developer-mode-context',
      'navigation',
    )
    expect(helpButton).toHaveAttribute('data-developer-mode-name', 'button')
    expect(helpButton).toHaveAttribute(
      'data-developer-mode-value',
      'help toggle open',
    )
    expect(
      screen.getByRole('link', { name: 'admin.settings' }),
    ).toHaveAttribute('href', '/admin')
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument()
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('auth-menu-rail')).toBeInTheDocument()

    fireEvent.click(helpButton)

    expect(toggleHelp).toHaveBeenCalledOnce()
  })
})
