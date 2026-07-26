import { describe, expect, it } from 'vitest'

import { GET } from '@/app/api-docs/hsa-person-lookup/route'

describe('GET /api-docs/hsa-person-lookup', () => {
  it('redirects to the generated public Swagger UI without caching', () => {
    const response = GET(
      new Request('http://localhost:3000/api-docs/hsa-person-lookup/'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Location')).toBe(
      'http://localhost:3000/api-docs/hsa-person-lookup/index.html',
    )
  })
})
