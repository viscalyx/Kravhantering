import { describe, expect, it, vi } from 'vitest'
import { accessReviewErrorResponse } from '@/lib/access-review/route-helpers'
import { CsrfError } from '@/lib/auth/csrf'
import { forbiddenError } from '@/lib/requirements/errors'

describe('accessReviewErrorResponse', () => {
  it('maps expected errors and bounds unexpected error details', async () => {
    expect(
      accessReviewErrorResponse('Failed', new CsrfError('Denied')).status,
    ).toBe(403)
    expect(
      accessReviewErrorResponse('Failed', forbiddenError('Denied')).status,
    ).toBe(403)
    const response = accessReviewErrorResponse('Failed', new Error('secret'))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed' })

    vi.stubEnv('NODE_ENV', 'development')
    const development = accessReviewErrorResponse(
      'Failed',
      new Error('token=secret'),
    )
    expect(await development.json()).toMatchObject({
      debugMessage: expect.any(String),
      error: 'Failed',
    })
    vi.unstubAllEnvs()
  })
})
