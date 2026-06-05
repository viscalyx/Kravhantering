import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RequirementReportData } from '@/lib/reports/data/fetch-requirement'
import { fetchSpecificationItemsForReport } from '@/lib/reports/data/fetch-specification-items'

describe('fetchSpecificationItemsForReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests specification report items with refs only', async () => {
    const rows: RequirementReportData[] = []
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => rows,
      ok: true,
      status: 200,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSpecificationItemsForReport('DRIFT-FORV-BAS', ['lib:38']),
    ).resolves.toBe(rows)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/specifications/DRIFT-FORV-BAS/report-items?refs=lib%3A38',
    )
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('locale=')
  })

  it('requests more than 50 specification report items without a client-side report count limit', async () => {
    const rows: RequirementReportData[] = []
    const itemRefs = Array.from(
      { length: 60 },
      (_, index) => `lib:${index + 1}`,
    )
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => rows,
      ok: true,
      status: 200,
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSpecificationItemsForReport('DRIFT-FORV-BAS', itemRefs),
    ).resolves.toBe(rows)

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/specifications/DRIFT-FORV-BAS/report-items?refs=${itemRefs
        .map(ref => encodeURIComponent(ref))
        .join(',')}`,
    )
  })
})
