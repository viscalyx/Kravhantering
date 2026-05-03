import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import type { PackageItemDetailContext } from './types'

interface UsePackageItemContextOptions {
  specificationItemId?: number
  specificationSlug?: string
}

interface UsePackageItemContextResult {
  isPackageItemContext: boolean
  refreshPackageItemDetail: () => Promise<void>
  specificationItemDetail: PackageItemDetailContext | null
}

export function usePackageItemContext({
  specificationItemId,
  specificationSlug,
}: UsePackageItemContextOptions): UsePackageItemContextResult {
  const isPackageItemContext = !!specificationItemId && !!specificationSlug
  const [specificationItemDetail, setPackageItemDetail] =
    useState<PackageItemDetailContext | null>(null)
  const specificationItemDetailAbortRef = useRef<AbortController | null>(null)

  const refreshPackageItemDetail = useCallback(async () => {
    specificationItemDetailAbortRef.current?.abort()

    if (!isPackageItemContext || !specificationItemId || !specificationSlug) {
      setPackageItemDetail(null)
      return
    }

    const controller = new AbortController()
    specificationItemDetailAbortRef.current = controller
    setPackageItemDetail(null)

    try {
      const res = await apiFetch(
        `/api/specifications/${encodeURIComponent(
          specificationSlug,
        )}/items/${specificationItemId}`,
        { signal: controller.signal },
      )

      if (!controller.signal.aborted) {
        if (res.ok) {
          setPackageItemDetail((await res.json()) as PackageItemDetailContext)
        } else {
          setPackageItemDetail(null)
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (!controller.signal.aborted) {
        setPackageItemDetail(null)
      }
    }
  }, [isPackageItemContext, specificationItemId, specificationSlug])

  useEffect(() => {
    void refreshPackageItemDetail()
    return () => {
      specificationItemDetailAbortRef.current?.abort()
    }
  }, [refreshPackageItemDetail])

  return {
    isPackageItemContext,
    specificationItemDetail,
    refreshPackageItemDetail,
  }
}
