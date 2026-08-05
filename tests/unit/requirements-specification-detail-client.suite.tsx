import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsSpecificationDetailClient from '@/app/[locale]/specifications/[specificationId]/requirements-specification-detail-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
import type { RequirementPackageOption } from '@/lib/requirements/list-view'
import type {
  RequirementsSpecificationDetailInitialData,
  SpecificationListItem,
  SpecificationPreloadError,
} from '@/lib/specifications/preload-types'
import { registerAddingLocalTests } from './requirements-specification-detail-adding-local.suite'
import { registerAvailabilityTests } from './requirements-specification-detail-availability.suite'
import { registerGeneratedOutputTests } from './requirements-specification-detail-generated-output.suite'
import { registerMetadataTableTests } from './requirements-specification-detail-metadata-table.suite'
import { registerNeedsReferenceTests } from './requirements-specification-detail-needs-references.suite'
import { registerPaginationTests } from './requirements-specification-detail-pagination.suite'
import { registerResilienceTests } from './requirements-specification-detail-resilience.suite'
import { registerSelectionTests } from './requirements-specification-detail-selection.suite'

const intlState = vi.hoisted(() => ({
  locale: 'en',
  selectionActionLimitExceeded: vi.fn(),
  selectionStatus: vi.fn(),
}))
const navigationState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
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
    return props.open ? (
      <section aria-label="Import review">
        <button
          onClick={async () => {
            await props.onClose?.(false)
            props.returnFocusTarget?.focus()
          }}
          type="button"
        >
          cancel import review
        </button>
        <button
          onClick={async () => {
            await props.onClose?.(true)
            props.returnFocusTarget?.focus()
          }}
          type="button"
        >
          finish import review
        </button>
      </section>
    ) : null
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
const intersectionObserverCallbacks = new Map<
  Element,
  IntersectionObserverCallback
>()
const renderedRequirementUniqueIds = new Map<number, string>()
const renderedAvailableRequirementIds = new Set<number>()
vi.stubGlobal(
  'IntersectionObserver',
  class TestIntersectionObserver implements IntersectionObserver {
    readonly root = null
    readonly rootMargin = '0px'
    readonly scrollMargin = '0px'
    readonly thresholds = [0]

    constructor(private readonly callback: IntersectionObserverCallback) {}

    disconnect() {
      for (const [target, callback] of intersectionObserverCallbacks) {
        if (callback === this.callback) intersectionObserverCallbacks.delete(target)
      }
    }
    observe(target: Element) {
      intersectionObserverCallbacks.set(target, this.callback)
    }
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
    unobserve() {}
  },
)
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
  renderedRequirementUniqueIds.clear()
  renderedAvailableRequirementIds.clear()
  for (const item of initialData.specificationItems.items) {
    renderedRequirementUniqueIds.set(item.id, item.uniqueId)
  }
  for (const item of initialData.availableRequirements.rows) {
    renderedRequirementUniqueIds.set(item.id, item.uniqueId)
    renderedAvailableRequirementIds.add(item.id)
  }
  return render(
    <ConfirmModalProvider>
      <RequirementsSpecificationDetailClient
        initialData={initialData}
        specificationId={specificationId}
      />
    </ConfirmModalProvider>,
  )
}

type RequirementTableKind = 'available' | 'items'

function requirementPanel(tableKind: RequirementTableKind): HTMLElement {
  const panel = document.querySelector<HTMLElement>(
    `[data-specification-detail-list-panel="${tableKind}"]`,
  )
  if (!panel) throw new Error(`Missing ${tableKind} requirements panel`)
  return panel
}

function requirementsTable(tableKind: RequirementTableKind): HTMLElement {
  const table = requirementPanel(tableKind).querySelector<HTMLElement>(
    '[data-requirements-data-table="true"]',
  )
  if (!table) throw new Error(`Missing ${tableKind} requirements table`)
  return table
}

function requirementRow(
  tableKind: RequirementTableKind,
  uniqueId: string,
): HTMLElement {
  const row = Array.from(
    requirementsTable(tableKind).querySelectorAll<HTMLElement>('tbody tr'),
  ).find(candidate => within(candidate).queryByText(uniqueId))
  if (!row) throw new Error(`Missing ${tableKind} requirement row ${uniqueId}`)
  return row
}

function requirementRowCheckbox(
  tableKind: RequirementTableKind,
  uniqueId: string,
): HTMLInputElement {
  return within(requirementRow(tableKind, uniqueId)).getByRole('checkbox', {
    name: 'common.selectRow',
  }) as HTMLInputElement
}

function requirementSelectAllCheckbox(
  tableKind: RequirementTableKind,
): HTMLInputElement {
  return within(requirementPanel(tableKind)).getByRole('checkbox', {
    name: 'common.selectAll',
  }) as HTMLInputElement
}

function requirementHeaderControl(
  tableKind: RequirementTableKind,
  column: string,
): HTMLElement {
  const control = requirementPanel(tableKind).querySelector<HTMLElement>(
    `[data-requirement-header-control="${column}"]`,
  )
  if (!control) throw new Error(`Missing ${tableKind} ${column} header control`)
  return control
}

function requirementSortButton(
  tableKind: RequirementTableKind,
  column: string,
): HTMLButtonElement {
  return within(requirementHeaderControl(tableKind, column)).getByRole('button', {
    name: 'common.sortBy',
  }) as HTMLButtonElement
}

function requirementPackageButton(
  tableKind: RequirementTableKind,
  packageId: number,
): HTMLButtonElement {
  const panel = requirementPanel(tableKind)
  let button = panel.querySelector<HTMLButtonElement>(
    `[data-requirement-package="${packageId}"]`,
  )
  if (!button) {
    const filterBand = panel.querySelector<HTMLElement>(
      '[data-requirement-package-filter-layout="split"]',
    )
    const chooserTrigger = filterBand?.querySelector<HTMLButtonElement>(
      'button[aria-expanded]',
    )
    if (chooserTrigger?.getAttribute('aria-expanded') === 'false') {
      fireEvent.click(chooserTrigger)
    }
    button = document.querySelector<HTMLButtonElement>(
      `[data-requirement-package="${packageId}"]`,
    )
  }
  if (!button) {
    throw new Error(
      `Missing ${tableKind} requirement package ${packageId}; compact filter ${Boolean(
        panel.querySelector('[data-requirement-package-filter-layout="split"]'),
      )}`,
    )
  }
  return button
}

function queryRequirementPackageButton(
  tableKind: RequirementTableKind,
  packageId?: number,
): HTMLButtonElement | null {
  return requirementPanel(tableKind).querySelector<HTMLButtonElement>(
    packageId == null
      ? '[data-requirement-package]'
      : `[data-requirement-package="${packageId}"]`,
  )
}

function requirementColumnButton(
  tableKind: RequirementTableKind,
): HTMLButtonElement {
  return within(requirementPanel(tableKind)).getByRole('button', {
    name: 'common.columns',
  }) as HTMLButtonElement
}

function changeRequirementColumns(tableKind: RequirementTableKind) {
  toggleRequirementColumn(tableKind, 'description')
}

function toggleRequirementColumn(
  tableKind: RequirementTableKind,
  column: string,
) {
  fireEvent.click(requirementColumnButton(tableKind))
  const option = document.querySelector<HTMLInputElement>(
    `[data-column-picker-option="${column}"] input[type="checkbox"]`,
  )
  if (!option) throw new Error(`Missing ${tableKind} ${column} column option`)
  fireEvent.click(option)
  fireEvent.keyDown(document, { key: 'Escape' })
}

function openTableActionMenu(actionLabel: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: actionLabel }))
  return screen.getByRole('menu')
}

function requirementSearchInput(
  tableKind: RequirementTableKind,
): HTMLInputElement {
  const existing = screen.queryByRole('textbox', {
    name: 'requirement.uniqueId',
  }) as HTMLInputElement | null
  if (existing) return existing
  const header = requirementHeaderControl(tableKind, 'uniqueId')
  fireEvent.click(
    within(header).getByRole('button', { name: 'common.filterBy' }),
  )
  return screen.getByRole('textbox', {
    name: 'requirement.uniqueId',
  }) as HTMLInputElement
}

function toggleRequirementStatusFilter(tableKind: RequirementTableKind) {
  if (
    !requirementPanel(tableKind).querySelector(
      '[data-requirement-header-control="status"]',
    )
  ) {
    toggleRequirementColumn(tableKind, 'status')
  }
  let checkbox = screen
    .getAllByRole('checkbox')
    .find(candidate => !candidate.closest('[data-specification-detail-list-panel]'))
  if (!checkbox) {
    const header = requirementHeaderControl(tableKind, 'status')
    fireEvent.click(
      within(header).getByRole('button', { name: 'common.filterBy' }),
    )
    checkbox = screen
      .getAllByRole('checkbox')
      .find(
        candidate =>
          !candidate.closest('[data-specification-detail-list-panel]'),
      )
  }
  if (!checkbox) throw new Error(`Missing ${tableKind} status filter option`)
  fireEvent.click(checkbox)
}

function requirementNeedsReferenceSelect(
  tableKind: RequirementTableKind,
  uniqueId: string,
): HTMLSelectElement {
  return within(requirementRow(tableKind, uniqueId)).getByRole('combobox', {
    name: 'requirement.needsReference',
  }) as HTMLSelectElement
}

function requirementStatusSelect(uniqueId: string): HTMLSelectElement {
  return within(requirementRow('items', uniqueId)).getByRole('combobox', {
    name: 'requirement.specificationItemStatus',
  }) as HTMLSelectElement
}

function triggerRequirementLoadMore(tableKind: RequirementTableKind) {
  const panel = requirementPanel(tableKind)
  const entry = Array.from(intersectionObserverCallbacks).find(([target]) =>
    panel.contains(target),
  )
  if (!entry) throw new Error(`Missing ${tableKind} load-more sentinel`)
  const [target, callback] = entry
  act(() => {
    callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  })
}

function itemsStatus(): HTMLElement {
  const statuses = within(requirementPanel('items')).getAllByRole('status')
  return (
    statuses.find(status =>
      /selectionStatus|selectionDisappeared|requirementsAdded|selectionActionLimitExceeded/.test(
        status.textContent ?? '',
      ),
    ) ?? statuses[0]
  ) as HTMLElement
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

function selectRequirementRows(ids: number[]) {
  for (const id of ids) {
    const uniqueId = renderedRequirementUniqueIds.get(id)
    if (!uniqueId) throw new Error(`Missing known requirement row ${id}`)
    fireEvent.click(
      requirementRowCheckbox(
        renderedAvailableRequirementIds.has(id) ? 'available' : 'items',
        uniqueId,
      ),
    )
  }
}

function requirementRowNames(
  tableKind: 'available' | 'items',
): Array<string | null> {
  return Array.from(
    requirementsTable(tableKind).querySelectorAll<HTMLElement>('tbody tr'),
  )
    .filter(row => !row.querySelector('[data-expanded-detail="true"]'))
    .map(row =>
      within(row)
        .getAllByRole('cell')
        .map(cell => cell.textContent?.trim())
        .find(text => Boolean(text)) ?? null,
    )
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
  get localRequirementPostOk() {
    return localRequirementPostOk
  },
  set localRequirementPostOk(value) {
    localRequirementPostOk = value
  },
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
  requirementRowNames,
  requirementColumnButton,
  changeRequirementColumns,
  requirementHeaderControl,
  requirementNeedsReferenceSelect,
  requirementPackageButton,
  requirementPanel,
  requirementRow,
  requirementRowCheckbox,
  requirementSearchInput,
  requirementSelectAllCheckbox,
  requirementSortButton,
  requirementStatusSelect,
  requirementsTable,
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
  itemsStatus,
  openTableActionMenu,
  queryRequirementPackageButton,
  toggleRequirementColumn,
  toggleRequirementStatusFilter,
  triggerRequirementLoadMore,
  useReducedMotion,
}

// biome-ignore lint/suspicious/noExportsInTest: Focused workflow suites share this inferred fixture contract.
export type SpecDetailWorkflowContext = typeof workflowContext

describe('RequirementsSpecificationDetailClient', () => {
  beforeEach(() => {
    intersectionObserverCallbacks.clear()
    vi.clearAllMocks()
    intlState.locale = 'en'
    intlState.selectionActionLimitExceeded.mockReset()
    intlState.selectionStatus.mockReset()
    vi.mocked(useReducedMotion).mockReturnValue(false)
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

  registerAvailabilityTests(workflowContext)

  registerMetadataTableTests(workflowContext)

  registerAddingLocalTests(workflowContext)

  registerNeedsReferenceTests(workflowContext)

  registerSelectionTests(workflowContext)

  registerPaginationTests(workflowContext)

  registerResilienceTests(workflowContext)
})
