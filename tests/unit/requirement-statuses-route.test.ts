import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockListStatuses = vi.fn()
const mockListTransitions = vi.fn()

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => ({}),
}))

vi.mock('@/lib/dal/requirement-statuses', () => ({
  listStatuses: (...args: unknown[]) => mockListStatuses(...args),
  listTransitions: (...args: unknown[]) => mockListTransitions(...args),
}))

import * as route from '@/app/api/requirement-statuses/route'

describe('requirement-statuses route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns statuses and transitions', async () => {
    mockListStatuses.mockResolvedValue([{ id: 1 }])
    mockListTransitions.mockResolvedValue([])
    const res = await route.GET()
    const json = (await res.json()) as {
      statuses: { id: number }[]
      transitions: unknown[]
    }
    expect(json.statuses).toHaveLength(1)
    expect(json.transitions).toEqual([])
  })

  it('does not expose POST handler', () => {
    expect((route as { POST?: unknown }).POST).toBeUndefined()
  })
})
