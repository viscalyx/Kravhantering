'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertTriangle,
  ChevronRight,
  Download,
  HelpCircle,
  Pencil,
  Plus,
  Printer,
  Trash2,
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
import SpecificationRequirementSelectionPanel from '@/app/[locale]/specifications/[slug]/specification-requirement-selection-panel'
import SpecificationFormModal from '@/app/[locale]/specifications/specification-form-modal'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import RequirementsTable from '@/components/RequirementsTable'
import { useServerPdfDownload } from '@/components/reports/pdf/useServerPdfDownload'
import SpecificationLocalRequirementDetailClient from '@/components/SpecificationLocalRequirementDetailClient'
import SpecificationLocalRequirementForm, {
  type SpecificationLocalRequirementSubmitPayload,
} from '@/components/SpecificationLocalRequirementForm'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { Link, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { exportToCsv } from '@/lib/export-csv'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { formatActorDisplayNameForLocale } from '@/lib/privacy/display-name'
import { dialogPanelMotion, fadeMotion } from '@/lib/reduced-motion'
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
  SpecificationListItem,
  SpecificationMeta,
  SpecificationNeedsReference,
  SpecificationTaxonomyItem,
} from '@/lib/specifications/preload-types'
import { createUtf8BomBlob } from '@/lib/text-export'

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

const PAGE_SIZE = 200

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
type SpecificationDetailLeftTab = 'items' | 'needs-references'

interface NeedsReferenceFormState {
  description: string
  id: number | null
  text: string
}

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

function buildItemRefsQuery(rows: RequirementRow[]) {
  const refs = rows
    .map(row => row.itemRef)
    .filter((value): value is string => typeof value === 'string')

  return refs.map(ref => encodeURIComponent(ref)).join(',')
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
  specificationSlug,
}: {
  initialData: RequirementsSpecificationDetailInitialData
  specificationSlug: string
}) {
  useHelpContent(REQUIREMENT_SPECIFICATION_DETAIL_HELP)
  const t = useTranslations('specification')
  const tc = useTranslations('common')
  const td = useTranslations('deviation')
  const tr = useTranslations('reports')
  const locale = useLocale()
  const router = useRouter()
  const { confirm } = useConfirmModal()
  const searchParams = useSearchParams()
  const shouldReduceMotion = useReducedMotion()
  const preFilterAreaId = searchParams.get('areaId')
    ? Number(searchParams.get('areaId'))
    : null
  const initialLeftTab: SpecificationDetailLeftTab =
    searchParams.get('leftTab') === 'needs-references'
      ? 'needs-references'
      : 'items'

  const [spec, setSpec] = useState<SpecificationMeta | null>(initialData.spec)
  const [specificationItems, setSpecificationItems] = useState<
    SpecificationListItem[]
  >(initialData.specificationItems)
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

  // Left panel state
  const [leftSelectedIds, setLeftSelectedIds] = useState<Set<number>>(new Set())
  const [leftExpandedId, setLeftExpandedId] = useState<number | null>(null)
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
  const [rightLoadingMore, setRightLoadingMore] = useState(false)
  const [loadMoreWarning, setLoadMoreWarning] = useState<string | null>(null)
  const [rightVisibleCols, setRightVisibleCols] =
    useState<RequirementColumnId[]>(DEFAULT_RIGHT_COLS)
  const [columnPreferencesLoaded, setColumnPreferencesLoaded] = useState(false)

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCreateLocalRequirementModal, setShowCreateLocalRequirementModal] =
    useState(false)
  const [pendingAddIds, setPendingAddIds] = useState<number[]>([])
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
  const [needsReferenceForm, setNeedsReferenceForm] =
    useState<NeedsReferenceFormState | null>(null)
  const [needsReferenceSaving, setNeedsReferenceSaving] = useState(false)
  const [needsReferenceError, setNeedsReferenceError] = useState<string | null>(
    null,
  )
  const [bulkNeedsReferenceId, setBulkNeedsReferenceId] = useState<string>('')
  const [bulkNeedsReferenceError, setBulkNeedsReferenceError] = useState<
    string | null
  >(null)
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [addModalLoading, setAddModalLoading] = useState(false)
  const [addModalError, setAddModalError] = useState<string | null>(null)
  const pdfDownload = useServerPdfDownload()

  const availableRequirementsParams = useMemo(() => {
    const params = buildRequirementListParams({
      filters: rightFilters,
      limit: PAGE_SIZE,
      locale,
      sort: rightSort,
    })
    if (applyRequirementSelectionFilter) {
      params.set('applyRequirementSelectionFilter', 'true')
    }
    return params.toString()
  }, [applyRequirementSelectionFilter, locale, rightFilters, rightSort])
  const availableRequirementsKeyRef = useRef(availableRequirementsParams)

  const specResource = useAsyncResource<SpecificationMeta | null>({
    fetcher: async signal => {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationSlug}`,
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
    key: `specification:${specificationSlug}`,
    loadOnMount: false,
  })

  const specificationItemsResource = useAsyncResource<SpecificationListItem[]>({
    fetcher: async signal => {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationSlug}/items`,
        { signal },
      )
      const data = await readJsonOrThrow<{ items?: SpecificationListItem[] }>(
        response,
        t('loadSpecificationItemsFailed'),
      )
      return data.items ?? []
    },
    getErrorMessage: error =>
      error instanceof Error
        ? error.message
        : t('loadSpecificationItemsFailed'),
    initialData: initialData.specificationItems,
    key: `specification-items:${specificationSlug}`,
    loadOnMount: false,
  })

  const availableRequirementsResource =
    useAsyncResource<AvailableRequirementsData>({
      fetcher: async signal => {
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationSlug}/available-requirements?${availableRequirementsParams}`,
          { signal },
        )
        const data = await readJsonOrThrow<{
          pagination?: { hasMore?: boolean }
          requirements?: RequirementRow[]
          selectionFilter?: AvailableRequirementsData['selectionFilter']
        }>(response, t('loadAvailableRequirementsFailed'))
        return {
          hasMore: data.pagination?.hasMore ?? false,
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
        `/api/requirements-specifications/${specificationSlug}/needs-references`,
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
    key: `specification-needs-references:${specificationSlug}`,
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

  const loading = specResource.loading || specificationItemsResource.loading
  const loadWarning =
    loadMoreWarning ??
    specResource.refreshError ??
    specificationItemsResource.refreshError ??
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
    if (specificationItemsResource.data) {
      setSpecificationItems(specificationItemsResource.data)
    }
  }, [specificationItemsResource.data])

  useEffect(() => {
    if (
      availableRequirementsResource.data &&
      !availableRequirementsResource.refreshing &&
      !availableRequirementsResource.refreshError
    ) {
      setAvailableRows(availableRequirementsResource.data.rows)
      setRightHasMore(availableRequirementsResource.data.hasMore)
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

  const closeAddModal = useCallback(() => {
    if (addModalLoading) return
    setOpenHelp(new Set())
    setAddModalError(null)
    setShowAddModal(false)
  }, [addModalLoading])

  const closeCreateLocalRequirementModal = useCallback(async () => {
    const confirmed = await confirm({
      message: tc('unsavedChangesConfirm'),
      variant: 'danger',
      icon: 'warning',
    })
    if (confirmed) {
      setShowCreateLocalRequirementModal(false)
    }
  }, [confirm, tc])

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
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-secondary-400 dark:hover:text-primary-400 dark:disabled:hover:text-secondary-400"
      disabled={disabled}
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
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

  const selectedSpecificationItems = useMemo(
    () => specificationItems.filter(item => leftSelectedIds.has(item.id)),
    [leftSelectedIds, specificationItems],
  )

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
      const refreshed = await specificationItemsResource.reload()
      if (refreshed === undefined) {
        if (throwOnError) {
          throw new Error(t('loadSpecificationItemsFailed'))
        }
        return false
      }
      return true
    },
    [specificationItemsResource, t],
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
    if (rightLoadingMore || !rightHasMore) return
    const activeKey = availableRequirementsKeyRef.current
    setRightLoadingMore(true)
    try {
      const params = buildRequirementListParams({
        filters: rightFilters,
        limit: PAGE_SIZE,
        locale,
        offset: availableRows.length,
        sort: rightSort,
      })
      if (applyRequirementSelectionFilter) {
        params.set('applyRequirementSelectionFilter', 'true')
      }
      const data = await readJsonOrThrow<{
        requirements?: RequirementRow[]
        pagination?: { hasMore?: boolean }
      }>(
        await apiFetch(
          `/api/requirements-specifications/${specificationSlug}/available-requirements?${params}`,
        ),
        t('loadAvailableRequirementsFailed'),
      )
      if (activeKey !== availableRequirementsKeyRef.current) return
      setLoadMoreWarning(null)
      setAvailableRows(prev => [...prev, ...(data.requirements ?? [])])
      setRightHasMore(data.pagination?.hasMore ?? false)
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
    availableRows.length,
    locale,
    rightFilters,
    rightHasMore,
    rightLoadingMore,
    rightSort,
    specificationSlug,
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
    setAddNeedsRefMode('none')
    setAddNeedsRefId('')
    setAddNeedsRefText('')
    setAddNeedsRefDescription('')
    setAddModalError(null)
    setOpenHelp(new Set())
    setShowAddModal(true)
    await needsReferencesResource.reload()
  }, [needsReferencesResource, rightSelectedIds])

  const handleOpenCreateLocalRequirementModal = useCallback(async () => {
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
        `/api/requirements-specifications/${specificationSlug}/items`,
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
    specificationSlug,
    pendingAddIds,
    tc,
  ])

  const handleCreateLocalRequirement = useCallback(
    async (payload: SpecificationLocalRequirementSubmitPayload) => {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationSlug}/local-requirements`,
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

      setShowCreateLocalRequirementModal(false)
      await fetchSpecificationItems({ throwOnError: true })
    },
    [fetchSpecificationItems, specificationSlug, tc],
  )

  const handleSaveNeedsReference = useCallback(async () => {
    if (!needsReferenceForm) return
    setNeedsReferenceSaving(true)
    setNeedsReferenceError(null)
    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationSlug}/needs-references`,
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
    specificationSlug,
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
        `/api/requirements-specifications/${specificationSlug}/needs-references`,
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
    [confirm, fetchNeedsReferences, specificationSlug, t, tc],
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
          `/api/requirements-specifications/${specificationSlug}/items/${encodeURIComponent(
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
      specificationSlug,
    ],
  )

  const handleBulkNeedsReferenceAssignment = useCallback(async () => {
    const itemRefs = selectedSpecificationItems
      .map(item => item.itemRef)
      .filter((value): value is string => typeof value === 'string')
    if (itemRefs.length === 0) return

    const needsReferenceId =
      bulkNeedsReferenceId === '' ? null : Number(bulkNeedsReferenceId)
    setBulkNeedsReferenceError(null)

    try {
      const response = await apiFetch(
        `/api/requirements-specifications/${specificationSlug}/items`,
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

      setLeftSelectedIds(new Set())
      setBulkNeedsReferenceId('')
      setBulkNeedsReferenceError(null)
      await Promise.all([fetchSpecificationItems(), fetchNeedsReferences()])
    } catch (error) {
      setBulkNeedsReferenceError(
        error instanceof Error ? error.message : tc('error'),
      )
    }
  }, [
    bulkNeedsReferenceId,
    fetchNeedsReferences,
    fetchSpecificationItems,
    selectedSpecificationItems,
    specificationSlug,
    tc,
  ])

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

  const handleRemoveSelected = useCallback(
    async (anchorEl?: HTMLElement) => {
      if (selectedSpecificationItems.length === 0) return

      const libraryCount = selectedSpecificationItems.filter(
        item => !item.isSpecificationLocal,
      ).length
      const specificationLocalCount =
        selectedSpecificationItems.length - libraryCount

      const confirmed = await confirm({
        anchorEl,
        confirmText: tc('delete'),
        icon: 'caution',
        message:
          specificationLocalCount === 0
            ? t('removeConfirm', { count: libraryCount })
            : libraryCount === 0
              ? t('removeSpecificationLocalConfirm', {
                  count: specificationLocalCount,
                })
              : t('removeMixedConfirm', {
                  libraryCount,
                  specificationLocalCount,
                }),
        title:
          specificationLocalCount === 0
            ? t('removeSelected', { count: libraryCount })
            : libraryCount === 0
              ? t('removeSpecificationLocalConfirmTitle')
              : t('removeMixedConfirmTitle'),
        variant: 'danger',
      })

      if (!confirmed) return

      const itemRefs = selectedSpecificationItems
        .map(item => item.itemRef)
        .filter((value): value is string => typeof value === 'string')

      if (itemRefs.length === 0) return

      try {
        const response = await apiFetch(
          `/api/requirements-specifications/${specificationSlug}/items`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemRefs }),
          },
        )

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          console.error(
            'Failed to remove items from specification',
            body?.error ?? response.statusText,
          )
          return
        }
      } catch (error) {
        console.error('Failed to remove items from specification', error)
        return
      }

      const removedIds = new Set(
        selectedSpecificationItems.map(item => item.id),
      )
      setLeftSelectedIds(new Set())
      setLeftExpandedId(current =>
        current != null && removedIds.has(current) ? null : current,
      )
      setLeftFilters(prev => {
        if (
          !prev.requirementPackageIds ||
          prev.requirementPackageIds.length === 0
        ) {
          return prev
        }

        const remainingRequirementPackageIds = new Set(
          specificationItems
            .filter(item => !removedIds.has(item.id))
            .flatMap(item => item.requirementPackageIds ?? []),
        )
        const stillValid = prev.requirementPackageIds.filter(id =>
          remainingRequirementPackageIds.has(id),
        )

        if (stillValid.length === prev.requirementPackageIds.length) {
          return prev
        }

        return {
          ...prev,
          requirementPackageIds: stillValid.length > 0 ? stillValid : undefined,
        }
      })

      await Promise.all([
        fetchSpecificationItems(),
        fetchAvailableRequirements(),
      ])
    },
    [
      confirm,
      fetchAvailableRequirements,
      fetchSpecificationItems,
      specificationItems,
      specificationSlug,
      selectedSpecificationItems,
      t,
      tc,
    ],
  )

  const handleBulkDeviation = useCallback(
    async (motivation: string) => {
      if (leftSelectedIds.size === 0) return
      setBulkDeviationSaving(true)
      setBulkDeviationError(null)
      try {
        const items = specificationItems.filter(item =>
          leftSelectedIds.has(item.id),
        )
        const results = await Promise.allSettled(
          items
            .filter(item => item.itemRef)
            .map(item =>
              apiFetch(
                `/api/specification-item-deviations/${encodeURIComponent(item.itemRef ?? '')}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ motivation }),
                },
              ).then(async res => {
                if (!res.ok) {
                  throw new Error(`Failed for item ${item.itemRef}`)
                }
                return item.id
              }),
            ),
        )
        const succeededIds = new Set(
          results
            .filter(
              (r): r is PromiseFulfilledResult<number> =>
                r.status === 'fulfilled',
            )
            .map(r => r.value),
        )
        const failedCount = results.filter(r => r.status === 'rejected').length
        setLeftSelectedIds(prev => {
          const next = new Set(prev)
          for (const id of succeededIds) next.delete(id)
          return next
        })
        if (failedCount > 0) {
          setBulkDeviationError(
            td('bulkDeviationPartialFail', { count: failedCount }),
          )
        } else {
          setShowBulkDeviationModal(false)
        }
        await fetchSpecificationItems()
      } finally {
        setBulkDeviationSaving(false)
      }
    },
    [fetchSpecificationItems, leftSelectedIds, specificationItems, td],
  )

  const getName = (opt: { nameSv: string; nameEn: string }) =>
    locale === 'sv' ? opt.nameSv : opt.nameEn

  // Filter right panel rows to exclude already-added items
  const rightRows = useMemo(
    () => availableRows.filter(r => !specificationItemIds.has(r.id)),
    [availableRows, specificationItemIds],
  )

  // Filter left panel rows client-side (all items loaded at once)
  const filteredSpecificationItems = useMemo(() => {
    let rows = specificationItems
    if (leftFilters.areaIds && leftFilters.areaIds.length > 0) {
      const areaSet = new Set(leftFilters.areaIds)
      rows = rows.filter(
        r =>
          r.area &&
          areaSet.has(areas.find(a => a.name === r.area?.name)?.id ?? -1),
      )
    }
    if (
      leftFilters.needsReferenceIds &&
      leftFilters.needsReferenceIds.length > 0
    ) {
      const refSet = new Set(leftFilters.needsReferenceIds)
      rows = rows.filter(
        r => r.needsReferenceId != null && refSet.has(r.needsReferenceId),
      )
    }
    if (
      leftFilters.requirementPackageIds &&
      leftFilters.requirementPackageIds.length > 0
    ) {
      const requirementPackageSet = new Set(leftFilters.requirementPackageIds)
      rows = rows.filter(r =>
        r.requirementPackageIds?.some(id => requirementPackageSet.has(id)),
      )
    }
    if (
      leftFilters.normReferenceIds &&
      leftFilters.normReferenceIds.length > 0
    ) {
      if (leftNormReferenceOptions.length > 0) {
        const filterDbIds = new Set(leftFilters.normReferenceIds)
        const matchingTextIds = new Set(
          leftNormReferenceOptions
            .filter(nr => filterDbIds.has(nr.id))
            .map(nr => nr.normReferenceId),
        )
        rows = rows.filter(r =>
          r.normReferenceIds?.some(textId => matchingTextIds.has(textId)),
        )
      }
    }
    if (
      leftFilters.specificationItemStatusIds &&
      leftFilters.specificationItemStatusIds.length > 0
    ) {
      const statusSet = new Set(leftFilters.specificationItemStatusIds)
      rows = rows.filter(
        r =>
          r.specificationItemStatusId != null &&
          statusSet.has(r.specificationItemStatusId),
      )
    }
    return rows
  }, [specificationItems, leftFilters, areas, leftNormReferenceOptions])

  const needsReferenceUsageById = useMemo(() => {
    const usage = new Map<number, SpecificationListItem[]>()
    for (const item of specificationItems) {
      if (item.needsReferenceId == null) continue
      const existing = usage.get(item.needsReferenceId) ?? []
      existing.push(item)
      usage.set(item.needsReferenceId, existing)
    }
    return usage
  }, [specificationItems])

  // Only show requirements packages that appear on at least one item in the specification
  const specificationRequirementPackages = useMemo(() => {
    const usedIds = new Set(
      specificationItems.flatMap(r => r.requirementPackageIds ?? []),
    )
    return requirementPackages.filter(s => usedIds.has(s.id))
  }, [specificationItems, requirementPackages])

  const handleExportCsv = useCallback(() => {
    const headers = [
      t('csvHeaders.uniqueId'),
      t('csvHeaders.description'),
      t('csvHeaders.area'),
      t('csvHeaders.needsReference'),
      t('csvHeaders.status'),
      t('csvHeaders.category'),
      t('csvHeaders.type'),
      t('csvHeaders.qualityCharacteristic'),
      t('csvHeaders.specificationItemStatus'),
    ]
    const csvRows = filteredSpecificationItems.map(r => ({
      [headers[0]]: r.uniqueId,
      [headers[1]]: r.version?.description ?? '',
      [headers[2]]: r.area?.name ?? '',
      [headers[3]]: (r as SpecificationListItem).needsReference ?? '',
      [headers[4]]:
        (locale === 'sv' ? r.version?.statusNameSv : r.version?.statusNameEn) ??
        '',
      [headers[5]]:
        (locale === 'sv'
          ? r.version?.categoryNameSv
          : r.version?.categoryNameEn) ?? '',
      [headers[6]]:
        (locale === 'sv' ? r.version?.typeNameSv : r.version?.typeNameEn) ?? '',
      [headers[7]]:
        (locale === 'sv'
          ? r.version?.qualityCharacteristicNameSv
          : r.version?.qualityCharacteristicNameEn) ?? '',
      [headers[8]]:
        (locale === 'sv'
          ? r.specificationItemStatusNameSv
          : r.specificationItemStatusNameEn) ?? '',
    }))
    const csv = exportToCsv(headers, csvRows)
    const blob = createUtf8BomBlob(csv, 'text/csv;charset=utf-8;')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = t('downloadFilename')
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredSpecificationItems, locale, t])

  const handleDownloadPdf = useCallback(() => {
    if (!spec) return
    const refs = buildItemRefsQuery(filteredSpecificationItems)
    if (!refs) return
    const label = tr('listPdfFilenameLabel')
    void pdfDownload.download({
      fallbackFilename: `${label} ${spec.name} ${spec.uniqueId}.pdf`,
      url: `/${locale}/specifications/${encodeURIComponent(
        specificationSlug,
      )}/reports/pdf/list?refs=${refs}`,
    })
  }, [
    filteredSpecificationItems,
    locale,
    pdfDownload,
    specificationSlug,
    spec,
    tr,
  ])

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

  const localName = (obj: { nameSv: string; nameEn: string } | null) =>
    obj ? (locale === 'sv' ? obj.nameSv : obj.nameEn) : null

  // Add modal portal (issue 5)
  const addModal =
    showAddModal && typeof window !== 'undefined'
      ? createPortal(
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={closeAddModal}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                closeAddModal()
              }
            }}
            role="dialog"
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl p-6 space-y-4"
              onClick={e => e.stopPropagation()}
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
            {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on dialog */}
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => void closeCreateLocalRequirementModal()}
            />
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
                    {t('newLocalRequirement')}
                  </h2>
                </div>
                <button
                  aria-label={tc('close')}
                  className="rounded-lg p-1.5 transition-colors hover:bg-secondary-100 dark:hover:bg-secondary-800"
                  onClick={() => void closeCreateLocalRequirementModal()}
                  type="button"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>

              <SpecificationLocalRequirementForm
                needsReferences={availableNeedsRefs}
                onCancel={() => void closeCreateLocalRequirementModal()}
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
                aria-modal="true"
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                key="needs-reference-form-backdrop"
                onKeyDown={event => {
                  if (event.key === 'Escape' && !needsReferenceSaving) {
                    setNeedsReferenceForm(null)
                  }
                }}
                role="dialog"
                {...fadeMotion(shouldReduceMotion)}
              >
                {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled on dialog */}
                <div
                  className="absolute inset-0"
                  onClick={() => {
                    if (!needsReferenceSaving) {
                      setNeedsReferenceForm(null)
                    }
                  }}
                />
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
                        {needsReferenceForm.id == null
                          ? t('newNeedsReference')
                          : t('editNeedsReference')}
                      </h2>
                    </div>
                    <button
                      aria-label={tc('close')}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:bg-secondary-100 dark:hover:bg-secondary-800"
                      disabled={needsReferenceSaving}
                      onClick={() => setNeedsReferenceForm(null)}
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
                      <button
                        className="btn-primary"
                        disabled={
                          needsReferenceSaving ||
                          !needsReferenceForm.text.trim()
                        }
                        onClick={() => void handleSaveNeedsReference()}
                        type="button"
                      >
                        {needsReferenceSaving ? tc('saving') : tc('save')}
                      </button>
                      <button
                        className="min-h-11 rounded-xl border px-4 py-2.5 text-sm transition-colors hover:bg-secondary-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-secondary-800"
                        disabled={needsReferenceSaving}
                        onClick={() => setNeedsReferenceForm(null)}
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
  const specificationDetailStickyTopOffsetClassName = 'top-16 xl:top-0'
  const specificationDetailPagePaddingClassName =
    'px-4 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-7 lg:px-8 lg:pt-8'
  const splitPanelHeaderClassName = `sticky ${specificationDetailStickyTopOffsetClassName} z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-white/80 px-3 py-2 backdrop-blur-sm sm:flex-nowrap dark:bg-secondary-900/80`
  const leftPanelActionPillClassName =
    'inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary-600/80 bg-primary-700 text-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-primary-700 hover:bg-primary-800 hover:shadow-[0_14px_36px_-20px_rgba(67,56,202,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-primary-500/80 dark:bg-primary-600 dark:hover:border-primary-400 dark:hover:bg-primary-700 dark:focus-visible:ring-offset-secondary-950'
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
    setNeedsReferenceForm({
      description: '',
      id: null,
      text: '',
    })
  }
  const splitPanelTabsClassName =
    'inline-flex max-w-full shrink gap-1 overflow-x-auto rounded-full bg-secondary-100 p-1 shadow-inner dark:bg-secondary-950/80'
  const splitPanelTabClassName = (active: boolean) =>
    `inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 sm:px-6 sm:text-base ${
      active
        ? 'border-white bg-white text-secondary-900 shadow-sm dark:border-primary-500 dark:bg-primary-600 dark:text-white'
        : 'border-transparent text-secondary-700 hover:bg-white/70 hover:text-secondary-900 dark:text-secondary-300 dark:hover:bg-secondary-800/70 dark:hover:text-secondary-100'
    }`
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
        <span className="text-xs opacity-80">{specificationItems.length}</span>
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
                                            setNeedsReferenceError(null)
                                            setNeedsReferenceForm({
                                              description:
                                                ref.description ?? '',
                                              id: ref.id,
                                              text: ref.text,
                                            })
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
                                      {usage.length === 0 ? (
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
              ) : specificationItems.length === 0 ? (
                <div
                  className={desktopSplitPanelCardClassName}
                  data-specification-detail-list-panel="items"
                >
                  <div className={splitPanelHeaderClassName}>
                    {renderLeftPanelTabs()}
                    {canEditContent ? (
                      <button
                        aria-label={t('newLocalRequirement')}
                        className={leftPanelActionPillClassName}
                        {...devMarker({
                          context: 'requirements specification detail',
                          name: 'table action',
                          priority: 350,
                          value: 'create local requirement',
                        })}
                        onClick={() =>
                          void handleOpenCreateLocalRequirementModal()
                        }
                        title={t('newLocalRequirement')}
                        type="button"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">
                          {t('newLocalRequirement')}
                        </span>
                      </button>
                    ) : null}
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
                  <RequirementsTable
                    areas={areas}
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
                              developerModeValue: 'create local requirement',
                              icon: (
                                <Plus aria-hidden="true" className="h-4 w-4" />
                              ),
                              id: 'create-local',
                              onClick: () =>
                                void handleOpenCreateLocalRequirementModal(),
                              position: 'beforeColumns' as const,
                              variant: 'primary' as const,
                            },
                          ]
                        : []),
                      {
                        ariaLabel: tc('print'),
                        icon: (
                          <Printer aria-hidden="true" className="h-4 w-4" />
                        ),
                        id: 'print',
                        menuItems: [
                          {
                            href: `/specifications/${specificationSlug}/reports/print/list?refs=${buildItemRefsQuery(
                              filteredSpecificationItems,
                            )}`,
                            id: 'print-list',
                            label: t('printListReport'),
                          },
                          {
                            id: 'pdf-list',
                            label: t('downloadListReportPdf'),
                            onClick: () => void handleDownloadPdf(),
                          },
                        ],
                      },
                      {
                        ariaLabel: tc('export'),
                        icon: (
                          <Download aria-hidden="true" className="h-4 w-4" />
                        ),
                        id: 'export',
                        onClick: handleExportCsv,
                      },
                    ]}
                    getName={getName}
                    locale={locale}
                    needsReferenceOptions={availableNeedsRefs}
                    normReferences={leftNormReferenceOptions}
                    onFilterChange={setLeftFilters}
                    onNeedsReferenceChange={
                      canEditContent
                        ? handleNeedsReferenceAssignment
                        : undefined
                    }
                    onRowClick={id =>
                      setLeftExpandedId(prev => (prev === id ? null : id))
                    }
                    onSelectionChange={setLeftSelectedIds}
                    onSortChange={setLeftSort}
                    onSpecificationItemStatusChange={
                      canEditContent
                        ? handleSpecificationItemStatusChange
                        : undefined
                    }
                    onVisibleColumnsChange={setLeftVisibleCols}
                    renderExpanded={id => {
                      const item = specificationItems.find(r => r.id === id)
                      return item?.isSpecificationLocal &&
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
                          specificationSlug={specificationSlug}
                        />
                      ) : item?.specificationItemId != null ? (
                        <RequirementDetailClient
                          inline
                          onChange={async () => {
                            await fetchSpecificationItems()
                          }}
                          requirementId={id}
                          specificationItemId={item.specificationItemId}
                          specificationSlug={specificationSlug}
                        />
                      ) : (
                        <RequirementDetailClient
                          inline
                          onChange={async () => {
                            await fetchSpecificationItems()
                          }}
                          requirementId={id}
                        />
                      )
                    }}
                    requirementPackages={specificationRequirementPackages}
                    rows={filteredSpecificationItems}
                    selectable
                    selectedIds={leftSelectedIds}
                    sortState={leftSort}
                    specificationItemStatuses={specificationItemStatuses}
                    stickyTitle={renderLeftPanelTabs()}
                    stickyTitleActions={
                      leftSelectedIds.size > 0 && canEditContent ? (
                        <>
                          <div className="flex flex-wrap items-start gap-2">
                            <div className="flex min-w-0 flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <select
                                  aria-label={t('bulkNeedsReferenceLabel')}
                                  className="min-h-11 max-w-full rounded-lg border border-secondary-200 bg-white px-2 py-1.5 text-sm text-secondary-700 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
                                  onChange={event =>
                                    setBulkNeedsReferenceId(event.target.value)
                                  }
                                  value={bulkNeedsReferenceId}
                                >
                                  <option value="">{t('noNeedsRef')}</option>
                                  {availableNeedsRefs.map(ref => (
                                    <option key={ref.id} value={ref.id}>
                                      {ref.text}
                                    </option>
                                  ))}
                                </select>
                                {helpButton(
                                  'bulk-needs-reference',
                                  t('bulkNeedsReferenceLabel'),
                                )}
                              </div>
                              {helpPanel(
                                'bulkNeedsReferenceHelp',
                                'bulk-needs-reference',
                              )}
                              {bulkNeedsReferenceError ? (
                                <p
                                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                                  role="alert"
                                >
                                  {bulkNeedsReferenceError}
                                </p>
                              ) : null}
                            </div>
                            <button
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-secondary-300 px-3 py-1.5 text-sm font-medium text-secondary-700 transition-colors hover:bg-secondary-50 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800"
                              onClick={() =>
                                void handleBulkNeedsReferenceAssignment()
                              }
                              type="button"
                            >
                              {t('applyNeedsReferenceSelected', {
                                count: leftSelectedIds.size,
                              })}
                            </button>
                          </div>
                          <button
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700/60 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
                            onClick={() => setShowBulkDeviationModal(true)}
                            type="button"
                          >
                            <AlertTriangle
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            {td('requestDeviationSelected', {
                              count: leftSelectedIds.size,
                            })}
                          </button>
                          <button
                            className="btn-destructive inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
                            onClick={event =>
                              void handleRemoveSelected(
                                event.currentTarget as HTMLElement,
                              )
                            }
                            type="button"
                          >
                            <Trash2
                              aria-hidden="true"
                              className="h-3.5 w-3.5"
                            />
                            {t('removeSelected', {
                              count: leftSelectedIds.size,
                            })}
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
                </div>
              )}
              <DeviationFormModal
                loading={bulkDeviationSaving}
                onClose={() => {
                  setShowBulkDeviationModal(false)
                  setBulkDeviationError(null)
                }}
                onSubmit={handleBulkDeviation}
                open={showBulkDeviationModal}
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
                      specificationSlug={specificationSlug}
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
        onSaved={async result => {
          setShowEditSpecificationForm(false)
          if (result.newUniqueId && result.newUniqueId !== specificationSlug) {
            router.replace(`/specifications/${result.newUniqueId}`)
          } else {
            await fetchSpecificationMeta()
          }
        }}
        open={showEditSpecificationForm}
        spec={spec}
        specificationSlug={specificationSlug}
      />
      {addModal}
      {createLocalRequirementModal}
      {needsReferenceFormModal}
      {pdfDownload.dialog}
    </>
  )
}
