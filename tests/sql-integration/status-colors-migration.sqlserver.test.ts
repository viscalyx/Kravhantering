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
  {
    color: '#94a3b8',
    id: 1,
    nameEn: 'Included',
    nameSv: 'Inkluderad',
  },
  {
    color: '#f59e0b',
    id: 2,
    nameEn: 'In Progress',
    nameSv: 'Pågående',
  },
  {
    color: '#3b82f6',
    id: 3,
    nameEn: 'Implemented',
    nameSv: 'Implementerad',
  },
  {
    color: '#22c55e',
    id: 4,
    nameEn: 'Verified',
    nameSv: 'Verifierad',
  },
  {
    color: '#ef4444',
    id: 5,
    nameEn: 'Deviated',
    nameSv: 'Avviken',
  },
  {
    color: '#6b7280',
    id: 6,
    nameEn: 'Not Applicable',
    nameSv: 'Ej tillämpbar',
  },
] as const

const EXPECTED_USAGE_STATUS_COLORS = USAGE_STATUS_COLORS.map(
  ({ color, id }) => ({ color, id }),
)

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
        `IF NOT EXISTS (
           SELECT 1 FROM [specification_item_statuses] WHERE [id] = @0
         )
         BEGIN
           SET IDENTITY_INSERT [specification_item_statuses] ON;
           INSERT INTO [specification_item_statuses] (
             [id], [name_sv], [name_en], [color], [sort_order]
           ) VALUES (@0, @1, @2, @3, @0);
           SET IDENTITY_INSERT [specification_item_statuses] OFF;
         END`,
        [status.id, status.nameSv, status.nameEn, status.color],
      )
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
    ).resolves.toEqual(EXPECTED_USAGE_STATUS_COLORS)
  })

  it('rejects rollback because replaced invalid values cannot be restored', async () => {
    await expect(new RepairInvalidStatusColors().down(appDb())).rejects.toThrow(
      'Cannot restore invalid status colors replaced by migration 0053.',
    )
  })
})
