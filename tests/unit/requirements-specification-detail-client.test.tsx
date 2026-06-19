import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsSpecificationDetailClient from '@/app/[locale]/specifications/[slug]/requirements-specification-detail-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
import type { RequirementPackageOption } from '@/lib/requirements/list-view'
import type {
  RequirementsSpecificationDetailInitialData,
  SpecificationPreloadError,
} from '@/lib/specifications/preload-types'

const requirementsTableMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => {
    const t = (key: string) => (ns ? `${ns}.${key}` : key)
    t.rich = (key: string) => (ns ? `${ns}.${key}` : key)
    return t
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}))

vi.mock('@/lib/reduced-motion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reduced-motion')>()

  return {
    ...actual,
    dialogPanelMotion: vi.fn(actual.dialogPanelMotion),
    fadeMotion: vi.fn(actual.fadeMotion),
  }
})

vi.mock('@/app/[locale]/requirements/[id]/requirement-detail-client', () => ({
  default: ({ requirementId }: { requirementId: number }) => (
    <div>{`Requirement detail ${requirementId}`}</div>
  ),
}))

vi.mock('@/components/RequirementsTable', () => ({
  default: (props: {
    defaultVisibleColumns?: string[]
    floatingActionRailPlacement?: string
    floatingActions?: {
      ariaLabel: string
      developerModeContext?: string
      developerModeValue?: string
      hidden?: boolean
      icon: ReactNode
      id: string
      menuItems?: {
        href?: string
        id: string
        label: string
        onClick?: () => void
      }[]
      onClick?: () => void
    }[]
    filterValues?: { requirementPackageIds?: number[] }
    hasMore?: boolean
    loadingMore?: boolean
    onFilterChange?: (values: { requirementPackageIds?: number[] }) => void
    onLoadMore?: () => void | Promise<void>
    onNeedsReferenceChange?: (
      itemRef: string,
      needsReferenceId: number | null,
    ) => void
    onSelectionChange?: (ids: Set<number>) => void
    requirementPackages?: { id: number; name: string }[]
    rows: { id: number; itemRef?: string; requirementPackageIds?: number[] }[]
    stickyTopOffsetClassName?: string
    stickyTitle?: ReactNode
    stickyTitleActions?: ReactNode
    visibleColumns?: string[]
  }) => {
    requirementsTableMock(props)
    const tableKind = props.onLoadMore ? 'available' : 'items'
    return (
      <div
        data-floating-action-rail-placement={
          props.floatingActionRailPlacement ?? 'fixed-right'
        }
      >
        <div data-testid={`requirements-table-${tableKind}-rows`}>
          {props.rows.map(row => row.itemRef ?? row.id).join(',')}
        </div>
        <div data-testid="requirements-table-sticky-title">
          {props.stickyTitle}
        </div>
        <div data-testid="requirements-table-sticky-title-actions">
          {props.stickyTitleActions}
        </div>
        {props.floatingActions?.map(action => (
          <button
            aria-label={action.ariaLabel}
            data-developer-mode-context={action.developerModeContext}
            data-developer-mode-name="table action"
            data-developer-mode-value={action.developerModeValue}
            key={action.id}
            onClick={action.onClick}
            type="button"
          >
            {action.icon}
          </button>
        ))}
        {props.requirementPackages?.map(requirementPackage => {
          const current = props.filterValues?.requirementPackageIds ?? []
          const active = current.includes(requirementPackage.id)
          return (
            <button
              aria-label={`filter-package-${tableKind}-${requirementPackage.id}`}
              aria-pressed={active}
              key={`${tableKind}-package-${requirementPackage.id}`}
              onClick={() => {
                const next = active
                  ? current.filter(id => id !== requirementPackage.id)
                  : [...current, requirementPackage.id]
                props.onFilterChange?.({
                  ...props.filterValues,
                  requirementPackageIds: next.length > 0 ? next : undefined,
                })
              }}
              type="button"
            >
              {requirementPackage.name}
            </button>
          )
        })}
        {props.hasMore ? (
          <button
            aria-label="load-more-available"
            disabled={props.loadingMore}
            onClick={() => void props.onLoadMore?.()}
            type="button"
          >
            load more
          </button>
        ) : null}
        {props.rows[0] ? (
          <button
            aria-label={`select-row-${props.rows[0].id}`}
            onClick={() =>
              props.onSelectionChange?.(new Set([props.rows[0].id]))
            }
            type="button"
          >
            select
          </button>
        ) : null}
        {props.onNeedsReferenceChange && props.rows[0]?.itemRef ? (
          <button
            aria-label={`assign-needs-ref-${props.rows[0].itemRef}`}
            onClick={() =>
              props.onNeedsReferenceChange?.(props.rows[0].itemRef ?? '', 81)
            }
            type="button"
          >
            assign needs ref
          </button>
        ) : null}
        {`rows:${props.rows.length}`}
      </div>
    )
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
  useRouter: () => ({ replace: vi.fn() }),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
let addRequirementsResponse: { body: unknown; ok: boolean }
let bulkNeedsReferencePatchError: Error | null
let bulkNeedsReferencePatchResponse: { body: unknown; ok: boolean } | null
let failNextAvailableRequirementsFetch = false
let failNextSpecificationItemsFetch = false
let availableRequirementsSelectionFilter:
  | RequirementsSpecificationDetailInitialData['availableRequirements']['selectionFilter']
  | undefined

const initialSpec = {
  businessNeedsReference: 'Shared IAM business case',
  id: 8,
  implementationType: { id: 2, nameEn: 'Program', nameSv: 'Program' },
  lifecycleStatus: { id: 3, nameEn: 'Development', nameSv: 'Utveckling' },
  name: 'Authorization and IAM',
  permissions: {
    canEditContent: true,
    canManageAssignments: true,
    canReviewDecisions: false,
    canUseAi: true,
  },
  responsibleDisplayName: 'Ada Admin',
  responsibleHsaId: 'SE5560000001-ada1',
  specificationImplementationTypeId: 2,
  specificationLifecycleStatusId: 3,
  specificationGovernanceObjectTypeId: 1,
  governanceObjectType: { id: 1, nameEn: 'Platform', nameSv: 'Plattform' },
  uniqueId: 'ETJANST-UPP-2026',
}

const initialSpecificationItem = {
  area: { name: 'Security' },
  id: 101,
  isArchived: false,
  itemRef: 'lib:31',
  kind: 'library' as const,
  specificationItemId: 31,
  uniqueId: 'BEH0001',
  version: {
    categoryNameEn: 'Business requirement',
    categoryNameSv: 'Verksamhetskrav',
    description: 'RBAC should be enforced.',
    qualityCharacteristicNameEn: null,
    qualityCharacteristicNameSv: null,
    requiresTesting: true,
    riskLevelColor: null,
    riskLevelId: null,
    riskLevelNameEn: null,
    riskLevelNameSv: null,
    riskLevelSortOrder: null,
    status: 3,
    statusColor: '#22c55e',
    statusNameEn: 'Published',
    statusNameSv: 'Publicerad',
    typeNameEn: 'Non-functional',
    typeNameSv: 'Icke-funktionellt',
    versionNumber: 1,
  },
}

const initialAvailableRequirement = {
  area: { name: 'Platform' },
  id: 202,
  isArchived: false,
  uniqueId: 'IAM0202',
  version: {
    categoryNameEn: 'Business requirement',
    categoryNameSv: 'Verksamhetskrav',
    description: 'Allow specification-level linking.',
    qualityCharacteristicNameEn: null,
    qualityCharacteristicNameSv: null,
    requiresTesting: true,
    riskLevelColor: null,
    riskLevelId: null,
    riskLevelNameEn: null,
    riskLevelNameSv: null,
    riskLevelSortOrder: null,
    status: 3,
    statusColor: '#22c55e',
    statusNameEn: 'Published',
    statusNameSv: 'Publicerad',
    typeNameEn: 'Non-functional',
    typeNameSv: 'Icke-funktionellt',
    versionNumber: 1,
  },
}

function createInitialData(): RequirementsSpecificationDetailInitialData {
  return {
    areas: [],
    availableNeedsRefs: [],
    availableRequirements: {
      hasMore: false,
      rows: [initialAvailableRequirement],
    },
    errors: [] as SpecificationPreloadError[],
    leftNormReferenceOptions: [],
    requirementPackages: [] as RequirementPackageOption[],
    rightNormReferenceOptions: [],
    spec: initialSpec,
    specificationImplementationTypes: [
      { id: 2, nameEn: 'Program', nameSv: 'Program' },
    ],
    specificationItemStatuses: [],
    specificationItems: [initialSpecificationItem],
    specificationLifecycleStatuses: [
      { id: 3, nameEn: 'Development', nameSv: 'Utveckling' },
    ],
    specificationGovernanceObjectTypes: [
      { id: 1, nameEn: 'Platform', nameSv: 'Plattform' },
    ],
  }
}

function renderRequirementsSpecificationDetailClient(
  initialData = createInitialData(),
) {
  return render(
    <ConfirmModalProvider>
      <RequirementsSpecificationDetailClient
        initialData={initialData}
        specificationSlug="ETJANST-UPP-2026"
      />
    </ConfirmModalProvider>,
  )
}

function availableRequirementsFetchUrls(): string[] {
  return fetchMock.mock.calls
    .map(([input]) =>
      typeof input === 'string' ? input : (input as Request).url,
    )
    .filter(url =>
      url.startsWith(
        '/api/requirements-specifications/ETJANST-UPP-2026/available-requirements?',
      ),
    )
}

async function waitForInitialAvailableRequirementsRefresh() {
  await waitFor(() => {
    expect(availableRequirementsFetchUrls().length).toBeGreaterThan(0)
  })
}

function searchParamsFromPath(path: string): URLSearchParams {
  return new URLSearchParams(path.split('?')[1] ?? '')
}

function latestItemsTableProps() {
  const calls = requirementsTableMock.mock.calls.map(([props]) => props)
  const itemsTable = calls.find(
    props => props.floatingActionRailPlacement === 'inline-top',
  )
  expect(itemsTable).toBeDefined()
  return itemsTable as NonNullable<typeof itemsTable>
}

describe('RequirementsSpecificationDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useReducedMotion).mockReturnValue(false)
    requirementsTableMock.mockReset()
    addRequirementsResponse = { body: { ok: true }, ok: true }
    bulkNeedsReferencePatchError = null
    bulkNeedsReferencePatchResponse = null
    failNextAvailableRequirementsFetch = false
    failNextSpecificationItemsFetch = false
    availableRequirementsSelectionFilter = undefined
    fetchMock.mockImplementation(
      (input: string | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url
        const method =
          init?.method ?? (typeof input === 'string' ? 'GET' : input.method)

        if (url === '/api/auth/me') {
          return Promise.resolve(
            okJson({
              authenticated: true,
              hsaId: 'SE5560000001-ada1',
              name: 'Ada Admin',
              roles: ['Admin'],
            }),
          )
        }

        if (url === '/api/requirements-specifications/ETJANST-UPP-2026') {
          return Promise.resolve(
            okJson({
              businessNeedsReference: 'Shared IAM business case',
              id: 8,
              implementationType: { nameEn: 'Program', nameSv: 'Program' },
              lifecycleStatus: { nameEn: 'Development', nameSv: 'Utveckling' },
              name: 'Authorization and IAM',
              responsibleDisplayName: 'Ada Admin',
              responsibleHsaId: 'SE5560000001-ada1',
              specificationImplementationTypeId: 2,
              specificationLifecycleStatusId: 3,
              specificationGovernanceObjectTypeId: 1,
              governanceObjectType: { nameEn: 'Platform', nameSv: 'Plattform' },
              uniqueId: 'ETJANST-UPP-2026',
            }),
          )
        }

        if (
          url === '/api/requirements-specifications/ETJANST-UPP-2026/items' &&
          method === 'POST'
        ) {
          return Promise.resolve({
            json: async () => addRequirementsResponse.body,
            ok: addRequirementsResponse.ok,
          })
        }

        if (
          url === '/api/requirements-specifications/ETJANST-UPP-2026/items' &&
          method === 'PATCH'
        ) {
          if (bulkNeedsReferencePatchError) {
            return Promise.reject(bulkNeedsReferencePatchError)
          }
          if (bulkNeedsReferencePatchResponse) {
            const response = bulkNeedsReferencePatchResponse
            return Promise.resolve({
              json: async () => response.body,
              ok: response.ok,
            })
          }
          return Promise.resolve(okJson({ ok: true, updatedCount: 1 }))
        }

        if (
          url === '/api/requirements-specifications/ETJANST-UPP-2026/items' &&
          method === 'GET'
        ) {
          if (failNextSpecificationItemsFetch) {
            failNextSpecificationItemsFetch = false
            return Promise.resolve({
              json: async () => ({}),
              ok: false,
            })
          }

          return Promise.resolve(
            okJson({
              items: [
                {
                  area: { name: 'Security' },
                  id: 101,
                  isArchived: false,
                  itemRef: 'lib:31',
                  kind: 'library',
                  specificationItemId: 31,
                  uniqueId: 'BEH0001',
                  version: {
                    categoryNameEn: 'Business requirement',
                    categoryNameSv: 'Verksamhetskrav',
                    description: 'RBAC should be enforced.',
                    qualityCharacteristicNameEn: null,
                    qualityCharacteristicNameSv: null,
                    requiresTesting: true,
                    status: 3,
                    statusColor: '#22c55e',
                    statusNameEn: 'Published',
                    statusNameSv: 'Publicerad',
                    typeNameEn: 'Non-functional',
                    typeNameSv: 'Icke-funktionellt',
                    versionNumber: 1,
                  },
                },
              ],
            }),
          )
        }

        if (
          url.startsWith(
            '/api/requirements-specifications/ETJANST-UPP-2026/available-requirements?',
          ) ||
          url.startsWith('/api/requirements?')
        ) {
          if (failNextAvailableRequirementsFetch) {
            failNextAvailableRequirementsFetch = false
            return Promise.resolve({
              json: async () => ({}),
              ok: false,
            })
          }

          const isSpecificationAvailableRequirements = url.startsWith(
            '/api/requirements-specifications/ETJANST-UPP-2026/available-requirements?',
          )
          const applyRequirementSelectionFilter =
            isSpecificationAvailableRequirements &&
            url.includes('applyRequirementSelectionFilter=true')
          const selectionFilter =
            isSpecificationAvailableRequirements &&
            availableRequirementsSelectionFilter
              ? {
                  ...availableRequirementsSelectionFilter,
                  applied:
                    applyRequirementSelectionFilter &&
                    availableRequirementsSelectionFilter.hasRequirementSelection,
                }
              : undefined

          return Promise.resolve(
            okJson({
              pagination: { hasMore: false },
              requirements: [
                {
                  area: { name: 'Platform' },
                  id: 202,
                  isArchived: false,
                  uniqueId: 'IAM0202',
                  version: {
                    categoryNameEn: 'Business requirement',
                    categoryNameSv: 'Verksamhetskrav',
                    description: 'Allow specification-level linking.',
                    qualityCharacteristicNameEn: null,
                    qualityCharacteristicNameSv: null,
                    requiresTesting: true,
                    status: 3,
                    statusColor: '#22c55e',
                    statusNameEn: 'Published',
                    statusNameSv: 'Publicerad',
                    typeNameEn: 'Non-functional',
                    typeNameSv: 'Icke-funktionellt',
                    versionNumber: 1,
                  },
                },
              ],
              selectionFilter,
            }),
          )
        }

        if (url === '/api/requirement-areas') {
          return Promise.resolve(okJson({ areas: [] }))
        }

        if (url === '/api/requirement-categories') {
          return Promise.resolve(okJson({ categories: [] }))
        }

        if (url === '/api/requirement-types') {
          return Promise.resolve(okJson({ types: [] }))
        }

        if (url === '/api/risk-levels') {
          return Promise.resolve(okJson({ riskLevels: [] }))
        }

        if (url === '/api/requirement-packages') {
          return Promise.resolve(okJson({ requirementPackages: [] }))
        }

        if (
          url ===
            '/api/requirements-specifications/ETJANST-UPP-2026/items/lib%3A31' &&
          method === 'PATCH'
        ) {
          return Promise.resolve(okJson({ ok: true }))
        }

        if (
          url ===
            '/api/requirements-specifications/ETJANST-UPP-2026/needs-references' &&
          method === 'POST'
        ) {
          return Promise.resolve(
            okJson({
              needsReference: {
                description: 'Access management work',
                id: 81,
                linkedItemCount: 0,
                text: 'IAM-42',
              },
              ok: true,
            }),
          )
        }

        if (
          url ===
            '/api/requirements-specifications/ETJANST-UPP-2026/needs-references' &&
          method === 'PATCH'
        ) {
          return Promise.resolve(
            okJson({
              needsReference: {
                description: 'Updated context',
                id: 81,
                linkedItemCount: 0,
                text: 'IAM-43',
              },
              ok: true,
            }),
          )
        }

        if (
          url ===
            '/api/requirements-specifications/ETJANST-UPP-2026/needs-references' &&
          method === 'DELETE'
        ) {
          return Promise.resolve(okJson({ ok: true }))
        }

        if (
          url ===
            '/api/requirements-specifications/ETJANST-UPP-2026/needs-references' &&
          method === 'GET'
        ) {
          return Promise.resolve(okJson({ needsReferences: [] }))
        }

        if (
          url ===
          '/api/requirements-specifications/ETJANST-UPP-2026/requirement-selection-answers'
        ) {
          return Promise.resolve(okJson({ questions: [] }))
        }

        if (url === '/api/specification-governance-object-types') {
          return Promise.resolve(
            okJson({
              governanceObjectTypes: [
                { id: 1, nameEn: 'Platform', nameSv: 'Plattform' },
              ],
            }),
          )
        }

        if (url === '/api/specification-implementation-types') {
          return Promise.resolve(
            okJson({
              types: [{ id: 2, nameEn: 'Program', nameSv: 'Program' }],
            }),
          )
        }

        if (url === '/api/specification-lifecycle-statuses') {
          return Promise.resolve(
            okJson({
              statuses: [
                { id: 3, nameEn: 'Development', nameSv: 'Utveckling' },
              ],
            }),
          )
        }

        if (url.startsWith('/api/norm-references')) {
          return Promise.resolve(okJson({ normReferences: [] }))
        }

        if (url.startsWith('/api/quality-characteristics')) {
          return Promise.resolve(okJson({ qualityCharacteristics: [] }))
        }

        if (url === '/api/catalog/specification-item-statuses') {
          return Promise.resolve(okJson({ statuses: [] }))
        }

        throw new Error(`Unmocked fetch: ${method} ${url}`)
      },
    )
    window.localStorage.clear()
  })

  it('shows the partial preload warning banner when initial data contains errors', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      errors: [{ key: 'available requirements', message: 'preload failed' }],
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'specification.partialDataLoadWarning',
    )
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('shows lifecycle-matched report options and always keeps full CSV export', () => {
    renderRequirementsSpecificationDetailClient()

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{ href?: string; id: string }>
    }>
    const printAction = floatingActions.find(action => action.id === 'print')
    const exportAction = floatingActions.find(action => action.id === 'export')

    expect(printAction?.hidden).toBe(false)
    expect(printAction?.menuItems).toEqual([
      expect.objectContaining({
        href: '/specifications/ETJANST-UPP-2026/reports/print/progress',
        id: 'print-progress',
      }),
      expect.objectContaining({ id: 'pdf-progress' }),
    ])
    expect(exportAction?.menuItems?.map(item => item.id)).toEqual([
      'export-full',
    ])
  })

  it('loads available requirements without sending the fixed status filter', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(availableRequirementsFetchUrls().length).toBeGreaterThan(0)
    })

    const initialUrl = availableRequirementsFetchUrls()[0] ?? ''
    const params = searchParamsFromPath(initialUrl)
    expect(params.get('locale')).toBe('en')
    expect(params.has('statuses')).toBe(false)
  })

  it('keeps requirement-selection filtering opt-in for available requirements', async () => {
    availableRequirementsSelectionFilter = {
      applied: false,
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [202],
    }
    renderRequirementsSpecificationDetailClient()

    const toggle = await screen.findByRole('switch', {
      name: 'specification.filterWithRequirementSelectionQuestions',
    })
    expect(toggle).not.toBeChecked()
    expect(
      availableRequirementsFetchUrls().some(url =>
        url.includes('applyRequirementSelectionFilter=true'),
      ),
    ).toBe(false)

    fireEvent.click(toggle)

    await waitFor(() => {
      expect(
        availableRequirementsFetchUrls().some(url =>
          url.includes('applyRequirementSelectionFilter=true'),
        ),
      ).toBe(true)
    })
    expect(toggle).toBeChecked()
  })

  it('disables the requirement-selection filter toggle when answers provide no requirement selection', async () => {
    availableRequirementsSelectionFilter = {
      applied: false,
      hasCurrentAnswers: true,
      hasRequirementSelection: false,
      hasNoRequirementSelection: true,
      requirementIds: [],
    }
    renderRequirementsSpecificationDetailClient()

    const toggle = await screen.findByRole('switch', {
      name: 'specification.filterWithRequirementSelectionQuestions',
    })
    expect(toggle).toBeDisabled()
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAttribute(
      'title',
      'specification.requirementSelectionFilterDisabledTooltip',
    )
  })

  it('renders the requirement-selection toggle without a native input surface', async () => {
    availableRequirementsSelectionFilter = {
      applied: false,
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [202],
    }
    renderRequirementsSpecificationDetailClient()

    const toggle = await screen.findByRole('switch', {
      name: 'specification.filterWithRequirementSelectionQuestions',
    })
    const switchTrack = toggle.querySelector('span[aria-hidden="true"]')
    if (!(switchTrack instanceof HTMLElement)) {
      throw new Error('Expected requirement-selection toggle track')
    }

    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.className).not.toContain('focus-within:ring')
    expect(toggle.className).not.toContain('absolute')
    expect(toggle.className).not.toContain('inset-0')
    expect(toggle.className).not.toContain('w-full')
    expect(switchTrack.className).not.toContain('peer-focus-visible:ring')
  })

  it('keeps the requirement-selection toggle mounted while filtered requirements refresh', async () => {
    availableRequirementsSelectionFilter = {
      applied: false,
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [202],
    }
    renderRequirementsSpecificationDetailClient()

    const toggle = await screen.findByRole('switch', {
      name: 'specification.filterWithRequirementSelectionQuestions',
    })

    let resolveFetch:
      | ((value: { json: () => Promise<unknown>; ok: boolean }) => void)
      | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve
        }),
    )

    fireEvent.click(toggle)

    await waitFor(() => {
      expect(
        availableRequirementsFetchUrls().some(url =>
          url.includes('applyRequirementSelectionFilter=true'),
        ),
      ).toBe(true)
    })

    expect(
      screen.getByRole('switch', {
        name: 'specification.filterWithRequirementSelectionQuestions',
      }),
    ).toBeChecked()

    await act(async () => {
      resolveFetch?.(
        okJson({
          pagination: { hasMore: false },
          requirements: [initialAvailableRequirement],
          selectionFilter: {
            applied: true,
            hasCurrentAnswers: true,
            hasRequirementSelection: true,
            hasNoRequirementSelection: false,
            requirementIds: [202],
          },
        }),
      )
    })
  })

  it('loads more available requirements without sending the fixed status filter', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableRequirements: {
        hasMore: true,
        rows: [initialAvailableRequirement],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'load-more-available' }))

    await waitFor(() => {
      expect(
        availableRequirementsFetchUrls().some(
          url => searchParamsFromPath(url).get('offset') === '1',
        ),
      ).toBe(true)
    })

    const params = searchParamsFromPath(
      availableRequirementsFetchUrls().find(
        url => searchParamsFromPath(url).get('offset') === '1',
      ) ?? '',
    )
    expect(params.has('statuses')).toBe(false)
  })

  it('opens and closes the specification edit dialog from the title action', async () => {
    const { container } = renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    const headerSummary = container.querySelector(
      '[data-specification-detail-header-summary="true"]',
    )
    const headerMetadata = container.querySelector(
      '[data-specification-detail-header-metadata="true"]',
    )
    const pageShell = container.querySelector(
      '[data-specification-detail-page-shell="true"]',
    ) as HTMLDivElement | null
    const splitPanel = container.querySelector(
      '[data-specification-detail-split-panel="true"]',
    ) as HTMLDivElement | null
    const titleRow = container.querySelector(
      '[data-specification-detail-title-row="true"]',
    )
    expect(headerSummary).toBeTruthy()
    expect(headerMetadata).toBeTruthy()
    expect(pageShell).toBeTruthy()
    expect(splitPanel).toBeTruthy()
    expect(titleRow).toBeTruthy()
    expect(pageShell?.className).toContain('xl:h-[calc(100dvh-4rem)]')
    expect(splitPanel?.className).toContain('xl:-mx-8')
    expect(splitPanel?.className).toContain('xl:flex-1')
    expect(
      screen.queryByRole('link', { name: 'nav.specifications' }),
    ).not.toBeInTheDocument()
    expect(headerSummary).toHaveTextContent('Platform')
    expect(headerSummary).toHaveTextContent('Ada Admin')
    expect(headerSummary).toHaveTextContent('SE5560000001-ada1')
    expect(headerSummary).toHaveTextContent('Program')
    expect(headerSummary).toHaveTextContent('Shared IAM business case')
    expect(headerSummary).not.toHaveTextContent(
      'specification.businessNeedsReference',
    )
    expect(headerSummary).toHaveClass('xl:grid')
    expect(headerSummary).toHaveClass(
      'xl:grid-cols-[minmax(40vw,1fr)_minmax(0,1fr)]',
    )
    expect(headerMetadata).not.toHaveTextContent('Shared IAM business case')
    expect(headerMetadata).toHaveClass('grid-flow-col')
    expect(headerMetadata).toHaveClass('auto-cols-[minmax(12rem,1fr)]')
    expect(headerMetadata).toHaveClass('overflow-x-auto')
    expect(headerMetadata).toHaveClass('xl:auto-cols-fr')
    expect(headerMetadata).not.toHaveClass('xl:grid-cols-3')

    const editButton = screen.getByRole('button', {
      name: /specification\.editSpecification/i,
    })
    expect(editButton).toHaveAttribute('aria-expanded', 'false')
    expect(editButton).toHaveAttribute(
      'data-developer-mode-name',
      'detail action',
    )
    expect(editButton).toHaveAttribute(
      'data-developer-mode-context',
      'requirements specification detail',
    )
    expect(editButton).toHaveAttribute(
      'data-developer-mode-value',
      'edit specification',
    )
    expect(titleRow).toContainElement(
      screen.getByRole('heading', {
        level: 1,
        name: 'Authorization and IAM',
      }),
    )
    expect(titleRow).toContainElement(editButton)

    fireEvent.click(editButton)

    expect(editButton).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', {
      name: /specification\.editSpecification/i,
    })
    expect(
      within(dialog).getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Authorization and IAM')

    const form = document.body.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="requirements specification detail"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'edit')

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: /specification\.name/ }),
      ).not.toBeInTheDocument()
    })
    expect(editButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not fail open when specification permissions are missing', async () => {
    const { permissions: omittedPermissions, ...specWithoutPermissions } =
      initialSpec
    void omittedPermissions

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      spec: specWithoutPermissions,
    })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', {
        name: /specification\.editSpecification/i,
      }),
    ).not.toBeInTheDocument()
  })

  it('does not show a read-only notice for assignment-only managers', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      spec: {
        ...initialSpec,
        permissions: {
          canEditContent: false,
          canManageAssignments: true,
          canReviewDecisions: false,
          canUseAi: false,
        },
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    expect(
      screen.getByRole('button', {
        name: /specification\.editSpecification/i,
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('specification.readOnlyNotice')).toBeNull()
  })

  it('ignores stale and invalid stored detail column ids', async () => {
    window.localStorage.setItem(
      'requirements-specifications.visibleColumns.left.v2',
      JSON.stringify(['uniqueId']),
    )
    window.localStorage.setItem(
      'requirements-specifications.visibleColumns.left.v3',
      JSON.stringify(['uniqueId', 'legacySpecificationColumn']),
    )

    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(requirementsTableMock).toHaveBeenCalled()
    })

    const leftTableProps = requirementsTableMock.mock.calls.find(
      ([props]) => props.stickyTitle,
    )?.[0]

    expect(leftTableProps?.visibleColumns).toEqual([
      'uniqueId',
      'description',
      'area',
      'needsReference',
    ])
  })

  it('passes context-specific reset defaults to the detail tables', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(requirementsTableMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    const tableProps = requirementsTableMock.mock.calls.map(call => call[0])
    const leftTableProps = tableProps.find(
      props => props.rows[0]?.id === initialSpecificationItem.id,
    )
    const rightTableProps = tableProps.find(
      props => props.rows[0]?.id === initialAvailableRequirement.id,
    )

    expect(leftTableProps?.defaultVisibleColumns).toEqual([
      'uniqueId',
      'description',
      'area',
      'needsReference',
    ])
    expect(rightTableProps?.defaultVisibleColumns).toEqual([
      'uniqueId',
      'description',
      'area',
    ])
  })

  it('loads persisted detail columns after the hydration-safe default render', async () => {
    const storedLeftColumns = [
      'uniqueId',
      'description',
      'area',
      'needsReference',
      'status',
    ]
    const storedRightColumns = [
      'uniqueId',
      'description',
      'area',
      'status',
      'type',
    ]
    window.localStorage.setItem(
      'requirement-specifications.visibleColumns.left.v1',
      JSON.stringify(storedLeftColumns),
    )
    window.localStorage.setItem(
      'requirement-specifications.visibleColumns.right.v1',
      JSON.stringify(storedRightColumns),
    )

    renderRequirementsSpecificationDetailClient()

    const firstLeftTableProps = requirementsTableMock.mock.calls.find(
      ([props]) => props.rows[0]?.id === initialSpecificationItem.id,
    )?.[0]

    expect(firstLeftTableProps?.visibleColumns).toEqual([
      'uniqueId',
      'description',
      'area',
      'needsReference',
    ])

    await waitFor(() => {
      const latestCalls = [...requirementsTableMock.mock.calls].reverse()
      const latestLeftTableProps = latestCalls.find(
        ([props]) => props.rows[0]?.id === initialSpecificationItem.id,
      )?.[0]
      const latestRightTableProps = latestCalls.find(
        ([props]) => props.rows[0]?.id === initialAvailableRequirement.id,
      )?.[0]

      expect(latestLeftTableProps?.visibleColumns).toEqual(storedLeftColumns)
      expect(latestRightTableProps?.visibleColumns).toEqual(storedRightColumns)
    })
    expect(
      window.localStorage.getItem(
        'requirement-specifications.visibleColumns.left.v1',
      ),
    ).toBe(JSON.stringify(storedLeftColumns))
  })

  it('uses inline top rails and embeds the split panel tabs in sticky headers', async () => {
    const { container } = renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(requirementsTableMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    expect(
      screen.queryByText('specification.itemsInSpecification', {
        selector: 'h2',
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('specification.availableRequirements', {
        selector: 'h2',
      }),
    ).not.toBeInTheDocument()
    const stickyTitles = screen.getAllByTestId(
      'requirements-table-sticky-title',
    )
    const leftStickyTitle = stickyTitles.find(element =>
      within(element).queryByRole('tab', {
        name: /specification\.itemsInSpecification/,
      }),
    )
    const rightStickyTitle = stickyTitles.find(element =>
      within(element).queryByRole('tab', {
        name: /specification\.availableRequirements/,
      }),
    )

    expect(leftStickyTitle).toBeTruthy()
    expect(rightStickyTitle).toBeTruthy()
    expect(
      within(leftStickyTitle as HTMLElement).getByRole('tablist', {
        name: 'specification.leftPanelTabs',
      }),
    ).toBeInTheDocument()
    expect(
      within(leftStickyTitle as HTMLElement).getByRole('tab', {
        name: /specification\.needsReferences/,
      }),
    ).toBeInTheDocument()
    expect(
      within(rightStickyTitle as HTMLElement).getByRole('tablist', {
        name: 'specification.rightPanelTabs',
      }),
    ).toBeInTheDocument()
    expect(
      within(rightStickyTitle as HTMLElement).getByRole('tab', {
        name: /specification\.availableRequirements/,
      }),
    ).toHaveAttribute('aria-controls', 'right-panel-available')
    const questionsTab = within(rightStickyTitle as HTMLElement).getByRole(
      'tab',
      {
        name: /specification\.requirementSelectionQuestions/,
      },
    )
    expect(questionsTab).toHaveAttribute(
      'aria-controls',
      'right-panel-questions',
    )

    fireEvent.click(questionsTab)

    await waitFor(() => {
      expect(
        screen.getByText('specificationRequirementSelection.noQuestions'),
      ).toBeInTheDocument()
    })
    const questionsPanel = container.querySelector('#right-panel-questions')

    expect(questionsPanel).toBeTruthy()
    expect(
      within(questionsPanel as HTMLElement).getByRole('tablist', {
        name: 'specification.rightPanelTabs',
      }),
    ).toBeInTheDocument()
    expect(
      within(questionsPanel as HTMLElement).queryByText(
        'specificationRequirementSelection.title',
        { selector: 'h2' },
      ),
    ).not.toBeInTheDocument()

    const tableProps = requirementsTableMock.mock.calls.map(call => call[0])

    expect(
      tableProps.every(
        props => props.floatingActionRailPlacement === 'inline-top',
      ),
    ).toBe(true)
    expect(
      tableProps.every(
        props => props.stickyTopOffsetClassName === 'top-16 xl:top-0',
      ),
    ).toBe(true)
    expect(
      container.querySelector('[data-specification-detail-list-panel="items"]'),
    ).toBeTruthy()
    expect(
      container.querySelector(
        '[data-specification-detail-list-panel="available"]',
      ),
    ).toBeTruthy()
  })

  it('filters requirement applications when a requirement package chip is selected', async () => {
    const requirementPackages = [
      { id: 1, name: 'Mobile use' },
      { id: 2, name: 'Operations' },
    ]
    const firstItem = {
      ...initialSpecificationItem,
      requirementPackageIds: [1],
    }
    const secondItem = {
      ...initialSpecificationItem,
      id: 102,
      itemRef: 'lib:32',
      requirementPackageIds: [2],
      specificationItemId: 32,
      uniqueId: 'BEH0002',
      version: {
        ...initialSpecificationItem.version,
        description: 'Operational monitoring should be in place.',
      },
    }

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      requirementPackages,
      specificationItems: [firstItem, secondItem],
    })

    await waitFor(() => {
      expect(
        screen.getByTestId('requirements-table-items-rows'),
      ).toHaveTextContent('lib:31,lib:32')
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-items-1' }),
    )

    await waitFor(() => {
      const latestItemsProps = [...requirementsTableMock.mock.calls]
        .reverse()
        .find(([props]) => !props.onLoadMore)?.[0] as
        | {
            filterValues?: { requirementPackageIds?: number[] }
            rows: { id: number }[]
          }
        | undefined

      expect(latestItemsProps?.filterValues).toEqual({
        requirementPackageIds: [1],
      })
      expect(latestItemsProps?.rows.map(row => row.id)).toEqual([101])
    })
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).not.toHaveTextContent('lib:32')
  })

  it('keeps the add dialog open and shows inline errors when adding requirements fails', async () => {
    addRequirementsResponse = {
      body: { error: 'Could not add requirements' },
      ok: false,
    }

    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )

    const dialog = await screen.findByRole('dialog')

    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add requirements',
    )
    expect(dialog).toBeInTheDocument()
  })

  it('closes the add dialog when Escape is pressed inside the panel', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )

    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
      target: { value: 'new' },
    })

    fireEvent.keyDown(
      screen.getByLabelText('specification.addNeedsRefTextLabel'),
      {
        key: 'Escape',
      },
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('disables needs-reference inputs and help toggles while add is submitting', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )

    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
      target: { value: 'new' },
    })

    const select = screen.getByLabelText('specification.addNeedsRef')
    const textarea = screen.getByLabelText('specification.addNeedsRefTextLabel')
    const needsRefHelpButton = screen.getByRole('button', {
      name: 'common.help: specification.addNeedsRef',
    })
    const needsRefTextHelpButton = screen.getByRole('button', {
      name: 'common.help: specification.addNeedsRefTextLabel',
    })

    let resolvePost:
      | ((value: { json: () => Promise<unknown>; ok: boolean }) => void)
      | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolvePost = resolve
        }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    await waitFor(() => {
      expect(select).toBeDisabled()
      expect(textarea).toBeDisabled()
      expect(needsRefHelpButton).toBeDisabled()
      expect(needsRefTextHelpButton).toBeDisabled()
    })

    await act(async () => {
      resolvePost?.({
        json: async () => ({ ok: true }),
        ok: true,
      })
    })
  })

  it('keeps the add dialog open when a post-add refresh fails', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )

    const dialog = await screen.findByRole('dialog')
    failNextSpecificationItemsFetch = true

    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('common.error')
    expect(dialog).toBeInTheDocument()
  })

  it('shows a warning when loading more available requirements fails', async () => {
    failNextAvailableRequirementsFetch = true

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableRequirements: {
        hasMore: true,
        rows: [initialAvailableRequirement],
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'load-more-available' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'specification.loadAvailableRequirementsFailed',
    )
  })

  it('opens the specification-local requirement dialog from the left-panel action', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    const createButton = screen.getByRole('button', {
      name: 'specification.newLocalRequirement',
    })
    expect(createButton).toHaveAttribute(
      'data-developer-mode-name',
      'table action',
    )
    expect(createButton).toHaveAttribute(
      'data-developer-mode-context',
      'requirements specification detail',
    )
    expect(createButton).toHaveAttribute(
      'data-developer-mode-value',
      'create local requirement',
    )

    fireEvent.click(createButton)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'specification.newLocalRequirement',
        }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('requirement.area')).not.toBeInTheDocument()
  })

  it('opens the needs references tab, persists the URL parameter, and shows usage details', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '2026-04-20T10:00:00.000Z',
          description: null,
          id: 81,
          libraryItemCount: 1,
          linkedItemCount: 1,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '2026-04-20T10:00:00.000Z',
        },
      ],
      specificationItems: [
        {
          ...initialSpecificationItem,
          needsReference: 'IAM-42',
          needsReferenceId: 81,
          specificationItemStatusNameEn: 'Included',
        },
      ],
    })

    expect(
      screen.getByRole('button', { name: 'common.export' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )

    expect(replaceStateSpy).toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'specification.newNeedsReference' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.export' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('IAM-42')).toBeInTheDocument()
    expect(
      screen.getByText('specification.missingNeedsReferenceDescription'),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.toggleNeedsReferenceUsage/,
      }),
    )

    expect(screen.getByText('BEH0001')).toBeInTheDocument()
    expect(screen.getByText('RBAC should be enforced.')).toBeInTheDocument()
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('creates a needs reference with a description from the register tab', async () => {
    renderRequirementsSpecificationDetailClient()

    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.newNeedsReference' }),
    )

    fireEvent.change(screen.getByLabelText('specification.needsReference'), {
      target: { value: 'IAM-42' },
    })
    fireEvent.change(
      screen.getByLabelText('specification.needsReferenceDescription'),
      {
        target: { value: 'Access management work' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/ETJANST-UPP-2026/needs-references',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url ===
          '/api/requirements-specifications/ETJANST-UPP-2026/needs-references' &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(JSON.parse(String((postCall?.[1] as RequestInit).body))).toEqual({
      description: 'Access management work',
      text: 'IAM-42',
    })
  })

  it('passes reduced-motion preferences to the needs reference form modal', async () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)
    renderRequirementsSpecificationDetailClient()

    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.newNeedsReference' }),
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(fadeMotion).toHaveBeenCalledWith(true)
    expect(dialogPanelMotion).toHaveBeenCalledWith(true)
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('updates a single item needs reference inline from the requirements table', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '2026-04-20T10:00:00.000Z',
          description: 'Access management work',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '2026-04-20T10:00:00.000Z',
        },
      ],
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'assign-needs-ref-lib:31' }),
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'assign-needs-ref-lib:31' }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/ETJANST-UPP-2026/items/lib%3A31',
        expect.objectContaining({
          body: JSON.stringify({ needsReferenceId: 81 }),
          method: 'PATCH',
        }),
      )
    })
  })

  it('bulk-updates needs references for selected requirement applications', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '2026-04-20T10:00:00.000Z',
          description: 'Access management work',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '2026-04-20T10:00:00.000Z',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.change(
      screen.getByLabelText('specification.bulkNeedsReferenceLabel'),
      { target: { value: '81' } },
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.applyNeedsReferenceSelected/,
      }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/ETJANST-UPP-2026/items',
        expect.objectContaining({
          body: JSON.stringify({
            itemRefs: ['lib:31'],
            needsReferenceId: 81,
          }),
          method: 'PATCH',
        }),
      )
    })
  })

  it('opens contextual help for the bulk needs reference selector', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '2026-04-20T10:00:00.000Z',
          description: 'Access management work',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '2026-04-20T10:00:00.000Z',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'common.help: specification.bulkNeedsReferenceLabel',
      }),
    )

    expect(
      screen.getByText('specification.bulkNeedsReferenceHelp'),
    ).toBeInTheDocument()
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('shows bulk needs reference response failures next to the bulk controls', async () => {
    bulkNeedsReferencePatchResponse = {
      body: { error: 'Could not update selected requirements' },
      ok: false,
    }
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '2026-04-20T10:00:00.000Z',
          description: 'Access management work',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '2026-04-20T10:00:00.000Z',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.change(
      screen.getByLabelText('specification.bulkNeedsReferenceLabel'),
      { target: { value: '81' } },
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.applyNeedsReferenceSelected/,
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not update selected requirements',
      )
    })

    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )

    expect(
      screen.queryByText('Could not update selected requirements'),
    ).not.toBeInTheDocument()
  })

  it('catches thrown bulk needs reference request errors', async () => {
    bulkNeedsReferencePatchError = new Error('Network unavailable')
    renderRequirementsSpecificationDetailClient()

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.applyNeedsReferenceSelected/,
      }),
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
    })
  })
})
