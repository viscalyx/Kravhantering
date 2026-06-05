import { afterEach, describe, expect, it, vi } from 'vitest'
import { REPORT_ITEM_LOAD_CONCURRENCY } from '@/lib/reports/data/concurrency'
import {
  fetchMultipleRequirements,
  type RequirementReportData,
} from '@/lib/reports/data/fetch-requirement'

function requirement(id: number): RequirementReportData {
  return {
    area: null,
    createdAt: '2026-06-01T00:00:00.000Z',
    id,
    isArchived: false,
    uniqueId: `REQ-${id}`,
    versions: [],
  }
}

describe('fetchMultipleRequirements', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches 200 requirements in input order without applying a report count limit', async () => {
    const ids = Array.from({ length: 200 }, (_, index) => index + 1)
    let activeFetches = 0
    let maxActiveFetches = 0
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      activeFetches += 1
      maxActiveFetches = Math.max(maxActiveFetches, activeFetches)
      await new Promise(resolve => setTimeout(resolve, 0))
      activeFetches -= 1

      const id = Number(String(input).match(/\/requirements\/(\d+)\?/)?.[1])
      return {
        json: async () => requirement(id),
        ok: true,
        status: 200,
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const rows = await fetchMultipleRequirements(ids, 'sv')

    expect(rows.map(row => row.id)).toEqual(ids)
    expect(fetchMock).toHaveBeenCalledTimes(200)
    expect(maxActiveFetches).toBeLessThanOrEqual(REPORT_ITEM_LOAD_CONCURRENCY)
  })
})
