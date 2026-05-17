import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  countLinkedRequirements: vi.fn(async () => ({ 1: 2 })),
  getRequestSqlServerDataSource: vi.fn(() => ({})),
  listRiskLevels: vi.fn(async () => [
    {
      color: '#22c55e',
      iconName: 'ArrowDownLeft',
      id: 1,
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    },
  ]),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/risk-levels', () => ({
  countLinkedRequirements: routeState.countLinkedRequirements,
  listRiskLevels: routeState.listRiskLevels,
}))

import * as route from '@/app/api/risk-levels/route'

describe('risk-levels route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns fixed risk levels with linked requirement counts', async () => {
    const response = await route.GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      riskLevels: [
        {
          color: '#22c55e',
          iconName: 'ArrowDownLeft',
          id: 1,
          linkedRequirementCount: 2,
          nameEn: 'Low',
          nameSv: 'Låg',
          sortOrder: 1,
        },
      ],
    })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
  })

  it('does not expose POST handler', () => {
    expect((route as { POST?: unknown }).POST).toBeUndefined()
  })
})
