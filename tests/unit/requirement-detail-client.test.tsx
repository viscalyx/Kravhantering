import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ForwardedRef, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementDetailClient from '@/app/[locale]/kravkatalog/[id]/requirement-detail-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'

const routerPush = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => {
    const translations: Record<
      string,
      string | ((values?: Record<string, string>) => string)
    > = {
      'common.archive': 'Archive',
      'common.archiveTooltip': 'Archive requirement',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.confirm': 'Confirm',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.editTooltip': 'Edit requirement',
      'common.loading': 'Loading',
      'common.no': 'No',
      'common.noResults': 'No results',
      'common.reactivate': 'Reactivate',
      'common.restoreVersion': 'Restore version',
      'common.copied': 'Copied',
      'common.share': 'Share',
      'common.version': 'Version',
      'requirement.acceptanceCriteria': 'Acceptance criteria',
      'requirement.archiveConfirm': 'Archive this requirement?',
      'requirement.archiveInitiateConfirm':
        'Initiate archiving review for this requirement?',
      'requirement.approveArchiving': 'Approve Archiving',
      'requirement.approveArchivingConfirm':
        'Archive this requirement? This is final.',
      'requirement.approveArchivingTooltip': 'Approve archiving',
      'requirement.cancelArchiving': 'Cancel Archiving',
      'requirement.cancelArchivingConfirm':
        'Cancel archiving and return to Published?',
      'requirement.cancelArchivingTooltip': 'Cancel archiving',
      'requirement.area': 'Area',
      'requirement.backToLatest': 'Back to latest',
      'requirement.category': 'Category',
      'requirement.deleteDraftConfirm': 'Delete this draft?',
      'requirement.description': 'Description',
      'requirement.draftVersionAvailableBanner': values =>
        `Draft version v${values?.version} is available`,
      'requirement.displayedVersion': 'Displayed version',
      'requirement.pendingVersionBanner': values =>
        `Pending version v${values?.version} ${values?.status}`,
      'requirement.publishedVersionAvailableBanner': values =>
        `Published version v${values?.version} is available`,
      'requirement.noPublishedVersion':
        'There is no published version of this requirement.',
      'requirement.publishConfirm': 'Publish this requirement?',
      'requirement.reactivateConfirm': 'Reactivate this requirement?',
      'requirement.reference': 'Reference',
      'requirement.reviewVersionAvailableBanner': values =>
        `Review version v${values?.version} is available`,
      'requirement.requiresTesting': 'Requires testing',
      'requirement.restoreConfirm': 'Restore this version?',
      'requirement.scenario': 'Scenario',
      'requirement.shareLinkInline': 'Copy link (list view)',
      'requirement.shareLinkPage': 'Copy link (detail page)',
      'requirement.sendBackToDraftConfirm': 'Send back to draft?',
      'requirement.transitionToGranskning': 'Send to review',
      'requirement.transitionToPublicerad': 'Publish',
      'requirement.transitionToUtkast': 'Send back to draft',
      'requirement.type': 'Type',
      'requirement.qualityCharacteristic': 'Quality characteristic',
      'requirement.viewingOlderVersion': values =>
        `Viewing older version v${values?.version}`,
    }

    return (key: string, values?: Record<string, string>) => {
      const entry = translations[`${namespace}.${key}`]
      if (typeof entry === 'function') return entry(values)
      return entry ?? `${namespace}.${key}`
    }
  },
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode
    href: string
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: routerPush }),
}))

vi.mock('@/components/StatusStepper', () => ({
  default: ({
    developerModeContext,
    currentStatusId,
    statuses,
  }: {
    developerModeContext?: string
    currentStatusId: number
    statuses: { id: number }[]
  }) => (
    <div
      data-developer-mode-context={developerModeContext}
      data-testid="status-stepper"
    >
      {`status:${currentStatusId};count:${statuses.length}`}
    </div>
  ),
}))

vi.mock('@/components/VersionHistory', () => {
  const React = require('react')

  return {
    default: React.forwardRef(function MockVersionHistory(
      {
        developerModeContext,
        onVersionSelect,
        versions,
      }: {
        developerModeContext?: string
        onVersionSelect: (versionNumber: number) => void
        versions: { id: number; versionNumber: number }[]
      },
      ref: ForwardedRef<HTMLDivElement>,
    ) {
      return (
        <div
          data-developer-mode-context={developerModeContext}
          data-testid="version-history"
          ref={ref}
        >
          {versions.map(version => (
            <button
              data-version-number={version.versionNumber}
              key={version.id}
              onClick={() => onVersionSelect(version.versionNumber)}
              type="button"
            >
              {`v${version.versionNumber}`}
            </button>
          ))}
        </div>
      )
    }),
  }
})

function makeVersion(
  versionNumber: number,
  overrides: Partial<{
    acceptanceCriteria: string | null
    archiveInitiatedAt: string | null
    archivedAt: string | null
    category: { nameEn: string; nameSv: string } | null
    description: string | null
    editedAt: string | null
    publishedAt: string | null
    references: { id: number; name: string; uri: string | null }[]
    requiresTesting: boolean
    status: number
    statusColor: string | null
    statusNameEn: string | null
    statusNameSv: string | null
    type: { nameEn: string; nameSv: string } | null
    qualityCharacteristic: { nameEn: string; nameSv: string } | null
    versionScenarios: {
      scenario: { id: number; nameEn: string; nameSv: string }
    }[]
  }> = {},
) {
  return {
    acceptanceCriteria: `Acceptance ${versionNumber}`,
    archiveInitiatedAt: null,
    archivedAt: null,
    category: null,
    createdAt: `2026-03-${String(versionNumber).padStart(2, '0')}`,
    description: `Description ${versionNumber}`,
    editedAt: null,
    id: versionNumber,
    ownerName: 'Owner',
    publishedAt: null,
    references: [],
    requiresTesting: false,
    status: 1,
    statusColor: '#3b82f6',
    statusNameEn: 'Draft',
    statusNameSv: 'Utkast',
    type: null,
    qualityCharacteristic: null,
    versionNumber,
    versionScenarios: [],
    ...overrides,
  }
}

function makeRequirement(
  versions: ReturnType<typeof makeVersion>[],
  overrides: Partial<{
    area: { name: string } | null
    id: number
    isArchived: boolean
    uniqueId: string
  }> = {},
) {
  return {
    area: { name: 'Core platform' },
    id: 123,
    isArchived: false,
    uniqueId: 'REQ-123',
    versions,
    ...overrides,
  }
}

const draftStatus = {
  color: '#3b82f6',
  id: 1,
  nameEn: 'Draft',
  nameSv: 'Utkast',
  sortOrder: 1,
}
const reviewStatus = {
  color: '#eab308',
  id: 2,
  nameEn: 'Review',
  nameSv: 'Granskning',
  sortOrder: 2,
}
const publishedStatus = {
  color: '#22c55e',
  id: 3,
  nameEn: 'Published',
  nameSv: 'Publicerad',
  sortOrder: 3,
}
const archivedStatus = {
  color: '#6b7280',
  id: 4,
  nameEn: 'Archived',
  nameSv: 'Arkiverad',
  sortOrder: 4,
}

const statusesPayload = {
  statuses: [publishedStatus, archivedStatus, draftStatus, reviewStatus],
  transitions: [
    { fromStatus: draftStatus, toStatus: reviewStatus },
    { fromStatus: reviewStatus, toStatus: draftStatus },
    { fromStatus: reviewStatus, toStatus: publishedStatus },
    { fromStatus: publishedStatus, toStatus: reviewStatus },
    { fromStatus: reviewStatus, toStatus: archivedStatus },
  ],
}

function response(body: unknown, ok = true) {
  return {
    json: async () => structuredClone(body),
    ok,
  } as Response
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => {
    resolve = resolver
  })

  return { promise, resolve }
}

function setupFetch({
  deleteDraftNextRequirement,
  deleteDraftResponse = { deleted: 'version' },
  initialRequirement,
  needsReferencesHandler,
  packages = [],
  reactivateNextRequirement,
  restoreNextRequirement,
  transitionNextRequirement,
}: {
  deleteDraftNextRequirement?: ReturnType<typeof makeRequirement>
  deleteDraftResponse?: { deleted?: string }
  initialRequirement: ReturnType<typeof makeRequirement>
  needsReferencesHandler?: (
    packageId: string,
    signal?: AbortSignal,
  ) => Promise<Response> | Response
  packages?: { id: number; name: string }[]
  reactivateNextRequirement?: ReturnType<typeof makeRequirement>
  restoreNextRequirement?: ReturnType<typeof makeRequirement>
  transitionNextRequirement?: ReturnType<typeof makeRequirement>
}) {
  let currentRequirement = structuredClone(initialRequirement)

  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'

      if (url === '/api/requirement-statuses') {
        return response(statusesPayload)
      }

      if (
        url === `/api/requirements/${currentRequirement.id}` &&
        method === 'GET'
      ) {
        return response(currentRequirement)
      }

      if (
        url === `/api/requirements/${currentRequirement.id}` &&
        method === 'DELETE'
      ) {
        return response({})
      }

      if (
        url === `/api/requirements/${currentRequirement.id}/delete-draft` &&
        method === 'POST'
      ) {
        if (deleteDraftNextRequirement) {
          currentRequirement = structuredClone(deleteDraftNextRequirement)
        }
        return response(deleteDraftResponse)
      }

      if (
        url === `/api/requirements/${currentRequirement.id}/transition` &&
        method === 'POST'
      ) {
        if (transitionNextRequirement) {
          currentRequirement = structuredClone(transitionNextRequirement)
        }
        return response({})
      }

      if (
        url === `/api/requirements/${currentRequirement.id}/restore` &&
        method === 'POST'
      ) {
        if (restoreNextRequirement) {
          currentRequirement = structuredClone(restoreNextRequirement)
        }
        return response({})
      }

      if (
        url === `/api/requirements/${currentRequirement.id}/reactivate` &&
        method === 'POST'
      ) {
        if (reactivateNextRequirement) {
          currentRequirement = structuredClone(reactivateNextRequirement)
        }
        return response({})
      }

      if (url === '/api/requirement-packages' && method === 'GET') {
        return response({ packages })
      }

      const needsReferencesMatch = url.match(
        /^\/api\/requirement-packages\/([^/]+)\/needs-references$/,
      )
      if (needsReferencesMatch) {
        if (needsReferencesHandler) {
          return needsReferencesHandler(
            needsReferencesMatch[1] ?? '',
            init?.signal ?? undefined,
          )
        }
        return response({ needsReferences: [] })
      }

      if (
        method === 'POST' &&
        /^\/api\/requirement-packages\/[^/]+\/items$/.test(url)
      ) {
        return response({})
      }

      throw new Error(`Unhandled fetch: ${method} ${url}`)
    },
  )

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderSubject(
  props?: Partial<ComponentProps<typeof RequirementDetailClient>>,
) {
  return render(
    <ConfirmModalProvider>
      <RequirementDetailClient requirementId={123} {...props} />
    </ConfirmModalProvider>,
  )
}

describe('RequirementDetailClient', () => {
  beforeEach(() => {
    routerPush.mockReset()

    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        disconnect() {}
        observe() {}
      },
    )
    vi.stubGlobal(
      'MutationObserver',
      class MutationObserver {
        disconnect() {}
        observe() {}
      },
    )
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the inline loading state while the requirement request is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )

    renderSubject({ inline: true })

    expect(screen.getByText('Loading')).toBeInTheDocument()
  })

  it('exposes developer-mode metadata for inline detail sections, actions, and nested surfaces', async () => {
    const requirement = makeRequirement([
      makeVersion(3, {
        description: 'Draft description',
        requiresTesting: false,
        status: 1,
        statusColor: '#3b82f6',
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
      }),
      makeVersion(2, {
        acceptanceCriteria: 'Published acceptance',
        description: 'Published description',
        publishedAt: '2026-03-02',
        references: [
          { id: 1, name: 'API spec', uri: 'https://example.com/spec' },
        ],
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        versionScenarios: [
          {
            scenario: { id: 1, nameEn: 'Ordering', nameSv: 'Bestallning' },
          },
        ],
      }),
    ])

    setupFetch({ initialRequirement: requirement })

    renderSubject({ inline: true })

    expect(await screen.findByText('Published description')).toBeInTheDocument()

    const detailContext = 'requirements table > inline detail pane: REQ-123'
    expect(
      screen
        .getByText('Published description')
        .closest('[data-developer-mode-name="detail section"]'),
    ).toHaveAttribute('data-developer-mode-context', detailContext)
    expect(
      screen
        .getByText('Published description')
        .closest('[data-developer-mode-name="detail section"]'),
    ).toHaveAttribute('data-developer-mode-value', 'requirement text')
    expect(
      screen
        .getByText('Published acceptance')
        .closest('[data-developer-mode-name="detail section"]'),
    ).toHaveAttribute('data-developer-mode-value', 'acceptance criteria')
    expect(
      screen
        .getByText('API spec')
        .closest('[data-developer-mode-name="reference item"]'),
    ).toHaveAttribute(
      'data-developer-mode-context',
      `${detailContext} > detail section: references`,
    )
    expect(
      screen
        .getByText('Bestallning')
        .closest('[data-developer-mode-name="scenario chip"]'),
    ).toHaveAttribute('data-developer-mode-value', 'Ordering')
    // Edit button is disabled (pending draft exists above published)
    const editBtn = screen.getByRole('button', { name: 'Edit' })
    expect(editBtn).toBeDisabled()
    expect(screen.getByTestId('status-stepper')).toHaveAttribute(
      'data-developer-mode-context',
      detailContext,
    )
    expect(screen.getByTestId('version-history')).toHaveAttribute(
      'data-developer-mode-context',
      detailContext,
    )
  })

  it('shows type and quality characteristic in the detail view when present', async () => {
    const requirement = makeRequirement([
      makeVersion(1, {
        description: 'Test description',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        type: { nameEn: 'Functional', nameSv: 'Funktionellt' },
        qualityCharacteristic: {
          nameEn: 'Maintainability',
          nameSv: 'Underhållbarhet',
        },
      }),
    ])

    setupFetch({ initialRequirement: requirement })
    renderSubject({ inline: true })

    expect(await screen.findByText('Test description')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Funktionellt')).toBeInTheDocument()
    expect(screen.getByText('Quality characteristic')).toBeInTheDocument()
    expect(screen.getByText('Underhållbarhet')).toBeInTheDocument()
    expect(
      screen
        .getByText('Type')
        .closest('[data-developer-mode-name="detail section"]'),
    ).toHaveAttribute('data-developer-mode-value', 'type')
    expect(
      screen
        .getByText('Quality characteristic')
        .closest('[data-developer-mode-name="detail section"]'),
    ).toHaveAttribute('data-developer-mode-value', 'quality characteristic')
  })

  it('renders the empty modal state when the requirement request fails', async () => {
    const onClose = vi.fn()

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({}, false)),
    )

    renderSubject({ onClose })

    expect(await screen.findByText('No results')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders the published display version, switches history views, and restores an older version', async () => {
    const onChange = vi.fn()
    const requirement = makeRequirement([
      makeVersion(3, {
        description: 'Draft description',
        requiresTesting: false,
        status: 1,
        statusColor: '#3b82f6',
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
      }),
      makeVersion(2, {
        category: { nameEn: 'Category', nameSv: 'Kategori' },
        description: 'Published description',
        publishedAt: '2026-03-02',
        references: [
          { id: 1, name: 'API spec', uri: 'https://example.com/spec' },
        ],
        requiresTesting: true,
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        type: { nameEn: 'Functional', nameSv: 'Funktionell' },
        qualityCharacteristic: { nameEn: 'Business', nameSv: 'Verksamhet' },
        versionScenarios: [
          {
            scenario: { id: 1, nameEn: 'Ordering', nameSv: 'Bestallning' },
          },
        ],
      }),
      makeVersion(1, {
        archivedAt: '2026-03-01',
        description: 'Archived description',
        requiresTesting: false,
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
    ])

    setupFetch({
      initialRequirement: requirement,
      restoreNextRequirement: requirement,
    })

    renderSubject({ onChange })

    expect(await screen.findByText('Published description')).toBeInTheDocument()
    expect(screen.getByText(/Pending version v3 Utkast/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'API spec' })).toHaveAttribute(
      'href',
      'https://example.com/spec',
    )
    expect(screen.getByText('Bestallning')).toBeInTheDocument()
    expect(screen.getByText('Core platform')).toBeInTheDocument()
    expect(screen.getByText('Kategori')).toBeInTheDocument()
    expect(screen.getByText('Funktionell')).toBeInTheDocument()
    expect(screen.getByText('Verksamhet')).toBeInTheDocument()
    // Edit button is disabled because there's a pending draft version above published
    const editBtn = screen.getByRole('button', { name: 'Edit' })
    expect(editBtn).toBeDisabled()
    expect(editBtn).toHaveAttribute(
      'title',
      'requirement.editBlockedByPendingWork',
    )
    expect(screen.queryByText('No')).toBeNull()
    expect(screen.getByTestId('status-stepper')).toHaveTextContent(
      'status:3;count:3',
    )

    await userEvent.click(screen.getByRole('button', { name: 'v1' }))

    expect(screen.getByText('Archived description')).toBeInTheDocument()
    expect(
      screen.getByText(/Published version v2 is available/),
    ).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Back to latest' }),
    )
    expect(screen.getByText('Published description')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'v1' }))
    // Restore is disabled when there's a pending draft version
    const restoreBtn = screen.getByRole('button', { name: 'Restore version' })
    expect(restoreBtn).toBeDisabled()
    expect(restoreBtn).toHaveAttribute(
      'title',
      'requirement.restoreBlockedByPendingWork',
    )
  })

  it('initiates archiving review and stays on page after confirmation', async () => {
    const requirement = makeRequirement([
      makeVersion(2, {
        description: 'Published description',
        publishedAt: '2026-03-02',
        requiresTesting: true,
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
    ])

    const fetchMock = setupFetch({ initialRequirement: requirement })

    renderSubject()

    expect(await screen.findByText('Published description')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(
      screen.getByText('Initiate archiving review for this requirement?'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/123',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
    // Should stay on page (refresh requirement) instead of navigating away
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('keeps archived requirements actionable while a newer draft replacement exists', async () => {
    const requirement = makeRequirement(
      [
        makeVersion(2, {
          description: 'Draft replacement',
          editedAt: '2026-03-04',
          status: 1,
          statusColor: '#3b82f6',
          statusNameEn: 'Draft',
          statusNameSv: 'Utkast',
        }),
        makeVersion(1, {
          archivedAt: '2026-03-01',
          description: 'Archived description',
          publishedAt: '2026-02-28',
          status: 4,
          statusColor: '#6b7280',
          statusNameEn: 'Archived',
          statusNameSv: 'Arkiverad',
        }),
      ],
      { isArchived: true },
    )

    const fetchMock = setupFetch({
      initialRequirement: requirement,
      transitionNextRequirement: requirement,
    })

    renderSubject({ defaultVersion: 1 })

    expect(await screen.findByText('Archived description')).toBeInTheDocument()
    expect(
      screen.getByText(/Draft version v2 is available/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/kravkatalog/REQ-123/redigera',
    )

    await userEvent.click(screen.getByRole('button', { name: 'v2' }))

    expect(screen.getByText('Draft replacement')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Send to review' }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/123/transition',
        expect.objectContaining({
          body: JSON.stringify({ statusId: 2 }),
          method: 'POST',
        }),
      ),
    )
  })

  it('hides the pending version banner when the latest review version is selected', async () => {
    const requirement = makeRequirement([
      makeVersion(2, {
        description: 'Review description',
        editedAt: '2026-03-04',
        status: 2,
        statusColor: '#eab308',
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
      makeVersion(1, {
        description: 'Published description',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
    ])

    setupFetch({ initialRequirement: requirement })

    renderSubject()

    expect(await screen.findByText('Published description')).toBeInTheDocument()
    expect(
      screen.getByText(/Pending version v2 Granskning/),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'v2' }))

    expect(screen.getByText('Review description')).toBeInTheDocument()
    expect(
      screen.queryByText(/Pending version v2 Granskning/),
    ).not.toBeInTheDocument()
  })

  it('shows the published availability banner when viewing an archived version even if a newer review version exists', async () => {
    const requirement = makeRequirement([
      makeVersion(10, {
        description: 'Review description',
        editedAt: '2026-03-04',
        status: 2,
        statusColor: '#eab308',
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
      makeVersion(9, {
        description: 'Published description',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
      makeVersion(8, {
        archivedAt: '2026-02-17',
        description: 'Archived description',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
    ])

    setupFetch({ initialRequirement: requirement })

    renderSubject()

    expect(await screen.findByText('Published description')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'v8' }))

    const bannerText = screen.getByText(/Published version v9 is available/)
    const bannerIcon = bannerText.closest('div')?.querySelector('svg')

    expect(bannerText).toBeInTheDocument()
    expect(screen.queryByText('Viewing older version v8')).toBeNull()
    expect(bannerIcon).toHaveStyle({ color: '#22c55e' })
  })

  it('falls back to the review availability banner when no newer published version exists', async () => {
    const requirement = makeRequirement([
      makeVersion(10, {
        description: 'Review description',
        editedAt: '2026-03-04',
        status: 2,
        statusColor: '#eab308',
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
      makeVersion(8, {
        archivedAt: '2026-02-17',
        description: 'Archived description',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
    ])

    setupFetch({ initialRequirement: requirement })

    renderSubject({ defaultVersion: 8 })

    expect(await screen.findByText('Archived description')).toBeInTheDocument()

    const bannerText = screen.getByText(/Review version v10 is available/)
    const bannerIcon = bannerText.closest('div')?.querySelector('svg')

    expect(bannerText).toBeInTheDocument()
    expect(screen.queryByText('Viewing older version v8')).toBeNull()
    expect(bannerIcon).toHaveStyle({ color: '#eab308' })
  })

  it('falls back to the draft availability banner when no newer published or review version exists', async () => {
    const requirement = makeRequirement([
      makeVersion(10, {
        description: 'Draft description',
        editedAt: '2026-03-04',
        status: 1,
        statusColor: '#3b82f6',
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
      }),
      makeVersion(8, {
        archivedAt: '2026-02-17',
        description: 'Archived description',
        status: 4,
        statusColor: '#6b7280',
        statusNameEn: 'Archived',
        statusNameSv: 'Arkiverad',
      }),
    ])

    setupFetch({ initialRequirement: requirement })

    renderSubject({ defaultVersion: 8 })

    expect(await screen.findByText('Archived description')).toBeInTheDocument()

    const bannerText = screen.getByText(/Draft version v10 is available/)
    const bannerIcon = bannerText.closest('div')?.querySelector('svg')

    expect(bannerText).toBeInTheDocument()
    expect(screen.queryByText('Viewing older version v8')).toBeNull()
    expect(bannerIcon).toHaveStyle({ color: '#3b82f6' })
  })

  it('transitions a draft requirement to review and deletes the draft version after confirmation', async () => {
    const onChange = vi.fn()
    const initialRequirement = makeRequirement([
      makeVersion(2, {
        description: 'Draft description',
        editedAt: '2026-03-02',
        requiresTesting: false,
        status: 1,
        statusColor: '#3b82f6',
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
      }),
      makeVersion(1, {
        description: 'Review description',
        status: 2,
        statusColor: '#eab308',
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
    ])
    const nextRequirement = makeRequirement([
      makeVersion(1, {
        description: 'Review description',
        status: 2,
        statusColor: '#eab308',
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
    ])

    const fetchMock = setupFetch({
      deleteDraftNextRequirement: nextRequirement,
      initialRequirement,
      transitionNextRequirement: initialRequirement,
    })

    renderSubject({ defaultVersion: 2, onChange })

    expect(await screen.findByText('Draft description')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Send to review' }),
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/123/transition',
        expect.objectContaining({
          body: JSON.stringify({ statusId: 2 }),
          method: 'POST',
        }),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Delete this draft?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/123/delete-draft',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
    expect(onChange).toHaveBeenCalled()
  })

  it('requires confirmation for review transitions back to draft and forward to published', async () => {
    const onChange = vi.fn()
    const requirement = makeRequirement([
      makeVersion(2, {
        description: 'Review description',
        requiresTesting: false,
        status: 2,
        statusColor: '#eab308',
        statusNameEn: 'Review',
        statusNameSv: 'Granskning',
      }),
    ])

    const fetchMock = setupFetch({
      initialRequirement: requirement,
      transitionNextRequirement: requirement,
    })

    renderSubject({ defaultVersion: 2, onChange })

    expect(await screen.findByText('Review description')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Send back to draft' }),
    )
    expect(screen.getByText('Send back to draft?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/123/transition',
        expect.objectContaining({
          body: JSON.stringify({ statusId: 1 }),
          method: 'POST',
        }),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(screen.getByText('Publish this requirement?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements/123/transition',
        expect.objectContaining({
          body: JSON.stringify({ statusId: 3 }),
          method: 'POST',
        }),
      ),
    )
    expect(onChange).toHaveBeenCalled()
  })

  it('renders share button and menu with developer mode markers', async () => {
    const requirement = makeRequirement([
      makeVersion(1, {
        description: 'Shareable requirement',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
    ])

    setupFetch({ initialRequirement: requirement })
    renderSubject({ inline: true })

    await screen.findByText('Shareable requirement')

    const shareBtn = screen.getByRole('button', { name: /Share/ })
    expect(shareBtn).toBeInTheDocument()
    expect(shareBtn).toHaveAttribute('data-developer-mode-name', 'share toggle')

    await userEvent.click(shareBtn)

    expect(screen.getByText('Copy link (list view)')).toBeInTheDocument()
    expect(screen.getByText('Copy link (detail page)')).toBeInTheDocument()

    const inlineOption = screen
      .getByText('Copy link (list view)')
      .closest('button')
    expect(inlineOption).toHaveAttribute(
      'data-developer-mode-name',
      'share option',
    )
    expect(inlineOption).toHaveAttribute(
      'data-developer-mode-value',
      'share inline',
    )
  })

  it('shows help affordances in the add-to-package dialog', async () => {
    const requirement = makeRequirement([
      makeVersion(1, {
        description: 'Published requirement',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
    ])

    setupFetch({
      initialRequirement: requirement,
      packages: [{ id: 7, name: 'IAM Package' }],
    })
    renderSubject({ inline: true })

    await screen.findByText('Published requirement')

    const addToPackageButton = screen.getByRole('button', {
      name: 'package.addToPackage',
    })
    expect(addToPackageButton).toHaveAttribute(
      'data-developer-mode-name',
      'detail action',
    )
    expect(addToPackageButton).toHaveAttribute(
      'data-developer-mode-value',
      'add to package',
    )

    await userEvent.click(addToPackageButton)

    expect(
      await screen.findByRole('button', {
        name: 'common.help: package.selectPackage',
      }),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', {
        name: 'common.help: package.selectPackage',
      }),
    )

    expect(screen.getByText('package.selectPackageHelp')).toBeInTheDocument()
  })

  it('ignores stale needs-reference responses when switching packages quickly', async () => {
    const requirement = makeRequirement([
      makeVersion(1, {
        description: 'Published requirement',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
    ])
    const firstNeedsReferences = createDeferred<Response>()
    const secondNeedsReferences = createDeferred<Response>()
    const signals: AbortSignal[] = []

    setupFetch({
      initialRequirement: requirement,
      needsReferencesHandler: (packageId, signal) => {
        if (signal) {
          signals.push(signal)
        }
        return packageId === '7'
          ? firstNeedsReferences.promise
          : secondNeedsReferences.promise
      },
      packages: [
        { id: 7, name: 'IAM Package' },
        { id: 8, name: 'Security Package' },
      ],
    })
    renderSubject({ inline: true })

    await screen.findByText('Published requirement')
    await userEvent.click(
      screen.getByRole('button', {
        name: 'package.addToPackage',
      }),
    )

    const packageSelect = screen.getByRole('combobox', {
      name: /package\.selectPackage/,
    })

    await userEvent.selectOptions(packageSelect, '7')
    await userEvent.selectOptions(packageSelect, '8')

    await waitFor(() => {
      expect(signals).toHaveLength(2)
    })
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)

    secondNeedsReferences.resolve(
      response({ needsReferences: [{ id: 81, text: 'Current ref' }] }),
    )
    expect(
      await screen.findByRole('option', { name: 'Current ref' }),
    ).toBeInTheDocument()

    firstNeedsReferences.resolve(
      response({ needsReferences: [{ id: 71, text: 'Stale ref' }] }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Current ref' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('option', { name: 'Stale ref' }),
      ).not.toBeInTheDocument()
    })
  })

  it('aborts pending needs-reference requests when cancelling the add-to-package dialog', async () => {
    const requirement = makeRequirement([
      makeVersion(1, {
        description: 'Published requirement',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
    ])
    const pendingNeedsReferences = createDeferred<Response>()
    const signals: AbortSignal[] = []

    setupFetch({
      initialRequirement: requirement,
      needsReferencesHandler: (_packageId, signal) => {
        if (signal) {
          signals.push(signal)
        }
        return pendingNeedsReferences.promise
      },
      packages: [{ id: 7, name: 'IAM Package' }],
    })
    renderSubject({ inline: true })

    await screen.findByText('Published requirement')
    await userEvent.click(
      screen.getByRole('button', {
        name: 'package.addToPackage',
      }),
    )

    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: /package\.selectPackage/,
      }),
      '7',
    )

    await waitFor(() => {
      expect(signals).toHaveLength(1)
    })
    expect(signals[0]?.aborted).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(signals[0]?.aborted).toBe(true)

    pendingNeedsReferences.resolve(response({ needsReferences: [] }))
  })

  it('closes the add-to-package dialog when Escape is pressed inside it', async () => {
    const requirement = makeRequirement([
      makeVersion(1, {
        description: 'Published requirement',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
    ])

    setupFetch({
      initialRequirement: requirement,
      packages: [{ id: 7, name: 'IAM Package' }],
    })
    renderSubject({ inline: true })

    await screen.findByText('Published requirement')
    await userEvent.click(
      screen.getByRole('button', {
        name: 'package.addToPackage',
      }),
    )

    const packageSelect = screen.getByRole('combobox', {
      name: /package\.selectPackage/,
    })
    fireEvent.keyDown(packageSelect, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('hides add-to-package for historical published versions that cannot be persisted exactly', async () => {
    const requirement = makeRequirement([
      makeVersion(4, {
        description: 'Draft replacement',
        status: 1,
        statusColor: '#3b82f6',
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
      }),
      makeVersion(3, {
        description: 'Current published requirement',
        publishedAt: '2026-03-03',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
      makeVersion(2, {
        description: 'Historical published requirement',
        publishedAt: '2026-03-01',
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
      }),
    ])

    setupFetch({ initialRequirement: requirement })
    renderSubject()

    expect(
      await screen.findByText('Current published requirement'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'package.addToPackage' }),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'v2' }))

    expect(
      await screen.findByText('Historical published requirement'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'package.addToPackage' }),
    ).not.toBeInTheDocument()
  })

  it('renders noPublishedVersion fallback for full-page view without published version', async () => {
    const requirement = makeRequirement([
      makeVersion(1, {
        description: 'Only a draft',
        publishedAt: null,
        status: 1,
        statusColor: '#3b82f6',
        statusNameEn: 'Draft',
        statusNameSv: 'Utkast',
      }),
    ])

    setupFetch({ initialRequirement: requirement })
    renderSubject({ inline: false })

    expect(
      await screen.findByText(
        'There is no published version of this requirement.',
      ),
    ).toBeInTheDocument()
  })
})
