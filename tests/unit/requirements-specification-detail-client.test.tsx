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
import RequirementsSpecificationDetailClient from '@/app/[locale]/specifications/[specificationId]/requirements-specification-detail-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
import type {
  RequirementPackageOption,
  RequirementSortState,
} from '@/lib/requirements/list-view'
import type {
  RequirementsSpecificationDetailInitialData,
  SpecificationListItem,
  SpecificationPreloadError,
} from '@/lib/specifications/preload-types'

const requirementsTableMock = vi.fn()
const lazyFeatureState = vi.hoisted(() => ({
  aiRenderSpy: vi.fn(),
  importRenderSpy: vi.fn(),
}))
const intlState = vi.hoisted(() => ({ locale: 'en' }))
const pdfDownloadState = vi.hoisted(() => ({
  clearError: vi.fn(),
  download: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => intlState.locale,
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

vi.mock('@/components/LazyAiRequirementGenerator', () => ({
  default: (props: Record<string, unknown>) => {
    lazyFeatureState.aiRenderSpy(props)
    return props.open ? <div data-testid="lazy-ai-authoring" /> : null
  },
}))

vi.mock('@/components/LazyRequirementsImportDialog', () => ({
  default: (props: Record<string, unknown>) => {
    lazyFeatureState.importRenderSpy(props)
    return props.open ? <div data-testid="lazy-import-review" /> : null
  },
}))

vi.mock('@/components/RequirementsTable', () => ({
  FloatingActionPill: (props: {
    action: {
      ariaLabel: string
      developerModeContext?: string
      developerModeValue?: string
      hidden?: boolean
      icon: ReactNode
      id: string
      menuItems?: {
        disabled?: boolean
        id: string
        kind?: 'separator'
        label?: string
        onClick?: (returnFocusTarget?: HTMLButtonElement | null) => void
      }[]
      onClick?: () => void
    }
  }) => {
    const { action } = props
    if (action.hidden) return null
    return (
      <div>
        <button
          aria-label={action.ariaLabel}
          data-developer-mode-context={action.developerModeContext}
          data-developer-mode-name="table action"
          data-developer-mode-value={action.developerModeValue}
          onClick={action.onClick}
          type="button"
        >
          {action.icon}
        </button>
        {action.menuItems ? (
          <div role="menu">
            {action.menuItems.map(item =>
              item.kind === 'separator' ? (
                <hr key={item.id} />
              ) : (
                <button
                  disabled={item.disabled}
                  key={item.id}
                  onClick={event => item.onClick?.(event.currentTarget)}
                  role="menuitem"
                  type="button"
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
    )
  },
  default: (props: {
    defaultVisibleColumns?: string[]
    columnPickerPlacement?: string
    floatingActionRailPlacement?: string
    floatingActions?: {
      ariaLabel: string
      developerModeContext?: string
      developerModeValue?: string
      hidden?: boolean
      icon: ReactNode
      id: string
      menuItems?: {
        disabled?: boolean
        href?: string
        icon?: ReactNode
        id: string
        label: string
        onClick?: (returnFocusTarget?: HTMLButtonElement | null) => void
      }[]
      onClick?: () => void
      position?: string
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
    onSortChange?: (value: RequirementSortState) => void
    requirementPackages?: { id: number; name: string }[]
    rows: { id: number; itemRef?: string; requirementPackageIds?: number[] }[]
    selectable?: boolean
    selectedIds?: Set<number>
    showSelectAll?: boolean
    sortState?: RequirementSortState
    statusRow?: ReactNode
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
        <div data-testid={`requirements-table-${tableKind}-status`}>
          {props.statusRow}
        </div>
        {props.floatingActions
          ?.filter(action => !action.hidden)
          .map(action => (
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
        {props.selectable && props.rows[0] ? (
          <button
            aria-label={`select-row-${props.rows[0].id}`}
            onClick={() => {
              const next = new Set(props.selectedIds ?? [])
              if (next.has(props.rows[0].id)) {
                next.delete(props.rows[0].id)
              } else {
                next.add(props.rows[0].id)
              }
              props.onSelectionChange?.(next)
            }}
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
        {props.onSortChange ? (
          <button
            aria-label={`sort-description-${tableKind}`}
            onClick={() =>
              props.onSortChange?.({
                by: 'description',
                direction:
                  props.sortState?.by === 'description' &&
                  props.sortState.direction === 'asc'
                    ? 'desc'
                    : 'asc',
              })
            }
            type="button"
          >
            sort description
          </button>
        ) : null}
        {`rows:${props.rows.length}`}
      </div>
    )
  },
}))

vi.mock('@/components/reports/pdf/useServerPdfDownload', () => ({
  useServerPdfDownload: () => ({
    clearError: pdfDownloadState.clearError,
    dialog: null,
    download: pdfDownloadState.download,
    downloading: false,
    error: null,
  }),
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
const defaultSpecificationId = 8
let addRequirementsResponse: { body: unknown; ok: boolean }
let activeSpecificationId = defaultSpecificationId
let bulkNeedsReferencePatchError: Error | null
let bulkNeedsReferencePatchResponse: { body: unknown; ok: boolean } | null
let exportCsvError: Error | null
let failNextAvailableRequirementsFetch = false
let failNextSpecificationItemsFetch = false
let specificationItemsGetItems: SpecificationListItem[]
let failedDeviationItemRefs: Set<string>
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
  specificationCode: 'ETJANST-UPP-2026',
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
    verifiable: true,
    priorityLevelColor: null,
    priorityLevelId: null,
    priorityLevelNameEn: null,
    priorityLevelNameSv: null,
    priorityLevelSortOrder: null,
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
    verifiable: true,
    priorityLevelColor: null,
    priorityLevelId: null,
    priorityLevelNameEn: null,
    priorityLevelNameSv: null,
    priorityLevelSortOrder: null,
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
    aiGenerationAvailability: {
      disabledByEnvironment: false,
      effectiveRequirementGenerationEnabled: true,
    },
    areas: [],
    availableNeedsRefs: [],
    availableRequirements: {
      hasMore: false,
      nextCursor: null,
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
  specificationId = defaultSpecificationId,
) {
  activeSpecificationId = specificationId
  return render(
    <ConfirmModalProvider>
      <RequirementsSpecificationDetailClient
        initialData={initialData}
        specificationId={specificationId}
      />
    </ConfirmModalProvider>,
  )
}

function specificationApiPath(path = '') {
  return `/api/requirements-specifications/${activeSpecificationId}${path}`
}

function availableRequirementsFetchUrls(): string[] {
  return fetchMock.mock.calls
    .map(([input]) =>
      typeof input === 'string' ? input : (input as Request).url,
    )
    .filter(url =>
      url.startsWith(`${specificationApiPath('/available-requirements')}?`),
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
  const itemsTable = calls
    .slice()
    .reverse()
    .find(
      props =>
        props.floatingActionRailPlacement === 'inline-top' && !props.onLoadMore,
    )
  expect(itemsTable).toBeDefined()
  return itemsTable as NonNullable<typeof itemsTable>
}

describe('RequirementsSpecificationDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intlState.locale = 'en'
    vi.mocked(useReducedMotion).mockReturnValue(false)
    requirementsTableMock.mockReset()
    pdfDownloadState.clearError.mockReset()
    pdfDownloadState.download.mockReset()
    pdfDownloadState.download.mockResolvedValue(undefined)
    addRequirementsResponse = { body: { ok: true }, ok: true }
    activeSpecificationId = defaultSpecificationId
    bulkNeedsReferencePatchError = null
    bulkNeedsReferencePatchResponse = null
    exportCsvError = null
    failNextAvailableRequirementsFetch = false
    failNextSpecificationItemsFetch = false
    specificationItemsGetItems = [initialSpecificationItem]
    failedDeviationItemRefs = new Set()
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

        if (
          url.startsWith('/api/specification-item-deviations/') &&
          method === 'POST'
        ) {
          const itemRef = decodeURIComponent(url.split('/').at(-1) ?? '')
          return Promise.resolve(
            failedDeviationItemRefs.has(itemRef)
              ? { json: async () => ({ error: 'Failed' }), ok: false }
              : okJson({ deviation: { id: 1 }, ok: true }),
          )
        }

        if (url === specificationApiPath()) {
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
              specificationCode: 'ETJANST-UPP-2026',
            }),
          )
        }

        if (url === specificationApiPath('/items') && method === 'POST') {
          return Promise.resolve({
            json: async () => addRequirementsResponse.body,
            ok: addRequirementsResponse.ok,
          })
        }

        if (url === specificationApiPath('/items') && method === 'PATCH') {
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
          const body = JSON.parse(String(init?.body)) as {
            itemRefs: string[]
            needsReferenceId: number | null
          }
          specificationItemsGetItems = specificationItemsGetItems.map(item =>
            item.itemRef && body.itemRefs.includes(item.itemRef)
              ? { ...item, needsReferenceId: body.needsReferenceId }
              : item,
          )
          return Promise.resolve(okJson({ ok: true, updatedCount: 1 }))
        }

        if (url === specificationApiPath('/items') && method === 'DELETE') {
          const body = JSON.parse(String(init?.body)) as { itemRefs: string[] }
          specificationItemsGetItems = specificationItemsGetItems.filter(
            item => !item.itemRef || !body.itemRefs.includes(item.itemRef),
          )
          return Promise.resolve(okJson({ ok: true, removedCount: 1 }))
        }

        if (url === specificationApiPath('/items') && method === 'GET') {
          if (failNextSpecificationItemsFetch) {
            failNextSpecificationItemsFetch = false
            return Promise.resolve({
              json: async () => ({}),
              ok: false,
            })
          }

          return Promise.resolve(okJson({ items: specificationItemsGetItems }))
        }

        if (
          url.startsWith(
            `${specificationApiPath('/available-requirements')}?`,
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
            `${specificationApiPath('/available-requirements')}?`,
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
                    verifiable: true,
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

        if (url.startsWith(`${specificationApiPath('/exports')}?`)) {
          if (exportCsvError) {
            return Promise.reject(exportCsvError)
          }

          return Promise.resolve({
            blob: async () => new Blob(['Krav-ID\r\nBEH0001']),
            ok: true,
          })
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

        if (url === '/api/priority-levels') {
          return Promise.resolve(okJson({ priorityLevels: [] }))
        }

        if (url === '/api/requirement-packages') {
          return Promise.resolve(okJson({ requirementPackages: [] }))
        }

        if (
          url === `${specificationApiPath('/items')}/lib%3A31` &&
          method === 'PATCH'
        ) {
          return Promise.resolve(okJson({ ok: true }))
        }

        if (
          url === specificationApiPath('/needs-references') &&
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
          url === specificationApiPath('/needs-references') &&
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
          url === specificationApiPath('/needs-references') &&
          method === 'DELETE'
        ) {
          return Promise.resolve(okJson({ ok: true }))
        }

        if (
          url === specificationApiPath('/needs-references') &&
          method === 'GET'
        ) {
          return Promise.resolve(okJson({ needsReferences: [] }))
        }

        if (url === specificationApiPath('/requirement-selection-answers')) {
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

  it('shows lifecycle-matched report options and always keeps full CSV export', async () => {
    renderRequirementsSpecificationDetailClient()
    await waitForInitialAvailableRequirementsRefresh()

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{ href?: string; id: string; onClick?: () => void }>
    }>
    const moreActions = floatingActions.find(
      action => action.id === 'more-actions',
    )

    expect(moreActions?.hidden).toBe(false)
    expect(moreActions?.menuItems?.map(item => item.id)).toEqual([
      'ai-assist-local',
      'import-local',
      'separator-report-actions',
      'pdf-progress',
      'pdf-traceability',
      'separator-export-actions',
      'export-full',
    ])
    expect(moreActions?.menuItems).toEqual([
      expect.objectContaining({ id: 'ai-assist-local' }),
      expect.objectContaining({ id: 'import-local' }),
      expect.objectContaining({ id: 'separator-report-actions' }),
      expect.objectContaining({ id: 'pdf-progress' }),
      expect.objectContaining({ id: 'pdf-traceability' }),
      expect.objectContaining({ id: 'separator-export-actions' }),
      expect.objectContaining({ id: 'export-full' }),
    ])

    moreActions?.menuItems
      ?.find(item => item.id === 'pdf-progress')
      ?.onClick?.()
    moreActions?.menuItems
      ?.find(item => item.id === 'pdf-traceability')
      ?.onClick?.()

    expect(pdfDownloadState.download).toHaveBeenCalledWith({
      fallbackFilename:
        'specification.reportProfiles.progress Authorization and IAM ETJANST-UPP-2026.pdf',
      url: '/en/specifications/8/reports/pdf/progress',
    })
    expect(pdfDownloadState.download).toHaveBeenCalledWith({
      fallbackFilename:
        'specification.reportProfiles.traceability Authorization and IAM ETJANST-UPP-2026.pdf',
      url: '/en/specifications/8/reports/pdf/traceability?refs=lib%3A31',
    })
  })

  it('preserves menu triggers for direct import and AI-to-import handoff', async () => {
    renderRequirementsSpecificationDetailClient()
    await waitForInitialAvailableRequirementsRefresh()

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      id: string
      menuItems?: Array<{
        id: string
        onClick?: (returnFocusTarget?: HTMLButtonElement | null) => void
      }>
    }>
    const menuItems = floatingActions.find(
      action => action.id === 'more-actions',
    )?.menuItems
    const importAction = menuItems?.find(item => item.id === 'import-local')
    const aiAction = menuItems?.find(item => item.id === 'ai-assist-local')
    const importTrigger = document.createElement('button')
    const aiTrigger = document.createElement('button')
    document.body.append(importTrigger, aiTrigger)

    act(() => importAction?.onClick?.(importTrigger))
    expect(screen.getByTestId('lazy-import-review')).toBeInTheDocument()
    let importProps = lazyFeatureState.importRenderSpy.mock.calls.at(
      -1,
    )?.[0] as {
      onClose: (importSucceeded: boolean) => void
      open: boolean
      returnFocusTarget?: HTMLElement | null
    }
    expect(importProps.open).toBe(true)
    expect(importProps.returnFocusTarget).toBe(importTrigger)

    act(() => importProps.onClose(false))
    act(() => aiAction?.onClick?.(aiTrigger))
    expect(screen.getByTestId('lazy-ai-authoring')).toBeInTheDocument()
    const aiProps = lazyFeatureState.aiRenderSpy.mock.calls.at(-1)?.[0] as {
      onImportPreview: (payload: string, options: { preview?: unknown }) => void
      open: boolean
      returnFocusTarget?: HTMLElement | null
    }
    expect(aiProps.open).toBe(true)
    expect(aiProps.returnFocusTarget).toBe(aiTrigger)

    act(() => {
      aiProps.onImportPreview('{"requirements":[]}', {})
    })
    importProps = lazyFeatureState.importRenderSpy.mock.calls.at(-1)?.[0] as {
      onClose: (importSucceeded: boolean) => void
      open: boolean
      returnFocusTarget?: HTMLElement | null
    }
    expect(importProps.open).toBe(true)
    expect(importProps.returnFocusTarget).toBe(aiTrigger)
    expect(screen.getByTestId('lazy-import-review')).toBeInTheDocument()

    importTrigger.remove()
    aiTrigger.remove()
  })

  it('places kravunderlag create before columns and secondary actions after columns', async () => {
    renderRequirementsSpecificationDetailClient()
    await waitForInitialAvailableRequirementsRefresh()

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      id: string
      menuItems?: Array<{
        disabled?: boolean
        icon?: ReactNode
        id: string
        kind?: string
        label: string
      }>
      onClick?: () => void
      position?: string
      variant?: string
    }>
    const createLocalAction = floatingActions.find(
      action => action.id === 'create-local',
    )
    const moreActions = floatingActions.find(
      action => action.id === 'more-actions',
    )

    expect(itemsTable.columnPickerPlacement).toBe('betweenActions')
    expect(floatingActions.map(action => action.id)).toEqual([
      'create-local',
      'more-actions',
    ])
    expect(
      floatingActions.map(action => action.position ?? 'afterColumns'),
    ).toEqual(['beforeColumns', 'afterColumns'])
    expect(createLocalAction?.variant).toBe('primary')
    expect(createLocalAction?.menuItems).toBeUndefined()
    expect(createLocalAction?.onClick).toEqual(expect.any(Function))
    expect(moreActions?.menuItems).toEqual([
      expect.objectContaining({ disabled: false, id: 'ai-assist-local' }),
      expect.objectContaining({ id: 'import-local' }),
      expect.objectContaining({
        id: 'separator-report-actions',
        kind: 'separator',
      }),
      expect.objectContaining({ id: 'pdf-progress' }),
      expect.objectContaining({ id: 'pdf-traceability' }),
      expect.objectContaining({
        id: 'separator-export-actions',
        kind: 'separator',
      }),
      expect.objectContaining({ id: 'export-full' }),
    ])
    expect(
      moreActions?.menuItems
        ?.filter(item => item.kind !== 'separator')
        .every(item => item.icon != null),
    ).toBe(true)
  })

  it('keeps profile PDF report actions lifecycle-scoped', async () => {
    renderRequirementsSpecificationDetailClient(createInitialData(), 8)
    await waitForInitialAvailableRequirementsRefresh()

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{ href?: string; id: string; onClick?: () => void }>
    }>
    const moreActions = floatingActions.find(
      action => action.id === 'more-actions',
    )

    expect(moreActions?.menuItems?.map(item => item.id)).toContain(
      'pdf-progress',
    )
    expect(moreActions?.menuItems?.map(item => item.id)).toContain(
      'pdf-traceability',
    )

    moreActions?.menuItems
      ?.find(item => item.id === 'pdf-progress')
      ?.onClick?.()

    expect(pdfDownloadState.download).toHaveBeenCalledWith({
      fallbackFilename:
        'specification.reportProfiles.progress Authorization and IAM ETJANST-UPP-2026.pdf',
      url: '/en/specifications/8/reports/pdf/progress',
    })
  })

  it('builds traceability report refs from the filtered requirement applications', async () => {
    const initialData = createInitialData()
    initialData.specificationItems = [
      {
        ...initialSpecificationItem,
        requirementPackageIds: [9],
      },
      {
        ...initialSpecificationItem,
        id: -41,
        itemRef: 'local:41',
        kind: 'specificationLocal',
        requirementPackageIds: [],
        specificationItemId: undefined,
        specificationLocalRequirementId: 41,
        uniqueId: 'KRAV0001',
        version: {
          ...initialSpecificationItem.version,
          description: 'Local-only application.',
          verifiable: false,
          status: 2,
          versionNumber: 1,
        },
      },
    ]
    initialData.requirementPackages = [
      { id: 9, name: 'Security package' },
    ] as RequirementPackageOption[]

    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()

    act(() => {
      latestItemsTableProps().onFilterChange?.({ requirementPackageIds: [9] })
    })

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{ href?: string; id: string }>
    }>
    const moreActions = floatingActions.find(
      action => action.id === 'more-actions',
    )

    expect(
      itemsTable.rows.map((row: { itemRef?: string }) => row.itemRef),
    ).toEqual(['lib:31'])
    expect(moreActions?.menuItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'pdf-traceability',
        }),
      ]),
    )
  })

  it('hides traceability report actions when filtered items exceed the report limit', async () => {
    const initialData = createInitialData()
    initialData.specificationItems = Array.from({ length: 201 }, (_, index) => {
      const itemId = index + 1
      return {
        ...initialSpecificationItem,
        id: 1000 + itemId,
        itemRef: `lib:${itemId}`,
        specificationItemId: itemId,
        uniqueId: `BEH${String(itemId).padStart(4, '0')}`,
      }
    })

    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{ href?: string; id: string; onClick?: () => void }>
    }>
    const moreActions = floatingActions.find(
      action => action.id === 'more-actions',
    )

    expect(moreActions?.hidden).toBe(false)
    expect(moreActions?.menuItems?.map(item => item.id)).toContain(
      'pdf-progress',
    )
    expect(moreActions?.menuItems?.map(item => item.id)).not.toContain(
      'pdf-traceability',
    )
  })

  it('logs CSV export failures from discarded menu handlers', async () => {
    const csvError = new Error('network unavailable')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    exportCsvError = csvError

    try {
      renderRequirementsSpecificationDetailClient()

      const itemsTable = latestItemsTableProps()
      const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
        hidden?: boolean
        id: string
        menuItems?: Array<{ href?: string; id: string; onClick?: () => void }>
      }>
      const moreActions = floatingActions.find(
        action => action.id === 'more-actions',
      )

      moreActions?.menuItems
        ?.find(menuItem => menuItem.id === 'export-full')
        ?.onClick?.()

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(csvError)
      })
    } finally {
      consoleError.mockRestore()
    }
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
        nextCursor: 'cursor-1',
        rows: [initialAvailableRequirement],
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'load-more-available' }))

    await waitFor(() => {
      expect(
        availableRequirementsFetchUrls().some(
          url => searchParamsFromPath(url).get('cursor') === 'cursor-1',
        ),
      ).toBe(true)
    })

    const params = searchParamsFromPath(
      availableRequirementsFetchUrls().find(
        url => searchParamsFromPath(url).get('cursor') === 'cursor-1',
      ) ?? '',
    )
    expect(params.has('statuses')).toBe(false)
  })

  it('reloads available requirements and announces an invalid cursor', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableRequirements: {
        hasMore: true,
        nextCursor: 'cursor-1',
        rows: [initialAvailableRequirement],
      },
    })
    await waitForInitialAvailableRequirementsRefresh()
    const requestCountBeforeLoadMore = availableRequirementsFetchUrls().length
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        clone() {
          return this
        },
        json: async () => ({ code: 'invalid_cursor' }),
        ok: false,
        status: 400,
      } as Response),
    )

    fireEvent.click(screen.getByRole('button', { name: 'load-more-available' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'common.requirementListRefreshed',
    )
    await waitFor(() => {
      expect(availableRequirementsFetchUrls()).toHaveLength(
        requestCountBeforeLoadMore + 2,
      )
    })
    expect(
      screen.getByTestId('requirements-table-available-rows'),
    ).toHaveTextContent('202')
  })

  it('ignores stale invalid-cursor recovery after available filters change', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableRequirements: {
        hasMore: true,
        nextCursor: 'cursor-1',
        rows: [initialAvailableRequirement],
      },
      requirementPackages: [{ id: 1, name: 'Mobile use' }],
    })
    await waitForInitialAvailableRequirementsRefresh()
    let resolveStaleLoadMore: ((response: Response) => void) | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>(resolve => {
          resolveStaleLoadMore = resolve
        }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'load-more-available' }))
    await waitFor(() => {
      expect(
        availableRequirementsFetchUrls().some(
          url => searchParamsFromPath(url).get('cursor') === 'cursor-1',
        ),
      ).toBe(true)
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-available-1' }),
    )
    await waitFor(() => {
      expect(
        availableRequirementsFetchUrls().some(url =>
          url.includes('requirementPackageIds=1'),
        ),
      ).toBe(true)
    })
    const requestCountAfterFilter = availableRequirementsFetchUrls().length

    await act(async () => {
      resolveStaleLoadMore?.({
        clone() {
          return this
        },
        json: async () => ({ code: 'invalid_cursor' }),
        ok: false,
        status: 400,
      } as Response)
    })
    expect(availableRequirementsFetchUrls()).toHaveLength(
      requestCountAfterFilter,
    )
    expect(screen.queryByText('common.requirementListRefreshed')).toBeNull()
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

  it('hides create actions but keeps output actions for read-only kravunderlag detail users', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      spec: {
        ...initialSpec,
        permissions: {
          canEditContent: false,
          canManageAssignments: false,
          canReviewDecisions: false,
          canUseAi: false,
        },
      },
    })
    await waitForInitialAvailableRequirementsRefresh()

    const itemsTable = latestItemsTableProps()
    expect(itemsTable.selectable).toBe(false)
    expect(
      screen.queryByRole('button', { name: 'select-row-101' }),
    ).not.toBeInTheDocument()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{ id: string; kind?: string }>
    }>

    expect(floatingActions.map(action => action.id)).toEqual(['more-actions'])
    expect(floatingActions[0]?.hidden).toBe(false)
    expect(floatingActions[0]?.menuItems?.map(item => item.id)).toEqual([
      'pdf-progress',
      'pdf-traceability',
      'separator-export-actions',
      'export-full',
    ])
    expect(
      floatingActions[0]?.menuItems?.some(
        item => item.id === 'ai-assist-local',
      ),
    ).toBe(false)
    expect(
      floatingActions[0]?.menuItems?.some(item => item.id === 'import-local'),
    ).toBe(false)
  })

  it('shows direct create and more actions but no columns action in the editable empty state', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: [],
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      ).toBeInTheDocument()
    })

    expect(
      screen.getByRole('button', { name: 'common.moreActions' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.columns' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.moreActions' }))

    expect(
      await screen.findByRole('menuitem', {
        name: 'specification.aiGenerate',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', {
        name: 'specification.importLocalRequirements',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('ignores stale and invalid stored detail column ids', async () => {
    window.localStorage.setItem(
      'requirements-specifications.visibleColumns.left.v2',
      JSON.stringify(['uniqueId']),
    )
    window.localStorage.setItem(
      'requirements-specifications.visibleColumns.left.v3',
      JSON.stringify(['uniqueId', 'unknownSpecificationColumn']),
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
      tableProps.every(props => props.stickyTopOffsetClassName === 'top-0'),
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

  it('sorts the complete requirement application list in both directions', async () => {
    const firstItem = {
      ...initialSpecificationItem,
      version: {
        ...initialSpecificationItem.version,
        description: 'Zulu requirement',
      },
    }
    const secondItem = {
      ...initialSpecificationItem,
      id: 102,
      itemRef: 'lib:32',
      specificationItemId: 32,
      uniqueId: 'BEH0002',
      version: {
        ...initialSpecificationItem.version,
        description: 'Alpha requirement',
      },
    }

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: [secondItem, firstItem],
    })

    const renderedRows = screen.getByTestId('requirements-table-items-rows')
    await waitFor(() => {
      expect(renderedRows).toHaveTextContent('lib:31,lib:32')
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'sort-description-items' }),
    )
    await waitFor(() => {
      expect(renderedRows).toHaveTextContent('lib:32,lib:31')
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'sort-description-items' }),
    )
    await waitFor(() => {
      expect(renderedRows).toHaveTextContent('lib:31,lib:32')
    })
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
        nextCursor: 'cursor-1',
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

  it('opens the specification-local requirement dialog directly from the left-panel create action', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    const createLocalRequirementButton = screen.getByRole('button', {
      name: 'specification.newLocalRequirement',
    })
    expect(createLocalRequirementButton).toHaveAttribute(
      'data-developer-mode-name',
      'table action',
    )
    expect(createLocalRequirementButton).toHaveAttribute(
      'data-developer-mode-context',
      'requirements specification detail',
    )
    expect(createLocalRequirementButton).toHaveAttribute(
      'data-developer-mode-value',
      'new local requirement',
    )

    await act(async () => {
      fireEvent.click(createLocalRequirementButton)
    })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'specification.newLocalRequirement',
        }),
      ).toBeInTheDocument()
    })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByLabelText('requirement.area')).toBeNull()
    expect(
      within(dialog).queryByText('requirement.requirementPackage'),
    ).toBeNull()

    const normReferenceFieldset = within(dialog)
      .getByText('requirement.normReferences')
      .closest('fieldset')
    const sidebarGrid = normReferenceFieldset?.parentElement
    expect(sidebarGrid).toHaveClass('lg:w-full')
    expect(sidebarGrid?.parentElement).toHaveClass(
      'lg:grid-cols-[minmax(0,1fr)_minmax(20rem,22rem)]',
    )
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
      screen.getByRole('button', { name: 'common.moreActions' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )

    expect(replaceStateSpy).toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'specification.newNeedsReference' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'common.moreActions' }),
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
        '/api/requirements-specifications/8/needs-references',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirements-specifications/8/needs-references' &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(
      JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({
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
        '/api/requirements-specifications/8/items/lib%3A31',
        expect.objectContaining({
          body: JSON.stringify({ needsReferenceId: 81 }),
          method: 'PATCH',
        }),
      )
    })
  })

  it('keeps stable item-ref selection through filtering and deselects exactly the hidden set', async () => {
    const hiddenItem = {
      ...initialSpecificationItem,
      id: -41,
      itemRef: 'local:41',
      kind: 'specificationLocal' as const,
      requirementPackageIds: [9],
      specificationItemId: undefined,
      specificationLocalRequirementId: 41,
      uniqueId: 'KRAV0001',
    }
    const initialData = {
      ...createInitialData(),
      requirementPackages: [
        { id: 9, name: 'Security package' },
      ] as RequirementPackageOption[],
      specificationItems: [initialSpecificationItem, hiddenItem],
    }
    specificationItemsGetItems = initialData.specificationItems
    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'sort-description-items' }),
    )
    expect(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-items-9' }),
    )

    expect(
      screen.getByTestId('requirements-table-items-status'),
    ).toHaveTextContent('specification.selectionStatus')
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.deselectHidden' }),
    )
    expect(
      screen.queryByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    ).not.toBeInTheDocument()
  })

  it('renders selected-item actions as icon buttons with translated tooltips', async () => {
    renderRequirementsSpecificationDetailClient()
    await waitForInitialAvailableRequirementsRefresh()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))

    for (const name of [
      'specification.assignNeedsReferenceAction',
      'specification.clearNeedsReferenceAction',
      'deviation.requestDeviationSelected',
      'specification.removeSelected',
    ]) {
      const button = screen.getByRole('button', { name })
      expect(button).toHaveAttribute('title', name)
      expect(button).not.toHaveTextContent(/\S/)
      expect(button).toHaveProperty('childElementCount', 1)
      expect(button.querySelector('svg')).toBeInTheDocument()
    }

    expect(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    ).toHaveClass('px-0', 'py-0')
  })

  it('preserves selection across an authoritative item refresh and clears it on locale change', async () => {
    const initialData = createInitialData()
    const view = renderRequirementsSpecificationDetailClient(initialData)
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'assign-needs-ref-lib:31' }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      ).toBeInTheDocument()
    })

    intlState.locale = 'sv'
    view.rerender(
      <ConfirmModalProvider>
        <RequirementsSpecificationDetailClient
          initialData={initialData}
          specificationId={defaultSpecificationId}
        />
      </ConfirmModalProvider>,
    )
    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: 'specification.assignNeedsReferenceAction',
        }),
      ).not.toBeInTheDocument()
    })
  })

  it('announces and deselects selected items that disappear during authoritative resolution', async () => {
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    specificationItemsGetItems = []
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('requirements-table-items-status'),
      ).toHaveTextContent('specification.selectionDisappeared')
    })
    expect(
      screen.queryByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    ).not.toBeInTheDocument()
  })

  it('clears needs-reference links as a distinct confirmed action and deselects successful targets', async () => {
    const item = { ...initialSpecificationItem, needsReferenceId: 81 }
    const initialData = {
      ...createInitialData(),
      specificationItems: [item],
    }
    specificationItemsGetItems = [item]
    renderRequirementsSpecificationDetailClient(initialData)
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.clearNeedsReferenceAction',
      }),
    )

    const confirmation = await screen.findByRole('alertdialog', {
      name: 'specification.clearNeedsReferenceTitle',
    })
    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: 'specification.clearNeedsReferenceAction',
      }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/8/items',
        expect.objectContaining({
          body: JSON.stringify({
            itemRefs: ['lib:31'],
            needsReferenceId: null,
          }),
          method: 'PATCH',
        }),
      )
    })
    expect(
      screen.queryByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    ).not.toBeInTheDocument()
  })

  it('distinguishes mixed removal and resolves all selected item refs before deletion', async () => {
    const localItem = {
      ...initialSpecificationItem,
      id: -41,
      isSpecificationLocal: true,
      itemRef: 'local:41',
      kind: 'specificationLocal' as const,
      specificationItemId: undefined,
      specificationLocalRequirementId: 41,
      uniqueId: 'KRAV0001',
    }
    const initialData = {
      ...createInitialData(),
      specificationItems: [initialSpecificationItem, localItem],
    }
    specificationItemsGetItems = initialData.specificationItems
    renderRequirementsSpecificationDetailClient(initialData)
    act(() => {
      latestItemsTableProps().onSelectionChange?.(new Set([101, -41]))
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )

    const confirmation = await screen.findByRole('alertdialog', {
      name: 'specification.removeMixedConfirmTitle',
    })
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.delete' }),
    )
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/8/items',
        expect.objectContaining({
          body: JSON.stringify({ itemRefs: ['lib:31', 'local:41'] }),
          method: 'DELETE',
        }),
      )
    })
  })

  it('creates one deviation per application and retains failed Requirement IDs in selection', async () => {
    const localItem = {
      ...initialSpecificationItem,
      id: -41,
      isSpecificationLocal: true,
      itemRef: 'local:41',
      kind: 'specificationLocal' as const,
      specificationItemId: undefined,
      specificationLocalRequirementId: 41,
      uniqueId: 'KRAV0001',
    }
    const initialData = {
      ...createInitialData(),
      specificationItems: [initialSpecificationItem, localItem],
    }
    specificationItemsGetItems = initialData.specificationItems
    failedDeviationItemRefs.add('local:41')
    renderRequirementsSpecificationDetailClient(initialData)
    act(() => {
      latestItemsTableProps().onSelectionChange?.(new Set([101, -41]))
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'deviation.requestDeviationSelected',
      }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'deviation.requestDeviation',
    })
    expect(within(dialog).getByText('BEH0001')).toBeInTheDocument()
    expect(within(dialog).getByText('KRAV0001')).toBeInTheDocument()
    fireEvent.change(
      within(dialog).getByLabelText(/deviation\.motivation/, {
        selector: 'textarea',
      }),
      { target: { value: 'Shared motivation' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'deviation.newDeviation' }),
    )

    await waitFor(() => {
      expect(latestItemsTableProps().selectedIds).toEqual(new Set([-41]))
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'deviation.bulkDeviationPartialFail',
    )
    const deviationPosts = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).startsWith('/api/specification-item-deviations/') &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(deviationPosts).toHaveLength(2)
    expect(
      deviationPosts.map(([, init]) =>
        JSON.parse(String((init as RequestInit).body)),
      ),
    ).toEqual([
      { motivation: 'Shared motivation' },
      { motivation: 'Shared motivation' },
    ])
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
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'specification.assignNeedsReferenceTitle',
    })
    expect(within(dialog).getByText('BEH0001')).toBeInTheDocument()
    fireEvent.change(
      within(dialog).getByLabelText('specification.needsReference'),
      { target: { value: '81' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.confirm' }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/8/items',
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

  it('opens contextual help in the bulk needs reference dialog', async () => {
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
        name: 'specification.assignNeedsReferenceAction',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'common.help: specification.needsReference',
      }),
    )

    expect(
      within(dialog).getByText('specification.assignNeedsReferenceHelp'),
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
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(
      within(dialog).getByLabelText('specification.needsReference'),
      { target: { value: '81' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.confirm' }),
    )

    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Could not update selected requirements',
      )
    })

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.cancel' }),
    )
    expect(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    ).toBeInTheDocument()
  })

  it('catches thrown bulk needs reference request errors', async () => {
    bulkNeedsReferencePatchError = new Error('Network unavailable')
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          description: null,
          id: 81,
          text: 'IAM-42',
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(
      within(dialog).getByLabelText('specification.needsReference'),
      { target: { value: '81' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.confirm' }),
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')
    })
  })
})
