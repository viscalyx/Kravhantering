import { describe, expect, it } from 'vitest'
import { mapReportItemsWithConcurrency } from '@/lib/reports/data/concurrency'

describe('report data concurrency', () => {
  it('maps items in input order with bounded concurrency and handles empties', async () => {
    const active: number[] = []
    let maximumActive = 0
    const values = await mapReportItemsWithConcurrency(
      Array.from({ length: 12 }, (_, index) => index),
      async (item, index) => {
        active.push(index)
        maximumActive = Math.max(maximumActive, active.length)
        await Promise.resolve()
        active.splice(active.indexOf(index), 1)
        return `${index}:${item}`
      },
    )

    expect(values).toEqual(Array.from({ length: 12 }, (_, i) => `${i}:${i}`))
    expect(maximumActive).toBe(8)
    await expect(
      mapReportItemsWithConcurrency([], async item => item),
    ).resolves.toEqual([])
  })
})
