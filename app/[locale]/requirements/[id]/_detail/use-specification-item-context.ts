import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import type { SpecificationItemDetailContext } from './types'

interface UseSpecificationItemContextOptions {
  specificationItemId?: number
  specificationSlug?: string
}

interface UseSpecificationItemContextResult {
  isSpecificationItemContext: boolean
  refreshSpecificationItemDetail: () => Promise<void>
  specificationItemDetail: SpecificationItemDetailContext | null
}

export function useSpecificationItemContext({
  specificationItemId,
  specificationSlug,
}: UseSpecificationItemContextOptions): UseSpecificationItemContextResult {
  const isSpecificationItemContext =
    !!specificationItemId && !!specificationSlug
  const [specificationItemDetail, setSpecificationItemDetail] =
    useState<SpecificationItemDetailContext | null>(null)
  const specificationItemDetailAbortRef = useRef<AbortController | null>(null)

  const refreshSpecificationItemDetail = useCallback(async () => {
    specificationItemDetailAbortRef.current?.abort()

    if (
      !isSpecificationItemContext ||
      !specificationItemId ||
      !specificationSlug
    ) {
      setSpecificationItemDetail(null)
      return
    }

    const controller = new AbortController()
    specificationItemDetailAbortRef.current = controller
    setSpecificationItemDetail(null)

    try {
      const res = await apiFetch(
        `/api/specifications/${encodeURIComponent(
          specificationSlug,
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
  }, [isSpecificationItemContext, specificationItemId, specificationSlug])

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
