// cspell:ignore annaj
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminClient from '@/app/[locale]/admin/admin-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import { HelpProvider, useHelp } from '@/components/HelpPanel'
import {
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  normalizeRequirementListColumnDefaults,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'
import {
  buildUiTerminologyPayload,
  getDefaultUiTerminology,
} from '@/lib/ui-terminology'

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}))
const searchParamsMock = vi.hoisted(() => ({
  current: new URLSearchParams(),
}))
const fetchMock = vi.fn()
const createObjectURLMock = vi.fn(() => 'blob:data-subject-export')
const revokeObjectURLMock = vi.fn()
const anchorClickMock = vi.fn()
const routerRefresh = routerMock.refresh
const routerReplace = routerMock.replace
const TEST_ACCESS_REVIEW_ITEM_ID = 7
const TEST_ACCESS_REVIEW_RUN_ID = 42
const TEST_NEXT_ACCESS_REVIEW_RUN_ID = 43
let retentionPoliciesResponse: Response | Promise<Response> | null = null

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations:
    (namespace?: string) => (key: string, values?: Record<string, unknown>) => {
      const translationKey = namespace ? `${namespace}.${key}` : key
      if (
        key === 'privacy.errorWithDetail' ||
        key === 'privacy.serverErrorWithDetail' ||
        key === 'privacy.exportError' ||
        key === 'accessReview.exportError' ||
        key === 'exportError'
      ) {
        return `${translationKey} ${values?.message ?? ''} ${values?.detail ?? ''}`.trim()
      }
      return translationKey
    },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock.current,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
  useRouter: () => ({
    refresh: routerRefresh,
    replace: routerReplace,
  }),
}))

function okJson(body: unknown) {
  return {
    json: async () => body,
    ok: true,
  } as Response
}

function errorJson(body: unknown, status: number) {
  return {
    json: async () => body,
    ok: false,
    status,
  } as Response
}

function adminTestFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input)
  const method = init?.method ?? 'GET'
  if (url === '/api/admin/archiving/policies' && method === 'GET') {
    return Promise.resolve(
      retentionPoliciesResponse ?? okJson({ policies: [] }),
    )
  }
  return init === undefined ? fetchMock(input) : fetchMock(input, init)
}

function dataSubjectExportBody() {
  return {
    generatedAt: '2026-05-12T12:00:00.000Z',
    generatedBy: {
      displayName: 'Disa PrivacyOfficer',
      hsaId: 'SE2321000032-privacy1',
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'privacy-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [],
    subject: {
      hsaId: 'SE2321000032-kalle2',
      targetFingerprint: '0123456789abcdef0123456789abcdef',
    },
    summary: {
      itemCount: 2,
      limitationCount: 0,
      sourceCount: 1,
    },
  }
}

function archivingRetentionPolicy() {
  return {
    action: 'delete',
    ageDays: 730,
    decisionReference: 'Förvaltningsbeslut 2026-01',
    id: 5,
    informationSet: 'Kravunderlag utanför förvaltning',
    isEnabled: true,
    lastRunAt: null,
    latestRun: null,
    policyKey: 'obsolete_specifications_delete',
    statusCondition: 'Inte Förvaltning och äldre än två år',
  }
}

function archivingRetentionCandidate() {
  return {
    action: 'delete',
    ageBasis: '2025-01-01T00:00:00.000Z',
    blockedReasonKey: null,
    currentDisplayValue: 'Gammalt kravunderlag',
    fieldKey: 'lifecycleStatus',
    key: 'requirements_specifications.obsolete:101',
    objectKey: 'specifications',
    reference: 'SPEC0001 Gammalt kravunderlag',
    requiresExport: true,
    sourceKey: 'requirements_specifications.obsolete',
    subjectId: '101',
    subjectTable: 'requirements_specifications',
  }
}

function archivingRetentionPreview(
  candidates = [archivingRetentionCandidate()],
) {
  const archiveCount = candidates.filter(
    candidate => candidate.requiresExport,
  ).length
  const deleteCount = candidates.filter(
    candidate => candidate.action === 'delete',
  ).length
  return {
    candidates,
    cutoff: '2025-05-14T00:00:00.000Z',
    policy: archivingRetentionPolicy(),
    previewToken: 'retention-preview-token',
    summary: {
      archiveCount,
      candidateCount: candidates.length,
      deleteCount,
      exceptionCount: 0,
      skippedCount: 0,
    },
  }
}

function accessReviewDetail() {
  return {
    items: [
      {
        canGenerateAi: true,
        comment: null,
        createdAt: '2026-05-12T12:00:00.000Z',
        decidedAt: null,
        decidedBy: null,
        decision: 'pending',
        id: TEST_ACCESS_REVIEW_ITEM_ID,
        permissionType: 'area_co_author',
        principal: {
          displayName: 'Kalle Svensson',
          hsaId: 'SE2321000032-kalle1',
        },
        scope: {
          key: '1',
          label: 'INT Integration',
          type: 'requirement_area',
        },
        sourceKey: 'requirement_area_co_authors.hsa_id',
        sourceTable: 'requirement_area_co_authors',
      },
    ],
    run: {
      completedAt: null,
      completedBy: null,
      createdAt: '2026-05-12T12:00:00.000Z',
      createdBy: {
        displayName: 'Ada Admin',
        hsaId: 'SE2321000032-admin1',
      },
      dueAt: '2026-06-11T12:00:00.000Z',
      externalEvidenceReference: 'IDM-2026',
      id: TEST_ACCESS_REVIEW_RUN_ID,
      periodEnd: '2027-05-12T12:00:00.000Z',
      periodStart: '2026-05-12T12:00:00.000Z',
      reviewer: {
        displayName: 'Ada Admin',
        hsaId: 'SE2321000032-admin1',
      },
      status: 'in_review',
      summary: {
        approvedCount: 0,
        changedCount: 0,
        itemCount: 1,
        notApplicableCount: 0,
        pendingCount: 1,
        revokeRequiredCount: 0,
      },
      updatedAt: '2026-05-12T12:00:00.000Z',
    },
  }
}

function accessReviewExportBody() {
  return {
    ...accessReviewDetail(),
    generatedAt: '2026-05-12T12:30:00.000Z',
    generatedBy: {
      displayName: 'Ada Admin',
      hsaId: 'SE2321000032-admin1',
    },
    limitations: [],
    schemaVersion: 'access-review-export.v1',
  }
}

function mockAccessReviewApi(options?: {
  cancelResponse?: Promise<Response> | Response
  createResponse?: Promise<Response> | Response
  detailResponse?: Promise<Response> | Response
  detailResponses?: Record<number, Promise<Response> | Response>
  exportResponse?: Promise<Response> | Response
  itemResponse?: Promise<Response> | Response
  listResponse?: Promise<Response> | Response
}) {
  fetchMock.mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url === '/api/admin/access-reviews' && method === 'GET') {
        return Promise.resolve(
          options?.listResponse ?? okJson({ runs: [accessReviewDetail().run] }),
        )
      }
      if (url === '/api/admin/access-reviews' && method === 'POST') {
        return Promise.resolve(
          options?.createResponse ?? okJson(accessReviewDetail()),
        )
      }
      const detailMatch = url.match(/^\/api\/admin\/access-reviews\/(\d+)$/)
      if (detailMatch && method === 'GET') {
        const reviewId = Number(detailMatch[1])
        return Promise.resolve(
          options?.detailResponses?.[reviewId] ??
            options?.detailResponse ??
            okJson(accessReviewDetail()),
        )
      }
      if (
        url ===
          `/api/admin/access-reviews/${TEST_ACCESS_REVIEW_RUN_ID}/items/${TEST_ACCESS_REVIEW_ITEM_ID}` &&
        method === 'PATCH'
      ) {
        return Promise.resolve(
          options?.itemResponse ??
            okJson({
              ...accessReviewDetail(),
              items: [
                {
                  ...accessReviewDetail().items[0],
                  comment: 'Still needed',
                  decision: 'approved',
                },
              ],
              run: {
                ...accessReviewDetail().run,
                summary: {
                  ...accessReviewDetail().run.summary,
                  approvedCount: 1,
                  pendingCount: 0,
                },
              },
            }),
        )
      }
      if (
        url ===
          `/api/admin/access-reviews/${TEST_ACCESS_REVIEW_RUN_ID}/export` &&
        method === 'POST'
      ) {
        return Promise.resolve(
          options?.exportResponse ?? okJson(accessReviewExportBody()),
        )
      }
      if (
        url ===
          `/api/admin/access-reviews/${TEST_ACCESS_REVIEW_RUN_ID}/cancel` &&
        method === 'POST'
      ) {
        return Promise.resolve(
          options?.cancelResponse ??
            okJson({
              ...accessReviewDetail(),
              run: {
                ...accessReviewDetail().run,
                status: 'cancelled',
              },
            }),
        )
      }
      return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
    },
  )
}

function deferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

function renderWithConfirmModal(ui: Parameters<typeof render>[0]) {
  return render(<ConfirmModalProvider>{ui}</ConfirmModalProvider>)
}

function renderAdminAccessReview(
  options?: Parameters<typeof mockAccessReviewApi>[0],
) {
  searchParamsMock.current = new URLSearchParams('tab=accessReview')
  mockAccessReviewApi(options)

  renderWithConfirmModal(
    <AdminClient
      currentUserRoles={['Admin']}
      initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      initialTerminology={buildUiTerminologyPayload(getDefaultUiTerminology())}
    />,
  )
}

function HelpContentProbe() {
  const { content } = useHelp()
  return <output data-testid="help-title">{content?.titleKey ?? 'none'}</output>
}

function getColumnOrder(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll('[data-testid^="admin-column-row-"]'),
  ).map(node =>
    node.getAttribute('data-testid')?.replace('admin-column-row-', ''),
  )
}

describe('AdminClient', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    retentionPoliciesResponse = null
    createObjectURLMock.mockClear()
    revokeObjectURLMock.mockClear()
    anchorClickMock.mockClear()
    routerRefresh.mockReset()
    routerReplace.mockReset()
    searchParamsMock.current = new URLSearchParams()
    vi.stubGlobal('fetch', adminTestFetch)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURLMock,
    })
    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      value: anchorClickMock,
    })
  })

  it('opens the reference data tab from the admin tab query parameter', () => {
    searchParamsMock.current = new URLSearchParams('tab=referenceData')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const referenceDataTab = screen.getByRole('tab', {
      name: 'admin.referenceData',
    })

    expect(referenceDataTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'referenceData-panel',
    )
  })

  it('opens the action audit log tab from the admin tab query parameter', () => {
    searchParamsMock.current = new URLSearchParams('tab=actionAuditLog')

    render(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const actionAuditLogTab = screen.getByRole('tab', {
      name: 'admin.auditLog.title',
    })

    expect(actionAuditLogTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'actionAuditLog-panel',
    )
    expect(
      screen.getByRole('link', { name: 'admin.auditLog.open' }),
    ).toHaveAttribute('href', '/admin/audit-log')
  })

  it('renders the admin title without the reference data eyebrow', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'admin.title',
    )
    expect(screen.queryByText('nav.referenceData')).toBeNull()
  })

  it('writes the selected admin tab to the current history entry', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.referenceData' }))

    expect(routerReplace).toHaveBeenCalledWith(
      {
        pathname: '/admin',
        query: { tab: 'referenceData' },
      },
      { scroll: false },
    )
  })

  it('writes the action audit log tab to the current history entry', () => {
    render(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.auditLog.title' }))

    expect(routerReplace).toHaveBeenCalledWith(
      {
        pathname: '/admin',
        query: { tab: 'actionAuditLog' },
      },
      { scroll: false },
    )
  })

  it('removes the admin tab query when returning to the default tab', () => {
    searchParamsMock.current = new URLSearchParams('tab=referenceData')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.terminology' }))

    expect(routerReplace).toHaveBeenCalledWith('/admin', { scroll: false })
  })

  it('renders icon-bearing reference data cards that link to the existing pages', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.referenceData' }))

    const panel = within(screen.getByRole('tabpanel'))

    expect(panel.getByTestId('reference-data-card-areas')).toHaveAttribute(
      'href',
      '/requirement-areas',
    )
    expect(panel.getByTestId('reference-data-icon-areas')).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-types')).toHaveAttribute(
      'href',
      '/requirement-types',
    )
    expect(panel.getByTestId('reference-data-icon-types')).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-requirementPackages'),
    ).toHaveAttribute('href', '/requirement-packages')
    expect(
      panel.getByTestId('reference-data-icon-requirementPackages'),
    ).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-statuses')).toHaveAttribute(
      'href',
      '/requirement-statuses',
    )
    expect(panel.getByTestId('reference-data-icon-statuses')).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-qualityCharacteristics'),
    ).toHaveAttribute('href', '/quality-characteristics')
    expect(
      panel.getByTestId('reference-data-icon-qualityCharacteristics'),
    ).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-riskLevels')).toHaveAttribute(
      'href',
      '/risk-levels',
    )
    expect(panel.getByTestId('reference-data-icon-riskLevels')).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-responsibilityAreas'),
    ).toHaveAttribute('href', '/specifications/responsibility-areas')
    expect(
      panel.getByTestId('reference-data-icon-responsibilityAreas'),
    ).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-implementationTypes'),
    ).toHaveAttribute('href', '/specifications/implementation-types')
    expect(
      panel.getByTestId('reference-data-icon-implementationTypes'),
    ).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-lifecycleStatuses'),
    ).toHaveAttribute('href', '/specifications/lifecycle-statuses')
    expect(
      panel.getByTestId('reference-data-icon-lifecycleStatuses'),
    ).toBeTruthy()

    expect(panel.getByTestId('reference-data-card-areaOwners')).toHaveAttribute(
      'href',
      '/owners',
    )
    expect(panel.getByTestId('reference-data-icon-areaOwners')).toBeTruthy()

    expect(
      panel.getByTestId('reference-data-card-specificationItemStatuses'),
    ).toHaveAttribute('href', '/specification-item-statuses')
    expect(
      panel.getByTestId('reference-data-icon-specificationItemStatuses'),
    ).toBeTruthy()

    expect(panel.getAllByRole('link')).toHaveLength(12)
  })

  it('exposes the admin tabs through a tablist and updates selection on click', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const terminologyTab = screen.getByRole('tab', {
      name: 'admin.terminology',
    })
    const referenceDataTab = screen.getByRole('tab', {
      name: 'admin.referenceData',
    })

    expect(terminologyTab.parentElement).toHaveAttribute('role', 'tablist')
    expect(terminologyTab).toHaveAttribute('aria-selected', 'true')
    expect(referenceDataTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(referenceDataTab)

    expect(referenceDataTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'referenceData-panel',
    )
  })

  it('exposes admin tabs and locale toggles with accessible selection state', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const terminologyTab = screen.getByRole('tab', {
      name: 'admin.terminology',
    })
    const columnsTab = screen.getByRole('tab', { name: 'admin.columns' })
    const swedishButton = screen.getByRole('button', { name: 'admin.swedish' })
    const englishButton = screen.getByRole('button', { name: 'admin.english' })

    expect(terminologyTab).toHaveAttribute('aria-controls', 'terminology-panel')
    expect(terminologyTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'terminology-panel',
    )
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'terminology-tab',
    )
    expect(swedishButton).toHaveAttribute('aria-pressed', 'true')
    expect(englishButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(englishButton)

    expect(swedishButton).toHaveAttribute('aria-pressed', 'false')
    expect(englishButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(columnsTab)

    expect(columnsTab).toHaveAttribute('aria-controls', 'columns-panel')
    expect(columnsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'columns-panel')
  })

  it('switches the header help content when the privacy tab is selected', async () => {
    render(
      <HelpProvider>
        <ConfirmModalProvider>
          <AdminClient
            currentUserRoles={['PrivacyOfficer']}
            initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
            initialTerminology={buildUiTerminologyPayload(
              getDefaultUiTerminology(),
            )}
          />
        </ConfirmModalProvider>
        <HelpContentProbe />
      </HelpProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('help-title')).toHaveTextContent('admin.title'),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.privacy.title' }))

    await waitFor(() =>
      expect(screen.getByTestId('help-title')).toHaveTextContent(
        'adminPrivacy.title',
      ),
    )
  })

  it('switches the header help content when the access review tab is selected', async () => {
    mockAccessReviewApi()

    renderWithConfirmModal(
      <HelpProvider>
        <AdminClient
          currentUserRoles={['Admin']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
        <HelpContentProbe />
      </HelpProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('help-title')).toHaveTextContent('admin.title'),
    )

    fireEvent.click(
      screen.getByRole('tab', { name: 'admin.accessReview.title' }),
    )

    await waitFor(() =>
      expect(screen.getByTestId('help-title')).toHaveTextContent(
        'adminAccessReview.title',
      ),
    )
  })

  it('displays access review item details', async () => {
    renderAdminAccessReview()
    const principalCell = await screen.findByText('Kalle Svensson')
    const row = principalCell.closest('tr')
    expect(row).not.toBeNull()
    expect(
      screen.getAllByText('admin.accessReview.runNumber').length,
    ).toBeGreaterThan(0)
    const runStatus = screen
      .getAllByText('admin.accessReview.statuses.in_review')
      .find(element => element.closest('button'))
    expect(runStatus).toHaveClass('dark:bg-transparent')
    expect(row).toHaveTextContent(
      'admin.accessReview.permissionTypes.area_co_author',
    )
    expect(row).toHaveTextContent('admin.accessReview.aiEnabled')
    const displayedEvidenceReference = screen.getByText('IDM-2026')
    expect(displayedEvidenceReference).toHaveClass('truncate')
    expect(displayedEvidenceReference).toHaveAttribute('title', 'IDM-2026')
    expect(row).not.toHaveTextContent('admin.accessReview.decisions.pending')
    expect(
      within(row as HTMLTableRowElement).getByRole('combobox'),
    ).toBeTruthy()
    const needsReviewButton = within(row as HTMLTableRowElement).getByRole(
      'button',
      {
        name: 'admin.accessReview.rowNeedsReview',
      },
    )
    expect(needsReviewButton).toHaveClass('bg-amber-50', 'dark:bg-amber-950/30')
    expect(needsReviewButton).toHaveAttribute(
      'title',
      'admin.accessReview.rowNeedsReview',
    )
  })

  it('saves reviewer decisions', async () => {
    renderAdminAccessReview()
    const row = (await screen.findByText('Kalle Svensson')).closest('tr')
    expect(row).not.toBeNull()

    fireEvent.change(within(row as HTMLTableRowElement).getByRole('textbox'), {
      target: { value: 'Still needed' },
    })
    fireEvent.click(
      within(row as HTMLTableRowElement).getByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/access-reviews/${TEST_ACCESS_REVIEW_RUN_ID}/items/${TEST_ACCESS_REVIEW_ITEM_ID}`,
        expect.objectContaining({
          body: JSON.stringify({
            comment: 'Still needed',
            decision: 'approved',
          }),
          method: 'PATCH',
        }),
      ),
    )
    await waitFor(() =>
      expect(
        within(row as HTMLTableRowElement).queryByRole('combobox'),
      ).toBeNull(),
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(within(row as HTMLTableRowElement).queryByRole('textbox')).toBeNull()
    expect(
      within(row as HTMLTableRowElement).queryByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    ).toBeNull()
    const savedDecisionText = within(row as HTMLTableRowElement).getByText(
      'admin.accessReview.decisions.approved',
    )
    expect(savedDecisionText).toHaveClass('whitespace-nowrap')
    expect(savedDecisionText).toHaveClass(
      'bg-emerald-50',
      'dark:bg-transparent',
    )
    expect(savedDecisionText.closest('td')).toHaveClass(
      'align-middle',
      'text-left',
    )
    const savedCommentText = within(row as HTMLTableRowElement).getByText(
      'Still needed',
    )
    expect(savedCommentText.closest('td')).toHaveClass(
      'align-middle',
      'text-left',
    )
  })

  it('unlocks saved reviewer decisions', async () => {
    const savedDetail = {
      ...accessReviewDetail(),
      items: [
        {
          ...accessReviewDetail().items[0],
          comment: 'Still needed',
          decision: 'approved',
        },
      ],
      run: {
        ...accessReviewDetail().run,
        summary: {
          ...accessReviewDetail().run.summary,
          approvedCount: 1,
          pendingCount: 0,
        },
      },
    }
    renderAdminAccessReview({
      detailResponse: okJson(savedDetail),
      listResponse: okJson({ runs: [savedDetail.run] }),
    })
    const row = (await screen.findByText('Kalle Svensson')).closest('tr')
    expect(row).not.toBeNull()
    const unlockButton = within(row as HTMLTableRowElement).getByRole(
      'button',
      {
        name: 'admin.accessReview.rowApproved',
      },
    )
    expect(unlockButton).toHaveClass('bg-emerald-50', 'dark:bg-emerald-950/30')
    expect(unlockButton).toHaveAttribute(
      'title',
      'admin.accessReview.rowApproved',
    )
    fireEvent.click(unlockButton)
    expect(
      within(row as HTMLTableRowElement).getByRole('combobox'),
    ).toHaveValue('approved')
    expect(within(row as HTMLTableRowElement).getByRole('textbox')).toHaveValue(
      'Still needed',
    )
    expect(
      within(row as HTMLTableRowElement).getByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    ).toBeTruthy()
  })

  it('hides access review decision controls without Admin permission', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    mockAccessReviewApi()

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Reviewer']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const principalCell = await screen.findByText('Kalle Svensson')
    const row = principalCell.closest('tr')
    expect(row).not.toBeNull()
    expect(screen.queryByText('admin.accessReview.lockState')).toBeNull()
    expect(
      within(row as HTMLTableRowElement).queryByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    ).toBeNull()
    expect(
      within(row as HTMLTableRowElement).queryByRole('button', {
        name: 'admin.accessReview.rowApproved',
      }),
    ).toBeNull()
    expect(
      within(row as HTMLTableRowElement).queryByRole('combobox'),
    ).toBeNull()
    expect(within(row as HTMLTableRowElement).queryByRole('textbox')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalledWith(
      `/api/admin/access-reviews/${TEST_ACCESS_REVIEW_RUN_ID}/items/${TEST_ACCESS_REVIEW_ITEM_ID}`,
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('keeps a row in place when locking a saved access review decision', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    const baseDetail = accessReviewDetail()
    const annaItem = {
      ...baseDetail.items[0],
      id: 8,
      principal: {
        displayName: 'Anna Johansson',
        hsaId: 'SE2321000032-annaj',
      },
    }
    const kalleItem = baseDetail.items[0]
    const detailBeforeSave = {
      ...baseDetail,
      items: [annaItem, kalleItem],
      run: {
        ...baseDetail.run,
        summary: {
          ...baseDetail.run.summary,
          itemCount: 2,
          pendingCount: 2,
        },
      },
    }
    const detailAfterSaveWithServerReorder = {
      ...detailBeforeSave,
      items: [
        {
          ...kalleItem,
          comment: 'Still needed',
          decision: 'approved',
        },
        annaItem,
      ],
      run: {
        ...detailBeforeSave.run,
        summary: {
          ...detailBeforeSave.run.summary,
          approvedCount: 1,
          pendingCount: 1,
        },
      },
    }
    mockAccessReviewApi({
      detailResponse: okJson(detailBeforeSave),
      itemResponse: okJson(detailAfterSaveWithServerReorder),
      listResponse: okJson({ runs: [detailBeforeSave.run] }),
    })

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const kalleRow = (await screen.findByText('Kalle Svensson')).closest('tr')
    const annaRow = screen.getByText('Anna Johansson').closest('tr')
    expect(kalleRow).not.toBeNull()
    expect(annaRow).not.toBeNull()
    expect(Array.from(kalleRow?.parentElement?.children ?? [])).toEqual([
      annaRow,
      kalleRow,
    ])

    fireEvent.change(
      within(kalleRow as HTMLTableRowElement).getByRole('textbox'),
      {
        target: { value: 'Still needed' },
      },
    )
    fireEvent.click(
      within(kalleRow as HTMLTableRowElement).getByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    )

    await waitFor(() =>
      expect(
        within(kalleRow as HTMLTableRowElement).queryByRole('combobox'),
      ).toBeNull(),
    )
    expect(Array.from(kalleRow?.parentElement?.children ?? [])).toEqual([
      annaRow,
      kalleRow,
    ])
  })

  it('waits for access review runs before showing the empty state', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    const pendingList = deferred<Response>()
    mockAccessReviewApi({ listResponse: pendingList.promise })

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    expect(screen.queryByText('admin.accessReview.noRuns')).toBeNull()
    expect(screen.queryByText('admin.accessReview.selectRun')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'admin.accessReview.create' }),
    ).toBeDisabled()
    expect(
      screen.queryByRole('button', {
        name: 'admin.accessReview.creating',
      }),
    ).toBeNull()

    await act(async () => {
      pendingList.resolve(okJson({ runs: [] }))
    })

    expect(await screen.findByText('admin.accessReview.noRuns')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'admin.accessReview.create' }),
    ).toBeEnabled()
  })

  it('creates access reviews for the signed-in actor without manual reviewer fields', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    mockAccessReviewApi({ listResponse: okJson({ runs: [] }) })

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    expect(await screen.findByText('admin.accessReview.noRuns')).toBeTruthy()
    expect(screen.queryByText('admin.accessReview.reviewerHsaId')).toBeNull()
    expect(
      screen.queryByText('admin.accessReview.reviewerDisplayName'),
    ).toBeNull()
    expect(
      screen.queryByText('admin.accessReview.externalEvidenceHelp'),
    ).toBeNull()
    const externalEvidenceHelpButton = screen.getByRole('button', {
      name: 'common.help: admin.accessReview.externalEvidenceReference',
    })
    expect(externalEvidenceHelpButton).toHaveAttribute('aria-expanded', 'false')
    const externalEvidenceInput = screen.getByLabelText(
      'admin.accessReview.externalEvidenceReference',
    )
    expect(externalEvidenceInput).not.toHaveAttribute('aria-describedby')
    fireEvent.click(externalEvidenceHelpButton)
    expect(externalEvidenceHelpButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('admin.accessReview.externalEvidenceHelp'),
    ).toBeTruthy()

    fireEvent.change(externalEvidenceInput, { target: { value: 'IDM-2026' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.accessReview.create' }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/access-reviews',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    const createCall = fetchMock.mock.calls.find(([input, init]) => {
      return (
        String(input) === '/api/admin/access-reviews' &&
        (init as RequestInit | undefined)?.method === 'POST'
      )
    })
    expect(createCall).toBeTruthy()
    expect(JSON.parse((createCall?.[1] as RequestInit).body as string)).toEqual(
      {
        externalEvidenceReference: 'IDM-2026',
      },
    )
  })

  it('loads access review runs under React Strict Mode', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    mockAccessReviewApi()

    renderWithConfirmModal(
      <StrictMode>
        <AdminClient
          currentUserRoles={['Admin']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </StrictMode>,
    )

    expect(await screen.findByText('Kalle Svensson')).toBeTruthy()
  })

  it('keeps the access review detail pane quiet while detail is loading', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    const pendingDetail = deferred<Response>()
    mockAccessReviewApi({ detailResponse: pendingDetail.promise })

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    expect(await screen.findByText('admin.accessReview.runNumber')).toBeTruthy()
    expect(screen.queryByText('admin.accessReview.selectRun')).toBeNull()
    expect(screen.queryByText('admin.accessReview.summary.status')).toBeNull()

    await act(async () => {
      pendingDetail.resolve(okJson(accessReviewDetail()))
    })

    expect(await screen.findByText('Kalle Svensson')).toBeTruthy()
  })

  it('keeps the previous access review detail mounted while switching runs', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    const currentDetail = accessReviewDetail()
    const nextDetail = {
      ...accessReviewDetail(),
      items: [
        {
          ...accessReviewDetail().items[0],
          id: 8,
          principal: {
            displayName: 'Anna Johansson',
            hsaId: 'SE2321000032-annaj',
          },
        },
      ],
      run: {
        ...accessReviewDetail().run,
        id: TEST_NEXT_ACCESS_REVIEW_RUN_ID,
        summary: {
          ...accessReviewDetail().run.summary,
          approvedCount: 1,
          pendingCount: 0,
        },
      },
    }
    const pendingNextDetail = deferred<Response>()
    mockAccessReviewApi({
      detailResponses: {
        [TEST_ACCESS_REVIEW_RUN_ID]: okJson(currentDetail),
        [TEST_NEXT_ACCESS_REVIEW_RUN_ID]: pendingNextDetail.promise,
      },
      listResponse: okJson({ runs: [currentDetail.run, nextDetail.run] }),
    })

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    expect(await screen.findByText('Kalle Svensson')).toBeTruthy()

    const runButtons = screen
      .getAllByRole('button')
      .filter(button =>
        button.textContent?.includes('admin.accessReview.pendingCount'),
      )
    expect(runButtons).toHaveLength(2)
    fireEvent.click(runButtons[0])

    expect(screen.getByText('Kalle Svensson')).toBeTruthy()
    expect(screen.queryByText('admin.accessReview.selectRun')).toBeNull()
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/access-reviews/${TEST_NEXT_ACCESS_REVIEW_RUN_ID}`,
      ),
    )
    expect(
      fetchMock.mock.calls.filter(([input]) => {
        return String(input) === '/api/admin/access-reviews'
      }),
    ).toHaveLength(1)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'admin.accessReview.exportJson' }),
      ).toBeDisabled(),
    )

    await act(async () => {
      pendingNextDetail.resolve(okJson(nextDetail))
    })

    expect(await screen.findByText('Anna Johansson')).toBeTruthy()
    expect(screen.queryByText('Kalle Svensson')).toBeNull()
  })

  it('cancels a pending access review after confirmation', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    mockAccessReviewApi()

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    await screen.findByText('Kalle Svensson')
    expect(
      screen.getByRole('button', { name: 'admin.accessReview.create' }),
    ).toBeDisabled()
    expect(
      screen.getByText('admin.accessReview.createBlockedByOpenRun'),
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.accessReview.cancel' }),
    )
    expect(
      await screen.findByText('admin.accessReview.cancelConfirmTitle'),
    ).toBeTruthy()

    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.accessReview.cancel' }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/access-reviews/${TEST_ACCESS_REVIEW_RUN_ID}/cancel`,
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(screen.getByText('admin.accessReview.cancelSuccess')).toBeTruthy()
    expect(
      screen.getAllByText('admin.accessReview.statuses.cancelled'),
    ).toBeTruthy()
    const cancelledRunStatus = screen
      .getAllByText('admin.accessReview.statuses.cancelled')
      .find(element => element.closest('button'))
    expect(cancelledRunStatus).toHaveClass('text-red-700')
    expect(cancelledRunStatus).not.toHaveClass('rounded-full')
    expect(
      screen.getByRole('button', { name: 'admin.accessReview.create' }),
    ).toBeEnabled()
    const cancelledRow = screen.getByText('Kalle Svensson').closest('tr')
    expect(cancelledRow).not.toBeNull()
    expect(cancelledRow).not.toHaveTextContent(
      'admin.accessReview.decisions.pending',
    )
    expect(
      within(cancelledRow as HTMLTableRowElement).queryByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    ).toBeNull()
    expect(
      within(cancelledRow as HTMLTableRowElement).queryByRole('button', {
        name: 'admin.accessReview.rowApproved',
      }),
    ).toBeNull()
    await waitFor(() =>
      expect(screen.queryByText('admin.accessReview.action')).toBeNull(),
    )
  })

  it('exports access review evidence as JSON from the selected run', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    mockAccessReviewApi()

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    await screen.findByText('Kalle Svensson')
    const exportJsonButton = screen.getByRole('button', {
      name: 'admin.accessReview.exportJson',
    })
    const exportPdfButton = screen.getByRole('button', {
      name: 'admin.accessReview.exportPdf',
    })
    expect(exportJsonButton.parentElement).toBe(exportPdfButton.parentElement)
    expect(exportJsonButton.parentElement).toHaveClass('flex-nowrap')
    expect(exportJsonButton).toHaveClass('whitespace-nowrap')
    expect(exportPdfButton).toHaveClass('whitespace-nowrap')

    fireEvent.click(exportJsonButton)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/access-reviews/${TEST_ACCESS_REVIEW_RUN_ID}/export`,
        expect.objectContaining({
          body: JSON.stringify({ delivery: 'json' }),
          method: 'POST',
        }),
      ),
    )
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(anchorClickMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:data-subject-export')
  })

  it('hides the complete action for completed access reviews', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    const completedDetail = {
      ...accessReviewDetail(),
      items: [
        {
          ...accessReviewDetail().items[0],
          decision: 'approved',
        },
      ],
      run: {
        ...accessReviewDetail().run,
        completedAt: '2026-05-13T12:00:00.000Z',
        completedBy: {
          displayName: 'Ada Admin',
          hsaId: 'SE2321000032-admin1',
        },
        status: 'completed',
        summary: {
          ...accessReviewDetail().run.summary,
          approvedCount: 1,
          pendingCount: 0,
        },
      },
    }
    mockAccessReviewApi({
      detailResponse: okJson(completedDetail),
      listResponse: okJson({ runs: [completedDetail.run] }),
    })

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    expect(await screen.findByText('Kalle Svensson')).toBeTruthy()
    const completedRow = screen.getByText('Kalle Svensson').closest('tr')
    expect(completedRow).not.toBeNull()
    expect(
      within(completedRow as HTMLTableRowElement).queryByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    ).toBeNull()
    expect(
      within(completedRow as HTMLTableRowElement).queryByRole('button', {
        name: 'admin.accessReview.rowApproved',
      }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', {
        name: 'admin.accessReview.complete',
      }),
    ).toBeNull()
    expect(screen.queryByText('admin.accessReview.action')).toBeNull()
  })

  it('shows access review export loading and errors', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    const pendingExport = deferred<Response>()
    mockAccessReviewApi({ exportResponse: pendingExport.promise })

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    await screen.findByText('Kalle Svensson')
    const exportJsonButton = screen.getByRole('button', {
      name: 'admin.accessReview.exportJson',
    })
    fireEvent.click(exportJsonButton)

    await waitFor(() =>
      expect(exportJsonButton).toHaveTextContent(
        'admin.accessReview.exportingJson',
      ),
    )
    expect(exportJsonButton).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'admin.accessReview.exportPdf' }),
    ).toBeDisabled()

    pendingExport.resolve(errorJson({ error: 'Admin role is required' }, 403))

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('admin.accessReview.errorPopupTitle'),
    ).toBeTruthy()
    expect(
      within(alert).getByText(
        'admin.accessReview.exportError Admin role is required',
      ),
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.accessReview.dismissError',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(createObjectURLMock).not.toHaveBeenCalled()
  })

  it('surfaces access review action errors in a popup', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    mockAccessReviewApi({
      itemResponse: errorJson({ error: 'Unauthorized' }, 401),
    })

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    await screen.findByText('Kalle Svensson')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.accessReview.rowNeedsReview',
      }),
    )

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('admin.accessReview.errorPopupTitle'),
    ).toBeTruthy()
    expect(within(alert).getByText('Unauthorized')).toBeTruthy()
  })

  it('dims and disables the privacy tab without the PrivacyOfficer role', () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const privacyTab = screen.getByRole('tab', {
      name: 'admin.privacy.title',
    })

    expect(privacyTab).toHaveAttribute('aria-disabled', 'true')
    expect(privacyTab).toHaveAttribute('title', 'admin.privacy.disabledTooltip')
    expect(privacyTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'terminology-panel',
    )
    expect(screen.queryByLabelText('admin.privacy.targetHsaId')).toBeNull()

    fireEvent.click(privacyTab)

    expect(routerReplace).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows inline help for each privacy form field', () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    const helpButtons = [
      ['admin.privacy.targetHsaId', 'admin.privacy.fieldHelp.targetHsaId'],
      [
        'admin.privacy.replacementHsaId',
        'admin.privacy.fieldHelp.replacementHsaId',
      ],
      [
        'admin.privacy.replacementName',
        'admin.privacy.fieldHelp.replacementName',
      ],
      [
        'admin.privacy.replacementFirstName',
        'admin.privacy.fieldHelp.replacementFirstName',
      ],
      [
        'admin.privacy.replacementLastName',
        'admin.privacy.fieldHelp.replacementLastName',
      ],
      [
        'admin.privacy.replacementEmail',
        'admin.privacy.fieldHelp.replacementEmail',
      ],
    ] as const

    for (const [label] of helpButtons) {
      expect(
        screen.getByRole('button', { name: `common.help: ${label}` }),
      ).toBeTruthy()
    }

    fireEvent.click(
      screen.getByRole('button', {
        name: 'common.help: admin.privacy.targetHsaId',
      }),
    )

    expect(screen.getByText('admin.privacy.fieldHelp.targetHsaId')).toBeTruthy()
  })

  it('previews retention candidates and can create an exception', async () => {
    searchParamsMock.current = new URLSearchParams('tab=archiving')
    retentionPoliciesResponse = okJson({
      policies: [archivingRetentionPolicy()],
    })
    fetchMock
      .mockResolvedValueOnce(okJson(archivingRetentionPreview()))
      .mockResolvedValueOnce(okJson({ exception: { id: 5 } }))
      .mockResolvedValueOnce(okJson(archivingRetentionPreview([])))

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    await screen.findByText('Kravunderlag utanför förvaltning')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.preview',
      }),
    )

    await screen.findByText('SPEC0001 Gammalt kravunderlag')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/archiving/preview',
      expect.objectContaining({
        body: JSON.stringify({ policyId: 5 }),
        method: 'POST',
      }),
    )
    expect(
      screen.getByText('admin.privacy.objects.specifications'),
    ).toBeTruthy()
    expect(screen.getByText('Gammalt kravunderlag')).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.createException',
      }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/archiving/exceptions',
        expect.objectContaining({
          body: JSON.stringify({
            policyId: 5,
            reason: 'admin.archiving.retention.defaultExceptionReason',
            sourceKey: 'requirements_specifications.obsolete',
            subjectId: '101',
            subjectTable: 'requirements_specifications',
          }),
          method: 'POST',
        }),
      ),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'admin.archiving.retention.exceptionCreated',
    )
    expect(screen.queryByText('SPEC0001 Gammalt kravunderlag')).toBeNull()
  })

  it('executes a retention run after confirmation', async () => {
    searchParamsMock.current = new URLSearchParams('tab=archiving')
    retentionPoliciesResponse = okJson({
      policies: [archivingRetentionPolicy()],
    })
    fetchMock
      .mockResolvedValueOnce(okJson(archivingRetentionPreview()))
      .mockResolvedValueOnce(
        okJson({
          archive: {
            schemaVersion: 'archiving-retention-export.v2',
          },
          exportToken: 'archive-export-token',
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          ...archivingRetentionPreview([]),
          runId: 77,
        }),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    await screen.findByText('Kravunderlag utanför förvaltning')
    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.preview',
      }),
    )
    await screen.findByText('SPEC0001 Gammalt kravunderlag')

    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.exportJson',
      }),
    )
    await waitFor(() => expect(anchorClickMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('status')).toHaveTextContent(
      'admin.archiving.retention.exportSuccess',
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'admin.archiving.retention.execute',
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('admin.archiving.retention.confirmTitle')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'admin.archiving.retention.execute',
      }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/admin/archiving/runs',
        expect.objectContaining({
          body: JSON.stringify({
            exportToken: 'archive-export-token',
            policyId: 5,
            previewToken: 'retention-preview-token',
          }),
          method: 'POST',
        }),
      ),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'admin.archiving.retention.executeSuccess',
    )
    expect(screen.queryByText('SPEC0001 Gammalt kravunderlag')).toBeNull()
  })

  it('previews duplicate-name privacy erasure by HSA-ID instead of name', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['INT0001 v1 / suggestion 990001'],
            allowedActions: ['anonymize', 'switch', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            fieldKey: 'resolvedBy',
            key: 'improvement_suggestions.resolved_by',
            objectKey: 'improvementSuggestions',
            recommendedAction: 'anonymize',
            warningKey: 'decisionSwitch',
          },
        ],
        previewToken: 'duplicate-name-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    expect(screen.getAllByRole('textbox')).toHaveLength(6)
    expect(
      screen.getByLabelText('admin.privacy.replacementFirstName'),
    ).toBeTruthy()
    expect(
      screen.getByLabelText('admin.privacy.replacementLastName'),
    ).toBeTruthy()
    expect(screen.getByLabelText('admin.privacy.replacementEmail')).toBeTruthy()
    expect(
      screen.getByRole('img', {
        name: 'admin.privacy.replacementEmailOptional',
      }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/privacy/erasure-preview',
        expect.objectContaining({
          body: JSON.stringify({
            replacement: null,
            target: {
              hsaId: 'SE2321000032-kalle2',
            },
          }),
          method: 'POST',
        }),
      ),
    )

    const row = screen
      .getByText('admin.privacy.objects.improvementSuggestions')
      .closest('tr')

    expect(row).not.toBeNull()
    expect(
      within(row as HTMLTableRowElement).getByText(
        'admin.privacy.fields.resolvedBy',
      ),
    ).toBeTruthy()
    expect(within(row as HTMLTableRowElement).getByText('1')).toBeTruthy()
    expect(
      within(row as HTMLTableRowElement).getByText('Kalle Svensson'),
    ).toBeTruthy()
    expect(
      within(row as HTMLTableRowElement).getByText(
        'INT0001 v1 / suggestion 990001',
      ),
    ).toBeTruthy()
    const actionSelect = within(row as HTMLTableRowElement).getByRole(
      'combobox',
    )
    expect(actionSelect).toHaveValue('anonymize')
    expect(
      within(row as HTMLTableRowElement).queryByRole('option', {
        name: 'admin.privacy.actions.switch',
      }),
    ).toBeNull()
    expect(
      within(row as HTMLTableRowElement).getByRole('option', {
        name: 'admin.privacy.actions.anonymize',
      }),
    ).toHaveValue('anonymize')
    expect(
      within(row as HTMLTableRowElement).getByRole('option', {
        name: 'admin.privacy.actions.skip',
      }),
    ).toHaveValue('skip')
    const executeButton = screen.getByRole('button', {
      name: 'admin.privacy.execute',
    })
    const previewTable = row?.closest('table')
    expect(previewTable).not.toBeNull()
    const executePosition =
      previewTable?.compareDocumentPosition(executeButton) ?? 0
    expect(Boolean(executePosition & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    )
    expect(screen.queryByText('admin.privacy.objects.owners')).toBeNull()
    expect(screen.queryByText('admin.privacy.fields.identity')).toBeNull()
  })

  it('exports the privacy preview target as structured JSON', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['INT0001 v1 / suggestion 990001'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'resolvedBy',
              key: 'improvement_suggestions.resolved_by',
              objectKey: 'improvementSuggestions',
              recommendedAction: 'anonymize',
              warningKey: 'decisionSwitch',
            },
          ],
          previewToken: 'duplicate-name-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 1,
        }),
      )
      .mockResolvedValueOnce(okJson(dataSubjectExportBody()))

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByRole('button', {
      name: 'admin.privacy.exportJson',
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.exportJson' }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/privacy/data-subject-export',
        expect.objectContaining({
          body: JSON.stringify({
            delivery: 'json',
            target: { hsaId: 'SE2321000032-kalle2' },
          }),
          method: 'POST',
        }),
      ),
    )
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(anchorClickMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:data-subject-export')
  })

  it('shows a preview export error when data portability export fails', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [],
          previewToken: 'empty-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 0,
        }),
      )
      .mockResolvedValueOnce(
        errorJson({ error: 'PrivacyOfficer role is required' }, 403),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByRole('button', {
      name: 'admin.privacy.exportJson',
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.exportJson' }),
    )

    await screen.findByRole('alert')
    expect(
      screen.getByText(
        'admin.privacy.exportError PrivacyOfficer role is required',
      ),
    ).toBeTruthy()
    expect(createObjectURLMock).not.toHaveBeenCalled()
  })

  it('does not show the privacy execution button for an empty preview', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [],
        previewToken: 'empty-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 0,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByText('admin.privacy.previewResult')

    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()
  })

  it('shows safe server details when privacy preview fails unexpectedly', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      errorJson(
        {
          debugMessage: 'Invalid column name created_by_hsa_id',
          error: 'Failed to preview privacy erasure',
        },
        500,
      ),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-12345' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.serverPreviewError',
      ),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Invalid column name created_by_hsa_id',
    )
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'databasmigreringar',
    )
  })

  it('keeps the preview and marks executed privacy rows after a successful erasure', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['SEC Säkerhet'],
              allowedActions: ['switch', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              disabledReasonKey: null,
              fieldKey: 'identity',
              key: 'owners.identity',
              objectKey: 'owners',
              recommendedAction: 'switch',
              warningKey: 'ownerAreaSwitchOnly',
            },
            {
              affectedReferences: ['SEC Säkerhet'],
              allowedActions: ['switch', 'skip'],
              controlledByGroupKey: 'owners.identity',
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              disabledReasonKey: null,
              fieldKey: 'owner',
              key: 'requirement_areas.owner',
              objectKey: 'requirementAreas',
              readOnlyReasonKey: 'controlledByOwner',
              recommendedAction: 'switch',
              warningKey: 'liveAssignment',
            },
            {
              affectedReferences: ['INT0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'skip',
              warningKey: 'historySwitch',
            },
          ],
          previewToken: 'execution-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 3,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          actions: { anonymize: 0, delete: 0, skip: 1, switch: 2 },
          groups: [],
          requestId: 'erasure-request-1',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 3,
        }),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementName'), {
      target: { value: 'John Carl Levi' },
    })
    fireEvent.change(
      screen.getByLabelText('admin.privacy.replacementFirstName'),
      {
        target: { value: 'John Carl' },
      },
    )
    fireEvent.change(
      screen.getByLabelText('admin.privacy.replacementLastName'),
      {
        target: { value: 'Levi' },
      },
    )
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementEmail'), {
      target: { value: 'john.levi@example.com' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const ownerRow = (
      await screen.findByText('admin.privacy.objects.owners')
    ).closest('tr')
    const requirementAreaRow = screen
      .getByText('admin.privacy.objects.requirementAreas')
      .closest('tr')
    const versionRow = screen
      .getByText('admin.privacy.objects.requirementVersions')
      .closest('tr')

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.privacy.execute' }),
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [executeUrl, executeInit] = fetchMock.mock.calls.at(-1) ?? []
    expect(executeUrl).toBe('/api/privacy/erasure-requests')
    expect(executeInit).toEqual(expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String((executeInit as RequestInit).body))).toEqual({
      actions: {
        'owners.identity': 'switch',
        'requirement_areas.owner': 'switch',
        'requirement_versions.created_by': 'skip',
      },
      previewToken: 'execution-preview-token',
      replacement: {
        displayName: 'John Carl Levi',
        email: 'john.levi@example.com',
        firstName: 'John Carl',
        hsaId: 'SE2321000032-johlju',
        lastName: 'Levi',
      },
      target: { hsaId: 'SE2321000032-kalle1' },
    })

    expect(screen.getByText('admin.privacy.status')).toBeTruthy()
    expect(ownerRow).toHaveTextContent(
      'admin.privacy.executionStatus.completed',
    )
    expect(ownerRow?.className).toContain('bg-emerald')
    expect(requirementAreaRow).toHaveTextContent(
      'admin.privacy.executionStatus.completed',
    )
    expect(requirementAreaRow?.className).toContain('bg-emerald')
    expect(versionRow).toHaveTextContent(
      'admin.privacy.executionStatus.skipped',
    )
    expect(versionRow?.className).toContain('bg-secondary')
    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()
  })

  it('clears stale privacy preview rows when the target HSA-ID changes', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['INT0001 v1'],
            allowedActions: ['anonymize', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            fieldKey: 'createdBy',
            key: 'requirement_versions.created_by',
            objectKey: 'requirementVersions',
            recommendedAction: 'anonymize',
            warningKey: 'historySwitch',
          },
        ],
        previewToken: 'target-change-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    const targetInput = screen.getByLabelText('admin.privacy.targetHsaId')
    fireEvent.change(targetInput, {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByText('admin.privacy.objects.requirementVersions')
    expect(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeTruthy()

    fireEvent.change(targetInput, {
      target: { value: 'SE2321000032-kalle2' },
    })

    expect(
      screen.queryByText('admin.privacy.objects.requirementVersions'),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()
  })

  it('shows execute-specific server details when privacy execution fails unexpectedly', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['REQ0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Linnéa Bergström',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'anonymize',
              warningKey: 'historySwitch',
            },
          ],
          previewToken: 'execution-server-error-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 1,
        }),
      )
      .mockResolvedValueOnce(
        errorJson(
          {
            debugMessage: 'Cannot update responsible_hsa_id',
            error: 'Failed to execute privacy erasure',
          },
          500,
        ),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-12345' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )
    await screen.findByText('admin.privacy.objects.requirementVersions')

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.privacy.execute' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.serverExecuteError',
      ),
    )
    const executeButton = screen.getByRole('button', {
      name: 'admin.privacy.execute',
    })
    const executeAlert = screen.getByRole('alert')
    expect(executeAlert).toHaveTextContent('Cannot update responsible_hsa_id')
    expect(
      Boolean(
        executeButton.compareDocumentPosition(executeAlert) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
    expect(screen.queryByText('admin.privacy.status')).toBeNull()
    expect(
      screen.queryByText('admin.privacy.executionStatus.failed'),
    ).toBeNull()
  })

  it('marks only the failed privacy row when execution returns safe row details', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['SEC Säkerhet'],
              allowedActions: ['delete', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              disabledReasonKey: null,
              fieldKey: 'identity',
              key: 'owners.identity',
              objectKey: 'owners',
              recommendedAction: 'delete',
              warningKey: 'ownerDelete',
            },
            {
              affectedReferences: ['INT0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'anonymize',
              warningKey: 'historySwitch',
            },
          ],
          previewToken: 'failed-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 2,
        }),
      )
      .mockResolvedValueOnce(
        errorJson(
          {
            code: 'validation',
            details: {
              groupKey: 'owners.identity',
              reason: 'owner_area_references_blocking',
            },
            error:
              'Requirement areas must be switched before changing the owner identity',
          },
          400,
        ),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const ownerRow = (
      await screen.findByText('admin.privacy.objects.owners')
    ).closest('tr')
    const versionRow = screen
      .getByText('admin.privacy.objects.requirementVersions')
      .closest('tr')

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.privacy.execute' }),
    )

    await waitFor(() =>
      expect(
        screen
          .getAllByRole('alert')
          .some(alert =>
            alert.textContent?.includes('admin.privacy.errorWithDetail'),
          ),
      ).toBe(true),
    )

    expect(screen.getByText('admin.privacy.status')).toBeTruthy()
    expect(ownerRow).toHaveTextContent('admin.privacy.executionStatus.failed')
    expect(ownerRow?.className).toContain('bg-red')
    expect(versionRow).toHaveTextContent('admin.privacy.warnings.historySwitch')
    expect(versionRow).not.toHaveTextContent(
      'admin.privacy.executionStatus.completed',
    )
    expect(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeEnabled()
  })

  it('keeps stale privacy previews in preview mode without row failure status', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock
      .mockResolvedValueOnce(
        okJson({
          groups: [
            {
              affectedReferences: ['INT0001 v1'],
              allowedActions: ['anonymize', 'skip'],
              count: 1,
              currentDisplayValue: 'Kalle Svensson',
              fieldKey: 'createdBy',
              key: 'requirement_versions.created_by',
              objectKey: 'requirementVersions',
              recommendedAction: 'anonymize',
              warningKey: 'historySwitch',
            },
          ],
          previewToken: 'stale-preview-token',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 1,
        }),
      )
      .mockResolvedValueOnce(
        errorJson(
          {
            code: 'conflict',
            error: 'Privacy erasure preview is stale',
          },
          409,
        ),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const versionRow = (
      await screen.findByText('admin.privacy.objects.requirementVersions')
    ).closest('tr')

    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'admin.privacy.execute' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.stalePreview',
      ),
    )

    expect(screen.queryByText('admin.privacy.status')).toBeNull()
    expect(
      screen.queryByText('admin.privacy.executionStatus.failed'),
    ).toBeNull()
    expect(versionRow).toHaveTextContent('admin.privacy.warnings.historySwitch')
    expect(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeEnabled()
  })

  it('disables the owner action row when requirement areas still reference the owner and no replacement exists', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['INT Integration', 'SEC Säkerhet'],
            allowedActions: ['skip'],
            blockingReferences: [
              {
                objectKey: 'requirementAreas',
                values: ['INT Integration', 'SEC Säkerhet'],
              },
            ],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: 'ownerAreaReplacementRequired',
            fieldKey: 'identity',
            key: 'owners.identity',
            objectKey: 'owners',
            recommendedAction: 'skip',
            warningKey: 'ownerSwitch',
          },
          {
            affectedReferences: ['INT Integration', 'SEC Säkerhet'],
            allowedActions: ['switch', 'skip'],
            controlledByGroupKey: 'owners.identity',
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_areas.owner',
            objectKey: 'requirementAreas',
            readOnlyReasonKey: 'controlledByOwner',
            recommendedAction: 'skip',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'owner-blocked-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 2,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const row = await screen.findByText('admin.privacy.objects.owners')
    const ownerRow = row.closest('tr')
    expect(ownerRow).not.toBeNull()
    expect(ownerRow).toHaveAttribute('aria-disabled', 'true')

    const select = within(ownerRow as HTMLTableRowElement).getByRole('combobox')
    expect(select).toBeDisabled()
    expect(
      within(ownerRow as HTMLTableRowElement).getAllByRole('option'),
    ).toHaveLength(1)
    expect(
      within(ownerRow as HTMLTableRowElement).getByRole('option', {
        name: 'admin.privacy.actions.skip',
      }),
    ).toHaveValue('skip')
    expect(ownerRow).toHaveTextContent(
      'admin.privacy.blockers.ownerAreaReplacementRequired',
    )
    const ownerAlert = within(ownerRow as HTMLTableRowElement).getByRole(
      'alert',
    )
    expect(ownerAlert).not.toHaveTextContent('INT Integration')
    expect(ownerAlert).not.toHaveTextContent('SEC Säkerhet')
    expect(ownerRow).toHaveTextContent('INT Integration')
    expect(ownerRow).toHaveTextContent('SEC Säkerhet')

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
    ).closest('tr')
    expect(requirementAreaRow).not.toBeNull()
    expect(requirementAreaRow).toHaveAttribute('aria-disabled', 'true')
    expect(
      within(requirementAreaRow as HTMLTableRowElement).queryByRole('combobox'),
    ).toBeNull()
    expect(requirementAreaRow).toHaveTextContent('admin.privacy.actions.skip')
    expect(requirementAreaRow).toHaveTextContent('INT Integration')
    expect(requirementAreaRow).toHaveTextContent('SEC Säkerhet')
    expect(requirementAreaRow).toHaveTextContent(
      'admin.privacy.readOnly.controlledByOwner',
    )
  })

  it('disables the requirement package owner row when no replacement exists', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['SPR Språkstöd', 'TIL Tillgänglighet'],
            allowedActions: ['skip'],
            count: 2,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: 'ownerPackageReplacementRequired',
            fieldKey: 'owner',
            key: 'requirement_packages.owner',
            objectKey: 'requirementPackages',
            recommendedAction: 'skip',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'package-owner-blocked-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 2,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const row = (
      await screen.findByText('admin.privacy.objects.requirementPackages')
    ).closest('tr')
    expect(row).not.toBeNull()
    expect(row).toHaveAttribute('aria-disabled', 'true')

    const select = within(row as HTMLTableRowElement).getByRole('combobox')
    expect(select).toBeDisabled()
    expect(
      within(row as HTMLTableRowElement).getAllByRole('option'),
    ).toHaveLength(1)
    expect(
      within(row as HTMLTableRowElement).getByRole('option', {
        name: 'admin.privacy.actions.skip',
      }),
    ).toHaveValue('skip')
    expect(row).toHaveTextContent(
      'admin.privacy.blockers.ownerPackageReplacementRequired',
    )
    expect(row).toHaveTextContent('SPR Språkstöd')
    expect(row).toHaveTextContent('TIL Tillgänglighet')
  })

  it('shows only switch and skip for an owner row when a replacement is supplied for linked requirement areas', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['SEC Säkerhet'],
            allowedActions: ['switch', 'skip'],
            blockingReferences: [
              {
                objectKey: 'requirementAreas',
                values: ['SEC Säkerhet'],
              },
            ],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'identity',
            key: 'owners.identity',
            objectKey: 'owners',
            recommendedAction: 'switch',
            warningKey: 'ownerAreaSwitchOnly',
          },
          {
            affectedReferences: ['SEC Säkerhet'],
            allowedActions: ['switch', 'skip'],
            controlledByGroupKey: 'owners.identity',
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_areas.owner',
            objectKey: 'requirementAreas',
            readOnlyReasonKey: 'controlledByOwner',
            recommendedAction: 'switch',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'owner-switch-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 2,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementName'), {
      target: { value: 'John Levi' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const ownerRow = (
      await screen.findByText('admin.privacy.objects.owners')
    ).closest('tr')
    expect(ownerRow).not.toBeNull()

    const select = within(ownerRow as HTMLTableRowElement).getByRole('combobox')
    expect(select).toBeEnabled()
    expect(
      within(ownerRow as HTMLTableRowElement)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['switch', 'skip'])
    expect(ownerRow).not.toHaveTextContent('admin.privacy.actions.anonymize')
    expect(ownerRow).not.toHaveTextContent('admin.privacy.actions.delete')

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
    ).closest('tr')
    expect(requirementAreaRow).not.toBeNull()
    expect(requirementAreaRow).toHaveAttribute('aria-disabled', 'true')
    expect(
      within(requirementAreaRow as HTMLTableRowElement).queryByRole('combobox'),
    ).toBeNull()
    expect(requirementAreaRow).toHaveTextContent('admin.privacy.actions.switch')
    expect(requirementAreaRow).toHaveTextContent('SEC Säkerhet')
    expect(requirementAreaRow).toHaveTextContent(
      'admin.privacy.readOnly.controlledByOwner',
    )
  })

  it('hides switch actions if the replacement HSA-ID is cleared after preview', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['SPR Språkstöd'],
            allowedActions: ['switch', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_packages.owner',
            objectKey: 'requirementPackages',
            recommendedAction: 'switch',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'replacement-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementName'), {
      target: { value: 'John Levi' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const row = (
      await screen.findByText('admin.privacy.objects.requirementPackages')
    ).closest('tr')
    expect(row).not.toBeNull()
    const rowQueries = within(row as HTMLTableRowElement)
    expect(rowQueries.getByRole('combobox')).toHaveValue('switch')
    expect(
      rowQueries.getByRole('option', {
        name: 'admin.privacy.actions.switch',
      }),
    ).toHaveValue('switch')

    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: '' },
    })

    expect(rowQueries.getByRole('combobox')).toHaveValue('skip')
    expect(
      rowQueries.queryByRole('option', {
        name: 'admin.privacy.actions.switch',
      }),
    ).toBeNull()
    expect(
      rowQueries.getByRole('option', {
        name: 'admin.privacy.actions.skip',
      }),
    ).toHaveValue('skip')
  })

  it('shows only delete and skip for an owner row with no linked requirement areas', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: [],
            allowedActions: ['delete', 'skip'],
            count: 1,
            currentDisplayValue: 'Kalle Svensson',
            disabledReasonKey: null,
            fieldKey: 'identity',
            key: 'owners.identity',
            objectKey: 'owners',
            recommendedAction: 'delete',
            warningKey: 'ownerDelete',
          },
        ],
        previewToken: 'owner-delete-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const ownerRow = (
      await screen.findByText('admin.privacy.objects.owners')
    ).closest('tr')
    expect(ownerRow).not.toBeNull()

    const select = within(ownerRow as HTMLTableRowElement).getByRole('combobox')
    expect(select).toBeEnabled()
    expect(
      within(ownerRow as HTMLTableRowElement)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['delete', 'skip'])
    expect(ownerRow).not.toHaveTextContent('admin.privacy.actions.switch')
    expect(ownerRow).not.toHaveTextContent('admin.privacy.actions.anonymize')
  })

  it('explains when privacy preview requires the PrivacyOfficer role', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        code: 'forbidden',
        error: 'PrivacyOfficer role is required',
      }),
      ok: false,
      status: 403,
    } as Response)

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.permissionError',
      ),
    )
  })

  it('explains that replacement switching needs both HSA-ID and name', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce({
      json: async () => ({
        error: 'Invalid request',
        issues: [
          {
            code: 'too_small',
            message: 'Too small: expected string to have >=1 characters',
            path: 'replacement.displayName',
          },
        ],
      }),
      ok: false,
      status: 400,
    } as Response)

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
          initialTerminology={buildUiTerminologyPayload(
            getDefaultUiTerminology(),
          )}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE2321000032-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE2321000032-johlju' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.privacy.replacementIncomplete',
      ),
    )
  })

  it('disables terminology controls while saving and shows an error when the save request fails', async () => {
    const pendingRequest = deferred<Response>()
    fetchMock.mockReturnValueOnce(pendingRequest.promise)

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const localeToggle = screen.getByRole('button', { name: 'admin.english' })
    const resetButton = screen.getByRole('button', {
      name: 'common.resetToDefault',
    })
    const saveButton = screen.getByRole('button', { name: 'common.save' })
    const inputs = screen.getAllByRole('textbox')

    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())

    expect(localeToggle).toBeDisabled()
    expect(resetButton).toBeDisabled()
    expect(inputs[0]).toBeDisabled()

    pendingRequest.reject(new Error('network failed'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.terminologySaveError',
      ),
    )
  })

  it('refreshes the route after a successful terminology save', async () => {
    const updatedTerminology = buildUiTerminologyPayload(
      getDefaultUiTerminology(),
    )
    updatedTerminology[0] = {
      ...updatedTerminology[0],
      sv: {
        ...updatedTerminology[0].sv,
        singular: 'Ny kravtext',
      },
    }
    fetchMock.mockResolvedValueOnce(okJson({ terminology: updatedTerminology }))

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.change(screen.getAllByRole('textbox')[0], {
      target: { value: 'Ny kravtext' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/terminology',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ terminology: updatedTerminology }),
      }),
    )
    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })

  it('restores shipped terminology defaults after a successful save', async () => {
    const updatedTerminology = buildUiTerminologyPayload(
      getDefaultUiTerminology(),
    )
    updatedTerminology[0] = {
      ...updatedTerminology[0],
      sv: {
        ...updatedTerminology[0].sv,
        singular: 'Ny kravtext',
      },
    }
    fetchMock.mockResolvedValueOnce(okJson({ terminology: updatedTerminology }))

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    const singularInput = screen.getAllByRole('textbox')[0]

    fireEvent.change(singularInput, {
      target: { value: 'Ny kravtext' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())
    expect(singularInput).toHaveValue('Ny kravtext')

    fireEvent.click(
      screen.getByRole('button', { name: 'common.resetToDefault' }),
    )

    expect(singularInput).toHaveValue(
      getDefaultUiTerminology().description.sv.singular,
    )
  })

  it('keeps a reordered column layout after a successful save', async () => {
    const reorderedColumns = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'description', defaultVisible: true, sortOrder: 1 },
      { columnId: 'category', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: true, sortOrder: 3 },
      { columnId: 'type', defaultVisible: true, sortOrder: 4 },
      {
        columnId: 'qualityCharacteristic',
        defaultVisible: false,
        sortOrder: 5,
      },
      { columnId: 'status', defaultVisible: true, sortOrder: 6 },
      { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])
    fetchMock.mockResolvedValueOnce(okJson({ columns: reorderedColumns }))

    const { container } = render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))
    fireEvent.click(
      within(screen.getByTestId('admin-column-row-category')).getByRole(
        'button',
        { name: 'admin.moveUp' },
      ),
    )

    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/requirement-columns',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ columns: reorderedColumns }),
      }),
    )
    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])
  })

  it('normalizes duplicate column defaults before toggling and saving', async () => {
    const duplicateColumns: RequirementListColumnDefault[] = [
      ...DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
      {
        columnId: 'category',
        defaultVisible: false,
        sortOrder: DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.length,
      },
    ]
    const normalizedHiddenCategoryColumns =
      normalizeRequirementListColumnDefaults(
        DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS.map(column =>
          column.columnId === 'category'
            ? { ...column, defaultVisible: false }
            : column,
        ),
      )
    fetchMock.mockResolvedValueOnce(
      okJson({ columns: normalizedHiddenCategoryColumns }),
    )

    render(
      <AdminClient
        initialColumnDefaults={duplicateColumns}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))

    const categoryRow = screen.getByTestId('admin-column-row-category')
    const categoryCheckbox = within(categoryRow).getByRole('checkbox')

    expect(categoryCheckbox).toBeChecked()

    fireEvent.click(categoryCheckbox)

    expect(categoryCheckbox).not.toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/requirement-columns',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ columns: normalizedHiddenCategoryColumns }),
      }),
    )
    expect(
      within(screen.getByTestId('admin-column-row-category')).getByRole(
        'checkbox',
      ),
    ).not.toBeChecked()
  })

  it('restores shipped column defaults after a successful save', async () => {
    const reorderedColumns = normalizeRequirementListColumnDefaults([
      { columnId: 'uniqueId', defaultVisible: true, sortOrder: 0 },
      { columnId: 'description', defaultVisible: true, sortOrder: 1 },
      { columnId: 'category', defaultVisible: true, sortOrder: 2 },
      { columnId: 'area', defaultVisible: true, sortOrder: 3 },
      { columnId: 'type', defaultVisible: true, sortOrder: 4 },
      {
        columnId: 'qualityCharacteristic',
        defaultVisible: false,
        sortOrder: 5,
      },
      { columnId: 'status', defaultVisible: true, sortOrder: 6 },
      { columnId: 'requiresTesting', defaultVisible: false, sortOrder: 7 },
      { columnId: 'version', defaultVisible: false, sortOrder: 8 },
    ])
    fetchMock.mockResolvedValueOnce(okJson({ columns: reorderedColumns }))

    const { container } = render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))
    fireEvent.click(
      within(screen.getByTestId('admin-column-row-category')).getByRole(
        'button',
        { name: 'admin.moveUp' },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())
    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])

    fireEvent.click(
      screen.getByRole('button', { name: 'common.resetToDefault' }),
    )

    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'area',
      'category',
      'type',
    ])
  })

  it('shows an error when saving columns fails and reset returns to shipped defaults', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
    } as Response)

    const { container } = render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))
    fireEvent.click(
      within(screen.getByTestId('admin-column-row-category')).getByRole(
        'button',
        { name: 'admin.moveUp' },
      ),
    )

    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'category',
      'area',
      'type',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'admin.columnsSaveError',
      ),
    )

    expect(screen.queryByText('admin.saved')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'common.resetToDefault' }),
    )

    expect(getColumnOrder(container).slice(0, 5)).toEqual([
      'uniqueId',
      'description',
      'area',
      'category',
      'type',
    ])
  })

  it('disables column controls while a save is in progress', async () => {
    const pendingRequest = deferred<Response>()
    fetchMock.mockReturnValueOnce(pendingRequest.promise)

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        initialTerminology={buildUiTerminologyPayload(
          getDefaultUiTerminology(),
        )}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))

    const categoryRow = screen.getByTestId('admin-column-row-category')
    const moveUpButton = within(categoryRow).getByRole('button', {
      name: 'admin.moveUp',
    })
    const defaultVisibleCheckbox = within(categoryRow).getByRole('checkbox')
    const resetButton = screen.getByRole('button', {
      name: 'common.resetToDefault',
    })
    const saveButton = screen.getByRole('button', { name: 'common.save' })

    fireEvent.click(saveButton)

    await waitFor(() => expect(saveButton).toBeDisabled())

    expect(moveUpButton).toBeDisabled()
    expect(defaultVisibleCheckbox).toBeDisabled()
    expect(resetButton).toBeDisabled()

    pendingRequest.resolve(
      okJson({ columns: DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS }),
    )

    await waitFor(() => expect(screen.getByText('admin.saved')).toBeTruthy())
  })
})
