import type {
  ResolvedSpecificationEditorItem,
  SpecificationEditorWorkflowAdapter,
  SpecificationEditorWorkflowItemPageRequest,
} from '@/app/[locale]/specifications/[specificationId]/specification-editor-workflow'
import { SpecificationEditorSaveError } from '@/app/[locale]/specifications/[specificationId]/specification-editor-workflow'
import type {
  SpecificationItemsPageData,
  SpecificationListItem,
  SpecificationRequirementPackageCatalogPageData,
} from '@/lib/specifications/preload-types'
import type { ReviewedNeedsReference } from '@/lib/specifications/reviewed-needs-reference'

interface InMemorySpecificationEditorAdapterOptions {
  failedDeviationItemRefs?: string[]
  failedNeedsReferenceAssignment?: string
  failedRemovalItemRefs?: string[]
  items?: SpecificationListItem[]
  loadItems?: (
    request: SpecificationEditorWorkflowItemPageRequest,
  ) => Promise<SpecificationItemsPageData>
  loadRequirementPackages?: SpecificationEditorWorkflowAdapter['loadRequirementPackages']
  refreshSavedDetails?: () => Promise<void>
  resolveItems?: SpecificationEditorWorkflowAdapter['resolveItems']
  uncertainDeviationItemRefs?: string[]
}

export class InMemorySpecificationEditorAdapter
  implements SpecificationEditorWorkflowAdapter
{
  readonly itemPageRequests: SpecificationEditorWorkflowItemPageRequest[] = []
  readonly deviationRequests: Array<{ itemRef: string; motivation: string }> =
    []
  readonly needsReferenceAssignments: Array<{
    itemRefs: string[]
    needsReferenceId: number | null
  }> = []
  availableRequirementsRefreshes = 0
  needsReferencesRefreshes = 0

  private readonly uncertainDeviationItemRefs: Set<string>
  private readonly failedDeviationItemRefs: Set<string>
  private readonly failedNeedsReferenceAssignment?: string
  private readonly failedRemovalItemRefs: Set<string>
  private items: SpecificationListItem[]
  private readonly loadItemsOverride?: InMemorySpecificationEditorAdapterOptions['loadItems']
  private readonly loadRequirementPackagesOverride?: InMemorySpecificationEditorAdapterOptions['loadRequirementPackages']
  private readonly resolveItemsOverride?: InMemorySpecificationEditorAdapterOptions['resolveItems']
  private readonly refreshSavedDetailsOverride?: () => Promise<void>

  constructor(options: InMemorySpecificationEditorAdapterOptions = {}) {
    this.refreshSavedDetailsOverride = options.refreshSavedDetails
    this.uncertainDeviationItemRefs = new Set(
      options.uncertainDeviationItemRefs ?? [],
    )
    this.failedDeviationItemRefs = new Set(
      options.failedDeviationItemRefs ?? [],
    )
    this.failedNeedsReferenceAssignment = options.failedNeedsReferenceAssignment
    this.failedRemovalItemRefs = new Set(options.failedRemovalItemRefs ?? [])
    this.items = [...(options.items ?? [])]
    this.loadItemsOverride = options.loadItems
    this.loadRequirementPackagesOverride = options.loadRequirementPackages
    this.resolveItemsOverride = options.resolveItems
  }

  async createDeviation(itemRef: string, motivation: string): Promise<void> {
    this.deviationRequests.push({ itemRef, motivation })
    if (this.failedDeviationItemRefs.has(itemRef)) {
      throw new SpecificationEditorSaveError(itemRef, 'failed')
    }
    if (this.uncertainDeviationItemRefs.has(itemRef))
      throw new Error('Response lost')
  }

  async assignNeedsReference(
    itemRefs: string[],
    needsReferenceId: number | null,
    reviewedNeedsReferences: ReviewedNeedsReference[],
  ): Promise<void> {
    this.needsReferenceAssignments.push({ itemRefs, needsReferenceId })
    if (this.failedNeedsReferenceAssignment) {
      throw new SpecificationEditorSaveError(
        this.failedNeedsReferenceAssignment,
        'failed',
      )
    }
    if (
      reviewedNeedsReferences.some(reviewed => {
        const current = this.items.find(
          item => item.itemRef === reviewed.itemRef,
        )
        return (
          !current ||
          (current.needsReferenceId ?? null) !== reviewed.needsReferenceId
        )
      })
    )
      throw new SpecificationEditorSaveError(
        'Needs references changed. Review the selection again.',
        'conflict',
      )
    this.items = this.items.map(item =>
      item.itemRef && itemRefs.includes(item.itemRef)
        ? { ...item, needsReferenceId }
        : item,
    )
  }

  async loadItems(
    request: SpecificationEditorWorkflowItemPageRequest,
  ): Promise<SpecificationItemsPageData> {
    this.itemPageRequests.push(request)
    if (this.loadItemsOverride) return this.loadItemsOverride(request)
    return {
      items: [...this.items],
      pagination: {
        count: this.items.length,
        hasMore: false,
        limit: request.limit,
        nextCursor: null,
      },
    }
  }

  async loadRequirementPackages(
    request: Parameters<
      SpecificationEditorWorkflowAdapter['loadRequirementPackages']
    >[0],
  ): Promise<SpecificationRequirementPackageCatalogPageData> {
    if (this.loadRequirementPackagesOverride) {
      return this.loadRequirementPackagesOverride(request)
    }
    return {
      pagination: { count: 0, hasMore: false, limit: 50, nextCursor: null },
      requirementPackages: [],
      selectedRequirementPackages: [],
    }
  }

  async resolveItems(
    itemRefs: string[],
  ): Promise<ResolvedSpecificationEditorItem[]> {
    if (this.resolveItemsOverride) {
      return this.resolveItemsOverride(itemRefs)
    }
    const requested = new Set(itemRefs)
    return this.items.flatMap(item =>
      item.itemRef && requested.has(item.itemRef)
        ? [
            {
              specificationItemStatusId: item.specificationItemStatusId ?? null,
              itemRef: item.itemRef,
              kind: item.kind ?? 'library',
              needsReference: item.needsReference ?? null,
              needsReferenceId: item.needsReferenceId ?? null,
              uniqueId: item.uniqueId,
            },
          ]
        : [],
    )
  }

  async removeItems(itemRefs: string[]): Promise<{ removedCount: number }> {
    if (itemRefs.some(ref => this.failedRemovalItemRefs.has(ref)))
      throw new SpecificationEditorSaveError('Removal rejected', 'failed')
    const removedRefs = new Set(itemRefs)
    this.items = this.items.filter(
      item => !item.itemRef || !removedRefs.has(item.itemRef),
    )
    return { removedCount: removedRefs.size }
  }

  async refreshAvailableRequirements(): Promise<void> {
    this.availableRequirementsRefreshes += 1
  }

  async refreshNeedsReferences(): Promise<void> {
    this.needsReferencesRefreshes += 1
  }

  async refreshSavedDetails(): Promise<void> {
    await this.refreshSavedDetailsOverride?.()
  }

  async updateItem(
    itemRef: string,
    changes: {
      needsReferenceId?: number | null
      specificationItemStatusId?: number
    },
  ): Promise<void> {
    this.items = this.items.map(item =>
      item.itemRef === itemRef ? { ...item, ...changes } : item,
    )
  }
}
