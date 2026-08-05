import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyRequestCorrelationHeaders,
  applyResponseCorrelationHeaders,
  correlationIdFromTraceparent,
  normalizeExternalId,
  resolveRequestCorrelationIds,
} from '@/lib/observability/request-ids'

describe('request correlation IDs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes bounded external IDs and rejects unsafe values', () => {
    expect(normalizeExternalId('  request-1  ')).toBe('request-1')
    expect(normalizeExternalId(null)).toBeNull()
    expect(normalizeExternalId('   ')).toBeNull()
    expect(normalizeExternalId('contains spaces')).toBeNull()
    expect(normalizeExternalId('x'.repeat(129))).toBeNull()
  })

  it('extracts lowercase correlation IDs from valid traceparent headers', () => {
    expect(
      correlationIdFromTraceparent(
        '00-ABCDEF0123456789ABCDEF0123456789-0123456789abcdef-01',
      ),
    ).toBe('abcdef0123456789abcdef0123456789')
    expect(correlationIdFromTraceparent('invalid')).toBeNull()
    expect(correlationIdFromTraceparent(null)).toBeNull()
  })

  it('prefers explicit request and correlation headers', () => {
    expect(
      resolveRequestCorrelationIds(
        new Headers({
          'X-Correlation-Id': 'correlation-1',
          'X-Request-Id': 'request-1',
          traceparent:
            '00-abcdef0123456789abcdef0123456789-0123456789abcdef-01',
        }),
      ),
    ).toEqual({ correlationId: 'correlation-1', requestId: 'request-1' })
  })

  it('uses trace context or the generated request ID as correlation fallback', () => {
    const randomUuid = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')

    expect(
      resolveRequestCorrelationIds(
        new Headers({
          traceparent:
            '00-abcdef0123456789abcdef0123456789-0123456789abcdef-01',
        }),
      ),
    ).toEqual({
      correlationId: 'abcdef0123456789abcdef0123456789',
      requestId: '00000000-0000-4000-8000-000000000001',
    })
    expect(resolveRequestCorrelationIds(new Headers())).toEqual({
      correlationId: '00000000-0000-4000-8000-000000000002',
      requestId: '00000000-0000-4000-8000-000000000002',
    })
    expect(randomUuid).toHaveBeenCalledTimes(2)
  })

  it('applies request and response correlation headers', () => {
    const ids = { correlationId: 'correlation-1', requestId: 'request-1' }
    const headers = applyRequestCorrelationHeaders(new Headers(), ids)
    const response = applyResponseCorrelationHeaders(new Response(), ids)

    expect(headers.get('X-Request-Id')).toBe('request-1')
    expect(headers.get('X-Correlation-Id')).toBe('correlation-1')
    expect(response.headers.get('X-Request-Id')).toBe('request-1')
    expect(response.headers.get('X-Correlation-Id')).toBe('correlation-1')
  })
})
