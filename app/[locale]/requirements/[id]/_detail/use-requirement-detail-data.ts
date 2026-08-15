import { useCallback, useEffect, useRef, useState } from 'react'
import { apiFetch } from '@/lib/http/api-fetch'
import type {
  LibraryRequirementDetailCache,
  RequirementDetailPrefetchContext,
} from '@/lib/requirements/detail-prefetch'
import type { RequirementDetailResponse } from '@/lib/requirements/types'
import type { StatusInfo, TransitionTarget } from './types'

interface UseRequirementDetailDataOptions {
  detailCache?: LibraryRequirementDetailCache
  detailContext?: RequirementDetailPrefetchContext
  requirementId: number | string
}

interface UseRequirementDetailDataResult {
  loading: boolean
  refreshRequirement: () => Promise<void>
  requirement: RequirementDetailResponse | null
  statuses: StatusInfo[]
  transitions: TransitionTarget[]
}

export function useRequirementDetailData({
  detailCache,
  detailContext,
  requirementId,
}: UseRequirementDetailDataOptions): UseRequirementDetailDataResult {
  const [requirement, setRequirement] =
    useState<RequirementDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [transitions, setTransitions] = useState<TransitionTarget[]>([])
  const [statuses, setStatuses] = useState<StatusInfo[]>([])
  const hasDataRef = useRef(false)

  const loadRequirement = useCallback(
    async (authoritative: boolean) => {
      if (!hasDataRef.current) setLoading(true)
      try {
        let detail: RequirementDetailResponse
        if (detailCache && detailContext && typeof requirementId === 'number') {
          detail = await detailCache.load(
            requirementId,
            authoritative ? 'refresh' : 'activate',
            detailContext,
          )
        } else {
          const res = await apiFetch(`/api/requirements/${requirementId}`)
          if (!res.ok) {
            console.error(
              'Failed to load requirement detail:',
              res.statusText || res.status,
            )
            setRequirement(null)
            return
          }
          detail = (await res.json()) as RequirementDetailResponse
        }
        setRequirement(detail)
        hasDataRef.current = true
      } catch (error) {
        console.error('Failed to load requirement detail:', error)
        setRequirement(null)
        hasDataRef.current = false
      } finally {
        setLoading(false)
      }
    },
    [detailCache, detailContext, requirementId],
  )

  const refreshRequirement = useCallback(
    () => loadRequirement(true),
    [loadRequirement],
  )

  const fetchTransitions = useCallback(async (statusId: number) => {
    try {
      const res = await apiFetch('/api/requirement-statuses')
      if (!res.ok) {
        console.error(
          'Failed to load requirement version statuses:',
          res.statusText || res.status,
        )
        setStatuses([])
        setTransitions([])
        return
      }
      const data = (await res.json()) as {
        statuses?: StatusInfo[]
        transitions?: { fromStatus: StatusInfo; toStatus: StatusInfo }[]
      }
      if (data.statuses) setStatuses(data.statuses)
      const allowed = (data.transitions ?? [])
        .filter(transition => transition.fromStatus.id === statusId)
        .map(transition => transition.toStatus)
      setTransitions(allowed)
    } catch (error) {
      console.error('Failed to load requirement version statuses:', error)
      setStatuses([])
      setTransitions([])
    }
  }, [])

  useEffect(() => {
    void loadRequirement(false)
  }, [loadRequirement])

  const latestStatusId = requirement?.versions[0]?.status ?? null
  useEffect(() => {
    if (latestStatusId !== null) {
      void fetchTransitions(latestStatusId)
    } else {
      setTransitions([])
    }
  }, [latestStatusId, fetchTransitions])

  return {
    loading,
    refreshRequirement,
    requirement,
    statuses,
    transitions,
  }
}
