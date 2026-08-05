import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequirementsLogger } from '@/lib/requirements/logging'

describe('requirements logger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-05T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('writes structured info events without requiring additional fields', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const logger = createRequirementsLogger()

    logger.info('requirements.catalog.listed')

    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toEqual({
      event: 'requirements.catalog.listed',
      level: 'info',
      timestamp: '2026-08-05T12:00:00.000Z',
    })
  })

  it('writes structured error events with their observable fields', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createRequirementsLogger()

    logger.error('requirements.catalog.failed', {
      reason: 'database_unavailable',
    })

    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toEqual({
      event: 'requirements.catalog.failed',
      level: 'error',
      reason: 'database_unavailable',
      timestamp: '2026-08-05T12:00:00.000Z',
    })
  })
})
