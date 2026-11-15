import {
  InvalidSpecificationEditorCursorError,
  type ResolvedSpecificationEditorItem,
  SpecificationEditorSaveError,
  type SpecificationEditorWorkflowAdapter,
  type SpecificationEditorWorkflowItemPageRequest,
  type SpecificationEditorWorkflowPackagePageRequest,
} from '@/app/[locale]/specifications/[specificationId]/specification-editor-workflow'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'
import { buildRequirementListParams } from '@/lib/requirements/list-view'
import type {
  SpecificationItemsPageData,
  SpecificationRequirementPackageCatalogPageData,
} from '@/lib/specifications/preload-types'

const SPECIFICATION_ITEM_RESOLUTION_CHUNK_SIZE = 50

interface HttpSpecificationEditorAdapterOptions {
  loadItemsFailedMessage: string
  loadRequirementPackagesFailedMessage: string
  needsReferenceConflictMessage?: string
  refreshAvailableRequirements: () => Promise<unknown>
  refreshNeedsReferences: () => Promise<unknown>
  refreshNeedsReferencesFailedMessage: string
  refreshSavedDetails: () => Promise<void>
  removalRequiresIncludedMessage?: string
  specificationId: number
}

export function createHttpSpecificationEditorAdapter({
  needsReferenceConflictMessage = 'Needs references changed. Close this dialog and review the selection again.',
  removalRequiresIncludedMessage,
  loadItemsFailedMessage,
  loadRequirementPackagesFailedMessage,
  refreshAvailableRequirements,
  refreshNeedsReferences,
  refreshSavedDetails,
  refreshNeedsReferencesFailedMessage,
  specificationId,
}: HttpSpecificationEditorAdapterOptions): SpecificationEditorWorkflowAdapter {
  const specificationItemsPath = `/api/requirements-specifications/${specificationId}/items`

  return {
    refreshSavedDetails,
    async assignNeedsReference(
      itemRefs,
      needsReferenceId,
      reviewedNeedsReferences,
      agreementId,
    ) {
      const response = await apiFetch(specificationItemsPath, {
        body: JSON.stringify({
          itemRefs,
          needsReferenceId,
          reviewedNeedsReferences,
          ...(agreementId === undefined ? {} : { agreementId }),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      await assertSaveAccepted(
        response,
        loadItemsFailedMessage,
        needsReferenceConflictMessage,
      )
      const receipt = await response.json()
      if (receipt?.ok !== true || receipt.updatedCount !== itemRefs.length)
        throw new Error('Uncertain assignment receipt')
    },
    async createDeviation(itemRef, motivation, agreementId) {
      const response = await apiFetch(
        `/api/specification-item-deviations/${encodeURIComponent(itemRef)}`,
        {
          body: JSON.stringify({
            motivation,
            ...(agreementId === undefined ? {} : { agreementId }),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      await assertSaveAccepted(response, loadItemsFailedMessage)
      const receipt = await response.json()
      if (
        receipt?.ok !== true ||
        !Number.isInteger(receipt.id) ||
        receipt.id <= 0
      )
        throw new Error('Uncertain deviation receipt')
    },
    async loadItems(request) {
      return loadItemsPage(
        specificationItemsPath,
        request,
        loadItemsFailedMessage,
      )
    },
    async loadRequirementPackages(request) {
      return loadRequirementPackagePage(
        specificationId,
        request,
        loadRequirementPackagesFailedMessage,
      )
    },
    async refreshAvailableRequirements() {
      await refreshAvailableRequirements()
    },
    async refreshNeedsReferences() {
      const refreshed = await refreshNeedsReferences()
      if (refreshed === undefined) {
        throw new Error(refreshNeedsReferencesFailedMessage)
      }
    },
    async removeItems(itemRefs, agreementId, authorizeDeviationEndings) {
      const response = await apiFetch(specificationItemsPath, {
        body: JSON.stringify({
          itemRefs,
          ...(agreementId === undefined ? {} : { agreementId }),
          ...(authorizeDeviationEndings
            ? { authorizeDeviationEndings: true }
            : {}),
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      })
      if (!response.ok && removalRequiresIncludedMessage) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as { details?: { reason?: string } } | null
        if (body?.details?.reason === 'removal_requires_included')
          throw new SpecificationEditorSaveError(
            removalRequiresIncludedMessage,
            'failed',
          )
      }
      await assertSaveAccepted(response, loadItemsFailedMessage)
      return (await response.json()) as { removedCount: number }
    },
    async resolveItems(itemRefs, agreementId) {
      return resolveItems(
        specificationId,
        itemRefs,
        loadItemsFailedMessage,
        agreementId,
      )
    },
    async updateItem(itemRef, changes, agreementId) {
      const response = await apiFetch(
        `${specificationItemsPath}/${encodeURIComponent(itemRef)}`,
        {
          body: JSON.stringify({
            ...changes,
            ...(agreementId === undefined ? {} : { agreementId }),
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      )
      await assertOk(response, loadItemsFailedMessage)
    },
  }
}

async function assertSaveAccepted(
  response: Response,
  fallbackMessage: string,
  conflictMessage?: string,
): Promise<void> {
  if (response.ok) return
  if (response.status === 409 && conflictMessage) {
    const body = await response
      .clone()
      .json()
      .catch(() => null)
    if (body?.details?.reason === 'needs_reference_conflict') {
      throw new SpecificationEditorSaveError(conflictMessage, 'conflict')
    }
  }
  if ([400, 401, 403, 404, 409, 413, 422, 429].includes(response.status)) {
    throw new SpecificationEditorSaveError(fallbackMessage, 'failed')
  }
  // Server and connection failures do not prove that the transaction rolled back.
  throw new Error(fallbackMessage)
}

async function loadItemsPage(
  path: string,
  request: SpecificationEditorWorkflowItemPageRequest,
  fallbackMessage: string,
): Promise<SpecificationItemsPageData> {
  const params = buildRequirementListParams({
    filters: request.query.filters,
    limit: request.limit,
    locale: request.query.locale,
    sort: request.query.sort,
  })
  if (request.cursor) params.set('cursor', request.cursor)
  if (request.query.agreementId !== undefined)
    params.set('agreementId', String(request.query.agreementId))
  const response = await apiFetch(`${path}?${params}`, {
    signal: request.signal,
  })
  if (response.status === 400) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: string } | null
    if (body?.code === 'invalid_cursor') {
      throw new InvalidSpecificationEditorCursorError()
    }
  }
  return readJsonOrThrow<SpecificationItemsPageData>(response, fallbackMessage)
}

async function loadRequirementPackagePage(
  specificationId: number,
  request: SpecificationEditorWorkflowPackagePageRequest,
  fallbackMessage: string,
): Promise<SpecificationRequirementPackageCatalogPageData> {
  const params = new URLSearchParams({ limit: String(request.limit) })
  if (request.cursor) params.set('cursor', request.cursor)
  for (const id of request.includeIds) params.append('includeIds', String(id))
  const response = await apiFetch(
    `/api/requirements-specifications/${specificationId}/requirement-packages?${params}`,
    { signal: request.signal },
  )
  return readJsonOrThrow<SpecificationRequirementPackageCatalogPageData>(
    response,
    fallbackMessage,
  )
}

async function resolveItems(
  specificationId: number,
  itemRefs: string[],
  fallbackMessage: string,
  agreementId?: number,
): Promise<ResolvedSpecificationEditorItem[]> {
  const resolvedItems: ResolvedSpecificationEditorItem[] = []
  for (
    let offset = 0;
    offset < itemRefs.length;
    offset += SPECIFICATION_ITEM_RESOLUTION_CHUNK_SIZE
  ) {
    const params = new URLSearchParams()
    if (agreementId !== undefined)
      params.set('agreementId', String(agreementId))
    for (const itemRef of itemRefs.slice(
      offset,
      offset + SPECIFICATION_ITEM_RESOLUTION_CHUNK_SIZE,
    )) {
      params.append('refs', itemRef)
    }
    const response = await apiFetch(
      `/api/specification-item-resolutions/${specificationId}?${params}`,
    )
    const data = await readJsonOrThrow<{
      items?: ResolvedSpecificationEditorItem[]
    }>(response, fallbackMessage)
    resolvedItems.push(...(data.items ?? []))
  }
  return resolvedItems
}

async function assertOk(
  response: Response,
  fallbackMessage: string,
): Promise<void> {
  if (response.ok) return
  const details = await readResponseMessage(response)
  throw new Error(details || fallbackMessage)
}

async function readJsonOrThrow<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  await assertOk(response, fallbackMessage)
  return (await response.json()) as T
}
