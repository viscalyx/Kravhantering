import { describe, expect, it, vi } from 'vitest'
import {
  getHsaPersonLookupConfig,
  lookupHsaPerson,
} from '@/lib/hsa/person-lookup'
import { isRequirementsServiceError } from '@/lib/requirements/errors'

const HSA_ID = 'SE5560000001-kalle1'

function expectRequirementsError(error: unknown, code: string) {
  expect(isRequirementsServiceError(error)).toBe(true)
  if (isRequirementsServiceError(error)) {
    expect(error.code).toBe(code)
  }
}

describe('HSA person lookup', () => {
  it('reads lookup URL and clamps timeout from environment', () => {
    expect(
      getHsaPersonLookupConfig({
        HSA_PERSON_LOOKUP_TIMEOUT_MS: '750',
        HSA_PERSON_LOOKUP_URL: ' http://kong:8000/hsa/person-records/lookup ',
      } as unknown as NodeJS.ProcessEnv),
    ).toEqual({
      timeoutMs: 750,
      url: 'http://kong:8000/hsa/person-records/lookup',
    })
  })

  it('posts HSA-id as JSON and maps split person fields', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            email: 'kalle@example.test',
            givenName: 'Kalle',
            hsaId: HSA_ID,
            middleName: 'Bertil',
            surname: 'Svensson',
          }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch

    const person = await lookupHsaPerson(HSA_ID, {
      config: {
        timeoutMs: 5000,
        url: 'http://kong:8000/hsa/person-records/lookup',
      },
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://kong:8000/hsa/person-records/lookup',
      expect.objectContaining({
        body: JSON.stringify({ hsaId: HSA_ID }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )
    expect(person).toEqual({
      email: 'kalle@example.test',
      givenName: 'Kalle',
      hsaId: HSA_ID,
      middleName: 'Bertil',
      surname: 'Svensson',
    })
  })

  it('rejects invalid HSA-id before calling the integration endpoint', async () => {
    const fetchImpl = vi.fn()

    await expect(
      lookupHsaPerson('not-a-hsa-id', {
        config: {
          timeoutMs: 5000,
          url: 'http://kong:8000/hsa/person-records/lookup',
        },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'validation')
      return true
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps missing configuration to service unavailable', async () => {
    const previousUrl = process.env.HSA_PERSON_LOOKUP_URL
    const previousTimeout = process.env.HSA_PERSON_LOOKUP_TIMEOUT_MS
    delete process.env.HSA_PERSON_LOOKUP_URL
    delete process.env.HSA_PERSON_LOOKUP_TIMEOUT_MS
    try {
      await expect(lookupHsaPerson(HSA_ID)).rejects.toSatisfy(error => {
        expectRequirementsError(error, 'service_unavailable')
        return true
      })
    } finally {
      if (previousUrl === undefined) {
        delete process.env.HSA_PERSON_LOOKUP_URL
      } else {
        process.env.HSA_PERSON_LOOKUP_URL = previousUrl
      }
      if (previousTimeout === undefined) {
        delete process.env.HSA_PERSON_LOOKUP_TIMEOUT_MS
      } else {
        process.env.HSA_PERSON_LOOKUP_TIMEOUT_MS = previousTimeout
      }
    }
  })

  it('maps catalog not found and conflict responses to domain errors', async () => {
    const notFoundFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'not_found' }), { status: 404 }),
    )
    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 5000, url: 'http://kong/lookup' },
        fetchImpl: notFoundFetch as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'validation')
      return true
    })

    const conflictFetch = vi.fn(async () => new Response('{}', { status: 409 }))
    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 5000, url: 'http://kong/lookup' },
        fetchImpl: conflictFetch as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'conflict')
      return true
    })
  })

  it('maps a generic integration 404 to service unavailable', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'no Route matched' }), {
          status: 404,
        }),
    )

    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 5000, url: 'http://kong/lookup' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'service_unavailable')
      return true
    })
  })

  it('maps aborts to service unavailable timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException('timeout', 'AbortError')
    })

    await expect(
      lookupHsaPerson(HSA_ID, {
        config: { timeoutMs: 1, url: 'http://kong/lookup' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toSatisfy(error => {
      expectRequirementsError(error, 'service_unavailable')
      return true
    })
  })
})
