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
import type { ActionAuditLogInitialState } from '@/components/admin/ActionAuditLogView'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import { HelpProvider, useHelp } from '@/components/HelpPanel'
import {
  addMcpMaxRequestBytesSteps,
  MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
} from '@/lib/ai/generation-availability'
import {
  DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS,
  normalizeRequirementListColumnDefaults,
  type RequirementListColumnDefault,
} from '@/lib/requirements/list-view'

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
}))
const searchParamsMock = vi.hoisted(() => ({
  current: new URLSearchParams(),
}))
const fetchMock = vi.fn()
const createObjectURLMock = vi.fn(
  (_blob: Blob | MediaSource) => 'blob:data-subject-export',
)
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
      hsaId: 'SE5560000001-privacy1',
      roles: ['PrivacyOfficer'],
      source: 'oidc',
      sub: 'privacy-sub',
    },
    limitations: [],
    schemaVersion: 'privacy-data-subject-export.v1',
    sources: [],
    subject: {
      hsaId: 'SE5560000001-kalle2',
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
        comment: null,
        createdAt: '2026-05-12T12:00:00.000Z',
        decidedAt: null,
        decidedBy: null,
        decision: 'pending',
        id: TEST_ACCESS_REVIEW_ITEM_ID,
        permissionType: 'area_co_author',
        principal: {
          displayName: 'Kalle Svensson',
          hsaId: 'SE5560000001-kalle1',
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
        hsaId: 'SE5560000001-admin1',
      },
      dueAt: '2026-06-11T12:00:00.000Z',
      externalEvidenceReference: 'IDM-2026',
      id: TEST_ACCESS_REVIEW_RUN_ID,
      periodEnd: '2027-05-12T12:00:00.000Z',
      periodStart: '2026-05-12T12:00:00.000Z',
      reviewer: {
        displayName: 'Ada Admin',
        hsaId: 'SE5560000001-admin1',
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
      hsaId: 'SE5560000001-admin1',
    },
    limitations: [],
    schemaVersion: 'access-review-export.v1',
  }
}

function actionAuditLogState(
  query: ActionAuditLogInitialState['query'] = {
    action: 'requirement.create',
    client_ip: '203.0.113.10',
    page: '2',
    pageSize: '25',
    tab: 'actionAuditLog',
  },
): ActionAuditLogInitialState {
  return {
    query,
    result: {
      events: [
        {
          action: 'requirement.create',
          actorClientId: null,
          actorDisplayName: 'Ada Admin',
          actorHsaId: 'SE5560000001-admin1',
          actorKind: 'user',
          clientIp: '203.0.113.10',
          correlationId: null,
          decision: 'allowed',
          denialReason: null,
          detailsJson: null,
          id: '123',
          occurredAt: '2026-05-12T12:00:00.000Z',
          requestId: 'req-123',
          targetId: '42',
          targetKind: 'requirement',
          targetUniqueId: 'REQ-42',
        },
      ],
      pagination: {
        page: 2,
        pageSize: 25,
        total: 75,
      },
    },
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

async function expectLastCreatedBlobStartsWithUtf8Bom(): Promise<void> {
  const blob = createObjectURLMock.mock.calls[
    createObjectURLMock.mock.calls.length - 1
  ]?.[0] as Blob | undefined
  if (!blob) throw new Error('Expected a downloaded blob')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
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

  it('opens the taxonomy tab from the admin tab query parameter', () => {
    searchParamsMock.current = new URLSearchParams('tab=taxonomy')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    const taxonomyTab = screen.getByRole('tab', {
      name: 'admin.taxonomy',
    })

    expect(taxonomyTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'taxonomy-panel')
  })

  it('opens the statuses and workflows tab from the admin tab query parameter', () => {
    searchParamsMock.current = new URLSearchParams('tab=statusesAndWorkflows')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    const statusesAndWorkflowsTab = screen.getByRole('tab', {
      name: 'admin.statusesAndWorkflows',
    })

    expect(statusesAndWorkflowsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'statusesAndWorkflows-panel',
    )
  })

  it('opens the action log tab from the admin tab query parameter', () => {
    searchParamsMock.current = new URLSearchParams('tab=actionAuditLog')

    render(
      <AdminClient
        actionAuditLog={actionAuditLogState()}
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
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
    expect(screen.queryByText('admin.auditLog.open')).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'admin.auditLog.title' }),
    ).toBeVisible()
    expect(screen.getByLabelText('admin.auditLog.action')).toHaveValue(
      'requirement.create',
    )
    expect(screen.getByLabelText('admin.auditLog.clientIp')).toHaveValue(
      '203.0.113.10',
    )
    expect(
      screen.getByRole('link', { name: 'admin.auditLog.exportCsv' }),
    ).toHaveAttribute(
      'href',
      '/api/admin/audit-events?action=requirement.create&client_ip=203.0.113.10&page=2&pageSize=25&locale=sv&format=csv',
    )
    expect(
      screen.getByRole('link', { name: 'admin.auditLog.clear' }),
    ).toHaveAttribute('href', '/sv/admin?tab=actionAuditLog')
    expect(
      screen.getByRole('link', { name: 'admin.auditLog.previous' }),
    ).toHaveAttribute(
      'href',
      '/sv/admin?tab=actionAuditLog&action=requirement.create&client_ip=203.0.113.10&page=1&pageSize=25',
    )
    expect(
      screen.getByRole('link', { name: 'admin.auditLog.next' }),
    ).toHaveAttribute(
      'href',
      '/sv/admin?tab=actionAuditLog&action=requirement.create&client_ip=203.0.113.10&page=3&pageSize=25',
    )
    expect(screen.getByText('requirement.create')).toBeVisible()
    expect(screen.getByText('REQ-42')).toBeVisible()
  })

  it('shows an action log loading state while tab data is loading', () => {
    searchParamsMock.current = new URLSearchParams('tab=actionAuditLog')

    render(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'id',
      'actionAuditLog-panel',
    )
    expect(screen.getByRole('status')).toHaveTextContent('common.loading')
    expect(screen.queryByText('admin.auditLog.open')).toBeNull()
  })

  it('renders the admin title without the reference data eyebrow', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
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
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.taxonomy' }))

    expect(routerReplace).toHaveBeenCalledWith(
      {
        pathname: '/admin',
        query: { tab: 'taxonomy' },
      },
      { scroll: false },
    )
  })

  it('writes the action log tab to the current history entry', () => {
    render(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
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

  it('loads and saves AI settings from the AI tab', async () => {
    searchParamsMock.current = new URLSearchParams('tab=ai')
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url === '/api/admin/ai-settings' && method === 'GET') {
          return Promise.resolve(
            okJson({
              disabledByEnvironment: true,
              effectiveRequirementGenerationEnabled: false,
              mcpMaxRequestBytes: MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
              requirementGenerationEnabled: true,
            }),
          )
        }
        if (url === '/api/admin/ai-settings' && method === 'PUT') {
          const requestBody = JSON.parse(String(init?.body ?? '{}')) as {
            mcpMaxRequestBytes: number
            requirementGenerationEnabled: boolean
          }
          return Promise.resolve(
            okJson({
              disabledByEnvironment: true,
              effectiveRequirementGenerationEnabled: false,
              mcpMaxRequestBytes: requestBody.mcpMaxRequestBytes,
              requirementGenerationEnabled:
                requestBody.requirementGenerationEnabled,
            }),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
      },
    )

    render(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    expect(
      await screen.findByRole('heading', { name: 'admin.ai.title' }),
    ).toBeVisible()
    expect(screen.getByRole('tab', { name: 'admin.ai.title' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const environmentOverrideNotice = screen.getByText(
      'admin.ai.environmentOverrideNotice',
    )
    expect(environmentOverrideNotice).toBeVisible()
    const requirementGenerationLabel = screen.getByText(
      'admin.ai.requirementGenerationEnabled',
    )
    const securityHeading = screen.getByText('admin.ai.securityTitle')
    const mcpLimitLabel = screen.getByText('admin.ai.mcpMaxRequestLimit')
    expect(securityHeading).toBeVisible()
    expect(mcpLimitLabel).toBeVisible()
    expect(
      screen.queryByText('admin.ai.fieldHelp.mcpMaxRequestLimit'),
    ).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'common.help: admin.ai.mcpMaxRequestLimit',
      }),
    )
    expect(
      screen.getByText('admin.ai.fieldHelp.mcpMaxRequestLimit'),
    ).toBeVisible()
    expect(
      requirementGenerationLabel.compareDocumentPosition(securityHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      requirementGenerationLabel.compareDocumentPosition(
        environmentOverrideNotice,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      environmentOverrideNotice.compareDocumentPosition(securityHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      securityHeading.compareDocumentPosition(mcpLimitLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    const toggle = screen.getByLabelText(
      'admin.ai.requirementGenerationEnabled',
    )
    const mcpLimitInput = screen.getByLabelText('admin.ai.mcpMaxRequestLimit')
    const saveButton = screen.getByRole('button', { name: 'common.save' })
    await waitFor(() => expect(toggle).toBeChecked())
    expect(mcpLimitInput).toHaveValue(1024)
    expect(saveButton).toBeDisabled()

    fireEvent.change(mcpLimitInput, { target: { value: '1080' } })
    expect(mcpLimitInput).toHaveValue(1080)
    expect(saveButton).toBeDisabled()
    fireEvent.keyDown(mcpLimitInput, { key: 'Enter' })
    expect(mcpLimitInput).toHaveValue(1126.4)
    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/ai-settings',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/admin/ai-settings' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect(
      JSON.parse(((putCall?.[1] as RequestInit)?.body as string) ?? '{}'),
    ).toEqual({
      mcpMaxRequestBytes: addMcpMaxRequestBytesSteps(
        MCP_REQUEST_PAYLOAD_DEFAULT_BYTES,
        1,
      ),
      requirementGenerationEnabled: false,
    })
    await waitFor(() => expect(screen.getByText('admin.saved')).toBeVisible())
  })

  it('loads and saves HSA-id prefixes from the identity tab', async () => {
    searchParamsMock.current = new URLSearchParams('tab=identity')
    fetchMock.mockImplementation(
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url === '/api/admin/hsa-id-prefixes' && method === 'GET') {
          return Promise.resolve(
            okJson({
              prefixes: [
                {
                  id: 1,
                  isDefault: true,
                  isUsed: true,
                  isVisible: true,
                  label: null,
                  prefix: 'SE5560000001',
                },
              ],
            }),
          )
        }
        if (url === '/api/admin/hsa-id-prefixes' && method === 'PUT') {
          return Promise.resolve(
            okJson({
              prefixes: [
                {
                  id: 1,
                  isDefault: true,
                  isUsed: true,
                  isVisible: true,
                  label: 'Demo',
                  prefix: 'SE5560000001',
                },
              ],
            }),
          )
        }
        return Promise.reject(new Error(`Unexpected fetch ${method} ${url}`))
      },
    )

    render(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    expect(
      await screen.findByRole('heading', { name: 'admin.identity.title' }),
    ).toBeVisible()
    const saveButton = await screen.findByRole('button', {
      name: 'common.save',
    })
    expect(await screen.findByDisplayValue('SE5560000001')).toBeDisabled()
    expect(saveButton).toBeDisabled()
    expect(saveButton).toHaveAttribute('title', 'common.noChangesToSave')
    fireEvent.change(screen.getByLabelText('admin.identity.label'), {
      target: { value: 'Demo' },
    })
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/hsa-id-prefixes',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/admin/hsa-id-prefixes' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect(
      JSON.parse(((putCall?.[1] as RequestInit)?.body as string) ?? '{}'),
    ).toEqual({
      prefixes: [
        {
          id: 1,
          isDefault: true,
          isVisible: true,
          label: 'Demo',
          prefix: 'SE5560000001',
        },
      ],
    })
    expect(await screen.findByText('admin.saved')).toBeVisible()
  })

  it('renders HSA-id prefix visibility and default as icon controls', async () => {
    searchParamsMock.current = new URLSearchParams('tab=identity')
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/api/admin/hsa-id-prefixes') {
        return Promise.resolve(
          okJson({
            prefixes: [
              {
                id: 1,
                isDefault: true,
                isUsed: true,
                isVisible: true,
                label: null,
                prefix: 'SE5560000001',
              },
              {
                id: 2,
                isDefault: false,
                isUsed: false,
                isVisible: false,
                label: null,
                prefix: 'NO5560000001',
              },
            ],
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`))
    })

    render(
      <AdminClient
        currentUserRoles={['Admin']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    const onlyVisibleToggle = await screen.findByRole('button', {
      name: 'admin.identity.hidePrefix: SE5560000001',
    })
    expect(onlyVisibleToggle).toBeDisabled()

    const hiddenToggle = screen.getByRole('button', {
      name: 'admin.identity.showPrefix: NO5560000001',
    })
    expect(hiddenToggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(hiddenToggle)

    expect(
      screen.getByRole('button', {
        name: 'admin.identity.hidePrefix: NO5560000001',
      }),
    ).toHaveAttribute('aria-pressed', 'true')

    const noDefaultRadio = screen.getByRole('radio', {
      name: 'admin.identity.defaultPrefix: NO5560000001',
    })
    fireEvent.click(noDefaultRadio)
    expect(noDefaultRadio).toBeChecked()
  })

  it('blocks the identity tab without Admin permission', () => {
    searchParamsMock.current = new URLSearchParams('tab=identity')

    render(
      <AdminClient
        currentUserRoles={['PrivacyOfficer']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    const identityTab = screen.getByRole('tab', {
      name: 'admin.identity.title',
    })
    expect(identityTab).toHaveAttribute('aria-disabled', 'true')
    expect(identityTab).toHaveAttribute(
      'title',
      'admin.identity.disabledTooltip',
    )
    expect(identityTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'columns-panel')
  })

  it.each([
    ['tab=accessReview', 'admin.accessReview.title'],
    ['tab=actionAuditLog', 'admin.auditLog.title'],
    ['tab=ai', 'admin.ai.title'],
  ])('falls back from unauthorized admin tab URL %s', (query, tabName) => {
    searchParamsMock.current = new URLSearchParams(query)

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    expect(screen.getByRole('tab', { name: tabName })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'columns-panel')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('removes the admin tab query when returning to the default tab', () => {
    searchParamsMock.current = new URLSearchParams('tab=taxonomy')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.columns' }))

    expect(routerReplace).toHaveBeenCalledWith('/admin', { scroll: false })
  })

  it('renders icon-bearing taxonomy cards that link to the existing pages', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.taxonomy' }))

    const panel = within(screen.getByRole('tabpanel'))

    expect(panel.getByTestId('taxonomy-card-areas')).toHaveAttribute(
      'href',
      '/requirement-areas',
    )
    expect(panel.getByTestId('taxonomy-icon-areas')).toBeTruthy()

    expect(panel.getByTestId('taxonomy-card-categories')).toHaveAttribute(
      'href',
      '/requirement-categories',
    )
    expect(panel.getByTestId('taxonomy-icon-categories')).toBeTruthy()

    expect(panel.getByTestId('taxonomy-card-types')).toHaveAttribute(
      'href',
      '/requirement-types',
    )
    expect(panel.getByTestId('taxonomy-icon-types')).toBeTruthy()

    expect(panel.queryByTestId('taxonomy-card-requirementPackages')).toBeNull()
    expect(panel.queryByTestId('taxonomy-card-normReferences')).toBeNull()

    expect(panel.queryByTestId('taxonomy-card-statuses')).toBeNull()

    expect(
      panel.getByTestId('taxonomy-card-qualityCharacteristics'),
    ).toHaveAttribute('href', '/quality-characteristics')
    expect(
      panel.getByTestId('taxonomy-icon-qualityCharacteristics'),
    ).toBeTruthy()

    expect(panel.getByTestId('taxonomy-card-priorityLevels')).toHaveAttribute(
      'href',
      '/priority-levels',
    )
    expect(panel.getByTestId('taxonomy-icon-priorityLevels')).toBeTruthy()

    expect(
      panel.getByTestId('taxonomy-card-governanceObjectTypes'),
    ).toHaveAttribute('href', '/specifications/governance-object-types')
    expect(
      panel.getByTestId('taxonomy-icon-governanceObjectTypes'),
    ).toBeTruthy()

    expect(
      panel.getByTestId('taxonomy-card-implementationTypes'),
    ).toHaveAttribute('href', '/specifications/implementation-types')
    expect(panel.getByTestId('taxonomy-icon-implementationTypes')).toBeTruthy()

    expect(panel.queryByTestId('taxonomy-card-lifecycleStatuses')).toBeNull()
    expect(
      panel.queryByTestId('taxonomy-card-specificationItemStatuses'),
    ).toBeNull()
    expect(panel.queryByTestId('taxonomy-card-areaOwners')).toBeNull()
    expect(panel.queryByTestId('taxonomy-icon-areaOwners')).toBeNull()

    const cardTexts = panel.getAllByRole('link').map(link => ({
      description: link.querySelector('p')?.textContent,
      title: link.querySelector('h3')?.textContent,
    }))
    expect(cardTexts).toEqual([
      { title: 'nav.areas', description: 'admin.areasDescription' },
      { title: 'nav.categories', description: 'admin.categoriesDescription' },
      {
        title: 'nav.governanceObjectTypes',
        description: 'admin.governanceObjectTypesDescription',
      },
      {
        title: 'nav.implementationTypes',
        description: 'admin.implementationTypesDescription',
      },
      {
        title: 'nav.priorityLevels',
        description: 'admin.priorityLevelsDescription',
      },
      {
        title: 'nav.qualityCharacteristics',
        description: 'admin.qualityAttributesDescription',
      },
      { title: 'nav.types', description: 'admin.typesDescription' },
    ])
  })

  it('renders statuses and workflow cards separately from taxonomy', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    fireEvent.click(
      screen.getByRole('tab', { name: 'admin.statusesAndWorkflows' }),
    )

    const panel = within(screen.getByRole('tabpanel'))

    expect(
      panel.getByTestId('statuses-workflows-card-statuses'),
    ).toHaveAttribute('href', '/requirement-statuses')
    expect(panel.getByTestId('statuses-workflows-icon-statuses')).toBeTruthy()

    expect(
      panel.getByTestId('statuses-workflows-card-lifecycleStatuses'),
    ).toHaveAttribute('href', '/specifications/lifecycle-statuses')
    expect(
      panel.getByTestId('statuses-workflows-icon-lifecycleStatuses'),
    ).toBeTruthy()

    expect(
      panel.getByTestId('statuses-workflows-card-specificationItemStatuses'),
    ).toHaveAttribute('href', '/specification-item-statuses')
    expect(
      panel.getByTestId('statuses-workflows-icon-specificationItemStatuses'),
    ).toBeTruthy()

    expect(panel.queryByTestId('statuses-workflows-card-categories')).toBeNull()
    const cardTexts = panel.getAllByRole('link').map(link => ({
      description: link.querySelector('p')?.textContent,
      title: link.querySelector('h3')?.textContent,
    }))
    expect(cardTexts).toEqual([
      {
        title: 'nav.lifecycleStatuses',
        description: 'admin.lifecycleStatusesDescription',
      },
      {
        title: 'nav.specificationItemStatuses',
        description: 'admin.specificationItemStatusesDescription',
      },
      { title: 'nav.statuses', description: 'admin.statusesDescription' },
    ])
  })

  it('exposes the admin tabs through a tablist and updates selection on click', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    const columnsTab = screen.getByRole('tab', { name: 'admin.columns' })
    const taxonomyTab = screen.getByRole('tab', {
      name: 'admin.taxonomy',
    })

    expect(columnsTab.parentElement).toHaveAttribute('role', 'tablist')
    expect(columnsTab).toHaveAttribute('aria-selected', 'true')
    expect(taxonomyTab).toHaveAttribute('aria-selected', 'false')

    fireEvent.click(taxonomyTab)

    expect(taxonomyTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'taxonomy-panel')
  })

  it('exposes admin tabs with accessible selection state', () => {
    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    const columnsTab = screen.getByRole('tab', { name: 'admin.columns' })
    const taxonomyTab = screen.getByRole('tab', {
      name: 'admin.taxonomy',
    })

    expect(columnsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'columns-panel')
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'columns-tab',
    )

    fireEvent.click(taxonomyTab)

    expect(taxonomyTab).toHaveAttribute('aria-controls', 'taxonomy-panel')
    expect(taxonomyTab).toHaveAttribute('aria-selected', 'true')
  })

  it('switches the header help content when the privacy tab is selected', async () => {
    render(
      <HelpProvider>
        <ConfirmModalProvider>
          <AdminClient
            currentUserRoles={['PrivacyOfficer']}
            initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
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

  it('switches the header help content when the identity tab is selected', async () => {
    fetchMock.mockResolvedValue(okJson({ prefixes: [] }))

    renderWithConfirmModal(
      <HelpProvider>
        <AdminClient
          currentUserRoles={['Admin']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        />
        <HelpContentProbe />
      </HelpProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('help-title')).toHaveTextContent('admin.title'),
    )

    fireEvent.click(screen.getByRole('tab', { name: 'admin.identity.title' }))

    await waitFor(() =>
      expect(screen.getByTestId('help-title')).toHaveTextContent(
        'adminIdentity.title',
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

  it('blocks the access review tab without Admin or PrivacyOfficer permission', () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')

    renderWithConfirmModal(
      <AdminClient
        currentUserRoles={['Reviewer']}
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    const accessReviewTab = screen.getByRole('tab', {
      name: 'admin.accessReview.title',
    })

    expect(accessReviewTab).toHaveAttribute('aria-disabled', 'true')
    expect(accessReviewTab).toHaveAttribute(
      'title',
      'admin.accessReview.disabledTooltip',
    )
    expect(accessReviewTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'columns-panel')
    expect(screen.queryByText('Kalle Svensson')).toBeNull()

    fireEvent.click(accessReviewTab)

    expect(routerReplace).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps a row in place when locking a saved access review decision', async () => {
    searchParamsMock.current = new URLSearchParams('tab=accessReview')
    const baseDetail = accessReviewDetail()
    const annaItem = {
      ...baseDetail.items[0],
      id: 8,
      principal: {
        displayName: 'Anna Johansson',
        hsaId: 'SE5560000001-annaj',
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
            hsaId: 'SE5560000001-annaj',
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
    await expectLastCreatedBlobStartsWithUtf8Bom()
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
          hsaId: 'SE5560000001-admin1',
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

  it('dims and disables privileged tabs without Admin or PrivacyOfficer roles', () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')

    render(
      <AdminClient
        initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
      />,
    )

    const disabledTabs = [
      ['admin.accessReview.title', 'admin.accessReview.disabledTooltip'],
      ['admin.ai.title', 'admin.ai.disabledTooltip'],
      ['admin.archiving.title', 'admin.archiving.disabledTooltip'],
      ['admin.privacy.title', 'admin.privacy.disabledTooltip'],
      ['admin.auditLog.title', 'admin.auditLog.disabledTooltip'],
    ] as const

    for (const [name, tooltip] of disabledTabs) {
      const tab = screen.getByRole('tab', { name })

      expect(tab).toHaveAttribute('aria-disabled', 'true')
      expect(tab).toHaveAttribute('title', tooltip)
      expect(tab).toHaveAttribute('aria-selected', 'false')

      fireEvent.click(tab)
    }

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'columns-panel')
    expect(screen.queryByLabelText('admin.privacy.targetHsaId')).toBeNull()

    expect(routerReplace).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows PrivacyOfficer to use access review, archiving, and privacy tabs', async () => {
    mockAccessReviewApi()

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        />
      </ConfirmModalProvider>,
    )

    const accessReviewTab = screen.getByRole('tab', {
      name: 'admin.accessReview.title',
    })
    const archivingTab = screen.getByRole('tab', {
      name: 'admin.archiving.title',
    })
    const privacyTab = screen.getByRole('tab', {
      name: 'admin.privacy.title',
    })
    const actionAuditLogTab = screen.getByRole('tab', {
      name: 'admin.auditLog.title',
    })
    const aiTab = screen.getByRole('tab', {
      name: 'admin.ai.title',
    })

    expect(actionAuditLogTab).toHaveAttribute('aria-disabled', 'true')
    expect(actionAuditLogTab).toHaveAttribute(
      'title',
      'admin.auditLog.disabledTooltip',
    )
    expect(aiTab).toHaveAttribute('aria-disabled', 'true')
    expect(aiTab).toHaveAttribute('title', 'admin.ai.disabledTooltip')

    fireEvent.click(accessReviewTab)
    expect(await screen.findByText('Kalle Svensson')).toBeVisible()
    expect(accessReviewTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(privacyTab)
    expect(screen.getByLabelText('admin.privacy.targetHsaId')).toBeTruthy()
    expect(privacyTab).toHaveAttribute('aria-selected', 'true')

    fireEvent.click(archivingTab)
    expect(
      await screen.findByText('admin.archiving.retention.title'),
    ).toBeTruthy()
    expect(archivingTab).toHaveAttribute('aria-selected', 'true')

    routerReplace.mockClear()
    fireEvent.click(actionAuditLogTab)

    expect(routerReplace).not.toHaveBeenCalled()
    expect(actionAuditLogTab).toHaveAttribute('aria-selected', 'false')
  })

  it('shows inline help for each privacy form field', () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
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
    await expectLastCreatedBlobStartsWithUtf8Bom()
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

  it('previews duplicate-name privacy erasure by HSA-id instead of name', async () => {
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
      target: { value: 'SE5560000001-kalle2' },
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
              hsaId: 'SE5560000001-kalle2',
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle2' },
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
            target: { hsaId: 'SE5560000001-kalle2' },
          }),
          method: 'POST',
        }),
      ),
    )
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    await expectLastCreatedBlobStartsWithUtf8Bom()
    expect(anchorClickMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:data-subject-export')
  })

  it('shows a preview export error when personal data access export fails', async () => {
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle2' },
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
        />
      </ConfirmModalProvider>,
    )

    expect(
      screen.queryByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeNull()

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-johlju' },
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-12345' },
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
              currentDisplayValue: 'SE5560000001-kalle1',
              disabledReasonKey: null,
              fieldKey: 'owner',
              key: 'requirement_areas.owner',
              objectKey: 'requirementAreas',
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
          totalCount: 2,
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          actions: { anonymize: 0, delete: 0, skip: 1, switch: 1 },
          groups: [],
          requestId: 'erasure-request-1',
          targetFingerprint: '0123456789abcdef0123456789abcdef',
          totalCount: 2,
        }),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE5560000001-johlju' },
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

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [executeUrl, executeInit] = fetchMock.mock.calls.at(-1) ?? []
    expect(executeUrl).toBe('/api/privacy/erasure-requests')
    expect(executeInit).toEqual(expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(String((executeInit as RequestInit).body))).toEqual({
      actions: {
        'requirement_areas.owner': 'switch',
        'requirement_versions.created_by': 'skip',
      },
      previewToken: 'execution-preview-token',
      replacement: {
        displayName: 'John Carl Levi',
        email: 'john.levi@example.com',
        firstName: 'John Carl',
        hsaId: 'SE5560000001-johlju',
        lastName: 'Levi',
      },
      target: { hsaId: 'SE5560000001-kalle1' },
    })

    expect(screen.getByText('admin.privacy.status')).toBeTruthy()
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

  it('clears stale privacy preview rows when the target HSA-id changes', async () => {
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
        />
      </ConfirmModalProvider>,
    )

    const targetInput = screen.getByLabelText('admin.privacy.targetHsaId')
    fireEvent.change(targetInput, {
      target: { value: 'SE5560000001-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    await screen.findByText('admin.privacy.objects.requirementVersions')
    expect(
      screen.getByRole('button', { name: 'admin.privacy.execute' }),
    ).toBeTruthy()

    fireEvent.change(targetInput, {
      target: { value: 'SE5560000001-kalle2' },
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-12345' },
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
              allowedActions: ['switch', 'skip'],
              count: 1,
              currentDisplayValue: 'SE5560000001-kalle1',
              disabledReasonKey: null,
              fieldKey: 'owner',
              key: 'requirement_areas.owner',
              objectKey: 'requirementAreas',
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
              groupKey: 'requirement_areas.owner',
              reason: 'unsupported_privacy_action',
            },
            error: 'The row does not support the selected action.',
          },
          400,
        ),
      )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
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
    expect(requirementAreaRow).toHaveTextContent(
      'admin.privacy.executionStatus.failed',
    )
    expect(requirementAreaRow?.className).toContain('bg-red')
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
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

  it('offers only skip for requirement area owner rows when no replacement exists', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: ['INT Integration', 'SEC Säkerhet'],
            allowedActions: ['skip'],
            count: 1,
            currentDisplayValue: 'SE5560000001-kalle1',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_areas.owner',
            objectKey: 'requirementAreas',
            recommendedAction: 'skip',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'owner-blocked-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
    ).closest('tr')
    expect(requirementAreaRow).not.toBeNull()
    const select = within(requirementAreaRow as HTMLTableRowElement).getByRole(
      'combobox',
    )
    expect(select).toBeEnabled()
    expect(
      within(requirementAreaRow as HTMLTableRowElement).getAllByRole('option'),
    ).toHaveLength(1)
    expect(requirementAreaRow).toHaveTextContent('admin.privacy.actions.skip')
    expect(requirementAreaRow).toHaveTextContent('INT Integration')
    expect(requirementAreaRow).toHaveTextContent('SEC Säkerhet')
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
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
            count: 1,
            currentDisplayValue: 'SE5560000001-kalle1',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_areas.owner',
            objectKey: 'requirementAreas',
            recommendedAction: 'switch',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'owner-switch-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE5560000001-johlju' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementName'), {
      target: { value: 'John Levi' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
    ).closest('tr')
    expect(requirementAreaRow).not.toBeNull()

    const select = within(requirementAreaRow as HTMLTableRowElement).getByRole(
      'combobox',
    )
    expect(select).toBeEnabled()
    expect(
      within(requirementAreaRow as HTMLTableRowElement)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['switch', 'skip'])
    expect(requirementAreaRow).not.toHaveTextContent(
      'admin.privacy.actions.anonymize',
    )
    expect(requirementAreaRow).not.toHaveTextContent(
      'admin.privacy.actions.delete',
    )
    expect(requirementAreaRow).toHaveTextContent('admin.privacy.actions.switch')
    expect(requirementAreaRow).toHaveTextContent('SEC Säkerhet')
  })

  it('hides switch actions if the replacement HSA-id is cleared after preview', async () => {
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE5560000001-johlju' },
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

  it('shows only skip for a requirement area owner row without replacement', async () => {
    searchParamsMock.current = new URLSearchParams('tab=privacy')
    fetchMock.mockResolvedValueOnce(
      okJson({
        groups: [
          {
            affectedReferences: [],
            allowedActions: ['skip'],
            count: 1,
            currentDisplayValue: 'SE5560000001-kalle1',
            disabledReasonKey: null,
            fieldKey: 'owner',
            key: 'requirement_areas.owner',
            objectKey: 'requirementAreas',
            recommendedAction: 'skip',
            warningKey: 'liveAssignment',
          },
        ],
        previewToken: 'area-owner-skip-preview-token',
        targetFingerprint: '0123456789abcdef0123456789abcdef',
        totalCount: 1,
      }),
    )

    render(
      <ConfirmModalProvider>
        <AdminClient
          currentUserRoles={['PrivacyOfficer']}
          initialColumnDefaults={DEFAULT_REQUIREMENT_LIST_COLUMN_DEFAULTS}
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'admin.privacy.preview' }),
    )

    const requirementAreaRow = (
      await screen.findByText('admin.privacy.objects.requirementAreas')
    ).closest('tr')
    expect(requirementAreaRow).not.toBeNull()

    const select = within(requirementAreaRow as HTMLTableRowElement).getByRole(
      'combobox',
    )
    expect(select).toBeEnabled()
    expect(
      within(requirementAreaRow as HTMLTableRowElement)
        .getAllByRole('option')
        .map(option => option.getAttribute('value')),
    ).toEqual(['skip'])
    expect(requirementAreaRow).not.toHaveTextContent(
      'admin.privacy.actions.switch',
    )
    expect(requirementAreaRow).not.toHaveTextContent(
      'admin.privacy.actions.delete',
    )
    expect(requirementAreaRow).not.toHaveTextContent(
      'admin.privacy.actions.anonymize',
    )
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
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

  it('explains that replacement switching needs both HSA-id and name', async () => {
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
        />
      </ConfirmModalProvider>,
    )

    fireEvent.change(screen.getByLabelText('admin.privacy.targetHsaId'), {
      target: { value: 'SE5560000001-kalle1' },
    })
    fireEvent.change(screen.getByLabelText('admin.privacy.replacementHsaId'), {
      target: { value: 'SE5560000001-johlju' },
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

    render(<AdminClient initialColumnDefaults={duplicateColumns} />)

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

    expect(saveButton).toBeDisabled()
    fireEvent.click(moveUpButton)
    expect(saveButton).toBeEnabled()
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
