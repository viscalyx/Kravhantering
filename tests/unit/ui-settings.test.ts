import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createUiSettingsLoader,
  formatUiSettingsLoadError,
  getRequirementListColumnDefaults,
  getUiTerminology,
  updateRequirementListColumnDefaults,
  updateUiTerminology,
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

const mockTerminologyRow = {
  key: 'description',
  singularSv: 'krav',
  pluralSv: 'krav',
  definitePluralSv: 'kraven',
  singularEn: 'requirement',
  pluralEn: 'requirements',
  definitePluralEn: 'the requirements',
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

  it('getUiTerminology loads and normalizes terminology from ui_terminology', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([mockTerminologyRow])

    const result = await getUiTerminology(db)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM ui_terminology'),
    )
    expect(result).toBeTruthy()
    expect(Object.keys(result).length).toBeGreaterThan(0)
  })

  it('getUiTerminology wraps a query error in a helpful message', async () => {
    const { db, query } = createSqlServerDb()
    query.mockRejectedValueOnce(new Error('db offline'))

    await expect(getUiTerminology(db)).rejects.toThrow(
      /Failed to load UI terminology/,
    )
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

  it('createUiSettingsLoader caches terminology between calls', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([mockTerminologyRow])

    const loader = createUiSettingsLoader(db)
    await loader.getTerminology()
    await loader.getTerminology()

    expect(query).toHaveBeenCalledTimes(1)
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

  it('updateUiTerminology writes each entry via a parameterized upsert query', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValue([])

    const result = await updateUiTerminology(db, [
      {
        key: 'description',
        sv: { singular: 'krav', plural: 'krav', definitePlural: 'kraven' },
        en: {
          singular: 'requirement',
          plural: 'requirements',
          definitePlural: 'the requirements',
        },
      },
    ])

    expect(query).toHaveBeenCalled()
    const firstCall = query.mock.calls[0]
    expect(firstCall[0]).toMatch(/UPDATE ui_terminology/)
    expect(firstCall[0]).toMatch(/INSERT INTO ui_terminology/)
    expect(result).toBeTruthy()
  })

  it('updateRequirementListColumnDefaults clears and reinserts within a transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    query.mockResolvedValue([])

    await updateRequirementListColumnDefaults(db, [
      { columnId: 'uniqueId', sortOrder: 0, defaultVisible: true },
      { columnId: 'description', sortOrder: 1, defaultVisible: false },
    ])

    expect(transaction).toHaveBeenCalledTimes(1)
    const deleteCall = query.mock.calls.find(([sql]) =>
      /DELETE FROM requirement_list_column_defaults/.test(sql),
    )
    expect(deleteCall).toBeTruthy()
    const insertCalls = query.mock.calls.filter(([sql]) =>
      /INSERT INTO requirement_list_column_defaults/.test(sql),
    )
    expect(insertCalls.length).toBeGreaterThanOrEqual(2)
  })
})
