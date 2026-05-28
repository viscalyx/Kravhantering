import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsSpecificationDetailClient from '@/app/[locale]/specifications/[slug]/requirements-specification-detail-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import type { FilterOption } from '@/lib/requirements/list-view'
import type { SpecificationPreloadError } from '@/lib/specifications/preload-types'

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

vi.mock('@/app/[locale]/requirements/[id]/requirement-detail-client', () => ({
  default: ({ requirementId }: { requirementId: number }) => (
    <div>{`Requirement detail ${requirementId}`}</div>
  ),
}))

vi.mock('@/components/RequirementsTable', () => ({
  default: (props: {
    floatingActionRailPlacement?: string
    floatingActions?: {
      ariaLabel: string
      developerModeContext?: string
      developerModeValue?: string
      icon: ReactNode
      id: string
      onClick?: () => void
    }[]
    filterValues?: { requirementPackageIds?: number[] }
    hasMore?: boolean
    loadingMore?: boolean
    onFilterChange?: (values: { requirementPackageIds?: number[] }) => void
    onLoadMore?: () => void | Promise<void>
    onSelectionChange?: (ids: Set<number>) => void
    requirementPackages?: { id: number; nameEn: string; nameSv: string }[]
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
              {requirementPackage.nameEn}
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
let failNextAvailableRequirementsFetch = false
let failNextSpecificationItemsFetch = false

const initialSpec = {
  businessNeedsReference: 'Shared IAM business case',
  canResponsibleGenerateAi: true,
  id: 8,
  implementationType: { id: 2, nameEn: 'Program', nameSv: 'Program' },
  lifecycleStatus: { id: 3, nameEn: 'Development', nameSv: 'Utveckling' },
  name: 'Authorization and IAM',
  responsibleDisplayName: 'Ada Admin',
  responsibleHsaId: 'SE5560000001-ada1',
  specificationImplementationTypeId: 2,
  specificationLifecycleStatusId: 3,
  specificationResponsibilityAreaId: 1,
  responsibilityArea: { id: 1, nameEn: 'Platform', nameSv: 'Plattform' },
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

function createInitialData() {
  return {
    areas: [],
    availableNeedsRefs: [],
    availableRequirements: {
      hasMore: false,
      rows: [initialAvailableRequirement],
    },
    errors: [] as SpecificationPreloadError[],
    leftNormReferenceOptions: [],
    requirementPackages: [] as FilterOption[],
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
    specificationResponsibilityAreas: [
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

describe('RequirementsSpecificationDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirementsTableMock.mockReset()
    addRequirementsResponse = { body: { ok: true }, ok: true }
    failNextAvailableRequirementsFetch = false
    failNextSpecificationItemsFetch = false
    fetchMock.mockImplementation(
      (input: string | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url
        const method =
          init?.method ?? (typeof input === 'string' ? 'GET' : input.method)

        if (url === '/api/specifications/ETJANST-UPP-2026') {
          return Promise.resolve(
            okJson({
              businessNeedsReference: 'Shared IAM business case',
              id: 8,
              implementationType: { nameEn: 'Program', nameSv: 'Program' },
              lifecycleStatus: { nameEn: 'Development', nameSv: 'Utveckling' },
              name: 'Authorization and IAM',
              responsibleDisplayName: 'Ada Admin',
              responsibleHsaId: 'SE5560000001-ada1',
              canResponsibleGenerateAi: true,
              specificationImplementationTypeId: 2,
              specificationLifecycleStatusId: 3,
              specificationResponsibilityAreaId: 1,
              responsibilityArea: { nameEn: 'Platform', nameSv: 'Plattform' },
              uniqueId: 'ETJANST-UPP-2026',
            }),
          )
        }

        if (
          url === '/api/specifications/ETJANST-UPP-2026/items' &&
          method === 'POST'
        ) {
          return Promise.resolve({
            json: async () => addRequirementsResponse.body,
            ok: addRequirementsResponse.ok,
          })
        }

        if (
          url === '/api/specifications/ETJANST-UPP-2026/items' &&
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

        if (url.startsWith('/api/requirements?')) {
          if (failNextAvailableRequirementsFetch) {
            failNextAvailableRequirementsFetch = false
            return Promise.resolve({
              json: async () => ({}),
              ok: false,
            })
          }

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

        if (url === '/api/specifications/ETJANST-UPP-2026/needs-references') {
          return Promise.resolve(okJson({ needsReferences: [] }))
        }

        if (url === '/api/specification-responsibility-areas') {
          return Promise.resolve(
            okJson({
              areas: [{ id: 1, nameEn: 'Platform', nameSv: 'Plattform' }],
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

  it('shows the partial preload warning banner when initial data contains errors', () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      errors: [{ key: 'available requirements', message: 'preload failed' }],
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'specification.partialDataLoadWarning',
    )
  })

  it('opens and closes the specification edit view from the title action', async () => {
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
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Authorization and IAM')

    const form = container.querySelector(
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

  it('uses inline top rails and sticky table titles for the split tables', async () => {
    const { container } = renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(requirementsTableMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    expect(
      screen.getByText('specification.itemsInSpecification', {
        selector: 'h2',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('specification.availableRequirements', {
        selector: 'h2',
      }),
    ).toBeInTheDocument()

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

  it('filters specification items when a requirement package chip is selected', async () => {
    const requirementPackages = [
      { id: 1, nameEn: 'Mobile use', nameSv: 'Mobil användning' },
      { id: 2, nameEn: 'Operations', nameSv: 'Drift' },
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
})
