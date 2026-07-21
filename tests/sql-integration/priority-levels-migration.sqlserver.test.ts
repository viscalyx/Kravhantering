import { beforeEach, describe, expect, it } from 'vitest'
import RepairInvalidPriorityColors from '@/typeorm/migrations/0050_repair_invalid_priority_colors.mjs'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

const CANONICAL_COLORS = [
  { code: 'P1', color: '#6b7280' },
  { code: 'P2', color: '#22c55e' },
  { code: 'P3', color: '#eab308' },
  { code: 'P4', color: '#f97316' },
  { code: 'P5', color: '#ef4444' },
] as const

describe('priority-level color repair migration', () => {
  const appDb = useSqlIntegrationDatabase()

  beforeEach(async () => {
    for (const priority of CANONICAL_COLORS) {
      await appDb().query(
        'UPDATE [priority_levels] SET [color] = @0 WHERE [code] = @1',
        [priority.color, priority.code],
      )
    }
  })

  it('preserves valid custom colors byte-for-byte and repairs invalid P1-P5 colors', async () => {
    const migration = new RepairInvalidPriorityColors()
    await appDb().query(
      `UPDATE [priority_levels]
       SET [color] = CASE [code]
         WHEN N'P1' THEN N'#a1b2c3'
         WHEN N'P2' THEN N'#A1B2C3'
         ELSE [color]
       END`,
    )

    await migration.up(appDb())

    const validRows = (await appDb().query(
      `SELECT [code], [color]
       FROM [priority_levels]
       WHERE [code] IN (N'P1', N'P2')
       ORDER BY [code]`,
    )) as Array<{ code: string; color: string }>
    expect(validRows).toEqual([
      { code: 'P1', color: '#a1b2c3' },
      { code: 'P2', color: '#A1B2C3' },
    ])

    await appDb().query(
      `UPDATE [priority_levels]
       SET [color] = CASE [code]
         WHEN N'P1' THEN N'not-a-color'
         WHEN N'P2' THEN N'#12345'
         WHEN N'P3' THEN N'#12345G'
         WHEN N'P4' THEN N'123456'
         WHEN N'P5' THEN N''
         ELSE [color]
       END`,
    )

    await migration.up(appDb())

    const repairedRows = (await appDb().query(
      `SELECT [code], [color]
       FROM [priority_levels]
       WHERE [code] IN (N'P1', N'P2', N'P3', N'P4', N'P5')
       ORDER BY [code]`,
    )) as Array<{ code: string; color: string }>
    expect(repairedRows).toEqual(CANONICAL_COLORS)
  })

  it('rejects rollback because replaced values cannot be restored', async () => {
    await expect(
      new RepairInvalidPriorityColors().down(appDb()),
    ).rejects.toThrow(
      'Cannot restore invalid priority colors replaced by migration 0050.',
    )
  })
})
