import { act, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AccessReviewExportPdfRenderer from '@/components/access-review/AccessReviewExportPdfRenderer'
import { useAccessReviewExportDownload } from '@/components/access-review/useAccessReviewExportDownload'
import DataSubjectExportPdfRenderer from '@/components/privacy/DataSubjectExportPdfRenderer'
import { useDataSubjectExportDownload } from '@/components/privacy/useDataSubjectExportDownload'
import type { AccessReviewExportV1 } from '@/lib/access-review/types'
import type { DataSubjectExportV1 } from '@/lib/privacy/data-subject-export-types'

const state = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  downloadBlob: vi.fn(),
  generatedDownload: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSession: vi.fn(),
  getTranslations: vi.fn(),
  isSignedIn: vi.fn(),
  listActionAuditEvents: vi.fn(),
  notFound: vi.fn(),
  readResponseMessage: vi.fn(),
}))

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: ReactNode }) => (
    <article>{children}</article>
  ),
  Page: ({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  ),
  StyleSheet: { create: (styles: unknown) => styles },
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/generated-output/useGeneratedOutputDownload', () => ({
  useGeneratedOutputDownload: () => ({
    dialog: <span>generated dialog</span>,
    download: state.generatedDownload,
    downloading: false,
    error: null,
  }),
}))

vi.mock('@/lib/browser-download', () => ({ downloadBlob: state.downloadBlob }))
vi.mock('@/lib/http/api-fetch', () => ({ apiFetch: state.apiFetch }))
vi.mock('@/lib/http/response-message', () => ({
  readResponseMessage: state.readResponseMessage,
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

function accessReviewExport(): AccessReviewExportV1 {
  const actor = {
    displayName: 'no-user',
    hsaId: 'SE5560000001-reviewer1',
  }
  return {
    generatedAt: '2026-08-04T12:00:00.000Z',
    generatedBy: actor,
    items: [
      ...(
        [
          'approved',
          'changed',
          'not_applicable',
          'pending',
          'revoke_required',
        ] as const
      ).map((decision, index) => ({
        comment: index === 0 ? 'Reviewed' : null,
        createdAt: '2026-08-04T12:00:00.000Z',
        decidedAt: index === 0 ? '2026-08-04T12:30:00.000Z' : null,
        decidedBy: index === 0 ? actor : null,
        decision,
        id: index + 1,
        permissionType: 'area_owner' as const,
        principal: actor,
        scope: { key: '1', label: 'Area', type: 'requirement_area' as const },
        sourceKey: 'requirement_areas.owner',
        sourceTable: 'requirement_areas',
      })),
    ],
    limitations: [
      { description: 'External roles excluded', key: 'external_roles' },
    ],
    run: {
      completedAt: '2026-08-04T13:00:00.000Z',
      completedBy: actor,
      createdAt: '2026-08-04T12:00:00.000Z',
      createdBy: actor,
      dueAt: '2026-09-04T12:00:00.000Z',
      externalEvidenceReference: null,
      id: 42,
      periodEnd: '2026-12-31',
      periodStart: '2026-01-01',
      reviewer: actor,
      status: 'completed',
      summary: {
        approvedCount: 1,
        changedCount: 1,
        itemCount: 5,
        notApplicableCount: 1,
        pendingCount: 1,
        revokeRequiredCount: 1,
      },
      updatedAt: '2026-08-04T13:00:00.000Z',
    },
    schemaVersion: 'access-review-export.v1',
  }
}

function dataSubjectExport(): DataSubjectExportV1 {
  return {
    generatedAt: '2026-08-04T12:00:00.000Z',
    generatedBy: {
      displayName: 'Privacy Officer',
      hsaId: 'SE5560000001-privacy1',
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'privacy-sub',
    },
    limitations: [
      { description: 'Free text is excluded.', key: 'free_text_not_scanned' },
    ],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [
      {
        fieldKey: 'owner',
        items: [
          {
            fieldName: 'owner_hsa_id',
            relatedObject: {
              key: '1',
              label: 'Area',
              type: 'requirement_area',
            },
            relationToSubject: 'live_owner_assignment',
            sourceKey: 'requirement_areas.owner',
            table: 'requirement_areas',
            value: 'SE5560000001-subject1',
          },
        ],
        key: 'requirement_areas.owner',
        objectKey: 'requirementAreas',
        relationToSubject: 'live_owner_assignment',
        table: 'requirement_areas',
      },
    ],
    subject: {
      hsaId: 'SE5560000001-subject1',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: { itemCount: 1, limitationCount: 1, sourceCount: 1 },
  }
}

describe('accountability PDF renderers', () => {
  it.each(['en', 'sv'])(
    'renders complete access-review evidence in %s',
    locale => {
      render(
        <AccessReviewExportPdfRenderer
          exportData={accessReviewExport()}
          locale={locale}
        />,
      )
      expect(
        screen.getByText(/access review export|export av behörighetsöversyn/i),
      ).toBeVisible()
      expect(screen.getByText('Reviewed')).toBeVisible()
      expect(screen.getAllByText(/Anonymous|Anonym/).length).toBeGreaterThan(0)
    },
  )

  it.each(['en', 'sv'])('renders personal-data evidence in %s', locale => {
    render(
      <DataSubjectExportPdfRenderer
        exportData={dataSubjectExport()}
        locale={locale}
      />,
    )
    expect(
      screen.getByText(/Personal data export|Export av personuppgifter/),
    ).toBeVisible()
    expect(
      screen.getByText(
        /Free-text fields are not scanned|Fritextfält söks inte igenom/,
      ),
    ).toBeVisible()
  })
})

describe('accountability export hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.apiFetch.mockResolvedValue(
      new Response(JSON.stringify(accessReviewExport()), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
  })

  it('covers access-review JSON, PDF, rejection, failure, and empty selection', async () => {
    const { result, rerender } = renderHook(
      ({ reviewId }) =>
        useAccessReviewExportDownload({ locale: 'en', reviewId }),
      { initialProps: { reviewId: 42 as number | null } },
    )
    await act(() => result.current.download({ delivery: 'json' }))
    expect(state.downloadBlob).toHaveBeenCalled()

    await act(() => result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalled()

    state.apiFetch.mockResolvedValueOnce(
      new Response('Denied', { status: 403 }),
    )
    state.readResponseMessage.mockResolvedValueOnce('Denied')
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('Denied')
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()

    state.apiFetch.mockRejectedValueOnce('offline')
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('Export failed')

    rerender({ reviewId: null })
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.downloading).toBeNull()
  })

  it('covers data-subject JSON, PDF, rejection, and thrown errors', async () => {
    state.apiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(dataSubjectExport()), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    )
    const { result } = renderHook(() =>
      useDataSubjectExportDownload({
        locale: 'sv',
        targetHsaId: 'SE5560000001-subject1',
      }),
    )
    await act(() => result.current.download({ delivery: 'json' }))
    expect(state.downloadBlob).toHaveBeenCalled()

    await act(() => result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalled()

    state.apiFetch.mockResolvedValueOnce(new Response(null, { status: 500 }))
    state.readResponseMessage.mockResolvedValueOnce(null)
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('Export failed')

    state.apiFetch.mockRejectedValueOnce(new Error('offline'))
    await act(() => result.current.download({ delivery: 'json' }))
    expect(result.current.error).toBe('offline')
  })

  it('covers localized fallbacks and error reset variants', async () => {
    const access = renderHook(() =>
      useAccessReviewExportDownload({ locale: 'sv', reviewId: 7 }),
    )
    await act(() => access.result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackFilename: 'behorighetsoversyn-7.pdf' }),
    )
    state.apiFetch.mockResolvedValueOnce(new Response(null, { status: 500 }))
    state.readResponseMessage.mockResolvedValueOnce(null)
    await act(() => access.result.current.download({ delivery: 'json' }))
    expect(access.result.current.error).toBe('Export failed')
    state.apiFetch.mockRejectedValueOnce(new Error('network down'))
    await act(() => access.result.current.download({ delivery: 'json' }))
    expect(access.result.current.error).toBe('network down')

    const privacy = renderHook(() =>
      useDataSubjectExportDownload({ locale: 'en', targetHsaId: undefined }),
    )
    await act(() => privacy.result.current.download({ delivery: 'pdf' }))
    expect(state.generatedDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackFilename: 'data-subject-access-export.pdf',
      }),
    )
    state.apiFetch.mockRejectedValueOnce('offline')
    await act(() => privacy.result.current.download({ delivery: 'json' }))
    expect(privacy.result.current.error).toBe('Export failed')
  })
})

describe('accountability server pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.getTranslations.mockResolvedValue(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
    )
  })

  it('projects only a signed-in user into the privacy page', async () => {
    state.getSession.mockResolvedValue({
      email: 'ada@example.test',
      hsaId: 'SE5560000001-ada1',
      name: 'Ada Admin',
    })
    state.isSignedIn.mockReturnValue(true)
    const { default: PrivacyPage, generateMetadata } = await import(
      '@/app/[locale]/privacy/page'
    )
    expect(
      await generateMetadata({
        params: Promise.resolve({ locale: 'invalid' }),
      }),
    ).toEqual({
      title: 'title',
    })
    expect(
      await generateMetadata({ params: Promise.resolve({ locale: 'en' }) }),
    ).toEqual({
      title: 'title',
    })
    const page = await PrivacyPage()
    expect(page.props.currentUser).toEqual({
      email: 'ada@example.test',
      hsaId: 'SE5560000001-ada1',
      name: 'Ada Admin',
    })

    state.getSession.mockResolvedValue({
      hsaId: 'SE5560000001-ada1',
      name: 'Ada Admin',
    })
    expect((await PrivacyPage()).props.currentUser).toEqual({
      hsaId: 'SE5560000001-ada1',
      name: 'Ada Admin',
    })

    state.isSignedIn.mockReturnValue(false)
    expect((await PrivacyPage()).props.currentUser).toBeNull()
  })

  it('renders the authorized audit page and rejects non-admin sessions', async () => {
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
    ).toEqual({
      title: 'title',
    })
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
