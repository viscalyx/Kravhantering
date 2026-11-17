import { QueryFailedError } from 'typeorm'
import { describe, expect, it, vi } from 'vitest'
import { accessReviewErrorResponse } from '@/lib/access-review/route-helpers'
import { CsrfError } from '@/lib/auth/csrf'
import { forbiddenError } from '@/lib/requirements/errors'

describe('accessReviewErrorResponse', () => {
  it('retains a SQL occurrence reference through the shared access-review error boundary', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = accessReviewErrorResponse(
        'Failed to read access review',
        new QueryFailedError(
          'SELECT id FROM access_review_runs',
          [],
          new Error('Database unavailable password=private'),
        ),
      )
      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body).toMatchObject({
        code: 'sql_failure',
        correlationId: expect.any(String),
        timestamp: expect.any(String),
      })
      expect(JSON.stringify(body)).not.toMatch(/private|SELECT/)
      expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
        correlation_id: body.correlationId,
        timestamp: body.timestamp,
      })
    } finally {
      log.mockRestore()
    }
  })

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
