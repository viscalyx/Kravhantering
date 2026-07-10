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

const databaseSchemaStatusState = vi.hoisted(() => ({
  value: {
    expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
    status: 'matches' as 'matches' | 'mismatch' | 'unknown',
  } as Record<string, unknown>,
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

function expectButtonIcon(button: HTMLElement, iconClassName: string) {
  expect(button.querySelector('svg')).toHaveClass(iconClassName)
}

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: Record<string, string | number>) => {
      const label = namespace ? `${namespace}.${key}` : key
      return values ? `${label} ${Object.values(values).join(' ')}` : label
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
    databaseSchemaStatusState.value = {
      expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
      status: 'matches',
    }
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
        if (url.includes('/api/database-schema-status')) {
          return okJson(databaseSchemaStatusState.value)
        }
        throw new Error(`Unexpected fetch ${url}`)
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exposes build and database schema status on the app title tooltip', async () => {
    render(
      <Navigation
        buildMetadata={{
          builtAt: '2026-05-21T19:00:00.000Z',
          commitSha: 'abc123',
          expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
          imageTag: 'registry.example/app:1.2.3',
          version: '1.2.3',
        }}
      />,
    )

    const appTitle = screen.getByRole('link', { name: 'common.appName' })

    await waitFor(() =>
      expect(appTitle).toHaveAttribute(
        'title',
        'common.buildVersionTooltip 1.2.3\ncommon.databaseSchemaMatchesTooltip',
      ),
    )
    expect(appTitle).toHaveAttribute(
      'data-developer-mode-context',
      'navigation',
    )
    expect(appTitle).toHaveAttribute('data-developer-mode-name', 'link')
    expect(appTitle).toHaveAttribute('data-developer-mode-value', 'app title')
  })

  it('does not expose observed database schema mismatch details to non-admin users', async () => {
    databaseSchemaStatusState.value = {
      expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
      status: 'mismatch',
    }

    render(
      <Navigation
        buildMetadata={{
          builtAt: '2026-05-21T19:00:00.000Z',
          commitSha: 'abc123',
          expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
          imageTag: 'registry.example/app:1.2.3',
          version: '1.2.3',
        }}
      />,
    )

    const appTitle = screen.getByRole('link', { name: 'common.appName' })

    await waitFor(() =>
      expect(appTitle).toHaveAttribute(
        'title',
        expect.stringContaining('common.databaseSchemaMismatchTooltip'),
      ),
    )
    expect(appTitle.getAttribute('title')).not.toContain(
      'OlderSchema1713000000000',
    )
  })

  it('shows observed database schema mismatch details when the status response includes them', async () => {
    databaseSchemaStatusState.value = {
      expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
      observedDatabaseSchemaVersion: 'OlderSchema1713000000000',
      status: 'mismatch',
    }

    render(
      <Navigation
        buildMetadata={{
          builtAt: '2026-05-21T19:00:00.000Z',
          commitSha: 'abc123',
          expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
          imageTag: 'registry.example/app:1.2.3',
          version: '1.2.3',
        }}
      />,
    )

    const appTitle = screen.getByRole('link', { name: 'common.appName' })

    await waitFor(() =>
      expect(appTitle).toHaveAttribute(
        'title',
        expect.stringContaining(
          'common.databaseSchemaAdminMismatchTooltip InitialSchema1713720000000 OlderSchema1713000000000',
        ),
      ),
    )
  })

  it('refreshes database schema status when the window regains focus', async () => {
    render(
      <Navigation
        buildMetadata={{
          builtAt: '2026-05-21T19:00:00.000Z',
          commitSha: 'abc123',
          expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
          imageTag: 'registry.example/app:1.2.3',
          version: '1.2.3',
        }}
      />,
    )

    const appTitle = screen.getByRole('link', { name: 'common.appName' })
    await waitFor(() =>
      expect(appTitle).toHaveAttribute(
        'title',
        expect.stringContaining('common.databaseSchemaMatchesTooltip'),
      ),
    )

    databaseSchemaStatusState.value = {
      expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
      status: 'unknown',
    }
    window.dispatchEvent(new Event('focus'))

    await waitFor(() =>
      expect(appTitle).toHaveAttribute(
        'title',
        expect.stringContaining('common.databaseSchemaUnavailableTooltip'),
      ),
    )
  })

  it('aborts superseded and unmounted database schema focus refreshes', async () => {
    const databaseSchemaSignals: AbortSignal[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url
        if (url.includes('/api/auth/me')) {
          return Promise.resolve(okJson(authState.value))
        }
        if (url.includes('/api/requirement-areas')) {
          return Promise.resolve(okJson(areasState.value))
        }
        if (url.includes('/api/database-schema-status')) {
          if (init?.signal) databaseSchemaSignals.push(init.signal)
          return new Promise<Response>(() => {})
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`))
      }),
    )
    const { unmount } = render(
      <Navigation
        buildMetadata={{
          builtAt: '2026-05-21T19:00:00.000Z',
          commitSha: 'abc123',
          expectedDatabaseSchemaVersion: 'InitialSchema1713720000000',
          imageTag: 'registry.example/app:1.2.3',
          version: '1.2.3',
        }}
      />,
    )
    await waitFor(() => expect(databaseSchemaSignals.length).toBeGreaterThan(0))
    databaseSchemaSignals.length = 0

    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(databaseSchemaSignals).toHaveLength(1))
    const firstFocusSignal = databaseSchemaSignals[0]
    expect(firstFocusSignal.aborted).toBe(false)

    window.dispatchEvent(new Event('focus'))
    await waitFor(() => expect(databaseSchemaSignals).toHaveLength(2))
    expect(firstFocusSignal.aborted).toBe(true)
    const secondFocusSignal = databaseSchemaSignals[1]
    expect(secondFocusSignal.aborted).toBe(false)

    unmount()
    expect(secondFocusSignal.aborted).toBe(true)
  })

  it('starts collapsed and persists the expanded rail state', async () => {
    const layoutListener = vi.fn()
    window.addEventListener(GLOBAL_NAVIGATION_LAYOUT_EVENT, layoutListener)

    render(<Navigation />)
    layoutListener.mockClear()

    const navigation = screen.getByRole('navigation', {
      name: 'nav.mainNavigation',
    })
    expect(navigation).toHaveStyle({ width: '5.25rem' })
    const expandRailButton = screen.getByRole('button', {
      name: 'nav.expandRail',
    })
    expect(expandRailButton).toBeInTheDocument()
    expect(expandRailButton).toHaveClass('w-12')
    expectButtonIcon(expandRailButton, 'lucide-panel-left-open')
    expect(screen.queryByText('common.appName')).toBeNull()

    fireEvent.click(expandRailButton)

    expect(navigation).toHaveStyle({ width: '16.5rem' })
    const collapseRailButton = screen.getByRole('button', {
      name: 'nav.collapseRail',
    })
    expect(collapseRailButton).toBeInTheDocument()
    expect(collapseRailButton).toHaveClass('w-12')
    expectButtonIcon(collapseRailButton, 'lucide-panel-left-close')
    expect(
      localStorage.getItem('requirements.navigationRail.expanded.v1'),
    ).toBe('expanded')
    await waitFor(() => expect(layoutListener).toHaveBeenCalledOnce())
    await waitFor(() =>
      expect(
        document.documentElement.style.getPropertyValue('--global-nav-width'),
      ).toBe('16.5rem'),
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
    const rfiLink = screen.getByRole('link', { name: 'nav.rfiQuestions' })
    expect(rfiLink).toHaveAttribute(
      'href',
      '/requirements/stewardship?tab=information-requests',
    )
    expect(rfiLink).toHaveAttribute('aria-label', 'nav.rfiQuestions')
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
    searchParamsState.value = new URLSearchParams('tab=information-requests')

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

    const openButton = screen.getByRole('button', { name: 'nav.openMenu' })
    expectButtonIcon(openButton, 'lucide-panel-left-open')

    fireEvent.click(openButton)

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
    const closeButton = closeButtons[closeButtons.length - 1]
    expectButtonIcon(closeButton, 'lucide-panel-left-close')
    expect(closeButton).toHaveAttribute('class', openButton.className)
    fireEvent.click(closeButton)

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
    const lastLink = within(dialog).getByRole('link', {
      name: 'admin.settings',
    })

    await waitFor(() => expect(closeButton).toHaveFocus())

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(lastLink).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(closeButton).toHaveFocus()

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
