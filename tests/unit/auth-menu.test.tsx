import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthMenu from '@/components/AuthMenu'

const fetchMock = vi.fn()
const pathnameState = vi.hoisted(() => ({
  value: '/requirements',
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    key === 'signedInAs' && values?.name ? `signedInAs ${values.name}` : key,
  useLocale: () => 'sv',
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  usePathname: () => pathnameState.value,
}))

describe('AuthMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pathnameState.value = '/requirements'
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState({}, '', '/sv/requirements')
  })

  it('renders the sign-in affordance when /api/auth/me returns a non-ok response', async () => {
    window.history.replaceState({}, '', '/sv/requirements?tab=open#section-2')
    fetchMock.mockResolvedValue({ ok: false })

    render(<AuthMenu variant="desktop" />)

    const signInLink = await screen.findByRole('link', { name: 'signIn' })
    expect(signInLink).toHaveAttribute(
      'href',
      `/api/auth/login?returnTo=${encodeURIComponent('/sv/requirements?tab=open#section-2')}`,
    )
    expect(signInLink).toHaveAttribute('aria-label', 'signIn')
    expect(signInLink.className).toContain('min-h-11')
    expect(signInLink.className).toContain('min-w-11')
    expect(signInLink.className).toContain('focus-visible:ring-2')
  })

  it('renders sign-in after a non-abort auth status failure', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    fetchMock.mockRejectedValue(new Error('network unavailable'))

    try {
      render(<AuthMenu variant="desktop" />)
      expect(
        await screen.findByRole('link', { name: 'signIn' }),
      ).toBeInTheDocument()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it.each([new DOMException('aborted', 'AbortError'), { name: 'AbortError' }])(
    'ignores abort-shaped auth status failure %p',
    async failure => {
      fetchMock.mockRejectedValue(failure)
      const { container } = render(<AuthMenu variant="desktop" />)

      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      expect(container).toBeEmptyDOMElement()
    },
  )

  it('does not duplicate the locale root in the sign-in return path', async () => {
    pathnameState.value = '/'
    window.history.replaceState({}, '', '/sv')
    fetchMock.mockResolvedValue({ ok: false })

    render(<AuthMenu variant="desktop" />)

    expect(await screen.findByRole('link', { name: 'signIn' })).toHaveAttribute(
      'href',
      '/api/auth/login?returnTo=%2Fsv',
    )
  })

  it('renders the mobile sign-in affordance with explicit focus and touch-target classes', async () => {
    fetchMock.mockResolvedValue({ ok: false })

    render(<AuthMenu variant="mobile" />)

    const signInLink = await screen.findByRole('link', { name: 'signIn' })
    expect(signInLink).toHaveAttribute('aria-label', 'signIn')
    expect(signInLink.className).toContain('min-h-11')
    expect(signInLink.className).toContain('min-w-11')
    expect(signInLink.className).toContain('focus-visible:ring-2')
  })

  it('uses the navigation icon footprint for the rail sign-in affordance', async () => {
    fetchMock.mockResolvedValue({ ok: false })

    render(<AuthMenu variant="rail" />)

    const signInLink = await screen.findByRole('link', { name: 'signIn' })
    const icon = signInLink.querySelector('svg')

    expect(icon).toHaveClass('h-5', 'w-5')
  })

  it('aborts the auth status request when unmounted', async () => {
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined
      return new Promise(() => {})
    })

    const { unmount } = render(<AuthMenu variant="desktop" />)

    await waitFor(() => {
      expect(signal).toBeDefined()
    })
    expect(signal?.aborted).toBe(false)

    unmount()

    expect(signal?.aborted).toBe(true)
  })

  it('submits logout through fetch with the CSRF header', async () => {
    let resolveLogout: ((value: unknown) => void) | undefined
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          sub: 'user-1',
          hsaId: 'SE5560000001-admin1',
          givenName: 'Ada',
          familyName: 'Admin',
          name: 'Ada Admin',
          email: 'ada@example.test',
          roles: ['Admin'],
          expiresAt: 123,
        }),
      })
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveLogout = resolve
        }),
      )

    render(<AuthMenu variant="mobile" />)

    const signOutButton = await screen.findByRole('button', { name: 'signOut' })
    fireEvent.click(signOutButton)

    const signingOutButton = await screen.findByRole('button', {
      name: 'signingOut',
    })
    const logoutForm = signingOutButton.closest('form')

    expect(logoutForm).not.toBeNull()
    expect(logoutForm).not.toHaveAttribute('action')
    expect(logoutForm).not.toHaveAttribute('method')
    expect(signingOutButton).toBeDisabled()
    expect(signingOutButton).toHaveAttribute('title', 'signingOut')
    expect(signingOutButton.className).toContain('min-h-11')
    expect(signingOutButton.className).toContain('min-w-11')
    expect(signingOutButton.className).toContain('focus-visible:ring-2')
    expect(signingOutButton.className).toContain('disabled:cursor-not-allowed')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        '/api/auth/logout',
        expect.objectContaining({
          credentials: 'same-origin',
          headers: expect.objectContaining({
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          }),
          method: 'POST',
        }),
      )
    })

    resolveLogout?.({
      ok: true,
      json: async () => ({ redirectTo: 'https://idp.example.test/logout' }),
    })
  })

  it('re-enables the sign-out button when logout fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    let rejectLogout: ((reason?: unknown) => void) | undefined
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          sub: 'user-1',
          hsaId: 'SE5560000001-admin1',
          givenName: 'Ada',
          familyName: 'Admin',
          name: 'Ada Admin',
          email: 'ada@example.test',
          roles: ['Admin'],
          expiresAt: 123,
        }),
      })
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectLogout = reject
        }),
      )

    try {
      render(<AuthMenu variant="mobile" />)

      const signOutButton = await screen.findByRole('button', {
        name: 'signOut',
      })
      fireEvent.click(signOutButton)

      expect(
        await screen.findByRole('button', { name: 'signingOut' }),
      ).toBeDisabled()

      await act(async () => {
        rejectLogout?.(new Error('Logout failed'))
      })

      await waitFor(() => {
        const restoredButton = screen.getByRole('button', { name: 'signOut' })
        expect(restoredButton).toBeEnabled()
        expect(restoredButton).not.toHaveAttribute('title')
        expect(restoredButton).toHaveAccessibleDescription('logoutError')
      })
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('logoutError')
      expect(alert).toHaveAttribute('data-developer-mode-value', 'logout error')
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('shows a logout error without reading a redirect target on non-ok responses', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const jsonMock = vi.fn(async () => ({ redirectTo: '/should-not-read' }))
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          sub: 'user-1',
          hsaId: 'SE5560000001-admin1',
          givenName: 'Ada',
          familyName: 'Admin',
          name: 'Ada Admin',
          email: 'ada@example.test',
          roles: ['Admin'],
          expiresAt: 123,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: jsonMock,
      })

    try {
      render(<AuthMenu variant="mobile" />)

      const signOutButton = await screen.findByRole('button', {
        name: 'signOut',
      })
      fireEvent.click(signOutButton)

      expect(await screen.findByRole('alert')).toHaveTextContent('logoutError')
      expect(jsonMock).not.toHaveBeenCalled()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Logout failed',
        expect.any(Error),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it.each([
    ['unreadable JSON', () => Promise.reject(new Error('invalid json'))],
    ['missing redirect', async () => ({})],
    ['blank redirect', async () => ({ redirectTo: '   ' })],
    ['non-string redirect', async () => ({ redirectTo: 42 })],
  ])('uses the local logout fallback for %s', async (_label, json) => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          sub: 'user-1',
          hsaId: 'SE5560000001-admin1',
          givenName: 'Ada',
          familyName: 'Admin',
          name: 'Ada Admin',
          roles: ['Admin'],
          expiresAt: 123,
        }),
      })
      .mockResolvedValueOnce({ ok: true, json })

    render(<AuthMenu variant="mobile" />)
    fireEvent.click(await screen.findByRole('button', { name: 'signOut' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('ignores a duplicate logout submission while one is pending', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          sub: 'user-1',
          hsaId: 'SE5560000001-admin1',
          givenName: 'Ada',
          familyName: 'Admin',
          name: 'Ada Admin',
          roles: ['Admin'],
          expiresAt: 123,
        }),
      })
      .mockReturnValueOnce(new Promise(() => {}))

    render(<AuthMenu variant="mobile" />)
    const signOut = await screen.findByRole('button', { name: 'signOut' })
    fireEvent.click(signOut)
    const form = (
      await screen.findByRole('button', { name: 'signingOut' })
    ).closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form as HTMLFormElement)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps user info developer-mode values stable in English', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })

    render(<AuthMenu variant="desktop" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'userInfoTitle' })
    expect(
      dialog.querySelector('[data-developer-mode-value="user info name"]'),
    ).not.toBeNull()
    expect(
      dialog.querySelector('[data-developer-mode-value="user info email"]'),
    ).not.toBeNull()
    expect(
      dialog.querySelector('[data-developer-mode-value="user info subject"]'),
    ).not.toBeNull()
    expect(
      dialog.querySelector(
        '[data-developer-mode-value="user info session expires"]',
      ),
    ).not.toBeNull()
    expect(
      dialog.querySelector(
        '[data-developer-mode-value="user info userInfoName"]',
      ),
    ).toBeNull()
    expect(dialog.className).toContain('max-w-sm')
    expect(dialog.className).not.toContain('w-72')
  })

  it('links signed-in users to their data export page', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })

    render(<AuthMenu variant="desktop" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'userInfoTitle' })
    const dataExportLink = within(dialog).getByRole('link', {
      name: 'dataExport',
    })

    expect(dataExportLink).toHaveAttribute('href', '/privacy')
    expect(dataExportLink).toHaveAttribute(
      'data-developer-mode-value',
      'data export',
    )
  })

  it('opens the rail user popup outside the rail scroll container', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })

    render(<AuthMenu variant="rail" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'userInfoTitle' })

    expect(dialog.className).toContain('fixed')
    expect(dialog.className).toContain(
      'left-[calc(var(--global-nav-width)+0.5rem)]',
    )
    expect(dialog.className).not.toContain('left-full')
  })

  it('keeps the rail popup mounted while the pointer crosses its visual gap', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })

    render(<AuthMenu variant="rail" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    const popupRoot = trigger.parentElement
    expect(popupRoot).not.toBeNull()

    fireEvent.mouseEnter(popupRoot as HTMLElement)
    const dialog = await screen.findByRole('dialog', { name: 'userInfoTitle' })

    vi.useFakeTimers()
    try {
      fireEvent.mouseLeave(popupRoot as HTMLElement)
      fireEvent.mouseEnter(dialog)

      act(() => vi.runAllTimers())

      expect(
        screen.getByRole('dialog', { name: 'userInfoTitle' }),
      ).toBeInTheDocument()

      fireEvent.mouseLeave(popupRoot as HTMLElement)
      act(() => vi.runAllTimers())

      expect(screen.queryByRole('dialog', { name: 'userInfoTitle' })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the popup open when keyboard focus reopens it before pointer grace expires', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })

    render(<AuthMenu variant="rail" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    const popupRoot = trigger.parentElement
    expect(popupRoot).not.toBeNull()
    const focusVisibleSpy = vi
      .spyOn(trigger, 'matches')
      .mockImplementation(selector => selector === ':focus-visible')

    vi.useFakeTimers()
    try {
      fireEvent.mouseEnter(popupRoot as HTMLElement)
      expect(
        screen.getByRole('dialog', { name: 'userInfoTitle' }),
      ).toBeInTheDocument()

      fireEvent.mouseLeave(popupRoot as HTMLElement)
      fireEvent.pointerDown(document.body)
      expect(screen.queryByRole('dialog', { name: 'userInfoTitle' })).toBeNull()

      fireEvent.focus(trigger)
      expect(
        screen.getByRole('dialog', { name: 'userInfoTitle' }),
      ).toBeInTheDocument()

      act(() => vi.runAllTimers())

      expect(
        screen.getByRole('dialog', { name: 'userInfoTitle' }),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      focusVisibleSpy.mockRestore()
    }
  })

  it('still closes the rail popup immediately on an outside pointer press', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })

    render(<AuthMenu variant="rail" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    fireEvent.mouseEnter(trigger)
    await screen.findByRole('dialog', { name: 'userInfoTitle' })

    fireEvent.pointerDown(document.body)

    expect(screen.queryByRole('dialog', { name: 'userInfoTitle' })).toBeNull()
  })

  it('skips the session expiry row when expiresAt is invalid', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: Number.NaN,
      }),
    })

    render(<AuthMenu variant="desktop" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'userInfoTitle' })
    expect(
      dialog.querySelector(
        '[data-developer-mode-value="user info session expires"]',
      ),
    ).toBeNull()
  })

  it('renders subject fallback and the explicit no-roles state', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: '',
        givenName: 'Ada',
        familyName: 'Admin',
        name: '',
        email: '',
        roles: [],
        expiresAt: Number.NaN,
      }),
    })

    render(<AuthMenu variant="desktop" />)
    const trigger = await screen.findByRole('button', {
      name: 'signedInAs user-1',
    })
    fireEvent.click(trigger)

    expect(await screen.findByText('userInfoNoRoles')).toBeInTheDocument()
    expect(screen.getByText('user-1')).toBeInTheDocument()
  })

  it('opens the popup for focus-visible keyboard focus', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })
    render(<AuthMenu variant="desktop" />)
    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    Object.defineProperty(trigger, 'matches', {
      value: vi.fn().mockReturnValue(true),
    })

    fireEvent.focus(trigger)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('keeps the popup closed when focus-visible detection is unsupported', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })
    render(<AuthMenu variant="desktop" />)
    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    Object.defineProperty(trigger, 'matches', {
      value: vi.fn(() => {
        throw new Error('selector unsupported')
      }),
    })

    fireEvent.focus(trigger)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the desktop popup open when focus moves into the popup subtree', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })

    render(<AuthMenu variant="desktop" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    fireEvent.click(trigger)

    const signOutButton = await screen.findByRole('button', { name: 'signOut' })
    fireEvent.blur(trigger, { relatedTarget: signOutButton })
    fireEvent.focus(signOutButton)

    expect(signOutButton).toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'userInfoTitle' }),
    ).toBeInTheDocument()
  })

  it('closes the popup on Escape and restores focus to the trigger', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE5560000001-admin1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: 123,
      }),
    })

    render(<AuthMenu variant="desktop" />)

    const trigger = await screen.findByRole('button', {
      name: 'signedInAs Ada Admin',
    })
    fireEvent.click(trigger)

    const signOutButton = await screen.findByRole('button', { name: 'signOut' })
    signOutButton.focus()
    fireEvent.keyDown(signOutButton, { key: 'Escape' })

    await waitFor(() => {
      expect(trigger).toHaveFocus()
    })
    expect(screen.queryByRole('dialog', { name: 'userInfoTitle' })).toBeNull()
  })
})
