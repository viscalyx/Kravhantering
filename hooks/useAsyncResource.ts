'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncResourceOptions<T> {
  dedupe?: boolean
  enabled?: boolean
  fetcher: (signal: AbortSignal) => Promise<T>
  getErrorMessage?: (error: unknown) => string
  initialData?: T
  key: string
  loadOnMount?: boolean
}

export interface AsyncResourceState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  refreshError: string | null
  refreshing: boolean
  reload: () => Promise<T | undefined>
}

interface SharedRequest<T> {
  controller: AbortController
  promise: Promise<T>
}

const sharedRequests = new Map<string, SharedRequest<unknown>>()

function hasOwnInitialData<T>(
  options: AsyncResourceOptions<T>,
): options is AsyncResourceOptions<T> & { initialData: T } {
  return Object.hasOwn(options, 'initialData')
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError'
}

function defaultErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Failed to load resource'
}

function getOrCreateSharedRequest<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
) {
  const existing = sharedRequests.get(key) as SharedRequest<T> | undefined
  if (existing) return existing

  const controller = new AbortController()
  const promise = fetcher(controller.signal).finally(() => {
    if (sharedRequests.get(key)?.promise === promise) {
      sharedRequests.delete(key)
    }
  })
  const request = { controller, promise }
  sharedRequests.set(key, request as SharedRequest<unknown>)
  return request
}

export function useAsyncResource<T>(
  options: AsyncResourceOptions<T>,
): AsyncResourceState<T> {
  const {
    dedupe = false,
    enabled = true,
    fetcher,
    getErrorMessage = defaultErrorMessage,
    key,
    loadOnMount = true,
  } = options
  const hasInitialData = hasOwnInitialData(options)

  const [data, setData] = useState<T | undefined>(() => options.initialData)
  const [loading, setLoading] = useState(
    () => enabled && loadOnMount && !hasInitialData,
  )
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const controllerRef = useRef<AbortController | null>(null)
  const dataRef = useRef<T | undefined>(options.initialData)
  const fetcherRef = useRef(fetcher)
  const getErrorMessageRef = useRef(getErrorMessage)
  const hasDataRef = useRef(hasInitialData)
  const isMountedRef = useRef(false)
  const requestIdRef = useRef(0)
  const previousKeyRef = useRef(key)
  const skippedInitialLoadRef = useRef(false)

  fetcherRef.current = fetcher
  getErrorMessageRef.current = getErrorMessage

  const reload = useCallback(async () => {
    if (!enabled) return dataRef.current

    const requestId = ++requestIdRef.current
    const hasData = hasDataRef.current
    if (hasData) {
      setRefreshing(true)
      setRefreshError(null)
    } else {
      setLoading(true)
      setError(null)
    }

    let request: SharedRequest<T>
    if (dedupe) {
      request = getOrCreateSharedRequest(key, signal =>
        fetcherRef.current(signal),
      )
    } else {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      request = {
        controller,
        promise: fetcherRef.current(controller.signal),
      }
    }

    try {
      const nextData = await request.promise
      if (
        !isMountedRef.current ||
        requestId !== requestIdRef.current ||
        request.controller.signal.aborted
      ) {
        return dataRef.current
      }

      dataRef.current = nextData
      hasDataRef.current = true
      setData(nextData)
      setError(null)
      setRefreshError(null)
      return nextData
    } catch (caughtError) {
      if (
        isAbortError(caughtError) ||
        request.controller.signal.aborted ||
        !isMountedRef.current ||
        requestId !== requestIdRef.current
      ) {
        return dataRef.current
      }

      const message = getErrorMessageRef.current(caughtError)
      if (hasDataRef.current) {
        setRefreshError(message)
      } else {
        setError(message)
      }
      return undefined
    } finally {
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
      if (!dedupe && controllerRef.current === request.controller) {
        controllerRef.current = null
      }
    }
  }, [dedupe, enabled, key])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      requestIdRef.current += 1
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const keyChanged = previousKeyRef.current !== key
    previousKeyRef.current = key

    if (!keyChanged && !loadOnMount && !skippedInitialLoadRef.current) {
      skippedInitialLoadRef.current = true
      return
    }

    skippedInitialLoadRef.current = true
    void reload()
  }, [enabled, key, loadOnMount, reload])

  return {
    data,
    error,
    loading,
    refreshError,
    refreshing,
    reload,
  }
}
