import { describe, expect, it } from 'vitest'
import { CsrfError } from '@/lib/auth/csrf'
import { toHttpErrorPayload } from '@/lib/requirements/service'

describe('toHttpErrorPayload', () => {
  it('maps status-bearing auth errors to handled HTTP payloads', () => {
    const result = toHttpErrorPayload(
      new CsrfError('Cross-origin request rejected.'),
    )

    expect(result).toEqual({
      body: {
        code: 'forbidden',
        details: undefined,
        error: 'Cross-origin request rejected.',
      },
      status: 403,
    })
  })
})
