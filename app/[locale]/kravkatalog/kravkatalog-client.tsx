'use client'

import { Download, Plus, Printer } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import RequirementsTable from '@/components/RequirementsTable'
import {
  type AreaOption,
  buildRequirementListParams,
  clearRequirementFiltersForHiddenColumns,
  compareRequirementRows,
  DEFAULT_FILTERS,
  DEFAULT_REQUIREMENT_SORT,
  type FilterOption,
  type FilterValues,
  getDefaultVisibleRequirementColumns,
  getRequirementColumnWidthsStorageKey,
  normalizeRequirementListColumnDefaults,
  parseRequirementColumnWidths,
  parseRequirementVisibleColumns,
  type QualityCharacteristicOption,
  REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
  type RequirementColumnId,
  type RequirementColumnWidths,
  type RequirementListColumnDefault,
  type RequirementRow,
  type RequirementSortState,
  type StatusOption,
  serializeRequirementColumnWidths,
  serializeRequirementVisibleColumns,
} from '@/lib/requirements/list-view'
import RequirementDetailClient from './[id]/requirement-detail-client'

const PAGE_SIZE = 200

type RequirementDetailRowSource = {
  area?: { name: string } | null
  hasPendingVersion?: boolean
  id: number
  isArchived: boolean
  pendingVersionStatusColor?: string | null
  pendingVersionStatusId?: number | null
  uniqueId: string
  versions?: {
    category?: { nameEn: string; nameSv: string } | null
    description: string | null
    requiresTesting: boolean
    status: number
    statusColor: string | null
    statusNameEn: string | null
    statusNameSv: string | null
    type?: { nameEn: string; nameSv: string } | null
    qualityCharacteristic?: { nameEn: string; nameSv: string } | null
    versionNumber: number
  }[]
}

function mapRequirementDetailToRow(
  detail: RequirementDetailRowSource,
): RequirementRow {
  const version = detail.versions?.[0]

  return {
    area: detail.area ?? null,
    hasPendingVersion: detail.hasPendingVersion ?? false,
    id: detail.id,
    isArchived: detail.isArchived,
    pendingVersionStatusColor: detail.pendingVersionStatusColor ?? null,
    pendingVersionStatusId: detail.pendingVersionStatusId ?? null,
    uniqueId: detail.uniqueId,
    version: version
      ? {
          categoryNameEn: version.category?.nameEn ?? null,
          categoryNameSv: version.category?.nameSv ?? null,
          description: version.description,
          requiresTesting: version.requiresTesting,
          status: version.status,
          statusColor: version.statusColor,
          statusNameEn: version.statusNameEn,
          statusNameSv: version.statusNameSv,
          qualityCharacteristicNameEn:
            version.qualityCharacteristic?.nameEn ?? null,
          qualityCharacteristicNameSv:
            version.qualityCharacteristic?.nameSv ?? null,
          typeNameEn: version.type?.nameEn ?? null,
          typeNameSv: version.type?.nameSv ?? null,
          versionNumber: version.versionNumber,
        }
      : null,
  }
}

export default function KravkatalogClient({
  initialColumnDefaults,
}: {
  initialColumnDefaults?: RequirementListColumnDefault[]
}) {
  const tc = useTranslations('common')
  const t = useTranslations('requirement')
  const locale = useLocale()
  const normalizedColumnDefaults = useMemo(
    () => normalizeRequirementListColumnDefaults(initialColumnDefaults),
    [initialColumnDefaults],
  )
  const defaultVisibleColumns = useMemo(
    () => getDefaultVisibleRequirementColumns(normalizedColumnDefaults),
    [normalizedColumnDefaults],
  )

  const [rows, setRows] = useState<RequirementRow[]>([])
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [categories, setCategories] = useState<FilterOption[]>([])
  const [types, setTypes] = useState<FilterOption[]>([])
  const [qualityCharacteristics, setQualityCharacteristics] = useState<
    QualityCharacteristicOption[]
  >([])
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([])
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS)
  const [sortState, setSortState] = useState<RequirementSortState>(
    DEFAULT_REQUIREMENT_SORT,
  )
  const [visibleColumns, setVisibleColumns] = useState<RequirementColumnId[]>(
    defaultVisibleColumns,
  )
  const [columnWidths, setColumnWidths] = useState<RequirementColumnWidths>({})
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pinnedRow, setPinnedRow] = useState<RequirementRow | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasLoadedColumnPreferences, setHasLoadedColumnPreferences] =
    useState(false)
  const [hasResolvedInitialRows, setHasResolvedInitialRows] = useState(false)
  const [hydratedColumnWidthsStorageKey, setHydratedColumnWidthsStorageKey] =
    useState<string | null>(null)
  const columnWidthsStorageKey = getRequirementColumnWidthsStorageKey(locale)
  const columnPreferencesReady =
    hasLoadedColumnPreferences &&
    hydratedColumnWidthsStorageKey === columnWidthsStorageKey

  // Stable ref so the onChange callback always sees the latest selectedId.
  // Can temporarily hold a uniqueId string when resolving from URL params.
  const selectedIdRef = useRef<number | string | null>(null)
  const latestRowsRequestIdRef = useRef(0)
  const latestFetchDataRequestIdRef = useRef(0)
  const scrollToIdRef = useRef<number | null>(null)
  if (typeof selectedIdRef.current !== 'string') {
    selectedIdRef.current = selectedId
  }

  const refreshRows = useCallback(async () => {
    const requestId = ++latestRowsRequestIdRef.current
    const params = buildRequirementListParams({
      filters,
      limit: PAGE_SIZE,
      locale,
      sort: sortState,
    })

    let data: {
      pagination?: { hasMore?: boolean }
      requirements?: RequirementRow[]
    } | null = null

    try {
      const res = await fetch(`/api/requirements?${params}`)
      if (!res.ok || requestId !== latestRowsRequestIdRef.current) {
        return
      }

      data = (await res.json()) as {
        pagination?: { hasMore?: boolean }
        requirements?: RequirementRow[]
      }
    } catch {
      return
    }
    if (!data || requestId !== latestRowsRequestIdRef.current) {
      return
    }

    const newRows = data.requirements ?? []
    const nextHasMore = data.pagination?.hasMore ?? false

    // If an expanded row is no longer in the filtered results, pin it.
    // sid can be a numeric id or a uniqueId string (from ?selected= URL param).
    const sid = selectedIdRef.current
    let newPinnedRow: RequirementRow | null = null
    let resolvedNumericId: number | null = null

    if (sid != null) {
      const inResults =
        typeof sid === 'number'
          ? newRows.some(r => r.id === sid)
          : newRows.some(r => r.uniqueId === sid)

      // If sid is a uniqueId string, resolve the numeric id from the results
      if (typeof sid === 'string' && inResults) {
        const match = newRows.find(r => r.uniqueId === sid)
        if (match) resolvedNumericId = match.id
      }

      if (!inResults) {
        const hasCurrentPinnedSelection = () =>
          requestId === latestRowsRequestIdRef.current &&
          selectedIdRef.current === sid

        try {
          const singleRes = await fetch(`/api/requirements/${sid}`)
          if (singleRes.ok && hasCurrentPinnedSelection()) {
            const detail =
              (await singleRes.json()) as RequirementDetailRowSource
            if (hasCurrentPinnedSelection()) {
              newPinnedRow = mapRequirementDetailToRow(detail)
              // Resolve uniqueId string → numeric id
              if (typeof sid === 'string') {
                resolvedNumericId = detail.id
              }
            }
          } else if (!singleRes.ok && hasCurrentPinnedSelection()) {
            selectedIdRef.current = null
          }
        } catch {
          if (hasCurrentPinnedSelection()) {
            selectedIdRef.current = null
          }
        }
      }
    }

    if (requestId !== latestRowsRequestIdRef.current) {
      return
    }

    // If we resolved a uniqueId → numeric id, update selectedId state and refs
    if (resolvedNumericId != null) {
      selectedIdRef.current = resolvedNumericId
      setSelectedId(resolvedNumericId)
      scrollToIdRef.current = resolvedNumericId
    }

    // Batch both updates in one synchronous block to avoid intermediate renders
    setHasMore(nextHasMore)
    setRows(newRows)
    setPinnedRow(newPinnedRow)
  }, [filters, locale, sortState])

  const fetchData = useCallback(async () => {
    const requestId = ++latestFetchDataRequestIdRef.current
    setLoading(true)
    try {
      await refreshRows()
    } finally {
      if (requestId === latestFetchDataRequestIdRef.current) {
        setLoading(false)
        setHasResolvedInitialRows(true)
      }
    }
  }, [refreshRows])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return
    const requestId = ++latestRowsRequestIdRef.current
    setLoadingMore(true)
    try {
      const params = buildRequirementListParams({
        filters,
        limit: PAGE_SIZE,
        locale,
        offset: rows.length,
        sort: sortState,
      })
      let data: {
        pagination?: { hasMore?: boolean }
        requirements?: RequirementRow[]
      } | null = null

      try {
        const res = await fetch(`/api/requirements?${params}`)
        if (!res.ok || requestId !== latestRowsRequestIdRef.current) {
          return
        }

        data = (await res.json()) as {
          pagination?: { hasMore?: boolean }
          requirements?: RequirementRow[]
        }
      } catch {
        return
      }
      if (!data || requestId !== latestRowsRequestIdRef.current) {
        return
      }

      const moreRows = data.requirements ?? []
      setHasMore(data.pagination?.hasMore ?? false)
      setRows(prev => [...prev, ...moreRows])
    } finally {
      setLoadingMore(false)
    }
  }, [filters, hasMore, loading, loadingMore, locale, rows.length, sortState])

  const getName = (opt: FilterOption) =>
    locale === 'sv' ? opt.nameSv : opt.nameEn

  const getStatusName = (opt: StatusOption) =>
    locale === 'sv' ? opt.nameSv : opt.nameEn

  // Sync ?selected= param from URL into selectedId state.
  // The param can be a numeric id or a uniqueId string (e.g. "DRF0036").
  // Setting selectedIdRef.current synchronously here is critical: React fires
  // effects in definition order, so when the fetchData effect fires next it
  // calls refreshRows which reads selectedIdRef.current. By setting the ref
  // here (before fetchData runs), refreshRows' own pinning logic will fetch
  // the selected requirement and pin it — even if it's filtered out by the
  // default Published-only status filter.
  useEffect(() => {
    const sel = searchParams.get('selected')
    if (!sel) return

    const numId = Number(sel)
    if (!Number.isNaN(numId) && Number.isInteger(numId) && numId > 0) {
      // Numeric id — set synchronously
      setSelectedId(numId)
      selectedIdRef.current = numId
      scrollToIdRef.current = numId
    } else {
      // UniqueId string — set ref for the pinning logic; the numeric id
      // will be resolved in refreshRows once the requirement is fetched.
      selectedIdRef.current = sel
    }

    refreshRows()

    // Clean up the params to avoid re-opening on manual refresh
    const url = new URL(window.location.href)
    url.searchParams.delete('selected')
    window.history.replaceState({}, '', url.toString())
  }, [searchParams, refreshRows])

  // Scroll to the selected requirement once the expanded detail row is in the
  // DOM. This effect runs after React commits a render that includes the new
  // pinnedRow / rows, so the element exists by the time we look for it.
  // We also depend on hasResolvedInitialRows because the table is hidden behind
  // a loading spinner until that flag is true — without it the effect could fire
  // when rows/pinnedRow are set but before the table is actually rendered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are intentional triggers to re-run scroll check when DOM updates
  useEffect(() => {
    const id = scrollToIdRef.current
    if (id == null) return
    const el = document.getElementById(`requirement-row-detail-${id}`)
    if (el) {
      scrollToIdRef.current = null
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [pinnedRow, rows, hasResolvedInitialRows])

  useEffect(() => {
    const readFilterResponse = async <T,>(
      result: PromiseSettledResult<Response>,
    ): Promise<T | null> => {
      if (result.status !== 'fulfilled' || !result.value.ok) {
        return null
      }

      try {
        return (await result.value.json()) as T
      } catch {
        return null
      }
    }

    const fetchFilters = async () => {
      const [
        areasRes,
        categoriesRes,
        typesRes,
        qualityCharacteristicsRes,
        statusesRes,
      ] = await Promise.allSettled([
        fetch('/api/requirement-areas'),
        fetch('/api/requirement-categories'),
        fetch('/api/requirement-types'),
        fetch('/api/quality-characteristics'),
        fetch('/api/requirement-statuses'),
      ])

      const areasData = await readFilterResponse<{ areas?: AreaOption[] }>(
        areasRes,
      )
      if (areasData) {
        setAreas(areasData.areas ?? [])
      }
      const categoriesData = await readFilterResponse<{
        categories?: FilterOption[]
      }>(categoriesRes)
      if (categoriesData) {
        setCategories(categoriesData.categories ?? [])
      }
      const typesData = await readFilterResponse<{ types?: FilterOption[] }>(
        typesRes,
      )
      if (typesData) {
        setTypes(typesData.types ?? [])
      }
      const qualityCharacteristicsData = await readFilterResponse<{
        qualityCharacteristics?: QualityCharacteristicOption[]
      }>(qualityCharacteristicsRes)
      if (qualityCharacteristicsData) {
        setQualityCharacteristics(
          qualityCharacteristicsData.qualityCharacteristics ?? [],
        )
      }
      const statusesData = await readFilterResponse<{
        statuses?: StatusOption[]
      }>(statusesRes)
      if (statusesData) {
        setStatusOptions(statusesData.statuses ?? [])
      }
    }

    void fetchFilters()
  }, [])

  useEffect(() => {
    let nextVisibleColumns = defaultVisibleColumns

    try {
      nextVisibleColumns = parseRequirementVisibleColumns(
        globalThis.localStorage.getItem(
          REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
        ),
        { columnDefaults: normalizedColumnDefaults },
      )
    } catch {
      nextVisibleColumns = defaultVisibleColumns
    } finally {
      setVisibleColumns(nextVisibleColumns)
      setFilters(previousFilters =>
        clearRequirementFiltersForHiddenColumns(
          previousFilters,
          nextVisibleColumns,
          { columnDefaults: normalizedColumnDefaults },
        ),
      )
      setHasLoadedColumnPreferences(true)
    }
  }, [defaultVisibleColumns, normalizedColumnDefaults])

  useEffect(() => {
    setHasResolvedInitialRows(false)

    try {
      setColumnWidths(
        parseRequirementColumnWidths(
          globalThis.localStorage.getItem(columnWidthsStorageKey),
        ),
      )
    } catch {
      setColumnWidths({})
    } finally {
      setHydratedColumnWidthsStorageKey(columnWidthsStorageKey)
    }
  }, [columnWidthsStorageKey])

  useEffect(() => {
    if (!hasLoadedColumnPreferences) {
      return
    }

    try {
      globalThis.localStorage.setItem(
        REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
        serializeRequirementVisibleColumns(visibleColumns, {
          columnDefaults: normalizedColumnDefaults,
        }),
      )
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }
  }, [hasLoadedColumnPreferences, normalizedColumnDefaults, visibleColumns])

  useEffect(() => {
    if (hydratedColumnWidthsStorageKey !== columnWidthsStorageKey) {
      return
    }

    try {
      globalThis.localStorage.setItem(
        columnWidthsStorageKey,
        serializeRequirementColumnWidths(columnWidths),
      )
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }
  }, [columnWidths, columnWidthsStorageKey, hydratedColumnWidthsStorageKey])

  useEffect(() => {
    if (!columnPreferencesReady) {
      return
    }

    fetchData()
  }, [columnPreferencesReady, fetchData])

  const displayRows = useMemo(() => {
    if (pinnedRow && !rows.some(r => r.id === pinnedRow.id)) {
      const hasStatusSortMetadata =
        sortState.by !== 'status' ||
        statusOptions.some(option => option.sortOrder !== undefined)

      if (!hasStatusSortMetadata) {
        return [pinnedRow, ...rows]
      }

      const idx = rows.findIndex(
        row =>
          compareRequirementRows(row, pinnedRow, {
            locale,
            sort: sortState,
            statusOptions,
          }) > 0,
      )
      const pos = idx === -1 ? rows.length : idx
      return [...rows.slice(0, pos), pinnedRow, ...rows.slice(pos)]
    }
    return rows
  }, [locale, pinnedRow, rows, sortState, statusOptions])

  const pinnedIds = useMemo(
    () => (pinnedRow ? new Set([pinnedRow.id]) : undefined),
    [pinnedRow],
  )
  const shouldShowInitialLoadingState =
    !columnPreferencesReady || !hasResolvedInitialRows

  const handleExport = async () => {
    const params = buildRequirementListParams({
      filters,
      format: 'csv',
      locale,
      sort: sortState,
    })

    try {
      const res = await fetch(`/api/requirements?${params}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = locale === 'sv' ? 'kravkatalog.csv' : 'requirements.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      return
    }
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="relative overflow-hidden rounded-2xl border bg-white/80 shadow-sm backdrop-blur-sm dark:bg-secondary-900/60">
          {shouldShowInitialLoadingState ? (
            <div
              aria-live="polite"
              className="flex min-h-[20rem] flex-col items-center justify-center gap-3 px-6 py-16"
              data-testid="requirements-card-loading"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
              <p className="text-secondary-600 dark:text-secondary-400">
                {tc('loadingRequirements')}
              </p>
            </div>
          ) : (
            <RequirementsTable
              areas={areas}
              categories={categories}
              columnDefaults={normalizedColumnDefaults}
              columnWidths={columnWidths}
              expandedId={selectedId}
              filterValues={filters}
              floatingActions={[
                {
                  developerModeContext: 'requirements table',
                  developerModeValue: 'new requirement',
                  ariaLabel: t('newRequirement'),
                  href: '/kravkatalog/ny',
                  icon: <Plus aria-hidden="true" className="h-4 w-4" />,
                  id: 'create',
                  position: 'beforeColumns',
                  variant: 'primary',
                },
                {
                  developerModeContext: 'requirements table',
                  developerModeValue: 'print',
                  ariaLabel: tc('print'),
                  icon: <Printer aria-hidden="true" className="h-4 w-4" />,
                  id: 'print',
                  onClick: () => globalThis.print(),
                },
                {
                  developerModeContext: 'requirements table',
                  developerModeValue: 'export',
                  ariaLabel: tc('export'),
                  icon: <Download aria-hidden="true" className="h-4 w-4" />,
                  id: 'export',
                  onClick: handleExport,
                },
              ]}
              getName={getName}
              getStatusName={getStatusName}
              hasMore={hasMore}
              loading={loading}
              loadingMore={loadingMore}
              locale={locale}
              onColumnWidthsChange={setColumnWidths}
              onFilterChange={val => {
                setFilters(val)
                setSelectedId(null)
                setPinnedRow(null)
              }}
              onLoadMore={loadMore}
              onRowClick={id => {
                setSelectedId(prev => {
                  const next = prev === id ? null : id
                  if (prev !== id || next === null) setPinnedRow(null)
                  return next
                })
              }}
              onSortChange={setSortState}
              onVisibleColumnsChange={setVisibleColumns}
              pinnedIds={pinnedIds}
              qualityCharacteristics={qualityCharacteristics}
              renderExpanded={id => (
                <RequirementDetailClient
                  inline
                  onChange={refreshRows}
                  onClose={() => {
                    setSelectedId(null)
                    setPinnedRow(null)
                    fetchData()
                  }}
                  requirementId={id}
                />
              )}
              rows={displayRows}
              sortState={sortState}
              statusOptions={statusOptions}
              types={types}
              visibleColumns={visibleColumns}
            />
          )}
        </div>
      </div>
    </div>
  )
}
