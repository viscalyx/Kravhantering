import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminPageMocks = vi.hoisted(() => ({
  dataSource: { name: 'test-data-source' },
  getDataSource: vi.fn(),
  getSession: vi.fn(),
  listActionAuditEvents: vi.fn(),
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

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: adminPageMocks.getDataSource,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  listActionAuditEvents: adminPageMocks.listActionAuditEvents,
}))

vi.mock('@/app/[locale]/admin/admin-client', () => ({
  default: ({
    actionAuditLog,
    currentUserRoles,
  }: {
    actionAuditLog?: unknown
    currentUserRoles: string[]
  }) => (
    <div data-testid="admin-client">
      {currentUserRoles.join(',')}:
      {actionAuditLog ? 'audit-loaded' : 'no-audit'}
    </div>
  ),
}))

async function renderAdminPage({
  roles,
  tab,
}: {
  roles: string[]
  tab?: string
}) {
  adminPageMocks.getSession.mockResolvedValue({ roles, sub: 'signed-in-user' })
  const { default: AdminPage } = await import('@/app/[locale]/admin/page')
  const searchParams = tab ? { tab } : {}

  render(
    await AdminPage({
      params: Promise.resolve({ locale: 'sv' }),
      searchParams: Promise.resolve(searchParams),
    }),
  )
}

describe('AdminPage authorization and initial data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminPageMocks.getDataSource.mockResolvedValue(adminPageMocks.dataSource)
    adminPageMocks.listActionAuditEvents.mockResolvedValue({
      events: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    })
  })

  it('renders access denied without client code or database reads for an ineligible role', async () => {
    await renderAdminPage({ roles: ['Reviewer'], tab: 'actionAuditLog' })

    expect(
      screen.getByRole('heading', { name: 'admin.accessDenied.title' }),
    ).toBeVisible()
    expect(screen.queryByTestId('admin-client')).toBeNull()
    expect(adminPageMocks.getDataSource).not.toHaveBeenCalled()
    expect(adminPageMocks.listActionAuditEvents).not.toHaveBeenCalled()
  })

  it('does not load the Admin-only action log for PrivacyOfficer', async () => {
    await renderAdminPage({
      roles: ['PrivacyOfficer'],
      tab: 'actionAuditLog',
    })

    expect(screen.getByTestId('admin-client')).toHaveTextContent(
      'PrivacyOfficer:no-audit',
    )
    expect(adminPageMocks.getDataSource).not.toHaveBeenCalled()
    expect(adminPageMocks.listActionAuditEvents).not.toHaveBeenCalled()
  })

  it('loads action-log data only when an Admin initially opens that tab', async () => {
    await renderAdminPage({ roles: ['Admin'], tab: 'actionAuditLog' })

    expect(screen.getByTestId('admin-client')).toHaveTextContent(
      'Admin:audit-loaded',
    )
    expect(adminPageMocks.getDataSource).toHaveBeenCalledOnce()
    expect(adminPageMocks.listActionAuditEvents).toHaveBeenCalledOnce()
  })

  it('does not load action-log data when an Admin opens the default tab', async () => {
    await renderAdminPage({ roles: ['Admin'] })

    expect(screen.getByTestId('admin-client')).toHaveTextContent(
      'Admin:no-audit',
    )
    expect(adminPageMocks.getDataSource).not.toHaveBeenCalled()
    expect(adminPageMocks.listActionAuditEvents).not.toHaveBeenCalled()
  })
})
