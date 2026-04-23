import { render, screen } from '@testing-library/react'
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
  })

  it('renders sign-out as a POST form button for authenticated users', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        sub: 'user-1',
        givenName: 'Ada',
        familyName: 'Admin',
        name: 'Ada Admin',
        email: 'ada@example.test',
        roles: ['Admin'],
        expiresAt: null,
      }),
    })

    render(<AuthMenu variant="mobile" />)

    const signOutButton = await screen.findByRole('button', { name: 'signOut' })
    const form = signOutButton.closest('form')

    expect(signOutButton).toHaveAttribute('type', 'submit')
    expect(form).not.toBeNull()
    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe('/api/auth/logout')
  })
})
