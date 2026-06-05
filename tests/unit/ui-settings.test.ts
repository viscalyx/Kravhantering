import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createUiSettingsLoader,
  formatUiSettingsLoadError,
  getRequirementListColumnDefaults,
  updateRequirementListColumnDefaults,
} from '@/lib/dal/ui-settings'
import type { SqlServerDatabase } from '@/lib/db'

function createSqlServerDb() {
  const query =
    vi.fn<(sql: string, parameters?: unknown[]) => Promise<unknown[]>>()
  const transaction = vi.fn(
    async (fn: (manager: { query: typeof query }) => Promise<unknown>) =>
      fn({ query }),
  )
  const db = { query, transaction } as unknown as SqlServerDatabase
  return { db, query, transaction }
}

describe('ui-settings DAL', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('formatUiSettingsLoadError serializes Error instances', () => {
    const err = new Error('boom')
    const formatted = formatUiSettingsLoadError(err)
    expect(formatted).toMatchObject({
      message: 'boom',
      stack: expect.any(String),
    })
  })

  it('formatUiSettingsLoadError wraps non-Error values', () => {
    expect(formatUiSettingsLoadError('plain string')).toEqual({
      error: 'plain string',
    })
  })

  it('getRequirementListColumnDefaults loads the defaults table', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      { columnId: 'uniqueId', sortOrder: 0, isDefaultVisible: 1 },
      { columnId: 'description', sortOrder: 1, isDefaultVisible: 1 },
    ])

    const result = await getRequirementListColumnDefaults(db)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM requirement_list_column_defaults'),
    )
    expect(result.length).toBeGreaterThan(0)
  })

  it('getRequirementListColumnDefaults wraps query errors', async () => {
    const { db, query } = createSqlServerDb()
    query.mockRejectedValueOnce(new Error('db offline'))

    await expect(getRequirementListColumnDefaults(db)).rejects.toThrow(
      /Failed to load requirement column defaults/,
    )
  })

  it('createUiSettingsLoader caches column defaults between calls', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([
      { columnId: 'uniqueId', sortOrder: 0, isDefaultVisible: 1 },
    ])

    const loader = createUiSettingsLoader(db)
    await loader.getColumnDefaults()
    await loader.getColumnDefaults()

    expect(query).toHaveBeenCalledTimes(1)
  })

  it('updateRequirementListColumnDefaults clears and reinserts within a transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValue([])
    const audit = vi.fn(async executor => {
      await executor.query('INSERT INTO action_audit_events (...) VALUES (...)')
    })

    await updateRequirementListColumnDefaults(
      db,
      [
        { columnId: 'uniqueId', sortOrder: 0, defaultVisible: true },
        { columnId: 'description', sortOrder: 1, defaultVisible: false },
      ],
      { audit },
    )

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledTimes(1)
    const deleteCall = query.mock.calls.find(([sql]) =>
      /DELETE FROM requirement_list_column_defaults/.test(sql),
    )
    expect(deleteCall).toBeTruthy()
    const insertCalls = query.mock.calls.filter(([sql]) =>
      /INSERT INTO requirement_list_column_defaults/.test(sql),
    )
    expect(insertCalls.length).toBeGreaterThanOrEqual(2)
    expect(
      query.mock.calls.some(([sql]) =>
        /INSERT INTO action_audit_events/.test(sql),
      ),
    ).toBe(true)
  })
})
