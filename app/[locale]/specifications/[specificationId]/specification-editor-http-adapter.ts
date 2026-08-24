import {
  InvalidSpecificationEditorCursorError,
  type ResolvedSpecificationEditorItem,
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
  refreshAvailableRequirements: () => Promise<unknown>
  refreshNeedsReferences: () => Promise<unknown>
  refreshNeedsReferencesFailedMessage: string
  specificationId: number
}

export function createHttpSpecificationEditorAdapter({
  loadItemsFailedMessage,
  loadRequirementPackagesFailedMessage,
  refreshAvailableRequirements,
  refreshNeedsReferences,
  refreshNeedsReferencesFailedMessage,
  specificationId,
}: HttpSpecificationEditorAdapterOptions): SpecificationEditorWorkflowAdapter {
  const specificationItemsPath = `/api/requirements-specifications/${specificationId}/items`

  return {
    async assignNeedsReference(itemRefs, needsReferenceId) {
      const response = await apiFetch(specificationItemsPath, {
        body: JSON.stringify({ itemRefs, needsReferenceId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      })
      await assertOk(response, loadItemsFailedMessage)
    },
    async createDeviation(itemRef, motivation) {
      const response = await apiFetch(
        `/api/specification-item-deviations/${encodeURIComponent(itemRef)}`,
        {
          body: JSON.stringify({ motivation }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      await assertOk(response, loadItemsFailedMessage)
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
    async removeItems(itemRefs) {
      const response = await apiFetch(specificationItemsPath, {
        body: JSON.stringify({ itemRefs }),
        headers: { 'Content-Type': 'application/json' },
        method: 'DELETE',
      })
      await assertOk(response, loadItemsFailedMessage)
      return (await response.json()) as { removedCount: number }
    },
    async resolveItems(itemRefs) {
      return resolveItems(specificationId, itemRefs, loadItemsFailedMessage)
    },
    async updateItem(itemRef, changes) {
      const response = await apiFetch(
        `${specificationItemsPath}/${encodeURIComponent(itemRef)}`,
        {
          body: JSON.stringify(changes),
          headers: { 'Content-Type': 'application/json' },
          method: 'PATCH',
        },
      )
      await assertOk(response, loadItemsFailedMessage)
    },
  }
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
): Promise<ResolvedSpecificationEditorItem[]> {
  const resolvedItems: ResolvedSpecificationEditorItem[] = []
  for (
    let offset = 0;
    offset < itemRefs.length;
    offset += SPECIFICATION_ITEM_RESOLUTION_CHUNK_SIZE
  ) {
    const params = new URLSearchParams()
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
