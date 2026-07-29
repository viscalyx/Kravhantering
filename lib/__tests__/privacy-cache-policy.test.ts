import { describe, expect, it } from 'vitest'
import { applyPrivacyResponseCachePolicy } from '@/lib/http/privacy-cache-policy'

describe('applyPrivacyResponseCachePolicy', () => {
  it.each([
    '/api/privacy/data-subject-export',
    '/api/privacy/erasure-preview',
    '/api/privacy/erasure-requests/',
  ])('prevents storage for the registered privacy mutation %s', path => {
    const request = new Request(`http://localhost${path}`, { method: 'POST' })
    const response = new Response(null, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    })

    const protectedResponse = applyPrivacyResponseCachePolicy(request, response)

    expect(protectedResponse).toBe(response)
    expect(protectedResponse.headers.get('Cache-Control')).toBe('no-store')
  })

  it.each([
    ['GET', '/api/privacy/erasure-preview'],
    ['POST', '/api/privacy/unregistered'],
  ])('leaves an unregistered %s %s response unchanged', (method, path) => {
    const request = new Request(`http://localhost${path}`, { method })
    const response = new Response(null, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })

    const unchangedResponse = applyPrivacyResponseCachePolicy(request, response)

    expect(unchangedResponse).toBe(response)
    expect(unchangedResponse.headers.get('Cache-Control')).toBe(
      'private, max-age=60',
    )
  })
})
