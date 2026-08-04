import { describe, expect, it, vi } from 'vitest'
import RepairInvalidStatusColors from '@/typeorm/migrations/0053_repair_invalid_status_colors.mjs'

describe('status color repair migration contract', () => {
  it('runs both catalog repair operations', async () => {
    const query = vi.fn(async (_statement: string) => undefined)

    await new RepairInvalidStatusColors().up({ query })

    expect(query).toHaveBeenCalledTimes(2)
  })

  it('fails rollback explicitly because invalid values are irrecoverable', async () => {
    const query = vi.fn(async (statement: string) => {
      throw new Error(statement)
    })

    await expect(
      new RepairInvalidStatusColors().down({ query }),
    ).rejects.toThrow(
      'Cannot restore invalid status colors replaced by migration 0053.',
    )
  })
})
