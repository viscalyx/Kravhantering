import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  countLinkedRequirements: vi.fn(async () => ({ 2: 2 })),
  getRequestSqlServerDataSource: vi.fn(() => ({})),
  listPriorityLevels: vi.fn(async () => [
    {
      assessmentCriteriaEn: 'Low assessment',
      assessmentCriteriaSv: 'Låg bedömning',
      code: 'P2',
      color: '#22c55e',
      descriptionEn: 'Low priority',
      descriptionSv: 'Låg prioritet',
      iconName: 'ArrowDownLeft',
      id: 2,
      nameEn: 'Low',
      nameSv: 'Låg',
      sortOrder: 1,
    },
  ]),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/priority-levels', () => ({
  countLinkedRequirements: routeState.countLinkedRequirements,
  listPriorityLevels: routeState.listPriorityLevels,
}))

import * as route from '@/app/api/priority-levels/route'

describe('priority-levels route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GET returns fixed priority levels with linked requirement counts', async () => {
    const response = await route.GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      priorityLevels: [
        {
          assessmentCriteriaEn: 'Low assessment',
          assessmentCriteriaSv: 'Låg bedömning',
          code: 'P2',
          color: '#22c55e',
          descriptionEn: 'Low priority',
          descriptionSv: 'Låg prioritet',
          iconName: 'ArrowDownLeft',
          id: 2,
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
