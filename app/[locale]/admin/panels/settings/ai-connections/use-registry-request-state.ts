'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import {
  AI_ADMIN_BLOCKER_CODES,
  AI_ADMIN_BLOCKER_FIELDS,
  type AiAdminBlocker,
} from '@/lib/ai/admin-blockers'
import type {
  AiAdminConnectionDetail,
  AiAdminConnectionSummary,
  AiAdminRunProfileRecord,
} from '@/lib/ai/admin-service'
import {
  AI_RUN_PROFILE_KEYS,
  type AiRunProfileKey,
} from '@/lib/ai/profile-resolver'
import { apiFetch } from '@/lib/http/api-fetch'
import { readResponseMessage } from '@/lib/http/response-message'

function apiBlockers(value: unknown): AiAdminBlocker[] {
  if (!value || typeof value !== 'object') return []
  const details = (value as { details?: unknown }).details
  if (!details || typeof details !== 'object') return []
  const blockers = (details as { blockers?: unknown }).blockers
  if (!Array.isArray(blockers) || blockers.length === 0 || blockers.length > 16)
    return []
  const safeBlockers: AiAdminBlocker[] = []
  for (const blocker of blockers) {
    if (!blocker || typeof blocker !== 'object') return []
    const code = (blocker as { code?: unknown }).code
    const field = (blocker as { field?: unknown }).field
    if (
      typeof code !== 'string' ||
      !AI_ADMIN_BLOCKER_CODES.includes(code as AiAdminBlocker['code']) ||
      (field !== undefined &&
        (typeof field !== 'string' ||
          !AI_ADMIN_BLOCKER_FIELDS.includes(
            field as NonNullable<AiAdminBlocker['field']>,
          )))
    ) {
      return []
    }
    safeBlockers.push({
      code: code as AiAdminBlocker['code'],
      ...(field === undefined
        ? {}
        : { field: field as NonNullable<AiAdminBlocker['field']> }),
    })
  }
  return safeBlockers
}

function modelDependencies(value: unknown): {
  profileKeys: AiRunProfileKey[]
  runCount: number
} | null {
  if (!value || typeof value !== 'object') return null
  const details = (value as { details?: unknown }).details
  if (!details || typeof details !== 'object') return null
  const profileKeys = (details as { profileKeys?: unknown }).profileKeys
  const runCount = (details as { runCount?: unknown }).runCount
  if (
    !Array.isArray(profileKeys) ||
    profileKeys.length > AI_RUN_PROFILE_KEYS.length ||
    !profileKeys.every(
      key =>
        typeof key === 'string' &&
        AI_RUN_PROFILE_KEYS.includes(key as AiRunProfileKey),
    ) ||
    !Number.isInteger(runCount) ||
    Number(runCount) < 0
  ) {
    return null
  }
  return {
    profileKeys: profileKeys as AiRunProfileKey[],
    runCount: Number(runCount),
  }
}

export interface RegistryMutationFeedback {
  actionLabel: string
  suppressError?: boolean
}

export interface RegistryRequestError {
  kind: 'load' | 'mutation'
  message: string
}

type RegistryMessageTone = 'success' | 'warning'

export function useRegistryRequestState() {
  const t = useTranslations('admin.aiConnections')
  const loadErrorMessage = t('loadError')
  const [connections, setConnections] = useState<AiAdminConnectionSummary[]>([])
  const [details, setDetails] = useState<
    Record<string, AiAdminConnectionDetail>
  >({})
  const [profiles, setProfiles] = useState<AiAdminRunProfileRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [statusMessage, setStatusMessage] = useState<{
    details: readonly string[]
    message: string
    tone: RegistryMessageTone
  } | null>(null)
  const [error, setError] = useState<RegistryRequestError | null>(null)
  const [candidateBlockers, setCandidateBlockers] = useState<
    Partial<Record<AiRunProfileKey, readonly AiAdminBlocker[]>>
  >({})

  const setMessage = useCallback(
    (
      message: string | null,
      tone: RegistryMessageTone = 'success',
      details: readonly string[] = [],
    ): void => {
      setStatusMessage(message ? { details, message, tone } : null)
    },
    [],
  )

  const loadRegistry = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [connectionResponse, profileResponse] = await Promise.all([
        apiFetch('/api/admin/ai-connections'),
        apiFetch('/api/admin/ai-run-profiles'),
      ])
      if (!connectionResponse.ok || !profileResponse.ok) {
        throw new Error(loadErrorMessage)
      }
      const summaries =
        (await connectionResponse.json()) as AiAdminConnectionSummary[]
      const detailResponses = await Promise.all(
        summaries.map(connection =>
          apiFetch(`/api/admin/ai-connections/${connection.id}`),
        ),
      )
      if (detailResponses.some(response => !response.ok)) {
        throw new Error(loadErrorMessage)
      }
      const loadedDetails = await Promise.all(
        detailResponses.map(
          response => response.json() as Promise<AiAdminConnectionDetail>,
        ),
      )
      const loadedProfiles =
        (await profileResponse.json()) as AiAdminRunProfileRecord[]
      setConnections(summaries)
      setDetails(Object.fromEntries(loadedDetails.map(item => [item.id, item])))
      setProfiles(loadedProfiles)
      setCandidateBlockers({})
    } catch (loadError) {
      setError({
        kind: 'load',
        message:
          loadError instanceof Error ? loadError.message : loadErrorMessage,
      })
    } finally {
      setLoading(false)
    }
  }, [loadErrorMessage])

  useEffect(() => {
    void loadRegistry()
  }, [loadRegistry])

  async function mutation(
    url: string,
    body: unknown,
    feedback: RegistryMutationFeedback,
    method: 'PATCH' | 'POST' = 'POST',
  ): Promise<Response | null> {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const response = await apiFetch(url, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method,
      })
      if (!response.ok) {
        const responseBody = await response
          .clone()
          .json()
          .catch(() => null)
        const profileKey = AI_RUN_PROFILE_KEYS.find(key =>
          url.includes(`/ai-run-profiles/${key}/actions`),
        )
        const blockers = apiBlockers(responseBody)
        const dependencies = modelDependencies(responseBody)
        const responseMessage = await readResponseMessage(response)
        if (profileKey) {
          setCandidateBlockers(current => ({
            ...current,
            [profileKey]: blockers,
          }))
        }
        const actualError = dependencies
          ? t('destructive.inUse', {
              count: dependencies.runCount,
              profiles:
                dependencies.profileKeys.length > 0
                  ? dependencies.profileKeys
                      .map(key => t(`profiles.${key}`))
                      .join(', ')
                  : t('destructive.noProfiles'),
            })
          : profileKey && blockers.length > 0
            ? t('profile.candidateBlockers')
            : (responseMessage ?? t('mutationError'))
        if (!feedback.suppressError) {
          setError({
            kind: 'mutation',
            message: t('actionFailed', {
              action: feedback.actionLabel,
              error: actualError,
            }),
          })
        }
        return null
      }
      if (!feedback.suppressError) {
        setCandidateBlockers({})
      }
      return response
    } catch {
      if (!feedback.suppressError) {
        setError({
          kind: 'mutation',
          message: t('actionFailed', {
            action: feedback.actionLabel,
            error: t('mutationError'),
          }),
        })
      }
      return null
    } finally {
      setBusy(false)
    }
  }

  async function mutateAndReload(
    url: string,
    body: unknown,
    successKey: string,
    feedback: RegistryMutationFeedback,
    method: 'PATCH' | 'POST' = 'POST',
  ): Promise<boolean> {
    const response = await mutation(url, body, feedback, method)
    if (!response) return false
    setMessage(t(successKey))
    await loadRegistry()
    return true
  }

  return {
    busy,
    candidateBlockers,
    clearError: () => setError(null),
    connections,
    details,
    error,
    loading,
    loadRegistry,
    message: statusMessage?.message ?? null,
    messageDetails: statusMessage?.details ?? [],
    messageTone: statusMessage?.tone ?? 'success',
    mutateAndReload,
    mutation,
    profiles,
    setCandidateBlockers,
    setError,
    setMessage,
  }
}
