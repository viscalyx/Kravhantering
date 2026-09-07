import type { AiAdminAdapterContext } from '@/lib/ai/admin-adapter'
import type { AiFinancialOperation } from '@/lib/ai/financial-contracts'
import { openRouterFinancialAdapter } from '@/lib/ai/openrouter-financial-adapter'

function context(response: Response): AiAdminAdapterContext {
  return {
    connection: { endpointUrl: 'https://openrouter.ai/api/v1' },
    credential: 'fixture-secret',
    egress: { fetch: vi.fn(async () => response) },
  } as unknown as AiAdminAdapterContext
}
function operation(index: number): AiFinancialOperation {
  const value = openRouterFinancialAdapter.capabilities.operations[index]
  if (!value) throw new Error('Financial operation fixture is missing')
  return value
}
const account = operation(0)
const credential = operation(1)
const signal = (): AbortSignal => new AbortController().signal

describe('AI adapter financial operations', () => {
  it('rejects a key report without any financial values and safely cancels rejected response bodies', async () => {
    await expect(
      openRouterFinancialAdapter.fetch(
        context(Response.json({ data: {} })),
        credential,
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'temporary_error' })
    const response = new Response(
      new ReadableStream({
        cancel() {
          throw new Error('sensitive cancellation error')
        },
      }),
      { status: 403 },
    )
    await expect(
      openRouterFinancialAdapter.fetch(context(response), account, signal()),
    ).rejects.toMatchObject({
      code: 'invalid_credential',
      message: 'The provider financial request could not be completed.',
    })
  })
  it('reports account credits separately from unsupported spending caps without leaking provider fields', async () => {
    const input = context(
      Response.json({
        data: {
          total_credits: 100.5,
          total_usage: 25.75,
          label: 'secret-label',
          hash: 'sensitive-id',
        },
      }),
    )
    const result = await openRouterFinancialAdapter.fetch(
      input,
      account,
      signal(),
    )
    expect(result).toEqual({
      scope: 'account',
      measurements: [
        {
          field: 'purchased_credits',
          amount: '100.5',
          currency: 'USD',
          period: 'lifetime',
          state: 'available',
        },
        {
          field: 'usage',
          amount: '25.75',
          currency: 'USD',
          period: 'lifetime',
          state: 'available',
        },
        {
          field: 'credit_balance',
          amount: '74.75',
          currency: 'USD',
          period: 'lifetime',
          state: 'available',
        },
        {
          field: 'spending_limit',
          amount: null,
          currency: 'USD',
          period: 'unknown',
          state: 'unsupported',
        },
        {
          field: 'remaining_allowance',
          amount: null,
          currency: 'USD',
          period: 'unknown',
          state: 'unsupported',
        },
      ],
    })
    expect(input.egress.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/credits',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        headers: {
          accept: 'application/json',
          authorization: 'Bearer fixture-secret',
        },
      }),
    )
    expect(JSON.stringify(result)).not.toMatch(
      /secret-label|sensitive-id|fixture-secret/u,
    )
  })

  it('uses current-key introspection with explicit usage periods and provider remaining allowance', async () => {
    const input = context(
      Response.json({
        data: {
          usage: 25.5,
          usage_daily: 2,
          usage_weekly: 5,
          usage_monthly: 10,
          limit: 100,
          limit_remaining: 74.5,
          limit_reset: 'monthly',
        },
      }),
    )
    const result = await openRouterFinancialAdapter.fetch(
      input,
      credential,
      signal(),
    )
    expect(result.measurements).toEqual(
      expect.arrayContaining([
        {
          field: 'usage',
          amount: '25.5',
          currency: 'USD',
          period: 'lifetime',
          state: 'available',
        },
        {
          field: 'usage',
          amount: '2',
          currency: 'USD',
          period: 'daily',
          state: 'available',
        },
        {
          field: 'spending_limit',
          amount: '100',
          currency: 'USD',
          period: 'monthly',
          state: 'available',
        },
        {
          field: 'remaining_allowance',
          amount: '74.5',
          currency: 'USD',
          period: 'monthly',
          state: 'available',
        },
      ]),
    )
    expect(input.egress.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('distinguishes unlimited, unreported, zero and unknown periods', async () => {
    const result = await openRouterFinancialAdapter.fetch(
      context(
        Response.json({
          data: { usage: 0, limit: null, limit_remaining: null },
        }),
      ),
      credential,
      signal(),
    )
    expect(result.measurements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'usage',
          period: 'lifetime',
          amount: '0',
          state: 'available',
        }),
        expect.objectContaining({
          field: 'spending_limit',
          period: 'unknown',
          amount: null,
          state: 'unlimited',
        }),
        expect.objectContaining({
          field: 'usage',
          period: 'daily',
          amount: null,
          state: 'unavailable',
        }),
      ]),
    )
  })

  it.each([401, 403, 429, 500])(
    'normalizes HTTP %i without exposing provider errors',
    async status => {
      await expect(
        openRouterFinancialAdapter.fetch(
          context(new Response('fixture-secret provider body', { status })),
          account,
          signal(),
        ),
      ).rejects.toMatchObject({
        code:
          status === 401 || status === 403
            ? 'invalid_credential'
            : 'temporary_error',
        message: 'The provider financial request could not be completed.',
      })
    },
  )

  it.each([
    '{}',
    '{"data":[]}',
    '{"data":null}',
    'invalid-json',
    '{"data":{"total_credits":"fixture-secret","total_usage":2}}',
    '{"data":{"total_credits":1e100,"total_usage":2}}',
    '{"data":{"total_credits":20}}',
  ])('rejects malformed or unsafe financial values: %s', async body => {
    await expect(
      openRouterFinancialAdapter.fetch(
        context(new Response(body)),
        account,
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'temporary_error' })
  })

  it('rejects oversized declared and streamed responses', async () => {
    for (const response of [
      new Response('{}', { headers: { 'content-length': '40000' } }),
      new Response('x'.repeat(40000)),
    ]) {
      await expect(
        openRouterFinancialAdapter.fetch(context(response), account, signal()),
      ).rejects.toMatchObject({ code: 'temporary_error' })
    }
  })

  it('never accepts a management key as the current runtime key or an undeclared operation', async () => {
    await expect(
      openRouterFinancialAdapter.fetch(
        context(Response.json({ data: { is_management_key: true } })),
        credential,
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'invalid_credential' })
    const input = context(Response.json({}))
    await expect(
      openRouterFinancialAdapter.fetch(
        input,
        { ...account, credentialPurpose: 'runtime' },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'unsupported' })
    expect(input.egress.fetch).not.toHaveBeenCalled()
  })

  it('honors caller cancellation and bounds a transport that does not settle', async () => {
    const input = context(Response.json({}))
    const controller = new AbortController()
    controller.abort()
    await expect(
      openRouterFinancialAdapter.fetch(input, account, controller.signal),
    ).rejects.toMatchObject({ code: 'temporary_error' })
    expect(input.egress.fetch).not.toHaveBeenCalled()
    input.egress.fetch = vi.fn(() => new Promise<Response>(() => undefined))
    const running = new AbortController()
    const result = openRouterFinancialAdapter.fetch(
      input,
      account,
      running.signal,
    )
    running.abort()
    await expect(result).rejects.toMatchObject({ code: 'temporary_error' })
  })
  it.each([false, true])(
    'cancels a stalled provider body even when cancellation fails: %s',
    async cancellationFails => {
      vi.useFakeTimers()
      const cancel = vi.fn(() => {
        if (cancellationFails) throw new Error('sensitive cancellation error')
      })
      const response = new Response(new ReadableStream({ cancel }))
      const context = {
        connection: { endpointUrl: 'https://openrouter.ai/api/v1' },
        credential: 'management-test-secret',
        egress: { fetch: vi.fn(async () => response) },
      } as unknown as AiAdminAdapterContext
      try {
        const result = openRouterFinancialAdapter.fetch(
          context,
          account,
          new AbortController().signal,
        )
        const assertion = expect(result).rejects.toMatchObject({
          code: 'temporary_error',
        })
        await vi.advanceTimersByTimeAsync(5000)
        await assertion
        expect(cancel).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    },
  )
})
