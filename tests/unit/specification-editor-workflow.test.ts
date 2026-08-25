import { describe, expect, it } from 'vitest'
import {
  createSpecificationEditorWorkflow,
  InvalidSpecificationEditorCursorError,
  type SpecificationEditorWorkflowQuery,
} from '@/app/[locale]/specifications/[specificationId]/specification-editor-workflow'
import type {
  SpecificationListItem,
  SpecificationRequirementPackageCatalogPageData,
} from '@/lib/specifications/preload-types'
import { InMemorySpecificationEditorAdapter } from '@/tests/support/specification-editor-workflow-memory-adapter'

const defaultQuery: SpecificationEditorWorkflowQuery = {
  filters: {},
  locale: 'en',
  sort: { by: 'uniqueId', direction: 'asc' },
}

function item(
  id: number,
  itemRef: string,
  uniqueId: string,
): SpecificationListItem {
  return {
    area: null,
    id,
    isArchived: false,
    itemRef,
    kind: 'library',
    uniqueId,
    version: null,
  }
}

describe('specification editor workflow', () => {
  it('ignores a stale item-page response after the query changes', async () => {
    let releaseStalePage: ((value: ReturnType<typeof page>) => void) | undefined
    const stalePage = new Promise<ReturnType<typeof page>>(resolve => {
      releaseStalePage = resolve
    })
    const adapter = new InMemorySpecificationEditorAdapter({
      loadItems: request =>
        request.query.filters.uniqueIdSearch === 'stale'
          ? stalePage
          : Promise.resolve(page([item(2, 'lib:2', 'LATEST')])),
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([item(1, 'lib:1', 'INITIAL')]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })

    const staleLoad = workflow.actions.setQuery({
      ...defaultQuery,
      filters: { uniqueIdSearch: 'stale' },
    })
    const latestLoad = workflow.actions.setQuery({
      ...defaultQuery,
      filters: { uniqueIdSearch: 'latest' },
    })
    await latestLoad
    releaseStalePage?.(page([item(3, 'lib:3', 'STALE')]))
    await staleLoad

    expect(workflow.getState().items.map(current => current.uniqueId)).toEqual([
      'LATEST',
    ])
  })

  it('ignores a continuation when filters change while it is in flight', async () => {
    let releaseContinuation:
      | ((value: ReturnType<typeof page>) => void)
      | undefined
    const continuation = new Promise<ReturnType<typeof page>>(resolve => {
      releaseContinuation = resolve
    })
    const adapter = new InMemorySpecificationEditorAdapter({
      loadItems: request =>
        request.cursor
          ? continuation
          : Promise.resolve(page([item(2, 'lib:2', 'FILTERED')])),
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([item(1, 'lib:1', 'INITIAL')], {
        hasMore: true,
        nextCursor: 'continue',
      }),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })

    const continuationLoad = workflow.actions.loadMoreItems()
    await workflow.actions.setQuery({
      ...defaultQuery,
      filters: { uniqueIdSearch: 'filtered' },
    })
    releaseContinuation?.(page([item(3, 'lib:3', 'OBSOLETE')]))
    await continuationLoad

    expect(workflow.getState().items.map(current => current.uniqueId)).toEqual([
      'FILTERED',
    ])
  })

  it('cancels stale needs-reference usage traversal', async () => {
    let releaseStalePage: ((value: ReturnType<typeof page>) => void) | undefined
    const stalePage = new Promise<ReturnType<typeof page>>(resolve => {
      releaseStalePage = resolve
    })
    const adapter = new InMemorySpecificationEditorAdapter({
      loadItems: request =>
        request.query.filters.needsReferenceIds?.[0] === 1
          ? stalePage
          : Promise.resolve(page([item(2, 'lib:2', 'LATEST')])),
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })

    const staleLoad = workflow.actions.loadNeedsReferenceUsage(1, 'en')
    const latestLoad = workflow.actions.loadNeedsReferenceUsage(2, 'en')
    await expect(latestLoad).resolves.toEqual([
      expect.objectContaining({ uniqueId: 'LATEST' }),
    ])
    releaseStalePage?.(page([item(1, 'lib:1', 'STALE')]))

    await expect(staleLoad).resolves.toBeNull()
  })

  it('restarts an invalid continuation and preserves item-ref selection', async () => {
    const adapter = new InMemorySpecificationEditorAdapter({
      loadItems: request => {
        if (request.cursor === 'stale-cursor') {
          throw new InvalidSpecificationEditorCursorError()
        }
        return Promise.resolve(page([item(2, 'lib:2', 'RESTARTED')]))
      },
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([item(1, 'lib:1', 'INITIAL')], {
        hasMore: true,
        nextCursor: 'stale-cursor',
      }),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })

    workflow.actions.selectLoadedItems(new Set([1]))
    await workflow.actions.loadMoreItems()

    expect(workflow.getState()).toMatchObject({
      announcement: 'pagination-restarted',
      items: [expect.objectContaining({ uniqueId: 'RESTARTED' })],
    })
    expect(workflow.getState().selectedItemRefs).toEqual(new Set(['lib:1']))
  })

  it('reconciles selected item refs against authoritative resolution', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    const disappeared = item(2, 'lib:2', 'DISAPPEARED')
    const adapter = new InMemorySpecificationEditorAdapter({ items: [first] })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first, disappeared]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1, 2]))

    const resolved = await workflow.actions.prepareBulkAction(
      'assign-needs-reference',
    )

    expect(resolved.map(current => current.uniqueId)).toEqual(['FIRST'])
    expect(workflow.getState().selectedItemRefs).toEqual(new Set(['lib:1']))
    expect(workflow.getState().selectionNotice).toEqual({
      kind: 'items-disappeared',
      uniqueIds: ['DISAPPEARED'],
    })
  })

  it('settles partial bulk deviation failures and retains only failures selected', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    const second = item(2, 'lib:2', 'SECOND')
    const adapter = new InMemorySpecificationEditorAdapter({
      failedDeviationItemRefs: ['lib:2'],
      items: [first, second],
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first, second]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1, 2]))

    const outcome = await workflow.actions.createDeviations('Documented need')

    expect(outcome).toEqual({ failedUniqueIds: ['SECOND'], succeededCount: 1 })
    expect(workflow.getState().selectedItemRefs).toEqual(new Set(['lib:2']))
    expect(workflow.getState().bulkAction).toEqual({
      failedUniqueIds: ['SECOND'],
      operation: 'create-deviations',
      phase: 'complete',
    })
    expect(adapter.deviationRequests).toHaveLength(2)
  })

  it('exposes bulk resolution progress through the workflow state', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    let releaseResolution:
      | ((
          items: Awaited<
            ReturnType<InMemorySpecificationEditorAdapter['resolveItems']>
          >,
        ) => void)
      | undefined
    const resolution = new Promise<
      Awaited<ReturnType<InMemorySpecificationEditorAdapter['resolveItems']>>
    >(resolve => {
      releaseResolution = resolve
    })
    const adapter = new InMemorySpecificationEditorAdapter({
      items: [first],
      resolveItems: () => resolution,
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1]))

    const pending = workflow.actions.prepareBulkAction('assign-needs-reference')
    expect(workflow.getState().bulkAction).toEqual({
      operation: 'assign-needs-reference',
      phase: 'resolving',
    })
    releaseResolution?.([
      {
        itemRef: 'lib:1',
        kind: 'library',
        needsReference: null,
        needsReferenceId: null,
        uniqueId: 'FIRST',
      },
    ])
    await pending

    expect(workflow.getState().bulkAction.phase).toBe('idle')
    workflow.actions.cancelBulkAction()
    expect(workflow.getState().bulkAction).toEqual({ phase: 'idle' })
  })

  it('exposes a bulk mutation failure through the workflow state', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    const adapter = new InMemorySpecificationEditorAdapter({
      failedNeedsReferenceAssignment: 'Assignment rejected',
      items: [first],
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1]))

    await expect(workflow.actions.assignNeedsReference(81)).rejects.toThrow(
      'Assignment rejected',
    )

    expect(workflow.getState().bulkAction).toEqual({
      error: 'Assignment rejected',
      operation: 'assign-needs-reference',
      phase: 'failed',
    })
  })

  it('fails a bulk action when its authoritative refresh fails', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    const adapter = new InMemorySpecificationEditorAdapter({
      items: [first],
      loadItems: () => Promise.reject(new Error('Refresh failed')),
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1]))

    await expect(workflow.actions.assignNeedsReference(81)).rejects.toThrow(
      'Refresh failed',
    )

    expect(workflow.getState().bulkAction).toEqual({
      error: 'Refresh failed',
      operation: 'assign-needs-reference',
      phase: 'failed',
    })
  })

  it('completes a bulk action when a newer query supersedes its refresh', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    let releaseRefresh: ((value: ReturnType<typeof page>) => void) | undefined
    let markRefreshStarted: (() => void) | undefined
    const pendingRefresh = new Promise<ReturnType<typeof page>>(resolve => {
      releaseRefresh = resolve
    })
    const refreshStarted = new Promise<void>(resolve => {
      markRefreshStarted = resolve
    })
    let loadCount = 0
    const adapter = new InMemorySpecificationEditorAdapter({
      items: [first],
      loadItems: () => {
        loadCount += 1
        if (loadCount === 1) {
          markRefreshStarted?.()
          return pendingRefresh
        }
        return Promise.resolve(page([item(1, 'lib:1', 'FILTERED')]))
      },
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1]))

    const mutation = workflow.actions.assignNeedsReference(81)
    await refreshStarted
    await workflow.actions.setQuery({
      ...defaultQuery,
      filters: { uniqueIdSearch: 'filtered' },
    })
    releaseRefresh?.(page([{ ...first, needsReferenceId: 81 }]))

    await expect(mutation).resolves.toEqual({
      failedUniqueIds: [],
      succeededCount: 1,
    })
    expect(workflow.getState()).toMatchObject({
      bulkAction: {
        failedUniqueIds: [],
        operation: 'assign-needs-reference',
        phase: 'complete',
      },
      items: [expect.objectContaining({ uniqueId: 'FILTERED' })],
    })
  })

  it('keeps a committed single-item update when its refresh fails', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    const adapter = new InMemorySpecificationEditorAdapter({
      items: [first],
      loadItems: () => Promise.reject(new Error('Refresh failed')),
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })

    await expect(
      workflow.actions.assignItemNeedsReference(
        'lib:1',
        81,
        'Committed reference',
      ),
    ).resolves.toBe(true)

    expect(workflow.getState()).toMatchObject({
      items: [
        expect.objectContaining({
          needsReference: 'Committed reference',
          needsReferenceId: 81,
        }),
      ],
      itemsError: 'Refresh failed',
    })
  })

  it('uses authoritative needs-reference identity for bulk assignment', async () => {
    const first = {
      ...item(1, 'lib:1', 'FIRST'),
      needsReference: 'Shared text',
      needsReferenceId: 81,
    }
    const adapter = new InMemorySpecificationEditorAdapter({
      items: [first],
      resolveItems: () =>
        Promise.resolve([
          {
            itemRef: 'lib:1',
            kind: 'library',
            needsReference: 'Shared text',
            needsReferenceId: 82,
            uniqueId: 'FIRST',
          },
        ]),
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1]))

    const resolved = await workflow.actions.prepareBulkAction(
      'assign-needs-reference',
    )
    expect(resolved[0]).toMatchObject({ needsReferenceId: 82 })

    await expect(workflow.actions.assignNeedsReference(81)).resolves.toEqual({
      failedUniqueIds: [],
      succeededCount: 1,
    })
    expect(adapter.needsReferenceAssignments).toEqual([
      { itemRefs: ['lib:1'], needsReferenceId: 81 },
    ])
  })

  it('refreshes selected state when the authoritative assignment is already applied', async () => {
    const first = {
      ...item(1, 'lib:1', 'FIRST'),
      needsReference: 'Stale text',
      needsReferenceId: 81,
    }
    const adapter = new InMemorySpecificationEditorAdapter({
      items: [first],
      resolveItems: () =>
        Promise.resolve([
          {
            itemRef: 'lib:1',
            kind: 'library',
            needsReference: 'Authoritative text',
            needsReferenceId: 82,
            uniqueId: 'FIRST',
          },
        ]),
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1]))

    await expect(workflow.actions.assignNeedsReference(82)).resolves.toEqual({
      failedUniqueIds: [],
      succeededCount: 0,
    })

    expect(adapter.needsReferenceAssignments).toEqual([])
    expect(workflow.getState()).toMatchObject({
      items: [
        expect.objectContaining({
          needsReference: 'Authoritative text',
          needsReferenceId: 82,
        }),
      ],
      selectedItems: [
        expect.objectContaining({
          needsReference: 'Authoritative text',
          needsReferenceId: 82,
        }),
      ],
    })
  })

  it('traverses requirement packages and reconciles selected package filters', async () => {
    const adapter = new InMemorySpecificationEditorAdapter({
      loadRequirementPackages: request => {
        expect(request.cursor).toBe('packages-2')
        return Promise.resolve({
          pagination: {
            count: 1,
            hasMore: false,
            limit: 50,
            nextCursor: null,
          },
          requirementPackages: [{ id: 2, name: 'Second' }],
          selectedRequirementPackages: [{ id: 2, name: 'Second' }],
        })
      },
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([]),
      initialPackageCatalog: {
        pagination: {
          count: 1,
          hasMore: true,
          limit: 50,
          nextCursor: 'packages-2',
        },
        requirementPackages: [{ id: 1, name: 'First' }],
        selectedRequirementPackages: [],
      },
      query: {
        ...defaultQuery,
        filters: { requirementPackageIds: [2, 99] },
      },
    })

    await workflow.actions.loadRequirementPackages()

    expect(workflow.getState()).toMatchObject({
      requirementPackageCatalogStatus: 'loaded',
      requirementPackages: [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' },
      ],
      selectedRequirementPackageIds: new Set([2]),
    })
  })

  it('preserves current package filters when traversal finishes', async () => {
    let releaseStaleCatalog:
      | ((value: SpecificationRequirementPackageCatalogPageData) => void)
      | undefined
    const staleCatalog =
      new Promise<SpecificationRequirementPackageCatalogPageData>(resolve => {
        releaseStaleCatalog = resolve
      })
    const adapter = new InMemorySpecificationEditorAdapter({
      loadRequirementPackages: () => staleCatalog,
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: {
        ...defaultQuery,
        filters: { requirementPackageIds: [1] },
      },
    })

    const staleLoad = workflow.actions.loadRequirementPackages()
    await workflow.actions.setQuery({
      ...defaultQuery,
      filters: { requirementPackageIds: [2] },
    })
    releaseStaleCatalog?.({
      pagination: {
        count: 2,
        hasMore: false,
        limit: 50,
        nextCursor: null,
      },
      requirementPackages: [
        { id: 1, name: 'First' },
        { id: 2, name: 'Second' },
      ],
      selectedRequirementPackages: [{ id: 1, name: 'First' }],
    })
    await staleLoad

    expect(workflow.getState()).toMatchObject({
      requirementPackageCatalogStatus: 'loaded',
      selectedRequirementPackageIds: new Set([2]),
    })
  })

  it('refreshes authoritative items after a successful bulk assignment', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    const adapter = new InMemorySpecificationEditorAdapter({ items: [first] })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1]))

    const outcome = await workflow.actions.assignNeedsReference(81)

    expect(outcome).toEqual({ failedUniqueIds: [], succeededCount: 1 })
    expect(adapter.needsReferenceAssignments).toEqual([
      { itemRefs: ['lib:1'], needsReferenceId: 81 },
    ])
    expect(adapter.itemPageRequests).toHaveLength(1)
    expect(workflow.getState().items[0]).toMatchObject({
      needsReferenceId: 81,
    })
    expect(workflow.getState().selectedItemRefs).toEqual(new Set())
  })

  it('reports partial removals and refreshes every affected editor surface', async () => {
    const first = item(1, 'lib:1', 'FIRST')
    const second = item(2, 'lib:2', 'SECOND')
    const adapter = new InMemorySpecificationEditorAdapter({
      failedRemovalItemRefs: ['lib:2'],
      items: [first, second],
    })
    const workflow = createSpecificationEditorWorkflow({
      adapter,
      initialItems: page([first, second]),
      initialPackageCatalog: emptyPackageCatalog(),
      query: defaultQuery,
    })
    workflow.actions.selectLoadedItems(new Set([1, 2]))

    const outcome = await workflow.actions.removeItems()

    expect(outcome).toEqual({ failedUniqueIds: ['SECOND'], succeededCount: 1 })
    expect(workflow.getState().selectedItemRefs).toEqual(new Set(['lib:2']))
    expect(adapter.availableRequirementsRefreshes).toBe(1)
    expect(adapter.needsReferencesRefreshes).toBe(1)
    expect(adapter.itemPageRequests).toHaveLength(1)
  })
})

function page(
  items: SpecificationListItem[],
  pagination: Partial<{
    hasMore: boolean
    nextCursor: string | null
  }> = {},
) {
  return {
    items,
    pagination: {
      count: items.length,
      hasMore: false,
      limit: 50,
      nextCursor: null,
      ...pagination,
    },
  }
}

function emptyPackageCatalog() {
  return {
    pagination: { count: 0, hasMore: false, limit: 50, nextCursor: null },
    requirementPackages: [],
    selectedRequirementPackages: [],
  }
}
