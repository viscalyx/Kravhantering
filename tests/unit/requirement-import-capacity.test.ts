import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resetRequirementImportCapacityForTests,
  tryAcquireRequirementImportCapacity,
  withRequirementImportCapacity,
} from '@/lib/requirements/import-capacity'

describe('requirement import capacity', () => {
  afterEach(() => resetRequirementImportCapacityForTests())

  it('admits exactly two operations and rejects a third without queuing', () => {
    const first = tryAcquireRequirementImportCapacity()
    const second = tryAcquireRequirementImportCapacity()

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(tryAcquireRequirementImportCapacity()).toBeNull()

    first?.release()
    expect(tryAcquireRequirementImportCapacity()).not.toBeNull()
  })

  it('releases a slot after failure', async () => {
    const first = tryAcquireRequirementImportCapacity()
    expect(first).not.toBeNull()

    try {
      await expect(
        withRequirementImportCapacity(async () => {
          throw new Error('failed')
        }),
      ).rejects.toThrow('failed')

      const second = tryAcquireRequirementImportCapacity()
      expect(second).not.toBeNull()
      try {
        expect(tryAcquireRequirementImportCapacity()).toBeNull()
      } finally {
        second?.release()
      }
    } finally {
      first?.release()
    }
  })

  it('makes releasing a capacity lease idempotent', () => {
    const lease = tryAcquireRequirementImportCapacity()
    expect(lease).not.toBeNull()

    lease?.release()
    lease?.release()

    const first = tryAcquireRequirementImportCapacity()
    const second = tryAcquireRequirementImportCapacity()
    try {
      expect(first).not.toBeNull()
      expect(second).not.toBeNull()
      expect(tryAcquireRequirementImportCapacity()).toBeNull()
    } finally {
      second?.release()
      first?.release()
    }
  })

  it('records a structured capacity event before rejecting a third operation', async () => {
    const first = tryAcquireRequirementImportCapacity()
    const second = tryAcquireRequirementImportCapacity()
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    try {
      await expect(
        withRequirementImportCapacity(async () => undefined),
      ).rejects.toMatchObject({ code: 'import_capacity_busy' })
      const event = JSON.parse(String(info.mock.calls.at(-1)?.[0])) as Record<
        string,
        unknown
      >
      expect(event).toMatchObject({
        active_count: 2,
        capacity_reason: 'concurrency_limit',
        concurrency_limit: 2,
        event: 'capacity.throttled',
        operation: 'requirements.import.execute',
        outcome: 'throttled',
        retry_after_seconds: 5,
        status_code: 429,
        throttled: true,
      })
    } finally {
      info.mockRestore()
      second?.release()
      first?.release()
    }
  })
})
