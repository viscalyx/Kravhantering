import { describe, expect, it } from 'vitest'
import { noStore } from '@/lib/http/cache-control'

describe('noStore', () => {
  it('sets Cache-Control to no-store and preserves the response', () => {
    const response = new Response('sensitive')

    const protectedResponse = noStore(response)

    expect(protectedResponse).toBe(response)
    expect(protectedResponse.headers.get('Cache-Control')).toBe('no-store')
  })

  it('overrides a conflicting cache policy', () => {
    const response = new Response('sensitive', {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    })

    noStore(response)

    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
