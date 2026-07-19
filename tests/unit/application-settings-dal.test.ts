import { describe, expect, it, vi } from 'vitest'
import {
  getAdminApplicationSettings,
  getApplicationSettings,
  updateApplicationSetting,
} from '@/lib/dal/application-settings'

function persistedRow() {
  return {
    createdAt: '2026-07-18T10:00:00.000Z',
    csvExportConcurrencyPerNode: '5',
    csvExportMaxFileBytes: '104857600',
    csvExportMaxRequirements: '1000',
    csvExportTimeoutSeconds: '120',
    id: 1,
    pdfReportConcurrencyPerNode: '3',
    pdfReportMaxFileBytes: '52428800',
    pdfReportMaxRequirements: '1000',
    pdfReportTimeoutSeconds: '180',
    pdfWorkerMemoryMib: '512',
    updatedAt: '2026-07-18T11:00:00.000Z',
  }
}

function queryExecutor(rows: unknown[]) {
  const query = vi.fn(
    async (_sql: string, _parameters?: unknown[]): Promise<unknown[]> => rows,
  )
  return {
    executor: {
      query: <T = unknown[]>(sql: string, parameters?: unknown[]): Promise<T> =>
        query(sql, parameters) as Promise<T>,
    },
    query,
  }
}

describe('application settings DAL', () => {
  it('returns one validated immutable runtime snapshot', async () => {
    const { executor, query } = queryExecutor([persistedRow()])
    const settings = await getApplicationSettings(executor)

    expect(settings.csvExportMaxRequirements).toBe(1000)
    expect(settings.pdfReportMaxFileBytes).toBe(50 * 1024 * 1024)
    expect(Object.isFrozen(settings)).toBe(true)
    expect(query.mock.calls[0]?.[0]).not.toContain('UPDLOCK')
  })

  it('returns constraints and timestamp to Admin Center', async () => {
    const { executor } = queryExecutor([persistedRow()])
    const settings = await getAdminApplicationSettings(executor)

    expect(settings.updatedAt).toBe('2026-07-18T11:00:00.000Z')
    expect(settings.constraints.pdfWorkerMemoryMib).toEqual({
      max: 4096,
      min: 128,
    })
  })

  it('updates and audits one closed-map column in the same transaction', async () => {
    const manager = {
      query: vi
        .fn(
          async (
            _sql: string,
            _parameters?: unknown[],
          ): Promise<unknown[]> => [],
        )
        .mockResolvedValueOnce([persistedRow()])
        .mockResolvedValueOnce([]),
    }
    const db = {
      transaction: vi.fn(async callback => callback(manager)),
    }
    const audit = vi.fn(async () => {})

    const result = await updateApplicationSetting(
      db as never,
      'csvExportConcurrencyPerNode',
      8,
      { audit },
    )

    expect(manager.query.mock.calls[0]?.[0]).toContain('UPDLOCK, HOLDLOCK')
    expect(manager.query.mock.calls[1]?.[0]).toContain(
      '[csv_export_concurrency_per_node] = @0',
    )
    expect(manager.query.mock.calls[1]?.[1]).toEqual([8, expect.any(String)])
    expect(audit).toHaveBeenCalledWith(manager, {
      field: 'csvExportConcurrencyPerNode',
      newValue: 8,
      oldValue: 5,
    })
    expect(result).toMatchObject({
      field: 'csvExportConcurrencyPerNode',
      value: 8,
    })
  })

  it('fails closed for missing or invalid persisted singleton state', async () => {
    await expect(
      getApplicationSettings(queryExecutor([]).executor),
    ).rejects.toThrow('singleton row is missing')
    await expect(
      getApplicationSettings(
        queryExecutor([{ ...persistedRow(), pdfWorkerMemoryMib: 64 }]).executor,
      ),
    ).rejects.toThrow('Invalid persisted application setting')
  })

  it('rejects invalid updates before opening a transaction', async () => {
    const db = { transaction: vi.fn() }
    await expect(
      updateApplicationSetting(
        db as never,
        'pdfReportMaxFileBytes',
        1024 * 1024 + 1,
      ),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(db.transaction).not.toHaveBeenCalled()
  })
})
