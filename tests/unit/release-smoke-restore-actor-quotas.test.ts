import { describe, expect, it, vi } from 'vitest'
import { restoreActorQuotasAndDispose } from '../release-smoke/restore-actor-quotas'

const savedSettings = {
  exportActorConcurrency: 1,
  exportActorStartsPerMinute: 10,
}

function response(status = 200, settings = savedSettings) {
  return {
    status: () => status,
    json: async () => settings,
  }
}

type QuotaRequest = Parameters<typeof restoreActorQuotasAndDispose>[0]

function requestContext() {
  return {
    patch: vi.fn<QuotaRequest['patch']>().mockResolvedValue(response()),
    get: vi.fn<QuotaRequest['get']>().mockResolvedValue(response()),
    dispose: vi.fn<QuotaRequest['dispose']>().mockResolvedValue(),
  }
}

describe('release smoke actor quota restoration', () => {
  it('restores both saved values and verifies them before disposal', async () => {
    const request = requestContext()

    await restoreActorQuotasAndDispose(request, savedSettings)

    expect(request.patch.mock.calls).toEqual([
      [
        '/api/admin/application-settings',
        { data: { exportActorConcurrency: 1 } },
      ],
      [
        '/api/admin/application-settings',
        { data: { exportActorStartsPerMinute: 10 } },
      ],
    ])
    expect(request.get).toHaveBeenCalledWith('/api/admin/application-settings')
    expect(request.get.mock.invocationCallOrder[0]).toBeLessThan(
      request.dispose.mock.invocationCallOrder[0],
    )
    expect(request.dispose).toHaveBeenCalledOnce()
  })

  it('awaits a pending restore after a transport failure before readback and disposal', async () => {
    const request = requestContext()
    const pendingRestore = Promise.withResolvers<ReturnType<typeof response>>()
    const failure = new Error('connection reset')
    request.patch
      .mockRejectedValueOnce(failure)
      .mockReturnValueOnce(pendingRestore.promise)

    const completion = restoreActorQuotasAndDispose(request, savedSettings)
    const assertion = expect(completion).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          message: 'Failed to restore exportActorConcurrency',
          cause: failure,
        }),
      ],
    })
    // Allow the first rejection to propagate while the second restore is pending.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(request.patch).toHaveBeenCalledTimes(2)
    expect(request.get).not.toHaveBeenCalled()
    expect(request.dispose).not.toHaveBeenCalled()

    pendingRestore.resolve(response())
    await assertion
    expect(request.get).toHaveBeenCalledOnce()
    expect(request.dispose).toHaveBeenCalledOnce()
  })

  it('reports both failed PATCH responses even when readback matches', async () => {
    const request = requestContext()
    request.patch.mockResolvedValue(response(500))

    await expect(
      restoreActorQuotasAndDispose(request, savedSettings),
    ).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          message: 'Failed to restore exportActorConcurrency',
        }),
        expect.objectContaining({
          message: 'Failed to restore exportActorStartsPerMinute',
        }),
      ],
    })
    expect(request.get).toHaveBeenCalledOnce()
    expect(request.dispose).toHaveBeenCalledOnce()
  })

  it('rejects successful PATCH responses when saved values are not restored', async () => {
    const request = requestContext()
    request.get.mockResolvedValue(
      response(200, {
        exportActorConcurrency: 8,
        exportActorStartsPerMinute: 100,
      }),
    )

    await expect(
      restoreActorQuotasAndDispose(request, savedSettings),
    ).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          message:
            'Restored exportActorConcurrency does not match its saved value',
        }),
        expect.objectContaining({
          message:
            'Restored exportActorStartsPerMinute does not match its saved value',
        }),
      ],
    })
    expect(request.dispose).toHaveBeenCalledOnce()
  })

  it.each(['http', 'transport', 'json'])(
    'surfaces a %s readback failure and disposes the context',
    async failureKind => {
      const request = requestContext()
      if (failureKind === 'http') request.get.mockResolvedValue(response(503))
      if (failureKind === 'transport')
        request.get.mockRejectedValue(new Error('connection reset'))
      if (failureKind === 'json')
        request.get.mockResolvedValue({
          ...response(),
          json: async () => {
            throw new Error('invalid JSON')
          },
        })

      await expect(
        restoreActorQuotasAndDispose(request, savedSettings),
      ).rejects.toMatchObject({
        errors: [
          expect.objectContaining({
            message: 'Failed to verify restored actor quotas',
          }),
        ],
      })
      expect(request.dispose).toHaveBeenCalledOnce()
    },
  )

  it('disposes without restoring when no original settings were captured', async () => {
    const request = requestContext()

    await restoreActorQuotasAndDispose(request, undefined)

    expect(request.patch).not.toHaveBeenCalled()
    expect(request.get).not.toHaveBeenCalled()
    expect(request.dispose).toHaveBeenCalledOnce()
  })

  it('preserves restoration failures when disposal also fails', async () => {
    const request = requestContext()
    request.patch.mockRejectedValueOnce(new Error('connection reset'))
    request.dispose.mockRejectedValue(new Error('disposal failed'))

    await expect(
      restoreActorQuotasAndDispose(request, savedSettings),
    ).rejects.toMatchObject({
      errors: [
        expect.objectContaining({
          message: 'Failed to restore exportActorConcurrency',
        }),
        expect.objectContaining({
          message: 'Failed to dispose administrator request context',
        }),
      ],
    })
    expect(request.get).toHaveBeenCalledOnce()
    expect(request.dispose).toHaveBeenCalledOnce()
  })
})
