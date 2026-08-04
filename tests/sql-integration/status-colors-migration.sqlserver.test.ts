import { beforeEach, describe, expect, it } from 'vitest'
import RepairInvalidStatusColors from '@/typeorm/migrations/0053_repair_invalid_status_colors.mjs'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

const REQUIREMENT_STATUS_COLORS = [
  { color: '#3b82f6', id: 1 },
  { color: '#eab308', id: 2 },
  { color: '#22c55e', id: 3 },
  { color: '#6b7280', id: 4 },
] as const

const USAGE_STATUS_COLORS = [
  { color: '#94a3b8', id: 1 },
  { color: '#f59e0b', id: 2 },
  { color: '#3b82f6', id: 3 },
  { color: '#22c55e', id: 4 },
  { color: '#ef4444', id: 5 },
  { color: '#6b7280', id: 6 },
] as const

describe('status color repair migration', () => {
  const appDb = useSqlIntegrationDatabase()

  beforeEach(async () => {
    for (const status of REQUIREMENT_STATUS_COLORS) {
      await appDb().query(
        'UPDATE [requirement_statuses] SET [color] = @0 WHERE [id] = @1',
        [status.color, status.id],
      )
    }
    for (const status of USAGE_STATUS_COLORS) {
      await appDb().query(
        'UPDATE [specification_item_statuses] SET [color] = @0 WHERE [id] = @1',
        [status.color, status.id],
      )
    }
  })

  it('preserves valid customized colors byte-for-byte in both catalogs', async () => {
    await appDb().query(
      "UPDATE [requirement_statuses] SET [color] = N'#A1B2C3' WHERE [id] = 1",
    )
    await appDb().query(
      "UPDATE [specification_item_statuses] SET [color] = N'#a1b2c3' WHERE [id] = 1",
    )

    await new RepairInvalidStatusColors().up(appDb())

    await expect(
      appDb().query(
        `SELECT [color] FROM [requirement_statuses] WHERE [id] = 1`,
      ),
    ).resolves.toEqual([{ color: '#A1B2C3' }])
    await expect(
      appDb().query(
        `SELECT [color] FROM [specification_item_statuses] WHERE [id] = 1`,
      ),
    ).resolves.toEqual([{ color: '#a1b2c3' }])
  })

  it('repairs only invalid seeded requirement version status colors', async () => {
    await appDb().query(
      `UPDATE [requirement_statuses]
       SET [color] = CASE [id]
         WHEN 1 THEN N'not-a-color'
         WHEN 2 THEN N'#12345'
         WHEN 3 THEN N'#12345G'
         WHEN 4 THEN N'123456'
         ELSE [color]
       END`,
    )

    await new RepairInvalidStatusColors().up(appDb())

    await expect(
      appDb().query(
        `SELECT [id], [color]
         FROM [requirement_statuses]
         WHERE [id] IN (1, 2, 3, 4)
         ORDER BY [id]`,
      ),
    ).resolves.toEqual(REQUIREMENT_STATUS_COLORS)
  })

  it('repairs only invalid seeded usage status colors', async () => {
    await appDb().query(
      `UPDATE [specification_item_statuses]
       SET [color] = CASE [id]
         WHEN 1 THEN N'not-a-color'
         WHEN 2 THEN N'#12345'
         WHEN 3 THEN N'#12345G'
         WHEN 4 THEN N'123456'
         WHEN 5 THEN N''
         WHEN 6 THEN N'#123456 '
         ELSE [color]
       END`,
    )

    await new RepairInvalidStatusColors().up(appDb())

    await expect(
      appDb().query(
        `SELECT [id], [color]
         FROM [specification_item_statuses]
         WHERE [id] IN (1, 2, 3, 4, 5, 6)
         ORDER BY [id]`,
      ),
    ).resolves.toEqual(USAGE_STATUS_COLORS)
  })

  it('rejects rollback because replaced invalid values cannot be restored', async () => {
    await expect(new RepairInvalidStatusColors().down(appDb())).rejects.toThrow(
      'Cannot restore invalid status colors replaced by migration 0053.',
    )
  })
})
