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
import { registerGeneratedOutputTests } from './requirements-specification-detail-generated-output.suite'
import { registerNeedsReferenceTests } from './requirements-specification-detail-needs-references.suite'
import { registerPaginationTests } from './requirements-specification-detail-pagination.suite'
import { registerSelectionTests } from './requirements-specification-detail-selection.suite'

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
      if (ns === 'specification' && key === 'downloadProfileReportPdf') {
        return `${ns}.${key}.${String(values?.report)}`
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
        {props.onRemoveFromSpecification ? (
          <button
            disabled={props.removeFromSpecificationDisabled}
            onClick={() => void props.onRemoveFromSpecification?.()}
            type="button"
          >
            remove requirement from specification
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
  default: (props: {
    onImportPreview?: (payload: string, options: { preview?: unknown }) => void
    open?: boolean
    returnFocusTarget?: HTMLElement | null
  }) => {
    lazyFeatureState.aiRenderSpy(props)
    return props.open ? (
      <section aria-label="AI authoring">
        <button
          onClick={() => props.onImportPreview?.('{"requirements":[]}', {})}
          type="button"
        >
          review AI requirements
        </button>
      </section>
    ) : null
  },
}))

vi.mock('@/components/LazyRequirementsImportDialog', () => ({
  default: (props: {
    onClose?: (importSucceeded: boolean) => void | Promise<void>
    open?: boolean
    returnFocusTarget?: HTMLElement | null
  }) => {
    lazyFeatureState.importRenderSpy(props)
    return props.open ? (
      <section aria-label="Import review">
        <button onClick={() => void props.onClose?.(false)} type="button">
          cancel import review
        </button>
        <button onClick={() => void props.onClose?.(true)} type="button">
          finish import review
        </button>
      </section>
    ) : null
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
    rows: {
      id: number
      itemRef?: string
      needsReference?: string | null
      requirementPackageIds?: number[]
    }[]
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
    const renderedRows = props.rows.filter(
      (row, index) =>
        props.rows.findIndex(candidate => candidate.id === row.id) === index,
    )
    const lastRenderedRow = renderedRows.at(-1)
    const renderedRowsInMock =
      renderedRows.length > 25 && lastRenderedRow
        ? [...renderedRows.slice(0, 24), lastRenderedRow]
        : renderedRows
    return (
      <div
        data-floating-action-rail-placement={
          props.floatingActionRailPlacement ?? 'fixed-right'
        }
      >
        <table aria-label={`${tableKind} requirements`}>
          <tbody>
            {renderedRowsInMock.map(row => (
              <tr key={row.itemRef ?? row.id}>
                <td>{row.itemRef ?? row.id}</td>
                {row.needsReference ? <td>{row.needsReference}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
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
            <div key={action.id}>
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
                <div aria-label={`${action.id} menu`} role="menu">
                  {action.menuItems.map(menuItem => (
                    <button
                      disabled={menuItem.disabled}
                      key={menuItem.id}
                      onClick={event => menuItem.onClick?.(event.currentTarget)}
                      role="menuitem"
                      type="button"
                    >
                      {menuItem.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
          <>
            <label>
              {`search ${tableKind} requirements`}
              <input
                aria-label={`search-${tableKind}-requirements`}
                onChange={event =>
                  props.onFilterChange?.({
                    ...props.filterValues,
                    uniqueIdSearch: event.currentTarget.value,
                  })
                }
                value={props.filterValues?.uniqueIdSearch ?? ''}
              />
            </label>
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
            <button
              aria-label={`search-first-${tableKind}`}
              onClick={() =>
                props.onFilterChange?.({ uniqueIdSearch: 'first' })
              }
              type="button"
            >
              search first
            </button>
            <button
              aria-label={`search-latest-${tableKind}`}
              onClick={() =>
                props.onFilterChange?.({ uniqueIdSearch: 'latest' })
              }
              type="button"
            >
              search latest
            </button>
          </>
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
        {props.selectable ? (
          <>
            <button
              aria-label={`select-all-${tableKind}`}
              onClick={() =>
                props.onSelectionChange?.(
                  new Set([
                    ...(props.selectedIds ?? []),
                    ...renderedRows.map(row => row.id),
                  ]),
                )
              }
              type="button"
            >
              select all
            </button>
            {renderedRowsInMock.map(row => (
              <button
                aria-label={`select-row-${row.id}`}
                aria-pressed={props.selectedIds?.has(row.id) ?? false}
                key={`select-${row.id}`}
                onClick={() => {
                  const next = new Set(props.selectedIds ?? [])
                  if (next.has(row.id)) {
                    next.delete(row.id)
                  } else {
                    next.add(row.id)
                  }
                  props.onSelectionChange?.(next)
                }}
                type="button"
              >
                select
              </button>
            ))}
          </>
        ) : null}
        {props.onNeedsReferenceChange && props.rows[0]?.itemRef ? (
          <>
            <button
              aria-label={`assign-needs-ref-${props.rows[0].itemRef}`}
              onClick={() =>
                props.onNeedsReferenceChange?.(props.rows[0].itemRef ?? '', 81)
              }
              type="button"
            >
              assign needs ref
            </button>
            <button
              aria-label="clear-needs-ref-lib:missing"
              onClick={() =>
                props.onNeedsReferenceChange?.('lib:missing', null)
              }
              type="button"
            >
              clear unknown needs ref
            </button>
          </>
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

function selectRequirementRows(ids: number[]) {
  for (const id of ids) {
    fireEvent.click(screen.getByRole('button', { name: `select-row-${id}` }))
  }
}

function requirementRowNames(
  tableKind: 'available' | 'items',
): Array<string | null> {
  return within(
    screen.getByRole('table', { name: `${tableKind} requirements` }),
  )
    .getAllByRole('row')
    .map(row => row.textContent)
}

const workflowContext = {
  availableRequirementsFetchUrls,
  createInitialData,
  createRequirementPackageCatalogPage,
  createSpecificationItemsPage,
  defaultSpecificationId,
  dialogPanelMotion,
  fetchMock,
  fadeMotion,
  get addRequirementsResponse() {
    return addRequirementsResponse
  },
  set addRequirementsResponse(value) {
    addRequirementsResponse = value
  },
  get availableRequirementsGetHandler() {
    return availableRequirementsGetHandler
  },
  set availableRequirementsGetHandler(value) {
    availableRequirementsGetHandler = value
  },
  get availableRequirementsSelectionFilter() {
    return availableRequirementsSelectionFilter
  },
  set availableRequirementsSelectionFilter(value) {
    availableRequirementsSelectionFilter = value
  },
  get bulkNeedsReferencePatchError() {
    return bulkNeedsReferencePatchError
  },
  set bulkNeedsReferencePatchError(value) {
    bulkNeedsReferencePatchError = value
  },
  get bulkNeedsReferencePatchResponse() {
    return bulkNeedsReferencePatchResponse
  },
  set bulkNeedsReferencePatchResponse(value) {
    bulkNeedsReferencePatchResponse = value
  },
  get deleteItemsHandler() {
    return deleteItemsHandler
  },
  set deleteItemsHandler(value) {
    deleteItemsHandler = value
  },
  get deviationPostHandler() {
    return deviationPostHandler
  },
  set deviationPostHandler(value) {
    deviationPostHandler = value
  },
  get failedDeviationItemRefs() {
    return failedDeviationItemRefs
  },
  get failNextAvailableRequirementsFetch() {
    return failNextAvailableRequirementsFetch
  },
  set failNextAvailableRequirementsFetch(value) {
    failNextAvailableRequirementsFetch = value
  },
  get failNextSpecificationItemsFetch() {
    return failNextSpecificationItemsFetch
  },
  set failNextSpecificationItemsFetch(value) {
    failNextSpecificationItemsFetch = value
  },
  initialAvailableRequirement,
  initialSpec,
  initialSpecificationItem,
  intlState,
  get itemStatusPatchOk() {
    return itemStatusPatchOk
  },
  set itemStatusPatchOk(value) {
    itemStatusPatchOk = value
  },
  latestAvailableTableProps,
  latestItemsTableProps,
  lazyFeatureState,
  get localRequirementPostOk() {
    return localRequirementPostOk
  },
  set localRequirementPostOk(value) {
    localRequirementPostOk = value
  },
  localRequirementDetailState,
  navigationState,
  get needsReferenceMutationHandler() {
    return needsReferenceMutationHandler
  },
  set needsReferenceMutationHandler(value) {
    needsReferenceMutationHandler = value
  },
  get needsReferencesGetBody() {
    return needsReferencesGetBody
  },
  set needsReferencesGetBody(value) {
    needsReferencesGetBody = value
  },
  get needsReferencesGetHandler() {
    return needsReferencesGetHandler
  },
  set needsReferencesGetHandler(value) {
    needsReferencesGetHandler = value
  },
  get normReferencesGetHandler() {
    return normReferencesGetHandler
  },
  set normReferencesGetHandler(value) {
    normReferencesGetHandler = value
  },
  okJson,
  pdfDownloadState,
  renderRequirementsSpecificationDetailClient,
  requirementDetailState,
  requirementRowNames,
  requirementsTableMock,
  searchParamsFromPath,
  selectRequirementRows,
  specificationApiPath,
  get specificationItemMutationHandler() {
    return specificationItemMutationHandler
  },
  set specificationItemMutationHandler(value) {
    specificationItemMutationHandler = value
  },
  get specificationItemResolutionHandler() {
    return specificationItemResolutionHandler
  },
  set specificationItemResolutionHandler(value) {
    specificationItemResolutionHandler = value
  },
  get specificationItemsGetHandler() {
    return specificationItemsGetHandler
  },
  set specificationItemsGetHandler(value) {
    specificationItemsGetHandler = value
  },
  get specificationItemsGetItems() {
    return specificationItemsGetItems
  },
  set specificationItemsGetItems(value) {
    specificationItemsGetItems = value
  },
  get specificationMetaGetHandler() {
    return specificationMetaGetHandler
  },
  set specificationMetaGetHandler(value) {
    specificationMetaGetHandler = value
  },
  get specificationMetaReturnsNotFound() {
    return specificationMetaReturnsNotFound
  },
  set specificationMetaReturnsNotFound(value) {
    specificationMetaReturnsNotFound = value
  },
  get specificationRequirementPackagesGetHandler() {
    return specificationRequirementPackagesGetHandler
  },
  set specificationRequirementPackagesGetHandler(value) {
    specificationRequirementPackagesGetHandler = value
  },
  waitForInitialAvailableRequirementsRefresh,
  useReducedMotion,
}

// biome-ignore lint/suspicious/noExportsInTest: Focused workflow suites share this inferred fixture contract.
export type SpecDetailWorkflowContext = typeof workflowContext

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

  registerGeneratedOutputTests(workflowContext)

  describe('available requirement pagination and selection filtering', () => {
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
          screen.getByRole('table', { name: 'available requirements' }),
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
        screen.getByText(
          'specification.requirementSelectionNoPublishedMatches',
        ),
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

      fireEvent.click(
        screen.getByRole('button', { name: 'load-more-available' }),
      )

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

      fireEvent.click(
        screen.getByRole('button', { name: 'load-more-available' }),
      )

      expect(
        await screen.findByText('common.requirementListRefreshed'),
      ).toHaveAttribute('role', 'status')
      await waitFor(() => {
        expect(availableRequirementsFetchUrls()).toHaveLength(
          requestCountBeforeLoadMore + 2,
        )
      })
      expect(
        screen.getByRole('table', { name: 'available requirements' }),
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

      fireEvent.click(
        screen.getByRole('button', { name: 'load-more-available' }),
      )
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
  })

  describe('metadata, layout, filters, and item status', () => {
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
        ).toEqual(
          expect.objectContaining({ name: 'Updated specification name' }),
        )
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
        screen.getByRole('link', {
          name: /specification\.backToSpecifications/,
        }),
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
        screen.queryByRole('button', {
          name: 'specification.editSpecification',
        }),
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
        screen.getByRole('link', {
          name: /specification\.backToSpecifications/,
        }),
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

      fireEvent.click(
        screen.getByRole('button', { name: 'common.moreActions' }),
      )

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
        expect(requirementsTableMock.mock.calls.length).toBeGreaterThanOrEqual(
          2,
        )
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
      expect(
        screen.queryByText('Requirement detail 202'),
      ).not.toBeInTheDocument()

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
        expect(latestItemsTableProps().rows[0]).toEqual(
          initialSpecificationItem,
        )
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
        screen.getByRole('table', { name: 'items requirements' }),
      ).toHaveTextContent('lib:31')
      await waitForInitialAvailableRequirementsRefresh()
    })

    it('submits an explicit needs-reference clear even for an unknown item', async () => {
      renderRequirementsSpecificationDetailClient()
      fireEvent.click(
        screen.getByRole('button', { name: 'clear-needs-ref-lib:missing' }),
      )

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
        screen.getByRole('table', { name: 'items requirements' }),
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
      expect(
        screen.queryByText('Requirement detail 101'),
      ).not.toBeInTheDocument()
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
        expect(latestRightTableProps?.visibleColumns).toEqual(
          storedRightColumns,
        )
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
        expect(requirementsTableMock.mock.calls.length).toBeGreaterThanOrEqual(
          2,
        )
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
        container.querySelector(
          '[data-specification-detail-list-panel="items"]',
        ),
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
        specificationItems: createSpecificationItemsPage([
          firstItem,
          secondItem,
        ]),
      })

      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['lib:31', 'lib:32'])
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
        screen.getByRole('table', { name: 'items requirements' }),
      ).toHaveTextContent('lib:31')
      expect(
        screen.getByRole('table', { name: 'items requirements' }),
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
        screen.getByRole('table', { name: 'items requirements' }),
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
        screen.getByRole('table', { name: 'items requirements' }),
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
        specificationItems: createSpecificationItemsPage([
          firstItem,
          secondItem,
        ]),
      })

      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['lib:31', 'lib:32'])
      })

      fireEvent.click(
        screen.getByRole('button', { name: 'sort-description-items' }),
      )
      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['lib:32', 'lib:31'])
      })

      fireEvent.click(
        screen.getByRole('button', { name: 'sort-description-items' }),
      )
      await waitFor(() => {
        expect(requirementRowNames('items')).toEqual(['lib:31', 'lib:32'])
      })
    })
  })

  describe('adding, importing, and creating requirement applications', () => {
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
      const textarea = screen.getByLabelText(
        'specification.addNeedsRefTextLabel',
      )
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

      fireEvent.change(
        screen.getByRole('textbox', { name: 'search-items-requirements' }),
        { target: { value: 'DOES-NOT-MATCH' } },
      )
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

      fireEvent.change(
        screen.getByRole('textbox', { name: 'search-items-requirements' }),
        { target: { value: initialAvailableRequirement.uniqueId } },
      )

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

      fireEvent.change(
        screen.getByRole('textbox', { name: 'search-items-requirements' }),
        { target: { value: 'IAM' } },
      )
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

      fireEvent.click(
        screen.getByRole('button', { name: 'load-more-available' }),
      )

      expect(
        await screen.findByText(
          'specification.loadAvailableRequirementsFailed',
        ),
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
        within(dialog).getByRole('textbox', {
          name: /requirement\.description/,
        }),
        { target: { value: 'Local requirement' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.save' }),
      )

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
          screen.getByRole('table', { name: 'items requirements' }),
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
        within(dialog).getByRole('textbox', {
          name: /requirement\.description/,
        }),
        { target: { value: 'Local requirement' } },
      )
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'common.save' }),
      )

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
        within(dialog).getByRole('textbox', {
          name: /requirement\.description/,
        }),
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
        within(dialog).getByRole('textbox', {
          name: /requirement\.description/,
        }),
      ).toHaveValue('Unsaved local requirement')
    })
  })

  registerNeedsReferenceTests(workflowContext)

  registerSelectionTests(workflowContext)

  registerPaginationTests(workflowContext)

  describe('refresh failures and focused regression coverage', () => {
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
        screen.getByRole('tab', {
          name: 'specification.availableRequirements',
        }),
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
        screen.getByRole('table', { name: 'items requirements' }),
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
        screen.getByRole('table', { name: 'items requirements' }),
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
      const managementReport = screen.getByRole('menuitem', {
        name: 'specification.downloadProfileReportPdf.specification.reportProfiles.management',
      })
      fireEvent.click(managementReport)

      expect(moreActions?.menuItems?.map(item => item.id)).toContain(
        'pdf-management',
      )
      expect(pdfDownloadState.download).toHaveBeenCalledWith(
        expect.objectContaining({
          restoreFocusTo: managementReport,
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
          screen.getByRole('table', { name: 'available requirements' }),
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
        screen.getByRole('table', { name: 'available requirements' }),
      ).toHaveTextContent('202')
    })
  })
})
