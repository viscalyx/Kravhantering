import { describe, expect, it } from 'vitest'
import { resetDemoSqlServerData } from '@/scripts/db-sqlserver-admin.mjs'
import { seedDemoDatabase } from '@/typeorm/seed.mjs'
import { useSqlIntegrationDatabase } from './helpers/sql-test-database'

describe('disposable demo reset', () => {
  const appDb = useSqlIntegrationDatabase()

  it('clears seeded lifecycle records while retaining required data and active lifecycle enforcement', async () => {
    await seedDemoDatabase(appDb())
    const retentionPolicies = await appDb().query(
      'SELECT * FROM archiving_retention_policies ORDER BY id',
    )
    expect(
      await appDb().query(
        'SELECT COUNT(*) AS count FROM rfi_question_suggestions WHERE is_review_requested = 1',
      ),
    ).toEqual([{ count: 6 }])
    await expect(
      appDb().query('DELETE FROM rfi_question_suggestions'),
    ).rejects.toThrow('Only draft RFI question suggestions can be deleted.')

    await expect(resetDemoSqlServerData(appDb())).resolves.toEqual({
      tablesCleared: 63,
    })
    expect(
      await appDb().query(
        'SELECT COUNT(*) AS count FROM rfi_question_suggestions',
      ),
    ).toEqual([{ count: 0 }])
    expect(
      await appDb().query('SELECT COUNT(*) AS count FROM requirement_statuses'),
    ).toEqual([{ count: 4 }])
    expect(
      await appDb().query(
        'SELECT * FROM archiving_retention_policies ORDER BY id',
      ),
    ).toEqual(retentionPolicies)

    await seedDemoDatabase(appDb())
    await expect(
      appDb().query('DELETE FROM rfi_question_suggestions'),
    ).rejects.toThrow('Only draft RFI question suggestions can be deleted.')
  })

  it('restores cleared records when a later reset operation fails', async () => {
    await seedDemoDatabase(appDb())
    const before = await appDb().query(
      'SELECT * FROM rfi_question_suggestions ORDER BY id',
    )
    await expect(
      resetDemoSqlServerData(appDb(), {
        demoResetTables: [
          'rfi_question_suggestions',
          'invalid-demo-reset-table',
        ],
      }),
    ).rejects.toThrow('Unsafe SQL Server table name for demo reset')
    expect(
      await appDb().query('SELECT * FROM rfi_question_suggestions ORDER BY id'),
    ).toEqual(before)
    await expect(
      appDb().query('DELETE FROM rfi_question_suggestions'),
    ).rejects.toThrow('Only draft RFI question suggestions can be deleted.')
  })
})
