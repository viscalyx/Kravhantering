import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import type { SpecificationItemDetailContext } from './types'

interface UseSpecificationItemContextOptions {
  specificationId?: number
  specificationItemId?: number
}

interface UseSpecificationItemContextResult {
  isSpecificationItemContext: boolean
  refreshSpecificationItemDetail: () => Promise<void>
  specificationItemDetail: SpecificationItemDetailContext | null
}

export function useSpecificationItemContext({
  specificationItemId,
  specificationId,
}: UseSpecificationItemContextOptions): UseSpecificationItemContextResult {
  const isSpecificationItemContext = !!specificationItemId && !!specificationId
  const [specificationItemDetail, setSpecificationItemDetail] =
    useState<SpecificationItemDetailContext | null>(null)
  const specificationItemDetailAbortRef = useRef<AbortController | null>(null)

  const refreshSpecificationItemDetail = useCallback(async () => {
    specificationItemDetailAbortRef.current?.abort()

    if (
      !isSpecificationItemContext ||
      !specificationItemId ||
      !specificationId
    ) {
      setSpecificationItemDetail(null)
      return
    }

    const controller = new AbortController()
    specificationItemDetailAbortRef.current = controller
    setSpecificationItemDetail(null)

    try {
      const res = await apiFetch(
        `/api/requirements-specifications/${encodeURIComponent(
          String(specificationId),
        )}/items/${specificationItemId}`,
        { signal: controller.signal },
      )

      if (!controller.signal.aborted) {
        if (res.ok) {
          setSpecificationItemDetail(
            (await res.json()) as SpecificationItemDetailContext,
          )
        } else {
          setSpecificationItemDetail(null)
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (!controller.signal.aborted) {
        setSpecificationItemDetail(null)
      }
    }
  }, [isSpecificationItemContext, specificationItemId, specificationId])

  useEffect(() => {
    void refreshSpecificationItemDetail()
    return () => {
      specificationItemDetailAbortRef.current?.abort()
    }
  }, [refreshSpecificationItemDetail])

  return {
    isSpecificationItemContext,
    specificationItemDetail,
    refreshSpecificationItemDetail,
  }
}
