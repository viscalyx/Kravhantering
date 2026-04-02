'use client'

import {
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
import RequirementDetailClient from '@/app/[locale]/kravkatalog/[id]/requirement-detail-client'
import PackageEditPanel, {
  PACKAGE_EDIT_FORM_ID,
} from '@/app/[locale]/kravpaket/[slug]/package-edit-panel'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import RequirementsTable from '@/components/RequirementsTable'
import { usePdfDownload } from '@/components/reports/pdf/usePdfDownload'
import { Link, useRouter } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { exportToCsv } from '@/lib/export-csv'
import { fetchMultipleRequirements } from '@/lib/reports/data/fetch-requirement'
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

const KRAVPAKET_DETAIL_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'kravpaketDetail.requirements.body',
      headingKey: 'kravpaketDetail.requirements.heading',
    },
    {
      kind: 'text',
      bodyKey: 'kravpaketDetail.needsReference.body',
      headingKey: 'kravpaketDetail.needsReference.heading',
    },
    {
      kind: 'text',
      bodyKey: 'kravpaketDetail.export.body',
      headingKey: 'kravpaketDetail.export.heading',
    },
  ],
  titleKey: 'kravpaketDetail.title',
}

interface PackageMeta {
  businessNeedsReference: string | null
  id: number
  implementationType: { nameSv: string; nameEn: string } | null
  name: string
  packageImplementationTypeId: number | null
  packageResponsibilityAreaId: number | null
  responsibilityArea: { nameSv: string; nameEn: string } | null
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

const LEFT_VISIBLE_COLS_KEY = 'kravpaket.visibleColumns.left.v1'
const RIGHT_VISIBLE_COLS_KEY = 'kravpaket.visibleColumns.right.v1'
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

export default function KravpaketDetailClient({
  packageSlug,
}: {
  packageSlug: string
}) {
  useHelpContent(KRAVPAKET_DETAIL_HELP)
  const t = useTranslations('package')
  const tc = useTranslations('common')
  const tn = useTranslations('nav')
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const preFilterAreaId = searchParams.get('areaId')
    ? Number(searchParams.get('areaId'))
    : null

  const [pkg, setPkg] = useState<PackageMeta | null>(null)
  const [packageItems, setPackageItems] = useState<PackageItem[]>([])
  const [availableRows, setAvailableRows] = useState<RequirementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [usageScenarios, setUsageScenarios] = useState<FilterOption[]>([])
  const [packageResponsibilityAreas, setPackageResponsibilityAreas] = useState<
    PackageTaxonomyItem[]
  >([])
  const [packageImplementationTypes, setPackageImplementationTypes] = useState<
    PackageTaxonomyItem[]
  >([])
  const [leftColsPickerEl, setLeftColsPickerEl] =
    useState<HTMLDivElement | null>(null)
  const [rightColsPickerEl, setRightColsPickerEl] =
    useState<HTMLDivElement | null>(null)
  const [showEditPackageForm, setShowEditPackageForm] = useState(false)

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
  const [pendingAddIds, setPendingAddIds] = useState<number[]>([])
  const [addNeedsRefMode, setAddNeedsRefMode] = useState<
    'none' | 'existing' | 'new'
  >('none')
  const [addNeedsRefId, setAddNeedsRefId] = useState<number | ''>('')
  const [addNeedsRefText, setAddNeedsRefText] = useState('')
  const [availableNeedsRefs, setAvailableNeedsRefs] = useState<
    { id: number; text: string }[]
  >([])
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [addModalLoading, setAddModalLoading] = useState(false)

  // PDF export state
  const [pdfModel, setPdfModel] = useState<ReportModel | null>(null)
  const [pdfFilename, setPdfFilename] = useState('kravpaket.pdf')
  const { download: downloadPdf } = usePdfDownload({
    model: pdfModel,
    locale,
    filename: pdfFilename,
  })

  const latestAvailableRequestIdRef = useRef(0)

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

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) =>
    openHelp.has(field) && (
      <p
        className="mt-1 mb-2 whitespace-pre-line rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs text-secondary-500 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-400"
        id={`help-${field}`}
      >
        {t(helpKey)}
      </p>
    )

  const packageItemIds = useMemo(
    () => new Set(packageItems.map(r => r.id)),
    [packageItems],
  )

  const fetchPackageMeta = useCallback(async () => {
    const res = await fetch(`/api/requirement-packages/${packageSlug}`)
    if (res.ok) {
      setPkg((await res.json()) as PackageMeta)
    }
  }, [packageSlug])

  const fetchPackageItems = useCallback(async () => {
    const res = await fetch(`/api/requirement-packages/${packageSlug}/items`)
    if (res.ok) {
      const data = (await res.json()) as { items: PackageItem[] }
      setPackageItems(data.items)
    }
  }, [packageSlug])

  const fetchAvailableRequirements = useCallback(async () => {
    const requestId = ++latestAvailableRequestIdRef.current
    const params = buildRequirementListParams({
      filters: { ...rightFilters, statuses: [3] },
      limit: PAGE_SIZE,
      locale,
      sort: rightSort,
    })
    try {
      const res = await fetch(`/api/requirements?${params}`)
      if (!res.ok || requestId !== latestAvailableRequestIdRef.current) return
      const data = (await res.json()) as {
        requirements?: RequirementRow[]
        pagination?: { hasMore?: boolean }
      }
      if (requestId !== latestAvailableRequestIdRef.current) return
      setAvailableRows(data.requirements ?? [])
      setRightHasMore(data.pagination?.hasMore ?? false)
    } catch {
      // ignore
    }
  }, [locale, rightFilters, rightSort])

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
      const res = await fetch(`/api/requirements?${params}`)
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
      ] = await Promise.allSettled([
        fetch('/api/requirement-areas'),
        fetch('/api/usage-scenarios'),
        fetch(`/api/requirement-packages/${packageSlug}/needs-references`),
        fetch('/api/package-responsibility-areas'),
        fetch('/api/package-implementation-types'),
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
        setPackageResponsibilityAreas(data.areas ?? [])
      }
      if (packageTypesRes.status === 'fulfilled' && packageTypesRes.value.ok) {
        const data = (await packageTypesRes.value.json()) as {
          types?: PackageTaxonomyItem[]
        }
        setPackageImplementationTypes(data.types ?? [])
      }
    }
    void fetchTaxonomies()
  }, [packageSlug])

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

  // Open add modal
  const handleOpenAddModal = useCallback(async () => {
    setPendingAddIds(Array.from(rightSelectedIds))
    setAddNeedsRefMode('none')
    setAddNeedsRefId('')
    setAddNeedsRefText('')
    setOpenHelp(new Set())
    setShowAddModal(true)
    const res = await fetch(
      `/api/requirement-packages/${packageSlug}/needs-references`,
    )
    if (res.ok) {
      const data = (await res.json()) as {
        needsReferences: { id: number; text: string }[]
      }
      setAvailableNeedsRefs(data.needsReferences)
    }
  }, [packageSlug, rightSelectedIds])

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
      const res = await fetch(
        `/api/requirement-packages/${packageSlug}/items`,
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
        throw new Error(data.error ?? 'Failed to add requirements')
      }
      setRightSelectedIds(new Set())
      setShowAddModal(false)
      await Promise.all([fetchPackageItems(), fetchAvailableRequirements()])
    } finally {
      setAddModalLoading(false)
    }
  }, [
    addNeedsRefId,
    addNeedsRefMode,
    addNeedsRefText,
    fetchAvailableRequirements,
    fetchPackageItems,
    packageSlug,
    pendingAddIds,
  ])

  const handleRemoveSelected = useCallback(async () => {
    if (leftSelectedIds.size === 0) return
    await fetch(`/api/requirement-packages/${packageSlug}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirementIds: Array.from(leftSelectedIds) }),
    })
    setLeftSelectedIds(new Set())
    // Clear any usage-scenario filters that only had items in the removed set
    setLeftFilters(prev => {
      if (!prev.usageScenarioIds || prev.usageScenarioIds.length === 0)
        return prev
      const remainingScenarioIds = new Set(
        packageItems
          .filter(r => !leftSelectedIds.has(r.id))
          .flatMap(r => r.usageScenarioIds ?? []),
      )
      const stillValid = prev.usageScenarioIds.filter(id =>
        remainingScenarioIds.has(id),
      )
      if (stillValid.length === prev.usageScenarioIds.length) return prev
      return {
        ...prev,
        usageScenarioIds: stillValid.length > 0 ? stillValid : undefined,
      }
    })
    await Promise.all([fetchPackageItems(), fetchAvailableRequirements()])
  }, [
    fetchAvailableRequirements,
    fetchPackageItems,
    packageSlug,
    leftSelectedIds,
    packageItems,
  ])

  const getName = (opt: { nameSv: string; nameEn: string }) =>
    locale === 'sv' ? opt.nameSv : opt.nameEn

  // Filter right panel rows to exclude already-added items
  const rightRows = useMemo(
    () => availableRows.filter(r => !packageItemIds.has(r.id)),
    [availableRows, packageItemIds],
  )

  // Filter left panel rows client-side (all items loaded at once)
  const filteredPackageItems = useMemo(() => {
    let rows = packageItems
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
    return rows
  }, [packageItems, leftFilters, areas])

  // Only show usage scenarios that appear on at least one item in the package
  const packageUsageScenarios = useMemo(() => {
    const usedIds = new Set(packageItems.flatMap(r => r.usageScenarioIds ?? []))
    return usageScenarios.filter(s => usedIds.has(s.id))
  }, [packageItems, usageScenarios])

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
    }))
    const csv = exportToCsv(headers, csvRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = locale === 'sv' ? 'kravpaket.csv' : 'requirement-package.csv'
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
    const ids = filteredPackageItems.map(r => String(r.id))
    if (ids.length === 0) return
    const requirements = await fetchMultipleRequirements(ids, locale)
    const label = locale === 'sv' ? 'Kravlista' : 'Requirements List'
    const now = new Date()
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}.${String(now.getMinutes()).padStart(2, '0')}`
    setPdfFilename(`${label} ${stamp}.pdf`)
    const pickName = (obj: { nameSv: string; nameEn: string } | null) =>
      obj ? (locale === 'sv' ? obj.nameSv : obj.nameEn) : null
    setPdfModel(
      buildListReport(requirements, locale, {
        name: pkg.name,
        uniqueId: pkg.uniqueId,
        responsibilityArea: pickName(pkg.responsibilityArea),
        implementationType: pickName(pkg.implementationType),
        businessNeedsReference: pkg.businessNeedsReference,
      }),
    )
  }, [filteredPackageItems, locale, pkg])

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
            onClick={() => {
              setOpenHelp(new Set())
              setShowAddModal(false)
            }}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setOpenHelp(new Set())
                setShowAddModal(false)
              }
            }}
            role="dialog"
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white dark:bg-secondary-900 shadow-2xl p-6 space-y-4"
              onClick={e => e.stopPropagation()}
              onKeyDown={e => e.stopPropagation()}
              role="document"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                  {t('addingCount', { count: pendingAddIds.length })}
                </h2>
                <button
                  aria-label={tc('close')}
                  className="p-1.5 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-800 transition-colors"
                  onClick={() => {
                    setOpenHelp(new Set())
                    setShowAddModal(false)
                  }}
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
                  {helpButton('add-needs-ref', t('addNeedsRef'))}
                </div>
                {helpPanel('addNeedsRefHelp', 'add-needs-ref')}
                <select
                  className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
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
                      )}
                    </div>
                    {helpPanel('addNeedsRefTextHelp', 'add-needs-ref-text')}
                    <textarea
                      className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 resize-none"
                      id="add-needs-ref-text"
                      onChange={e => setAddNeedsRefText(e.target.value)}
                      placeholder={t('addNeedsRefPlaceholder')}
                      rows={3}
                      value={addNeedsRefText}
                    />
                  </>
                )}
              </div>
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
                  className="px-4 py-2.5 rounded-xl border text-sm min-h-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 transition-all"
                  onClick={() => {
                    setOpenHelp(new Set())
                    setShowAddModal(false)
                  }}
                  type="button"
                >
                  {tc('cancel')}
                </button>
              </div>
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
            {t('packageNotFound')}
          </p>
          <Link
            className="text-primary-700 dark:text-primary-300 hover:underline mt-4 inline-block"
            href="/kravpaket"
          >
            ← {t('backToPackages')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom max-w-none">
          {/* Header */}
          <div className="mb-6">
            <Link
              className="text-sm text-primary-700 dark:text-primary-300 hover:underline mb-2 inline-block"
              href="/kravpaket"
            >
              ← {tn('packages')}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 text-2xl font-bold text-secondary-900 dark:text-secondary-100">
                {pkgName}
              </h1>
              <button
                aria-controls={PACKAGE_EDIT_FORM_ID}
                aria-expanded={showEditPackageForm}
                aria-label={t('editPackage')}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-secondary-200 bg-white/80 text-secondary-700 shadow-sm transition-colors hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-secondary-700 dark:bg-secondary-900/70 dark:text-secondary-200 dark:hover:bg-secondary-800"
                {...devMarker({
                  context: 'requirement package detail',
                  name: 'detail action',
                  priority: 350,
                  value: 'edit package',
                })}
                onClick={() => setShowEditPackageForm(current => !current)}
                title={t('editPackage')}
                type="button"
              >
                <Pencil aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-secondary-600 dark:text-secondary-400">
              {pkg.responsibilityArea && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-secondary-700 dark:text-secondary-300">
                    {t('responsibilityArea')}:
                  </span>{' '}
                  {localName(pkg.responsibilityArea)}
                </span>
              )}
              {pkg.implementationType && (
                <span className="inline-flex items-center gap-1">
                  <span className="font-medium text-secondary-700 dark:text-secondary-300">
                    {t('implementationType')}:
                  </span>{' '}
                  {localName(pkg.implementationType)}
                </span>
              )}
            </div>
            {pkg.businessNeedsReference && (
              <p className="mt-3 text-sm text-secondary-700 dark:text-secondary-300 max-w-2xl">
                <span className="font-medium">
                  {t('businessNeedsReference')}:
                </span>{' '}
                {pkg.businessNeedsReference}
              </p>
            )}
            {showEditPackageForm && (
              <div className="mt-4">
                <PackageEditPanel
                  implementationTypes={packageImplementationTypes}
                  onCancel={() => setShowEditPackageForm(false)}
                  onSaved={async savedUniqueId => {
                    setShowEditPackageForm(false)
                    if (savedUniqueId && savedUniqueId !== packageSlug) {
                      router.replace(`/kravpaket/${savedUniqueId}`)
                    } else {
                      await fetchPackageMeta()
                    }
                  }}
                  packageSlug={packageSlug}
                  pkg={pkg}
                  responsibilityAreas={packageResponsibilityAreas}
                />
              </div>
            )}
          </div>

          {/* Split panel */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {/* Left panel: Krav i paketet */}
            <div className="flex flex-col gap-3">
              <div className="flex min-h-10 items-center justify-between">
                <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                  {t('itemsInPackage')}
                  <span className="ml-2 text-sm font-normal text-secondary-500 dark:text-secondary-400">
                    ({packageItems.length})
                  </span>
                </h2>
                <div className="flex items-center gap-2">
                  <div ref={setLeftColsPickerEl} />
                  {leftSelectedIds.size > 0 && (
                    <button
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      onClick={() => void handleRemoveSelected()}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      {t('removeSelected', { count: leftSelectedIds.size })}
                    </button>
                  )}
                </div>
              </div>

              {packageItems.length === 0 ? (
                <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-8 text-center text-secondary-500 dark:text-secondary-400 text-sm">
                  {t('noItems')}
                </div>
              ) : (
                <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden">
                  <RequirementsTable
                    areas={areas}
                    columnsPickerContainer={leftColsPickerEl}
                    expandedId={leftExpandedId}
                    filterValues={leftFilters}
                    floatingActions={[
                      {
                        ariaLabel: tc('print'),
                        icon: (
                          <Printer aria-hidden="true" className="h-4 w-4" />
                        ),
                        id: 'print',
                        menuItems: [
                          {
                            href: `/kravpaket/${packageSlug}/reports/print/list?ids=${filteredPackageItems.map(r => r.id).join(',')}`,
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
                    onFilterChange={setLeftFilters}
                    onRowClick={id =>
                      setLeftExpandedId(prev => (prev === id ? null : id))
                    }
                    onSelectionChange={setLeftSelectedIds}
                    onSortChange={setLeftSort}
                    onVisibleColumnsChange={setLeftVisibleCols}
                    renderExpanded={id => (
                      <RequirementDetailClient inline requirementId={id} />
                    )}
                    rows={filteredPackageItems}
                    selectable
                    selectedIds={leftSelectedIds}
                    sortState={leftSort}
                    usageScenarios={packageUsageScenarios}
                    visibleColumns={leftVisibleCols}
                    wrapDescription
                  />
                </div>
              )}
            </div>

            {/* Right panel: Tillgängliga krav */}
            <div className="flex flex-col gap-3">
              <div className="flex min-h-10 items-center justify-between">
                <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                  {t('availableRequirements')}
                </h2>
                <div className="flex items-center gap-2">
                  <div ref={setRightColsPickerEl} />
                  {rightSelectedIds.size > 0 && (
                    <button
                      className="inline-flex items-center gap-1.5 btn-primary"
                      onClick={handleOpenAddModal}
                      type="button"
                    >
                      <Plus aria-hidden="true" className="h-4 w-4" />
                      {t('addSelectedToPackage', {
                        count: rightSelectedIds.size,
                      })}
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden">
                <RequirementsTable
                  areas={areas}
                  columnsPickerContainer={rightColsPickerEl}
                  excludeColumns={['needsReference']}
                  expandedId={rightExpandedId}
                  filterValues={rightFilters}
                  getName={getName}
                  hasMore={rightHasMore}
                  loadingMore={rightLoadingMore}
                  locale={locale}
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
    </>
  )
}
