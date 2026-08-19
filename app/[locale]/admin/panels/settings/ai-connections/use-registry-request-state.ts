'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import {
  AI_ADMIN_BLOCKER_CODES,
  type AiAdminBlocker,
  type AiAdminConnectionDetail,
  type AiAdminConnectionSummary,
  type AiAdminRunProfileRecord,
  type AiAdminRunProfileRevisionRecord,
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
  if (!Array.isArray(blockers)) return []
  return blockers.flatMap(blocker => {
    if (!blocker || typeof blocker !== 'object') return []
    const code = (blocker as { code?: unknown }).code
    const field = (blocker as { field?: unknown }).field
    if (
      typeof code !== 'string' ||
      !AI_ADMIN_BLOCKER_CODES.includes(code as AiAdminBlocker['code'])
    ) {
      return []
    }
    return [
      {
        code: code as AiAdminBlocker['code'],
        ...(typeof field === 'string' ? { field } : {}),
      },
    ]
  })
}

export function useRegistryRequestState() {
  const t = useTranslations('admin.aiConnections')
  const loadErrorMessage = t('loadError')
  const [connections, setConnections] = useState<AiAdminConnectionSummary[]>([])
  const [details, setDetails] = useState<
    Record<string, AiAdminConnectionDetail>
  >({})
  const [profiles, setProfiles] = useState<AiAdminRunProfileRecord[]>([])
  const [profileRevisions, setProfileRevisions] = useState<
    Record<AiRunProfileKey, readonly AiAdminRunProfileRevisionRecord[]>
  >({
    generation_with_images: [],
    generation_without_images: [],
    invalid_json_repair: [],
  })
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [candidateBlockers, setCandidateBlockers] = useState<
    Partial<Record<AiRunProfileKey, readonly AiAdminBlocker[]>>
  >({})

  const loadRegistry = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [connectionResponse, profileResponse, ...revisionResponses] =
        await Promise.all([
          apiFetch('/api/admin/ai-connections'),
          apiFetch('/api/admin/ai-run-profiles'),
          ...AI_RUN_PROFILE_KEYS.map(key =>
            apiFetch(`/api/admin/ai-run-profiles/${key}/revisions`),
          ),
        ])
      if (
        !connectionResponse.ok ||
        !profileResponse.ok ||
        revisionResponses.some(response => !response.ok)
      ) {
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
      const revisions = await Promise.all(
        revisionResponses.map(
          response =>
            response.json() as Promise<AiAdminRunProfileRevisionRecord[]>,
        ),
      )
      setConnections(summaries)
      setDetails(Object.fromEntries(loadedDetails.map(item => [item.id, item])))
      setProfiles(loadedProfiles)
      setProfileRevisions(
        Object.fromEntries(
          AI_RUN_PROFILE_KEYS.map((key, index) => [
            key,
            revisions[index] ?? [],
          ]),
        ) as unknown as Record<
          AiRunProfileKey,
          readonly AiAdminRunProfileRevisionRecord[]
        >,
      )
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : loadErrorMessage,
      )
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
        if (profileKey) {
          setCandidateBlockers(current => ({
            ...current,
            [profileKey]: apiBlockers(responseBody),
          }))
        }
        setError((await readResponseMessage(response)) ?? t('mutationError'))
        return null
      }
      return response
    } catch {
      setError(t('mutationError'))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function mutateAndReload(
    url: string,
    body: unknown,
    successKey: string,
    method: 'PATCH' | 'POST' = 'POST',
  ): Promise<boolean> {
    const response = await mutation(url, body, method)
    if (!response) return false
    setMessage(t(successKey))
    await loadRegistry()
    return true
  }

  return {
    busy,
    candidateBlockers,
    connections,
    details,
    error,
    loading,
    loadRegistry,
    message,
    mutateAndReload,
    mutation,
    profiles,
    profileRevisions,
    setCandidateBlockers,
    setMessage,
  }
}
