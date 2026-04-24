import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(signInLink.className).toContain('min-h-[44px]')
    expect(signInLink.className).toContain('min-w-[44px]')
    expect(signInLink.className).toContain('focus-visible:ring-2')
  })

  it('renders the mobile sign-in affordance with explicit focus and touch-target classes', async () => {
    fetchMock.mockResolvedValue({ ok: false })

    render(<AuthMenu variant="mobile" />)

    const signInLink = await screen.findByRole('link', { name: 'signIn' })
    expect(signInLink).toHaveAttribute('aria-label', 'signIn')
    expect(signInLink.className).toContain('min-h-[44px]')
    expect(signInLink.className).toContain('min-w-[44px]')
    expect(signInLink.className).toContain('focus-visible:ring-2')
  })

  it('submits logout through fetch with the CSRF header', async () => {
    let resolveLogout: ((value: unknown) => void) | undefined
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          authenticated: true,
          sub: 'user-1',
          hsaId: 'SE2321000032-admin1',
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
    expect(signingOutButton.className).toContain('min-h-[44px]')
    expect(signingOutButton.className).toContain('min-w-[44px]')
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
          hsaId: 'SE2321000032-admin1',
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
      })
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('keeps user info developer-mode values stable in English', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE2321000032-admin1',
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

  it('skips the session expiry row when expiresAt is invalid', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE2321000032-admin1',
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

  it('keeps the desktop popup open when focus moves into the popup subtree', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        hsaId: 'SE2321000032-admin1',
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
        hsaId: 'SE2321000032-admin1',
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
