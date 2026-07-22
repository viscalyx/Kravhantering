import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminPageMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: adminPageMocks.redirect,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `admin.${key}`),
}))

vi.mock('@/i18n/routing', () => ({
  routing: {
    defaultLocale: 'sv',
    locales: ['en', 'sv'],
  },
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: adminPageMocks.getSession,
  isSignedIn: (session: { sub?: string }) => Boolean(session.sub),
}))

async function invokeAdminPage({
  roles,
  tab,
}: {
  roles: string[]
  tab?: string
}) {
  adminPageMocks.getSession.mockResolvedValue({ roles, sub: 'signed-in-user' })
  const { default: AdminPage } = await import('@/app/[locale]/admin/page')
  return AdminPage({
    params: Promise.resolve({ locale: 'sv' }),
    searchParams: Promise.resolve(tab ? { tab } : {}),
  })
}

describe('AdminPage canonical routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders access denied for an ineligible role', async () => {
    render(await invokeAdminPage({ roles: ['Reviewer'] }))

    expect(
      screen.getByRole('heading', { name: 'admin.accessDenied.title' }),
    ).toBeVisible()
    expect(adminPageMocks.redirect).not.toHaveBeenCalled()
  })

  it('redirects an eligible default request to the isolated columns route', async () => {
    await expect(invokeAdminPage({ roles: ['Admin'] })).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(adminPageMocks.redirect).toHaveBeenCalledWith(
      '/sv/admin?tab=columns',
    )
  })

  it('preserves an authorized requested tab for rewrite routing', async () => {
    await expect(
      invokeAdminPage({ roles: ['Admin'], tab: 'actionAuditLog' }),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(adminPageMocks.redirect).toHaveBeenCalledWith(
      '/sv/admin?tab=actionAuditLog',
    )
  })

  it('falls back to the first authorized tab for unavailable or unauthorized tabs', async () => {
    await expect(
      invokeAdminPage({ roles: ['Admin'], tab: 'missing' }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(adminPageMocks.redirect).toHaveBeenLastCalledWith(
      '/sv/admin?tab=columns',
    )

    adminPageMocks.redirect.mockClear()
    await expect(
      invokeAdminPage({
        roles: ['PrivacyOfficer'],
        tab: 'actionAuditLog',
      }),
    ).rejects.toThrow('NEXT_REDIRECT')
    expect(adminPageMocks.redirect).toHaveBeenLastCalledWith(
      '/sv/admin?tab=accessReview',
    )
  })
})
