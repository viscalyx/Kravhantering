'use client'

import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ExportButton from '@/components/ExportButton'
import PrintButton from '@/components/PrintButton'
import {
  DEFAULT_FILTERS,
  type FilterValues,
  type StatusOption,
} from '@/components/RequirementsFilter'
import RequirementsTable from '@/components/RequirementsTable'
import { Link } from '@/i18n/routing'
import RequirementDetailClient from './[id]/requirement-detail-client'

interface RequirementRow {
  area: {
    name: string
  } | null
  hasPendingVersion?: boolean
  id: number
  isArchived: boolean
  pendingVersionStatusColor?: string | null
  pendingVersionStatusId?: number | null
  uniqueId: string
  version: {
    description: string | null
    categoryNameSv: string | null
    categoryNameEn: string | null
    typeNameSv: string | null
    typeNameEn: string | null
    typeCategoryNameSv: string | null
    typeCategoryNameEn: string | null
    requiresTesting: boolean
    versionNumber: number
    status: number
    statusNameSv: string | null
    statusNameEn: string | null
    statusColor: string | null
  } | null
}

interface FilterOption {
  id: number
  nameEn: string
  nameSv: string
}

interface AreaOption {
  id: number
  name: string
}

interface TypeCategoryOption {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
}

const PAGE_SIZE = 200

function buildFilterParams(filters: FilterValues): URLSearchParams {
  const params = new URLSearchParams()
  params.set('limit', String(PAGE_SIZE))
  if (filters.uniqueIdSearch)
    params.set('uniqueIdSearch', filters.uniqueIdSearch)
  if (filters.descriptionSearch)
    params.set('descriptionSearch', filters.descriptionSearch)
  if (filters.areaIds) {
    for (const id of filters.areaIds) params.append('areaIds', String(id))
  }
  if (filters.categoryIds) {
    for (const id of filters.categoryIds)
      params.append('categoryIds', String(id))
  }
  if (filters.typeIds) {
    for (const id of filters.typeIds) params.append('typeIds', String(id))
  }
  if (filters.typeCategoryIds) {
    for (const id of filters.typeCategoryIds)
      params.append('typeCategoryIds', String(id))
  }
  if (filters.requiresTesting) {
    for (const v of filters.requiresTesting) params.append('requiresTesting', v)
  }
  if (filters.statuses) {
    for (const s of filters.statuses) params.append('statuses', String(s))
  }
  return params
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
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pinnedRow, setPinnedRow] = useState<RequirementRow | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Stable ref so the onChange callback always sees the latest selectedId
  const selectedIdRef = useRef<number | null>(null)
  selectedIdRef.current = selectedId

  const refreshRows = useCallback(async () => {
    const params = buildFilterParams(filters)

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
            id: number
            uniqueId: string
            isArchived: boolean
            area?: { name: string } | null
            requirementAreaId?: number
            versions?: {
              versionNumber: number
              description: string | null
              requiresTesting: boolean
              category?: { nameSv: string; nameEn: string } | null
              type?: { nameSv: string; nameEn: string } | null
              typeCategory?: { nameSv: string; nameEn: string } | null
              status: number
              statusNameSv: string | null
              statusNameEn: string | null
              statusColor: string | null
            }[]
          }
          const v = detail.versions?.[0]
          newPinnedRow = {
            id: detail.id,
            uniqueId: detail.uniqueId,
            isArchived: detail.isArchived,
            area: detail.area ?? null,
            version: v
              ? {
                  description: v.description,
                  categoryNameSv: v.category?.nameSv ?? null,
                  categoryNameEn: v.category?.nameEn ?? null,
                  typeNameSv: v.type?.nameSv ?? null,
                  typeNameEn: v.type?.nameEn ?? null,
                  typeCategoryNameSv: v.typeCategory?.nameSv ?? null,
                  typeCategoryNameEn: v.typeCategory?.nameEn ?? null,
                  requiresTesting: v.requiresTesting,
                  versionNumber: v.versionNumber,
                  status: v.status,
                  statusNameSv: v.statusNameSv,
                  statusNameEn: v.statusNameEn,
                  statusColor: v.statusColor,
                }
              : null,
          }
        }
      }

      // Batch both updates in one synchronous block to avoid intermediate renders
      setRows(newRows)
      setPinnedRow(newPinnedRow)
    }
  }, [filters])

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
      const params = buildFilterParams(filters)
      params.set('offset', String(rows.length))
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
  }, [filters, hasMore, loadingMore, rows.length])

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
    fetchData()
  }, [fetchData])

  const displayRows = useMemo(() => {
    if (pinnedRow && !rows.some(r => r.id === pinnedRow.id)) {
      // Insert at sorted position (rows are ordered by uniqueId)
      const idx = rows.findIndex(
        r => r.uniqueId.localeCompare(pinnedRow.uniqueId) > 0,
      )
      const pos = idx === -1 ? rows.length : idx
      return [...rows.slice(0, pos), pinnedRow, ...rows.slice(pos)]
    }
    return rows
  }, [rows, pinnedRow])

  const pinnedIds = useMemo(
    () => (pinnedRow ? new Set([pinnedRow.id]) : undefined),
    [pinnedRow],
  )

  const handleExport = async () => {
    const params = buildFilterParams(filters)
    params.set('format', 'csv')
    params.set('locale', locale)

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
        <div className="flex flex-wrap items-center gap-3 mb-6">
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
            expandedId={selectedId}
            filterValues={filters}
            getName={getName}
            getStatusName={getStatusName}
            hasMore={hasMore}
            loading={loading}
            loadingMore={loadingMore}
            locale={locale}
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
            statusOptions={statusOptions}
            typeCategories={typeCategories}
            types={types}
          />
        </div>
      </div>
    </div>
  )
}
