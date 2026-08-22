import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRegistryRequestState } from '@/app/[locale]/admin/panels/settings/ai-connections/use-registry-request-state'

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) => (key: string, values?: Record<string, unknown>) =>
      `${namespace}.${key}${values ? ` ${Object.values(values).join(' ')}` : ''}`,
}))

const fetchMock = vi.fn()
const connectionId = '00000000-0000-4000-8000-000000000001'

function successfulLoad(): void {
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: connectionId }]), { status: 200 }),
    )
    .mockResolvedValueOnce(new Response('[]', { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: connectionId }), { status: 200 }),
    )
}

describe('AI registry request state', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('loads registry details and completes a mutation with reload feedback', async () => {
    successfulLoad()
    const { result } = renderHook(() => useRegistryRequestState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.details).toHaveProperty(connectionId)

    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    successfulLoad()
    await act(async () => {
      await expect(
        result.current.mutateAndReload(
          '/api/admin/ai-connections/one/actions',
          { action: 'probe' },
          'messages.saved',
          { actionLabel: 'Probe' },
        ),
      ).resolves.toBe(true)
    })
    expect(result.current.message).toBe('admin.aiConnections.messages.saved')
    act(() => result.current.setMessage(null))
    expect(result.current.message).toBeNull()
  })

  it('maps dependency and profile blockers and fails closed on malformed responses', async () => {
    successfulLoad()
    const { result } = renderHook(() => useRegistryRequestState())
    await waitFor(() => expect(result.current.loading).toBe(false))

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          details: {
            profileKeys: ['generation_without_images'],
            runCount: 2,
          },
          message: 'in use',
        }),
        { status: 409 },
      ),
    )
    await act(async () => {
      await result.current.mutation(
        '/api/admin/ai-connections/one/actions',
        { action: 'delete_model_revision' },
        { actionLabel: 'Delete' },
      )
    })
    expect(result.current.error?.message).toContain(
      'admin.aiConnections.destructive.inUse',
    )
    act(() => result.current.clearError())
    expect(result.current.error).toBeNull()

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          details: {
            blockers: [{ code: 'data_policy_blocked' }],
          },
        }),
        { status: 409 },
      ),
    )
    await act(async () => {
      await result.current.mutation(
        '/api/admin/ai-run-profiles/generation_without_images/actions',
        { action: 'set_operational_status' },
        { actionLabel: 'Enable' },
      )
    })
    expect(result.current.candidateBlockers.generation_without_images).toEqual([
      { code: 'data_policy_blocked' },
    ])

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    await act(async () => {
      await expect(
        result.current.mutation(
          '/api/admin/ai-connections/one/actions',
          {},
          { actionLabel: 'Retry' },
        ),
      ).resolves.toBeNull()
    })
    expect(result.current.error?.kind).toBe('mutation')
  })

  it('reports a registry load failure and retries', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }))
    const { result } = renderHook(() => useRegistryRequestState())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.kind).toBe('load')

    successfulLoad()
    await act(async () => result.current.loadRegistry())
    expect(result.current.error).toBeNull()
  })
})
