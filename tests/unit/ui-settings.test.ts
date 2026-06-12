import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createUiSettingsLoader,
  formatUiSettingsLoadError,
  getRequirementListColumnDefaults,
  getVisibleHsaIdPrefixes,
  HsaIdPrefixSettingsError,
  updateHsaIdPrefixes,
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

  it('getVisibleHsaIdPrefixes loads visible prefixes in display order', async () => {
    const { db, query } = createSqlServerDb()
    query.mockResolvedValueOnce([
      {
        id: 2,
        isDefault: 0,
        isVisible: 1,
        label: null,
        prefix: 'NO5560000001',
      },
      {
        id: 1,
        isDefault: 1,
        isVisible: 1,
        label: 'Demo',
        prefix: 'SE5560000001',
      },
    ])

    const result = await getVisibleHsaIdPrefixes(db)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE is_visible = 1'),
    )
    expect(result).toEqual([
      {
        id: 1,
        isDefault: true,
        label: 'Demo',
        prefix: 'SE5560000001',
      },
      {
        id: 2,
        isDefault: false,
        label: null,
        prefix: 'NO5560000001',
      },
    ])
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

  it('updateHsaIdPrefixes inserts, updates, deletes unused rows, and audits in one transaction', async () => {
    const { db, query, transaction } = createSqlServerDb()
    const audit = vi.fn(async executor => {
      await executor.query('INSERT INTO action_audit_events (...) VALUES (...)')
    })
    query.mockImplementation(async (sql: string) => {
      if (/FROM hsa_id_prefixes/.test(sql)) {
        return [
          {
            id: 1,
            isDefault: 1,
            isVisible: 1,
            label: null,
            prefix: 'SE5560000001',
          },
          {
            id: 2,
            isDefault: 0,
            isVisible: 0,
            label: null,
            prefix: 'NO5560000001',
          },
        ]
      }
      return []
    })

    await updateHsaIdPrefixes(
      db,
      [
        {
          id: 1,
          isDefault: true,
          isVisible: true,
          label: 'Demo',
          prefix: 'SE5560000001',
        },
        {
          isDefault: false,
          isVisible: true,
          label: null,
          prefix: 'DK5560000001',
        },
      ],
      { audit },
    )

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(
      query.mock.calls.some(
        ([sql, params]) =>
          /DELETE FROM hsa_id_prefixes WHERE id = @0/.test(sql) &&
          params?.[0] === 2,
      ),
    ).toBe(true)
    expect(
      query.mock.calls.some(([sql]) => /UPDATE hsa_id_prefixes/.test(sql)),
    ).toBe(true)
    const clearDefaultIndex = query.mock.calls.findIndex(([sql]) =>
      /UPDATE hsa_id_prefixes SET is_default = 0/.test(sql),
    )
    const insertIndex = query.mock.calls.findIndex(([sql]) =>
      /INSERT INTO hsa_id_prefixes/.test(sql),
    )
    expect(clearDefaultIndex).toBeGreaterThanOrEqual(0)
    expect(insertIndex).toBeGreaterThan(clearDefaultIndex)
    expect(
      query.mock.calls.some(([sql]) => /INSERT INTO hsa_id_prefixes/.test(sql)),
    ).toBe(true)
    expect(audit).toHaveBeenCalledTimes(1)
  })

  it('updateHsaIdPrefixes rejects invalid default and duplicate inputs before querying', async () => {
    const { db, query } = createSqlServerDb()

    await expect(
      updateHsaIdPrefixes(db, [
        {
          isDefault: true,
          isVisible: false,
          label: null,
          prefix: 'SE5560000001',
        },
      ]),
    ).rejects.toMatchObject({ code: 'default_hidden' })

    await expect(
      updateHsaIdPrefixes(db, [
        {
          isDefault: true,
          isVisible: true,
          label: null,
          prefix: 'SE5560000001',
        },
        {
          isDefault: false,
          isVisible: true,
          label: null,
          prefix: 'SE5560000001',
        },
      ]),
    ).rejects.toMatchObject({ code: 'duplicate_prefix' })

    expect(query).not.toHaveBeenCalled()
  })

  it('updateHsaIdPrefixes rejects visible lists without one default', async () => {
    const { db } = createSqlServerDb()

    await expect(
      updateHsaIdPrefixes(db, [
        {
          isDefault: false,
          isVisible: true,
          label: null,
          prefix: 'SE5560000001',
        },
      ]),
    ).rejects.toMatchObject({ code: 'default_required' })
  })

  it('updateHsaIdPrefixes blocks deleting or changing a used prefix', async () => {
    const { db, query } = createSqlServerDb()
    query.mockImplementation(async (sql: string, parameters?: unknown[]) => {
      if (/FROM hsa_id_prefixes/.test(sql)) {
        return [
          {
            id: 1,
            isDefault: 1,
            isVisible: 1,
            label: null,
            prefix: 'SE5560000001',
          },
        ]
      }
      if (parameters?.[0] === 'SE5560000001-%') {
        return [{ hsaId: 'SE5560000001-used1' }]
      }
      return []
    })

    await expect(updateHsaIdPrefixes(db, [])).rejects.toMatchObject({
      code: 'used_prefix_cannot_delete',
    })
    await expect(
      updateHsaIdPrefixes(db, [
        {
          id: 1,
          isDefault: true,
          isVisible: true,
          label: null,
          prefix: 'NO5560000001',
        },
      ]),
    ).rejects.toMatchObject({ code: 'used_prefix_cannot_change' })
  })

  it('HsaIdPrefixSettingsError exposes stable error codes', () => {
    const error = new HsaIdPrefixSettingsError('example', 'Example')
    expect(error).toMatchObject({
      code: 'example',
      message: 'Example',
      name: 'HsaIdPrefixSettingsError',
    })
  })
})
