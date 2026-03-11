'use client'

import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ExportButton from '@/components/ExportButton'
import PrintButton from '@/components/PrintButton'
import RequirementsTable from '@/components/RequirementsTable'
import { Link } from '@/i18n/routing'
import {
  type AreaOption,
  buildRequirementListParams,
  compareRequirementRows,
  DEFAULT_FILTERS,
  DEFAULT_REQUIREMENT_SORT,
  DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  type FilterOption,
  type FilterValues,
  getRequirementColumnWidthsStorageKey,
  parseRequirementColumnWidths,
  parseRequirementVisibleColumns,
  REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
  type RequirementColumnId,
  type RequirementColumnWidths,
  type RequirementRow,
  type RequirementSortState,
  type StatusOption,
  serializeRequirementColumnWidths,
  serializeRequirementVisibleColumns,
  type TypeCategoryOption,
} from '@/lib/requirements/list-view'
import RequirementDetailClient from './[id]/requirement-detail-client'

const PAGE_SIZE = 200

function mapRequirementDetailToRow(detail: {
  area?: { name: string } | null
  id: number
  isArchived: boolean
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
    typeCategory?: { nameEn: string; nameSv: string } | null
    versionNumber: number
  }[]
}): RequirementRow {
  const version = detail.versions?.[0]

  return {
    area: detail.area ?? null,
    id: detail.id,
    isArchived: detail.isArchived,
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
          typeCategoryNameEn: version.typeCategory?.nameEn ?? null,
          typeCategoryNameSv: version.typeCategory?.nameSv ?? null,
          typeNameEn: version.type?.nameEn ?? null,
          typeNameSv: version.type?.nameSv ?? null,
          versionNumber: version.versionNumber,
        }
      : null,
  }
}

export default function KravkatalogClient() {
  const t = useTranslations('requirement')
  const locale = useLocale()

  const [rows, setRows] = useState<RequirementRow[]>([])
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [categories, setCategories] = useState<FilterOption[]>([])
  const [types, setTypes] = useState<FilterOption[]>([])
  const [typeCategories, setTypeCategories] = useState<TypeCategoryOption[]>([])
  const [statusOptions, setStatusOptions] = useState<StatusOption[]>([])
  const [filters, setFilters] = useState<FilterValues>(DEFAULT_FILTERS)
  const [sortState, setSortState] = useState<RequirementSortState>(
    DEFAULT_REQUIREMENT_SORT,
  )
  const [visibleColumns, setVisibleColumns] = useState<RequirementColumnId[]>(
    DEFAULT_VISIBLE_REQUIREMENT_COLUMNS,
  )
  const [columnWidths, setColumnWidths] = useState<RequirementColumnWidths>({})
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pinnedRow, setPinnedRow] = useState<RequirementRow | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasLoadedColumnPreferences, setHasLoadedColumnPreferences] =
    useState(false)
  const [hydratedColumnWidthsStorageKey, setHydratedColumnWidthsStorageKey] =
    useState<string | null>(null)
  const columnWidthsStorageKey = getRequirementColumnWidthsStorageKey(locale)

  // Stable ref so the onChange callback always sees the latest selectedId
  const selectedIdRef = useRef<number | null>(null)
  selectedIdRef.current = selectedId

  const refreshRows = useCallback(async () => {
    const params = buildRequirementListParams({
      filters,
      limit: PAGE_SIZE,
      locale,
      sort: sortState,
    })

    const res = await fetch(`/api/requirements?${params}`)
    if (res.ok) {
      const data = (await res.json()) as {
        pagination?: { hasMore?: boolean }
        requirements?: RequirementRow[]
      }
      const newRows = data.requirements ?? []
      setHasMore(data.pagination?.hasMore ?? false)

      // If an expanded row is no longer in the filtered results, pin it
      const sid = selectedIdRef.current
      let newPinnedRow: RequirementRow | null = null

      if (sid != null && !newRows.some(r => r.id === sid)) {
        const singleRes = await fetch(`/api/requirements/${sid}`)
        if (singleRes.ok) {
          const detail = (await singleRes.json()) as {
            area?: { name: string } | null
            id: number
            isArchived: boolean
            uniqueId: string
            versions?: {
              category?: { nameSv: string; nameEn: string } | null
              description: string | null
              requiresTesting: boolean
              status: number
              statusColor: string | null
              statusNameEn: string | null
              statusNameSv: string | null
              type?: { nameSv: string; nameEn: string } | null
              typeCategory?: { nameSv: string; nameEn: string } | null
              versionNumber: number
            }[]
          }
          newPinnedRow = mapRequirementDetailToRow(detail)
        }
      }

      // Batch both updates in one synchronous block to avoid intermediate renders
      setRows(newRows)
      setPinnedRow(newPinnedRow)
    }
  }, [filters, locale, sortState])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      await refreshRows()
    } finally {
      setLoading(false)
    }
  }, [refreshRows])

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const params = buildRequirementListParams({
        filters,
        limit: PAGE_SIZE,
        locale,
        offset: rows.length,
        sort: sortState,
      })
      const res = await fetch(`/api/requirements?${params}`)
      if (res.ok) {
        const data = (await res.json()) as {
          pagination?: { hasMore?: boolean }
          requirements?: RequirementRow[]
        }
        const moreRows = data.requirements ?? []
        setHasMore(data.pagination?.hasMore ?? false)
        setRows(prev => [...prev, ...moreRows])
      }
    } finally {
      setLoadingMore(false)
    }
  }, [filters, hasMore, loadingMore, locale, rows.length, sortState])

  const fetchFilters = useCallback(async () => {
    const [areasRes, categoriesRes, typesRes, typeCategoriesRes, statusesRes] =
      await Promise.all([
        fetch('/api/requirement-areas'),
        fetch('/api/requirement-categories'),
        fetch('/api/requirement-types'),
        fetch('/api/requirement-type-categories'),
        fetch('/api/requirement-statuses'),
      ])
    if (areasRes.ok) {
      const data = (await areasRes.json()) as { areas?: AreaOption[] }
      setAreas(data.areas ?? [])
    }
    if (categoriesRes.ok) {
      const data = (await categoriesRes.json()) as {
        categories?: FilterOption[]
      }
      setCategories(data.categories ?? [])
    }
    if (typesRes.ok) {
      const data = (await typesRes.json()) as { types?: FilterOption[] }
      setTypes(data.types ?? [])
    }
    if (typeCategoriesRes.ok) {
      const data = (await typeCategoriesRes.json()) as {
        typeCategories?: TypeCategoryOption[]
      }
      setTypeCategories(data.typeCategories ?? [])
    }
    if (statusesRes.ok) {
      const data = (await statusesRes.json()) as {
        statuses?: StatusOption[]
      }
      setStatusOptions(data.statuses ?? [])
    }
  }, [])

  const getName = (opt: FilterOption) =>
    locale === 'sv' ? opt.nameSv : opt.nameEn

  const getStatusName = (opt: StatusOption) =>
    locale === 'sv' ? opt.nameSv : opt.nameEn

  useEffect(() => {
    fetchFilters()
  }, [fetchFilters])

  useEffect(() => {
    try {
      setVisibleColumns(
        parseRequirementVisibleColumns(
          globalThis.localStorage.getItem(
            REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
          ),
        ),
      )
    } catch {
      setVisibleColumns(DEFAULT_VISIBLE_REQUIREMENT_COLUMNS)
    } finally {
      setHasLoadedColumnPreferences(true)
    }
  }, [])

  useEffect(() => {
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
        serializeRequirementVisibleColumns(visibleColumns),
      )
    } catch {
      // Ignore storage failures and keep the in-memory preference.
    }
  }, [hasLoadedColumnPreferences, visibleColumns])

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
    fetchData()
  }, [fetchData])

  const displayRows = useMemo(() => {
    if (pinnedRow && !rows.some(r => r.id === pinnedRow.id)) {
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

  const handleExport = async () => {
    const params = buildRequirementListParams({
      filters,
      format: 'csv',
      limit: PAGE_SIZE,
      locale,
      sort: sortState,
    })

    const res = await fetch(`/api/requirements?${params}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = locale === 'sv' ? 'kravkatalog.csv' : 'requirements.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <ExportButton onClick={handleExport} />
          <PrintButton />
          <Link
            className="btn-primary inline-flex items-center gap-1.5 ml-auto"
            href="/kravkatalog/ny"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('newRequirement')}
          </Link>
        </div>

        <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm">
          <RequirementsTable
            areas={areas}
            categories={categories}
            columnWidths={columnWidths}
            expandedId={selectedId}
            filterValues={filters}
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
                if (next === null) setPinnedRow(null)
                return next
              })
            }}
            onSortChange={setSortState}
            onVisibleColumnsChange={setVisibleColumns}
            pinnedIds={pinnedIds}
            renderExpanded={id => (
              <RequirementDetailClient
                inline
                onChange={refreshRows}
                onClose={() => {
                  setSelectedId(null)
                  fetchData()
                }}
                requirementId={id}
              />
            )}
            rows={displayRows}
            sortState={sortState}
            statusOptions={statusOptions}
            typeCategories={typeCategories}
            types={types}
            visibleColumns={visibleColumns}
          />
        </div>
      </div>
    </div>
  )
}
