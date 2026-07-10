'use client'

import {
  Download,
  LibraryBig,
  Plus,
  Printer,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AiRequirementGenerator from '@/components/AiRequirementGenerator'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import RequirementsImportDialog, {
  type InitialRequirementsImport,
} from '@/components/RequirementsImportDialog'
import RequirementsTable from '@/components/RequirementsTable'
import { useServerPdfDownload } from '@/components/reports/pdf/useServerPdfDownload'
import {
  type AiRequirementGenerationAvailability,
  DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
} from '@/lib/ai/generation-availability'
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
  type PriorityLevelOption,
  parseRequirementColumnWidths,
  parseRequirementVisibleColumns,
  type QualityCharacteristicOption,
  REQUIREMENT_VISIBLE_COLUMNS_STORAGE_KEY,
  type RequirementColumnId,
  type RequirementColumnWidths,
  type RequirementListColumnDefault,
  type RequirementPackageOption,
  type RequirementRow,
  type RequirementSortState,
  type StatusOption,
  serializeRequirementColumnWidths,
  serializeRequirementVisibleColumns,
} from '@/lib/requirements/list-view'
import { STATUS_REVIEW } from '@/lib/requirements/status-constants.mjs'
import type { RequirementDetailResponse } from '@/lib/requirements/types'
import RequirementDetailClient from './[id]/requirement-detail-client'

const REQUIREMENTS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirements.overview.body',
      headingKey: 'requirements.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirements.inlineDetail.body',
      headingKey: 'requirements.inlineDetail.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.body',
      headingKey: 'requirements.properties.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.requirementId.body',
      headingKey: 'requirements.properties.requirementId.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.area.body',
      headingKey: 'requirements.properties.area.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.description.body',
      headingKey: 'requirements.properties.description.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.acceptanceCriteria.body',
      headingKey: 'requirements.properties.acceptanceCriteria.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.category.body',
      headingKey: 'requirements.properties.category.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.type.body',
      headingKey: 'requirements.properties.type.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.qualityCharacteristic.body',
      headingKey: 'requirements.properties.qualityCharacteristic.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.priorityLevel.body',
      headingKey: 'requirements.properties.priorityLevel.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.verifiable.body',
      headingKey: 'requirements.properties.verifiable.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.verificationMethod.body',
      headingKey: 'requirements.properties.verificationMethod.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.requirementPackages.body',
      headingKey: 'requirements.properties.requirementPackages.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.normReferences.body',
      headingKey: 'requirements.properties.normReferences.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.properties.status.body',
      headingKey: 'requirements.properties.status.heading',
      subheading: true,
    },
    {
      kind: 'text',
      bodyKey: 'requirements.filtering.body',
      headingKey: 'requirements.filtering.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirements.columns.body',
      headingKey: 'requirements.columns.heading',
    },
    {
      bodyKey: 'requirements.lifecycleVisual.body',
      headingKey: 'requirements.lifecycleVisual.heading',
      kind: 'visual',
      visualId: 'requirementLifecycle',
    },
    {
      kind: 'text',
      bodyKey: 'requirements.lifecycle.body',
      headingKey: 'requirements.lifecycle.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirements.actions.body',
      headingKey: 'requirements.actions.heading',
    },
  ],
  titleKey: 'requirements.title',
}

const PAGE_SIZE = 200

type RequirementDetailRowSource = RequirementDetailResponse & {
  hasPendingVersion?: boolean
  pendingVersionStatusColor?: string | null
  pendingVersionStatusIconName?: string | null
  pendingVersionStatusId?: number | null
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
    pendingVersionStatusIconName: detail.pendingVersionStatusIconName ?? null,
    pendingVersionStatusId: detail.pendingVersionStatusId ?? null,
    uniqueId: detail.uniqueId,
    version: version
      ? {
          categoryNameEn: version.category?.nameEn ?? null,
          categoryNameSv: version.category?.nameSv ?? null,
          description: version.description,
          verifiable: version.verifiable,
          revisionToken: version.revisionToken,
          status: version.status,
          statusColor: version.statusColor,
          statusIconName: version.statusIconName,
          statusNameEn: version.statusNameEn,
          statusNameSv: version.statusNameSv,
          archiveInitiatedAt: version.archiveInitiatedAt,
          qualityCharacteristicNameEn:
            version.qualityCharacteristic?.nameEn ?? null,
          qualityCharacteristicNameSv:
            version.qualityCharacteristic?.nameSv ?? null,
          priorityLevelId: version.priorityLevel?.id ?? null,
          priorityLevelNameEn: version.priorityLevel?.nameEn ?? null,
          priorityLevelNameSv: version.priorityLevel?.nameSv ?? null,
          priorityLevelColor: version.priorityLevel?.color ?? null,
          priorityLevelIconName: version.priorityLevel?.iconName ?? null,
          priorityLevelSortOrder: version.priorityLevel?.sortOrder ?? null,
          typeNameEn: version.type?.nameEn ?? null,
          typeNameSv: version.type?.nameSv ?? null,
          versionNumber: version.versionNumber,
        }
      : null,
  }
}

function selectionMatchesRequirementRow(
  selection: number | string | null,
  row: Pick<RequirementRow, 'id' | 'uniqueId'>,
) {
  return selection === row.id || selection === row.uniqueId
}

export default function RequirementsClient({
  aiGenerationAvailability = DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
  initialColumnDefaults,
}: {
  aiGenerationAvailability?: AiRequirementGenerationAvailability
  initialColumnDefaults?: RequirementListColumnDefault[]
}) {
  useHelpContent(REQUIREMENTS_HELP)
  const tc = useTranslations('common')
  const t = useTranslations('requirement')
  const tn = useTranslations('nav')
  const locale = useLocale()
  const pdfDownload = useServerPdfDownload()
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
  const [priorityLevels, setPriorityLevels] = useState<PriorityLevelOption[]>(
    [],
  )
  const [requirementPackages, setRequirementPackages] = useState<
    RequirementPackageOption[]
  >([])
  const [normReferenceOptions, setNormReferenceOptions] = useState<
    { id: number; normReferenceId: string; name: string }[]
  >([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
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
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [aiInitialImport, setAiInitialImport] =
    useState<InitialRequirementsImport | null>(null)
  const isAiGenerationEnabled =
    aiGenerationAvailability.effectiveRequirementGenerationEnabled
  const hasAuthorableRequirementArea = areas.some(
    area => area.permissions?.canAuthor !== false,
  )
  const canOpenAiGeneration =
    isAiGenerationEnabled && hasAuthorableRequirementArea
  const aiGenerationDisabledTooltip = !isAiGenerationEnabled
    ? aiGenerationAvailability.disabledByEnvironment
      ? t('aiGenerateDisabledByEnvironment')
      : t('aiGenerateDisabledByAdmin')
    : hasAuthorableRequirementArea
      ? undefined
      : t('aiGenerateDisabledNoAuthorableArea')
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

      const isCurrentRowsRequest = () =>
        requestId === latestRowsRequestIdRef.current
      const hasCurrentPinnedSelection = (
        row?: Pick<RequirementRow, 'id' | 'uniqueId'>,
      ) =>
        isCurrentRowsRequest() &&
        (selectedIdRef.current === sid ||
          (row
            ? selectionMatchesRequirementRow(selectedIdRef.current, row)
            : false))

      try {
        const singleRes = await fetch(`/api/requirements/${sid}`)
        if (singleRes.ok && isCurrentRowsRequest()) {
          const detail = (await singleRes.json()) as RequirementDetailRowSource
          const row = mapRequirementDetailToRow(detail)
          if (hasCurrentPinnedSelection(row)) {
            newPinnedRow = row
            resolvedNumericId = detail.id
          }
        } else if (!singleRes.ok && hasCurrentPinnedSelection()) {
          if (!inResults) {
            selectedIdRef.current = null
            setSelectedId(null)
            scrollToIdRef.current = null
          }
        }
      } catch {
        if (hasCurrentPinnedSelection()) {
          if (!inResults) {
            selectedIdRef.current = null
            setSelectedId(null)
            scrollToIdRef.current = null
          }
        }
      }
    }

    if (requestId !== latestRowsRequestIdRef.current) {
      return
    }

    // Keep selectedId numeric after row/detail refreshes.
    if (resolvedNumericId != null) {
      selectedIdRef.current = resolvedNumericId
      setSelectedId(resolvedNumericId)
      // URL-selected uniqueIds need one scroll after hydration. Normal numeric
      // selection refreshes, such as lifecycle transitions, should preserve
      // the user's current detail position.
      if (typeof sid === 'string') {
        scrollToIdRef.current = resolvedNumericId
      }
    }

    // Batch both updates in one synchronous block to avoid intermediate renders
    setHasMore(nextHasMore)
    setRows(newRows)
    setPinnedRow(newPinnedRow)
  }, [filters, locale, sortState])

  const applyChangedRequirementDetail = useCallback(
    (
      detail: RequirementDetailRowSource,
      initiatingSelectedId: number | string | null,
    ) => {
      const changedRow = mapRequirementDetailToRow(detail)
      const canApplySelection =
        selectedIdRef.current === initiatingSelectedId &&
        selectionMatchesRequirementRow(initiatingSelectedId, changedRow)

      if (canApplySelection) {
        selectedIdRef.current = changedRow.id
        setSelectedId(changedRow.id)
        setPinnedRow(changedRow)
      }
      setRows(previousRows =>
        previousRows.some(row => row.id === changedRow.id)
          ? previousRows.map(row =>
              row.id === changedRow.id ? changedRow : row,
            )
          : previousRows,
      )

      return canApplySelection ? changedRow : undefined
    },
    [],
  )

  const handleRequirementChange = useCallback(
    async (
      initiatingSelectedId: number | string | null,
      detail?: RequirementDetailRowSource,
    ) => {
      const changedRow = detail
        ? applyChangedRequirementDetail(detail, initiatingSelectedId)
        : undefined

      await refreshRows()

      if (changedRow && selectedIdRef.current === changedRow.id) {
        setPinnedRow(changedRow)
        setRows(previousRows =>
          previousRows.some(row => row.id === changedRow.id)
            ? previousRows.map(row =>
                row.id === changedRow.id ? changedRow : row,
              )
            : previousRows,
        )
      }
    },
    [applyChangedRequirementDetail, refreshRows],
  )

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

    let cancelled = false
    const numId = Number(sel)
    const numericSelectedId =
      !Number.isNaN(numId) && Number.isInteger(numId) && numId > 0
        ? numId
        : null
    const urlSelectionStillCurrent = () =>
      !cancelled &&
      (selectedIdRef.current === sel ||
        (numericSelectedId != null &&
          selectedIdRef.current === numericSelectedId))

    if (numericSelectedId != null) {
      // Numeric id — set synchronously
      setSelectedId(numericSelectedId)
      selectedIdRef.current = numericSelectedId
      scrollToIdRef.current = numericSelectedId
    } else {
      // UniqueId string — keep the ref stable until the detail fetch resolves
      // the numeric id used by the inline detail row.
      selectedIdRef.current = sel
    }

    const hydrateSelectedRequirement = async () => {
      try {
        const singleRes = await fetch(
          `/api/requirements/${encodeURIComponent(sel)}`,
        )
        if (!singleRes.ok || !urlSelectionStillCurrent()) return

        const detail = (await singleRes.json()) as RequirementDetailRowSource
        if (!urlSelectionStillCurrent()) return

        const row = mapRequirementDetailToRow(detail)
        selectedIdRef.current = row.id
        setSelectedId(row.id)
        setPinnedRow(row)
        scrollToIdRef.current = row.id
      } catch {
        return
      }
    }

    const resolveSelectedRequirement = async () => {
      await Promise.allSettled([hydrateSelectedRequirement(), refreshRows()])
      if (cancelled) return

      // Clean up the params after hydration so selected-row pinning cannot be
      // cancelled before the row is available in the table.
      const url = new URL(window.location.href)
      url.searchParams.delete('selected')
      window.history.replaceState({}, '', url.toString())
    }

    void resolveSelectedRequirement()

    return () => {
      cancelled = true
    }
  }, [searchParams, refreshRows])

  // Scroll to the selected requirement once the expanded detail row is in the
  // DOM. This effect runs after React commits a render that includes the new
  // pinnedRow / rows, so the element exists by the time we look for it.
  // We also depend on hasResolvedInitialRows because the table is hidden behind
  // a loading spinner until that flag is true — without it the effect could fire
  // when rows/pinnedRow are set but before the table is actually rendered.
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
        requirementPackagesRes,
        priorityLevelsRes,
      ] = await Promise.allSettled([
        fetch('/api/requirement-areas'),
        fetch('/api/requirement-categories'),
        fetch('/api/requirement-types'),
        fetch('/api/quality-characteristics'),
        fetch('/api/requirement-statuses'),
        fetch('/api/requirement-packages'),
        fetch('/api/priority-levels'),
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
      const requirementPackagesData = await readFilterResponse<{
        requirementPackages?: RequirementPackageOption[]
      }>(requirementPackagesRes)
      if (requirementPackagesData) {
        setRequirementPackages(
          requirementPackagesData.requirementPackages ?? [],
        )
      }
      const priorityLevelsData = await readFilterResponse<{
        priorityLevels?: PriorityLevelOption[]
      }>(priorityLevelsRes)
      if (priorityLevelsData) {
        setPriorityLevels(priorityLevelsData.priorityLevels ?? [])
      }
    }

    void fetchFilters()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const statuses = filters.statuses ?? []
    const params = new URLSearchParams()
    params.set('linked', 'true')
    for (const s of statuses) {
      params.append('statuses', String(s))
    }
    fetch(`/api/norm-references?${params}`, { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then((data: unknown) => {
        if (controller.signal.aborted) return
        const typed = data as {
          normReferences?: {
            id: number
            normReferenceId: string
            name: string
          }[]
        } | null
        setNormReferenceOptions(typed?.normReferences ?? [])
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setNormReferenceOptions([])
        }
      })
    return () => controller.abort()
  }, [filters.statuses])

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
    if (!pinnedRow) return rows

    const existingPinnedRowIndex = rows.findIndex(r => r.id === pinnedRow.id)
    if (existingPinnedRowIndex !== -1) {
      return rows.map(row => (row.id === pinnedRow.id ? pinnedRow : row))
    }

    if (pinnedRow) {
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

  const selectedRows = useMemo(
    () => rows.filter(r => selectedIds.has(r.id)),
    [rows, selectedIds],
  )
  const listReportPdfUrl = useMemo(() => {
    const params = buildRequirementListParams({
      filters,
      locale,
      sort: sortState,
    })
    return `/${locale}/requirements/reports/pdf/list?${params}`
  }, [filters, locale, sortState])
  const hasReviewVersion = (r: RequirementRow) =>
    r.version?.status === STATUS_REVIEW ||
    r.pendingVersionStatusId === STATUS_REVIEW
  const anySelectedIsReview = selectedRows.some(hasReviewVersion)
  const allSelectedAreReview =
    selectedRows.length > 0 && selectedRows.every(hasReviewVersion)

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
      a.download =
        locale === 'sv' ? 'kravbibliotek.csv' : 'requirements-library.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      return
    }
  }

  const requirementsTableContent = shouldShowInitialLoadingState ? (
    <div
      aria-live="polite"
      className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-16"
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
      columnPickerPlacement="end"
      columnWidths={columnWidths}
      excludeColumns={['needsReference', 'specificationItemStatus']}
      expandedId={selectedId}
      filterValues={filters}
      floatingActionRailPlacement="inline-top"
      floatingActions={[
        {
          developerModeContext: 'requirements table',
          developerModeValue: 'new requirement',
          ariaLabel: t('newRequirement'),
          href: '/requirements/new',
          icon: <Plus aria-hidden="true" className="h-4 w-4" />,
          id: 'create',
          position: 'beforeColumns',
          variant: 'primary',
        },
        {
          developerModeContext: 'requirements table',
          developerModeValue: 'ai generate',
          ariaLabel: t('aiGenerate'),
          disabled: !canOpenAiGeneration,
          icon: <Sparkles aria-hidden="true" className="h-4 w-4" />,
          id: 'ai-generate',
          onClick: () => {
            if (canOpenAiGeneration) setAiModalOpen(true)
          },
          position: 'beforeColumns',
          tooltip: aiGenerationDisabledTooltip ?? t('aiGenerate'),
        },
        {
          badge:
            selectedIds.size > 0 && anySelectedIsReview
              ? selectedIds.size
              : undefined,
          developerModeContext: 'requirements table',
          developerModeValue: 'reports',
          ariaLabel: tc('reports'),
          icon: <Printer aria-hidden="true" className="h-4 w-4" />,
          id: 'reports',
          menuItems: [
            {
              id: 'pdf-list',
              label: t('downloadListReportPdf'),
              onClick: () =>
                void pdfDownload.download({
                  fallbackFilename: 'requirements-list.pdf',
                  url: listReportPdfUrl,
                }),
            },
            ...(selectedIds.size > 0 && anySelectedIsReview
              ? [
                  {
                    badge: selectedIds.size,
                    description: !allSelectedAreReview
                      ? t('reviewReportAllMustBeReview')
                      : undefined,
                    disabled: !allSelectedAreReview,
                    id: 'review-report-pdf',
                    label: t('downloadCombinedReportPdf'),
                    onClick: () =>
                      void pdfDownload.download({
                        fallbackFilename: 'combined-review-report.pdf',
                        url: `/${locale}/requirements/reports/pdf/review-combined?ids=${Array.from(selectedIds).join(',')}`,
                      }),
                    tooltip: !allSelectedAreReview
                      ? t('reviewReportAllMustBeReview')
                      : undefined,
                  },
                ]
              : []),
          ],
          tooltip: tc('reports'),
          variant:
            selectedIds.size > 0 && anySelectedIsReview ? 'warning' : undefined,
        },
        {
          developerModeContext: 'requirements table',
          developerModeValue: 'import requirements',
          ariaLabel: t('importRequirements'),
          icon: <Upload aria-hidden="true" className="h-4 w-4" />,
          id: 'import',
          onClick: () => setImportDialogOpen(true),
          position: 'afterColumns',
          tooltip: t('importRequirements'),
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
      normReferences={normReferenceOptions}
      onColumnWidthsChange={setColumnWidths}
      onFilterChange={val => {
        setFilters(val)
        selectedIdRef.current = null
        setSelectedId(null)
        setPinnedRow(null)
        setSelectedIds(new Set())
      }}
      onLoadMore={loadMore}
      onRowClick={id => {
        const previousSelectedId = selectedIdRef.current
        const nextSelectedId = previousSelectedId === id ? null : id
        selectedIdRef.current = nextSelectedId
        setSelectedId(nextSelectedId)
        if (previousSelectedId !== id || nextSelectedId === null) {
          setPinnedRow(null)
        }
      }}
      onSelectionChange={setSelectedIds}
      onSortChange={setSortState}
      onVisibleColumnsChange={setVisibleColumns}
      pinnedIds={pinnedIds}
      priorityLevels={priorityLevels}
      qualityCharacteristics={qualityCharacteristics}
      renderExpanded={id => (
        <RequirementDetailClient
          inline
          onChange={detail => handleRequirementChange(id, detail)}
          onClose={() => {
            selectedIdRef.current = null
            setSelectedId(null)
            setPinnedRow(null)
            fetchData()
          }}
          requirementId={id}
        />
      )}
      requirementPackages={requirementPackages}
      rows={displayRows}
      selectable
      selectedIds={selectedIds}
      sortState={sortState}
      statusOptions={statusOptions}
      stickyTitle={
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-secondary-950/10 bg-white text-secondary-900 shadow-sm dark:border-white/10 dark:bg-[#1c1c20] dark:text-white">
            <LibraryBig aria-hidden="true" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-secondary-950 dark:text-white">
              {tn('catalog')}
            </span>
          </span>
        </div>
      }
      types={types}
      visibleColumns={visibleColumns}
    />
  )

  const requirementsWorkbench = (
    <div className="mx-auto w-full max-w-384">
      <div
        className="relative rounded-lg border border-secondary-950/10 bg-white shadow-[0_24px_70px_-52px_rgba(0,0,0,0.65)] dark:border-white/10 dark:bg-[#111113]"
        data-requirements-workbench="true"
      >
        {requirementsTableContent}
      </div>
    </div>
  )

  return (
    <>
      <div className="min-h-[calc(100vh-3rem)] bg-[#fbfbfd] px-3 py-3 sm:px-5 lg:px-7 dark:bg-[#111113]">
        {requirementsWorkbench}
      </div>
      {pdfDownload.dialog}
      <AiRequirementGenerator
        aiGenerationAvailability={aiGenerationAvailability}
        areas={areas}
        onClose={() => setAiModalOpen(false)}
        onImportPreview={(payload, options) => {
          setAiInitialImport({
            areaId: options.areaId,
            key: `ai-${Date.now()}`,
            payload,
            preview: options.preview,
          })
          setAiModalOpen(false)
          setImportDialogOpen(true)
        }}
        open={aiModalOpen}
      />
      <RequirementsImportDialog
        areas={areas}
        initialImport={aiInitialImport}
        mode="library"
        onClose={importSucceeded => {
          setImportDialogOpen(false)
          setAiInitialImport(null)
          if (importSucceeded) {
            void fetchData()
          }
        }}
        open={importDialogOpen}
      />
    </>
  )
}
