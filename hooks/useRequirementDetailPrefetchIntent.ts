'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  DetailPrefetchIntentController,
  type DetailPrefetchIntentTarget,
  type DetailPrefetchTarget,
} from '@/lib/requirements/detail-prefetch'

export function useRequirementDetailPrefetchIntent() {
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
    (
      target: DetailPrefetchIntentTarget,
      prefetch: (target: DetailPrefetchIntentTarget) => void,
    ) => {
      controllerRef.current?.schedule(target, prefetch)
    },
    [],
  )
  const cancel = useCallback((target: DetailPrefetchIntentTarget) => {
    controllerRef.current?.cancel(target)
  }, [])
  const activate = useCallback((target: DetailPrefetchTarget) => {
    controllerRef.current?.activate(target)
  }, [])

  return { activate, cancel, schedule }
}
