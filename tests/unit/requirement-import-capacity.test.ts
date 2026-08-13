import { afterEach, describe, expect, it } from 'vitest'
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
    await expect(
      withRequirementImportCapacity(async () => {
        throw new Error('failed')
      }),
    ).rejects.toThrow('failed')

    expect(tryAcquireRequirementImportCapacity()).not.toBeNull()
  })
})
