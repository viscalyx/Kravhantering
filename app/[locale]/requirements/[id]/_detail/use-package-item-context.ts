import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import type { PackageItemDetailContext } from './types'

interface UsePackageItemContextOptions {
  packageItemId?: number
  packageSlug?: string
}

interface UsePackageItemContextResult {
  isPackageItemContext: boolean
  packageItemDetail: PackageItemDetailContext | null
  refreshPackageItemDetail: () => Promise<void>
}

export function usePackageItemContext({
  packageItemId,
  packageSlug,
}: UsePackageItemContextOptions): UsePackageItemContextResult {
  const isPackageItemContext = !!packageItemId && !!packageSlug
  const [packageItemDetail, setPackageItemDetail] =
    useState<PackageItemDetailContext | null>(null)
  const packageItemDetailAbortRef = useRef<AbortController | null>(null)

  const refreshPackageItemDetail = useCallback(async () => {
    packageItemDetailAbortRef.current?.abort()

    if (!isPackageItemContext || !packageItemId || !packageSlug) {
      setPackageItemDetail(null)
      return
    }

    const controller = new AbortController()
    packageItemDetailAbortRef.current = controller
    setPackageItemDetail(null)

    try {
      const res = await apiFetch(
        `/api/requirement-packages/${encodeURIComponent(
          packageSlug,
        )}/items/${packageItemId}`,
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
  }, [isPackageItemContext, packageItemId, packageSlug])

  useEffect(() => {
    void refreshPackageItemDetail()
    return () => {
      packageItemDetailAbortRef.current?.abort()
    }
  }, [refreshPackageItemDetail])

  return {
    isPackageItemContext,
    packageItemDetail,
    refreshPackageItemDetail,
  }
}
