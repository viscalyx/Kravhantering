'use client'

import {
  AlertTriangle,
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import RequirementDetailClient from '@/app/[locale]/requirements/[id]/requirement-detail-client'
import SpecificationEditPanel, {
  PACKAGE_EDIT_FORM_ID,
} from '@/app/[locale]/specifications/[slug]/specification-edit-panel'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import RequirementsTable from '@/components/RequirementsTable'
import { usePdfDownload } from '@/components/reports/pdf/usePdfDownload'
import SpecificationLocalRequirementDetailClient from '@/components/SpecificationLocalRequirementDetailClient'
import SpecificationLocalRequirementForm, {
  type SpecificationLocalRequirementSubmitPayload,
} from '@/components/SpecificationLocalRequirementForm'
import { Link, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { exportToCsv } from '@/lib/export-csv'
import { apiFetch } from '@/lib/http/api-fetch'
import { fetchPackageItemsForReport } from '@/lib/reports/data/fetch-specification-items'
import { buildListReport } from '@/lib/reports/templates/list-template'
import type { ReportModel } from '@/lib/reports/types'
import {
  type AreaOption,
  buildRequirementListParams,
  DEFAULT_REQUIREMENT_SORT,
  type FilterOption,
  type FilterValues,
  type RequirementColumnId,
  type RequirementRow,
  type RequirementSortState,
} from '@/lib/requirements/list-view'

const REQUIREMENT_PACKAGE_DETAIL_HELP: HelpContent = {
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

interface PackageMeta {
  businessNeedsReference: string | null
  id: number
  implementationType: { nameSv: string; nameEn: string } | null
  lifecycleStatus: { nameSv: string; nameEn: string } | null
  name: string
  responsibilityArea: { nameSv: string; nameEn: string } | null
  specificationImplementationTypeId: number | null
  specificationLifecycleStatusId: number | null
  specificationResponsibilityAreaId: number | null
  uniqueId: string
}

interface PackageTaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

interface PackageItem extends RequirementRow {
  needsReference?: string | null
}

const PAGE_SIZE = 200

const LEFT_VISIBLE_COLS_KEY = 'requirement-packages.visibleColumns.left.v2'
const RIGHT_VISIBLE_COLS_KEY = 'requirement-packages.visibleColumns.right.v2'
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

function readStoredCols(
  key: string,
  fallback: RequirementColumnId[],
): RequirementColumnId[] {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as RequirementColumnId[]
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

export default function KravunderlagDetailClient({
  specificationSlug,
}: {
  specificationSlug: string
}) {
  useHelpContent(REQUIREMENT_PACKAGE_DETAIL_HELP)
  const t = useTranslations('specification')
  const tc = useTranslations('common')
  const td = useTranslations('deviation')
  const tr = useTranslations('reports')
  const locale = useLocale()
  const router = useRouter()
  const { confirm } = useConfirmModal()
  const searchParams = useSearchParams()
  const preFilterAreaId = searchParams.get('areaId')
    ? Number(searchParams.get('areaId'))
    : null

  const [pkg, setPkg] = useState<PackageMeta | null>(null)
  const [specificationItems, setPackageItems] = useState<PackageItem[]>([])
  const [availableRows, setAvailableRows] = useState<RequirementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [usageScenarios, setUsageScenarios] = useState<FilterOption[]>([])
  const [
    specificationResponsibilityAreas,
    setSpecificationResponsibilityAreas,
  ] = useState<PackageTaxonomyItem[]>([])
  const [
    specificationImplementationTypes,
    setSpecificationImplementationTypes,
  ] = useState<PackageTaxonomyItem[]>([])
  const [specificationLifecycleStatuses, setSpecificationLifecycleStatuses] =
    useState<PackageTaxonomyItem[]>([])
  const [specificationItemStatuses, setSpecificationItemStatuses] = useState<
    (PackageTaxonomyItem & {
      color: string
      descriptionEn: string | null
      descriptionSv: string | null
      sortOrder: number
    })[]
  >([])
  const [showEditPackageForm, setShowEditPackageForm] = useState(false)
  const [showBulkDeviationModal, setShowBulkDeviationModal] = useState(false)
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
  const [leftVisibleCols, setLeftVisibleCols] = useState<RequirementColumnId[]>(
    () => readStoredCols(LEFT_VISIBLE_COLS_KEY, DEFAULT_LEFT_COLS),
  )

  // Right panel state
  const [rightSelectedIds, setRightSelectedIds] = useState<Set<number>>(
    new Set(),
  )
  const [rightExpandedId, setRightExpandedId] = useState<number | null>(null)
  const [rightFilters, setRightFilters] = useState<FilterValues>({})
  const [rightSort, setRightSort] = useState<RequirementSortState>(
    DEFAULT_REQUIREMENT_SORT,
  )
  const [rightHasMore, setRightHasMore] = useState(false)
  const [rightLoadingMore, setRightLoadingMore] = useState(false)
  const [rightVisibleCols, setRightVisibleCols] = useState<
    RequirementColumnId[]
  >(() => readStoredCols(RIGHT_VISIBLE_COLS_KEY, DEFAULT_RIGHT_COLS))

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
  const [availableNeedsRefs, setAvailableNeedsRefs] = useState<
    { id: number; text: string }[]
  >([])
  const [leftNormReferenceOptions, setLeftNormReferenceOptions] = useState<
    { id: number; normReferenceId: string; name: string }[]
  >([])
  const [rightNormReferenceOptions, setRightNormReferenceOptions] = useState<
    { id: number; normReferenceId: string; name: string }[]
  >([])
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [addModalLoading, setAddModalLoading] = useState(false)
  const [addModalError, setAddModalError] = useState<string | null>(null)

  // PDF export state
  const [pdfModel, setPdfModel] = useState<ReportModel | null>(null)
  const [pdfFilename, setPdfFilename] = useState('requirement-package.pdf')
  const { download: downloadPdf } = usePdfDownload({
    model: pdfModel,
    locale,
    filename: pdfFilename,
  })

  const latestAvailableRequestIdRef = useRef(0)

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

  const helpButton = (
    field: string,
    label: string,
    { disabled = false }: { disabled?: boolean } = {},
  ) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-secondary-400 dark:hover:text-primary-400 dark:disabled:hover:text-secondary-400"
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

  const selectedPackageItems = useMemo(
    () => specificationItems.filter(item => leftSelectedIds.has(item.id)),
    [leftSelectedIds, specificationItems],
  )

  const fetchPackageMeta = useCallback(async () => {
    const res = await apiFetch(`/api/specifications/${specificationSlug}`)
    if (res.ok) {
      setPkg((await res.json()) as PackageMeta)
    }
  }, [specificationSlug])

  const fetchPackageItems = useCallback(
    async ({
      throwOnError = false,
    }: {
      throwOnError?: boolean
    } = {}): Promise<boolean> => {
      const res = await apiFetch(
        `/api/specifications/${specificationSlug}/items`,
      )
      if (!res.ok) {
        if (throwOnError) {
          throw new Error('Failed to refresh requirements specification items')
        }
        return false
      }
      const data = (await res.json()) as { items: PackageItem[] }
      setPackageItems(data.items)
      return true
    },
    [specificationSlug],
  )

  const fetchAvailableRequirements = useCallback(
    async ({
      throwOnError = false,
    }: {
      throwOnError?: boolean
    } = {}): Promise<boolean> => {
      const requestId = ++latestAvailableRequestIdRef.current
      const params = buildRequirementListParams({
        filters: { ...rightFilters, statuses: [3] },
        limit: PAGE_SIZE,
        locale,
        sort: rightSort,
      })
      try {
        const res = await apiFetch(`/api/requirements?${params}`)
        if (!res.ok) {
          if (throwOnError) {
            throw new Error('Failed to refresh available requirements')
          }
          return false
        }
        if (requestId !== latestAvailableRequestIdRef.current) return false
        const data = (await res.json()) as {
          requirements?: RequirementRow[]
          pagination?: { hasMore?: boolean }
        }
        if (requestId !== latestAvailableRequestIdRef.current) return false
        setAvailableRows(data.requirements ?? [])
        setRightHasMore(data.pagination?.hasMore ?? false)
        return true
      } catch {
        if (throwOnError) {
          throw new Error('Failed to refresh available requirements')
        }
        return false
      }
    },
    [locale, rightFilters, rightSort],
  )

  const loadMoreAvailable = useCallback(async () => {
    if (rightLoadingMore || !rightHasMore) return
    const requestId = ++latestAvailableRequestIdRef.current
    setRightLoadingMore(true)
    try {
      const params = buildRequirementListParams({
        filters: { ...rightFilters, statuses: [3] },
        limit: PAGE_SIZE,
        locale,
        offset: availableRows.length,
        sort: rightSort,
      })
      const res = await apiFetch(`/api/requirements?${params}`)
      if (!res.ok || requestId !== latestAvailableRequestIdRef.current) return
      const data = (await res.json()) as {
        requirements?: RequirementRow[]
        pagination?: { hasMore?: boolean }
      }
      if (requestId !== latestAvailableRequestIdRef.current) return
      setAvailableRows(prev => [...prev, ...(data.requirements ?? [])])
      setRightHasMore(data.pagination?.hasMore ?? false)
    } catch {
      // ignore
    } finally {
      setRightLoadingMore(false)
    }
  }, [
    availableRows.length,
    locale,
    rightFilters,
    rightHasMore,
    rightLoadingMore,
    rightSort,
  ])

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      await Promise.all([fetchPackageMeta(), fetchPackageItems()])
      setLoading(false)
    }
    void init()
  }, [fetchPackageMeta, fetchPackageItems])

  useEffect(() => {
    void fetchAvailableRequirements()
  }, [fetchAvailableRequirements])

  useEffect(() => {
    const fetchTaxonomies = async () => {
      const [
        areasRes,
        scenariosRes,
        needsRefsRes,
        packageAreasRes,
        packageTypesRes,
        packageStatusesRes,
        specificationItemStatusesRes,
      ] = await Promise.allSettled([
        apiFetch('/api/requirement-areas'),
        apiFetch('/api/usage-scenarios'),
        apiFetch(`/api/specifications/${specificationSlug}/needs-references`),
        apiFetch('/api/specification-responsibility-areas'),
        apiFetch('/api/specification-implementation-types'),
        apiFetch('/api/specification-lifecycle-statuses'),
        apiFetch('/api/specification-item-statuses'),
      ])
      if (areasRes.status === 'fulfilled' && areasRes.value.ok) {
        const data = (await areasRes.value.json()) as { areas?: AreaOption[] }
        setAreas(data.areas ?? [])
      }
      if (scenariosRes.status === 'fulfilled' && scenariosRes.value.ok) {
        const data = (await scenariosRes.value.json()) as {
          scenarios?: FilterOption[]
        }
        setUsageScenarios(data.scenarios ?? [])
      }
      if (needsRefsRes.status === 'fulfilled' && needsRefsRes.value.ok) {
        const data = (await needsRefsRes.value.json()) as {
          needsReferences: { id: number; text: string }[]
        }
        setAvailableNeedsRefs(data.needsReferences)
      }
      if (packageAreasRes.status === 'fulfilled' && packageAreasRes.value.ok) {
        const data = (await packageAreasRes.value.json()) as {
          areas?: PackageTaxonomyItem[]
        }
        setSpecificationResponsibilityAreas(data.areas ?? [])
      }
      if (packageTypesRes.status === 'fulfilled' && packageTypesRes.value.ok) {
        const data = (await packageTypesRes.value.json()) as {
          types?: PackageTaxonomyItem[]
        }
        setSpecificationImplementationTypes(data.types ?? [])
      }
      if (
        packageStatusesRes.status === 'fulfilled' &&
        packageStatusesRes.value.ok
      ) {
        const data = (await packageStatusesRes.value.json()) as {
          statuses?: PackageTaxonomyItem[]
        }
        setSpecificationLifecycleStatuses(data.statuses ?? [])
      }
      if (
        specificationItemStatusesRes.status === 'fulfilled' &&
        specificationItemStatusesRes.value.ok
      ) {
        const data = (await specificationItemStatusesRes.value.json()) as {
          statuses?: (PackageTaxonomyItem & {
            color: string
            descriptionEn: string | null
            descriptionSv: string | null
            isDeviationStatus?: boolean
            sortOrder: number
          })[]
        }
        setSpecificationItemStatuses(data.statuses ?? [])
      }
    }
    void fetchTaxonomies()
  }, [specificationSlug])

  // Persist visible columns to localStorage
  useEffect(() => {
    localStorage.setItem(LEFT_VISIBLE_COLS_KEY, JSON.stringify(leftVisibleCols))
  }, [leftVisibleCols])

  useEffect(() => {
    localStorage.setItem(
      RIGHT_VISIBLE_COLS_KEY,
      JSON.stringify(rightVisibleCols),
    )
  }, [rightVisibleCols])

  // Fetch norm reference options for left panel (status-aware)
  useEffect(() => {
    const statuses = leftFilters.statuses ?? []
    const params = new URLSearchParams()
    params.set('linked', 'true')
    for (const s of statuses) params.append('statuses', String(s))
    apiFetch(`/api/norm-references?${params}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        const typed = data as {
          normReferences?: {
            id: number
            normReferenceId: string
            name: string
          }[]
        } | null
        setLeftNormReferenceOptions(typed?.normReferences ?? [])
      })
      .catch(() => setLeftNormReferenceOptions([]))
  }, [leftFilters.statuses])

  // Fetch norm reference options for right panel (always published = status 3)
  useEffect(() => {
    apiFetch('/api/norm-references?linked=true&statuses=3')
      .then(res => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        const typed = data as {
          normReferences?: {
            id: number
            normReferenceId: string
            name: string
          }[]
        } | null
        setRightNormReferenceOptions(typed?.normReferences ?? [])
      })
      .catch(() => setRightNormReferenceOptions([]))
  }, [])

  // Open add modal
  const handleOpenAddModal = useCallback(async () => {
    setPendingAddIds(Array.from(rightSelectedIds))
    setAddNeedsRefMode('none')
    setAddNeedsRefId('')
    setAddNeedsRefText('')
    setAddModalError(null)
    setOpenHelp(new Set())
    setShowAddModal(true)
    const res = await apiFetch(
      `/api/specifications/${specificationSlug}/needs-references`,
    )
    if (res.ok) {
      const data = (await res.json()) as {
        needsReferences: { id: number; text: string }[]
      }
      setAvailableNeedsRefs(data.needsReferences)
    }
  }, [specificationSlug, rightSelectedIds])

  const handleOpenCreateLocalRequirementModal = useCallback(async () => {
    setShowCreateLocalRequirementModal(true)

    if (availableNeedsRefs.length > 0) {
      return
    }

    const response = await apiFetch(
      `/api/specifications/${specificationSlug}/needs-references`,
    )
    if (response.ok) {
      const data = (await response.json()) as {
        needsReferences: { id: number; text: string }[]
      }
      setAvailableNeedsRefs(data.needsReferences)
    }
  }, [availableNeedsRefs.length, specificationSlug])

  const handleConfirmAdd = useCallback(async () => {
    if (pendingAddIds.length === 0) return
    setAddModalLoading(true)
    try {
      const body: {
        requirementIds: number[]
        needsReferenceId?: number | null
        needsReferenceText?: string | null
      } = { requirementIds: pendingAddIds }
      if (addNeedsRefMode === 'existing' && addNeedsRefId !== '') {
        body.needsReferenceId = Number(addNeedsRefId)
      } else if (addNeedsRefMode === 'new' && addNeedsRefText.trim()) {
        body.needsReferenceText = addNeedsRefText.trim()
      }
      const res = await apiFetch(
        `/api/specifications/${specificationSlug}/items`,
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
        fetchPackageItems({ throwOnError: true }),
        fetchAvailableRequirements({ throwOnError: true }),
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
    addNeedsRefMode,
    addNeedsRefText,
    fetchAvailableRequirements,
    fetchPackageItems,
    specificationSlug,
    pendingAddIds,
    tc,
  ])

  const handleCreateLocalRequirement = useCallback(
    async (payload: SpecificationLocalRequirementSubmitPayload) => {
      const response = await apiFetch(
        `/api/specifications/${specificationSlug}/local-requirements`,
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
      await fetchPackageItems({ throwOnError: true })
    },
    [fetchPackageItems, specificationSlug, tc],
  )

  const handleSpecificationItemStatusChange = useCallback(
    async (itemRef: string, statusId: number | null) => {
      if (!pkg) return
      const prev = specificationItems
      // Optimistic update
      setPackageItems(prev =>
        prev.map(item => {
          if (item.itemRef !== itemRef) return item
          const status = statusId
            ? specificationItemStatuses.find(s => s.id === statusId)
            : null
          return {
            ...item,
            specificationItemStatusId: statusId,
            specificationItemStatusNameSv: status?.nameSv ?? null,
            specificationItemStatusNameEn: status?.nameEn ?? null,
            specificationItemStatusColor: status?.color ?? null,
          }
        }),
      )
      try {
        const res = await apiFetch(
          `/api/specifications/${pkg.id}/items/${encodeURIComponent(itemRef)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ specificationItemStatusId: statusId }),
          },
        )
        if (!res.ok) {
          setPackageItems(prev)
        }
      } catch {
        setPackageItems(prev)
      }
    },
    [pkg, specificationItemStatuses, specificationItems],
  )

  const handleRemoveSelected = useCallback(
    async (anchorEl?: HTMLElement) => {
      if (selectedPackageItems.length === 0) return

      const libraryCount = selectedPackageItems.filter(
        item => !item.isSpecificationLocal,
      ).length
      const specificationLocalCount = selectedPackageItems.length - libraryCount

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

      const itemRefs = selectedPackageItems
        .map(item => item.itemRef)
        .filter((value): value is string => typeof value === 'string')

      if (itemRefs.length === 0) return

      try {
        const response = await apiFetch(
          `/api/specifications/${specificationSlug}/items`,
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
            'Failed to remove items from package',
            body?.error ?? response.statusText,
          )
          return
        }
      } catch (error) {
        console.error('Failed to remove items from package', error)
        return
      }

      const removedIds = new Set(selectedPackageItems.map(item => item.id))
      setLeftSelectedIds(new Set())
      setLeftExpandedId(current =>
        current != null && removedIds.has(current) ? null : current,
      )
      setLeftFilters(prev => {
        if (!prev.usageScenarioIds || prev.usageScenarioIds.length === 0) {
          return prev
        }

        const remainingScenarioIds = new Set(
          specificationItems
            .filter(item => !removedIds.has(item.id))
            .flatMap(item => item.usageScenarioIds ?? []),
        )
        const stillValid = prev.usageScenarioIds.filter(id =>
          remainingScenarioIds.has(id),
        )

        if (stillValid.length === prev.usageScenarioIds.length) {
          return prev
        }

        return {
          ...prev,
          usageScenarioIds: stillValid.length > 0 ? stillValid : undefined,
        }
      })

      await Promise.all([fetchPackageItems(), fetchAvailableRequirements()])
    },
    [
      confirm,
      fetchAvailableRequirements,
      fetchPackageItems,
      specificationItems,
      specificationSlug,
      selectedPackageItems,
      t,
      tc,
    ],
  )

  const handleBulkDeviation = useCallback(
    async (motivation: string, createdBy: string) => {
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
                  body: JSON.stringify({ motivation, createdBy }),
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
        await fetchPackageItems()
      } finally {
        setBulkDeviationSaving(false)
      }
    },
    [fetchPackageItems, leftSelectedIds, specificationItems, td],
  )

  const getName = (opt: { nameSv: string; nameEn: string }) =>
    locale === 'sv' ? opt.nameSv : opt.nameEn

  // Filter right panel rows to exclude already-added items
  const rightRows = useMemo(
    () => availableRows.filter(r => !specificationItemIds.has(r.id)),
    [availableRows, specificationItemIds],
  )

  // Filter left panel rows client-side (all items loaded at once)
  const filteredPackageItems = useMemo(() => {
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
      leftFilters.usageScenarioIds &&
      leftFilters.usageScenarioIds.length > 0
    ) {
      const scenarioSet = new Set(leftFilters.usageScenarioIds)
      rows = rows.filter(r =>
        r.usageScenarioIds?.some(id => scenarioSet.has(id)),
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

  // Only show usage scenarios that appear on at least one item in the package
  const packageUsageScenarios = useMemo(() => {
    const usedIds = new Set(
      specificationItems.flatMap(r => r.usageScenarioIds ?? []),
    )
    return usageScenarios.filter(s => usedIds.has(s.id))
  }, [specificationItems, usageScenarios])

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
    const csvRows = filteredPackageItems.map(r => ({
      [headers[0]]: r.uniqueId,
      [headers[1]]: r.version?.description ?? '',
      [headers[2]]: r.area?.name ?? '',
      [headers[3]]: (r as PackageItem).needsReference ?? '',
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
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download =
      locale === 'sv' ? 'kravunderlag.csv' : 'requirement-package.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredPackageItems, locale, t])

  useEffect(() => {
    if (pdfModel) {
      void downloadPdf()
      setPdfModel(null)
    }
  }, [pdfModel, downloadPdf])

  const handleDownloadPdf = useCallback(async () => {
    if (!pkg) return
    const itemRefs = filteredPackageItems
      .map(row => row.itemRef)
      .filter((value): value is string => typeof value === 'string')
    if (itemRefs.length === 0) return
    const requirements = await fetchPackageItemsForReport(
      specificationSlug,
      itemRefs,
      locale,
    )
    const label = tr('listPdfFilenameLabel')
    const raw = `${label} ${pkg.name} ${pkg.uniqueId}.pdf`
    setPdfFilename(
      raw
        .replace(/[/\\:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    const pickName = (obj: { nameSv: string; nameEn: string } | null) =>
      obj ? (locale === 'sv' ? obj.nameSv : obj.nameEn) : null
    setPdfModel(
      buildListReport(requirements, locale, {
        name: pkg.name,
        uniqueId: pkg.uniqueId,
        responsibilityArea: pickName(pkg.responsibilityArea),
        implementationType: pickName(pkg.implementationType),
        lifecycleStatus: pickName(pkg.lifecycleStatus),
        businessNeedsReference: pkg.businessNeedsReference,
      }),
    )
  }, [filteredPackageItems, locale, specificationSlug, pkg, tr])

  const pkgName = pkg ? pkg.name : '…'

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

  if (!pkg) {
    return (
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">
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
  const packageDetailStickyTopOffsetClassName = 'top-16 xl:top-0'
  const packageDetailPagePaddingClassName =
    'px-4 pb-8 pt-6 sm:px-6 sm:pb-10 sm:pt-7 lg:px-8 lg:pt-8'
  const packageDetailPageShellClassName = showEditPackageForm
    ? packageDetailPagePaddingClassName
    : `${packageDetailPagePaddingClassName} xl:flex xl:h-[calc(100dvh-4rem)] xl:flex-col xl:overflow-hidden`
  const packageDetailContainerClassName = showEditPackageForm
    ? 'container-custom max-w-none'
    : 'container-custom max-w-none xl:flex xl:min-h-0 xl:flex-1 xl:flex-col'
  const packageDetailSplitPanelClassName = showEditPackageForm
    ? 'grid grid-cols-1 gap-6 items-start xl:grid-cols-2'
    : 'grid grid-cols-1 gap-6 items-start xl:-mx-8 xl:min-h-0 xl:flex-1 xl:grid-cols-2 xl:items-stretch xl:gap-4'

  return (
    <>
      <div
        className={packageDetailPageShellClassName}
        data-package-detail-page-shell="true"
      >
        <div className={packageDetailContainerClassName}>
          {/* Header */}
          <div className="mb-5">
            <div
              className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(24rem,1fr)] xl:items-start xl:gap-5"
              data-package-detail-header-summary="true"
            >
              <div className="min-w-0">
                <div
                  className="flex items-start gap-3"
                  data-package-detail-title-row="true"
                >
                  <h1 className="min-w-0 text-2xl font-bold text-secondary-900 dark:text-secondary-100 xl:text-[2rem] xl:leading-tight">
                    {pkgName}
                  </h1>
                  <button
                    aria-controls={PACKAGE_EDIT_FORM_ID}
                    aria-expanded={showEditPackageForm}
                    aria-label={t('editSpecification')}
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-secondary-200 bg-white/80 text-secondary-700 shadow-sm transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-secondary-700 dark:bg-secondary-900/70 dark:text-secondary-200 dark:hover:bg-secondary-800"
                    {...devMarker({
                      context: 'requirements specification detail',
                      name: 'detail action',
                      priority: 350,
                      value: 'edit package',
                    })}
                    onClick={() => setShowEditPackageForm(current => !current)}
                    title={t('editSpecification')}
                    type="button"
                  >
                    <Pencil aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
                {pkg.businessNeedsReference && (
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-secondary-700 dark:text-secondary-200">
                    {pkg.businessNeedsReference}
                  </p>
                )}
              </div>
              <dl
                className="grid gap-3 sm:grid-cols-2 xl:w-full xl:grid-cols-3"
                data-package-detail-header-metadata="true"
              >
                {pkg.responsibilityArea && (
                  <div className="min-w-0 rounded-xl border border-secondary-200/70 bg-white/50 px-3 py-2.5 backdrop-blur-sm dark:border-secondary-700/70 dark:bg-secondary-900/40">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-500 dark:text-secondary-400">
                      {t('responsibilityArea')}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-5 text-secondary-800 break-words dark:text-secondary-100">
                      {localName(pkg.responsibilityArea)}
                    </dd>
                  </div>
                )}
                {pkg.implementationType && (
                  <div className="min-w-0 rounded-xl border border-secondary-200/70 bg-white/50 px-3 py-2.5 backdrop-blur-sm dark:border-secondary-700/70 dark:bg-secondary-900/40">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-500 dark:text-secondary-400">
                      {t('implementationType')}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-5 text-secondary-800 break-words dark:text-secondary-100">
                      {localName(pkg.implementationType)}
                    </dd>
                  </div>
                )}
                {pkg.lifecycleStatus && (
                  <div className="min-w-0 rounded-xl border border-secondary-200/70 bg-white/50 px-3 py-2.5 backdrop-blur-sm dark:border-secondary-700/70 dark:bg-secondary-900/40">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-secondary-500 dark:text-secondary-400">
                      {t('lifecycleStatus')}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-5 text-secondary-800 break-words dark:text-secondary-100">
                      {localName(pkg.lifecycleStatus)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
            {showEditPackageForm && (
              <div className="mt-4">
                <SpecificationEditPanel
                  implementationTypes={specificationImplementationTypes}
                  lifecycleStatuses={specificationLifecycleStatuses}
                  onCancel={() => setShowEditPackageForm(false)}
                  onSaved={async result => {
                    setShowEditPackageForm(false)
                    if (
                      result.newUniqueId &&
                      result.newUniqueId !== specificationSlug
                    ) {
                      router.replace(`/specifications/${result.newUniqueId}`)
                    } else {
                      await fetchPackageMeta()
                    }
                  }}
                  pkg={pkg}
                  responsibilityAreas={specificationResponsibilityAreas}
                  specificationSlug={specificationSlug}
                />
              </div>
            )}
          </div>

          {/* Split panel */}
          <div
            className={packageDetailSplitPanelClassName}
            data-package-detail-split-panel="true"
          >
            {/* Left panel: Krav i underlaget */}
            <div className="flex flex-col gap-3 xl:h-full xl:min-h-0">
              {specificationItems.length === 0 ? (
                <>
                  <div className="flex min-h-10 items-center justify-between">
                    <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                      {t('itemsInSpecification')}
                      <span className="ml-2 text-sm font-normal text-secondary-500 dark:text-secondary-400">
                        ({specificationItems.length})
                      </span>
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        aria-label={t('newLocalRequirement')}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary-600/80 bg-primary-700 text-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] backdrop-blur-md transition-all hover:-translate-y-px hover:border-primary-700 hover:bg-primary-800 hover:shadow-[0_14px_36px_-20px_rgba(67,56,202,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-primary-500/80 dark:bg-primary-600 dark:hover:border-primary-400 dark:hover:bg-primary-700 dark:focus-visible:ring-offset-secondary-950"
                        onClick={() =>
                          void handleOpenCreateLocalRequirementModal()
                        }
                        title={t('newLocalRequirement')}
                        type="button"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                      </button>
                      {leftSelectedIds.size > 0 && (
                        <button
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                          onClick={event =>
                            void handleRemoveSelected(
                              event.currentTarget as HTMLElement,
                            )
                          }
                          type="button"
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          {t('removeSelected', { count: leftSelectedIds.size })}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-8 text-center text-secondary-500 dark:text-secondary-400 text-sm">
                    {t('noItems')}
                  </div>
                </>
              ) : (
                <div
                  className={desktopSplitPanelCardClassName}
                  data-package-detail-list-panel="items"
                >
                  <RequirementsTable
                    areas={areas}
                    expandedId={leftExpandedId}
                    filterValues={leftFilters}
                    floatingActionRailPlacement="inline-top"
                    floatingActions={[
                      {
                        ariaLabel: t('newLocalRequirement'),
                        developerModeContext:
                          'requirements specification detail',
                        developerModeValue: 'create local requirement',
                        icon: <Plus aria-hidden="true" className="h-4 w-4" />,
                        id: 'create-local',
                        onClick: () =>
                          void handleOpenCreateLocalRequirementModal(),
                        position: 'beforeColumns',
                        variant: 'primary' as const,
                      },
                      {
                        ariaLabel: tc('print'),
                        icon: (
                          <Printer aria-hidden="true" className="h-4 w-4" />
                        ),
                        id: 'print',
                        menuItems: [
                          {
                            href: `/specifications/${specificationSlug}/reports/print/list?refs=${buildItemRefsQuery(
                              filteredPackageItems,
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
                    onRowClick={id =>
                      setLeftExpandedId(prev => (prev === id ? null : id))
                    }
                    onSelectionChange={setLeftSelectedIds}
                    onSortChange={setLeftSort}
                    onSpecificationItemStatusChange={
                      handleSpecificationItemStatusChange
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
                            await fetchPackageItems()
                          }}
                          specificationSlug={specificationSlug}
                        />
                      ) : item?.specificationItemId != null ? (
                        <RequirementDetailClient
                          inline
                          onChange={async () => {
                            await fetchPackageItems()
                          }}
                          requirementId={id}
                          specificationItemId={item.specificationItemId}
                          specificationSlug={specificationSlug}
                        />
                      ) : (
                        <RequirementDetailClient
                          inline
                          onChange={async () => {
                            await fetchPackageItems()
                          }}
                          requirementId={id}
                        />
                      )
                    }}
                    rows={filteredPackageItems}
                    selectable
                    selectedIds={leftSelectedIds}
                    sortState={leftSort}
                    specificationItemStatuses={specificationItemStatuses}
                    stickyTitle={
                      <h2 className="truncate text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                        {t('itemsInSpecification')}
                        <span className="ml-2 text-sm font-normal text-secondary-500 dark:text-secondary-400">
                          ({specificationItems.length})
                        </span>
                      </h2>
                    }
                    stickyTitleActions={
                      leftSelectedIds.size > 0 ? (
                        <>
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
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
                      packageDetailStickyTopOffsetClassName
                    }
                    usageScenarios={packageUsageScenarios}
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

            {/* Right panel: Tillgängliga krav */}
            <div className="flex flex-col gap-3 xl:h-full xl:min-h-0">
              <div
                className={desktopSplitPanelCardClassName}
                data-package-detail-list-panel="available"
              >
                <RequirementsTable
                  areas={areas}
                  excludeColumns={['needsReference', 'specificationItemStatus']}
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
                  rows={rightRows}
                  selectable
                  selectedIds={rightSelectedIds}
                  sortState={rightSort}
                  stickyTitle={
                    <h2 className="truncate text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                      {t('availableRequirements')}
                    </h2>
                  }
                  stickyTitleActions={
                    rightSelectedIds.size > 0 ? (
                      <button
                        className="inline-flex items-center gap-1.5 btn-primary"
                        onClick={handleOpenAddModal}
                        type="button"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {t('addSelectedToSpecification', {
                          count: rightSelectedIds.size,
                        })}
                      </button>
                    ) : null
                  }
                  stickyTopOffsetClassName={
                    packageDetailStickyTopOffsetClassName
                  }
                  usageScenarios={usageScenarios}
                  visibleColumns={rightVisibleCols}
                  wrapDescription
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {addModal}
      {createLocalRequirementModal}
    </>
  )
}
