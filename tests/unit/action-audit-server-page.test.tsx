import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  getSession: vi.fn(),
  getTranslations: vi.fn(),
  isSignedIn: vi.fn(),
  listActionAuditEvents: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSession: state.getSession,
  isSignedIn: state.isSignedIn,
}))
vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: state.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/audit/action-audit', () => ({
  listActionAuditEvents: state.listActionAuditEvents,
}))
vi.mock('@/i18n/routing', () => ({
  routing: { defaultLocale: 'sv', locales: ['sv', 'en'] },
}))
vi.mock('next/navigation', () => ({ notFound: state.notFound }))
vi.mock('next-intl/server', () => ({ getTranslations: state.getTranslations }))
vi.mock('@/components/admin/ActionAuditLogView', () => ({
  default: ({
    basePath,
    labels,
    locale,
  }: {
    basePath: string
    labels: {
      pagination: (values: {
        page: number
        total: number
        totalPages: number
      }) => string
    }
    locale: string
  }) => (
    <p>{`${basePath}:${locale}:${labels.pagination({ page: 1, total: 0, totalPages: 1 })}`}</p>
  ),
}))

describe('action audit server page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getTranslations.mockResolvedValue(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
    )
  })

  it('renders authorized results and rejects non-admin sessions', async () => {
    state.getSession.mockResolvedValue({ roles: ['Admin'] })
    state.isSignedIn.mockReturnValue(true)
    state.getRequestSqlServerDataSource.mockResolvedValue({ query: vi.fn() })
    state.listActionAuditEvents.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
    })
    const { default: AuditLogPage, generateMetadata } = await import(
      '@/app/[locale]/admin/audit-log/page'
    )
    expect(
      await generateMetadata({ params: Promise.resolve({ locale: 'en' }) }),
    ).toEqual({ title: 'title' })
    const page = await AuditLogPage({
      params: Promise.resolve({ locale: 'invalid' }),
      searchParams: Promise.resolve({ decision: 'denied' }),
    })
    render(page)
    expect(
      screen.getByText(/\/sv\/admin\/audit-log:sv:pagination/),
    ).toBeVisible()

    state.getRequestSqlServerDataSource.mockClear()
    state.listActionAuditEvents.mockClear()
    state.isSignedIn.mockReturnValue(false)
    state.notFound.mockImplementationOnce(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
    await expect(
      AuditLogPage({
        params: Promise.resolve({ locale: 'sv' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(state.notFound).toHaveBeenCalled()
    expect(state.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(state.listActionAuditEvents).not.toHaveBeenCalled()
  })
})
