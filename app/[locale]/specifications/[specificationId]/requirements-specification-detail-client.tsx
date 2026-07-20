'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ChevronRight,
  Download,
  Ellipsis,
  Link2,
  Link2Off,
  Pencil,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import RequirementDetailClient from '@/app/[locale]/requirements/[id]/requirement-detail-client'
import SpecificationRequirementSelectionPanel from '@/app/[locale]/specifications/[specificationId]/specification-requirement-selection-panel'
import SpecificationRfiListPanel from '@/app/[locale]/specifications/[specificationId]/specification-rfi-list-panel'
import SpecificationFormModal from '@/app/[locale]/specifications/specification-form-modal'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import DirtyStateButton from '@/components/DirtyStateButton'
import FieldHelpButton from '@/components/FieldHelpButton'
import { useGeneratedOutputDownload } from '@/components/generated-output/useGeneratedOutputDownload'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import LazyAiRequirementGenerator from '@/components/LazyAiRequirementGenerator'
import LazyRequirementsImportDialog, {
  type InitialRequirementsImport,
} from '@/components/LazyRequirementsImportDialog'
import RequirementsTable, {
  type FloatingActionItem,
  type FloatingActionMenuItem,
  FloatingActionPill,
} from '@/components/RequirementsTable'
import SpecificationLocalRequirementDetailClient from '@/components/SpecificationLocalRequirementDetailClient'
import SpecificationLocalRequirementForm, {
  type SpecificationLocalRequirementSubmitPayload,
} from '@/components/SpecificationLocalRequirementForm'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useDiscardChangesConfirmation } from '@/hooks/useDiscardChangesConfirmation'
import { useModalFocus } from '@/hooks/useModalFocus'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { createDirtySnapshot } from '@/lib/forms/dirty-state'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
import {
  canExportProcurementCsvForLifecycleStatus,
  getSpecificationReportProfileForLifecycleStatus,
  type SpecificationCsvProfile,
  type SpecificationReportProfile,
} from '@/lib/reports/specification-profiles'
import {
  type AreaOption,
  buildRequirementListParams,
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
  isRequirementColumnId,
  type RequirementColumnId,
  type RequirementPackageOption,
  type RequirementRow,
  type RequirementSortState,
} from '@/lib/requirements/list-view'
import type {
  AvailableRequirementsData,
  NormReferenceOption,
  RequirementsSpecificationDetailInitialData,
  SpecificationItemsPageData,
  SpecificationListItem,
  SpecificationMeta,
  SpecificationNeedsReference,
  SpecificationTaxonomyItem,
} from '@/lib/specifications/preload-types'
import { SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT } from '@/lib/specifications/selection-action-limit'

const REQUIREMENT_SPECIFICATION_DETAIL_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementsSpecificationDetail.requirements.body',
      headingKey: 'requirementsSpecificationDetail.requirements.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementsSpecificationDetail.needsReference.body',
      headingKey: 'requirementsSpecificationDetail.needsReference.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementsSpecificationDetail.specificationItemStatus.body',
      headingKey:
        'requirementsSpecificationDetail.specificationItemStatus.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementsSpecificationDetail.export.body',
      headingKey: 'requirementsSpecificationDetail.export.heading',
    },
  ],
  titleKey: 'requirementsSpecificationDetail.title',
}

const AVAILABLE_REQUIREMENTS_PAGE_SIZE = 200
const BULK_DEVIATION_CONCURRENCY = 4
const SPECIFICATION_ITEM_RESOLUTION_CHUNK_SIZE = 50
const SPECIFICATION_ITEMS_PAGE_SIZE = 50
const SPECIFICATION_NEEDS_REFERENCE_USAGE_PAGE_SIZE = 100

interface ResolvedSpecificationItem {
  itemRef: string
  kind: 'library' | 'specificationLocal'
  needsReference: string | null
  uniqueId: string
}

const LEFT_VISIBLE_COLS_KEY =
  'requirement-specifications.visibleColumns.left.v1'
const RIGHT_VISIBLE_COLS_KEY =
  'requirement-specifications.visibleColumns.right.v1'
const DEFAULT_LEFT_COLS: RequirementColumnId[] = [
  'uniqueId',
  'description',
  'area',
  'needsReference',
]
const DEFAULT_RIGHT_COLS: RequirementColumnId[] = [
  'uniqueId',
  'description',
  'area',
]
type SpecificationDetailLeftTab = 'items' | 'needs-references' | 'rfi'

function groupedFloatingActionMenuItems(
  groups: Array<{ id: string; items: FloatingActionMenuItem[] }>,
): FloatingActionMenuItem[] {
  const menuItems: FloatingActionMenuItem[] = []

  for (const group of groups) {
    if (group.items.length === 0) continue
    if (menuItems.length > 0) {
      menuItems.push({ id: `separator-${group.id}`, kind: 'separator' })
    }
    menuItems.push(...group.items)
  }

  return menuItems
}

interface NeedsReferenceFormState {
  description: string
  id: number | null
  text: string
}

interface BulkNeedsReferenceModalProps {
  affectedRequirementIds: string[]
  error: string | null
  loading: boolean
  needsReferences: SpecificationNeedsReference[]
  onClose: () => void
  onSubmit: (needsReferenceId: number) => void
  open: boolean
}

function BulkNeedsReferenceModal({
  affectedRequirementIds,
  error,
  loading,
  needsReferences,
  onClose,
  onSubmit,
  open,
}: BulkNeedsReferenceModalProps) {
  const t = useTranslations('specification')
  const tc = useTranslations('common')
  const shouldReduceMotion = useReducedMotion()
  const modalRef = useRef<HTMLDivElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  const [needsReferenceId, setNeedsReferenceId] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    if (!open) return
    setNeedsReferenceId('')
    setShowHelp(false)
  }, [open])

  const { handleKeyDown } = useModalFocus({
    closeDisabled: loading,
    initialFocusRef: selectRef,
    modalRef,
    onClose,
    open,
  })

  if (typeof window === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          key="bulk-needs-reference-backdrop"
          {...fadeMotion(shouldReduceMotion)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <motion.div
            aria-labelledby="bulk-needs-reference-title"
            aria-modal="true"
            className="relative z-50 max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl dark:bg-secondary-900"
            {...devMarker({
              context: 'requirements specification detail',
              name: 'dialog',
              priority: 420,
              value: 'assign needs reference to selected items',
            })}
            onKeyDown={handleKeyDown}
            ref={modalRef}
            role="dialog"
            {...dialogPanelMotion(shouldReduceMotion)}
          >
            <div className="space-y-4 p-5">
              <h2
                className="text-base font-semibold text-secondary-900 dark:text-secondary-100"
                id="bulk-needs-reference-title"
              >
                {t('assignNeedsReferenceTitle')}
              </h2>
              <div>
                <p className="text-sm font-medium text-secondary-900 dark:text-secondary-100">
                  {t('affectedRequirementIds')}
                </p>
                <ul className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 font-mono text-xs text-secondary-700 dark:border-secondary-700 dark:bg-secondary-800 dark:text-secondary-200">
                  {affectedRequirementIds.map(requirementId => (
                    <li key={requirementId}>{requirementId}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <label
                    className="text-sm font-medium text-secondary-900 dark:text-secondary-100"
                    htmlFor="bulk-needs-reference"
                  >
                    {t('needsReference')}
                  </label>
                  <FieldHelpButton
                    controls="bulk-needs-reference-help"
                    expanded={showHelp}
                    label={`${tc('help')}: ${t('needsReference')}`}
                    onClick={() => setShowHelp(value => !value)}
                  />
                </div>
                <AnimatedHelpPanel
                  id="bulk-needs-reference-help"
                  isOpen={showHelp}
                >
                  {t('assignNeedsReferenceHelp')}
                </AnimatedHelpPanel>
                <select
                  className="min-h-11 w-full rounded-lg border border-secondary-300 bg-white px-3 py-2 text-sm text-secondary-800 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-600 dark:bg-secondary-900 dark:text-secondary-100"
                  disabled={loading}
                  id="bulk-needs-reference"
                  onChange={event => setNeedsReferenceId(event.target.value)}
                  ref={selectRef}
                  value={needsReferenceId}
                >
                  <option value="">{t('selectNeedsReference')}</option>
                  {needsReferences.map(reference => (
                    <option key={reference.id} value={reference.id}>
                      {reference.text}
                    </option>
                  ))}
                </select>
              </div>
              {error ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  className="btn-secondary px-4 py-2 text-sm"
                  disabled={loading}
                  onClick={onClose}
                  type="button"
                >
                  {tc('cancel')}
                </button>
                <button
                  className="btn-primary px-4 py-2 text-sm"
                  disabled={needsReferenceId === '' || loading}
                  onClick={() => onSubmit(Number(needsReferenceId))}
                  type="button"
                >
                  {loading ? tc('saving') : tc('confirm')}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

const needsReferenceFormSignature = (form: NeedsReferenceFormState) =>
  createDirtySnapshot({
    description: form.description.trim() || null,
    text: form.text.trim(),
  })

interface RequirementSelectionFilterToggleProps {
  checked: boolean
  disabled: boolean
  label: string
  onToggle: (checked: boolean) => void
  title?: string
}

const RequirementSelectionFilterToggle = memo(
  function RequirementSelectionFilterToggle({
    checked,
    disabled,
    label,
    onToggle,
    title,
  }: RequirementSelectionFilterToggleProps) {
    return (
      <button
        aria-checked={checked}
        aria-label={label}
        className={`relative inline-flex min-h-11 min-w-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:outline-none ${
          disabled
            ? 'cursor-not-allowed border-secondary-200 text-secondary-400 opacity-70 dark:border-secondary-800 dark:text-secondary-500'
            : 'cursor-pointer border-secondary-300 text-secondary-700 hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800'
        }`}
        disabled={disabled}
        onClick={() => onToggle(!checked)}
        role="switch"
        title={title}
        type="button"
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full ${
            checked
              ? 'bg-primary-700 dark:bg-primary-500'
              : 'bg-secondary-300 dark:bg-secondary-700'
          } ${disabled ? 'opacity-60' : ''}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow ${
              checked ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>
    )
  },
)

function readStoredCols(
  key: string,
  fallback: RequirementColumnId[],
): RequirementColumnId[] {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every(
        (column): column is RequirementColumnId =>
          typeof column === 'string' && isRequirementColumnId(column),
      )
    ) {
      return parsed
    }
  } catch {
    // ignore
  }
  return fallback
}

async function readJsonOrThrow<T>(response: Response, fallbackMessage: string) {
  if (!response.ok) {
    const details = await readResponseMessage(response)
    throw new Error(
      details ? `${fallbackMessage}: ${details}` : fallbackMessage,
    )
  }

  return (await response.json()) as T
}

async function resolveSpecificationItemRefsInChunks(
  specificationId: number,
  itemRefs: string[],
  fallbackMessage: string,
): Promise<ResolvedSpecificationItem[]> {
  const resolvedItems: ResolvedSpecificationItem[] = []
  for (
    let offset = 0;
    offset < itemRefs.length;
    offset += SPECIFICATION_ITEM_RESOLUTION_CHUNK_SIZE
  ) {
    const params = new URLSearchParams()
    for (const itemRef of itemRefs.slice(
      offset,
      offset + SPECIFICATION_ITEM_RESOLUTION_CHUNK_SIZE,
    )) {
      params.append('refs', itemRef)
    }
    const response = await apiFetch(
      `/api/specification-item-resolutions/${specificationId}?${params}`,
    )
    const data = await readJsonOrThrow<{
      items?: ResolvedSpecificationItem[]
    }>(response, fallbackMessage)
    resolvedItems.push(...(data.items ?? []))
  }
  return resolvedItems
}

async function allSettledInBatches<T, TResult>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  const results: PromiseSettledResult<TResult>[] = []
  for (let offset = 0; offset < items.length; offset += concurrency) {
    results.push(
      ...(await Promise.allSettled(
        items.slice(offset, offset + concurrency).map(task),
      )),
    )
  }
  return results
}

function deduplicateSpecificationItems(items: SpecificationListItem[]) {
  const seen = new Set<string>()
  return items.filter(item => {
    const itemRef = item.itemRef
    if (!itemRef || seen.has(itemRef)) return false
    seen.add(itemRef)
    return true
  })
}

function buildNormReferenceOptionsPath(statuses: number[] | undefined) {
  const params = new URLSearchParams()
  params.set('linked', 'true')
  for (const status of statuses ?? []) {
    params.append('statuses', String(status))
  }
  return `/api/norm-references?${params}`
}

export default function KravunderlagDetailClient({
  initialData,
  specificationId,
}: {
  initialData: RequirementsSpecificationDetailInitialData
  specificationId: number
}) {
  useHelpContent(REQUIREMENT_SPECIFICATION_DETAIL_HELP)
  const t = useTranslations('specification')
  const tc = useTranslations('common')
  const td = useTranslations('deviation')
  const locale = useLocale()
  const { confirm } = useConfirmModal()
  const confirmDiscardChanges = useDiscardChangesConfirmation()
  const searchParams = useSearchParams()
  const shouldReduceMotion = useReducedMotion()
  const preFilterAreaId = searchParams.get('areaId')
    ? Number(searchParams.get('areaId'))
    : null
  const initialLeftTab: SpecificationDetailLeftTab =
    searchParams.get('leftTab') === 'needs-references'
      ? 'needs-references'
      : searchParams.get('leftTab') === 'rfi'
        ? 'rfi'
        : 'items'

  const [spec, setSpec] = useState<SpecificationMeta | null>(initialData.spec)
  const [specificationItems, setSpecificationItems] = useState<
    SpecificationListItem[]
  >(initialData.specificationItems.items)
  const [specificationItemsHasMore, setSpecificationItemsHasMore] = useState(
    initialData.specificationItems.pagination.hasMore,
  )
  const [specificationItemsNextCursor, setSpecificationItemsNextCursor] =
    useState(initialData.specificationItems.pagination.nextCursor)
  const [specificationItemsLoading, setSpecificationItemsLoading] =
    useState(false)
  const [specificationItemsLoadingMore, setSpecificationItemsLoadingMore] =
    useState(false)
  const [specificationItemsError, setSpecificationItemsError] = useState<
    string | null
  >(null)
  const [
    specificationItemsContinuationError,
    setSpecificationItemsContinuationError,
  ] = useState<'continuation' | 'recovery' | null>(null)
  const [specificationItemsAnnouncement, setSpecificationItemsAnnouncement] =
    useState<string | null>(null)
  const [availableRows, setAvailableRows] = useState<RequirementRow[]>(
    initialData.availableRequirements.rows,
  )
  const [areas] = useState<AreaOption[]>(initialData.areas)
  const [requirementPackages] = useState<RequirementPackageOption[]>(
    initialData.requirementPackages,
  )
  const [specificationGovernanceObjectTypes] = useState<
    SpecificationTaxonomyItem[]
  >(initialData.specificationGovernanceObjectTypes)
  const [specificationImplementationTypes] = useState<
    SpecificationTaxonomyItem[]
  >(initialData.specificationImplementationTypes)
  const [specificationLifecycleStatuses] = useState<
    SpecificationTaxonomyItem[]
  >(initialData.specificationLifecycleStatuses)
  const [specificationItemStatuses] = useState(
    initialData.specificationItemStatuses,
  )
  const [showEditSpecificationForm, setShowEditSpecificationForm] =
    useState(false)
  const [showBulkDeviationModal, setShowBulkDeviationModal] = useState(false)
  const [rightPanelTab, setRightPanelTab] = useState<'available' | 'questions'>(
    'available',
  )
  const [bulkDeviationSaving, setBulkDeviationSaving] = useState(false)
  const [bulkDeviationError, setBulkDeviationError] = useState<string | null>(
    null,
  )
  const [bulkDeviationItems, setBulkDeviationItems] = useState<
    SpecificationListItem[]
  >([])

  // Left panel state
  const [leftSelectedItemRefs, setLeftSelectedItemRefs] = useState<Set<string>>(
    new Set(),
  )
  const [leftExpandedItemRef, setLeftExpandedItemRef] = useState<string | null>(
    null,
  )
  const [leftFilters, setLeftFilters] = useState<FilterValues>(
    preFilterAreaId ? { areaIds: [preFilterAreaId] } : {},
  )
  const [leftSort, setLeftSort] = useState<RequirementSortState>(
    DEFAULT_REQUIREMENT_SORT,
  )
  const [leftTab, setLeftTab] =
    useState<SpecificationDetailLeftTab>(initialLeftTab)
  const [leftVisibleCols, setLeftVisibleCols] =
    useState<RequirementColumnId[]>(DEFAULT_LEFT_COLS)

  // Right panel state
  const [rightSelectedIds, setRightSelectedIds] = useState<Set<number>>(
    new Set(),
  )
  const [rightExpandedId, setRightExpandedId] = useState<number | null>(null)
  const [rightFilters, setRightFilters] = useState<FilterValues>({})
  const [applyRequirementSelectionFilter, setApplyRequirementSelectionFilter] =
    useState(false)
  const [
    availableRequirementsSelectionFilter,
    setAvailableRequirementsSelectionFilter,
  ] = useState(initialData.availableRequirements.selectionFilter)
  const [rightSort, setRightSort] = useState<RequirementSortState>(
    DEFAULT_REQUIREMENT_SORT,
  )
  const [rightHasMore, setRightHasMore] = useState(
    initialData.availableRequirements.hasMore,
  )
  const [rightNextCursor, setRightNextCursor] = useState<string | null>(
    initialData.availableRequirements.nextCursor,
  )
  const [rightLoadingMore, setRightLoadingMore] = useState(false)
  const [loadMoreWarning, setLoadMoreWarning] = useState<string | null>(null)
  const [rightVisibleCols, setRightVisibleCols] =
    useState<RequirementColumnId[]>(DEFAULT_RIGHT_COLS)
  const [columnPreferencesLoaded, setColumnPreferencesLoaded] = useState(false)

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCreateLocalRequirementModal, setShowCreateLocalRequirementModal] =
    useState(false)
  const [
    showImportLocalRequirementsModal,
    setShowImportLocalRequirementsModal,
  ] = useState(false)
  const [showAiLocalRequirementsModal, setShowAiLocalRequirementsModal] =
    useState(false)
  const aiReturnFocusTargetRef = useRef<HTMLElement | null>(null)
  const importReturnFocusTargetRef = useRef<HTMLElement | null>(null)
  const [
    aiLocalRequirementsInitialImport,
    setAiLocalRequirementsInitialImport,
  ] = useState<InitialRequirementsImport | null>(null)
  const [createLocalRequirementFormDirty, setCreateLocalRequirementFormDirty] =
    useState(false)
  const [pendingAddIds, setPendingAddIds] = useState<number[]>([])
  const [pendingAddRequirementUniqueIds, setPendingAddRequirementUniqueIds] =
    useState<string[]>([])
  const [addNeedsRefMode, setAddNeedsRefMode] = useState<
    'none' | 'existing' | 'new'
  >('none')
  const [addNeedsRefId, setAddNeedsRefId] = useState<number | ''>('')
  const [addNeedsRefText, setAddNeedsRefText] = useState('')
  const [addNeedsRefDescription, setAddNeedsRefDescription] = useState('')
  const [availableNeedsRefs, setAvailableNeedsRefs] = useState<
    SpecificationNeedsReference[]
  >(initialData.availableNeedsRefs)
  const [expandedNeedsReferenceId, setExpandedNeedsReferenceId] = useState<
    number | null
  >(null)
  const [needsReferenceUsageById, setNeedsReferenceUsageById] = useState(
    new Map<number, SpecificationListItem[]>(),
  )
  const [needsReferenceUsageLoading, setNeedsReferenceUsageLoading] =
    useState(false)
  const [needsReferenceUsageError, setNeedsReferenceUsageError] = useState<
    string | null
  >(null)
  const [needsReferenceForm, setNeedsReferenceForm] =
    useState<NeedsReferenceFormState | null>(null)
  const [needsReferenceFormBaseline, setNeedsReferenceFormBaseline] = useState(
    () => needsReferenceFormSignature({ description: '', id: null, text: '' }),
  )
  const [needsReferenceSaving, setNeedsReferenceSaving] = useState(false)
  const [needsReferenceError, setNeedsReferenceError] = useState<string | null>(
    null,
  )
  const [showBulkNeedsReferenceModal, setShowBulkNeedsReferenceModal] =
    useState(false)
  const [bulkNeedsReferenceItems, setBulkNeedsReferenceItems] = useState<
    SpecificationListItem[]
  >([])
  const [bulkActionSaving, setBulkActionSaving] = useState(false)
  const [bulkActionResolving, setBulkActionResolving] = useState(false)
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null)
  const [bulkNeedsReferenceError, setBulkNeedsReferenceError] = useState<
    string | null
  >(null)
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [addModalLoading, setAddModalLoading] = useState(false)
  const [addModalError, setAddModalError] = useState<string | null>(null)
  const generatedOutputDownload = useGeneratedOutputDownload()
  const specificationPathId = String(specificationId)
  const selectedItemsByRef = useRef(
    new Map<string, SpecificationListItem>(
      initialData.specificationItems.items.flatMap(item =>
        item.itemRef ? [[item.itemRef, item] as const] : [],
      ),
    ),
  )
  const specificationItemsRequestIdRef = useRef(0)
  const specificationItemsAbortRef = useRef<AbortController | null>(null)
  const specificationItemsQueryKeyRef = useRef<string | null>(null)
  const specificationItemsRetryRef = useRef<HTMLButtonElement>(null)
  const needsReferenceUsageRequestIdRef = useRef(0)

  const availableRequirementsParams = useMemo(() => {
    const params = buildRequirementListParams({
      filters: rightFilters,
      limit: AVAILABLE_REQUIREMENTS_PAGE_SIZE,
      locale,
      sort: rightSort,
    })
    if (applyRequirementSelectionFilter) {
      params.set('applyRequirementSelectionFilter', 'true')
    }
    return params.toString()
  }, [applyRequirementSelectionFilter, locale, rightFilters, rightSort])
  const availableRequirementsKeyRef = useRef(availableRequirementsParams)

  const specificationItemsParams = useMemo(
    () =>
      buildRequirementListParams({
        filters: leftFilters,
        limit: SPECIFICATION_ITEMS_PAGE_SIZE,
        locale,
        sort: leftSort,
      }).toString(),
    [leftFilters, leftSort, locale],
  )

  const specResource = useAsyncResource<SpecificationMeta | null>({
    fetcher: async signal => {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}`,
        {
          signal,
        },
      )
      if (response.status === 404) return null
      return readJsonOrThrow<SpecificationMeta>(
        response,
        t('loadSpecificationFailed'),
      )
    },
    getErrorMessage: error =>
      error instanceof Error ? error.message : t('loadSpecificationFailed'),
    initialData: initialData.spec,
    key: `specification:${specificationId}`,
    loadOnMount: false,
  })

  const availableRequirementsResource =
    useAsyncResource<AvailableRequirementsData>({
      fetcher: async signal => {
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationId}/available-requirements?${availableRequirementsParams}`,
          { signal },
        )
        const data = await readJsonOrThrow<{
          pagination?: { hasMore?: boolean; nextCursor?: string | null }
          requirements?: RequirementRow[]
          selectionFilter?: AvailableRequirementsData['selectionFilter']
        }>(response, t('loadAvailableRequirementsFailed'))
        return {
          hasMore: data.pagination?.hasMore ?? false,
          nextCursor: data.pagination?.nextCursor ?? null,
          rows: data.requirements ?? [],
          selectionFilter: data.selectionFilter,
        }
      },
      getErrorMessage: error =>
        error instanceof Error
          ? error.message
          : t('loadAvailableRequirementsFailed'),
      initialData: initialData.availableRequirements,
      key: `available-requirements:${availableRequirementsParams}`,
      loadOnMount: true,
    })

  const needsReferencesResource = useAsyncResource<
    SpecificationNeedsReference[]
  >({
    fetcher: async signal => {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/needs-references`,
        { signal },
      )
      const data = await readJsonOrThrow<{
        needsReferences?: SpecificationNeedsReference[]
      }>(response, t('failedToLoadNeedsReferences'))
      return data.needsReferences ?? []
    },
    getErrorMessage: error =>
      error instanceof Error ? error.message : t('failedToLoadNeedsReferences'),
    initialData: initialData.availableNeedsRefs,
    key: `specification-needs-references:${specificationId}`,
    loadOnMount: false,
  })

  const leftNormReferenceStatusesKey = (leftFilters.statuses ?? []).join(',')
  const leftNormReferenceResource = useAsyncResource<NormReferenceOption[]>({
    fetcher: async signal => {
      const response = await apiFetch(
        buildNormReferenceOptionsPath(leftFilters.statuses),
        { signal },
      )
      const data = await readJsonOrThrow<{
        normReferences?: NormReferenceOption[]
      }>(response, t('loadNormReferencesFailed'))
      return data.normReferences ?? []
    },
    getErrorMessage: error =>
      error instanceof Error ? error.message : t('loadNormReferencesFailed'),
    initialData: initialData.leftNormReferenceOptions,
    key: `left-norm-references:${leftNormReferenceStatusesKey}`,
    loadOnMount: false,
  })

  const rightNormReferenceResource = useAsyncResource<NormReferenceOption[]>({
    fetcher: async signal => {
      const response = await apiFetch(buildNormReferenceOptionsPath([3]), {
        signal,
      })
      const data = await readJsonOrThrow<{
        normReferences?: NormReferenceOption[]
      }>(response, t('loadNormReferencesFailed'))
      return data.normReferences ?? []
    },
    getErrorMessage: error =>
      error instanceof Error ? error.message : t('loadNormReferencesFailed'),
    initialData: initialData.rightNormReferenceOptions,
    key: 'right-norm-references:published',
    loadOnMount: false,
  })

  const loading = specResource.loading
  const loadWarning =
    loadMoreWarning ??
    specResource.refreshError ??
    availableRequirementsResource.refreshError ??
    needsReferencesResource.refreshError ??
    leftNormReferenceResource.refreshError ??
    rightNormReferenceResource.refreshError ??
    (initialData.errors.length > 0 ? t('partialDataLoadWarning') : null)

  const leftNormReferenceOptions = leftNormReferenceResource.data ?? []
  const rightNormReferenceOptions = rightNormReferenceResource.data ?? []
  const selectionFilter = availableRequirementsSelectionFilter
  const hasRequirementSelectionAnswers =
    selectionFilter?.hasCurrentAnswers === true
  const canApplyRequirementSelectionFilter =
    selectionFilter?.hasRequirementSelection === true
  const isRequirementSelectionToggleDisabled =
    hasRequirementSelectionAnswers && !canApplyRequirementSelectionFilter
  const isRequirementSelectionToggleChecked =
    applyRequirementSelectionFilter && canApplyRequirementSelectionFilter
  const shouldShowRequirementSelectionEmptyWarning =
    selectionFilter?.applied === true &&
    (selectionFilter?.requirementIds.length ?? 0) === 0

  useEffect(() => {
    setSpec(specResource.data ?? null)
  }, [specResource.data])

  useEffect(() => {
    if (
      availableRequirementsResource.data &&
      !availableRequirementsResource.refreshing &&
      !availableRequirementsResource.refreshError
    ) {
      setAvailableRows(availableRequirementsResource.data.rows)
      setRightHasMore(availableRequirementsResource.data.hasMore)
      setRightNextCursor(availableRequirementsResource.data.nextCursor)
      setAvailableRequirementsSelectionFilter(
        availableRequirementsResource.data.selectionFilter,
      )
    }
  }, [
    availableRequirementsResource.data,
    availableRequirementsResource.refreshError,
    availableRequirementsResource.refreshing,
  ])

  useEffect(() => {
    if (
      applyRequirementSelectionFilter &&
      selectionFilter &&
      !selectionFilter.hasRequirementSelection
    ) {
      setApplyRequirementSelectionFilter(false)
    }
  }, [applyRequirementSelectionFilter, selectionFilter])

  useEffect(() => {
    if (needsReferencesResource.data) {
      setAvailableNeedsRefs(needsReferencesResource.data)
    }
  }, [needsReferencesResource.data])

  useEffect(() => {
    availableRequirementsKeyRef.current = availableRequirementsParams
  }, [availableRequirementsParams])

  const loadFirstSpecificationItemsPage = useCallback(
    async ({
      recoveringInvalidCursor = false,
      restoreRetryFocusOnFailure = false,
    }: {
      recoveringInvalidCursor?: boolean
      restoreRetryFocusOnFailure?: boolean
    } = {}) => {
      const requestId = ++specificationItemsRequestIdRef.current
      specificationItemsAbortRef.current?.abort()
      const controller = new AbortController()
      specificationItemsAbortRef.current = controller
      setSpecificationItemsLoading(true)
      setSpecificationItemsLoadingMore(false)
      setSpecificationItemsError(null)
      setSpecificationItemsContinuationError(null)
      setSpecificationItemsAnnouncement(null)
      setSpecificationItemsHasMore(false)
      setSpecificationItemsNextCursor(null)

      try {
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationId}/items?${specificationItemsParams}`,
          { signal: controller.signal },
        )
        const page = await readJsonOrThrow<SpecificationItemsPageData>(
          response,
          t('loadSpecificationItemsFailed'),
        )
        if (
          controller.signal.aborted ||
          requestId !== specificationItemsRequestIdRef.current
        ) {
          return false
        }

        const items = deduplicateSpecificationItems(page.items ?? [])
        setSpecificationItems(items)
        setSpecificationItemsHasMore(page.pagination?.hasMore ?? false)
        setSpecificationItemsNextCursor(page.pagination?.nextCursor ?? null)
        setSpecificationItemsError(null)
        setSpecificationItemsContinuationError(null)
        if (recoveringInvalidCursor) {
          setSpecificationItemsAnnouncement(t('paginationRestarted'))
        }
        return true
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestId !== specificationItemsRequestIdRef.current
        ) {
          return false
        }
        const message =
          error instanceof Error
            ? error.message
            : t('loadSpecificationItemsFailed')
        if (recoveringInvalidCursor) {
          setSpecificationItemsContinuationError('recovery')
        } else {
          setSpecificationItemsError(message)
        }
        if (restoreRetryFocusOnFailure) {
          requestAnimationFrame(() =>
            specificationItemsRetryRef.current?.focus(),
          )
        }
        return false
      } finally {
        if (requestId === specificationItemsRequestIdRef.current) {
          setSpecificationItemsLoading(false)
          if (specificationItemsAbortRef.current === controller) {
            specificationItemsAbortRef.current = null
          }
        }
      }
    },
    [specificationId, specificationItemsParams, t],
  )
  const loadFirstSpecificationItemsPageRef = useRef(
    loadFirstSpecificationItemsPage,
  )

  useEffect(() => {
    loadFirstSpecificationItemsPageRef.current = loadFirstSpecificationItemsPage
  }, [loadFirstSpecificationItemsPage])

  useEffect(() => {
    const previousQueryKey = specificationItemsQueryKeyRef.current
    specificationItemsQueryKeyRef.current = specificationItemsParams

    if (previousQueryKey === null) {
      const initialQueryKey = buildRequirementListParams({
        filters: {},
        limit: SPECIFICATION_ITEMS_PAGE_SIZE,
        locale,
        sort: DEFAULT_REQUIREMENT_SORT,
      }).toString()
      if (specificationItemsParams === initialQueryKey) return
    }

    void loadFirstSpecificationItemsPageRef.current()
  }, [locale, specificationItemsParams])

  useEffect(
    () => () => {
      specificationItemsRequestIdRef.current += 1
      specificationItemsAbortRef.current?.abort()
    },
    [],
  )

  useEffect(() => {
    if (
      leftExpandedItemRef &&
      !specificationItems.some(item => item.itemRef === leftExpandedItemRef)
    ) {
      setLeftExpandedItemRef(null)
    }
  }, [leftExpandedItemRef, specificationItems])

  const loadMoreSpecificationItems = useCallback(async () => {
    if (
      specificationItemsLoading ||
      specificationItemsLoadingMore ||
      !specificationItemsHasMore ||
      !specificationItemsNextCursor
    ) {
      return
    }

    const requestId = ++specificationItemsRequestIdRef.current
    specificationItemsAbortRef.current?.abort()
    const controller = new AbortController()
    specificationItemsAbortRef.current = controller
    setSpecificationItemsLoadingMore(true)
    setSpecificationItemsContinuationError(null)
    setSpecificationItemsAnnouncement(null)

    const params = new URLSearchParams(specificationItemsParams)
    params.set('cursor', specificationItemsNextCursor)

    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/items?${params}`,
        { signal: controller.signal },
      )
      if (response.status === 400) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as { code?: string } | null
        if (body?.code === 'invalid_cursor') {
          if (
            controller.signal.aborted ||
            requestId !== specificationItemsRequestIdRef.current
          ) {
            return
          }
          await loadFirstSpecificationItemsPage({
            recoveringInvalidCursor: true,
          })
          return
        }
      }

      const page = await readJsonOrThrow<SpecificationItemsPageData>(
        response,
        t('loadSpecificationItemsFailed'),
      )
      if (
        controller.signal.aborted ||
        requestId !== specificationItemsRequestIdRef.current
      ) {
        return
      }

      setSpecificationItems(current =>
        deduplicateSpecificationItems([...current, ...(page.items ?? [])]),
      )
      setSpecificationItemsHasMore(page.pagination?.hasMore ?? false)
      setSpecificationItemsNextCursor(page.pagination?.nextCursor ?? null)
    } catch {
      if (
        !controller.signal.aborted &&
        requestId === specificationItemsRequestIdRef.current
      ) {
        setSpecificationItemsContinuationError('continuation')
      }
    } finally {
      if (requestId === specificationItemsRequestIdRef.current) {
        setSpecificationItemsLoadingMore(false)
        if (specificationItemsAbortRef.current === controller) {
          specificationItemsAbortRef.current = null
        }
      }
    }
  }, [
    loadFirstSpecificationItemsPage,
    specificationId,
    specificationItemsHasMore,
    specificationItemsLoading,
    specificationItemsLoadingMore,
    specificationItemsNextCursor,
    specificationItemsParams,
    t,
  ])

  const retrySpecificationItems = useCallback(async () => {
    if (specificationItemsContinuationError === 'continuation') {
      await loadMoreSpecificationItems()
      requestAnimationFrame(() => specificationItemsRetryRef.current?.focus())
      return
    }
    await loadFirstSpecificationItemsPage({
      recoveringInvalidCursor:
        specificationItemsContinuationError === 'recovery',
      restoreRetryFocusOnFailure: true,
    })
  }, [
    loadFirstSpecificationItemsPage,
    loadMoreSpecificationItems,
    specificationItemsContinuationError,
  ])

  const needsReferenceUsageLoadError = t('loadSpecificationItemsFailed')

  useEffect(() => {
    if (expandedNeedsReferenceId == null) {
      setNeedsReferenceUsageLoading(false)
      setNeedsReferenceUsageError(null)
      return
    }

    const needsReferenceId = expandedNeedsReferenceId
    const requestId = ++needsReferenceUsageRequestIdRef.current
    const controller = new AbortController()
    setNeedsReferenceUsageLoading(true)
    setNeedsReferenceUsageError(null)

    void (async () => {
      const usage: SpecificationListItem[] = []
      const seenCursors = new Set<string>()
      let cursor: string | null = null

      try {
        do {
          const params = buildRequirementListParams({
            filters: { needsReferenceIds: [needsReferenceId] },
            limit: SPECIFICATION_NEEDS_REFERENCE_USAGE_PAGE_SIZE,
            locale,
            sort: DEFAULT_REQUIREMENT_SORT,
          })
          if (cursor) params.set('cursor', cursor)
          const response = await apiFetch(
            `/api/requirements-specifications/${specificationId}/items?${params}`,
            { signal: controller.signal },
          )
          const page = await readJsonOrThrow<SpecificationItemsPageData>(
            response,
            needsReferenceUsageLoadError,
          )
          usage.push(...(page.items ?? []))
          const nextCursor = page.pagination?.nextCursor ?? null
          if (
            !page.pagination?.hasMore ||
            !nextCursor ||
            seenCursors.has(nextCursor)
          ) {
            cursor = null
          } else {
            seenCursors.add(nextCursor)
            cursor = nextCursor
          }
        } while (cursor)

        if (
          controller.signal.aborted ||
          requestId !== needsReferenceUsageRequestIdRef.current
        ) {
          return
        }
        setNeedsReferenceUsageById(current => {
          const next = new Map(current)
          next.set(needsReferenceId, deduplicateSpecificationItems(usage))
          return next
        })
      } catch (error) {
        if (
          controller.signal.aborted ||
          requestId !== needsReferenceUsageRequestIdRef.current
        ) {
          return
        }
        setNeedsReferenceUsageError(
          error instanceof Error ? error.message : needsReferenceUsageLoadError,
        )
      } finally {
        if (requestId === needsReferenceUsageRequestIdRef.current) {
          setNeedsReferenceUsageLoading(false)
        }
      }
    })()

    return () => {
      controller.abort()
    }
  }, [
    expandedNeedsReferenceId,
    locale,
    needsReferenceUsageLoadError,
    specificationId,
  ])

  const closeAddModal = useCallback(() => {
    if (addModalLoading) return
    setOpenHelp(new Set())
    setAddModalError(null)
    setShowAddModal(false)
  }, [addModalLoading])

  const closeCreateLocalRequirementModal = useCallback(
    async (anchorEl?: HTMLElement | null) => {
      if (
        createLocalRequirementFormDirty &&
        !(await confirmDiscardChanges(anchorEl))
      ) {
        return false
      }
      setCreateLocalRequirementFormDirty(false)
      setShowCreateLocalRequirementModal(false)
      return true
    },
    [confirmDiscardChanges, createLocalRequirementFormDirty],
  )

  const toggleHelp = (field: string) => {
    setOpenHelp(prev => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const handleLeftTabChange = useCallback((tab: SpecificationDetailLeftTab) => {
    setLeftTab(tab)
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (tab === 'items') {
      url.searchParams.delete('leftTab')
    } else {
      url.searchParams.set('leftTab', tab)
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [])

  const helpButton = (
    field: string,
    label: string,
    { disabled = false }: { disabled?: boolean } = {},
  ) => (
    <FieldHelpButton
      controls={`help-${field}`}
      disabled={disabled}
      expanded={openHelp.has(field)}
      label={`${tc('help')}: ${label}`}
      onClick={() => toggleHelp(field)}
    />
  )

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel id={`help-${field}`} isOpen={openHelp.has(field)}>
      {t(helpKey)}
    </AnimatedHelpPanel>
  )

  const specificationItemIds = useMemo(
    () => new Set(specificationItems.map(r => r.id)),
    [specificationItems],
  )

  useEffect(() => {
    for (const item of specificationItems) {
      if (item.itemRef) {
        selectedItemsByRef.current.set(item.itemRef, item)
      }
    }
  }, [specificationItems])

  const selectedSpecificationItems = useMemo(
    () =>
      [...leftSelectedItemRefs].flatMap(itemRef => {
        const item = selectedItemsByRef.current.get(itemRef)
        return item ? [item] : []
      }),
    [leftSelectedItemRefs],
  )

  const leftSelectedIds = useMemo(
    () =>
      new Set(
        specificationItems
          .filter(
            item => item.itemRef && leftSelectedItemRefs.has(item.itemRef),
          )
          .map(item => item.id),
      ),
    [leftSelectedItemRefs, specificationItems],
  )

  const handleLeftSelectionChange = useCallback(
    (selectedIds: Set<number>) => {
      setSelectionNotice(null)
      setLeftSelectedItemRefs(current => {
        const loadedRefs = new Set(
          specificationItems
            .map(item => item.itemRef)
            .filter((itemRef): itemRef is string => Boolean(itemRef)),
        )
        const next = new Set(
          [...current].filter(itemRef => !loadedRefs.has(itemRef)),
        )
        for (const item of specificationItems) {
          if (selectedIds.has(item.id) && item.itemRef) {
            next.add(item.itemRef)
            selectedItemsByRef.current.set(item.itemRef, item)
          }
        }
        return next
      })
    },
    [specificationItems],
  )

  const selectionLocaleRef = useRef(locale)
  useEffect(() => {
    if (selectionLocaleRef.current === locale) return
    selectionLocaleRef.current = locale
    setLeftSelectedItemRefs(new Set())
    setSelectionNotice(null)
  }, [locale])

  const fetchSpecificationMeta = useCallback(
    async ({ throwOnError = false }: { throwOnError?: boolean } = {}) => {
      const refreshed = await specResource.reload()
      if (throwOnError && refreshed === undefined) {
        throw new Error(t('loadSpecificationFailed'))
      }
      return refreshed != null
    },
    [specResource, t],
  )

  const fetchSpecificationItems = useCallback(
    async ({
      throwOnError = false,
    }: {
      throwOnError?: boolean
    } = {}): Promise<boolean> => {
      const refreshed = await loadFirstSpecificationItemsPage()
      if (!refreshed) {
        if (throwOnError) {
          throw new Error(t('loadSpecificationItemsFailed'))
        }
        return false
      }
      return true
    },
    [loadFirstSpecificationItemsPage, t],
  )

  const fetchNeedsReferences = useCallback(
    async ({ throwOnError = false }: { throwOnError?: boolean } = {}) => {
      const refreshed = await needsReferencesResource.reload()
      if (refreshed === undefined) {
        if (throwOnError) {
          throw new Error(t('failedToLoadNeedsReferences'))
        }
        return false
      }
      return true
    },
    [needsReferencesResource, t],
  )

  const fetchAvailableRequirements = useCallback(
    async ({
      throwOnError = false,
    }: {
      throwOnError?: boolean
    } = {}): Promise<boolean> => {
      const refreshed = await availableRequirementsResource.reload()
      if (refreshed === undefined) {
        if (throwOnError) {
          throw new Error(t('loadAvailableRequirementsFailed'))
        }
        return false
      }
      return true
    },
    [availableRequirementsResource, t],
  )

  const loadMoreAvailable = useCallback(async () => {
    if (rightLoadingMore || !rightHasMore || !rightNextCursor) return
    const activeKey = availableRequirementsKeyRef.current
    setRightLoadingMore(true)
    try {
      const params = buildRequirementListParams({
        filters: rightFilters,
        limit: AVAILABLE_REQUIREMENTS_PAGE_SIZE,
        locale,
        cursor: rightNextCursor,
        sort: rightSort,
      })
      if (applyRequirementSelectionFilter) {
        params.set('applyRequirementSelectionFilter', 'true')
      }
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/available-requirements?${params}`,
      )
      if (activeKey !== availableRequirementsKeyRef.current) return
      if (response.status === 400) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as {
          code?: string
        } | null
        if (activeKey !== availableRequirementsKeyRef.current) return
        if (body?.code === 'invalid_cursor') {
          await availableRequirementsResource.reload()
          setLoadMoreWarning(tc('requirementListRefreshed'))
          return
        }
      }
      const data = await readJsonOrThrow<{
        requirements?: RequirementRow[]
        pagination?: { hasMore?: boolean; nextCursor?: string | null }
      }>(response, t('loadAvailableRequirementsFailed'))
      setLoadMoreWarning(null)
      setAvailableRows(prev => [...prev, ...(data.requirements ?? [])])
      setRightHasMore(data.pagination?.hasMore ?? false)
      setRightNextCursor(data.pagination?.nextCursor ?? null)
    } catch (error) {
      if (activeKey === availableRequirementsKeyRef.current) {
        setLoadMoreWarning(
          error instanceof Error
            ? error.message
            : t('loadAvailableRequirementsFailed'),
        )
      }
    } finally {
      setRightLoadingMore(false)
    }
  }, [
    applyRequirementSelectionFilter,
    availableRequirementsResource.reload,
    locale,
    rightFilters,
    rightHasMore,
    rightNextCursor,
    rightLoadingMore,
    rightSort,
    tc,
    specificationId,
    t,
  ])

  const handleRequirementSelectionFilterToggle = useCallback(
    (checked: boolean) => {
      setApplyRequirementSelectionFilter(checked)
      setRightSelectedIds(new Set())
    },
    [],
  )

  useEffect(() => {
    setLeftVisibleCols(readStoredCols(LEFT_VISIBLE_COLS_KEY, DEFAULT_LEFT_COLS))
    setRightVisibleCols(
      readStoredCols(RIGHT_VISIBLE_COLS_KEY, DEFAULT_RIGHT_COLS),
    )
    setColumnPreferencesLoaded(true)
  }, [])

  // Persist visible columns to localStorage after hydration has read them.
  useEffect(() => {
    if (!columnPreferencesLoaded) return
    localStorage.setItem(LEFT_VISIBLE_COLS_KEY, JSON.stringify(leftVisibleCols))
  }, [columnPreferencesLoaded, leftVisibleCols])

  useEffect(() => {
    if (!columnPreferencesLoaded) return
    localStorage.setItem(
      RIGHT_VISIBLE_COLS_KEY,
      JSON.stringify(rightVisibleCols),
    )
  }, [columnPreferencesLoaded, rightVisibleCols])

  // Open add modal
  const handleOpenAddModal = useCallback(async () => {
    setPendingAddIds(Array.from(rightSelectedIds))
    setPendingAddRequirementUniqueIds(
      availableRows
        .filter(item => rightSelectedIds.has(item.id))
        .map(item => item.uniqueId),
    )
    setAddNeedsRefMode('none')
    setAddNeedsRefId('')
    setAddNeedsRefText('')
    setAddNeedsRefDescription('')
    setAddModalError(null)
    setOpenHelp(new Set())
    setShowAddModal(true)
    await needsReferencesResource.reload()
  }, [availableRows, needsReferencesResource, rightSelectedIds])

  const handleOpenCreateLocalRequirementModal = useCallback(async () => {
    setCreateLocalRequirementFormDirty(false)
    setShowCreateLocalRequirementModal(true)

    if (availableNeedsRefs.length > 0) {
      return
    }

    await needsReferencesResource.reload()
  }, [availableNeedsRefs.length, needsReferencesResource])

  const handleConfirmAdd = useCallback(async () => {
    if (pendingAddIds.length === 0) return
    setAddModalLoading(true)
    try {
      const body: {
        requirementIds: number[]
        needsReferenceId?: number | null
        needsReferenceDescription?: string | null
        needsReferenceText?: string | null
      } = { requirementIds: pendingAddIds }
      if (addNeedsRefMode === 'existing' && addNeedsRefId !== '') {
        body.needsReferenceId = Number(addNeedsRefId)
      } else if (addNeedsRefMode === 'new' && addNeedsRefText.trim()) {
        body.needsReferenceText = addNeedsRefText.trim()
        body.needsReferenceDescription = addNeedsRefDescription.trim() || null
      }
      const res = await apiFetch(
        `/api/requirements-specifications/${specificationId}/items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        setAddModalError(data.error ?? tc('error'))
        return
      }
      await Promise.all([
        fetchSpecificationItems({ throwOnError: true }),
        fetchAvailableRequirements({ throwOnError: true }),
        needsReferencesResource.reload(),
      ])
      setAddModalError(null)
      setRightSelectedIds(new Set())
      setShowAddModal(false)
      setSelectionNotice(
        t('requirementsAdded', {
          ids: pendingAddRequirementUniqueIds.join(', '),
        }),
      )
    } catch {
      setAddModalError(tc('error'))
    } finally {
      setAddModalLoading(false)
    }
  }, [
    addNeedsRefId,
    addNeedsRefDescription,
    addNeedsRefMode,
    addNeedsRefText,
    fetchAvailableRequirements,
    fetchSpecificationItems,
    needsReferencesResource,
    specificationId,
    pendingAddIds,
    pendingAddRequirementUniqueIds,
    t,
    tc,
  ])

  const handleCreateLocalRequirement = useCallback(
    async (payload: SpecificationLocalRequirementSubmitPayload) => {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/local-requirements`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(body?.error ?? tc('error'))
      }

      setCreateLocalRequirementFormDirty(false)
      setShowCreateLocalRequirementModal(false)
      await fetchSpecificationItems({ throwOnError: true })
    },
    [fetchSpecificationItems, specificationId, tc],
  )

  const handleImportLocalRequirementsClose = useCallback(
    async (importSucceeded: boolean) => {
      setShowImportLocalRequirementsModal(false)
      if (importSucceeded) {
        await Promise.all([fetchSpecificationItems(), fetchNeedsReferences()])
      }
    },
    [fetchNeedsReferences, fetchSpecificationItems],
  )

  const needsReferenceFormDirty =
    needsReferenceForm !== null &&
    needsReferenceFormBaseline !==
      needsReferenceFormSignature(needsReferenceForm)

  const closeNeedsReferenceForm = useCallback(
    async (anchorEl?: HTMLElement | null) => {
      if (needsReferenceSaving) return false
      if (needsReferenceFormDirty && !(await confirmDiscardChanges(anchorEl))) {
        return false
      }
      setNeedsReferenceForm(null)
      setNeedsReferenceError(null)
      return true
    },
    [confirmDiscardChanges, needsReferenceFormDirty, needsReferenceSaving],
  )

  const handleSaveNeedsReference = useCallback(async () => {
    if (!needsReferenceForm) return
    if (!needsReferenceFormDirty) return
    setNeedsReferenceSaving(true)
    setNeedsReferenceError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/needs-references`,
        {
          method: needsReferenceForm.id == null ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(needsReferenceForm.id == null
              ? {}
              : { id: needsReferenceForm.id }),
            description: needsReferenceForm.description.trim() || null,
            text: needsReferenceForm.text.trim(),
          }),
        },
      )

      if (!response.ok) {
        const details = await readResponseMessage(response)
        setNeedsReferenceError(details || tc('error'))
        return
      }

      setNeedsReferenceForm(null)
      await Promise.all([
        fetchNeedsReferences({ throwOnError: true }),
        fetchSpecificationItems({ throwOnError: true }),
      ])
    } catch (error) {
      setNeedsReferenceError(
        error instanceof Error ? error.message : tc('error'),
      )
    } finally {
      setNeedsReferenceSaving(false)
    }
  }, [
    fetchNeedsReferences,
    fetchSpecificationItems,
    needsReferenceForm,
    needsReferenceFormDirty,
    specificationId,
    tc,
  ])

  const handleDeleteNeedsReference = useCallback(
    async (
      needsReference: SpecificationNeedsReference,
      anchorEl?: HTMLElement,
    ) => {
      const confirmed = await confirm({
        anchorEl,
        confirmText: tc('delete'),
        icon: 'caution',
        message: t('deleteNeedsReferenceConfirm', {
          needsReference: needsReference.text,
        }),
        title: t('deleteNeedsReference'),
        variant: 'danger',
      })

      if (!confirmed) return

      const response = await apiFetch(
        `/api/requirements-specifications/${specificationId}/needs-references`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: needsReference.id }),
        },
      )

      if (!response.ok) {
        const details = await readResponseMessage(response)
        setNeedsReferenceError(details || tc('error'))
        return
      }

      setExpandedNeedsReferenceId(current =>
        current === needsReference.id ? null : current,
      )
      await fetchNeedsReferences({ throwOnError: true })
    },
    [confirm, fetchNeedsReferences, specificationId, t, tc],
  )

  const handleNeedsReferenceAssignment = useCallback(
    async (itemRef: string, needsReferenceId: number | null) => {
      const originalItem =
        specificationItems.find(item => item.itemRef === itemRef) ?? null
      const nextNeedsReference =
        needsReferenceId == null
          ? null
          : (availableNeedsRefs.find(ref => ref.id === needsReferenceId) ??
            null)
      const restoreOriginalItem = () => {
        if (!originalItem) return
        setSpecificationItems(prev =>
          prev.map(item => (item.itemRef === itemRef ? originalItem : item)),
        )
      }

      setSpecificationItems(prev =>
        prev.map(item =>
          item.itemRef === itemRef
            ? {
                ...item,
                needsReference: nextNeedsReference?.text ?? null,
                needsReferenceId,
              }
            : item,
        ),
      )

      try {
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationId}/items/${encodeURIComponent(
            itemRef,
          )}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ needsReferenceId }),
          },
        )
        if (!response.ok) {
          restoreOriginalItem()
          return
        }
        await Promise.all([fetchSpecificationItems(), fetchNeedsReferences()])
      } catch {
        restoreOriginalItem()
      }
    },
    [
      availableNeedsRefs,
      fetchNeedsReferences,
      fetchSpecificationItems,
      specificationItems,
      specificationId,
    ],
  )

  const resolveItemRefs = useCallback(
    async (
      itemRefs: Set<string>,
      knownItems: SpecificationListItem[] = specificationItems,
    ) => {
      const knownByRef = new Map(
        [...selectedItemsByRef.current.values(), ...knownItems]
          .filter(item => item.itemRef)
          .map(item => [item.itemRef as string, item]),
      )
      const resolvedItems = await resolveSpecificationItemRefsInChunks(
        specificationId,
        [...itemRefs],
        t('loadSpecificationItemsFailed'),
      )
      const refreshedByRef = new Map(
        resolvedItems.flatMap(item => {
          const known = knownByRef.get(item.itemRef)
          if (!known) return []
          const refreshed: SpecificationListItem = {
            ...known,
            isSpecificationLocal: item.kind === 'specificationLocal',
            itemRef: item.itemRef,
            kind: item.kind,
            needsReference: item.needsReference,
            uniqueId: item.uniqueId,
          }
          selectedItemsByRef.current.set(item.itemRef, refreshed)
          return [[item.itemRef, refreshed] as const]
        }),
      )
      const disappeared = [...itemRefs].filter(
        itemRef => !refreshedByRef.has(itemRef),
      )

      if (disappeared.length > 0) {
        setLeftSelectedItemRefs(current => {
          const next = new Set(current)
          for (const itemRef of disappeared) next.delete(itemRef)
          return next
        })
        setSelectionNotice(
          t('selectionDisappeared', {
            ids: disappeared
              .map(itemRef => knownByRef.get(itemRef)?.uniqueId ?? itemRef)
              .join(', '),
          }),
        )
      }

      return [...itemRefs]
        .map(itemRef => refreshedByRef.get(itemRef))
        .filter((item): item is SpecificationListItem => item !== undefined)
    },
    [specificationId, specificationItems, t],
  )

  const resolveSelectedItems = useCallback(
    () => resolveItemRefs(leftSelectedItemRefs, specificationItems),
    [leftSelectedItemRefs, resolveItemRefs, specificationItems],
  )

  const openBulkNeedsReferenceModal = useCallback(async () => {
    setBulkActionResolving(true)
    setBulkNeedsReferenceError(null)
    try {
      const items = await resolveSelectedItems()
      if (items.length === 0) return
      setBulkNeedsReferenceItems(items)
      setShowBulkNeedsReferenceModal(true)
    } catch (error) {
      setBulkNeedsReferenceError(
        error instanceof Error ? error.message : tc('error'),
      )
    } finally {
      setBulkActionResolving(false)
    }
  }, [resolveSelectedItems, tc])

  const applyBulkNeedsReference = useCallback(
    async (
      needsReferenceId: number | null,
      confirmedItems: SpecificationListItem[],
    ) => {
      const confirmedRefs = new Set(
        confirmedItems
          .map(item => item.itemRef)
          .filter((itemRef): itemRef is string => Boolean(itemRef)),
      )
      if (confirmedRefs.size === 0) return

      setBulkActionSaving(true)
      setBulkNeedsReferenceError(null)
      try {
        const items = await resolveItemRefs(confirmedRefs, confirmedItems)
        if (items.length === 0) {
          setShowBulkNeedsReferenceModal(false)
          return
        }
        const itemRefs = items.map(item => item.itemRef as string)
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationId}/items`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemRefs, needsReferenceId }),
          },
        )

        if (!response.ok) {
          const details = await readResponseMessage(response)
          setBulkNeedsReferenceError(details || tc('error'))
          return
        }

        const successfulRefs = new Set(
          items
            .filter(item => item.needsReferenceId !== needsReferenceId)
            .map(item => item.itemRef as string),
        )

        setLeftSelectedItemRefs(current => {
          const next = new Set(current)
          for (const itemRef of successfulRefs) next.delete(itemRef)
          return next
        })
        await Promise.all([
          fetchSpecificationItems({ throwOnError: true }),
          fetchNeedsReferences(),
        ])
        setShowBulkNeedsReferenceModal(false)
      } catch (error) {
        setBulkNeedsReferenceError(
          error instanceof Error ? error.message : tc('error'),
        )
      } finally {
        setBulkActionSaving(false)
      }
    },
    [
      fetchNeedsReferences,
      fetchSpecificationItems,
      resolveItemRefs,
      specificationId,
      tc,
    ],
  )

  const handleClearNeedsReferences = useCallback(
    async (anchorEl?: HTMLElement) => {
      setBulkActionResolving(true)
      setBulkNeedsReferenceError(null)
      try {
        const items = await resolveSelectedItems()
        if (items.length === 0) return
        const confirmed = await confirm({
          anchorEl,
          confirmText: t('clearNeedsReferenceAction'),
          icon: 'warning',
          message: t('clearNeedsReferenceConfirm', {
            ids: items.map(item => item.uniqueId).join(', '),
          }),
          title: t('clearNeedsReferenceTitle'),
        })
        if (!confirmed) return
        await applyBulkNeedsReference(null, items)
      } catch (error) {
        setBulkNeedsReferenceError(
          error instanceof Error ? error.message : tc('error'),
        )
      } finally {
        setBulkActionResolving(false)
      }
    },
    [applyBulkNeedsReference, confirm, resolveSelectedItems, t, tc],
  )

  const handleSpecificationItemStatusChange = useCallback(
    async (itemRef: string, statusId: number) => {
      if (!spec) return
      const status = specificationItemStatuses.find(s => s.id === statusId)
      if (!status) return
      const originalItem =
        specificationItems.find(i => i.itemRef === itemRef) ?? null

      // Optimistic update (single-row)
      setSpecificationItems(prev =>
        prev.map(item => {
          if (item.itemRef !== itemRef) return item
          return {
            ...item,
            specificationItemStatusId: statusId,
            specificationItemStatusNameSv: status.nameSv,
            specificationItemStatusNameEn: status.nameEn,
            specificationItemStatusColor: status.color ?? null,
            specificationItemStatusIconName: status.iconName ?? null,
          }
        }),
      )

      try {
        const res = await apiFetch(
          `/api/requirements-specifications/${spec.id}/items/${encodeURIComponent(itemRef)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ specificationItemStatusId: statusId }),
          },
        )
        if (!res.ok) {
          if (originalItem) {
            setSpecificationItems(prev =>
              prev.map(i => (i.itemRef === itemRef ? originalItem : i)),
            )
          } else {
            // Fallback: refresh authoritative list
            await fetchSpecificationItems()
          }
        } else {
          await fetchSpecificationItems()
        }
      } catch {
        if (originalItem) {
          setSpecificationItems(prev =>
            prev.map(i => (i.itemRef === itemRef ? originalItem : i)),
          )
        } else {
          await fetchSpecificationItems()
        }
      }
    },
    [
      spec,
      specificationItemStatuses,
      specificationItems,
      fetchSpecificationItems,
    ],
  )

  const handleRemoveItems = useCallback(
    async (requestedItems: SpecificationListItem[], anchorEl?: HTMLElement) => {
      const requestedRefs = new Set(
        requestedItems
          .map(item => item.itemRef)
          .filter((itemRef): itemRef is string => Boolean(itemRef)),
      )
      if (requestedRefs.size === 0) return

      setBulkActionResolving(true)
      setBulkNeedsReferenceError(null)
      let items: SpecificationListItem[]
      try {
        items = await resolveItemRefs(requestedRefs, requestedItems)
      } catch (error) {
        setBulkNeedsReferenceError(
          error instanceof Error ? error.message : tc('error'),
        )
        setBulkActionResolving(false)
        return
      }
      if (items.length === 0) {
        setBulkActionResolving(false)
        return
      }

      const libraryItems = items.filter(item => !item.isSpecificationLocal)
      const specificationLocalItems = items.filter(
        item => item.isSpecificationLocal,
      )
      const libraryCount = libraryItems.length
      const specificationLocalCount = specificationLocalItems.length

      const confirmed = await confirm({
        anchorEl,
        confirmText: tc('delete'),
        icon: 'caution',
        message:
          specificationLocalCount === 0
            ? t('removeConfirm', {
                count: libraryCount,
                ids: libraryItems.map(item => item.uniqueId).join(', '),
              })
            : libraryCount === 0
              ? t('removeSpecificationLocalConfirm', {
                  count: specificationLocalCount,
                  ids: specificationLocalItems
                    .map(item => item.uniqueId)
                    .join(', '),
                })
              : t('removeMixedConfirm', {
                  libraryCount,
                  libraryIds: libraryItems
                    .map(item => item.uniqueId)
                    .join(', '),
                  specificationLocalCount,
                  specificationLocalIds: specificationLocalItems
                    .map(item => item.uniqueId)
                    .join(', '),
                }),
        title:
          specificationLocalCount === 0
            ? t('removeSelected', { count: libraryCount })
            : libraryCount === 0
              ? t('removeSpecificationLocalConfirmTitle')
              : t('removeMixedConfirmTitle'),
        variant: 'danger',
      })
      setBulkActionResolving(false)

      if (!confirmed) return

      const itemRefs = items.map(item => item.itemRef as string)
      setBulkActionSaving(true)
      try {
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationId}/items`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemRefs }),
          },
        )

        if (!response.ok) {
          const details = await readResponseMessage(response)
          setBulkNeedsReferenceError(details || tc('error'))
          return
        }

        const result = (await response.json()) as { removedCount?: number }
        let remainingRefs = new Set<string>()
        if (result.removedCount !== itemRefs.length) {
          const remainingItems = await resolveSpecificationItemRefsInChunks(
            specificationId,
            itemRefs,
            t('loadSpecificationItemsFailed'),
          )
          remainingRefs = new Set(remainingItems.map(item => item.itemRef))
        }
        const removedRefs = new Set(
          itemRefs.filter(itemRef => !remainingRefs.has(itemRef)),
        )
        setLeftSelectedItemRefs(current => {
          const next = new Set(current)
          for (const itemRef of removedRefs) next.delete(itemRef)
          return next
        })
        setLeftExpandedItemRef(current =>
          current != null && removedRefs.has(current) ? null : current,
        )
        const failedIds = items
          .filter(item => remainingRefs.has(item.itemRef as string))
          .map(item => item.uniqueId)
        await Promise.all([
          fetchSpecificationItems({ throwOnError: true }),
          fetchAvailableRequirements(),
          fetchNeedsReferences(),
        ])
        if (failedIds.length > 0) {
          setBulkNeedsReferenceError(
            t('removePartialFail', { ids: failedIds.join(', ') }),
          )
        }
      } catch (error) {
        setBulkNeedsReferenceError(
          error instanceof Error ? error.message : tc('error'),
        )
      } finally {
        setBulkActionSaving(false)
      }
    },
    [
      confirm,
      fetchAvailableRequirements,
      fetchNeedsReferences,
      fetchSpecificationItems,
      resolveItemRefs,
      specificationId,
      t,
      tc,
    ],
  )

  const handleRemoveSelected = useCallback(
    async (anchorEl?: HTMLElement) => {
      if (selectedSpecificationItems.length === 0) return
      await handleRemoveItems(selectedSpecificationItems, anchorEl)
    },
    [handleRemoveItems, selectedSpecificationItems],
  )

  const openBulkDeviationModal = useCallback(async () => {
    setBulkActionResolving(true)
    setBulkDeviationError(null)
    try {
      const items = await resolveSelectedItems()
      if (items.length === 0) return
      setBulkDeviationItems(items)
      setShowBulkDeviationModal(true)
    } catch (error) {
      setBulkDeviationError(
        error instanceof Error ? error.message : tc('error'),
      )
    } finally {
      setBulkActionResolving(false)
    }
  }, [resolveSelectedItems, tc])

  const handleBulkDeviation = useCallback(
    async (motivation: string) => {
      const requestedRefs = new Set(
        bulkDeviationItems
          .map(item => item.itemRef)
          .filter((itemRef): itemRef is string => Boolean(itemRef)),
      )
      if (requestedRefs.size === 0) return
      setBulkDeviationSaving(true)
      setBulkDeviationError(null)
      try {
        const items = await resolveItemRefs(requestedRefs, bulkDeviationItems)
        const results = await allSettledInBatches(
          items,
          BULK_DEVIATION_CONCURRENCY,
          item =>
            apiFetch(
              `/api/specification-item-deviations/${encodeURIComponent(item.itemRef as string)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivation }),
              },
            ).then(async response => {
              if (!response.ok) throw new Error(item.uniqueId)
              return item
            }),
        )
        const succeededRefs = new Set(
          results
            .filter(
              (
                result,
              ): result is PromiseFulfilledResult<SpecificationListItem> =>
                result.status === 'fulfilled',
            )
            .map(result => result.value.itemRef as string),
        )
        const failedIds = results
          .filter(
            (result): result is PromiseRejectedResult =>
              result.status === 'rejected',
          )
          .map(result =>
            result.reason instanceof Error
              ? result.reason.message
              : tc('error'),
          )
        setLeftSelectedItemRefs(current => {
          const next = new Set(current)
          for (const itemRef of succeededRefs) next.delete(itemRef)
          return next
        })
        if (failedIds.length > 0) {
          setBulkDeviationError(
            td('bulkDeviationPartialFail', { ids: failedIds.join(', ') }),
          )
        } else {
          setShowBulkDeviationModal(false)
        }
        await fetchSpecificationItems()
      } catch (error) {
        setBulkDeviationError(
          error instanceof Error ? error.message : tc('error'),
        )
      } finally {
        setBulkDeviationSaving(false)
      }
    },
    [bulkDeviationItems, fetchSpecificationItems, resolveItemRefs, tc, td],
  )

  const getName = (opt: { nameSv: string; nameEn: string }) =>
    locale === 'sv' ? opt.nameSv : opt.nameEn

  // Filter right panel rows to exclude already-added items
  const rightRows = useMemo(
    () => availableRows.filter(r => !specificationItemIds.has(r.id)),
    [availableRows, specificationItemIds],
  )

  const filteredSpecificationItems = specificationItems
  const leftExpandedId =
    specificationItems.find(item => item.itemRef === leftExpandedItemRef)?.id ??
    null
  const visibleSpecificationItemRefs = useMemo(
    () =>
      new Set(
        filteredSpecificationItems
          .map(item => item.itemRef)
          .filter((itemRef): itemRef is string => Boolean(itemRef)),
      ),
    [filteredSpecificationItems],
  )
  const hiddenSelectedSpecificationItems = useMemo(
    () =>
      selectedSpecificationItems.filter(
        item => item.itemRef && !visibleSpecificationItemRefs.has(item.itemRef),
      ),
    [selectedSpecificationItems, visibleSpecificationItemRefs],
  )
  const selectionActionLimitExceeded =
    leftSelectedItemRefs.size > SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT
  const selectionActionLimitExcess = Math.max(
    0,
    leftSelectedItemRefs.size - SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT,
  )
  const selectionActionLimitWarning = selectionActionLimitExceeded
    ? t('selectionActionLimitExceeded', {
        excess: selectionActionLimitExcess,
        hidden: hiddenSelectedSpecificationItems.length,
        limit: SPECIFICATION_ITEM_SELECTION_ACTION_LIMIT,
        total: leftSelectedItemRefs.size,
      })
    : null
  const deselectHiddenSpecificationItems = useCallback(() => {
    const hiddenRefs = new Set(
      hiddenSelectedSpecificationItems
        .map(item => item.itemRef)
        .filter((itemRef): itemRef is string => Boolean(itemRef)),
    )
    setLeftSelectedItemRefs(current => {
      const next = new Set(current)
      for (const itemRef of hiddenRefs) next.delete(itemRef)
      return next
    })
  }, [hiddenSelectedSpecificationItems])
  const traceabilityQueryParams = useMemo(
    () =>
      buildRequirementListParams({
        filters: leftFilters,
        locale,
        sort: leftSort,
      }).toString(),
    [leftFilters, leftSort, locale],
  )
  const hasTraceabilityReportActions = filteredSpecificationItems.length > 0

  const specificationRequirementPackages = requirementPackages

  const specificationReportProfile = useMemo(
    () =>
      getSpecificationReportProfileForLifecycleStatus(
        spec?.specificationLifecycleStatusId,
      ),
    [spec?.specificationLifecycleStatusId],
  )
  const showProcurementCsv = canExportProcurementCsvForLifecycleStatus(
    spec?.specificationLifecycleStatusId,
  )

  const reportProfileLabel = useCallback(
    (profile: SpecificationReportProfile) => {
      if (profile === 'procurement') return t('reportProfiles.procurement')
      if (profile === 'management') return t('reportProfiles.management')
      return t('reportProfiles.progress')
    },
    [t],
  )

  const exportProfileLabel = useCallback(
    (profile: SpecificationCsvProfile) => {
      if (profile === 'procurement') return t('exportProfiles.procurement')
      return t('exportProfiles.full')
    },
    [t],
  )

  const handleExportCsv = useCallback(
    (
      profile: SpecificationCsvProfile,
      restoreFocusTo?: HTMLButtonElement | null,
    ) => {
      if (!spec) return
      const label = exportProfileLabel(profile)
      void generatedOutputDownload.download({
        fallbackFilename: `${label} ${spec.name} ${spec.specificationCode}.csv`,
        output: 'csv',
        restoreFocusTo,
        url: `/api/requirements-specifications/${encodeURIComponent(
          specificationId,
        )}/exports?profile=${encodeURIComponent(
          profile,
        )}&locale=${encodeURIComponent(locale)}`,
      })
    },
    [
      exportProfileLabel,
      generatedOutputDownload,
      locale,
      spec,
      specificationId,
    ],
  )

  const handleDownloadPdf = useCallback(
    (
      profile: SpecificationReportProfile,
      restoreFocusTo?: HTMLButtonElement | null,
    ) => {
      if (!spec) return
      const label = reportProfileLabel(profile)
      void generatedOutputDownload.download({
        fallbackFilename: `${label} ${spec.name} ${spec.specificationCode}.pdf`,
        restoreFocusTo,
        url: `/${locale}/specifications/${encodeURIComponent(
          specificationPathId,
        )}/reports/pdf/${profile}`,
      })
    },
    [
      generatedOutputDownload,
      locale,
      reportProfileLabel,
      specificationPathId,
      spec,
    ],
  )

  const handleDownloadTraceabilityPdf = useCallback(
    (restoreFocusTo?: HTMLButtonElement | null) => {
      if (!spec || !hasTraceabilityReportActions) return
      const label = t('reportProfiles.traceability')
      void generatedOutputDownload.download({
        fallbackFilename: `${label} ${spec.name} ${spec.specificationCode}.pdf`,
        restoreFocusTo,
        url: `/${locale}/specifications/${encodeURIComponent(
          specificationPathId,
        )}/reports/pdf/traceability?${traceabilityQueryParams}`,
      })
    },
    [
      generatedOutputDownload,
      hasTraceabilityReportActions,
      locale,
      specificationPathId,
      spec,
      t,
      traceabilityQueryParams,
    ],
  )

  const specName = spec ? spec.name : '…'
  const permissions = spec?.permissions ?? {
    canEditContent: false,
    canManageAssignments: false,
    canReviewDecisions: false,
    canUseAi: false,
  }
  const canEditContent = permissions.canEditContent === true
  const canMutateSpecification =
    permissions.canEditContent === true ||
    permissions.canManageAssignments === true
  const canOpenAiLocalRequirements =
    canEditContent &&
    permissions.canUseAi === true &&
    initialData.aiGenerationAvailability.effectiveRequirementGenerationEnabled
  const aiLocalRequirementsDisabledTooltip = !initialData
    .aiGenerationAvailability.effectiveRequirementGenerationEnabled
    ? initialData.aiGenerationAvailability.disabledByEnvironment
      ? t('aiGenerateDisabledByEnvironment')
      : t('aiGenerateDisabledByAdmin')
    : undefined

  const handleOpenAiLocalRequirements = useCallback(
    (returnFocusTarget?: HTMLButtonElement | null) => {
      if (!canOpenAiLocalRequirements) return
      aiReturnFocusTargetRef.current = returnFocusTarget ?? null
      setShowAiLocalRequirementsModal(true)
    },
    [canOpenAiLocalRequirements],
  )

  const handleOpenImportLocalRequirements = useCallback(
    (returnFocusTarget?: HTMLButtonElement | null) => {
      importReturnFocusTargetRef.current = returnFocusTarget ?? null
      setShowImportLocalRequirementsModal(true)
    },
    [],
  )

  const buildMoreActionMenuItems = ({
    includeAddActions,
    includeOutputActions,
  }: {
    includeAddActions: boolean
    includeOutputActions: boolean
  }): FloatingActionMenuItem[] => {
    const addActions: FloatingActionMenuItem[] = includeAddActions
      ? [
          {
            developerModeValue: 'ai-assisted authoring',
            disabled: !canOpenAiLocalRequirements,
            icon: <Sparkles aria-hidden="true" className="h-4 w-4" />,
            id: 'ai-assist-local',
            label: t('aiGenerate'),
            onClick: handleOpenAiLocalRequirements,
            tooltip: aiLocalRequirementsDisabledTooltip ?? t('aiGenerate'),
            ...(aiLocalRequirementsDisabledTooltip
              ? { description: aiLocalRequirementsDisabledTooltip }
              : {}),
          },
          {
            developerModeValue: 'import local requirements',
            icon: <Upload aria-hidden="true" className="h-4 w-4" />,
            id: 'import-local',
            label: t('importLocalRequirements'),
            onClick: handleOpenImportLocalRequirements,
          },
        ]
      : []
    const reportActions: FloatingActionMenuItem[] = includeOutputActions
      ? [
          ...(specificationReportProfile
            ? [
                {
                  developerModeValue: 'report',
                  icon: <Printer aria-hidden="true" className="h-4 w-4" />,
                  id: `pdf-${specificationReportProfile}`,
                  label: t('downloadProfileReportPdf', {
                    report: reportProfileLabel(specificationReportProfile),
                  }),
                  disabled: generatedOutputDownload.downloading,
                  onClick: returnFocusTarget =>
                    void handleDownloadPdf(
                      specificationReportProfile,
                      returnFocusTarget,
                    ),
                } satisfies FloatingActionMenuItem,
              ]
            : []),
          ...(hasTraceabilityReportActions
            ? [
                {
                  developerModeValue: 'report',
                  icon: <Printer aria-hidden="true" className="h-4 w-4" />,
                  id: 'pdf-traceability',
                  label: t('downloadProfileReportPdf', {
                    report: t('reportProfiles.traceability'),
                  }),
                  disabled: generatedOutputDownload.downloading,
                  onClick: returnFocusTarget =>
                    void handleDownloadTraceabilityPdf(returnFocusTarget),
                } satisfies FloatingActionMenuItem,
              ]
            : []),
        ]
      : []
    const exportActions: FloatingActionMenuItem[] = includeOutputActions
      ? [
          ...(showProcurementCsv
            ? [
                {
                  developerModeValue: 'export',
                  icon: <Download aria-hidden="true" className="h-4 w-4" />,
                  id: 'export-procurement',
                  label: exportProfileLabel('procurement'),
                  disabled: generatedOutputDownload.downloading,
                  onClick: returnFocusTarget =>
                    void handleExportCsv('procurement', returnFocusTarget),
                } satisfies FloatingActionMenuItem,
              ]
            : []),
          {
            developerModeValue: 'export',
            icon: <Download aria-hidden="true" className="h-4 w-4" />,
            id: 'export-full',
            label: exportProfileLabel('full'),
            disabled: generatedOutputDownload.downloading,
            onClick: returnFocusTarget =>
              void handleExportCsv('full', returnFocusTarget),
          },
        ]
      : []

    return groupedFloatingActionMenuItems([
      { id: 'add-actions', items: addActions },
      { id: 'report-actions', items: reportActions },
      { id: 'export-actions', items: exportActions },
    ])
  }

  const localName = (obj: { nameSv: string; nameEn: string } | null) =>
    obj ? (locale === 'sv' ? obj.nameSv : obj.nameEn) : null

  // Add modal portal (issue 5)
  const addModal =
    showAddModal && typeof window !== 'undefined'
      ? createPortal(
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onKeyDown={e => {
              if (e.key === 'Escape') {
                closeAddModal()
              }
            }}
            role="dialog"
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl p-6 space-y-4"
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Escape') {
                  closeAddModal()
                }
              }}
              role="document"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                  {t('addingCount', { count: pendingAddIds.length })}
                </h2>
                <button
                  aria-label={tc('close')}
                  className="p-1.5 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={addModalLoading}
                  onClick={closeAddModal}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <label
                    className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                    htmlFor="add-needs-ref"
                  >
                    {t('addNeedsRef')}
                  </label>
                  {helpButton('add-needs-ref', t('addNeedsRef'), {
                    disabled: addModalLoading,
                  })}
                </div>
                {helpPanel('addNeedsRefHelp', 'add-needs-ref')}
                <select
                  className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={addModalLoading}
                  id="add-needs-ref"
                  onChange={e => {
                    const v = e.target.value
                    if (v === 'none') {
                      setAddNeedsRefMode('none')
                      setAddNeedsRefId('')
                    } else if (v === 'new') {
                      setAddNeedsRefMode('new')
                      setAddNeedsRefId('')
                    } else {
                      setAddNeedsRefMode('existing')
                      setAddNeedsRefId(Number(v))
                    }
                  }}
                  value={
                    addNeedsRefMode === 'existing'
                      ? String(addNeedsRefId)
                      : addNeedsRefMode
                  }
                >
                  <option value="none">{t('noNeedsRef')}</option>
                  <option value="new">{t('newNeedsRef')}</option>
                  {availableNeedsRefs.map(ref => (
                    <option key={ref.id} value={String(ref.id)}>
                      {ref.text}
                    </option>
                  ))}
                </select>
                {addNeedsRefMode === 'new' && (
                  <>
                    <div className="mt-2 mb-1 flex items-center gap-1.5">
                      <label
                        className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                        htmlFor="add-needs-ref-text"
                      >
                        {t('addNeedsRefTextLabel')}
                      </label>
                      {helpButton(
                        'add-needs-ref-text',
                        t('addNeedsRefTextLabel'),
                        { disabled: addModalLoading },
                      )}
                    </div>
                    {helpPanel('addNeedsRefTextHelp', 'add-needs-ref-text')}
                    <textarea
                      className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 resize-none disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={addModalLoading}
                      id="add-needs-ref-text"
                      onChange={e => setAddNeedsRefText(e.target.value)}
                      placeholder={t('addNeedsRefPlaceholder')}
                      rows={3}
                      value={addNeedsRefText}
                    />
                    <div className="mt-2 mb-1 flex items-center gap-1.5">
                      <label
                        className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                        htmlFor="add-needs-ref-description"
                      >
                        {t('needsReferenceDescription')}
                      </label>
                      {helpButton(
                        'add-needs-ref-description',
                        t('needsReferenceDescription'),
                        { disabled: addModalLoading },
                      )}
                    </div>
                    {helpPanel(
                      'needsReferenceDescriptionHelp',
                      'add-needs-ref-description',
                    )}
                    <textarea
                      className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 resize-none disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={addModalLoading}
                      id="add-needs-ref-description"
                      onChange={e => setAddNeedsRefDescription(e.target.value)}
                      placeholder={t('needsReferenceDescriptionPlaceholder')}
                      rows={3}
                      value={addNeedsRefDescription}
                    />
                  </>
                )}
              </div>
              {addModalError ? (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                  role="alert"
                >
                  {addModalError}
                </p>
              ) : null}
              <div className="flex gap-3 pt-1">
                <button
                  className="btn-primary"
                  disabled={addModalLoading}
                  onClick={() => void handleConfirmAdd()}
                  type="button"
                >
                  {addModalLoading ? tc('loading') : t('confirmAdd')}
                </button>
                <button
                  className="px-4 py-2.5 rounded-xl border text-sm min-h-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={addModalLoading}
                  onClick={closeAddModal}
                  type="button"
                >
                  {addModalLoading ? tc('loading') : tc('cancel')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  const createLocalRequirementModal =
    showCreateLocalRequirementModal && typeof window !== 'undefined'
      ? createPortal(
          <div
            aria-labelledby="create-local-requirement-title"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                void closeCreateLocalRequirementModal()
              }
            }}
            role="dialog"
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-secondary-900"
              role="document"
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                    {t('itemsInSpecification')}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                    <span id="create-local-requirement-title">
                      {t('newLocalRequirement')}
                    </span>
                  </h2>
                </div>
                <button
                  aria-label={tc('close')}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-secondary-800"
                  onClick={event =>
                    void closeCreateLocalRequirementModal(event.currentTarget)
                  }
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              <SpecificationLocalRequirementForm
                needsReferences={availableNeedsRefs}
                onCancel={() => {
                  setCreateLocalRequirementFormDirty(false)
                  setShowCreateLocalRequirementModal(false)
                }}
                onDirtyChange={setCreateLocalRequirementFormDirty}
                onSubmit={handleCreateLocalRequirement}
                submitLabel={tc('save')}
              />
            </div>
          </div>,
          document.body,
        )
      : null

  const needsReferenceFormModal =
    typeof window !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {needsReferenceForm ? (
              <motion.div
                aria-labelledby="needs-reference-form-title"
                aria-modal="true"
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                key="needs-reference-form-backdrop"
                onKeyDown={event => {
                  if (event.key === 'Escape' && !needsReferenceSaving) {
                    void closeNeedsReferenceForm()
                  }
                }}
                role="dialog"
                {...fadeMotion(shouldReduceMotion)}
              >
                <div className="absolute inset-0" />
                <motion.div
                  className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-secondary-900"
                  role="document"
                  {...dialogPanelMotion(shouldReduceMotion)}
                >
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
                        {t('needsReferences')}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                        <span id="needs-reference-form-title">
                          {needsReferenceForm.id == null
                            ? t('newNeedsReference')
                            : t('editNeedsReference')}
                        </span>
                      </h2>
                    </div>
                    <button
                      aria-label={tc('close')}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:bg-secondary-100 dark:hover:bg-secondary-800"
                      disabled={needsReferenceSaving}
                      onClick={event =>
                        void closeNeedsReferenceForm(event.currentTarget)
                      }
                      type="button"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <label
                          className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                          htmlFor="needs-reference-text"
                        >
                          {t('needsReference')}
                        </label>
                        {helpButton(
                          'needs-reference-text',
                          t('needsReference'),
                          {
                            disabled: needsReferenceSaving,
                          },
                        )}
                      </div>
                      {helpPanel('needsReferenceHelp', 'needs-reference-text')}
                      <input
                        className="w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-secondary-800/50"
                        disabled={needsReferenceSaving}
                        id="needs-reference-text"
                        onChange={event =>
                          setNeedsReferenceForm(current =>
                            current
                              ? { ...current, text: event.target.value }
                              : current,
                          )
                        }
                        value={needsReferenceForm.text}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <label
                          className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                          htmlFor="needs-reference-description"
                        >
                          {t('needsReferenceDescription')}
                        </label>
                        {helpButton(
                          'needs-reference-description',
                          t('needsReferenceDescription'),
                          { disabled: needsReferenceSaving },
                        )}
                      </div>
                      {helpPanel(
                        'needsReferenceDescriptionHelp',
                        'needs-reference-description',
                      )}
                      <textarea
                        className="w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-secondary-800/50"
                        disabled={needsReferenceSaving}
                        id="needs-reference-description"
                        onChange={event =>
                          setNeedsReferenceForm(current =>
                            current
                              ? { ...current, description: event.target.value }
                              : current,
                          )
                        }
                        placeholder={t('needsReferenceDescriptionPlaceholder')}
                        rows={4}
                        value={needsReferenceForm.description}
                      />
                    </div>
                    {needsReferenceError ? (
                      <p
                        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                        role="alert"
                      >
                        {needsReferenceError}
                      </p>
                    ) : null}
                    <div className="flex gap-3 pt-1">
                      <DirtyStateButton
                        className="btn-primary"
                        dirty={needsReferenceFormDirty}
                        disabled={
                          needsReferenceSaving ||
                          !needsReferenceForm.text.trim()
                        }
                        onClick={() => void handleSaveNeedsReference()}
                        type="button"
                      >
                        {needsReferenceSaving ? tc('saving') : tc('save')}
                      </DirtyStateButton>
                      <button
                        className="min-h-11 rounded-xl border px-4 py-2.5 text-sm transition-colors hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-secondary-800"
                        disabled={needsReferenceSaving}
                        onClick={event =>
                          void closeNeedsReferenceForm(event.currentTarget)
                        }
                        type="button"
                      >
                        {tc('cancel')}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null

  if (loading) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
        <p className="text-secondary-600 dark:text-secondary-400">
          {tc('loading')}
        </p>
      </div>
    )
  }

  if (!spec) {
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">
          {loadWarning ? (
            <p
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
              role="status"
            >
              {loadWarning}
            </p>
          ) : null}
          <p className="text-secondary-600 dark:text-secondary-400">
            {t('specificationNotFound')}
          </p>
          <Link
            className="text-primary-700 dark:text-primary-300 hover:underline mt-4 inline-block"
            href="/specifications"
          >
            ← {t('backToSpecifications')}
          </Link>
        </div>
      </div>
    )
  }

  const desktopSplitPanelCardClassName =
    'bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain'
  const specificationDetailStickyTopOffsetClassName = 'top-0'
  const specificationDetailPagePaddingClassName =
    'px-4 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-7 lg:px-8 lg:pt-8'
  const splitPanelHeaderClassName = `sticky ${specificationDetailStickyTopOffsetClassName} z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-white/80 px-3 py-2 backdrop-blur-sm sm:flex-nowrap dark:bg-secondary-900/80`
  const specificationDetailPageShellClassName = `${specificationDetailPagePaddingClassName} xl:flex xl:h-[calc(100dvh-4rem)] xl:flex-col xl:overflow-hidden`
  const specificationDetailContainerClassName =
    'container-custom max-w-none xl:flex xl:min-h-0 xl:flex-1 xl:flex-col'
  const specificationDetailSplitPanelClassName =
    'grid grid-cols-1 gap-6 items-start xl:-mx-8 xl:min-h-0 xl:flex-1 xl:grid-cols-2 xl:grid-rows-[minmax(0,1fr)] xl:items-stretch xl:gap-4 xl:overflow-hidden'
  const responsibleDisplayName = formatActorDisplayNameForLocale(
    spec.responsibleDisplayName,
    locale,
  )
  const openNeedsReferenceForm = () => {
    if (!canEditContent) return
    setNeedsReferenceError(null)
    const nextForm = {
      description: '',
      id: null,
      text: '',
    }
    setNeedsReferenceForm(nextForm)
    setNeedsReferenceFormBaseline(needsReferenceFormSignature(nextForm))
  }
  const splitPanelTabsClassName =
    'inline-flex max-w-full shrink gap-1 overflow-x-auto rounded-full bg-secondary-100 p-1 shadow-inner dark:bg-secondary-950/80'
  const splitPanelTabClassName = (active: boolean) =>
    `inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 sm:px-6 sm:text-base ${
      active
        ? 'border-white bg-white text-secondary-900 shadow-sm dark:border-primary-500 dark:bg-primary-600 dark:text-white'
        : 'border-transparent text-secondary-700 hover:bg-white/70 hover:text-secondary-900 dark:text-secondary-300 dark:hover:bg-secondary-800/70 dark:hover:text-secondary-100'
    }`
  const leftPanelActionPillClassName =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary-600/80 bg-primary-700 text-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-primary-700 hover:bg-primary-800 hover:shadow-[0_14px_36px_-20px_rgba(67,56,202,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-primary-500/80 dark:bg-primary-600 dark:hover:border-primary-400 dark:hover:bg-primary-700 dark:focus-visible:ring-offset-secondary-950'
  const renderEmptySpecificationActions = () => {
    const moreActionMenuItems = buildMoreActionMenuItems({
      includeAddActions: canEditContent,
      includeOutputActions: false,
    })
    const actions: FloatingActionItem[] = [
      ...(canEditContent
        ? [
            {
              ariaLabel: t('newLocalRequirement'),
              developerModeContext: 'requirements specification detail',
              developerModeValue: 'new local requirement',
              icon: <Plus aria-hidden="true" className="h-4 w-4" />,
              id: 'create-local',
              onClick: () => void handleOpenCreateLocalRequirementModal(),
              tooltip: t('newLocalRequirement'),
              variant: 'primary' as const,
            },
          ]
        : []),
      ...(moreActionMenuItems.length > 0
        ? [
            {
              ariaLabel: tc('moreActions'),
              developerModeContext: 'requirements specification detail',
              developerModeValue: 'more actions',
              icon: <Ellipsis aria-hidden="true" className="h-4 w-4" />,
              id: 'more-actions',
              menuItems: moreActionMenuItems,
              tooltip: tc('moreActions'),
            },
          ]
        : []),
    ]

    if (actions.length === 0) return null

    return (
      <div className="flex shrink-0 items-center gap-2">
        {actions.map(action => (
          <FloatingActionPill action={action} key={action.id} />
        ))}
      </div>
    )
  }
  const renderLeftPanelTabs = () => (
    <div
      aria-label={t('leftPanelTabs')}
      className={splitPanelTabsClassName}
      role="tablist"
    >
      <button
        aria-selected={leftTab === 'items'}
        className={splitPanelTabClassName(leftTab === 'items')}
        onClick={() => handleLeftTabChange('items')}
        role="tab"
        type="button"
      >
        <span className="truncate">{t('itemsInSpecification')}</span>
      </button>
      <button
        aria-selected={leftTab === 'needs-references'}
        className={splitPanelTabClassName(leftTab === 'needs-references')}
        onClick={() => handleLeftTabChange('needs-references')}
        role="tab"
        type="button"
      >
        <span className="truncate">{t('needsReferences')}</span>
        <span className="text-xs opacity-80">{availableNeedsRefs.length}</span>
      </button>
      <button
        aria-selected={leftTab === 'rfi'}
        className={splitPanelTabClassName(leftTab === 'rfi')}
        onClick={() => handleLeftTabChange('rfi')}
        role="tab"
        type="button"
      >
        <span className="truncate">{t('rfiList')}</span>
      </button>
    </div>
  )
  const renderRightPanelTabs = () => (
    <div
      aria-label={t('rightPanelTabs')}
      className={splitPanelTabsClassName}
      role="tablist"
    >
      <button
        aria-controls="right-panel-available"
        aria-selected={rightPanelTab === 'available'}
        className={splitPanelTabClassName(rightPanelTab === 'available')}
        id="right-panel-tab-available"
        onClick={() => setRightPanelTab('available')}
        role="tab"
        type="button"
      >
        <span className="truncate">{t('availableRequirements')}</span>
      </button>
      <button
        aria-controls="right-panel-questions"
        aria-selected={rightPanelTab === 'questions'}
        className={splitPanelTabClassName(rightPanelTab === 'questions')}
        id="right-panel-tab-questions"
        onClick={() => setRightPanelTab('questions')}
        role="tab"
        type="button"
      >
        <span className="truncate">{t('requirementSelectionQuestions')}</span>
      </button>
    </div>
  )
  const leftPanelMoreActionMenuItems = buildMoreActionMenuItems({
    includeAddActions: canEditContent,
    includeOutputActions: specificationItems.length > 0,
  })

  return (
    <>
      <div
        className={specificationDetailPageShellClassName}
        data-specification-detail-page-shell="true"
      >
        <div className={specificationDetailContainerClassName}>
          {loadWarning ? (
            <p
              className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
              role="status"
            >
              {loadWarning}
            </p>
          ) : null}
          {!canMutateSpecification ? (
            <p
              className="mb-4 rounded-xl border border-secondary-200 bg-secondary-50 px-4 py-3 text-sm text-secondary-700 dark:border-secondary-800 dark:bg-secondary-900/60 dark:text-secondary-200"
              role="status"
            >
              {t('readOnlyNotice')}
            </p>
          ) : null}
          {/* Header */}
          <div className="mb-5">
            <div
              className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(40vw,1fr)_minmax(0,1fr)] xl:items-start xl:gap-5"
              data-specification-detail-header-summary="true"
            >
              <div className="min-w-0">
                <div
                  className="flex items-start gap-3"
                  data-specification-detail-title-row="true"
                >
                  <h1 className="min-w-0 text-2xl font-bold text-secondary-900 dark:text-secondary-100 xl:text-[2rem] xl:leading-tight">
                    {specName}
                  </h1>
                  {canMutateSpecification ? (
                    <button
                      aria-expanded={showEditSpecificationForm}
                      aria-haspopup="dialog"
                      aria-label={t('editSpecification')}
                      className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-secondary-200 bg-white/80 text-secondary-700 shadow-sm transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-secondary-700 dark:bg-secondary-900/70 dark:text-secondary-200 dark:hover:bg-secondary-800"
                      {...devMarker({
                        context: 'requirements specification detail',
                        name: 'detail action',
                        priority: 350,
                        value: 'edit specification',
                      })}
                      onClick={() => setShowEditSpecificationForm(true)}
                      title={t('editSpecification')}
                      type="button"
                    >
                      <Pencil aria-hidden="true" className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                {spec.businessNeedsReference && (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary-700 dark:text-secondary-200">
                    {spec.businessNeedsReference}
                  </p>
                )}
              </div>
              <dl
                className="grid grid-flow-col auto-cols-[minmax(12rem,1fr)] gap-3 overflow-x-auto pb-1 xl:auto-cols-fr"
                data-specification-detail-header-metadata="true"
              >
                {spec.governanceObjectType && (
                  <div className="min-w-0 rounded-xl border border-secondary-200/70 bg-white/50 px-3 py-2.5 backdrop-blur-sm dark:border-secondary-700/70 dark:bg-secondary-900/40">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-500 dark:text-secondary-400">
                      {t('governanceObjectType')}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-5 text-secondary-800 wrap-break-word dark:text-secondary-100">
                      {localName(spec.governanceObjectType)}
                    </dd>
                  </div>
                )}
                {responsibleDisplayName && (
                  <div className="min-w-0 rounded-xl border border-secondary-200/70 bg-white/50 px-3 py-2.5 backdrop-blur-sm dark:border-secondary-700/70 dark:bg-secondary-900/40">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-500 dark:text-secondary-400">
                      {t('responsible')}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-5 text-secondary-800 wrap-break-word dark:text-secondary-100">
                      {responsibleDisplayName}
                    </dd>
                    {spec.responsibleHsaId ? (
                      <dd className="mt-0.5 font-mono text-xs leading-5 text-secondary-500 wrap-break-word dark:text-secondary-400">
                        {spec.responsibleHsaId}
                      </dd>
                    ) : null}
                  </div>
                )}
                {spec.implementationType && (
                  <div className="min-w-0 rounded-xl border border-secondary-200/70 bg-white/50 px-3 py-2.5 backdrop-blur-sm dark:border-secondary-700/70 dark:bg-secondary-900/40">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-500 dark:text-secondary-400">
                      {t('implementationType')}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-5 text-secondary-800 wrap-break-word dark:text-secondary-100">
                      {localName(spec.implementationType)}
                    </dd>
                  </div>
                )}
                {spec.lifecycleStatus && (
                  <div className="min-w-0 rounded-xl border border-secondary-200/70 bg-white/50 px-3 py-2.5 backdrop-blur-sm dark:border-secondary-700/70 dark:bg-secondary-900/40">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-500 dark:text-secondary-400">
                      {t('lifecycleStatus')}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-5 text-secondary-800 wrap-break-word dark:text-secondary-100">
                      {localName(spec.lifecycleStatus)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Split panel */}
          <div
            className={specificationDetailSplitPanelClassName}
            data-specification-detail-split-panel="true"
          >
            {/* Left panel: Krav i underlaget / Behovsreferenser */}
            <div className="flex flex-col gap-3 xl:h-full xl:min-h-0 xl:overflow-hidden">
              {leftTab === 'needs-references' ? (
                <div
                  className={desktopSplitPanelCardClassName}
                  data-specification-detail-list-panel="needs-references"
                >
                  <div className={splitPanelHeaderClassName}>
                    {renderLeftPanelTabs()}
                    {canEditContent ? (
                      <button
                        aria-label={t('newNeedsReference')}
                        className={leftPanelActionPillClassName}
                        {...devMarker({
                          context: 'requirements specification detail',
                          name: 'table action',
                          priority: 350,
                          value: 'create needs reference',
                        })}
                        onClick={openNeedsReferenceForm}
                        title={t('newNeedsReference')}
                        type="button"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">
                          {t('newNeedsReference')}
                        </span>
                      </button>
                    ) : null}
                  </div>
                  {needsReferenceError ? (
                    <p
                      className="m-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                      role="alert"
                    >
                      {needsReferenceError}
                    </p>
                  ) : null}
                  {availableNeedsRefs.length === 0 ? (
                    <div className="p-8 text-center text-sm text-secondary-500 dark:text-secondary-400">
                      {t('noNeedsReferences')}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-secondary-200 text-sm dark:divide-secondary-700">
                        <thead className="bg-secondary-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-secondary-500 dark:bg-secondary-900 dark:text-secondary-400">
                          <tr>
                            <th className="w-11 px-3 py-2" scope="col">
                              <span className="sr-only">{tc('expand')}</span>
                            </th>
                            <th className="px-3 py-2" scope="col">
                              {t('needsReference')}
                            </th>
                            <th className="px-3 py-2" scope="col">
                              {t('needsReferenceDescription')}
                            </th>
                            <th className="px-3 py-2 text-right" scope="col">
                              {t('linkedRequirements')}
                            </th>
                            <th className="px-3 py-2 text-right" scope="col">
                              <span className="sr-only">{tc('actions')}</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-secondary-100 dark:divide-secondary-800">
                          {availableNeedsRefs.map(ref => {
                            const usage =
                              needsReferenceUsageById.get(ref.id) ?? []
                            const isExpanded =
                              expandedNeedsReferenceId === ref.id
                            const linkedCount =
                              ref.linkedItemCount ?? usage.length
                            return (
                              <Fragment key={ref.id}>
                                <tr className="align-top">
                                  <td className="px-3 py-2">
                                    <button
                                      aria-expanded={isExpanded}
                                      aria-label={t(
                                        'toggleNeedsReferenceUsage',
                                        {
                                          needsReference: ref.text,
                                        },
                                      )}
                                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-secondary-500 transition-colors hover:bg-secondary-100 hover:text-secondary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:text-secondary-400 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                                      onClick={() =>
                                        setExpandedNeedsReferenceId(current =>
                                          current === ref.id ? null : ref.id,
                                        )
                                      }
                                      type="button"
                                    >
                                      <ChevronRight
                                        aria-hidden="true"
                                        className={`h-4 w-4 transition-transform ${
                                          isExpanded ? 'rotate-90' : ''
                                        }`}
                                      />
                                    </button>
                                  </td>
                                  <td className="max-w-xs px-3 py-3 font-medium text-secondary-900 dark:text-secondary-100">
                                    {ref.text}
                                  </td>
                                  <td className="max-w-md px-3 py-3 text-secondary-600 dark:text-secondary-300">
                                    {ref.description ? (
                                      ref.description
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                                        <AlertTriangle
                                          aria-hidden="true"
                                          className="h-3.5 w-3.5"
                                        />
                                        {t('missingNeedsReferenceDescription')}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-right text-secondary-700 dark:text-secondary-200">
                                    {linkedCount}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex justify-end gap-2">
                                      {canEditContent ? (
                                        <button
                                          aria-label={t('editNeedsReference')}
                                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-secondary-200 text-secondary-700 transition-colors hover:bg-secondary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                                          onClick={() => {
                                            const nextForm = {
                                              description:
                                                ref.description ?? '',
                                              id: ref.id,
                                              text: ref.text,
                                            }
                                            setNeedsReferenceError(null)
                                            setNeedsReferenceForm(nextForm)
                                            setNeedsReferenceFormBaseline(
                                              needsReferenceFormSignature(
                                                nextForm,
                                              ),
                                            )
                                          }}
                                          type="button"
                                        >
                                          <Pencil
                                            aria-hidden="true"
                                            className="h-4 w-4"
                                          />
                                        </button>
                                      ) : null}
                                      {canEditContent ? (
                                        <button
                                          aria-label={t('deleteNeedsReference')}
                                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-red-200 text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/20"
                                          disabled={linkedCount > 0}
                                          onClick={event =>
                                            void handleDeleteNeedsReference(
                                              ref,
                                              event.currentTarget as HTMLElement,
                                            )
                                          }
                                          title={
                                            linkedCount > 0
                                              ? t(
                                                  'deleteNeedsReferenceDisabled',
                                                )
                                              : t('deleteNeedsReference')
                                          }
                                          type="button"
                                        >
                                          <Trash2
                                            aria-hidden="true"
                                            className="h-4 w-4"
                                          />
                                        </button>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                                {isExpanded ? (
                                  <tr>
                                    <td
                                      className="bg-secondary-50/70 px-3 py-3 dark:bg-secondary-900/60"
                                      colSpan={5}
                                    >
                                      {needsReferenceUsageLoading ? (
                                        <p
                                          className="text-sm text-secondary-500 dark:text-secondary-400"
                                          role="status"
                                        >
                                          {tc('loading')}
                                        </p>
                                      ) : needsReferenceUsageError ? (
                                        <p
                                          className="text-sm text-red-700 dark:text-red-300"
                                          role="alert"
                                        >
                                          {needsReferenceUsageError}
                                        </p>
                                      ) : usage.length === 0 ? (
                                        <p className="text-sm text-secondary-500 dark:text-secondary-400">
                                          {t('noLinkedRequirements')}
                                        </p>
                                      ) : (
                                        <div className="overflow-x-auto">
                                          <table className="min-w-full text-sm">
                                            <thead className="text-left text-xs font-semibold uppercase tracking-[0.08em] text-secondary-500 dark:text-secondary-400">
                                              <tr>
                                                <th
                                                  className="px-2 py-1"
                                                  scope="col"
                                                >
                                                  {t('csvHeaders.uniqueId')}
                                                </th>
                                                <th
                                                  className="px-2 py-1"
                                                  scope="col"
                                                >
                                                  {t('csvHeaders.description')}
                                                </th>
                                                <th
                                                  className="px-2 py-1"
                                                  scope="col"
                                                >
                                                  {t('csvHeaders.type')}
                                                </th>
                                                <th
                                                  className="px-2 py-1"
                                                  scope="col"
                                                >
                                                  {t(
                                                    'csvHeaders.specificationItemStatus',
                                                  )}
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {usage.map(item => (
                                                <tr
                                                  key={item.itemRef ?? item.id}
                                                >
                                                  <td className="px-2 py-1 font-mono text-xs text-secondary-700 dark:text-secondary-200">
                                                    {item.uniqueId}
                                                  </td>
                                                  <td className="px-2 py-1 text-secondary-700 dark:text-secondary-200">
                                                    {item.version
                                                      ?.description ?? '—'}
                                                  </td>
                                                  <td className="px-2 py-1 text-secondary-600 dark:text-secondary-300">
                                                    {locale === 'sv'
                                                      ? (item.version
                                                          ?.typeNameSv ?? '—')
                                                      : (item.version
                                                          ?.typeNameEn ?? '—')}
                                                  </td>
                                                  <td className="px-2 py-1 text-secondary-600 dark:text-secondary-300">
                                                    {locale === 'sv'
                                                      ? (item.specificationItemStatusNameSv ??
                                                        '—')
                                                      : (item.specificationItemStatusNameEn ??
                                                        '—')}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : leftTab === 'rfi' ? (
                <div
                  className={desktopSplitPanelCardClassName}
                  data-specification-detail-list-panel="rfi"
                >
                  <div className={splitPanelHeaderClassName}>
                    {renderLeftPanelTabs()}
                  </div>
                  <SpecificationRfiListPanel
                    canEdit={canEditContent}
                    specificationId={specificationId}
                  />
                </div>
              ) : specificationItems.length === 0 &&
                !specificationItemsLoading &&
                !specificationItemsError ? (
                <div
                  className={desktopSplitPanelCardClassName}
                  data-specification-detail-list-panel="items"
                >
                  <div className={splitPanelHeaderClassName}>
                    {renderLeftPanelTabs()}
                    {renderEmptySpecificationActions()}
                  </div>
                  <div className="p-8 text-center text-sm text-secondary-500 dark:text-secondary-400">
                    {t('noItems')}
                  </div>
                </div>
              ) : (
                <div
                  className={desktopSplitPanelCardClassName}
                  data-specification-detail-list-panel="items"
                >
                  {specificationItemsError ? (
                    <div
                      className="m-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                      role="alert"
                    >
                      <p>{t('loadSpecificationItemsFailed')}</p>
                      <button
                        className="mt-2 min-h-6 min-w-6 rounded-md px-2 py-1 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        onClick={() => void retrySpecificationItems()}
                        ref={specificationItemsRetryRef}
                        type="button"
                      >
                        {tc('retry')}
                      </button>
                    </div>
                  ) : null}
                  {specificationItemsAnnouncement ? (
                    <p
                      className="mx-3 mt-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/30 dark:text-primary-100"
                      role="status"
                    >
                      {specificationItemsAnnouncement}
                    </p>
                  ) : null}
                  <RequirementsTable
                    areas={areas}
                    columnPickerPlacement="betweenActions"
                    defaultVisibleColumns={DEFAULT_LEFT_COLS}
                    expandedId={leftExpandedId}
                    filterValues={leftFilters}
                    floatingActionRailPlacement="inline-top"
                    floatingActions={[
                      ...(canEditContent
                        ? [
                            {
                              ariaLabel: t('newLocalRequirement'),
                              developerModeContext:
                                'requirements specification detail',
                              developerModeValue: 'new local requirement',
                              icon: (
                                <Plus aria-hidden="true" className="h-4 w-4" />
                              ),
                              id: 'create-local',
                              onClick: () =>
                                void handleOpenCreateLocalRequirementModal(),
                              position: 'beforeColumns' as const,
                              tooltip: t('newLocalRequirement'),
                              variant: 'primary' as const,
                            },
                          ]
                        : []),
                      {
                        ariaLabel: tc('moreActions'),
                        developerModeContext:
                          'requirements specification detail',
                        developerModeValue: 'more actions',
                        hidden: leftPanelMoreActionMenuItems.length === 0,
                        icon: (
                          <Ellipsis aria-hidden="true" className="h-4 w-4" />
                        ),
                        id: 'more-actions',
                        menuItems: leftPanelMoreActionMenuItems,
                        tooltip: tc('moreActions'),
                      },
                    ]}
                    getName={getName}
                    hasMore={specificationItemsHasMore}
                    loading={specificationItemsLoading}
                    loadingMore={specificationItemsLoadingMore}
                    locale={locale}
                    needsReferenceOptions={availableNeedsRefs}
                    normReferences={leftNormReferenceOptions}
                    onFilterChange={setLeftFilters}
                    onLoadMore={() => void loadMoreSpecificationItems()}
                    onNeedsReferenceChange={
                      canEditContent
                        ? handleNeedsReferenceAssignment
                        : undefined
                    }
                    onRowClick={id => {
                      const itemRef =
                        specificationItems.find(item => item.id === id)
                          ?.itemRef ?? null
                      setLeftExpandedItemRef(current =>
                        current === itemRef ? null : itemRef,
                      )
                    }}
                    onSelectionChange={handleLeftSelectionChange}
                    onSortChange={setLeftSort}
                    onSpecificationItemStatusChange={
                      canEditContent
                        ? handleSpecificationItemStatusChange
                        : undefined
                    }
                    onVisibleColumnsChange={setLeftVisibleCols}
                    renderExpanded={id => {
                      const item = specificationItems.find(r => r.id === id)
                      return (
                        <div className="space-y-3">
                          {item?.isSpecificationLocal &&
                          item.specificationLocalRequirementId != null ? (
                            <SpecificationLocalRequirementDetailClient
                              localRequirementId={
                                item.specificationLocalRequirementId
                              }
                              needsReferences={availableNeedsRefs}
                              onChange={async () => {
                                await Promise.all([
                                  fetchSpecificationItems(),
                                  fetchNeedsReferences(),
                                ])
                              }}
                              permissions={{
                                canEditContent,
                                canReviewDecisions:
                                  permissions.canReviewDecisions === true,
                              }}
                              specificationId={specificationId}
                              usageStatus={{
                                specificationItemStatusColor:
                                  item.specificationItemStatusColor ?? null,
                                specificationItemStatusIconName:
                                  item.specificationItemStatusIconName ?? null,
                                specificationItemStatusId:
                                  item.specificationItemStatusId ?? null,
                                specificationItemStatusNameEn:
                                  item.specificationItemStatusNameEn ?? null,
                                specificationItemStatusNameSv:
                                  item.specificationItemStatusNameSv ?? null,
                              }}
                            />
                          ) : item?.specificationItemId != null ? (
                            <RequirementDetailClient
                              inline
                              onChange={async () => {
                                await fetchSpecificationItems()
                              }}
                              onRemoveFromSpecification={
                                canEditContent &&
                                item.itemRef &&
                                !item.isSpecificationLocal
                                  ? anchorEl =>
                                      handleRemoveItems([item], anchorEl)
                                  : undefined
                              }
                              removeFromSpecificationDisabled={
                                bulkActionResolving || bulkActionSaving
                              }
                              requirementId={id}
                              specificationId={specificationId}
                              specificationItemId={item.specificationItemId}
                              specificationPermissions={{
                                canEditContent,
                                canReviewDecisions:
                                  permissions.canReviewDecisions === true,
                              }}
                            />
                          ) : (
                            <RequirementDetailClient
                              inline
                              onChange={async () => {
                                await fetchSpecificationItems()
                              }}
                              requirementId={id}
                            />
                          )}
                        </div>
                      )
                    }}
                    requirementPackages={specificationRequirementPackages}
                    rows={filteredSpecificationItems}
                    selectable={canEditContent}
                    selectedIds={leftSelectedIds}
                    showSelectAll={false}
                    sortState={leftSort}
                    specificationItemStatuses={specificationItemStatuses}
                    statusRow={
                      leftSelectedItemRefs.size > 0 ? (
                        <div
                          className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs ${
                            selectionActionLimitExceeded
                              ? 'border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/50 dark:text-amber-100'
                              : 'border-primary-200 bg-primary-50 text-primary-900 dark:border-primary-900/60 dark:bg-primary-950/30 dark:text-primary-100'
                          }`}
                          {...devMarker({
                            context: 'requirements specification detail',
                            name: 'selection status',
                            priority: 305,
                            value: 'selected specification items',
                          })}
                          role="status"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            {selectionActionLimitExceeded ? (
                              <AlertTriangle
                                aria-hidden="true"
                                className="mt-0.5 h-4 w-4 shrink-0"
                              />
                            ) : null}
                            <div>
                              <span>
                                {selectionActionLimitWarning ??
                                  `${t('selectionStatus', {
                                    hidden:
                                      hiddenSelectedSpecificationItems.length,
                                    total: leftSelectedItemRefs.size,
                                  })} ${t('selectionActionsAffectAll')}`}
                              </span>
                              {selectionNotice ? (
                                <p className="mt-1 font-medium">
                                  {selectionNotice}
                                </p>
                              ) : null}
                              {bulkNeedsReferenceError &&
                              !showBulkNeedsReferenceModal ? (
                                <p
                                  className="mt-1 font-medium text-red-700 dark:text-red-300"
                                  role="alert"
                                >
                                  {bulkNeedsReferenceError}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {hiddenSelectedSpecificationItems.length > 0 ? (
                            <button
                              className="min-h-6 min-w-6 rounded-md px-2 py-1 font-medium underline underline-offset-2 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-primary-900/50"
                              onClick={deselectHiddenSpecificationItems}
                              type="button"
                            >
                              {t('deselectHidden', {
                                count: hiddenSelectedSpecificationItems.length,
                              })}
                            </button>
                          ) : null}
                        </div>
                      ) : selectionNotice || bulkNeedsReferenceError ? (
                        <div
                          className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"
                          role="status"
                        >
                          {selectionNotice ?? bulkNeedsReferenceError}
                        </div>
                      ) : null
                    }
                    stickyTitle={renderLeftPanelTabs()}
                    stickyTitleActions={
                      leftSelectedItemRefs.size > 0 && canEditContent ? (
                        <>
                          <button
                            aria-label={t('assignNeedsReferenceAction')}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-secondary-300 text-secondary-700 transition-colors hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                            disabled={
                              selectionActionLimitExceeded ||
                              bulkActionResolving ||
                              bulkActionSaving
                            }
                            {...devMarker({
                              context: 'requirements specification detail',
                              name: 'selection action',
                              priority: 310,
                              value: 'assign needs reference',
                            })}
                            onClick={() => void openBulkNeedsReferenceModal()}
                            title={
                              selectionActionLimitWarning ??
                              t('assignNeedsReferenceAction')
                            }
                            type="button"
                          >
                            <Link2 aria-hidden="true" className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={t('clearNeedsReferenceAction')}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-secondary-300 text-secondary-700 transition-colors hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                            disabled={
                              selectionActionLimitExceeded ||
                              bulkActionResolving ||
                              bulkActionSaving
                            }
                            {...devMarker({
                              context: 'requirements specification detail',
                              name: 'selection action',
                              priority: 311,
                              value: 'clear needs reference',
                            })}
                            onClick={event =>
                              void handleClearNeedsReferences(
                                event.currentTarget as HTMLElement,
                              )
                            }
                            title={
                              selectionActionLimitWarning ??
                              t('clearNeedsReferenceAction')
                            }
                            type="button"
                          >
                            <Link2Off aria-hidden="true" className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={td('requestDeviationSelected', {
                              count: leftSelectedItemRefs.size,
                            })}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-amber-300 text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-700/60 dark:text-amber-400 dark:hover:bg-amber-950/20"
                            disabled={
                              selectionActionLimitExceeded ||
                              bulkActionResolving ||
                              bulkActionSaving
                            }
                            {...devMarker({
                              context: 'requirements specification detail',
                              name: 'selection action',
                              priority: 312,
                              value: 'request deviations',
                            })}
                            onClick={() => void openBulkDeviationModal()}
                            title={
                              selectionActionLimitWarning ??
                              td('requestDeviationSelected', {
                                count: leftSelectedItemRefs.size,
                              })
                            }
                            type="button"
                          >
                            <AlertTriangle
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          </button>
                          <button
                            aria-label={t('removeSelected', {
                              count: leftSelectedItemRefs.size,
                            })}
                            className="btn-destructive inline-flex h-11 w-11 items-center justify-center rounded-lg px-0 py-0 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={
                              selectionActionLimitExceeded ||
                              bulkActionResolving ||
                              bulkActionSaving
                            }
                            {...devMarker({
                              context: 'requirements specification detail',
                              name: 'selection action',
                              priority: 313,
                              value: 'remove selected items',
                            })}
                            onClick={event =>
                              void handleRemoveSelected(
                                event.currentTarget as HTMLElement,
                              )
                            }
                            title={
                              selectionActionLimitWarning ??
                              t('removeSelected', {
                                count: leftSelectedItemRefs.size,
                              })
                            }
                            type="button"
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </>
                      ) : null
                    }
                    stickyTopOffsetClassName={
                      specificationDetailStickyTopOffsetClassName
                    }
                    visibleColumns={leftVisibleCols}
                    wrapDescription
                  />
                  {specificationItemsContinuationError ? (
                    <div
                      className="m-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                      role="alert"
                    >
                      <p>
                        {specificationItemsContinuationError === 'recovery'
                          ? t('paginationRecoveryFailed')
                          : t('paginationContinuationFailed')}
                      </p>
                      <button
                        className="mt-2 min-h-6 min-w-6 rounded-md px-2 py-1 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        onClick={() => void retrySpecificationItems()}
                        ref={specificationItemsRetryRef}
                        type="button"
                      >
                        {tc('retry')}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
              <DeviationFormModal
                affectedRequirementIds={bulkDeviationItems.map(
                  item => item.uniqueId,
                )}
                loading={bulkDeviationSaving}
                onClose={() => {
                  setShowBulkDeviationModal(false)
                  setBulkDeviationError(null)
                }}
                onSubmit={handleBulkDeviation}
                open={showBulkDeviationModal}
              />
              <BulkNeedsReferenceModal
                affectedRequirementIds={bulkNeedsReferenceItems.map(
                  item => item.uniqueId,
                )}
                error={bulkNeedsReferenceError}
                loading={bulkActionSaving}
                needsReferences={availableNeedsRefs}
                onClose={() => {
                  if (bulkActionSaving) return
                  setShowBulkNeedsReferenceModal(false)
                }}
                onSubmit={needsReferenceId =>
                  void applyBulkNeedsReference(
                    needsReferenceId,
                    bulkNeedsReferenceItems,
                  )
                }
                open={showBulkNeedsReferenceModal}
              />
              {bulkDeviationError && showBulkDeviationModal && (
                <div
                  className="fixed bottom-6 left-1/2 z-60 -translate-x-1/2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg dark:border-red-900/60 dark:bg-red-950/90 dark:text-red-300"
                  role="alert"
                >
                  {bulkDeviationError}
                </div>
              )}
            </div>

            {/* Right panel: Tillgängliga krav / Kravurvalsfrågor */}
            <div className="flex flex-col gap-3 xl:h-full xl:min-h-0 xl:overflow-hidden">
              <div
                aria-labelledby={
                  rightPanelTab === 'available'
                    ? 'right-panel-tab-available'
                    : 'right-panel-tab-questions'
                }
                className={desktopSplitPanelCardClassName}
                data-specification-detail-list-panel="available"
                id={
                  rightPanelTab === 'available'
                    ? 'right-panel-available'
                    : 'right-panel-questions'
                }
                role="tabpanel"
              >
                {rightPanelTab === 'available' ? (
                  <>
                    {shouldShowRequirementSelectionEmptyWarning && (
                      <div
                        className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
                        role="status"
                      >
                        {t('requirementSelectionNoPublishedMatches')}
                      </div>
                    )}
                    <RequirementsTable
                      areas={areas}
                      defaultVisibleColumns={DEFAULT_RIGHT_COLS}
                      excludeColumns={[
                        'needsReference',
                        'specificationItemStatus',
                      ]}
                      expandedId={rightExpandedId}
                      filterValues={rightFilters}
                      floatingActionRailPlacement="inline-top"
                      getName={getName}
                      hasMore={rightHasMore}
                      loadingMore={rightLoadingMore}
                      locale={locale}
                      normReferences={rightNormReferenceOptions}
                      onFilterChange={newFilters => {
                        // Strip statuses — always fixed to published
                        const { statuses: _s, ...rest } = newFilters
                        setRightFilters(rest)
                      }}
                      onLoadMore={loadMoreAvailable}
                      onRowClick={id =>
                        setRightExpandedId(prev => (prev === id ? null : id))
                      }
                      onSelectionChange={setRightSelectedIds}
                      onSortChange={setRightSort}
                      onVisibleColumnsChange={setRightVisibleCols}
                      renderExpanded={id => (
                        <RequirementDetailClient inline requirementId={id} />
                      )}
                      requirementPackages={requirementPackages}
                      rows={rightRows}
                      selectable
                      selectedIds={rightSelectedIds}
                      sortState={rightSort}
                      stickyTitle={renderRightPanelTabs()}
                      stickyTitleActions={
                        <div className="flex flex-wrap items-center gap-2">
                          {hasRequirementSelectionAnswers && (
                            <RequirementSelectionFilterToggle
                              checked={isRequirementSelectionToggleChecked}
                              disabled={isRequirementSelectionToggleDisabled}
                              label={t(
                                'filterWithRequirementSelectionQuestions',
                              )}
                              onToggle={handleRequirementSelectionFilterToggle}
                              title={
                                isRequirementSelectionToggleDisabled
                                  ? t(
                                      'requirementSelectionFilterDisabledTooltip',
                                    )
                                  : undefined
                              }
                            />
                          )}
                          {rightSelectedIds.size > 0 && canEditContent ? (
                            <button
                              className="btn-primary inline-flex items-center gap-1.5"
                              onClick={handleOpenAddModal}
                              type="button"
                            >
                              <Plus aria-hidden="true" className="h-4 w-4" />
                              {t('addSelectedToSpecification', {
                                count: rightSelectedIds.size,
                              })}
                            </button>
                          ) : null}
                        </div>
                      }
                      stickyTopOffsetClassName={
                        specificationDetailStickyTopOffsetClassName
                      }
                      visibleColumns={rightVisibleCols}
                      wrapDescription
                    />
                  </>
                ) : (
                  <>
                    <div className={splitPanelHeaderClassName}>
                      {renderRightPanelTabs()}
                    </div>
                    <SpecificationRequirementSelectionPanel
                      onChanged={() => {
                        if (applyRequirementSelectionFilter) {
                          setRightSelectedIds(new Set())
                        }
                        void availableRequirementsResource.reload()
                      }}
                      specificationId={specificationId}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <SpecificationFormModal
        developerModeContext="requirements specification detail"
        governanceObjectTypes={specificationGovernanceObjectTypes}
        implementationTypes={specificationImplementationTypes}
        lifecycleStatuses={specificationLifecycleStatuses}
        mode="edit"
        onClose={() => setShowEditSpecificationForm(false)}
        onResponsibleChanged={updatedSpec => {
          setSpec(current =>
            current
              ? {
                  ...current,
                  responsibleDisplayName: updatedSpec.responsibleDisplayName,
                  responsibleHsaId: updatedSpec.responsibleHsaId,
                }
              : current,
          )
        }}
        onSaved={async () => {
          setShowEditSpecificationForm(false)
          await fetchSpecificationMeta()
        }}
        open={showEditSpecificationForm}
        spec={spec}
        specificationId={specificationId}
      />
      {addModal}
      {createLocalRequirementModal}
      <LazyAiRequirementGenerator
        aiGenerationAvailability={initialData.aiGenerationAvailability}
        mode="specification-local"
        onClose={() => setShowAiLocalRequirementsModal(false)}
        onImportPreview={(payload, options) => {
          setAiLocalRequirementsInitialImport({
            key: `ai-local-${Date.now()}`,
            payload,
            preview: options.preview,
          })
          importReturnFocusTargetRef.current = aiReturnFocusTargetRef.current
          setShowAiLocalRequirementsModal(false)
          setShowImportLocalRequirementsModal(true)
        }}
        open={showAiLocalRequirementsModal}
        returnFocusTarget={aiReturnFocusTargetRef.current}
        specificationId={specificationId}
      />
      <LazyRequirementsImportDialog
        destinationName={spec.name}
        initialImport={aiLocalRequirementsInitialImport}
        mode="specification-local"
        needsReferences={availableNeedsRefs}
        onClose={importSucceeded => {
          setAiLocalRequirementsInitialImport(null)
          void handleImportLocalRequirementsClose(importSucceeded)
        }}
        open={showImportLocalRequirementsModal}
        returnFocusTarget={importReturnFocusTargetRef.current}
        specificationId={specificationId}
      />
      {needsReferenceFormModal}
      {generatedOutputDownload.dialog}
    </>
  )
}
