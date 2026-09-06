import {
  DEFAULT_REQUIREMENT_SORT,
  type FilterValues,
  type RequirementPackageOption,
  type RequirementSortState,
  type SpecificationItemStatusOption,
} from '@/lib/requirements/list-view'
import type {
  SpecificationItemsPageData,
  SpecificationListItem,
  SpecificationRequirementPackageCatalogPageData,
} from '@/lib/specifications/preload-types'

const SPECIFICATION_ITEMS_PAGE_SIZE = 50
const SPECIFICATION_NEEDS_REFERENCE_USAGE_PAGE_SIZE = 100
const BULK_DEVIATION_CONCURRENCY = 4
const SPECIFICATION_REQUIREMENT_PACKAGES_PAGE_SIZE = 50

export class InvalidSpecificationEditorCursorError extends Error {
  constructor() {
    super('Invalid specification editor cursor')
    this.name = 'InvalidSpecificationEditorCursorError'
  }
}

export interface SpecificationEditorWorkflowQuery {
  filters: FilterValues
  locale: string
  sort: RequirementSortState
}

export interface SpecificationEditorWorkflowItemPageRequest {
  cursor?: string
  limit: number
  query: SpecificationEditorWorkflowQuery
  signal: AbortSignal
}

export interface SpecificationEditorWorkflowPackagePageRequest {
  cursor?: string
  includeIds: number[]
  limit: number
  signal: AbortSignal
}

export interface ResolvedSpecificationEditorItem {
  itemRef: string
  kind: 'library' | 'specificationLocal'
  needsReference: string | null
  needsReferenceId: number | null
  uniqueId: string
}

export interface SpecificationEditorWorkflowAdapter {
  assignNeedsReference(
    itemRefs: string[],
    needsReferenceId: number | null,
  ): Promise<void>
  createDeviation(itemRef: string, motivation: string): Promise<void>
  loadItems(
    request: SpecificationEditorWorkflowItemPageRequest,
  ): Promise<SpecificationItemsPageData>
  loadRequirementPackages(
    request: SpecificationEditorWorkflowPackagePageRequest,
  ): Promise<SpecificationRequirementPackageCatalogPageData>
  refreshAvailableRequirements(): Promise<void>
  refreshNeedsReferences(): Promise<void>
  removeItems(itemRefs: string[]): Promise<{ removedCount: number }>
  resolveItems(itemRefs: string[]): Promise<ResolvedSpecificationEditorItem[]>
  updateItem(
    itemRef: string,
    changes: {
      needsReferenceId?: number | null
      specificationItemStatusId?: number
    },
  ): Promise<void>
}

export type SpecificationEditorSelectionNotice = {
  kind: 'items-disappeared'
  uniqueIds: string[]
}

export type SpecificationEditorBulkActionState =
  | { phase: 'idle' }
  | {
      operation: SpecificationEditorBulkOperation
      phase: 'mutating' | 'resolving'
    }
  | {
      failedUniqueIds: string[]
      operation: SpecificationEditorBulkOperation
      phase: 'complete'
    }
  | {
      error: string
      operation: SpecificationEditorBulkOperation
      phase: 'failed'
    }

export type SpecificationEditorBulkOperation =
  | 'assign-needs-reference'
  | 'create-deviations'
  | 'remove-items'

export type SpecificationEditorExternalMutation =
  | 'items-added'
  | 'local-requirements-changed'
  | 'needs-references-changed'

export interface SpecificationEditorBulkOutcome {
  failedUniqueIds: string[]
  succeededCount: number
}

export interface SpecificationEditorWorkflowState {
  announcement: 'pagination-restarted' | null
  bulkAction: SpecificationEditorBulkActionState
  items: SpecificationListItem[]
  itemsContinuationError: 'continuation' | 'recovery' | null
  itemsError: string | null
  itemsHasMore: boolean
  itemsLoading: boolean
  itemsLoadingMore: boolean
  requirementPackageCatalogError: string | null
  requirementPackageCatalogStatus: 'failed' | 'loaded' | 'loading'
  requirementPackages: RequirementPackageOption[]
  selectedItemRefs: ReadonlySet<string>
  selectedItems: SpecificationListItem[]
  selectedRequirementPackageIds: ReadonlySet<number>
  selectionNotice: SpecificationEditorSelectionNotice | null
}

interface SpecificationEditorWorkflowInternalState
  extends SpecificationEditorWorkflowState {
  itemsNextCursor: string | null
}

type SpecificationEditorItemLoadOutcome = 'failed' | 'loaded' | 'superseded'

interface SpecificationEditorWorkflowOptions {
  adapter: SpecificationEditorWorkflowAdapter
  initialItems: SpecificationItemsPageData
  initialPackageCatalog: SpecificationRequirementPackageCatalogPageData
  initialPackageCatalogFailed?: boolean
  onItemsRemoved?: (items: SpecificationListItem[]) => void
  query: SpecificationEditorWorkflowQuery
}

export interface SpecificationEditorWorkflow {
  actions: {
    assignNeedsReference(
      needsReferenceId: number | null,
    ): Promise<SpecificationEditorBulkOutcome>
    assignItemNeedsReference(
      itemRef: string,
      needsReferenceId: number | null,
      needsReference: string | null,
    ): Promise<boolean>
    changeItemStatus(
      itemRef: string,
      status: SpecificationItemStatusOption,
    ): Promise<boolean>
    createDeviations(
      motivation: string,
    ): Promise<SpecificationEditorBulkOutcome>
    deselectItemRefs(itemRefs: ReadonlySet<string>): void
    cancelNeedsReferenceUsage(): void
    loadMoreItems(): Promise<boolean>
    loadNeedsReferenceUsage(
      needsReferenceId: number,
      locale: string,
    ): Promise<SpecificationListItem[] | null>
    loadRequirementPackages(): Promise<boolean>
    removeItems(): Promise<SpecificationEditorBulkOutcome>
    cancelBulkAction(): void
    prepareBulkAction(
      operation: SpecificationEditorBulkOperation,
      itemRefs?: ReadonlySet<string>,
    ): Promise<SpecificationListItem[]>
    refreshAfterExternalMutation(
      mutation: SpecificationEditorExternalMutation,
    ): Promise<boolean>
    refreshItems(): Promise<boolean>
    retryItems(): Promise<boolean>
    selectLoadedItems(selectedIds: ReadonlySet<number>): void
    setQuery(query: SpecificationEditorWorkflowQuery): Promise<boolean>
  }
  dispose(): void
  getState(): SpecificationEditorWorkflowState
  subscribe(listener: () => void): () => void
}

export function createSpecificationEditorWorkflow({
  adapter,
  initialItems,
  initialPackageCatalog,
  initialPackageCatalogFailed = false,
  onItemsRemoved,
  query,
}: SpecificationEditorWorkflowOptions): SpecificationEditorWorkflow {
  let currentQuery = query
  let requestGeneration = 0
  let activeController: AbortController | null = null
  let packageRequestGeneration = 0
  let activePackageController: AbortController | null = null
  let usageRequestGeneration = 0
  let activeUsageController: AbortController | null = null
  let preparedBulkAction: {
    items: SpecificationListItem[]
    itemRefs: ReadonlySet<string>
    operation: SpecificationEditorBulkOperation
  } | null = null
  let initialPackageCatalogAvailable = initialPackageCatalog.pagination.hasMore
  const listeners = new Set<() => void>()
  const knownItemsByRef = new Map(
    initialItems.items.flatMap(item =>
      item.itemRef ? [[item.itemRef, item] as const] : [],
    ),
  )
  let state: SpecificationEditorWorkflowInternalState = {
    announcement: null,
    bulkAction: { phase: 'idle' },
    items: [...initialItems.items],
    itemsContinuationError: null,
    itemsError: null,
    itemsHasMore: initialItems.pagination.hasMore,
    itemsLoading: false,
    itemsLoadingMore: false,
    itemsNextCursor: initialItems.pagination.nextCursor,
    requirementPackageCatalogError: null,
    requirementPackageCatalogStatus: initialPackageCatalogFailed
      ? 'failed'
      : initialPackageCatalog.pagination.hasMore
        ? 'loading'
        : 'loaded',
    requirementPackages: deduplicatePackages(
      initialPackageCatalog.requirementPackages,
    ),
    selectionNotice: null,
    selectedItems: [],
    selectedItemRefs: new Set(),
    selectedRequirementPackageIds: new Set(
      query.filters.requirementPackageIds ?? [],
    ),
  }

  const publish = (
    updates: Partial<SpecificationEditorWorkflowInternalState>,
  ) => {
    state = { ...state, ...updates }
    if (updates.selectedItemRefs) {
      state = {
        ...state,
        selectedItems: [...updates.selectedItemRefs].flatMap(itemRef => {
          const item = knownItemsByRef.get(itemRef)
          return item ? [item] : []
        }),
      }
    }
    for (const listener of listeners) listener()
  }

  const loadFirstPageOutcome = async (
    nextQuery: SpecificationEditorWorkflowQuery,
    options: { recoveringInvalidCursor?: boolean } = {},
  ): Promise<SpecificationEditorItemLoadOutcome> => {
    const localeChanged = currentQuery.locale !== nextQuery.locale
    const nextSelectedRequirementPackageIds = new Set(
      nextQuery.filters.requirementPackageIds ?? [],
    )
    currentQuery = nextQuery
    const generation = ++requestGeneration
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    publish({
      announcement: null,
      itemsContinuationError: null,
      itemsError: null,
      itemsLoading: true,
      itemsLoadingMore: false,
      selectedRequirementPackageIds: nextSelectedRequirementPackageIds,
      ...(localeChanged
        ? {
            selectedItemRefs: new Set<string>(),
            selectionNotice: null,
          }
        : {}),
    })

    try {
      const page = await adapter.loadItems({
        limit: SPECIFICATION_ITEMS_PAGE_SIZE,
        query: nextQuery,
        signal: controller.signal,
      })
      if (controller.signal.aborted || generation !== requestGeneration) {
        return 'superseded'
      }
      rememberItems(page.items ?? [])
      publish({
        items: deduplicateSpecificationItemsByRef(page.items ?? []),
        announcement: options.recoveringInvalidCursor
          ? 'pagination-restarted'
          : null,
        itemsError: null,
        itemsHasMore: page.pagination?.hasMore ?? false,
        itemsNextCursor: page.pagination?.nextCursor ?? null,
      })
      return 'loaded'
    } catch (error) {
      if (controller.signal.aborted || generation !== requestGeneration) {
        return 'superseded'
      }
      if (options.recoveringInvalidCursor) {
        publish({ itemsContinuationError: 'recovery' })
      } else {
        publish({
          itemsError: error instanceof Error ? error.message : 'Unknown error',
        })
      }
      return 'failed'
    } finally {
      if (generation === requestGeneration) {
        publish({ itemsLoading: false })
        if (activeController === controller) activeController = null
      }
    }
  }

  const loadFirstPage = async (
    nextQuery: SpecificationEditorWorkflowQuery,
    options: { recoveringInvalidCursor?: boolean } = {},
  ): Promise<boolean> =>
    (await loadFirstPageOutcome(nextQuery, options)) === 'loaded'

  const loadMoreItems = async (): Promise<boolean> => {
    if (
      state.itemsLoading ||
      state.itemsLoadingMore ||
      !state.itemsHasMore ||
      !state.itemsNextCursor
    ) {
      return false
    }

    const generation = ++requestGeneration
    activeController?.abort()
    const controller = new AbortController()
    activeController = controller
    const cursor = state.itemsNextCursor
    publish({
      announcement: null,
      itemsContinuationError: null,
      itemsLoadingMore: true,
    })

    try {
      const page = await adapter.loadItems({
        cursor,
        limit: SPECIFICATION_ITEMS_PAGE_SIZE,
        query: currentQuery,
        signal: controller.signal,
      })
      if (controller.signal.aborted || generation !== requestGeneration) {
        return false
      }
      rememberItems(page.items ?? [])
      publish({
        items: deduplicateSpecificationItemsByRef([
          ...state.items,
          ...(page.items ?? []),
        ]),
        itemsHasMore: page.pagination?.hasMore ?? false,
        itemsNextCursor: page.pagination?.nextCursor ?? null,
      })
      return true
    } catch (error) {
      if (controller.signal.aborted || generation !== requestGeneration) {
        return false
      }
      if (error instanceof InvalidSpecificationEditorCursorError) {
        return loadFirstPage(currentQuery, { recoveringInvalidCursor: true })
      }
      publish({ itemsContinuationError: 'continuation' })
      return false
    } finally {
      if (generation === requestGeneration) {
        publish({ itemsLoadingMore: false })
        if (activeController === controller) activeController = null
      }
    }
  }

  const loadNeedsReferenceUsage = async (
    needsReferenceId: number,
    locale: string,
  ): Promise<SpecificationListItem[] | null> => {
    const generation = ++usageRequestGeneration
    activeUsageController?.abort()
    const controller = new AbortController()
    activeUsageController = controller
    const items: SpecificationListItem[] = []
    const seenCursors = new Set<string>()
    let cursor: string | null = null

    try {
      do {
        const page = await adapter.loadItems({
          ...(cursor ? { cursor } : {}),
          limit: SPECIFICATION_NEEDS_REFERENCE_USAGE_PAGE_SIZE,
          query: {
            filters: { needsReferenceIds: [needsReferenceId] },
            locale,
            sort: DEFAULT_REQUIREMENT_SORT,
          },
          signal: controller.signal,
        })
        if (
          controller.signal.aborted ||
          generation !== usageRequestGeneration
        ) {
          return null
        }
        items.push(...(page.items ?? []))
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

      return deduplicateSpecificationItemsByRef(items)
    } finally {
      if (generation === usageRequestGeneration) {
        if (activeUsageController === controller) {
          activeUsageController = null
        }
      }
    }
  }

  const selectLoadedItems = (selectedIds: ReadonlySet<number>): void => {
    const loadedRefs = new Set(
      state.items.flatMap(item => (item.itemRef ? [item.itemRef] : [])),
    )
    const next = new Set(
      [...state.selectedItemRefs].filter(itemRef => !loadedRefs.has(itemRef)),
    )
    for (const item of state.items) {
      if (selectedIds.has(item.id) && item.itemRef) {
        next.add(item.itemRef)
        knownItemsByRef.set(item.itemRef, item)
      }
    }
    publish({ selectionNotice: null, selectedItemRefs: next })
  }

  const resolveItemRefs = async (
    itemRefs: ReadonlySet<string>,
  ): Promise<SpecificationListItem[]> => {
    const resolved = await adapter.resolveItems([...itemRefs])
    const resolvedByRef = new Map(
      resolved.flatMap(item => {
        const known = knownItemsByRef.get(item.itemRef)
        if (!known) return []
        const refreshed: SpecificationListItem = {
          ...known,
          isSpecificationLocal: item.kind === 'specificationLocal',
          itemRef: item.itemRef,
          kind: item.kind,
          needsReference: item.needsReference,
          needsReferenceId: item.needsReferenceId,
          uniqueId: item.uniqueId,
        }
        knownItemsByRef.set(item.itemRef, refreshed)
        return [[item.itemRef, refreshed] as const]
      }),
    )
    const disappearedRefs = [...itemRefs].filter(
      itemRef => !resolvedByRef.has(itemRef),
    )
    const nextSelected = new Set(state.selectedItemRefs)
    for (const itemRef of disappearedRefs) nextSelected.delete(itemRef)
    publish({
      items: state.items.map(item =>
        item.itemRef ? (resolvedByRef.get(item.itemRef) ?? item) : item,
      ),
      selectedItemRefs: nextSelected,
      ...(disappearedRefs.length > 0
        ? {
            selectionNotice: {
              kind: 'items-disappeared' as const,
              uniqueIds: disappearedRefs.map(
                itemRef => knownItemsByRef.get(itemRef)?.uniqueId ?? itemRef,
              ),
            },
          }
        : {}),
    })
    return [...itemRefs].flatMap(itemRef => {
      const item = resolvedByRef.get(itemRef)
      return item ? [item] : []
    })
  }

  const resolveBulkItems = async (
    itemRefs: ReadonlySet<string>,
    operation: SpecificationEditorBulkOperation,
  ): Promise<SpecificationListItem[]> => {
    publish({ bulkAction: { operation, phase: 'resolving' } })
    try {
      const items = await resolveItemRefs(itemRefs)
      preparedBulkAction = { itemRefs, items, operation }
      publish({ bulkAction: { phase: 'idle' } })
      return items
    } catch (error) {
      publishBulkFailure(operation, error)
      throw error
    }
  }

  const deselectItemRefs = (itemRefs: ReadonlySet<string>): void => {
    const nextSelected = new Set(state.selectedItemRefs)
    for (const itemRef of itemRefs) nextSelected.delete(itemRef)
    publish({ selectedItemRefs: nextSelected })
  }

  const createDeviations = async (
    motivation: string,
    itemRefs: ReadonlySet<string> = state.selectedItemRefs,
  ): Promise<SpecificationEditorBulkOutcome> => {
    publish({
      bulkAction: { operation: 'create-deviations', phase: 'resolving' },
    })
    const items = await resolveItemRefs(itemRefs)
    publish({
      bulkAction: { operation: 'create-deviations', phase: 'mutating' },
    })
    const results = await allSettledInBatches(
      items,
      BULK_DEVIATION_CONCURRENCY,
      async item => {
        if (!item.itemRef) {
          throw new Error(item.uniqueId)
        }
        await adapter.createDeviation(item.itemRef, motivation)
        return item
      },
    )
    const succeededRefs = new Set(
      results.flatMap(result =>
        result.status === 'fulfilled' && result.value.itemRef
          ? [result.value.itemRef]
          : [],
      ),
    )
    const failedUniqueIds = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [items[index]?.uniqueId ?? 'Unknown item']
        : [],
    )
    const nextSelected = new Set(state.selectedItemRefs)
    for (const itemRef of succeededRefs) nextSelected.delete(itemRef)
    publish({ selectedItemRefs: nextSelected })
    await refreshItemsOrThrow()
    const outcome = {
      failedUniqueIds,
      succeededCount: succeededRefs.size,
    }
    publish({
      bulkAction: {
        failedUniqueIds,
        operation: 'create-deviations',
        phase: 'complete',
      },
    })
    return outcome
  }

  const assignNeedsReference = async (
    needsReferenceId: number | null,
    itemRefs: ReadonlySet<string> = state.selectedItemRefs,
  ): Promise<SpecificationEditorBulkOutcome> => {
    publish({
      bulkAction: { operation: 'assign-needs-reference', phase: 'resolving' },
    })
    const items = await resolveItemRefs(itemRefs)
    const changedItems = items.filter(
      item => item.needsReferenceId !== needsReferenceId,
    )
    const changedRefs = changedItems.flatMap(item =>
      item.itemRef ? [item.itemRef] : [],
    )
    if (changedRefs.length === 0) {
      const outcome = { failedUniqueIds: [], succeededCount: 0 }
      publish({
        bulkAction: {
          failedUniqueIds: [],
          operation: 'assign-needs-reference',
          phase: 'complete',
        },
      })
      return outcome
    }
    publish({
      bulkAction: { operation: 'assign-needs-reference', phase: 'mutating' },
    })
    await adapter.assignNeedsReference(changedRefs, needsReferenceId)
    const nextSelected = new Set(state.selectedItemRefs)
    for (const itemRef of changedRefs) nextSelected.delete(itemRef)
    publish({ selectedItemRefs: nextSelected })
    await refreshItemSurfaces(true)
    const outcome = {
      failedUniqueIds: [],
      succeededCount: changedRefs.length,
    }
    publish({
      bulkAction: {
        failedUniqueIds: [],
        operation: 'assign-needs-reference',
        phase: 'complete',
      },
    })
    return outcome
  }

  const assignItemNeedsReference = async (
    itemRef: string,
    needsReferenceId: number | null,
    needsReference: string | null,
  ): Promise<boolean> => {
    const originalItem =
      state.items.find(item => item.itemRef === itemRef) ?? null
    if (!originalItem) return false
    replaceItem(itemRef, {
      ...originalItem,
      needsReference,
      needsReferenceId,
    })
    try {
      await adapter.updateItem(itemRef, { needsReferenceId })
    } catch {
      replaceItem(itemRef, originalItem)
      return false
    }
    try {
      await refreshItemSurfaces(true)
    } catch {
      // The mutation committed. Preserve its optimistic value while the
      // workflow's refresh surfaces expose their own failure state.
    }
    return true
  }

  const changeItemStatus = async (
    itemRef: string,
    status: SpecificationItemStatusOption,
  ): Promise<boolean> => {
    const originalItem =
      state.items.find(item => item.itemRef === itemRef) ?? null
    if (!originalItem) {
      await loadFirstPage(currentQuery)
      return false
    }
    replaceItem(itemRef, {
      ...originalItem,
      specificationItemStatusColor: status.color ?? null,
      specificationItemStatusIconName: status.iconName ?? null,
      specificationItemStatusId: status.id,
      specificationItemStatusNameEn: status.nameEn,
      specificationItemStatusNameSv: status.nameSv,
    })
    try {
      await adapter.updateItem(itemRef, {
        specificationItemStatusId: status.id,
      })
    } catch {
      replaceItem(itemRef, originalItem)
      return false
    }
    try {
      await refreshItemSurfaces(false)
    } catch {
      // The mutation committed. Preserve its optimistic value while the
      // workflow's refresh surfaces expose their own failure state.
    }
    return true
  }

  const removeItems = async (
    itemRefs: ReadonlySet<string> = state.selectedItemRefs,
    resolvedItems?: SpecificationListItem[],
  ): Promise<SpecificationEditorBulkOutcome> => {
    publish({ bulkAction: { operation: 'remove-items', phase: 'resolving' } })
    const items = resolvedItems ?? (await resolveItemRefs(itemRefs))
    const requestedRefs = items.flatMap(item =>
      item.itemRef ? [item.itemRef] : [],
    )
    if (requestedRefs.length === 0) {
      const outcome = { failedUniqueIds: [], succeededCount: 0 }
      publish({
        bulkAction: {
          failedUniqueIds: [],
          operation: 'remove-items',
          phase: 'complete',
        },
      })
      return outcome
    }
    publish({ bulkAction: { operation: 'remove-items', phase: 'mutating' } })
    const result = await adapter.removeItems(requestedRefs)
    let remainingRefs = new Set<string>()
    if (result.removedCount !== requestedRefs.length) {
      const remaining = await adapter.resolveItems(requestedRefs)
      remainingRefs = new Set(remaining.map(item => item.itemRef))
    }
    const removedRefs = requestedRefs.filter(
      itemRef => !remainingRefs.has(itemRef),
    )
    // Refreshed rows may immediately reopen their detail. Invalidate those
    // resources before publishing any state or refreshing the lists.
    onItemsRemoved?.(
      items.filter(item => item.itemRef && removedRefs.includes(item.itemRef)),
    )
    const nextSelected = new Set(state.selectedItemRefs)
    for (const itemRef of removedRefs) nextSelected.delete(itemRef)
    publish({ selectedItemRefs: nextSelected })
    const failedUniqueIds = items.flatMap(item =>
      item.itemRef && remainingRefs.has(item.itemRef) ? [item.uniqueId] : [],
    )
    await Promise.all([
      refreshItemsOrThrow(),
      loadRequirementPackages(),
      adapter.refreshAvailableRequirements(),
      adapter.refreshNeedsReferences(),
    ])
    const outcome = {
      failedUniqueIds,
      succeededCount: removedRefs.length,
    }
    publish({
      bulkAction: {
        failedUniqueIds,
        operation: 'remove-items',
        phase: 'complete',
      },
    })
    return outcome
  }

  const retryItems = (): Promise<boolean> =>
    state.itemsContinuationError === 'continuation'
      ? loadMoreItems()
      : loadFirstPage(currentQuery, {
          recoveringInvalidCursor: state.itemsContinuationError === 'recovery',
        })

  const refreshItemsOrThrow = async (): Promise<void> => {
    const outcome = await loadFirstPageOutcome(currentQuery)
    if (outcome === 'failed') {
      throw new Error(state.itemsError ?? 'Specification items refresh failed')
    }
  }

  const refreshItemSurfaces = async (
    includeNeedsReferences: boolean,
  ): Promise<void> => {
    const refreshes: Promise<unknown>[] = [
      refreshItemsOrThrow(),
      loadRequirementPackages(),
    ]
    if (includeNeedsReferences) {
      refreshes.push(adapter.refreshNeedsReferences())
    }
    await Promise.all(refreshes)
  }

  const refreshItemsAndPackages = async (): Promise<boolean> => {
    const [itemsRefreshed] = await Promise.all([
      loadFirstPage(currentQuery),
      loadRequirementPackages(),
    ])
    return itemsRefreshed
  }

  const refreshAfterExternalMutation = async (
    mutation: SpecificationEditorExternalMutation,
  ): Promise<boolean> => {
    const refreshes: Promise<unknown>[] = [
      refreshItemsOrThrow(),
      loadRequirementPackages(),
    ]
    if (mutation === 'items-added') {
      refreshes.push(adapter.refreshAvailableRequirements())
    }
    refreshes.push(adapter.refreshNeedsReferences())
    await Promise.all(refreshes)
    return true
  }

  const loadRequirementPackages = async (): Promise<boolean> => {
    const generation = ++packageRequestGeneration
    activePackageController?.abort()
    const controller = new AbortController()
    activePackageController = controller
    const selectedIds = [...(currentQuery.filters.requirementPackageIds ?? [])]
    const seed = initialPackageCatalogAvailable
      ? initialPackageCatalog
      : undefined
    initialPackageCatalogAvailable = false
    const packages = [...(seed?.requirementPackages ?? [])]
    let selectedPackages = [...(seed?.selectedRequirementPackages ?? [])]
    let hasMore = seed?.pagination.hasMore ?? true
    let cursor = seed?.pagination.nextCursor ?? null
    const seenCursors = new Set<string>()
    publish({
      requirementPackageCatalogError: null,
      requirementPackageCatalogStatus: 'loading',
    })

    try {
      while (hasMore) {
        if (seed && !cursor) {
          throw new Error('Package catalog continuation is missing')
        }
        const page = await adapter.loadRequirementPackages({
          ...(cursor ? { cursor } : {}),
          includeIds: selectedIds,
          limit: SPECIFICATION_REQUIREMENT_PACKAGES_PAGE_SIZE,
          signal: controller.signal,
        })
        if (
          controller.signal.aborted ||
          generation !== packageRequestGeneration
        ) {
          return false
        }
        packages.push(...page.requirementPackages)
        selectedPackages = page.selectedRequirementPackages
        hasMore = page.pagination.hasMore
        const nextCursor = page.pagination.nextCursor
        if (hasMore) {
          if (!nextCursor || seenCursors.has(nextCursor)) {
            throw new Error('Package catalog continuation did not progress')
          }
          seenCursors.add(nextCursor)
        }
        cursor = nextCursor
      }

      const resolvedPackageIds = new Set(
        [...packages, ...selectedPackages].map(
          requirementPackage => requirementPackage.id,
        ),
      )
      const currentSelectedIds =
        currentQuery.filters.requirementPackageIds ?? []
      publish({
        requirementPackageCatalogError: null,
        requirementPackageCatalogStatus: 'loaded',
        requirementPackages: deduplicatePackages(packages),
        selectedRequirementPackageIds: new Set(
          currentSelectedIds.filter(id => resolvedPackageIds.has(id)),
        ),
      })
      return true
    } catch (error) {
      if (
        controller.signal.aborted ||
        generation !== packageRequestGeneration
      ) {
        return false
      }
      publish({
        requirementPackageCatalogError:
          error instanceof Error ? error.message : 'Unknown error',
        requirementPackageCatalogStatus: 'failed',
        requirementPackages: [],
      })
      return false
    } finally {
      if (generation === packageRequestGeneration) {
        if (activePackageController === controller) {
          activePackageController = null
        }
      }
    }
  }

  return {
    actions: {
      assignNeedsReference: needsReferenceId =>
        runBulkAction('assign-needs-reference', () =>
          assignNeedsReference(
            needsReferenceId,
            preparedBulkAction?.operation === 'assign-needs-reference'
              ? preparedBulkAction.itemRefs
              : undefined,
          ),
        ),
      assignItemNeedsReference,
      changeItemStatus,
      cancelNeedsReferenceUsage() {
        usageRequestGeneration += 1
        activeUsageController?.abort()
        activeUsageController = null
      },
      createDeviations: motivation =>
        runBulkAction('create-deviations', () =>
          createDeviations(
            motivation,
            preparedBulkAction?.operation === 'create-deviations'
              ? preparedBulkAction.itemRefs
              : undefined,
          ),
        ),
      deselectItemRefs,
      loadMoreItems,
      loadNeedsReferenceUsage,
      loadRequirementPackages,
      removeItems: () =>
        runBulkAction('remove-items', () =>
          removeItems(
            preparedBulkAction?.operation === 'remove-items'
              ? preparedBulkAction.itemRefs
              : undefined,
            preparedBulkAction?.operation === 'remove-items'
              ? preparedBulkAction.items
              : undefined,
          ),
        ),
      cancelBulkAction() {
        preparedBulkAction = null
        publish({ bulkAction: { phase: 'idle' } })
      },
      prepareBulkAction: (operation, itemRefs = state.selectedItemRefs) =>
        resolveBulkItems(itemRefs, operation),
      refreshAfterExternalMutation,
      refreshItems: refreshItemsAndPackages,
      retryItems,
      selectLoadedItems,
      setQuery: loadFirstPage,
    },
    dispose() {
      requestGeneration += 1
      packageRequestGeneration += 1
      usageRequestGeneration += 1
      activeController?.abort()
      activePackageController?.abort()
      activeUsageController?.abort()
      activeController = null
      activePackageController = null
      activeUsageController = null
      listeners.clear()
    },
    getState() {
      return state
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  function rememberItems(items: SpecificationListItem[]): void {
    for (const item of items) {
      if (item.itemRef) {
        knownItemsByRef.set(item.itemRef, item)
      }
    }
  }

  function publishBulkFailure(
    operation: SpecificationEditorBulkOperation,
    error: unknown,
  ): void {
    publish({
      bulkAction: {
        error: error instanceof Error ? error.message : 'Unknown error',
        operation,
        phase: 'failed',
      },
    })
  }

  async function runBulkAction<TResult>(
    operation: SpecificationEditorBulkOperation,
    action: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      const result = await action()
      preparedBulkAction = null
      return result
    } catch (error) {
      publishBulkFailure(operation, error)
      throw error
    }
  }

  function replaceItem(
    itemRef: string,
    replacement: SpecificationListItem,
  ): void {
    knownItemsByRef.set(itemRef, replacement)
    publish({
      items: state.items.map(item =>
        item.itemRef === itemRef ? replacement : item,
      ),
      selectedItems: state.selectedItems.map(item =>
        item.itemRef === itemRef ? replacement : item,
      ),
    })
  }
}

function deduplicateSpecificationItemsByRef(
  items: SpecificationListItem[],
): SpecificationListItem[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (!item.itemRef || seen.has(item.itemRef)) {
      return false
    }
    seen.add(item.itemRef)
    return true
  })
}

function deduplicatePackages(
  packages: RequirementPackageOption[],
): RequirementPackageOption[] {
  return [...new Map(packages.map(item => [item.id, item])).values()]
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
