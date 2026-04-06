import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ForwardedRef, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementDetailClient from '@/app/[locale]/requirements/[id]/requirement-detail-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import type {
  RequirementDetailResponse,
  RequirementLocalizedEntity,
  RequirementVersionDetail,
} from '@/lib/requirements/types'

const routerPush = vi.fn()
let resizeObserverCallback: ResizeObserverCallback | null = null
let mutationObserverCallback: MutationCallback | null = null

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

type RequirementLocalizedEntityOverride = {
  id?: number
  nameEn: string | null
  nameSv: string | null
}

type RequirementScenarioOverride = {
  scenario: {
    descriptionEn?: string | null
    descriptionSv?: string | null
    id: number
    nameEn: string | null
    nameSv: string | null
    ownerId?: number | null
  }
}

type RequirementVersionOverrides = Omit<
  Partial<RequirementVersionDetail>,
  'category' | 'qualityCharacteristic' | 'type' | 'versionScenarios'
> & {
  id?: number
  category?: RequirementLocalizedEntityOverride | null
  qualityCharacteristic?: RequirementLocalizedEntityOverride | null
  type?: RequirementLocalizedEntityOverride | null
  versionScenarios?: RequirementScenarioOverride[]
}

function toLocalizedEntity(
  value: RequirementLocalizedEntityOverride | null | undefined,
  fallbackId: number,
): RequirementLocalizedEntity | null {
  if (value == null) {
    return null
  }

  return {
    id: value.id ?? fallbackId,
    nameEn: value.nameEn,
    nameSv: value.nameSv,
  }
}

function toVersionScenarios(
  scenarios: RequirementScenarioOverride[] | undefined,
): RequirementVersionDetail['versionScenarios'] {
  return (scenarios ?? []).map(({ scenario }) => ({
    scenario: {
      descriptionEn: scenario.descriptionEn ?? null,
      descriptionSv: scenario.descriptionSv ?? null,
      id: scenario.id,
      nameEn: scenario.nameEn,
      nameSv: scenario.nameSv,
      ownerId: scenario.ownerId ?? null,
    },
  }))
}

function makeVersion(
  versionNumber: number,
  overrides: RequirementVersionOverrides = {},
): RequirementVersionDetail {
  const { category, qualityCharacteristic, type, versionScenarios, ...rest } =
    overrides

  return {
    acceptanceCriteria: `Acceptance ${versionNumber}`,
    archiveInitiatedAt: null,
    archivedAt: null,
    category: toLocalizedEntity(category, 10),
    createdAt: `2026-03-${String(versionNumber).padStart(2, '0')}`,
    createdBy: 'Owner',
    description: `Description ${versionNumber}`,
    editedAt: null,
    id: versionNumber,
    ownerName: 'Owner',
    publishedAt: null,
    references: [],
    requiresTesting: false,
    qualityCharacteristic: toLocalizedEntity(qualityCharacteristic, 30),
    status: 1,
    statusColor: '#3b82f6',
    statusNameEn: 'Draft',
    statusNameSv: 'Utkast',
    type: toLocalizedEntity(type, 20),
    verificationMethod: null,
    versionNumber,
    versionScenarios: toVersionScenarios(versionScenarios),
    versionNormReferences: [],
    ...rest,
  }
}

function makeRequirement(
  versions: RequirementDetailResponse['versions'],
  overrides: Partial<Omit<RequirementDetailResponse, 'area' | 'versions'>> & {
    area?: {
      id?: number
      name: string
      ownerId?: number | null
      ownerName?: string | null
      prefix?: string
    } | null
  } = {},
): RequirementDetailResponse {
  const { area, ...rest } = overrides

  return {
    area:
      area === null
        ? null
        : {
            id: area?.id ?? 1,
            name: area?.name ?? 'Core platform',
            ownerId: area?.ownerId ?? 1,
            ownerName: area?.ownerName ?? 'Area Owner',
            prefix: area?.prefix ?? 'CORE',
          },
    createdAt: '2026-03-01T00:00:00Z',
    id: 123,
    isArchived: false,
    uniqueId: 'REQ-123',
    versions,
    ...rest,
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
  addToPackageHandler,
  deleteDraftNextRequirement,
  deleteDraftResponse = { deleted: 'version' },
  initialRequirement,
  needsReferencesHandler,
  packages = [],
  packagesHandler,
  reactivateNextRequirement,
  restoreNextRequirement,
  transitionNextRequirement,
}: {
  addToPackageHandler?: (
    packageId: string,
    init?: RequestInit,
  ) => Promise<Response> | Response
  deleteDraftNextRequirement?: ReturnType<typeof makeRequirement>
  deleteDraftResponse?: { deleted?: string }
  initialRequirement: ReturnType<typeof makeRequirement>
  needsReferencesHandler?: (
    packageId: string,
    signal?: AbortSignal,
  ) => Promise<Response> | Response
  packages?: { id: number; name: string }[]
  packagesHandler?: () => Promise<Response> | Response
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
        if (packagesHandler) {
          return packagesHandler()
        }
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

      const addToPackageMatch = url.match(
        /^\/api\/requirement-packages\/([^/]+)\/items$/,
      )
      if (method === 'POST' && addToPackageMatch) {
        if (addToPackageHandler) {
          return addToPackageHandler(addToPackageMatch[1] ?? '', init)
        }
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
    resizeObserverCallback = null
    mutationObserverCallback = null

    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallback = callback
        }

        disconnect() {}
        observe() {}
        unobserve() {}
      },
    )
    vi.stubGlobal(
      'MutationObserver',
      class MutationObserver {
        constructor(callback: MutationCallback) {
          mutationObserverCallback = callback
        }

        disconnect() {}
        observe() {}
        takeRecords() {
          return []
        }
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
    expect(resizeObserverCallback).not.toBeNull()
    expect(mutationObserverCallback).not.toBeNull()

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver)
      mutationObserverCallback?.([], {} as MutationObserver)
    })

    expect(screen.getByText('Published description')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'v2' })).toBeInTheDocument()
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

  it('falls back to the alternate locale label when localized taxonomy names are missing', async () => {
    const requirement = makeRequirement([
      makeVersion(1, {
        category: { nameEn: 'Operations', nameSv: null },
        description: 'Taxonomy fallback requirement',
        publishedAt: '2026-03-01',
        qualityCharacteristic: {
          nameEn: 'Maintainability',
          nameSv: null,
        },
        status: 3,
        statusColor: '#22c55e',
        statusNameEn: 'Published',
        statusNameSv: 'Publicerad',
        type: { nameEn: 'Functional', nameSv: null },
        versionScenarios: [
          {
            scenario: { id: 1, nameEn: 'Ordering', nameSv: null },
          },
        ],
      }),
    ])

    setupFetch({ initialRequirement: requirement })
    renderSubject({ inline: true })

    expect(
      await screen.findByText('Taxonomy fallback requirement'),
    ).toBeInTheDocument()
    expect(screen.getByText('Operations')).toBeInTheDocument()
    expect(screen.getByText('Functional')).toBeInTheDocument()
    expect(screen.getByText('Maintainability')).toBeInTheDocument()
    expect(screen.getByText('Ordering')).toBeInTheDocument()
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

  it('closes the full-page detail modal when Escape is pressed inside it', async () => {
    const onClose = vi.fn()
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

    setupFetch({ initialRequirement: requirement })
    renderSubject({ onClose })

    await screen.findByText('Published requirement')

    fireEvent.keyDown(screen.getByRole('button', { name: 'Close' }), {
      key: 'Escape',
    })

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders the full-page detail close button with touch target and focus styles', async () => {
    const onClose = vi.fn()
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

    setupFetch({ initialRequirement: requirement })
    renderSubject({ onClose })

    await screen.findByText('Published requirement')

    const closeButton = screen.getByRole('button', { name: 'Close' })
    expect(closeButton.className).toContain('min-h-[44px]')
    expect(closeButton.className).toContain('min-w-[44px]')
    expect(closeButton.className).toContain('focus:outline-none')
    expect(closeButton.className).toContain('focus-visible:ring-2')
    expect(closeButton.className).toContain('focus-visible:ring-offset-2')
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
      '/requirements/REQ-123/edit',
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

  it('shows an inline error when loading packages for the add-to-package dialog fails', async () => {
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
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    setupFetch({
      initialRequirement: requirement,
      packagesHandler: () =>
        response({ error: 'Package lookup failed' }, false),
    })
    renderSubject({ inline: true })

    await screen.findByText('Published requirement')
    await userEvent.click(
      screen.getByRole('button', {
        name: 'package.addToPackage',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'package.loadPackagesFailed: Package lookup failed',
    )
    expect(screen.queryByText('package.noPackagesAvailable')).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('shows an inline error when loading packages for the add-to-package dialog fails with a plain-text response body', async () => {
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
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    setupFetch({
      initialRequirement: requirement,
      packagesHandler: () =>
        new Response('Package lookup failed', {
          headers: { 'content-type': 'text/plain' },
          status: 503,
          statusText: 'Service Unavailable',
        }),
    })
    renderSubject({ inline: true })

    await screen.findByText('Published requirement')
    await userEvent.click(
      screen.getByRole('button', {
        name: 'package.addToPackage',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'package.loadPackagesFailed: Package lookup failed',
    )
    expect(screen.queryByText('package.noPackagesAvailable')).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('renders the add-to-package close button with touch target and focus styles', async () => {
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

    const closeButton = await screen.findByRole('button', { name: 'Close' })
    expect(closeButton.className).toContain('min-h-[44px]')
    expect(closeButton.className).toContain('min-w-[44px]')
    expect(closeButton.className).toContain('focus-visible:outline-none')
    expect(closeButton.className).toContain('focus-visible:ring-2')
    expect(closeButton.className).toContain('focus-visible:ring-primary-500')
  })

  it('keeps the add-to-package cancel button visible on dark-mode hover', async () => {
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

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' })

    expect(cancelButton.className).toContain('dark:hover:bg-secondary-800')
    expect(cancelButton.className).toContain('dark:hover:border-secondary-600')
    expect(cancelButton.className).toContain('dark:hover:text-secondary-100')
  })

  it('adds explicit dark-mode border and text classes to add-to-package form fields', async () => {
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

    const packageSelect = await screen.findByRole('combobox', {
      name: /package\.selectPackage/,
    })
    const needsReferenceSelect = screen.getByRole('combobox', {
      name: /package\.needsReferenceLabel/,
    })

    await userEvent.selectOptions(needsReferenceSelect, 'new')

    const needsReferenceText = screen.getByRole('textbox', {
      name: /package\.addNeedsRefTextLabel/,
    })

    for (const field of [
      packageSelect,
      needsReferenceSelect,
      needsReferenceText,
    ]) {
      expect(field.className).toContain('border-secondary-200')
      expect(field.className).toContain('text-secondary-900')
      expect(field.className).toContain('dark:border-secondary-700')
      expect(field.className).toContain('dark:text-secondary-100')
    }
    expect(packageSelect.className).toContain('min-h-[44px]')
    expect(needsReferenceSelect.className).toContain('min-h-[44px]')
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

  it('shows an inline error when loading needs references fails', async () => {
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
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    setupFetch({
      initialRequirement: requirement,
      needsReferencesHandler: () => response({ error: 'Lookup failed' }, false),
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Lookup failed')
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
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

  it('ignores stale add-to-package submit responses after the dialog is reopened', async () => {
    try {
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
      const pendingAddToPackage = createDeferred<Response>()
      const submitSignals: AbortSignal[] = []

      setupFetch({
        addToPackageHandler: (_packageId, init) => {
          if (init?.signal) {
            submitSignals.push(init.signal)
          }
          return pendingAddToPackage.promise
        },
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

      let dialog = await screen.findByRole('dialog')
      await userEvent.selectOptions(
        within(dialog).getByRole('combobox', {
          name: /package\.selectPackage/,
        }),
        '7',
      )
      await userEvent.click(
        within(dialog).getByRole('button', {
          name: 'package.addToPackage',
        }),
      )

      await waitFor(() => {
        expect(submitSignals).toHaveLength(1)
      })
      expect(submitSignals[0]?.aborted).toBe(false)

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Cancel' }),
      )

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(submitSignals[0]?.aborted).toBe(true)

      await userEvent.click(
        screen.getByRole('button', {
          name: 'package.addToPackage',
        }),
      )
      dialog = await screen.findByRole('dialog')

      vi.useFakeTimers()
      await act(async () => {
        pendingAddToPackage.resolve(response({}))
        await Promise.resolve()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1200)
      })

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(
        within(dialog).getByRole('combobox', {
          name: /package\.selectPackage/,
        }),
      ).toHaveValue('')
      expect(screen.queryByText('package.addToPackageSuccess')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('announces add-to-package submit failures as alerts', async () => {
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
      addToPackageHandler: () => response({ error: 'Already linked' }, false),
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

    const dialog = await screen.findByRole('dialog')
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', {
        name: /package\.selectPackage/,
      }),
      '7',
    )
    await userEvent.click(
      within(dialog).getByRole('button', {
        name: 'package.addToPackage',
      }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Already linked',
    )
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
