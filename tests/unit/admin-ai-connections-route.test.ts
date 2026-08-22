import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { conflictError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  context: {
    actor: {
      displayName: 'Ada Admin',
      hsaId: 'SE5560000001-admin1',
      id: 'admin-sub',
      isAuthenticated: true,
      roles: ['Admin'],
      source: 'oidc',
    },
    correlationId: 'correlation-ai-admin',
    request: {
      method: 'POST',
      path: '/api/admin/ai-connections/id/actions',
      requestId: 'request-ai-admin',
    },
    requestId: 'request-ai-admin',
    source: 'rest',
  },
  createRequestContext: vi.fn(),
  createPrivilegedContext: vi.fn(),
  getDb: vi.fn(async () => ({ db: true })),
  runtime: vi.fn(),
  service: {
    deleteModelRevision: vi.fn(),
    discardModelVerification: vi.fn(),
    endModelRevision: vi.fn(),
    saveModelRevision: vi.fn(),
    saveRunProfile: vi.fn(),
    verifyModelCandidate: vi.fn(),
  },
}))

vi.mock('@/lib/admin/privileged-audit', () => ({
  createAdminPrivilegedAuditContext: routeState.createPrivilegedContext,
  recordAdminPrivilegedActionSucceeded: vi.fn(),
}))
vi.mock('@/lib/requirements/auth', () => ({
  createRequestContext: routeState.createRequestContext,
}))
vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getDb,
}))
vi.mock('@/lib/ai/admin-runtime', () => ({
  createAiConnectionAdministrationRuntime: routeState.runtime,
}))
vi.mock('@/lib/requirements/actor-responsibility-refresh', () => ({
  scheduleActorResponsibilityPersonRefresh: vi.fn(),
}))
vi.mock('@/lib/audit/action-audit', () => ({
  recordDeniedActionAuditEvent: vi.fn(),
}))

import { POST as connectionAction } from '@/app/api/admin/ai-connections/[connectionId]/actions/route'
import { PATCH as saveProfile } from '@/app/api/admin/ai-run-profiles/[profileKey]/route'

const connectionId = '00000000-0000-4000-8000-000000000001'
const attemptId = '00000000-0000-4000-8000-000000000002'
const revisionToken = '00000000-0000-4000-8000-000000000003'
const modelRevisionId = '00000000-0000-4000-8000-000000000004'

function mutationRequest(body: unknown, signal?: AbortSignal): NextRequest {
  return new NextRequest(
    `https://example.test/api/admin/ai-connections/${connectionId}/actions`,
    {
      body: JSON.stringify(body),
      headers: {
        origin: 'https://example.test',
        'x-requested-with': 'XMLHttpRequest',
      },
      method: 'POST',
      signal,
    },
  )
}

describe('Admin AI stable-profile and model-verification routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequestContext.mockResolvedValue(routeState.context)
    routeState.createPrivilegedContext.mockResolvedValue(routeState.context)
    routeState.runtime.mockReturnValue(routeState.service)
    routeState.service.verifyModelCandidate.mockImplementation(
      async ({ onProgress }) => {
        await onProgress({
          check: 'connection_authentication',
          failureCategory: null,
          outcome: 'verified',
          state: 'completed',
        })
        return {
          attemptId,
          saveable: true,
          testSuiteVersion: 'ai-admin-functional-probe-v1',
        }
      },
    )
    routeState.service.saveModelRevision.mockResolvedValue({ id: 'model' })
    routeState.service.saveRunProfile.mockResolvedValue({ id: 'profile' })
    routeState.service.endModelRevision.mockResolvedValue({
      id: modelRevisionId,
    })
  })

  it('streams named verification progress and one reviewable final attempt', async () => {
    const response = await connectionAction(
      mutationRequest({
        action: 'verify_model_candidate',
        externalModelId: 'controlled/model',
        externalModelVersion: null,
      }),
      { params: Promise.resolve({ connectionId }) },
    )
    const messages = (await response.text())
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain(
      'application/x-ndjson',
    )
    expect(messages).toEqual([
      expect.objectContaining({
        progress: expect.objectContaining({
          check: 'connection_authentication',
        }),
        type: 'progress',
      }),
      expect.objectContaining({
        result: expect.objectContaining({ attemptId, saveable: true }),
        type: 'completed',
      }),
    ])
    expect(routeState.service.verifyModelCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: {
          externalModelId: 'controlled/model',
          externalModelVersion: null,
        },
        connectionId,
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('aborts and settles verification when the response stream is cancelled', async () => {
    let verificationSettled = false
    routeState.service.verifyModelCandidate.mockImplementationOnce(
      async ({ signal }: { signal: AbortSignal }) => {
        try {
          await new Promise((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Cancelled', 'AbortError')),
              { once: true },
            )
          })
        } finally {
          verificationSettled = true
        }
      },
    )
    const response = await connectionAction(
      mutationRequest({
        action: 'verify_model_candidate',
        externalModelId: 'controlled/model',
        externalModelVersion: null,
      }),
      { params: Promise.resolve({ connectionId }) },
    )
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Verification response stream missing')

    await reader.cancel()
    await vi.waitFor(() => {
      const verificationCall = routeState.service.verifyModelCandidate.mock
        .calls[0]?.[0] as { signal: AbortSignal } | undefined
      expect(verificationCall?.signal.aborted).toBe(true)
    })
    await vi.waitFor(() => expect(verificationSettled).toBe(true))
  })

  it('validates the attempt-bound save before service or database work', async () => {
    const invalid = await connectionAction(
      mutationRequest({
        action: 'save_model_revision',
        modelRevision: {
          description: null,
          externalModelId: 'controlled/model',
          externalModelVersion: null,
          modelId: null,
          modelToken: null,
          name: 'Model',
        },
      }),
      { params: Promise.resolve({ connectionId }) },
    )

    expect(invalid.status).toBe(400)
    expect(routeState.getDb).not.toHaveBeenCalled()
    expect(routeState.service.saveModelRevision).not.toHaveBeenCalled()
  })

  it('routes ending, permanent deletion, and attempt discard as distinct actions', async () => {
    for (const [body, expectedStatus] of [
      [
        {
          action: 'end_model_revision',
          modelRevisionId,
          revisionToken,
        },
        200,
      ],
      [
        {
          action: 'delete_model_revision',
          modelRevisionId,
          revisionToken,
        },
        204,
      ],
      [{ action: 'discard_model_verification', attemptId }, 204],
    ] as const) {
      const response = await connectionAction(mutationRequest(body), {
        params: Promise.resolve({ connectionId }),
      })
      expect(response.status).toBe(expectedStatus)
    }
    expect(routeState.service.endModelRevision).toHaveBeenCalledOnce()
    expect(routeState.service.deleteModelRevision).toHaveBeenCalledOnce()
    expect(routeState.service.discardModelVerification).toHaveBeenCalledWith(
      attemptId,
    )
  })

  it('returns bounded dependency details when ending a model is blocked', async () => {
    routeState.service.endModelRevision.mockRejectedValueOnce(
      conflictError('AI model revision is still in use.', {
        profileKeys: ['generation_without_images'],
        providerResponse: 'must remain private',
        runCount: 2,
      }),
    )

    const response = await connectionAction(
      mutationRequest({
        action: 'end_model_revision',
        modelRevisionId,
        revisionToken,
      }),
      { params: Promise.resolve({ connectionId }) },
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      code: 'conflict',
      details: {
        profileKeys: ['generation_without_images'],
        runCount: 2,
      },
      error: 'AI model revision is still in use.',
    })
  })

  it('saves a stable run profile atomically through PATCH', async () => {
    const profile = {
      inactivityTimeBudgetSeconds: 300,
      maximumBufferedEvents: 32,
      maximumOutputBytes: 4_194_304,
      maximumOutputTokens: 8_192,
      maximumRetainedMemoryBytes: 8_388_608,
      modelRevisionId,
      queueCapacity: 10,
      revisionToken,
      totalTimeBudgetSeconds: 1200,
    }
    const response = await saveProfile(
      new NextRequest(
        'https://example.test/api/admin/ai-run-profiles/generation_without_images',
        {
          body: JSON.stringify(profile),
          headers: {
            origin: 'https://example.test',
            'x-requested-with': 'XMLHttpRequest',
          },
          method: 'PATCH',
        },
      ),
      {
        params: Promise.resolve({
          profileKey: 'generation_without_images' as const,
        }),
      },
    )

    expect(response.status).toBe(200)
    expect(routeState.service.saveRunProfile).toHaveBeenCalledWith({
      profile,
      profileKey: 'generation_without_images',
    })
  })

  it('performs no database or provider work before Admin authorization', async () => {
    routeState.createPrivilegedContext.mockResolvedValueOnce({
      ...routeState.context,
      actor: { ...routeState.context.actor, roles: ['Reviewer'] },
    })
    const response = await connectionAction(
      mutationRequest({
        action: 'verify_model_candidate',
        externalModelId: 'controlled/model',
        externalModelVersion: null,
      }),
      { params: Promise.resolve({ connectionId }) },
    )

    expect(response.status).toBe(403)
    expect(routeState.service.verifyModelCandidate).not.toHaveBeenCalled()
  })
})
