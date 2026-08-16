'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  DetailPrefetchIntentController,
  type DetailPrefetchIntentTarget,
  type DetailPrefetchTarget,
  isRequirementDetailPrefetchEnabled,
} from '@/lib/requirements/detail-prefetch'

export function useRequirementDetailPrefetchIntent(
  enabled = isRequirementDetailPrefetchEnabled(),
) {
  const controllerRef = useRef<DetailPrefetchIntentController | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = new DetailPrefetchIntentController()
  }

  useEffect(
    () => () => {
      controllerRef.current?.dispose()
    },
    [],
  )

  const schedule = useCallback(
    (target: DetailPrefetchIntentTarget, prefetch: () => void) => {
      if (!enabled) return
      controllerRef.current?.schedule(target, prefetch)
    },
    [enabled],
  )
  const cancel = useCallback(
    (target: DetailPrefetchIntentTarget) => {
      if (!enabled) return
      controllerRef.current?.cancel(target)
    },
    [enabled],
  )
  const activate = useCallback(
    (target: DetailPrefetchTarget) => {
      if (!enabled) return
      controllerRef.current?.activate(target)
    },
    [enabled],
  )

  return { activate, cancel, schedule }
}
