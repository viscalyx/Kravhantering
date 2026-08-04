import { describe, expect, it, vi } from 'vitest'
import RepairInvalidStatusColors from '@/typeorm/migrations/0053_repair_invalid_status_colors.mjs'

describe('status color repair migration contract', () => {
  it('targets only the seeded rows and exact invalid-color predicate', async () => {
    const query = vi.fn(async (_statement: string) => undefined)

    await new RepairInvalidStatusColors().up({ query })

    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0]?.[0]).toContain('UPDATE [requirement_statuses]')
    expect(query.mock.calls[0]?.[0]).toContain('WHERE [id] IN (1, 2, 3, 4)')
    expect(query.mock.calls[1]?.[0]).toContain(
      'UPDATE [specification_item_statuses]',
    )
    expect(query.mock.calls[1]?.[0]).toContain(
      'WHERE [id] IN (1, 2, 3, 4, 5, 6)',
    )
    for (const [statement] of query.mock.calls) {
      expect(statement).toContain('DATALENGTH([color]) <> 14')
      expect(statement).toContain('Latin1_General_100_BIN2 NOT LIKE')
    }
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
