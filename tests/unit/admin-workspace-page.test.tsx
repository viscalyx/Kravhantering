import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionAuditLogInitialState } from '@/components/admin/ActionAuditLogView'

const workspaceMocks = vi.hoisted(() => ({
  dataSource: { name: 'admin-test-db' },
  getDataSource: vi.fn(),
  getSession: vi.fn(),
  listActionAuditEvents: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: workspaceMocks.redirect,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `admin.${key}`),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: workspaceMocks.getSession,
  isSignedIn: (session: { sub?: string }) => Boolean(session.sub),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: workspaceMocks.getDataSource,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  listActionAuditEvents: workspaceMocks.listActionAuditEvents,
}))

vi.mock('@/app/[locale]/admin/admin-client', () => ({
  default: ({
    children,
    currentUserRoles,
    selectedTab,
  }: {
    children: React.ReactNode
    currentUserRoles: string[]
    selectedTab: string
  }) => (
    <div data-testid="admin-workspace">
      {selectedTab}:{currentUserRoles.join(',')}:{children}
    </div>
  ),
}))

async function renderWorkspace({
  roles,
  tab,
}: {
  roles: string[]
  tab: 'actionAuditLog' | 'columns' | 'privacy'
}) {
  workspaceMocks.getSession.mockResolvedValue({
    roles,
    sub: 'signed-in-user',
  })
  const { default: AdminWorkspacePage } = await import(
    '@/app/[locale]/admin/admin-workspace-page'
  )

  function Panel({
    initialState,
  }: {
    initialState?: ActionAuditLogInitialState
  }) {
    return (
      <span data-testid="panel">
        {initialState ? 'audit-loaded' : 'panel-loaded'}
      </span>
    )
  }

  const result = AdminWorkspacePage({
    children: <Panel />,
    params: Promise.resolve({ locale: 'sv' }),
    searchParams: Promise.resolve({
      action: 'requirement.create',
      tab: 'actionAuditLog',
    }),
    tab,
  })
  render(await result)
}

describe('AdminWorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    workspaceMocks.getDataSource.mockResolvedValue(workspaceMocks.dataSource)
    workspaceMocks.listActionAuditEvents.mockResolvedValue({
      events: [],
      pagination: { page: 1, pageSize: 50, total: 0, totalPages: 1 },
    })
  })

  it('renders only the authorized selected workspace', async () => {
    await renderWorkspace({ roles: ['Admin'], tab: 'columns' })

    expect(screen.getByTestId('admin-workspace')).toHaveTextContent(
      'columns:Admin:panel-loaded',
    )
    expect(workspaceMocks.getDataSource).not.toHaveBeenCalled()
  })

  it('loads action-audit data only for the authorized action-log workspace', async () => {
    await renderWorkspace({ roles: ['Admin'], tab: 'actionAuditLog' })

    expect(screen.getByTestId('admin-workspace')).toHaveTextContent(
      'actionAuditLog:Admin:audit-loaded',
    )
    expect(workspaceMocks.getDataSource).toHaveBeenCalledOnce()
    expect(workspaceMocks.listActionAuditEvents).toHaveBeenCalledOnce()
  })

  it('redirects a PrivacyOfficer away from an unauthorized workspace', async () => {
    await expect(
      renderWorkspace({ roles: ['PrivacyOfficer'], tab: 'columns' }),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(workspaceMocks.redirect).toHaveBeenCalledWith(
      '/sv/admin?tab=accessReview',
    )
    expect(workspaceMocks.getDataSource).not.toHaveBeenCalled()
  })

  it('renders access denied without loading workspace data for other roles', async () => {
    await renderWorkspace({ roles: ['Reviewer'], tab: 'privacy' })

    expect(
      screen.getByRole('heading', { name: 'admin.accessDenied.title' }),
    ).toBeVisible()
    expect(screen.queryByTestId('admin-workspace')).toBeNull()
    expect(workspaceMocks.getDataSource).not.toHaveBeenCalled()
  })
})
