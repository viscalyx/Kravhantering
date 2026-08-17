'use client'

import {
  AlertTriangle,
  Download,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useGeneratedOutputDownload } from '@/components/generated-output/useGeneratedOutputDownload'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import LazyAiRequirementGenerator from '@/components/LazyAiRequirementGenerator'
import LazyRequirementsImportDialog, {
  type InitialRequirementsImport,
} from '@/components/LazyRequirementsImportDialog'
import RequirementsTable from '@/components/RequirementsTable'
import { useRequirementDetailPrefetchIntent } from '@/hooks/useRequirementDetailPrefetchIntent'
import {
  type AiRequirementGenerationAvailability,
  DEFAULT_AI_REQUIREMENT_GENERATION_AVAILABILITY,
} from '@/lib/ai/generation-availability'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import {
  createLibraryRequirementDetailCache,
  type DetailPrefetchIntentTarget,
  type DetailPrefetchTarget,
  type RequirementDetailPrefetchContext,
} from '@/lib/requirements/detail-prefetch'
import {
  hasRequirementListSnapshot,
  INITIAL_REQUIREMENT_LIST_RESOURCE_STATE,
  isRequirementListRequestActive,
  requirementListResourceReducer,
} from '@/lib/requirements/list-resource-state'
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
      bodyKey: 'requirements.recovery.body',
      headingKey: 'requirements.recovery.heading',
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
          priorityLevelCode: version.priorityLevel?.code ?? null,
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
  const requirementListRefreshedMessage = tc('requirementListRefreshed')
  const locale = useLocale()
  const pdfDownload = useGeneratedOutputDownload()
  const detailCache = useMemo(createLibraryRequirementDetailCache, [])
  const {
    activate: activateDetailIntent,
    cancel: cancelDetailIntent,
    schedule: scheduleDetailIntent,
  } = useRequirementDetailPrefetchIntent()
  useEffect(() => () => detailCache.dispose(), [detailCache])
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
  const [requirementPackageCatalogStatus, setRequirementPackageCatalogStatus] =
    useState<'failed' | 'loaded' | 'loading'>('loading')
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
  const [resourceState, dispatchResourceState] = useReducer(
    requirementListResourceReducer,
    INITIAL_REQUIREMENT_LIST_RESOURCE_STATE,
  )
  const searchParams = useSearchParams()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [pinnedRow, setPinnedRow] = useState<RequirementRow | null>(null)
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const aiReturnFocusTargetRef = useRef<HTMLElement | null>(null)
  const importReturnFocusTargetRef = useRef<HTMLElement | null>(null)
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
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [paginationNotice, setPaginationNotice] = useState<string | null>(null)
  const [hasLoadedColumnPreferences, setHasLoadedColumnPreferences] =
    useState(false)
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
  const rowsAbortRef = useRef<AbortController | null>(null)
  const rowsRetryRef = useRef<HTMLButtonElement>(null)
  const scrollToIdRef = useRef<number | null>(null)

  const libraryDetailContext: RequirementDetailPrefetchContext = useMemo(
    () => ({
      resource: 'library-requirement',
      surface: 'requirements-library',
    }),
    [],
  )
  const libraryTarget = useCallback(
    (row: RequirementRow): DetailPrefetchTarget => ({
      ...libraryDetailContext,
      key: String(row.id),
    }),
    [libraryDetailContext],
  )
  const libraryIntentTarget = useCallback(
    (
      row: RequirementRow,
      trigger: DetailPrefetchIntentTarget['trigger'],
    ): DetailPrefetchIntentTarget => ({
      ...libraryTarget(row),
      trigger,
    }),
    [libraryTarget],
  )

  useEffect(() => {
    if (typeof selectedIdRef.current !== 'string') {
      selectedIdRef.current = selectedId
    }
  }, [selectedId])

  const refreshRows = useCallback(
    async ({
      recoveringInvalidCursor = false,
      restoreRetryFocusOnFailure = false,
    }: {
      recoveringInvalidCursor?: boolean
      restoreRetryFocusOnFailure?: boolean
    } = {}): Promise<boolean> => {
      const requestId = ++latestRowsRequestIdRef.current
      rowsAbortRef.current?.abort()
      const controller = new AbortController()
      rowsAbortRef.current = controller
      dispatchResourceState({
        type: recoveringInvalidCursor
          ? 'cursor-recovery-started'
          : 'refresh-started',
      })
      setPaginationNotice(null)
      const params = buildRequirementListParams({
        filters,
        limit: PAGE_SIZE,
        locale,
        sort: sortState,
      })

      try {
        const res = await apiFetch(`/api/requirements?${params}`, {
          signal: controller.signal,
        })
        if (res.status === 401) {
          if (requestId === latestRowsRequestIdRef.current) {
            dispatchResourceState({ type: 'authentication-expired' })
            latestRowsRequestIdRef.current += 1
            controller.abort()
            if (rowsAbortRef.current === controller) {
              rowsAbortRef.current = null
            }
          }
          return false
        }
        if (!res.ok) {
          throw new Error('Requirements request failed')
        }
        const data = (await res.json()) as {
          pagination?: { hasMore?: boolean; nextCursor?: string | null }
          requirements?: RequirementRow[]
        }
        if (
          controller.signal.aborted ||
          requestId !== latestRowsRequestIdRef.current
        ) {
          return false
        }

        const newRows = Array.from(
          new Map(
            (data.requirements ?? []).map(row => [row.id, row] as const),
          ).values(),
        )
        const nextHasMore = data.pagination?.hasMore ?? false
        const refreshedCursor = data.pagination?.nextCursor ?? null

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

          if (typeof sid === 'string' && inResults) {
            const match = newRows.find(r => r.uniqueId === sid)
            if (match) resolvedNumericId = match.id
          }

          const isCurrentRowsRequest = () =>
            !controller.signal.aborted &&
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
            const singleRes = await apiFetch(`/api/requirements/${sid}`, {
              signal: controller.signal,
            })
            if (singleRes.status === 401) {
              if (requestId === latestRowsRequestIdRef.current) {
                dispatchResourceState({ type: 'authentication-expired' })
                latestRowsRequestIdRef.current += 1
                controller.abort()
                if (rowsAbortRef.current === controller) {
                  rowsAbortRef.current = null
                }
              }
              return false
            }
            if (singleRes.ok && isCurrentRowsRequest()) {
              const detail =
                (await singleRes.json()) as RequirementDetailRowSource
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
            if (hasCurrentPinnedSelection() && !inResults) {
              selectedIdRef.current = null
              setSelectedId(null)
              scrollToIdRef.current = null
            }
          }
        }

        if (
          controller.signal.aborted ||
          requestId !== latestRowsRequestIdRef.current
        ) {
          return false
        }

        if (resolvedNumericId != null) {
          selectedIdRef.current = resolvedNumericId
          setSelectedId(resolvedNumericId)
          if (typeof sid === 'string') {
            scrollToIdRef.current = resolvedNumericId
          }
        }

        setHasMore(nextHasMore)
        setNextCursor(refreshedCursor)
        setRows(newRows)
        setPinnedRow(newPinnedRow)
        dispatchResourceState({ type: 'refresh-succeeded' })
        if (recoveringInvalidCursor) {
          setPaginationNotice(requirementListRefreshedMessage)
        }
        return true
      } catch {
        if (
          controller.signal.aborted ||
          requestId !== latestRowsRequestIdRef.current
        ) {
          return false
        }
        if (recoveringInvalidCursor) {
          dispatchResourceState({ type: 'cursor-recovery-failed' })
        } else {
          dispatchResourceState({ type: 'refresh-failed' })
        }
        if (restoreRetryFocusOnFailure) {
          requestAnimationFrame(() => rowsRetryRef.current?.focus())
        }
        return false
      } finally {
        if (requestId === latestRowsRequestIdRef.current) {
          if (rowsAbortRef.current === controller) {
            rowsAbortRef.current = null
          }
        }
      }
    },
    [filters, locale, requirementListRefreshedMessage, sortState],
  )

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
    await refreshRows()
  }, [refreshRows])

  const requestAdditionalPage = useCallback(
    async (
      cursor: string,
      { restoreRetryFocusOnFailure = false } = {},
    ): Promise<boolean> => {
      const requestId = ++latestRowsRequestIdRef.current
      rowsAbortRef.current?.abort()
      const controller = new AbortController()
      rowsAbortRef.current = controller
      dispatchResourceState({ cursor, type: 'page-started' })
      setPaginationNotice(null)
      try {
        const params = buildRequirementListParams({
          cursor,
          filters,
          limit: PAGE_SIZE,
          locale,
          sort: sortState,
        })
        const res = await apiFetch(`/api/requirements?${params}`, {
          signal: controller.signal,
        })
        if (
          controller.signal.aborted ||
          requestId !== latestRowsRequestIdRef.current
        ) {
          return false
        }
        if (res.status === 401) {
          dispatchResourceState({ type: 'authentication-expired' })
          latestRowsRequestIdRef.current += 1
          controller.abort()
          if (rowsAbortRef.current === controller) {
            rowsAbortRef.current = null
          }
          return false
        }
        if (res.status === 400) {
          const body = (await res
            .clone()
            .json()
            .catch(() => null)) as { code?: string } | null
          if (body?.code === 'invalid_cursor') {
            await refreshRows({ recoveringInvalidCursor: true })
            return false
          }
        }
        if (!res.ok) {
          throw new Error('Requirements continuation request failed')
        }
        const data = (await res.json()) as {
          pagination?: { hasMore?: boolean; nextCursor?: string | null }
          requirements?: RequirementRow[]
        }
        if (
          controller.signal.aborted ||
          requestId !== latestRowsRequestIdRef.current
        ) {
          return false
        }

        const moreRows = data.requirements ?? []
        setHasMore(data.pagination?.hasMore ?? false)
        setNextCursor(data.pagination?.nextCursor ?? null)
        setRows(previousRows =>
          Array.from(
            new Map(
              [...previousRows, ...moreRows].map(row => [row.id, row] as const),
            ).values(),
          ),
        )
        dispatchResourceState({ type: 'page-succeeded' })
        return true
      } catch {
        if (
          controller.signal.aborted ||
          requestId !== latestRowsRequestIdRef.current
        ) {
          return false
        }
        dispatchResourceState({ cursor, type: 'page-failed' })
        if (restoreRetryFocusOnFailure) {
          requestAnimationFrame(() => rowsRetryRef.current?.focus())
        }
        return false
      } finally {
        if (requestId === latestRowsRequestIdRef.current) {
          if (rowsAbortRef.current === controller) {
            rowsAbortRef.current = null
          }
        }
      }
    },
    [filters, locale, refreshRows, sortState],
  )

  const loadMore = useCallback(async () => {
    if (resourceState.status !== 'ready' || !hasMore || !nextCursor) {
      return
    }
    await requestAdditionalPage(nextCursor)
  }, [hasMore, nextCursor, requestAdditionalPage, resourceState.status])

  const retryRows = useCallback(async () => {
    if (resourceState.status === 'page-failure') {
      await requestAdditionalPage(resourceState.cursor, {
        restoreRetryFocusOnFailure: true,
      })
      return
    }
    await refreshRows({
      recoveringInvalidCursor:
        resourceState.status === 'cursor-recovery-failure',
      restoreRetryFocusOnFailure: true,
    })
  }, [refreshRows, requestAdditionalPage, resourceState])

  useEffect(
    () => () => {
      latestRowsRequestIdRef.current += 1
      rowsAbortRef.current?.abort()
    },
    [],
  )

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

    const controller = new AbortController()
    const numId = Number(sel)
    const numericSelectedId =
      !Number.isNaN(numId) && Number.isInteger(numId) && numId > 0
        ? numId
        : null
    const urlSelectionStillCurrent = () =>
      !controller.signal.aborted &&
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
        const singleRes = await apiFetch(
          `/api/requirements/${encodeURIComponent(sel)}`,
          { signal: controller.signal },
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
      if (controller.signal.aborted) return

      // Clean up the params after hydration so selected-row pinning cannot be
      // cancelled before the row is available in the table.
      const url = new URL(window.location.href)
      url.searchParams.delete('selected')
      window.history.replaceState({}, '', url.toString())
    }

    void resolveSelectedRequirement()

    return () => controller.abort()
  }, [searchParams, refreshRows])

  // Scroll to the selected requirement once the expanded detail row is in the
  // DOM. This effect runs after React commits a render that includes the new
  // pinnedRow / rows, so the element exists by the time we look for it.
  // We also depend on the resource status because the table is hidden behind a
  // loading shell until a successful snapshot exists.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are intentional triggers to re-run scroll check when DOM updates
  useEffect(() => {
    if (!hasRequirementListSnapshot(resourceState)) return
    const id = scrollToIdRef.current
    if (id == null) return
    const el = document.getElementById(`requirement-row-detail-${id}`)
    if (el) {
      scrollToIdRef.current = null
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [pinnedRow, resourceState, rows])

  useEffect(() => {
    const controller = new AbortController()
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
        apiFetch('/api/requirement-areas', { signal: controller.signal }),
        apiFetch('/api/requirement-categories', {
          signal: controller.signal,
        }),
        apiFetch('/api/requirement-types', { signal: controller.signal }),
        apiFetch('/api/quality-characteristics', {
          signal: controller.signal,
        }),
        apiFetch('/api/requirement-statuses', {
          signal: controller.signal,
        }),
        apiFetch('/api/requirement-packages', {
          signal: controller.signal,
        }),
        apiFetch('/api/priority-levels', { signal: controller.signal }),
      ])
      if (controller.signal.aborted) return

      const areasData = await readFilterResponse<{ areas?: AreaOption[] }>(
        areasRes,
      )
      if (controller.signal.aborted) return
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
        setRequirementPackageCatalogStatus('loaded')
      } else {
        setRequirementPackageCatalogStatus('failed')
      }
      const priorityLevelsData = await readFilterResponse<{
        priorityLevels?: PriorityLevelOption[]
      }>(priorityLevelsRes)
      if (priorityLevelsData) {
        setPriorityLevels(priorityLevelsData.priorityLevels ?? [])
      }
    }

    void fetchFilters()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const statuses = filters.statuses ?? []
    const params = new URLSearchParams()
    params.set('linked', 'true')
    for (const s of statuses) {
      params.append('statuses', String(s))
    }
    apiFetch(`/api/norm-references?${params}`, {
      signal: controller.signal,
    })
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
    dispatchResourceState({ type: 'reset' })
    setPaginationNotice(null)

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
  const requestActive = isRequirementListRequestActive(resourceState)
  const shouldShowInitialLoadingState =
    !columnPreferencesReady || resourceState.status === 'initial-loading'
  const shouldShowInitialFailure =
    columnPreferencesReady && resourceState.status === 'initial-failure'
  const isRefreshing =
    resourceState.status === 'refreshing' ||
    resourceState.status === 'cursor-recovering'
  const hasListWarning =
    resourceState.status === 'refresh-failure' ||
    resourceState.status === 'page-failure' ||
    resourceState.status === 'cursor-recovery-failure'

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
    selectedRows.length > 0 &&
    selectedRows.length === selectedIds.size &&
    selectedRows.every(hasReviewVersion)

  const handleExport = async () => {
    const params = buildRequirementListParams({
      filters,
      locale,
      sort: sortState,
    })

    await pdfDownload.download({
      fallbackFilename:
        locale === 'sv' ? 'kravbibliotek.csv' : 'requirements-library.csv',
      output: 'csv',
      url: `/api/requirements/export?${params}`,
    })
  }

  return (
    <>
      <div className="section-padding px-4 sm:px-6 lg:px-8">
        <div className="container-custom">
          <div className="relative rounded-2xl border bg-white/80 shadow-sm backdrop-blur-sm dark:border-secondary-700 dark:bg-secondary-900/60">
            {shouldShowInitialLoadingState ? (
              <div
                {...devMarker({
                  context: 'requirements table',
                  name: 'status',
                  value: 'initial loading',
                })}
                aria-live="polite"
                className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-16"
                data-testid="requirements-card-loading"
              >
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
                <p className="text-secondary-600 dark:text-secondary-400">
                  {tc('loadingRequirements')}
                </p>
              </div>
            ) : shouldShowInitialFailure ? (
              <div
                {...devMarker({
                  context: 'requirements table',
                  name: 'alert',
                  value: 'initial load failure',
                })}
                className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-16 text-center"
                role="alert"
              >
                <AlertTriangle
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
                />
                <p className="max-w-xl text-secondary-700 dark:text-secondary-300">
                  {t('loadRequirementsFailed')}
                </p>
                <button
                  className="min-h-6 min-w-6 rounded-md px-3 py-2 font-medium text-primary-700 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-primary-300"
                  disabled={requestActive}
                  onClick={() => void retryRows()}
                  ref={rowsRetryRef}
                  type="button"
                >
                  {tc('retry')}
                </button>
              </div>
            ) : (
              <>
                {isRefreshing ? (
                  <p
                    {...devMarker({
                      context: 'requirements table',
                      name: 'status',
                      value: 'refreshing requirements',
                    })}
                    className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-200"
                    role="status"
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0"
                    />
                    {t('refreshingRequirements')}
                  </p>
                ) : null}
                {hasListWarning ? (
                  <div
                    {...devMarker({
                      context: 'requirements table',
                      name: 'alert',
                      value: resourceState.status,
                    })}
                    className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300"
                    role="alert"
                  >
                    <p className="flex items-start gap-2">
                      <AlertTriangle
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0"
                      />
                      <span>
                        {resourceState.status === 'refresh-failure'
                          ? t('refreshRequirementsFailed')
                          : resourceState.status === 'cursor-recovery-failure'
                            ? t('paginationRecoveryFailed')
                            : t('paginationContinuationFailed')}
                      </span>
                    </p>
                    <button
                      className="mt-2 min-h-6 min-w-6 rounded-md px-2 py-1 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      disabled={requestActive}
                      onClick={() => void retryRows()}
                      ref={rowsRetryRef}
                      type="button"
                    >
                      {tc('retry')}
                    </button>
                  </div>
                ) : null}
                {paginationNotice ? (
                  <p
                    {...devMarker({
                      context: 'requirements table',
                      name: 'status',
                      value: 'pagination refresh notice',
                    })}
                    className="mx-4 mt-4 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-200"
                    role="status"
                  >
                    {paginationNotice}
                  </p>
                ) : null}
                <RequirementsTable
                  areas={areas}
                  categories={categories}
                  columnDefaults={normalizedColumnDefaults}
                  columnPickerPlacement="end"
                  columnWidths={columnWidths}
                  excludeColumns={['needsReference', 'specificationItemStatus']}
                  expandedId={selectedId}
                  filterValues={filters}
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
                      onClick: event => {
                        if (canOpenAiGeneration) {
                          aiReturnFocusTargetRef.current = event.currentTarget
                          setAiModalOpen(true)
                        }
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
                          onClick: returnFocusTarget =>
                            void pdfDownload.download({
                              fallbackFilename: 'requirements-list.pdf',
                              restoreFocusTo: returnFocusTarget,
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
                                onClick: (
                                  returnFocusTarget?: HTMLButtonElement | null,
                                ) =>
                                  void pdfDownload.download({
                                    fallbackFilename:
                                      'combined-review-report.pdf',
                                    restoreFocusTo: returnFocusTarget,
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
                        selectedIds.size > 0 && anySelectedIsReview
                          ? 'warning'
                          : undefined,
                    },
                    {
                      developerModeContext: 'requirements table',
                      developerModeValue: 'import requirements',
                      ariaLabel: t('importRequirements'),
                      icon: <Upload aria-hidden="true" className="h-4 w-4" />,
                      id: 'import',
                      onClick: event => {
                        importReturnFocusTargetRef.current = event.currentTarget
                        setImportDialogOpen(true)
                      },
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
                  hasMore={hasMore && resourceState.status === 'ready'}
                  loading={false}
                  loadingMore={resourceState.status === 'page-loading'}
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
                  onRowActivate={row => {
                    if (selectedIdRef.current === row.id) {
                      cancelDetailIntent(libraryIntentTarget(row, 'pointer'))
                      cancelDetailIntent(libraryIntentTarget(row, 'focus'))
                      return
                    }
                    activateDetailIntent(libraryTarget(row))
                  }}
                  onRowClick={id => {
                    const previousSelectedId = selectedIdRef.current
                    const nextSelectedId = previousSelectedId === id ? null : id
                    selectedIdRef.current = nextSelectedId
                    setSelectedId(nextSelectedId)
                    if (previousSelectedId !== id || nextSelectedId === null) {
                      setPinnedRow(null)
                    }
                  }}
                  onRowIntentEnd={(row, trigger) =>
                    cancelDetailIntent(libraryIntentTarget(row, trigger))
                  }
                  onRowIntentStart={(row, trigger) =>
                    scheduleDetailIntent(
                      libraryIntentTarget(row, trigger),
                      scheduledTarget => {
                        void detailCache
                          .load(row.id, 'prefetch', {
                            ...libraryDetailContext,
                            trigger: scheduledTarget.trigger,
                          })
                          .catch(() => undefined)
                      },
                    )
                  }
                  onSelectionChange={setSelectedIds}
                  onSortChange={setSortState}
                  onVisibleColumnsChange={setVisibleColumns}
                  pinnedIds={pinnedIds}
                  priorityLevels={priorityLevels}
                  qualityCharacteristics={qualityCharacteristics}
                  renderExpanded={id => (
                    <RequirementDetailClient
                      detailCache={detailCache}
                      detailPrefetchContext={libraryDetailContext}
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
                  requirementPackageCatalogStatus={
                    requirementPackageCatalogStatus
                  }
                  requirementPackageFilterPresentation="compact-band"
                  requirementPackages={requirementPackages}
                  rows={displayRows}
                  selectable
                  selectedIds={selectedIds}
                  sortState={sortState}
                  statusOptions={statusOptions}
                  types={types}
                  visibleColumns={visibleColumns}
                />
              </>
            )}
          </div>
        </div>
      </div>
      {pdfDownload.dialog}
      <LazyAiRequirementGenerator
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
          importReturnFocusTargetRef.current = aiReturnFocusTargetRef.current
          setAiModalOpen(false)
          setImportDialogOpen(true)
        }}
        open={aiModalOpen}
        returnFocusTarget={aiReturnFocusTargetRef.current}
      />
      <LazyRequirementsImportDialog
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
        returnFocusTarget={importReturnFocusTargetRef.current}
      />
    </>
  )
}
