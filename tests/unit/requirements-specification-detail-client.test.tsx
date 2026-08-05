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
  FilterValues,
  RequirementPackageOption,
  RequirementSortState,
} from '@/lib/requirements/list-view'
import type {
  RequirementsSpecificationDetailInitialData,
  SpecificationListItem,
  SpecificationPreloadError,
} from '@/lib/specifications/preload-types'
import { SPECIFICATION_PRELOAD_ERROR_KEYS } from '@/lib/specifications/preload-types'

const requirementsTableMock = vi.fn()
const lazyFeatureState = vi.hoisted(() => ({
  aiRenderSpy: vi.fn(),
  importRenderSpy: vi.fn(),
}))
const intlState = vi.hoisted(() => ({
  locale: 'en',
  selectionActionLimitExceeded: vi.fn(),
  selectionStatus: vi.fn(),
}))
const navigationState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}))
const requirementDetailState = vi.hoisted(() => ({
  renderSpy: vi.fn(),
}))
const localRequirementDetailState = vi.hoisted(() => ({
  renderSpy: vi.fn(),
}))
const pdfDownloadState = vi.hoisted(() => ({
  clearError: vi.fn(),
  download: vi.fn(),
  downloading: false,
}))

vi.mock('next-intl', () => ({
  useLocale: () => intlState.locale,
  useTranslations: (ns?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      if (ns === 'specification' && key === 'selectionStatus') {
        intlState.selectionStatus(values)
      }
      if (ns === 'specification' && key === 'selectionActionLimitExceeded') {
        intlState.selectionActionLimitExceeded(values)
      }
      return ns ? `${ns}.${key}` : key
    }
    t.rich = (key: string) => (ns ? `${ns}.${key}` : key)
    return t
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => navigationState.searchParams.get(key),
  }),
}))

vi.mock(
  '@/app/[locale]/specifications/[specificationId]/specification-requirement-selection-panel',
  () => ({
    default: ({ onChanged }: { onChanged?: () => void }) => (
      <div>
        specificationRequirementSelection.noQuestions
        <button onClick={onChanged} type="button">
          notify selection questions changed
        </button>
      </div>
    ),
  }),
)

vi.mock(
  '@/app/[locale]/specifications/[specificationId]/specification-rfi-list-panel',
  () => ({ default: () => <div>RFI list panel</div> }),
)

vi.mock('@/lib/reduced-motion', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reduced-motion')>()

  return {
    ...actual,
    dialogPanelMotion: vi.fn(actual.dialogPanelMotion),
    fadeMotion: vi.fn(actual.fadeMotion),
  }
})

vi.mock('@/app/[locale]/requirements/[id]/requirement-detail-client', () => ({
  default: (props: {
    onChange?: () => void | Promise<void>
    onRemoveFromSpecification?: () => void | Promise<void>
    removeFromSpecificationDisabled?: boolean
    requirementId: number
  }) => {
    requirementDetailState.renderSpy(props)
    return (
      <div>
        {`Requirement detail ${props.requirementId}`}
        {props.onChange ? (
          <button onClick={() => void props.onChange?.()} type="button">
            refresh requirement detail
          </button>
        ) : null}
      </div>
    )
  },
}))

vi.mock('@/components/SpecificationLocalRequirementDetailClient', () => ({
  default: (props: { localRequirementId: number; onChange?: () => void }) => {
    localRequirementDetailState.renderSpy(props)
    return (
      <button onClick={() => void props.onChange?.()} type="button">
        {`Local requirement detail ${props.localRequirementId}`}
      </button>
    )
  },
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
    expandedId?: number | null
    excludeColumns?: string[]
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
    filterValues?: FilterValues
    hasMore?: boolean
    loadingMore?: boolean
    onFilterChange?: (values: FilterValues) => void
    onLoadMore?: () => void | Promise<void>
    onNeedsReferenceChange?: (
      itemRef: string,
      needsReferenceId: number | null,
    ) => void
    onSelectionChange?: (ids: Set<number>) => void
    onRowClick?: (id: number) => void
    onSortChange?: (value: RequirementSortState) => void
    onSpecificationItemStatusChange?: (
      itemRef: string,
      specificationItemStatusId: number,
    ) => void
    onVisibleColumnsChange?: (columns: string[]) => void
    normReferences?: unknown[]
    requirementPackageCatalogStatus?: 'failed' | 'loaded' | 'loading'
    requirementPackageFilterPresentation?: 'chips' | 'compact-band'
    requirementPackages?: { id: number; name: string }[]
    rows: { id: number; itemRef?: string; requirementPackageIds?: number[] }[]
    renderExpanded?: (id: number) => ReactNode
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
    const tableKind = props.excludeColumns?.includes('needsReference')
      ? 'available'
      : 'items'
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
        {props.onFilterChange ? (
          <button
            aria-label={`toggle-status-filter-${tableKind}`}
            onClick={() =>
              props.onFilterChange?.({
                ...props.filterValues,
                statuses: props.filterValues?.statuses?.length
                  ? undefined
                  : [3],
              })
            }
            type="button"
          >
            toggle status filter
          </button>
        ) : null}
        {props.hasMore ? (
          <button
            aria-label={`load-more-${tableKind}`}
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
        {props.rows[0] && props.onRowClick ? (
          <button
            aria-label={`expand-row-${tableKind}-${props.rows[0].id}`}
            onClick={() => props.onRowClick?.(props.rows[0].id)}
            type="button"
          >
            expand row
          </button>
        ) : null}
        {props.expandedId != null && props.renderExpanded ? (
          <div data-testid={`expanded-${tableKind}`}>
            {props.renderExpanded(props.expandedId)}
          </div>
        ) : null}
        {props.onSpecificationItemStatusChange && props.rows[0]?.itemRef ? (
          <button
            aria-label={`set-status-${props.rows[0].itemRef}`}
            onClick={() =>
              props.onSpecificationItemStatusChange?.(
                props.rows[0].itemRef ?? '',
                2,
              )
            }
            type="button"
          >
            set status
          </button>
        ) : null}
        {props.onVisibleColumnsChange ? (
          <button
            aria-label={`set-columns-${tableKind}`}
            onClick={() => props.onVisibleColumnsChange?.(['uniqueId'])}
            type="button"
          >
            set columns
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

vi.mock('@/components/generated-output/useGeneratedOutputDownload', () => ({
  useGeneratedOutputDownload: () => ({
    clearError: pdfDownloadState.clearError,
    dialog: null,
    download: pdfDownloadState.download,
    downloading: pdfDownloadState.downloading,
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
let failNextAvailableRequirementsFetch = false
let failNextSpecificationItemsFetch = false
let localRequirementPostOk = true
let itemStatusPatchOk = true
let specificationMetaName = 'Authorization and IAM'
let needsReferenceMutationHandler:
  | ((method: string) => Promise<unknown>)
  | undefined
let specificationItemResolutionHandler:
  | ((itemRefs: string[]) => Promise<unknown>)
  | undefined
let needsReferencesGetBody: unknown
let needsReferencesGetHandler: (() => Promise<unknown>) | undefined
let normReferencesGetHandler: ((url: string) => Promise<unknown>) | undefined
let specificationMetaReturnsNotFound = false
let specificationMetaGetHandler: (() => Promise<unknown>) | undefined
let specificationItemMutationHandler:
  | ((url: string, init?: RequestInit) => Promise<unknown>)
  | undefined
let deviationPostHandler: ((itemRef: string) => Promise<unknown>) | undefined
let deleteItemsHandler: ((itemRefs: string[]) => Promise<unknown>) | undefined
let availableRequirementsGetHandler:
  | ((url: string) => Promise<unknown>)
  | undefined
let specificationItemsGetItems: SpecificationListItem[]
let specificationItemsGetHandler:
  | ((url: string) => Promise<unknown>)
  | undefined
let specificationRequirementPackagesGetHandler:
  | ((url: string) => Promise<unknown>)
  | undefined
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

function createSpecificationItemsPage(
  items: SpecificationListItem[],
  pagination: Partial<
    RequirementsSpecificationDetailInitialData['specificationItems']['pagination']
  > = {},
): RequirementsSpecificationDetailInitialData['specificationItems'] {
  return {
    items,
    pagination: {
      count: items.length,
      hasMore: false,
      limit: 50,
      nextCursor: null,
      ...pagination,
    },
  }
}

function createRequirementPackageCatalogPage(
  requirementPackages: RequirementPackageOption[],
  pagination: Partial<
    RequirementsSpecificationDetailInitialData['leftRequirementPackageCatalog']['pagination']
  > = {},
): RequirementsSpecificationDetailInitialData['leftRequirementPackageCatalog'] {
  return {
    pagination: {
      count: requirementPackages.length,
      hasMore: false,
      limit: 50,
      nextCursor: null,
      ...pagination,
    },
    requirementPackages,
    selectedRequirementPackages: [],
  }
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
    leftRequirementPackageCatalog: createRequirementPackageCatalogPage([]),
    leftNormReferenceOptions: [],
    requirementPackages: [] as RequirementPackageOption[],
    rightNormReferenceOptions: [],
    spec: initialSpec,
    specificationImplementationTypes: [
      { id: 2, nameEn: 'Program', nameSv: 'Program' },
    ],
    specificationItemStatuses: [],
    specificationItems: createSpecificationItemsPage([
      initialSpecificationItem,
    ]),
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
        props.floatingActionRailPlacement === 'inline-top' &&
        !props.excludeColumns?.includes('needsReference'),
    )
  expect(itemsTable).toBeDefined()
  return itemsTable as NonNullable<typeof itemsTable>
}

function latestAvailableTableProps() {
  const calls = requirementsTableMock.mock.calls.map(([props]) => props)
  const availableTable = calls
    .slice()
    .reverse()
    .find(props => props.excludeColumns?.includes('needsReference'))
  expect(availableTable).toBeDefined()
  return availableTable as NonNullable<typeof availableTable>
}

describe('RequirementsSpecificationDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intlState.locale = 'en'
    intlState.selectionActionLimitExceeded.mockReset()
    intlState.selectionStatus.mockReset()
    requirementDetailState.renderSpy.mockReset()
    localRequirementDetailState.renderSpy.mockReset()
    vi.mocked(useReducedMotion).mockReturnValue(false)
    requirementsTableMock.mockReset()
    pdfDownloadState.clearError.mockReset()
    pdfDownloadState.download.mockReset()
    pdfDownloadState.download.mockResolvedValue(undefined)
    pdfDownloadState.downloading = false
    addRequirementsResponse = { body: { ok: true }, ok: true }
    activeSpecificationId = defaultSpecificationId
    bulkNeedsReferencePatchError = null
    bulkNeedsReferencePatchResponse = null
    failNextAvailableRequirementsFetch = false
    failNextSpecificationItemsFetch = false
    localRequirementPostOk = true
    itemStatusPatchOk = true
    specificationMetaName = initialSpec.name
    needsReferenceMutationHandler = undefined
    specificationItemResolutionHandler = undefined
    needsReferencesGetBody = { needsReferences: [] }
    needsReferencesGetHandler = undefined
    normReferencesGetHandler = undefined
    specificationMetaReturnsNotFound = false
    specificationMetaGetHandler = undefined
    specificationItemMutationHandler = undefined
    deviationPostHandler = undefined
    deleteItemsHandler = undefined
    availableRequirementsGetHandler = undefined
    specificationItemsGetItems = [initialSpecificationItem]
    specificationItemsGetHandler = undefined
    specificationRequirementPackagesGetHandler = undefined
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
          if (deviationPostHandler) {
            return deviationPostHandler(itemRef)
          }
          return Promise.resolve(
            failedDeviationItemRefs.has(itemRef)
              ? { json: async () => ({ error: 'Failed' }), ok: false }
              : okJson({ deviation: { id: 1 }, ok: true }),
          )
        }

        if (url === specificationApiPath()) {
          if (method === 'PUT') {
            const body = JSON.parse(String(init?.body)) as { name?: string }
            specificationMetaName = body.name ?? specificationMetaName
          }
          if (method === 'GET' && specificationMetaReturnsNotFound) {
            return Promise.resolve({
              json: async () => ({}),
              ok: false,
              status: 404,
            })
          }
          if (method === 'GET' && specificationMetaGetHandler) {
            return specificationMetaGetHandler()
          }
          return Promise.resolve(
            okJson({
              businessNeedsReference: 'Shared IAM business case',
              id: 8,
              implementationType: { nameEn: 'Program', nameSv: 'Program' },
              lifecycleStatus: { nameEn: 'Development', nameSv: 'Utveckling' },
              name: specificationMetaName,
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

        if (
          url === specificationApiPath('/local-requirements') &&
          method === 'POST'
        ) {
          if (localRequirementPostOk) {
            specificationItemsGetItems = [
              ...specificationItemsGetItems,
              {
                ...initialSpecificationItem,
                id: -401,
                isSpecificationLocal: true,
                itemRef: 'local:401',
                kind: 'specificationLocal',
                specificationItemId: undefined,
                specificationLocalRequirementId: 401,
                uniqueId: 'KRAV0401',
                version: {
                  ...initialSpecificationItem.version,
                  description: 'Local requirement',
                },
              },
            ]
          }
          return Promise.resolve(
            localRequirementPostOk
              ? okJson({
                  localRequirement: {
                    description: 'Local requirement',
                    id: 401,
                    itemRef: 'local:401',
                  },
                  ok: true,
                })
              : {
                  json: async () => ({ error: 'Local create failed' }),
                  ok: false,
                },
          )
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
          if (deleteItemsHandler) {
            return deleteItemsHandler(body.itemRefs)
          }
          specificationItemsGetItems = specificationItemsGetItems.filter(
            item => !item.itemRef || !body.itemRefs.includes(item.itemRef),
          )
          return Promise.resolve(okJson({ ok: true, removedCount: 1 }))
        }

        if (
          url.startsWith(
            `/api/specification-item-resolutions/${activeSpecificationId}?`,
          ) &&
          method === 'GET'
        ) {
          const requestedRefs = new Set(
            new URLSearchParams(url.split('?')[1] ?? '').getAll('refs'),
          )
          if (specificationItemResolutionHandler) {
            return specificationItemResolutionHandler([...requestedRefs])
          }
          return Promise.resolve(
            okJson({
              items: specificationItemsGetItems
                .filter(item => item.itemRef && requestedRefs.has(item.itemRef))
                .map(item => ({
                  itemRef: item.itemRef,
                  kind: item.kind,
                  needsReference: item.needsReference ?? null,
                  uniqueId: item.uniqueId,
                })),
            }),
          )
        }

        if (
          url.startsWith(`${specificationApiPath('/items')}?`) &&
          method === 'GET'
        ) {
          if (specificationItemsGetHandler) {
            return specificationItemsGetHandler(url)
          }
          if (failNextSpecificationItemsFetch) {
            failNextSpecificationItemsFetch = false
            return Promise.resolve({
              json: async () => ({}),
              ok: false,
            })
          }

          const params = searchParamsFromPath(url)
          const packageIds = params.getAll('requirementPackageIds').map(Number)
          const items =
            packageIds.length > 0
              ? specificationItemsGetItems.filter(item =>
                  item.requirementPackageIds?.some(id =>
                    packageIds.includes(id),
                  ),
                )
              : [...specificationItemsGetItems]
          if (params.get('sortBy') === 'description') {
            const direction = params.get('sortDirection') === 'desc' ? -1 : 1
            items.sort(
              (left, right) =>
                (left.version?.description ?? '').localeCompare(
                  right.version?.description ?? '',
                ) * direction,
            )
          }

          return Promise.resolve(
            okJson({
              items,
              pagination: {
                count: items.length,
                hasMore: false,
                limit: 50,
                nextCursor: null,
              },
            }),
          )
        }

        if (
          url.startsWith(`${specificationApiPath('/requirement-packages')}?`) &&
          method === 'GET'
        ) {
          if (specificationRequirementPackagesGetHandler) {
            return specificationRequirementPackagesGetHandler(url)
          }
          return Promise.resolve(
            okJson({
              pagination: {
                count: 0,
                hasMore: false,
                limit: 50,
                nextCursor: null,
              },
              requirementPackages: [],
              selectedRequirementPackages: [],
            }),
          )
        }

        if (
          url.startsWith(
            `${specificationApiPath('/available-requirements')}?`,
          ) ||
          url.startsWith('/api/requirements?')
        ) {
          if (availableRequirementsGetHandler) {
            return availableRequirementsGetHandler(url)
          }
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
          url.startsWith(`${specificationApiPath('/items')}/`) &&
          method === 'PATCH' &&
          specificationItemMutationHandler
        ) {
          return specificationItemMutationHandler(url, init)
        }

        if (
          url === `${specificationApiPath('/items')}/lib%3A31` &&
          method === 'PATCH'
        ) {
          return Promise.resolve(
            itemStatusPatchOk
              ? okJson({ ok: true })
              : { json: async () => ({ error: 'Status failed' }), ok: false },
          )
        }

        if (
          url === specificationApiPath('/needs-references') &&
          method === 'POST'
        ) {
          if (needsReferenceMutationHandler) {
            return needsReferenceMutationHandler(method)
          }
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
          if (needsReferenceMutationHandler) {
            return needsReferenceMutationHandler(method)
          }
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
          if (needsReferenceMutationHandler) {
            return needsReferenceMutationHandler(method)
          }
          return Promise.resolve(okJson({ ok: true }))
        }

        if (
          url === specificationApiPath('/needs-references') &&
          method === 'GET'
        ) {
          if (needsReferencesGetHandler) {
            return needsReferencesGetHandler()
          }
          return Promise.resolve(okJson(needsReferencesGetBody))
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
          if (normReferencesGetHandler) {
            return normReferencesGetHandler(url)
          }
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
    navigationState.searchParams = new URLSearchParams()
  })

  it('shows the partial preload warning banner when initial data contains errors', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      errors: [{ key: 'available requirements', message: 'preload failed' }],
    })

    expect(
      screen.getByText('specification.partialDataLoadWarning'),
    ).toHaveAttribute('role', 'status')
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('shows lifecycle-matched report options and always keeps full CSV export', async () => {
    renderRequirementsSpecificationDetailClient()
    await waitForInitialAvailableRequirementsRefresh()

    await waitFor(() => {
      expect(
        latestItemsTableProps().rows.map(
          (row: { itemRef?: string }) => row.itemRef,
        ),
      ).toEqual(['lib:31'])
    })
    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{
        href?: string
        id: string
        onClick?: (target?: HTMLButtonElement | null) => void
      }>
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

    const menuTrigger = document.createElement('button')
    moreActions?.menuItems
      ?.find(item => item.id === 'pdf-progress')
      ?.onClick?.(menuTrigger)
    moreActions?.menuItems
      ?.find(item => item.id === 'pdf-traceability')
      ?.onClick?.(menuTrigger)

    expect(pdfDownloadState.download).toHaveBeenCalledWith({
      fallbackFilename:
        'specification.reportProfiles.progress Authorization and IAM ETJANST-UPP-2026.pdf',
      restoreFocusTo: menuTrigger,
      url: '/en/specifications/8/reports/pdf/progress',
    })
    expect(pdfDownloadState.download).toHaveBeenCalledWith({
      fallbackFilename:
        'specification.reportProfiles.traceability Authorization and IAM ETJANST-UPP-2026.pdf',
      restoreFocusTo: menuTrigger,
      url: '/en/specifications/8/reports/pdf/traceability?locale=en&sortBy=uniqueId&sortDirection=asc',
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

    await act(async () => {
      await importProps.onClose(true)
    })
    expect(screen.queryByTestId('lazy-import-review')).toBeNull()

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

  it('explains whether AI authoring is disabled by the environment or an administrator', async () => {
    for (const [disabledByEnvironment, expectedMessage] of [
      [true, 'specification.aiGenerateDisabledByEnvironment'],
      [false, 'specification.aiGenerateDisabledByAdmin'],
    ] as const) {
      const initialData = createInitialData()
      initialData.aiGenerationAvailability = {
        disabledByEnvironment,
        effectiveRequirementGenerationEnabled: false,
      }
      const view = renderRequirementsSpecificationDetailClient(initialData)
      await waitForInitialAvailableRequirementsRefresh()
      const moreActions = (
        latestItemsTableProps().floatingActions as Array<{
          id: string
          menuItems?: Array<{
            description?: string
            disabled?: boolean
            id: string
            onClick?: () => void
            tooltip?: string
          }>
        }>
      ).find(action => action.id === 'more-actions')
      const aiAction = moreActions?.menuItems?.find(
        action => action.id === 'ai-assist-local',
      )

      expect(aiAction).toEqual(
        expect.objectContaining({
          description: expectedMessage,
          disabled: true,
          tooltip: expectedMessage,
        }),
      )
      act(() => aiAction?.onClick?.())
      expect(screen.queryByTestId('lazy-ai-authoring')).toBeNull()
      view.unmount()
    }
  })

  it('keeps profile PDF report actions lifecycle-scoped', async () => {
    renderRequirementsSpecificationDetailClient(createInitialData(), 8)
    await waitForInitialAvailableRequirementsRefresh()

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{
        href?: string
        id: string
        onClick?: (target?: HTMLButtonElement | null) => void
      }>
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

    const menuTrigger = document.createElement('button')
    moreActions?.menuItems
      ?.find(item => item.id === 'pdf-progress')
      ?.onClick?.(menuTrigger)

    expect(pdfDownloadState.download).toHaveBeenCalledWith({
      fallbackFilename:
        'specification.reportProfiles.progress Authorization and IAM ETJANST-UPP-2026.pdf',
      restoreFocusTo: menuTrigger,
      url: '/en/specifications/8/reports/pdf/progress',
    })
  })

  it('builds traceability report query state from the complete-result filters', async () => {
    const initialData = createInitialData()
    initialData.specificationItems = createSpecificationItemsPage([
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
    ])
    initialData.requirementPackages = [
      { id: 9, name: 'Security package' },
    ] as RequirementPackageOption[]
    specificationItemsGetItems = initialData.specificationItems.items

    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()

    act(() => {
      latestItemsTableProps().onFilterChange?.({ requirementPackageIds: [9] })
    })

    await waitFor(() => {
      const floatingActions = (latestItemsTableProps().floatingActions ??
        []) as Array<{
        hidden?: boolean
        id: string
        menuItems?: Array<{ href?: string; id: string }>
      }>
      expect(
        floatingActions
          .find(action => action.id === 'more-actions')
          ?.menuItems?.map(item => item.id),
      ).toContain('pdf-traceability')
    })

    const traceabilityAction = (
      latestItemsTableProps().floatingActions as Array<{
        id: string
        menuItems?: Array<{ id: string; onClick?: () => void }>
      }>
    )
      .find(action => action.id === 'more-actions')
      ?.menuItems?.find(item => item.id === 'pdf-traceability')
    traceabilityAction?.onClick?.()

    expect(pdfDownloadState.download).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('requirementPackageIds=9'),
      }),
    )
  })

  it('keeps traceability report actions beyond the former item-ref limit', async () => {
    const items = Array.from({ length: 201 }, (_, index) => {
      const itemId = index + 1
      return {
        ...initialSpecificationItem,
        id: 1000 + itemId,
        itemRef: `lib:${itemId}`,
        specificationItemId: itemId,
        uniqueId: `BEH${String(itemId).padStart(4, '0')}`,
      }
    })
    const initialData = createInitialData()
    initialData.specificationItems = createSpecificationItemsPage(
      items.slice(0, 100),
      { hasMore: true, limit: 100, nextCursor: 'items-page-2' },
    )
    specificationItemsGetHandler = async url => {
      const cursor = searchParamsFromPath(url).get('cursor')
      const pageItems =
        cursor === 'items-page-2' ? items.slice(100, 200) : items.slice(200)
      return okJson({
        items: pageItems,
        pagination: {
          count: pageItems.length,
          hasMore: cursor === 'items-page-2',
          limit: 100,
          nextCursor: cursor === 'items-page-2' ? 'items-page-3' : null,
        },
      })
    }

    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()
    fireEvent.click(screen.getByRole('button', { name: 'load-more-items' }))
    await waitFor(() => {
      expect(latestItemsTableProps().rows).toHaveLength(200)
    })
    fireEvent.click(screen.getByRole('button', { name: 'load-more-items' }))
    await waitFor(() => {
      expect(latestItemsTableProps().rows).toHaveLength(201)
    })

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
    expect(moreActions?.menuItems?.map(item => item.id)).toContain(
      'pdf-traceability',
    )
  })

  it('routes full CSV through the generated-output controller with menu focus restoration', async () => {
    renderRequirementsSpecificationDetailClient()
    await waitForInitialAvailableRequirementsRefresh()

    const itemsTable = latestItemsTableProps()
    const floatingActions = (itemsTable.floatingActions ?? []) as Array<{
      hidden?: boolean
      id: string
      menuItems?: Array<{
        href?: string
        id: string
        onClick?: (target?: HTMLButtonElement | null) => void
      }>
    }>
    const moreActions = floatingActions.find(
      action => action.id === 'more-actions',
    )
    const menuTrigger = document.createElement('button')

    moreActions?.menuItems
      ?.find(menuItem => menuItem.id === 'export-full')
      ?.onClick?.(menuTrigger)

    expect(pdfDownloadState.download).toHaveBeenCalledWith({
      fallbackFilename:
        'specification.exportProfiles.full Authorization and IAM ETJANST-UPP-2026.csv',
      output: 'csv',
      restoreFocusTo: menuTrigger,
      url: '/api/requirements-specifications/8/exports?profile=full&locale=en',
    })
  })

  it('disables both CSV profiles while any generated output is active', async () => {
    pdfDownloadState.downloading = true
    const initialData = createInitialData()
    if (!initialData.spec) {
      throw new Error('Expected specification fixture')
    }
    initialData.spec = {
      ...initialData.spec,
      specificationLifecycleStatusId: 1,
    }
    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()

    const moreActions = (
      latestItemsTableProps().floatingActions as Array<{
        id: string
        menuItems?: Array<{ disabled?: boolean; id: string }>
      }>
    ).find(action => action.id === 'more-actions')

    expect(moreActions?.menuItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          disabled: true,
          id: 'export-procurement',
        }),
        expect.objectContaining({ disabled: true, id: 'export-full' }),
      ]),
    )
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

  it('treats omitted optional list payload fields as an empty page', async () => {
    availableRequirementsGetHandler = async () => okJson({})
    specificationItemsGetHandler = async () => okJson({})
    needsReferencesGetBody = {}
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      errors: [
        {
          key: SPECIFICATION_PRELOAD_ERROR_KEYS.needsReferences,
          message: 'Needs references missing from preload',
        },
      ],
    })

    await waitFor(() => {
      expect(
        screen.getByTestId('requirements-table-available-rows'),
      ).toHaveTextContent('')
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'sort-description-items' }),
    )
    await waitFor(() => {
      expect(screen.getByText('specification.noItems')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.newLocalRequirement',
      }),
    )
    await screen.findByRole('dialog')
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input]) =>
            (typeof input === 'string' ? input : input.url) ===
            specificationApiPath('/needs-references'),
        ),
      ).toBe(true)
    })
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

  it('turns off requirement-selection filtering when refreshed answers no longer select requirements', async () => {
    availableRequirementsSelectionFilter = {
      applied: false,
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [202],
    }
    availableRequirementsGetHandler = async url =>
      okJson({
        pagination: { hasMore: false },
        requirements: [initialAvailableRequirement],
        selectionFilter: url.includes('applyRequirementSelectionFilter=true')
          ? {
              applied: true,
              hasCurrentAnswers: true,
              hasRequirementSelection: false,
              hasNoRequirementSelection: true,
              requirementIds: [],
            }
          : availableRequirementsSelectionFilter,
      })
    renderRequirementsSpecificationDetailClient()
    const toggle = await screen.findByRole('switch', {
      name: 'specification.filterWithRequirementSelectionQuestions',
    })
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(toggle).not.toBeChecked()
      expect(toggle).toBeDisabled()
    })
    expect(
      screen.getByText('specification.requirementSelectionNoPublishedMatches'),
    ).toBeInTheDocument()
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

    expect(
      await screen.findByText('common.requirementListRefreshed'),
    ).toHaveAttribute('role', 'status')
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
    availableRequirementsGetHandler = async url => {
      const filtered = searchParamsFromPath(url).has('requirementPackageIds')
      return okJson({
        pagination: {
          hasMore: !filtered,
          nextCursor: filtered ? null : 'cursor-1',
        },
        requirements: [initialAvailableRequirement],
      })
    }
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

  it('saves specification metadata from the title edit action and refreshes it', async () => {
    renderRequirementsSpecificationDetailClient()
    const initialMetadataGetCount = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === specificationApiPath() &&
        (init as RequestInit | undefined)?.method !== 'PUT',
    ).length

    fireEvent.click(
      screen.getByRole('button', { name: 'specification.editSpecification' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'specification.editSpecification',
    })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Updated specification name' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: /common\.save/i }),
    )

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === specificationApiPath() &&
          (init as RequestInit | undefined)?.method === 'PUT',
      )
      expect(
        JSON.parse(String((putCall?.[1] as RequestInit | undefined)?.body)),
      ).toEqual(expect.objectContaining({ name: 'Updated specification name' }))
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', {
          name: 'specification.editSpecification',
        }),
      ).toBeNull(),
    )
    await waitFor(() => {
      const metadataGetCount = fetchMock.mock.calls.filter(
        ([url, init]) =>
          url === specificationApiPath() &&
          (init as RequestInit | undefined)?.method !== 'PUT',
      ).length
      expect(metadataGetCount).toBeGreaterThan(initialMetadataGetCount)
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Updated specification name',
        }),
      ).toBeInTheDocument()
    })
  })

  it('moves to the not-found state when metadata disappears during an edit refresh', async () => {
    specificationMetaReturnsNotFound = true
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.editSpecification' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'specification.editSpecification',
    })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Specification awaiting removal' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: /common\.save/i }),
    )

    expect(
      await screen.findByText('specification.specificationNotFound'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /specification\.backToSpecifications/ }),
    ).toHaveAttribute('href', '/specifications')
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

  it('renders a minimal Swedish read-only specification without optional metadata', async () => {
    intlState.locale = 'sv'
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '',
          description: 'Beskrivning',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: undefined,
          specificationLocalRequirementCount: 0,
          text: 'Behov',
          updatedAt: '',
        },
      ],
      spec: {
        ...initialSpec,
        businessNeedsReference: null,
        governanceObjectType: null,
        implementationType: null,
        lifecycleStatus: null,
        permissions: {
          canEditContent: false,
          canManageAssignments: false,
          canReviewDecisions: false,
          canUseAi: false,
        },
        responsibleDisplayName: 'Readonly Owner',
        responsibleHsaId: '',
      },
    })

    expect(
      screen.queryByRole('button', { name: 'specification.editSpecification' }),
    ).toBeNull()
    expect(screen.queryByText('Shared IAM business case')).toBeNull()
    expect(screen.getByText('Readonly Owner')).toBeInTheDocument()
    expect(screen.queryByText('SE5560000001-ada1')).toBeNull()
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    expect(screen.getByText('Beskrivning')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'specification.newNeedsReference',
      }),
    ).toBeNull()
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('shows the not-found state with a partial-data warning when specification metadata is absent', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      errors: [{ key: 'specification', message: 'Metadata unavailable' }],
      spec: null,
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      'specification.partialDataLoadWarning',
    )
    expect(
      screen.getByText('specification.specificationNotFound'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /specification\.backToSpecifications/ }),
    ).toHaveAttribute('href', '/specifications')
    await waitForInitialAvailableRequirementsRefresh()
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
      specificationItems: createSpecificationItemsPage([]),
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

  it('shows no empty-state actions to a read-only user', async () => {
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
      specificationItems: createSpecificationItemsPage([]),
    })

    expect(screen.getByText('specification.noItems')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'specification.newLocalRequirement',
      }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'common.moreActions' }),
    ).toBeNull()
    await waitForInitialAvailableRequirementsRefresh()
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

  it('expands both tables, refreshes details, updates status, and persists columns', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItemStatuses: [
        {
          color: '#22c55e',
          descriptionEn: null,
          descriptionSv: null,
          iconName: null,
          id: 2,
          nameEn: 'Included',
          nameSv: 'Inkluderad',
          sortOrder: 2,
        },
      ],
    })
    await waitForInitialAvailableRequirementsRefresh()

    fireEvent.click(
      screen.getByRole('button', { name: 'expand-row-items-101' }),
    )
    expect(
      await screen.findByText('Requirement detail 101'),
    ).toBeInTheDocument()
    const itemsFetchCountBeforeRefresh = fetchMock.mock.calls.filter(
      ([input]) => String(input).startsWith(specificationApiPath('/items?')),
    ).length
    fireEvent.click(
      screen.getByRole('button', { name: 'refresh requirement detail' }),
    )
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).startsWith(specificationApiPath('/items?')),
        ).length,
      ).toBeGreaterThan(itemsFetchCountBeforeRefresh)
    })
    fireEvent.click(screen.getByRole('button', { name: 'set-status-lib:31' }))
    fireEvent.click(screen.getByRole('button', { name: 'set-columns-items' }))

    fireEvent.click(
      screen.getByRole('button', { name: 'expand-row-available-202' }),
    )
    expect(
      await screen.findByText('Requirement detail 202'),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'set-columns-available' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'expand-row-available-202' }),
    )
    expect(screen.queryByText('Requirement detail 202')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/8/items/lib%3A31',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
    await waitFor(() => {
      expect(
        window.localStorage.getItem(
          'requirement-specifications.visibleColumns.left.v1',
        ),
      ).toBe('["uniqueId"]')
      expect(
        window.localStorage.getItem(
          'requirement-specifications.visibleColumns.right.v1',
        ),
      ).toBe('["uniqueId"]')
    })
  })

  it('restores the original item when a usage-status update fails', async () => {
    itemStatusPatchOk = false
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItemStatuses: [
        {
          color: '#22c55e',
          descriptionEn: null,
          descriptionSv: null,
          iconName: null,
          id: 2,
          nameEn: 'Included',
          nameSv: 'Inkluderad',
          sortOrder: 2,
        },
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: 'set-status-lib:31' }))

    await waitFor(() => {
      expect(latestItemsTableProps().rows[0]).toEqual(initialSpecificationItem)
    })
  })

  it('ignores a usage-status choice that is not in the specification catalog', async () => {
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'set-status-lib:31' }))

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).includes('/items/lib%3A31') &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(false)
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('submits an explicit needs-reference clear even for an unknown item', async () => {
    renderRequirementsSpecificationDetailClient()
    act(() => {
      latestItemsTableProps().onNeedsReferenceChange?.('lib:missing', null)
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/requirements-specifications/8/items/${encodeURIComponent('lib:missing')}`,
        expect.objectContaining({
          body: JSON.stringify({ needsReferenceId: null }),
          method: 'PATCH',
        }),
      )
    })
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')
  })

  it('expands and refreshes a specification-local requirement detail', async () => {
    const localItem = {
      ...initialSpecificationItem,
      id: 401,
      isSpecificationLocal: true,
      itemRef: 'local:401',
      kind: 'specificationLocal' as const,
      specificationItemId: undefined,
      specificationLocalRequirementId: 401,
      uniqueId: 'KRAV0001',
    }
    specificationItemsGetItems = [localItem]
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage([localItem]),
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'expand-row-items-401' }),
    )
    const localDetail = await screen.findByRole('button', {
      name: 'Local requirement detail 401',
    })
    const itemsFetchCountBeforeRefresh = fetchMock.mock.calls.filter(
      ([input]) => String(input).startsWith(specificationApiPath('/items?')),
    ).length
    fireEvent.click(localDetail)

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).startsWith(specificationApiPath('/items?')),
        ).length,
      ).toBeGreaterThan(itemsFetchCountBeforeRefresh)
    })
    expect(localRequirementDetailState.renderSpy).toHaveBeenCalledWith(
      expect.objectContaining({ localRequirementId: 401 }),
    )
  })

  it('shows generic requirement detail when an application has no persisted membership id', async () => {
    const unresolvedItem = {
      ...initialSpecificationItem,
      itemRef: 'external:101',
      specificationItemId: undefined,
    }
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage([unresolvedItem]),
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'expand-row-items-101' }),
    )
    expect(screen.getByText('Requirement detail 101')).toBeInTheDocument()
    expect(requirementDetailState.renderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ requirementId: 101 }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'expand-row-items-101' }),
    )
    expect(screen.queryByText('Requirement detail 101')).not.toBeInTheDocument()
    await waitForInitialAvailableRequirementsRefresh()
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
    specificationItemsGetItems = [firstItem, secondItem]

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      leftRequirementPackageCatalog:
        createRequirementPackageCatalogPage(requirementPackages),
      requirementPackages,
      specificationItems: createSpecificationItemsPage([firstItem, secondItem]),
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
        .find(
          ([props]) => !props.excludeColumns?.includes('needsReference'),
        )?.[0] as
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

  it('refreshes left norm-reference options when usage-status filters change', async () => {
    const requestedStatuses: string[][] = []
    normReferencesGetHandler = async url => {
      requestedStatuses.push(searchParamsFromPath(url).getAll('statuses'))
      return okJson({})
    }
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(
      screen.getByRole('button', { name: 'toggle-status-filter-items' }),
    )

    await waitFor(() => {
      expect(latestItemsTableProps().normReferences).toEqual([])
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(typeof input === 'string' ? input : input.url).includes(
            'statuses=3',
          ),
        ),
      ).toBe(true)
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'toggle-status-filter-items' }),
    )
    await waitFor(() => {
      expect(requestedStatuses).toContainEqual([])
    })
  })

  it('keeps the item list usable when filtered norm-reference options fail', async () => {
    normReferencesGetHandler = async () => {
      throw 'Norm options unavailable'
    }
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(
      screen.getByRole('button', { name: 'toggle-status-filter-items' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'specification.loadNormReferencesFailed',
    )
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')
  })

  it('uses independent compact package filters with distinct server catalogs', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
        { id: 2, name: 'Specification package' },
      ]),
      requirementPackages: [
        { id: 1, name: 'Library package' },
        { id: 2, name: 'Specification package' },
      ],
    })
    await waitForInitialAvailableRequirementsRefresh()

    expect(latestItemsTableProps()).toEqual(
      expect.objectContaining({
        requirementPackageCatalogStatus: 'loaded',
        requirementPackageFilterPresentation: 'compact-band',
        requirementPackages: [{ id: 2, name: 'Specification package' }],
      }),
    )
    expect(latestAvailableTableProps()).toEqual(
      expect.objectContaining({
        requirementPackageCatalogStatus: 'loaded',
        requirementPackageFilterPresentation: 'compact-band',
        requirementPackages: [
          { id: 1, name: 'Library package' },
          { id: 2, name: 'Specification package' },
        ],
      }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-items-2' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-available-1' }),
    )

    await waitFor(() => {
      expect(latestItemsTableProps().filterValues).toEqual({
        requirementPackageIds: [2],
      })
      expect(latestAvailableTableProps().filterValues).toEqual({
        requirementPackageIds: [1],
      })
    })
  })

  it('keeps the item list usable while traversing every catalog page independently', async () => {
    let resolveSecondPage: ((value: unknown) => void) | undefined
    specificationRequirementPackagesGetHandler = async url => {
      expect(searchParamsFromPath(url).get('cursor')).toBe('package-page-2')
      return new Promise(resolve => {
        resolveSecondPage = resolve
      })
    }

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      leftRequirementPackageCatalog: createRequirementPackageCatalogPage(
        [{ id: 1, name: 'First package' }],
        { hasMore: true, nextCursor: 'package-page-2' },
      ),
    })

    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')
    await waitFor(() => {
      expect(latestItemsTableProps()).toEqual(
        expect.objectContaining({
          requirementPackageCatalogStatus: 'loading',
          requirementPackages: [{ id: 1, name: 'First package' }],
        }),
      )
    })

    await act(async () => {
      resolveSecondPage?.(
        okJson({
          pagination: {
            count: 1,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
          requirementPackages: [{ id: 51, name: 'Later package' }],
          selectedRequirementPackages: [],
        }),
      )
    })

    await waitFor(() => {
      expect(latestItemsTableProps()).toEqual(
        expect.objectContaining({
          requirementPackageCatalogStatus: 'loaded',
          requirementPackages: [
            { id: 1, name: 'First package' },
            { id: 51, name: 'Later package' },
          ],
        }),
      )
    })
  })

  it('distinguishes failed package catalogs from successful empty catalogs', async () => {
    const initialData = createInitialData()
    initialData.errors = [
      {
        key: SPECIFICATION_PRELOAD_ERROR_KEYS.requirementPackages,
        message: 'right failed',
      },
      {
        key: SPECIFICATION_PRELOAD_ERROR_KEYS.specificationRequirementPackages,
        message: 'left failed',
      },
    ]

    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()

    expect(latestItemsTableProps()).toEqual(
      expect.objectContaining({
        requirementPackageCatalogStatus: 'failed',
        requirementPackages: [],
      }),
    )
    expect(latestAvailableTableProps()).toEqual(
      expect.objectContaining({
        requirementPackageCatalogStatus: 'failed',
        requirementPackages: [],
      }),
    )
  })

  it('fails a malformed preloaded package continuation without issuing an ambiguous request', async () => {
    const initialData = createInitialData()
    initialData.leftRequirementPackageCatalog =
      createRequirementPackageCatalogPage([], {
        hasMore: true,
        nextCursor: null,
      })
    renderRequirementsSpecificationDetailClient(initialData)

    await waitFor(() => {
      expect(latestItemsTableProps().requirementPackageCatalogStatus).toBe(
        'failed',
      )
      expect(
        screen.getByText('specification.loadRequirementPackagesFailed'),
      ).toBeInTheDocument()
    })
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (typeof input === 'string' ? input : input.url).startsWith(
          specificationApiPath('/requirement-packages'),
        ),
      ),
    ).toBe(false)
  })

  it('fails a package catalog page whose continuation cursor is missing', async () => {
    const initialData = createInitialData()
    initialData.leftRequirementPackageCatalog =
      createRequirementPackageCatalogPage([], {
        hasMore: true,
        nextCursor: 'catalog-page-2',
      })
    specificationRequirementPackagesGetHandler = async () =>
      okJson({
        pagination: { hasMore: true, nextCursor: null },
        requirementPackages: [],
        selectedRequirementPackages: [],
      })
    renderRequirementsSpecificationDetailClient(initialData)

    await waitFor(() => {
      expect(latestItemsTableProps().requirementPackageCatalogStatus).toBe(
        'failed',
      )
    })
    expect(
      screen.getByText('specification.loadRequirementPackagesFailed'),
    ).toBeInTheDocument()
  })

  it('fails a package catalog whose continuation cursor repeats', async () => {
    const initialData = createInitialData()
    initialData.leftRequirementPackageCatalog =
      createRequirementPackageCatalogPage([], {
        hasMore: true,
        nextCursor: 'catalog-repeat',
      })
    let requestCount = 0
    specificationRequirementPackagesGetHandler = async () => {
      requestCount += 1
      return okJson({
        pagination: { hasMore: true, nextCursor: 'catalog-repeat' },
        requirementPackages: [],
        selectedRequirementPackages: [],
      })
    }
    renderRequirementsSpecificationDetailClient(initialData)

    await waitFor(() => {
      expect(latestItemsTableProps().requirementPackageCatalogStatus).toBe(
        'failed',
      )
    })
    expect(requestCount).toBe(2)
  })

  it('prunes a resolved package while preserving a selection made during refresh', async () => {
    const packageOption = { id: 9, name: 'Current package' }
    const replacementPackageOption = { id: 10, name: 'Replacement package' }
    const item = {
      ...initialSpecificationItem,
      requirementPackageIds: [9],
    }
    const remainingItem = {
      ...initialSpecificationItem,
      id: 102,
      itemRef: 'library:32',
      requirementPackageIds: [10],
      uniqueId: 'REQ-002',
    }
    specificationItemsGetItems = [item, remainingItem]
    let resolveCatalogRefresh: (() => void) | undefined
    specificationItemsGetHandler = async url => {
      const packageIds = searchParamsFromPath(url)
        .getAll('requirementPackageIds')
        .map(Number)
      const items =
        packageIds.length > 0
          ? specificationItemsGetItems.filter(candidate =>
              candidate.requirementPackageIds?.some(id =>
                packageIds.includes(id),
              ),
            )
          : specificationItemsGetItems
      return okJson({
        items,
        pagination: {
          count: items.length,
          hasMore: false,
          limit: 50,
          nextCursor: null,
        },
      })
    }
    specificationRequirementPackagesGetHandler = async url =>
      new Promise(resolve => {
        expect(searchParamsFromPath(url).getAll('includeIds')).toEqual(['9'])
        const response = okJson({
          pagination: {
            count: 0,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
          requirementPackages: [],
          selectedRequirementPackages: [],
        })
        resolveCatalogRefresh = () => resolve(response)
      })

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
        packageOption,
        replacementPackageOption,
      ]),
      requirementPackages: [packageOption],
      specificationItems: createSpecificationItemsPage([item, remainingItem]),
    })
    await waitForInitialAvailableRequirementsRefresh()

    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-items-9' }),
    )
    await waitFor(() => {
      expect(latestItemsTableProps().filterValues).toEqual({
        requirementPackageIds: [9],
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'common.delete' }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/8/items',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
    await waitFor(() => {
      expect(latestItemsTableProps()).toEqual(
        expect.objectContaining({
          requirementPackageCatalogStatus: 'loading',
          requirementPackages: [packageOption, replacementPackageOption],
        }),
      )
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-items-10' }),
    )
    await waitFor(() => {
      expect(latestItemsTableProps().filterValues).toEqual({
        requirementPackageIds: [9, 10],
      })
    })
    act(() => resolveCatalogRefresh?.())
    await waitFor(() => {
      expect(latestItemsTableProps().requirementPackages).toEqual([])
      expect(
        latestItemsTableProps().filterValues?.requirementPackageIds,
      ).toEqual([10])
      expect(latestItemsTableProps().rows).toEqual([remainingItem])
    })
    expect(latestAvailableTableProps().requirementPackages).toEqual([
      packageOption,
    ])
  })

  it('marks a failed package catalog refresh as failed without treating stale options as loaded', async () => {
    const packageOption = { id: 9, name: 'Stale package' }
    const item = {
      ...initialSpecificationItem,
      requirementPackageIds: [9],
    }
    const remainingItem = {
      ...initialSpecificationItem,
      id: 102,
      itemRef: 'lib:32',
      requirementPackageIds: [],
      specificationItemId: 32,
      uniqueId: 'BEH0002',
    }
    specificationItemsGetItems = [item, remainingItem]
    specificationItemsGetHandler = async () =>
      okJson({
        items: specificationItemsGetItems,
        pagination: {
          count: specificationItemsGetItems.length,
          hasMore: false,
          limit: 50,
          nextCursor: null,
        },
      })
    specificationRequirementPackagesGetHandler = async () => ({
      json: async () => ({ error: 'facet unavailable' }),
      ok: false,
    })

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
        packageOption,
      ]),
      requirementPackages: [packageOption],
      specificationItems: createSpecificationItemsPage([item, remainingItem]),
    })
    await waitForInitialAvailableRequirementsRefresh()

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'common.delete' }),
    )

    await waitFor(() => {
      expect(latestItemsTableProps()).toEqual(
        expect.objectContaining({
          requirementPackageCatalogStatus: 'failed',
          requirementPackages: [],
        }),
      )
    })
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
    specificationItemsGetItems = [firstItem, secondItem]

    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage([firstItem, secondItem]),
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

  it('adds selected requirements with an existing needs reference', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '',
          description: 'Existing context',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '',
        },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )
    fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
      target: { value: '81' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === specificationApiPath('/items') &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      expect(
        JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
      ).toEqual({ needsReferenceId: 81, requirementIds: [202] })
    })
  })

  it('adds selected requirements without a needs reference', async () => {
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )
    const help = await screen.findByRole('button', {
      name: 'common.help: specification.addNeedsRef',
    })
    fireEvent.click(help)
    expect(
      screen.getByText('specification.addNeedsRefHelp'),
    ).toBeInTheDocument()
    fireEvent.click(help)
    expect(screen.queryByText('specification.addNeedsRefHelp')).toBeNull()
    const needsReferenceSelect = screen.getByLabelText(
      'specification.addNeedsRef',
    )
    fireEvent.change(needsReferenceSelect, { target: { value: 'new' } })
    expect(
      screen.getByLabelText('specification.addNeedsRefTextLabel'),
    ).toBeInTheDocument()
    fireEvent.change(needsReferenceSelect, { target: { value: 'none' } })
    expect(
      screen.queryByLabelText('specification.addNeedsRefTextLabel'),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === specificationApiPath('/items') &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      expect(
        JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
      ).toEqual({ requirementIds: [202] })
    })
  })

  it('adds selected requirements with a newly described needs reference', async () => {
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )
    fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
      target: { value: 'new' },
    })
    fireEvent.change(
      screen.getByLabelText('specification.addNeedsRefTextLabel'),
      { target: { value: '  IAM-99  ' } },
    )
    fireEvent.change(
      screen.getByLabelText('specification.needsReferenceDescription'),
      { target: { value: '  Procurement decision  ' } },
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === specificationApiPath('/items') &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      expect(
        JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
      ).toEqual({
        needsReferenceDescription: 'Procurement decision',
        needsReferenceText: 'IAM-99',
        requirementIds: [202],
      })
    })
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
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

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

    expect(await screen.findByText('common.error')).toHaveAttribute(
      'role',
      'alert',
    )
    expect(dialog).toBeInTheDocument()
  })

  it('updates the added-requirements notice when the left filters reveal the requirement', async () => {
    const addedItem = {
      ...initialSpecificationItem,
      id: initialAvailableRequirement.id,
      itemRef: 'lib:202',
      specificationItemId: 202,
      uniqueId: initialAvailableRequirement.uniqueId,
    }
    specificationItemsGetHandler = async url => {
      const matchesAddedRequirement =
        searchParamsFromPath(url).get('uniqueIdSearch') ===
        initialAvailableRequirement.uniqueId
      const items = matchesAddedRequirement ? [addedItem] : []
      return okJson({
        items,
        pagination: {
          count: items.length,
          hasMore: false,
          limit: 50,
          nextCursor: null,
        },
      })
    }

    renderRequirementsSpecificationDetailClient()
    await waitForInitialAvailableRequirementsRefresh()

    act(() => {
      latestItemsTableProps().onFilterChange?.({
        uniqueIdSearch: 'DOES-NOT-MATCH',
      } as never)
    })
    await waitFor(() => {
      expect(latestItemsTableProps().filterValues).toEqual({
        uniqueIdSearch: 'DOES-NOT-MATCH',
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )
    await screen.findByRole('dialog')
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'specification.requirementsAddedHiddenByFilters',
      )
    })
    expect(latestItemsTableProps().filterValues).toEqual({
      uniqueIdSearch: 'DOES-NOT-MATCH',
    })

    act(() => {
      latestItemsTableProps().onFilterChange?.({
        uniqueIdSearch: initialAvailableRequirement.uniqueId,
      } as never)
    })

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        /^specification\.requirementsAdded$/,
      )
    })
    expect(screen.getByRole('status')).not.toHaveTextContent(
      'specification.requirementsAddedHiddenByFilters',
    )
    expect(latestItemsTableProps().rows).toEqual([addedItem])
  })

  it('does not announce a matching added requirement as hidden when it is on a later page', async () => {
    const firstMatchingItem = {
      ...initialSpecificationItem,
      id: 303,
      itemRef: 'lib:303',
      specificationItemId: 303,
      uniqueId: 'IAM0001',
    }
    const addedMatchingItem = {
      ...initialSpecificationItem,
      id: initialAvailableRequirement.id,
      itemRef: 'lib:202',
      specificationItemId: 202,
      uniqueId: initialAvailableRequirement.uniqueId,
    }
    specificationItemsGetHandler = async url => {
      const params = searchParamsFromPath(url)
      const isMatchProbe = params
        .getAll('probeRequirementIds')
        .includes(String(initialAvailableRequirement.id))
      const items = isMatchProbe ? [addedMatchingItem] : [firstMatchingItem]
      return okJson({
        items,
        pagination: {
          count: items.length,
          hasMore: !isMatchProbe,
          limit: Number(params.get('limit') ?? 50),
          nextCursor: isMatchProbe ? null : 'later-page',
        },
      })
    }

    renderRequirementsSpecificationDetailClient()
    await waitForInitialAvailableRequirementsRefresh()

    act(() => {
      latestItemsTableProps().onFilterChange?.({
        uniqueIdSearch: 'IAM',
      } as never)
    })
    await waitFor(() => {
      expect(latestItemsTableProps().rows).toEqual([firstMatchingItem])
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )
    await screen.findByRole('dialog')
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'specification.requirementsAdded',
      )
    })
    expect(screen.getByRole('status')).not.toHaveTextContent(
      'specification.requirementsAddedHiddenByFilters',
    )
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = typeof input === 'string' ? input : input.url
        return (
          url.startsWith(`${specificationApiPath('/items')}?`) &&
          searchParamsFromPath(url).getAll('probeRequirementIds')[0] ===
            String(initialAvailableRequirement.id)
        )
      }),
    ).toBe(true)
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

    expect(
      await screen.findByText('specification.loadAvailableRequirementsFailed'),
    ).toHaveAttribute('role', 'status')
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

  it('creates a specification-local requirement and refreshes the application list', async () => {
    renderRequirementsSpecificationDetailClient()
    const initialItemsGetCount = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).startsWith(`${specificationApiPath('/items')}?`) &&
        (init as RequestInit | undefined)?.method !== 'POST',
    ).length

    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.newLocalRequirement',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /requirement\.description/ }),
      { target: { value: 'Local requirement' } },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === specificationApiPath('/local-requirements') &&
          (init as RequestInit | undefined)?.method === 'POST',
      )
      expect(
        JSON.parse(String((postCall?.[1] as RequestInit | undefined)?.body)),
      ).toEqual(expect.objectContaining({ description: 'Local requirement' }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => {
      const itemsGetCount = fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).startsWith(`${specificationApiPath('/items')}?`) &&
          (init as RequestInit | undefined)?.method !== 'POST',
      ).length
      expect(itemsGetCount).toBeGreaterThan(initialItemsGetCount)
      expect(
        screen.getByTestId('requirements-table-items-rows'),
      ).toHaveTextContent('local:401')
    })
  })

  it('keeps the local-requirement dialog open when creation fails', async () => {
    localRequirementPostOk = false
    renderRequirementsSpecificationDetailClient()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.newLocalRequirement',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /requirement\.description/ }),
      { target: { value: 'Local requirement' } },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Local create failed',
    )
  })

  it('keeps dirty local-requirement edits when discard is cancelled', async () => {
    renderRequirementsSpecificationDetailClient()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.newLocalRequirement',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /requirement\.description/ }),
      { target: { value: 'Unsaved local requirement' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.close' }),
    )

    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.cancel' }),
    )
    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByRole('textbox', { name: /requirement\.description/ }),
    ).toHaveValue('Unsaved local requirement')
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
      specificationItems: createSpecificationItemsPage([
        {
          ...initialSpecificationItem,
          needsReference: 'IAM-42',
          needsReferenceId: 81,
          specificationItemStatusNameEn: 'Included',
        },
      ]),
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

    expect(await screen.findByText('BEH0001')).toBeInTheDocument()
    expect(screen.getByText('RBAC should be enforced.')).toBeInTheDocument()
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('navigates all split-panel tabs and closes the needs-reference form by button and Escape', async () => {
    renderRequirementsSpecificationDetailClient()

    fireEvent.click(screen.getByRole('tab', { name: 'specification.rfiList' }))
    expect(screen.getByText('RFI list panel')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('tab', { name: 'specification.itemsInSpecification' }),
    )
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')
    fireEvent.click(
      screen.getByRole('tab', {
        name: 'specification.requirementSelectionQuestions',
      }),
    )
    expect(
      screen.getByText('specificationRequirementSelection.noQuestions'),
    ).toBeInTheDocument()
    const availableFetchesBeforeQuestionChange = fetchMock.mock.calls.filter(
      ([input]) =>
        String(input).startsWith(
          specificationApiPath('/available-requirements'),
        ),
    ).length
    fireEvent.click(
      screen.getByRole('button', {
        name: 'notify selection questions changed',
      }),
    )
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).startsWith(
            specificationApiPath('/available-requirements'),
          ),
        ).length,
      ).toBeGreaterThan(availableFetchesBeforeQuestionChange)
    })
    fireEvent.click(
      screen.getByRole('tab', { name: 'specification.availableRequirements' }),
    )
    expect(
      screen.getByTestId('requirements-table-available-rows'),
    ).toHaveTextContent('202')
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    expect(
      screen.getByText('specification.noNeedsReferences'),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.newNeedsReference' }),
    )
    let dialog = screen.getByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.close' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(
      screen.getByRole('button', { name: 'specification.newNeedsReference' }),
    )
    dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Enter' })
    expect(dialog).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(
      screen.getByRole('tab', { name: 'specification.itemsInSpecification' }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.newLocalRequirement',
      }),
    )
    dialog = await screen.findByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.close' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.newLocalRequirement',
      }),
    )
    dialog = await screen.findByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Enter' })
    expect(dialog).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('honors an area and left-panel tab selected in the page URL', async () => {
    navigationState.searchParams = new URLSearchParams({
      areaId: '17',
      leftTab: 'rfi',
    })
    const { unmount } = renderRequirementsSpecificationDetailClient()

    expect(screen.getByText('RFI list panel')).toBeInTheDocument()
    await waitFor(() => {
      const itemRequest = fetchMock.mock.calls.find(([url]) => {
        if (!String(url).startsWith(`${specificationApiPath('/items')}?`)) {
          return false
        }
        return searchParamsFromPath(String(url))
          .getAll('areaIds')
          .includes('17')
      })
      expect(itemRequest).toBeDefined()
    })

    unmount()
    navigationState.searchParams = new URLSearchParams({
      leftTab: 'needs-references',
    })
    renderRequirementsSpecificationDetailClient()

    expect(
      screen.getByText('specification.noNeedsReferences'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    ).toHaveAttribute('aria-selected', 'true')
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('loads every needs-reference usage page independently of the visible item page', async () => {
    const usageItems = Array.from({ length: 101 }, (_, index) => ({
      ...initialSpecificationItem,
      id: 1_000 + index,
      itemRef: `lib:${1_000 + index}`,
      needsReferenceId: 81,
      specificationItemId: 1_000 + index,
      uniqueId: `USAGE-${String(index + 1).padStart(3, '0')}`,
    }))
    specificationItemsGetHandler = async url => {
      const params = searchParamsFromPath(url)
      expect(params.getAll('needsReferenceIds')).toEqual(['81'])
      const cursor = params.get('cursor')
      const items = cursor ? usageItems.slice(100) : usageItems.slice(0, 100)
      return okJson({
        items,
        pagination: {
          count: items.length,
          hasMore: cursor == null,
          limit: 100,
          nextCursor: cursor == null ? 'usage-page-2' : null,
        },
      })
    }
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '2026-04-20T10:00:00.000Z',
          description: 'Complete usage',
          id: 81,
          libraryItemCount: 101,
          linkedItemCount: 101,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '2026-04-20T10:00:00.000Z',
        },
      ],
      specificationItems: createSpecificationItemsPage([
        {
          ...initialSpecificationItem,
          needsReferenceId: 81,
        },
      ]),
    })
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.toggleNeedsReferenceUsage/,
      }),
    )

    expect(await screen.findByText('USAGE-101')).toBeInTheDocument()
    expect(screen.getByText('USAGE-001')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).includes('needsReferenceIds=81'),
      ),
    ).toHaveLength(2)
  })

  it('renders Swedish needs-reference usage fallbacks for incomplete application metadata', async () => {
    intlState.locale = 'sv'
    specificationItemsGetHandler = async () =>
      okJson({
        items: [
          {
            ...initialSpecificationItem,
            itemRef: 'lib:fallback',
            specificationItemStatusNameEn: undefined,
            specificationItemStatusNameSv: undefined,
            uniqueId: 'USAGE-FALLBACK',
            version: undefined,
          },
        ],
      })
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '',
          description: 'Ofullständig användning',
          id: 81,
          libraryItemCount: 1,
          linkedItemCount: undefined,
          specificationLocalRequirementCount: 0,
          text: 'BEHOV-81',
          updatedAt: '',
        },
      ],
    })
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    const toggle = screen.getByRole('button', {
      name: /specification\.toggleNeedsReferenceUsage/,
    })
    fireEvent.click(toggle)

    expect(await screen.findByText('USAGE-FALLBACK')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(3)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('USAGE-FALLBACK')).toBeNull()
  })

  it('shows a needs-reference usage error without collapsing the row', async () => {
    specificationItemsGetHandler = async () => ({
      json: async () => ({ error: 'Usage unavailable' }),
      ok: false,
    })
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '',
          description: 'Usage error case',
          id: 81,
          libraryItemCount: 1,
          linkedItemCount: 1,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '',
        },
      ],
    })
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.toggleNeedsReferenceUsage/,
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'specification.loadSpecificationItemsFailed',
    )
    expect(screen.getByText('IAM-42')).toBeInTheDocument()
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

  it('reports a translated error when the needs-reference register cannot refresh after save', async () => {
    needsReferencesGetHandler = async () => {
      throw 'Register refresh unavailable'
    }
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.newNeedsReference' }),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.change(
      within(dialog).getByLabelText('specification.needsReference'),
      { target: { value: 'IAM-REFRESH' } },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'specification.failedToLoadNeedsReferences',
    )
    expect(
      screen.getByText('specification.noNeedsReferences'),
    ).toBeInTheDocument()
  })

  it('updates an existing needs reference from the register tab', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '2026-04-20T10:00:00.000Z',
          description: 'Original context',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '2026-04-20T10:00:00.000Z',
        },
      ],
    })

    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.editNeedsReference' }),
    )
    fireEvent.change(screen.getByLabelText('specification.needsReference'), {
      target: { value: ' IAM-43 ' },
    })
    fireEvent.change(
      screen.getByLabelText('specification.needsReferenceDescription'),
      { target: { value: ' Updated context ' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/8/needs-references',
        expect.objectContaining({ method: 'PATCH' }),
      )
    })
    const patchCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirements-specifications/8/needs-references' &&
        (init as RequestInit | undefined)?.method === 'PATCH',
    )
    expect(
      JSON.parse(String((patchCall?.[1] as RequestInit | undefined)?.body)),
    ).toEqual({ description: 'Updated context', id: 81, text: 'IAM-43' })
  })

  it('keeps a needs reference draft open when the server rejects it', async () => {
    needsReferenceMutationHandler = async method => {
      expect(method).toBe('POST')
      return {
        json: async () => ({ error: 'Needs reference is not valid' }),
        ok: false,
      }
    }
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.newNeedsReference' }),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.change(
      within(dialog).getByLabelText('specification.needsReference'),
      { target: { value: 'IAM-INVALID' } },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Needs reference is not valid',
    )
    expect(
      within(dialog).getByLabelText('specification.needsReference'),
    ).toHaveValue('IAM-INVALID')
  })

  it('keeps an edited needs reference open after a network failure', async () => {
    needsReferenceMutationHandler = async method => {
      expect(method).toBe('PATCH')
      throw new Error('Needs reference network unavailable')
    }
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '',
          description: 'Original context',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '',
        },
      ],
    })
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.editNeedsReference' }),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.change(
      within(dialog).getByLabelText('specification.needsReferenceDescription'),
      { target: { value: 'Updated context' } },
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Needs reference network unavailable',
    )
    expect(
      within(dialog).getByLabelText('specification.needsReferenceDescription'),
    ).toHaveValue('Updated context')
  })

  it('deletes an unused needs reference after confirmation', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '2026-04-20T10:00:00.000Z',
          description: null,
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '2026-04-20T10:00:00.000Z',
        },
      ],
    })

    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.deleteNeedsReference',
      }),
    )
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.delete' }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/8/needs-references',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('keeps a needs reference visible when deletion is rejected', async () => {
    needsReferenceMutationHandler = async method => {
      expect(method).toBe('DELETE')
      return {
        json: async () => ({ error: 'Needs reference is protected' }),
        ok: false,
      }
    }
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '',
          description: 'Decision context',
          id: 81,
          libraryItemCount: 0,
          linkedItemCount: 0,
          specificationLocalRequirementCount: 0,
          text: 'IAM-42',
          updatedAt: '',
        },
      ],
    })
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.deleteNeedsReference',
      }),
    )
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.delete' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Needs reference is protected',
    )
    expect(screen.getByText('IAM-42')).toBeInTheDocument()
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

  it('restores an inline needs reference after server and network failures', async () => {
    const originalItem = {
      ...initialSpecificationItem,
      needsReference: 'ORIGINAL-REF',
      needsReferenceId: 40,
    }
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [{ description: null, id: 81, text: 'IAM-42' }],
      specificationItems: createSpecificationItemsPage([originalItem]),
    })
    specificationItemMutationHandler = async () => ({
      json: async () => ({ error: 'Assignment rejected' }),
      ok: false,
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'assign-needs-ref-lib:31' }),
    )
    await waitFor(() => {
      expect(latestItemsTableProps().rows[0]).toEqual(originalItem)
    })

    specificationItemMutationHandler = async () => {
      throw new Error('Assignment network unavailable')
    }
    fireEvent.click(
      screen.getByRole('button', { name: 'assign-needs-ref-lib:31' }),
    )
    await waitFor(() => {
      expect(latestItemsTableProps().rows[0]).toEqual(originalItem)
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) =>
            String(url).endsWith('/items/lib%3A31') &&
            (init as RequestInit | undefined)?.method === 'PATCH',
        ),
      ).toHaveLength(2)
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
      leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
        { id: 9, name: 'Security package' },
      ]),
      requirementPackages: [
        { id: 9, name: 'Security package' },
      ] as RequirementPackageOption[],
      specificationItems: createSpecificationItemsPage([
        initialSpecificationItem,
        hiddenItem,
      ]),
    }
    specificationItemsGetItems = initialData.specificationItems.items
    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()

    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'sort-description-items' }),
      )
    })
    expect(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    ).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'filter-package-items-9' }),
      )
    })

    await waitFor(() => {
      expect(
        screen.getByTestId('requirements-table-items-status'),
      ).toHaveTextContent('specification.selectionStatus')
    })
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

  it('limits shared selected-item actions without changing the selection', async () => {
    const items = Array.from({ length: 201 }, (_, index) => ({
      ...initialSpecificationItem,
      id: index + 1,
      itemRef: `lib:${index + 1}`,
      requirementPackageIds: [index < 200 ? 1 : 2],
      specificationItemId: index + 1,
      uniqueId: `BEH${String(index + 1).padStart(4, '0')}`,
    }))
    const initialData = {
      ...createInitialData(),
      leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
        { id: 1, name: 'Shown package' },
        { id: 2, name: 'Hidden package' },
      ]),
      requirementPackages: [
        { id: 1, name: 'Shown package' },
        { id: 2, name: 'Hidden package' },
      ],
      specificationItems: createSpecificationItemsPage(items),
    }
    specificationItemsGetItems = items
    renderRequirementsSpecificationDetailClient(initialData)
    await waitForInitialAvailableRequirementsRefresh()

    act(() => {
      latestItemsTableProps().onSelectionChange?.(
        new Set(items.slice(0, 200).map(item => item.id)),
      )
    })

    const sharedActionNames = [
      'specification.assignNeedsReferenceAction',
      'specification.clearNeedsReferenceAction',
      'deviation.requestDeviationSelected',
      'specification.removeSelected',
    ]
    for (const name of sharedActionNames) {
      expect(screen.getByRole('button', { name })).toBeEnabled()
    }

    act(() => {
      latestItemsTableProps().onSelectionChange?.(
        new Set(items.map(item => item.id)),
      )
    })

    expect(intlState.selectionActionLimitExceeded).toHaveBeenLastCalledWith({
      excess: 1,
      hidden: 0,
      limit: 200,
      total: 201,
    })
    for (const name of sharedActionNames) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveClass('disabled:opacity-40')
      expect(button).toHaveAttribute(
        'title',
        'specification.selectionActionLimitExceeded',
      )
    }
    expect(latestItemsTableProps().selectedIds?.size).toBe(201)

    render(latestItemsTableProps().renderExpanded?.(items[0].id) as ReactNode)
    expect(requirementDetailState.renderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ removeFromSpecificationDisabled: false }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-items-1' }),
    )
    await waitFor(() => {
      expect(intlState.selectionActionLimitExceeded).toHaveBeenLastCalledWith({
        excess: 1,
        hidden: 1,
        limit: 200,
        total: 201,
      })
    })

    const deselectNotShown = screen.getByRole('button', {
      name: 'specification.deselectHidden',
    })
    expect(deselectNotShown).toBeEnabled()
    fireEvent.click(deselectNotShown)

    await waitFor(() => {
      expect(latestItemsTableProps().selectedIds?.size).toBe(200)
      expect(intlState.selectionStatus).toHaveBeenLastCalledWith({
        hidden: 0,
        total: 200,
      })
    })
    for (const name of sharedActionNames) {
      expect(screen.getByRole('button', { name })).toBeEnabled()
    }
    expect(
      screen.getByTestId('requirements-table-items-status'),
    ).not.toHaveTextContent('specification.selectionActionLimitExceeded')
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
      specificationItems: createSpecificationItemsPage([item]),
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

  it('keeps needs-reference links when clearing is cancelled', async () => {
    const item = { ...initialSpecificationItem, needsReferenceId: 81 }
    specificationItemsGetItems = [item]
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage([item]),
    })
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.clearNeedsReferenceAction',
      }),
    )
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.cancel' }),
    )

    expect(
      screen.getByRole('button', {
        name: 'specification.clearNeedsReferenceAction',
      }),
    ).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === specificationApiPath('/items') &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(false)
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('reports a selected-item resolution failure before bulk assignment', async () => {
    specificationItemResolutionHandler = async () => {
      throw new Error('Could not resolve selected applications')
    }
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not resolve selected applications',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes bulk assignment if selected applications disappear before save', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [{ description: null, id: 81, text: 'IAM-42' }],
    })
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    )
    const dialog = await screen.findByRole('dialog')
    specificationItemResolutionHandler = async () => okJson({ items: [] })
    fireEvent.change(
      within(dialog).getByLabelText('specification.needsReference'),
      { target: { value: '81' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.confirm' }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === specificationApiPath('/items') &&
          (init as RequestInit | undefined)?.method === 'PATCH',
      ),
    ).toBe(false)
  })

  it('distinguishes mixed removal and resolves all selected item refs before deletion', async () => {
    const libraryItems = Array.from({ length: 51 }, (_, index) => ({
      ...initialSpecificationItem,
      id: 101 + index,
      itemRef: `lib:${31 + index}`,
      specificationItemId: 31 + index,
      uniqueId: `BEH${String(index + 1).padStart(4, '0')}`,
    }))
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
      specificationItems: createSpecificationItemsPage([
        ...libraryItems,
        localItem,
      ]),
    }
    specificationItemsGetItems = initialData.specificationItems.items
    renderRequirementsSpecificationDetailClient(initialData)
    act(() => {
      latestItemsTableProps().onSelectionChange?.(
        new Set([...libraryItems.map(item => item.id), -41]),
      )
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
      const resolutionCalls = fetchMock.mock.calls.filter(([input]) =>
        String(input).startsWith('/api/specification-item-resolutions/8?'),
      )
      expect(resolutionCalls).toHaveLength(2)
      expect(
        resolutionCalls.map(
          ([input]) =>
            searchParamsFromPath(String(input)).getAll('refs').length,
        ),
      ).toEqual([50, 2])
    })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/8/items',
        expect.objectContaining({
          body: JSON.stringify({
            itemRefs: [...libraryItems.map(item => item.itemRef), 'local:41'],
          }),
          method: 'DELETE',
        }),
      )
    })
  })

  it('cancels a library-only removal without sending a delete request', async () => {
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )
    const confirmation = await screen.findByRole('alertdialog', {
      name: 'specification.removeSelected',
    })
    expect(confirmation).toHaveTextContent('specification.removeConfirm')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.cancel' }),
    )

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === specificationApiPath('/items') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      ),
    ).toBe(false)
  })

  it('removes a specification-local application after the local-only warning', async () => {
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
    specificationItemsGetItems = [localItem]
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage([localItem]),
    })
    fireEvent.click(screen.getByRole('button', { name: 'select-row--41' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )
    const confirmation = await screen.findByRole('alertdialog', {
      name: 'specification.removeSpecificationLocalConfirmTitle',
    })
    expect(confirmation).toHaveTextContent(
      'specification.removeSpecificationLocalConfirm',
    )
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.delete' }),
    )

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === specificationApiPath('/items') &&
          (init as RequestInit | undefined)?.method === 'DELETE',
      )
      expect(
        JSON.parse(String((deleteCall?.[1] as RequestInit | undefined)?.body)),
      ).toEqual({ itemRefs: ['local:41'] })
      expect(
        screen.queryByRole('button', { name: 'specification.removeSelected' }),
      ).toBeNull()
      expect(
        screen.getByRole('button', {
          name: 'specification.newLocalRequirement',
        }),
      ).toBeInTheDocument()
    })
  })

  it('reports a server rejection while keeping a library application selected', async () => {
    deleteItemsHandler = async () => ({
      json: async () => ({ error: 'Application cannot be removed' }),
      ok: false,
    })
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.delete' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Application cannot be removed',
    )
    expect(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    ).toBeInTheDocument()
  })

  it('reports a removal network failure without dropping the selection', async () => {
    deleteItemsHandler = async () => {
      throw new Error('Removal network unavailable')
    }
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.delete' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Removal network unavailable',
    )
    expect(latestItemsTableProps().selectedIds).toEqual(new Set([101]))
  })

  it('reports partial mixed removal and keeps only the failed application selected', async () => {
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
    const items = [initialSpecificationItem, localItem]
    specificationItemsGetItems = items
    let resolutionCount = 0
    specificationItemResolutionHandler = async () => {
      resolutionCount += 1
      return okJson({ items: resolutionCount === 1 ? items : [localItem] })
    }
    deleteItemsHandler = async () => okJson({ ok: true, removedCount: 1 })
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage(items),
    })
    act(() => {
      latestItemsTableProps().onSelectionChange?.(new Set([101, -41]))
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.delete' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'specification.removePartialFail',
    )
    expect(latestItemsTableProps().selectedIds).toEqual(new Set([-41]))
  })

  it('reports a removal resolution failure before asking for confirmation', async () => {
    specificationItemResolutionHandler = async () => {
      throw new Error('Application resolution unavailable')
    }
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Application resolution unavailable',
    )
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('disables detail unlink while a confirmed removal request is pending', async () => {
    let completeDelete: ((response: unknown) => void) | undefined
    deleteItemsHandler = () =>
      new Promise(resolve => {
        completeDelete = resolve
      })
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(
      screen.getByRole('button', { name: 'expand-row-items-101' }),
    )
    expect(
      await screen.findByText('Requirement detail 101'),
    ).toBeInTheDocument()
    act(() => {
      latestItemsTableProps().onSelectionChange?.(new Set([101]))
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.removeSelected' }),
    )
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(confirmation).getByRole('button', { name: 'common.delete' }),
    )

    await waitFor(() => {
      expect(completeDelete).toBeDefined()
    })
    render(latestItemsTableProps().renderExpanded?.(101) as ReactNode)
    expect(requirementDetailState.renderSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ removeFromSpecificationDisabled: true }),
    )

    await act(async () => {
      completeDelete?.(okJson({ ok: true, removedCount: 1 }))
    })
    await waitFor(() => {
      render(latestItemsTableProps().renderExpanded?.(101) as ReactNode)
      expect(requirementDetailState.renderSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ removeFromSpecificationDisabled: false }),
      )
    })
  })

  it('shows Swedish bulk deviation priorities with localized fallbacks in configured sort order', async () => {
    intlState.locale = 'sv'
    const highPriorityItem = {
      ...initialSpecificationItem,
      version: {
        ...initialSpecificationItem.version,
        priorityLevelCode: 'P4',
        priorityLevelColor: '#f97316',
        priorityLevelIconName: 'ArrowUpRight',
        priorityLevelId: 4,
        priorityLevelNameEn: null,
        priorityLevelNameSv: 'Hög',
        priorityLevelSortOrder: 4,
      },
    }
    const lowPriorityItem = {
      ...initialSpecificationItem,
      id: 102,
      itemRef: 'lib:32',
      specificationItemId: 32,
      uniqueId: 'BEH0002',
      version: {
        ...initialSpecificationItem.version,
        priorityLevelCode: 'P2',
        priorityLevelColor: '#22c55e',
        priorityLevelIconName: null,
        priorityLevelId: 2,
        priorityLevelNameEn: 'Low fallback',
        priorityLevelNameSv: null,
        priorityLevelSortOrder: null,
      },
    }
    const sameOrderPriorityItem = {
      ...initialSpecificationItem,
      id: 104,
      itemRef: 'lib:34',
      specificationItemId: 34,
      uniqueId: 'BEH0004',
      version: {
        ...initialSpecificationItem.version,
        priorityLevelCode: 'P1',
        priorityLevelColor: null,
        priorityLevelIconName: null,
        priorityLevelId: 1,
        priorityLevelNameEn: 'Low',
        priorityLevelNameSv: 'Låg',
        priorityLevelSortOrder: 4,
      },
    }
    const incompletePriorityItem = {
      ...initialSpecificationItem,
      id: 105,
      itemRef: 'lib:35',
      specificationItemId: 35,
      uniqueId: 'BEH0005',
      version: {
        ...initialSpecificationItem.version,
        priorityLevelCode: null,
        priorityLevelId: 5,
      },
    }
    const duplicateHighPriorityItem = {
      ...highPriorityItem,
      id: 103,
      itemRef: 'lib:33',
      specificationItemId: 33,
      uniqueId: 'BEH0003',
    }
    const items = [
      highPriorityItem,
      lowPriorityItem,
      sameOrderPriorityItem,
      incompletePriorityItem,
      duplicateHighPriorityItem,
    ]
    specificationItemsGetItems = items
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage(items),
    })
    act(() => {
      latestItemsTableProps().onSelectionChange?.(
        new Set([101, 102, 103, 104, 105]),
      )
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'deviation.requestDeviationSelected',
      }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'deviation.requestDeviation',
    })
    expect(
      within(dialog).getByText('deviation.priorityLevels'),
    ).toBeInTheDocument()
    const priorityBadges = dialog.querySelectorAll('.status-badge')
    expect([...priorityBadges].map(badge => badge.textContent)).toEqual([
      'P1 – Låg',
      'P4 – Hög',
      'P2 – Low fallback',
    ])
    expect(priorityBadges[0]?.querySelector('svg')).toBeNull()
    expect(priorityBadges[1]?.querySelector('svg')).toBeTruthy()
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
      specificationItems: createSpecificationItemsPage([
        initialSpecificationItem,
        localItem,
      ]),
    }
    specificationItemsGetItems = initialData.specificationItems.items
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

  it('bounds concurrent bulk deviation requests while settling every item', async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      ...initialSpecificationItem,
      id: 101 + index,
      itemRef: `lib:${31 + index}`,
      specificationItemId: 31 + index,
      uniqueId: `BEH${String(index + 1).padStart(4, '0')}`,
    }))
    specificationItemsGetItems = items
    let inFlight = 0
    let maxInFlight = 0
    const completeRequests: Array<() => void> = []
    deviationPostHandler = () =>
      new Promise(resolve => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        completeRequests.push(() => {
          inFlight -= 1
          resolve(okJson({ deviation: { id: 1 }, ok: true }))
        })
      })
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage(items),
    })
    act(() => {
      latestItemsTableProps().onSelectionChange?.(
        new Set(items.map(item => item.id)),
      )
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'deviation.requestDeviationSelected',
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'deviation.requestDeviation',
    })
    fireEvent.change(
      within(dialog).getByLabelText(/deviation\.motivation/, {
        selector: 'textarea',
      }),
      { target: { value: 'Bounded motivation' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'deviation.newDeviation' }),
    )

    await waitFor(() => {
      expect(completeRequests).toHaveLength(4)
    })
    expect(maxInFlight).toBe(4)
    act(() => {
      for (const complete of completeRequests.splice(0, 4)) complete()
    })
    await waitFor(() => {
      expect(completeRequests).toHaveLength(1)
    })
    act(() => {
      completeRequests.shift()?.()
    })
    await waitFor(() => {
      expect(latestItemsTableProps().selectedIds).toEqual(new Set())
    })
    expect(maxInFlight).toBe(4)
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

  it('automatically appends bounded specification pages and de-duplicates stable item refs', async () => {
    const secondItem = {
      ...initialSpecificationItem,
      id: 102,
      itemRef: 'lib:32',
      specificationItemId: 32,
      uniqueId: 'BEH0002',
    }
    const initialData = createInitialData()
    initialData.specificationItems = createSpecificationItemsPage(
      [initialSpecificationItem],
      { hasMore: true, nextCursor: 'cursor-1' },
    )
    specificationItemsGetHandler = async url => {
      expect(searchParamsFromPath(url).get('cursor')).toBe('cursor-1')
      return okJson({
        items: [initialSpecificationItem, secondItem],
        pagination: {
          count: 2,
          hasMore: false,
          limit: 50,
          nextCursor: null,
        },
      })
    }

    renderRequirementsSpecificationDetailClient(initialData)
    expect(
      screen.getByRole('button', {
        name: 'load-more-items',
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'load-more-items',
      }),
    )

    await waitFor(() => {
      expect(
        latestItemsTableProps().rows.map(
          (item: SpecificationListItem) => item.itemRef,
        ),
      ).toEqual(['lib:31', 'lib:32'])
    })
    expect(
      screen.queryByRole('button', {
        name: 'load-more-items',
      }),
    ).not.toBeInTheDocument()
  })

  it('treats an omitted continuation payload as an empty final page', async () => {
    specificationItemsGetHandler = async url => {
      expect(searchParamsFromPath(url).get('cursor')).toBe('empty-page')
      return okJson({})
    }
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage(
        [initialSpecificationItem],
        { hasMore: true, nextCursor: 'empty-page' },
      ),
    })
    fireEvent.click(screen.getByRole('button', { name: 'load-more-items' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'load-more-items' }),
      ).toBeNull()
      expect(
        screen.getByTestId('requirements-table-items-rows'),
      ).toHaveTextContent('lib:31')
    })
  })

  it('does not flash the empty specification message while sorting', async () => {
    let resolveSortedRequest: ((response: unknown) => void) | undefined
    const sortedRequest = new Promise<unknown>(resolve => {
      resolveSortedRequest = resolve
    })
    specificationItemsGetHandler = async () => sortedRequest

    renderRequirementsSpecificationDetailClient()
    expect(screen.queryByText('specification.noItems')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'sort-description-items' }),
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('sortBy=description'),
        ),
      ).toBe(true)
    })
    expect(screen.queryByText('specification.noItems')).not.toBeInTheDocument()
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')

    await act(async () => {
      resolveSortedRequest?.(
        okJson({
          items: [],
          pagination: {
            count: 0,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        }),
      )
    })

    expect(await screen.findByText('specification.noItems')).toBeInTheDocument()
  })

  it('keeps the unloaded selected count stable while sorting', async () => {
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
    }
    specificationItemsGetItems = [firstItem, secondItem]
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      leftRequirementPackageCatalog: createRequirementPackageCatalogPage([
        { id: 1, name: 'First package' },
        { id: 2, name: 'Second package' },
      ]),
      requirementPackages: [
        { id: 1, name: 'First package' },
        { id: 2, name: 'Second package' },
      ],
      specificationItems: createSpecificationItemsPage([firstItem, secondItem]),
    })

    act(() => {
      latestItemsTableProps().onSelectionChange?.(new Set([101, 102]))
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'filter-package-items-1' }),
    )
    await waitFor(() => {
      expect(
        screen.getByTestId('requirements-table-items-rows'),
      ).toHaveTextContent('lib:31')
      expect(intlState.selectionStatus).toHaveBeenLastCalledWith({
        hidden: 1,
        total: 2,
      })
    })

    let resolveSortedRequest: ((response: unknown) => void) | undefined
    const sortedRequest = new Promise<unknown>(resolve => {
      resolveSortedRequest = resolve
    })
    specificationItemsGetHandler = async () => sortedRequest
    fireEvent.click(
      screen.getByRole('button', { name: 'sort-description-items' }),
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('sortBy=description'),
        ),
      ).toBe(true)
    })
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')
    expect(intlState.selectionStatus).toHaveBeenLastCalledWith({
      hidden: 1,
      total: 2,
    })

    await act(async () => {
      resolveSortedRequest?.(
        okJson({
          items: [firstItem],
          pagination: {
            count: 1,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        }),
      )
    })
  })

  it('restarts an invalid continuation from the first page and keeps selection', async () => {
    const restartedItem = {
      ...initialSpecificationItem,
      id: 102,
      itemRef: 'lib:32',
      specificationItemId: 32,
      uniqueId: 'BEH0002',
    }
    const initialData = createInitialData()
    initialData.specificationItems = createSpecificationItemsPage(
      [initialSpecificationItem],
      { hasMore: true, nextCursor: 'stale-cursor' },
    )
    specificationItemsGetHandler = async url => {
      if (searchParamsFromPath(url).has('cursor')) {
        return {
          clone: () => ({ json: async () => ({ code: 'invalid_cursor' }) }),
          json: async () => ({ code: 'invalid_cursor' }),
          ok: false,
          status: 400,
        }
      }
      return okJson({
        items: [restartedItem],
        pagination: {
          count: 1,
          hasMore: false,
          limit: 50,
          nextCursor: null,
        },
      })
    }

    renderRequirementsSpecificationDetailClient(initialData)
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'load-more-items',
      }),
    )

    expect(
      await screen.findByText('specification.paginationRestarted'),
    ).toHaveAttribute('role', 'status')
    expect(
      latestItemsTableProps().rows.map(
        (item: SpecificationListItem) => item.itemRef,
      ),
    ).toEqual(['lib:32'])
    expect(
      screen.getByRole('button', {
        name: 'specification.assignNeedsReferenceAction',
      }),
    ).toBeInTheDocument()
  })

  it('keeps rows visible and restores retry focus when cursor recovery fails', async () => {
    const initialData = createInitialData()
    initialData.specificationItems = createSpecificationItemsPage(
      [initialSpecificationItem],
      { hasMore: true, nextCursor: 'stale-cursor' },
    )
    specificationItemsGetHandler = async url => {
      if (searchParamsFromPath(url).has('cursor')) {
        return {
          clone: () => ({ json: async () => ({ code: 'invalid_cursor' }) }),
          json: async () => ({ code: 'invalid_cursor' }),
          ok: false,
          status: 400,
        }
      }
      return {
        json: async () => ({ error: 'Unavailable' }),
        ok: false,
        status: 503,
      }
    }

    renderRequirementsSpecificationDetailClient(initialData)
    fireEvent.click(
      screen.getByRole('button', {
        name: 'load-more-items',
      }),
    )

    const recoveryAlert = await screen.findByRole('alert')
    expect(recoveryAlert).toHaveTextContent(
      'specification.paginationRecoveryFailed',
    )
    expect(
      latestItemsTableProps().rows.map(
        (item: SpecificationListItem) => item.itemRef,
      ),
    ).toEqual(['lib:31'])

    const retry = within(recoveryAlert).getByRole('button', {
      name: 'common.retry',
    })
    fireEvent.click(retry)
    await waitFor(() => {
      expect(
        within(screen.getByRole('alert')).getByRole('button', {
          name: 'common.retry',
        }),
      ).toHaveFocus()
    })
  })

  it('ignores obsolete specification queries after filters change', async () => {
    const firstResult = {
      ...initialSpecificationItem,
      id: 102,
      itemRef: 'lib:32',
      specificationItemId: 32,
      uniqueId: 'FIRST',
    }
    const latestResult = {
      ...initialSpecificationItem,
      id: 103,
      itemRef: 'lib:33',
      specificationItemId: 33,
      uniqueId: 'LATEST',
    }
    let resolveObsoleteRequest: ((response: unknown) => void) | undefined
    const obsoleteRequest = new Promise<unknown>(resolve => {
      resolveObsoleteRequest = resolve
    })
    specificationItemsGetHandler = async url => {
      const search = searchParamsFromPath(url).get('uniqueIdSearch')
      if (search === 'first') return obsoleteRequest
      return okJson({
        items: [latestResult],
        pagination: {
          count: 1,
          hasMore: false,
          limit: 50,
          nextCursor: null,
        },
      })
    }

    renderRequirementsSpecificationDetailClient()
    act(() => {
      latestItemsTableProps().onFilterChange?.({ uniqueIdSearch: 'first' })
    })
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes('uniqueIdSearch=first'),
        ),
      ).toBe(true)
    })
    act(() => {
      latestItemsTableProps().onFilterChange?.({ uniqueIdSearch: 'latest' })
    })
    await waitFor(() => {
      expect(
        latestItemsTableProps().rows.map(
          (item: SpecificationListItem) => item.itemRef,
        ),
      ).toEqual(['lib:33'])
    })

    await act(async () => {
      resolveObsoleteRequest?.(
        okJson({
          items: [firstResult],
          pagination: {
            count: 1,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
        }),
      )
      await Promise.resolve()
    })
    expect(
      latestItemsTableProps().rows.map(
        (item: SpecificationListItem) => item.itemRef,
      ),
    ).toEqual(['lib:33'])
  })

  it('clears an active available selection when selection answers change', async () => {
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
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())
    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    expect(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('tab', {
        name: 'specification.requirementSelectionQuestions',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'notify selection questions changed',
      }),
    )
    fireEvent.click(
      screen.getByRole('tab', { name: 'specification.availableRequirements' }),
    )

    await waitFor(() => {
      expect(
        screen.queryByRole('button', {
          name: 'specification.addSelectedToSpecification',
        }),
      ).toBeNull()
    })
  })

  it('keeps list rows usable when refresh resources reject with Error values', async () => {
    availableRequirementsGetHandler = async () => {
      throw new Error('Available requirements offline')
    }
    normReferencesGetHandler = async () => {
      throw new Error('Norm references offline')
    }
    specificationItemsGetHandler = async () => {
      throw 'Items offline'
    }
    renderRequirementsSpecificationDetailClient()

    expect(
      await screen.findByText('Available requirements offline'),
    ).toHaveAttribute('role', 'status')
    fireEvent.click(
      screen.getByRole('button', { name: 'toggle-status-filter-items' }),
    )
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).startsWith('/api/norm-references'),
        ),
      ).toBe(true)
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'sort-description-items' }),
    )
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'specification.loadSpecificationItemsFailed',
      )
    })
    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('lib:31')
  })

  it('shows the original specification after a non-Error metadata refresh failure', async () => {
    specificationMetaGetHandler = async () => {
      throw 'Metadata offline'
    }
    renderRequirementsSpecificationDetailClient()
    fireEvent.click(
      screen.getByRole('button', { name: 'specification.editSpecification' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'specification.editSpecification',
    })
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Specification awaiting refresh' } },
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: /common\.save/i }),
    )

    expect(
      await screen.findByText('specification.loadSpecificationFailed'),
    ).toHaveAttribute('role', 'status')
    expect(
      screen.getByRole('heading', { level: 1, name: initialSpec.name }),
    ).toBeInTheDocument()
  })

  it('loads needs references after an Error-valued preload failure', async () => {
    needsReferencesGetHandler = async () => {
      throw new Error('Needs register offline')
    }
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      errors: [
        {
          key: SPECIFICATION_PRELOAD_ERROR_KEYS.needsReferences,
          message: 'Needs references missing from preload',
        },
      ],
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.newLocalRequirement',
      }),
    )

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input]) =>
            String(input) === specificationApiPath('/needs-references'),
        ),
      ).toBe(true)
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'specification.partialDataLoadWarning',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('keeps an item without a stable reference visible but unselected', async () => {
    const itemWithoutRef = {
      ...initialSpecificationItem,
      itemRef: undefined,
    }
    specificationItemsGetItems = [itemWithoutRef]
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      specificationItems: createSpecificationItemsPage([itemWithoutRef]),
    })

    expect(
      screen.getByTestId('requirements-table-items-rows'),
    ).toHaveTextContent('101')
    fireEvent.click(screen.getByRole('button', { name: 'select-row-101' }))
    expect(
      screen.queryByRole('button', {
        name: 'specification.removeSelectedFromSpecification',
      }),
    ).toBeNull()
    await waitForInitialAvailableRequirementsRefresh()
  })

  it('renders English needs-reference fallbacks for sparse usage metadata', async () => {
    specificationItemsGetHandler = async () =>
      okJson({
        items: [
          {
            ...initialSpecificationItem,
            itemRef: 'lib:english-fallback',
            specificationItemStatusNameEn: undefined,
            uniqueId: 'USAGE-ENGLISH-FALLBACK',
            version: {
              ...initialSpecificationItem.version,
              description: undefined,
              typeNameEn: undefined,
            },
          },
        ],
      })
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      availableNeedsRefs: [
        {
          createdAt: '',
          description: 'Sparse usage',
          id: 82,
          libraryItemCount: 1,
          linkedItemCount: 1,
          specificationLocalRequirementCount: 0,
          text: 'NEED-82',
          updatedAt: '',
        },
      ],
    })
    fireEvent.click(
      screen.getByRole('tab', { name: /specification\.needsReferences/ }),
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.toggleNeedsReferenceUsage/,
      }),
    )

    expect(
      await screen.findByText('USAGE-ENGLISH-FALLBACK'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('offers the management report for a specification in management', async () => {
    renderRequirementsSpecificationDetailClient({
      ...createInitialData(),
      spec: {
        ...initialSpec,
        lifecycleStatus: {
          id: 4,
          nameEn: 'Management',
          nameSv: 'Förvaltning',
        },
        specificationLifecycleStatusId: 4,
      },
    })
    await waitForInitialAvailableRequirementsRefresh()
    const moreActions = (
      latestItemsTableProps().floatingActions as Array<{
        id: string
        menuItems?: Array<{
          id: string
          onClick?: (target?: HTMLButtonElement | null) => void
        }>
      }>
    ).find(action => action.id === 'more-actions')
    const trigger = document.createElement('button')
    moreActions?.menuItems
      ?.find(item => item.id === 'pdf-management')
      ?.onClick?.(trigger)

    expect(moreActions?.menuItems?.map(item => item.id)).toContain(
      'pdf-management',
    )
    expect(pdfDownloadState.download).toHaveBeenCalledWith(
      expect.objectContaining({
        restoreFocusTo: trigger,
        url: '/en/specifications/8/reports/pdf/management',
      }),
    )
  })

  it.each([
    ['Error', new Error('Available continuation offline')],
    ['non-Error', 'Available continuation offline'],
  ])(
    'keeps available rows after an %s load-more failure',
    async (_kind, failure) => {
      availableRequirementsGetHandler = async url => {
        if (searchParamsFromPath(url).has('cursor')) throw failure
        return okJson({
          pagination: { hasMore: true, nextCursor: 'cursor-2' },
          requirements: [initialAvailableRequirement],
        })
      }
      renderRequirementsSpecificationDetailClient({
        ...createInitialData(),
        availableRequirements: {
          hasMore: true,
          nextCursor: 'cursor-2',
          rows: [initialAvailableRequirement],
        },
      })
      const loadMore = await screen.findByRole('button', {
        name: 'load-more-available',
      })
      fireEvent.click(loadMore)

      expect(
        await screen.findByText(
          failure instanceof Error
            ? failure.message
            : 'specification.loadAvailableRequirementsFailed',
        ),
      ).toHaveAttribute('role', 'status')
      expect(
        screen.getByTestId('requirements-table-available-rows'),
      ).toHaveTextContent('202')
    },
  )

  it('keeps selection filtering on while an empty continuation finishes the list', async () => {
    availableRequirementsSelectionFilter = {
      applied: false,
      hasCurrentAnswers: true,
      hasRequirementSelection: true,
      hasNoRequirementSelection: false,
      requirementIds: [202],
    }
    availableRequirementsGetHandler = async url => {
      if (searchParamsFromPath(url).has('cursor')) return okJson({})
      return okJson({
        pagination: { hasMore: true, nextCursor: 'filtered-cursor' },
        requirements: [initialAvailableRequirement],
        selectionFilter: {
          ...availableRequirementsSelectionFilter,
          applied: url.includes('applyRequirementSelectionFilter=true'),
        },
      })
    }
    renderRequirementsSpecificationDetailClient()
    const toggle = await screen.findByRole('switch', {
      name: 'specification.filterWithRequirementSelectionQuestions',
    })
    fireEvent.click(toggle)
    const loadMore = await screen.findByRole('button', {
      name: 'load-more-available',
    })
    fireEvent.click(loadMore)

    await waitFor(() => {
      expect(
        availableRequirementsFetchUrls().some(url => {
          const params = searchParamsFromPath(url)
          return (
            params.get('cursor') === 'filtered-cursor' &&
            params.get('applyRequirementSelectionFilter') === 'true'
          )
        }),
      ).toBe(true)
      expect(
        screen.queryByRole('button', { name: 'load-more-available' }),
      ).toBeNull()
    })
    expect(
      screen.getByTestId('requirements-table-available-rows'),
    ).toHaveTextContent('202')
  })
})
