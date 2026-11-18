import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AUTH_REAUTH_REQUIRED_EVENT } from '@/lib/auth/client-events'
import { apiFetch } from '@/lib/http/api-fetch'
import {
  DetailFetchError,
  type LibraryRequirementDetailCache,
  type RequirementDetailPrefetchContext,
} from '@/lib/requirements/detail-prefetch'
import type { RequirementDetailResponse } from '@/lib/requirements/types'
import type { StatusInfo, TransitionTarget } from './types'

interface UseRequirementDetailDataOptions {
  accessContext?: string
  detailCache?: LibraryRequirementDetailCache
  detailContext?: RequirementDetailPrefetchContext
  requirementId: number | string
}

type ReadState =
  | 'loading'
  | 'success'
  | 'missing'
  | 'denied'
  | 'expired'
  | 'error'

interface DetailRead {
  context: object
  pending: boolean
  state: ReadState
  value: RequirementDetailResponse | null
}

function failureState(error: unknown): ReadState {
  if (error instanceof DetailFetchError) {
    if (error.status === 404) return 'missing'
    if (error.status === 403) return 'denied'
    if (error.status === 401) return 'expired'
  }
  return 'error'
}

export function useRequirementDetailData({
  accessContext,
  detailCache,
  detailContext,
  requirementId,
}: UseRequirementDetailDataOptions) {
  const detailResource = detailContext?.resource
  const detailSurface = detailContext?.surface
  // A snapshot belongs to one resource and access context, even before effects run.
  const context = useMemo(
    () => ({
      accessContext,
      detailCache,
      detailResource,
      detailSurface,
      requirementId,
    }),
    [accessContext, detailCache, detailResource, detailSurface, requirementId],
  )
  const activeContextRef = useRef<object | null>(context)
  const [detail, setDetail] = useState<DetailRead>({
    context,
    pending: true,
    state: 'loading',
    value: null,
  })
  const requestRef = useRef<{
    context: object
    controller: AbortController
    promise: Promise<void>
  } | null>(null)
  const current = detail.context === context ? detail : null
  const requirement = current?.value ?? null
  const detailState = current?.state ?? 'loading'

  const loadRequirement = useCallback(
    (authoritative: boolean): Promise<void> => {
      if (activeContextRef.current !== context) return Promise.resolve()
      if (requestRef.current?.context === context)
        return requestRef.current.promise
      requestRef.current?.controller.abort()
      const controller = new AbortController()
      setDetail(previous => ({
        context,
        pending: true,
        state: previous.context === context ? previous.state : 'loading',
        value: previous.context === context ? previous.value : null,
      }))
      const promise = (async () => {
        try {
          let value: RequirementDetailResponse
          if (
            detailCache &&
            detailResource &&
            detailSurface &&
            typeof requirementId === 'number'
          ) {
            value = await detailCache.load(
              requirementId,
              authoritative ? 'refresh' : 'activate',
              { resource: detailResource, surface: detailSurface },
            )
          } else {
            const res = await apiFetch(`/api/requirements/${requirementId}`, {
              signal: controller.signal,
            })
            if (!res.ok) throw new DetailFetchError(res.status, res.statusText)
            value = (await res.json()) as RequirementDetailResponse
          }
          if (controller.signal.aborted) return
          setDetail({ context, pending: false, state: 'success', value })
        } catch (error) {
          if (controller.signal.aborted) return
          console.error('Failed to load requirement detail:', error)
          const state = failureState(error)
          setDetail(previous => ({
            context,
            pending: false,
            state,
            value:
              state === 'error' && previous.context === context
                ? previous.value
                : null,
          }))
        } finally {
          if (requestRef.current?.controller === controller)
            requestRef.current = null
        }
      })()
      requestRef.current = { context, controller, promise }
      return promise
    },
    [context, detailCache, detailResource, detailSurface, requirementId],
  )

  const refreshRequirement = useCallback(
    () => loadRequirement(true),
    [loadRequirement],
  )

  const previousAccessContext = useRef(accessContext)
  useEffect(() => {
    activeContextRef.current = context
    const accessChanged = previousAccessContext.current !== accessContext
    previousAccessContext.current = accessContext
    void loadRequirement(accessChanged)
    return () => {
      activeContextRef.current = null
      requestRef.current?.controller.abort()
      requestRef.current = null
    }
  }, [accessContext, context, loadRequirement])

  useEffect(() => {
    const expire = () => {
      requestRef.current?.controller.abort()
      requestRef.current = null
      detailCache?.clear()
      setDetail({ context, pending: false, state: 'expired', value: null })
    }
    window.addEventListener(AUTH_REAUTH_REQUIRED_EVENT, expire)
    return () => window.removeEventListener(AUTH_REAUTH_REQUIRED_EVENT, expire)
  }, [context, detailCache])

  const [workflow, setWorkflow] = useState<{
    requirement: RequirementDetailResponse | null
    state: ReadState
    pending: boolean
    statuses: StatusInfo[]
    transitions: TransitionTarget[]
  }>({
    requirement: null,
    state: 'loading',
    pending: false,
    statuses: [],
    transitions: [],
  })
  const activeWorkflowRef = useRef<RequirementDetailResponse | null>(null)
  const workflowRequestRef = useRef<{
    controller: AbortController
    promise: Promise<void>
  } | null>(null)
  // A successful detail refresh must also re-establish workflow prerequisites.
  const workflowRequirement = detailState === 'success' ? requirement : null
  const refreshStatuses = useCallback((): Promise<void> => {
    if (
      !workflowRequirement ||
      activeWorkflowRef.current !== workflowRequirement
    )
      return Promise.resolve()
    if (workflowRequestRef.current) return workflowRequestRef.current.promise
    const controller = new AbortController()
    setWorkflow(previous => ({
      requirement: workflowRequirement,
      state:
        previous.requirement === workflowRequirement
          ? previous.state
          : 'loading',
      pending: true,
      statuses: [],
      transitions: [],
    }))
    const promise = (async () => {
      try {
        const res = await apiFetch('/api/requirement-statuses', {
          signal: controller.signal,
        })
        if (!res.ok) throw new DetailFetchError(res.status, res.statusText)
        const data = (await res.json()) as {
          statuses?: StatusInfo[]
          transitions?: { fromStatus: StatusInfo; toStatus: StatusInfo }[]
        }
        if (controller.signal.aborted) return
        setWorkflow({
          requirement: workflowRequirement,
          state: 'success',
          pending: false,
          statuses: data.statuses ?? [],
          transitions: (data.transitions ?? [])
            .filter(
              transition =>
                transition.fromStatus.id ===
                workflowRequirement.versions[0]?.status,
            )
            .map(transition => transition.toStatus),
        })
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('Failed to load requirement version statuses:', error)
        setWorkflow({
          requirement: workflowRequirement,
          state: failureState(error),
          pending: false,
          statuses: [],
          transitions: [],
        })
      } finally {
        if (workflowRequestRef.current?.controller === controller)
          workflowRequestRef.current = null
      }
    })()
    workflowRequestRef.current = { controller, promise }
    return promise
  }, [workflowRequirement])

  useEffect(() => {
    activeWorkflowRef.current = workflowRequirement
    void refreshStatuses()
    return () => {
      activeWorkflowRef.current = null
      workflowRequestRef.current?.controller.abort()
      workflowRequestRef.current = null
    }
  }, [refreshStatuses, workflowRequirement])

  const workflowCurrent =
    workflowRequirement !== null && workflow.requirement === workflowRequirement
  const statusesState = workflowCurrent ? workflow.state : 'loading'
  return {
    detailState,
    loading: current?.pending ?? true,
    refreshRequirement,
    refreshStatuses,
    requirement,
    statusesState,
    statusesLoading: workflowCurrent ? workflow.pending : true,
    statuses: workflowCurrent && !workflow.pending ? workflow.statuses : [],
    transitions:
      workflowCurrent && !workflow.pending ? workflow.transitions : [],
  }
}
