import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createRiskLevel: vi.fn(),
  getRequestDatabase: vi.fn(() => ({})),
}))

vi.mock('@/lib/db', () => ({
  getRequestDatabase: routeState.getRequestDatabase,
}))

vi.mock('@/lib/dal/risk-levels', () => ({
  countLinkedRequirements: vi.fn(async () => ({})),
  createRiskLevel: routeState.createRiskLevel,
  listRiskLevels: vi.fn(async () => []),
}))

import { POST } from '@/app/api/risk-levels/route'

describe('risk-levels route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 for invalid JSON before opening the DB', async () => {
    const response = await POST(
      new NextRequest('https://example.test/api/risk-levels', {
        body: '{',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid JSON body',
    })
    expect(routeState.getRequestDatabase).not.toHaveBeenCalled()
    expect(routeState.createRiskLevel).not.toHaveBeenCalled()
  })
})
