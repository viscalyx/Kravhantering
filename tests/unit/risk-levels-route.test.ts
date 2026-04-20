import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createRiskLevel: vi.fn(),
  getRequestDatabaseConnection: vi.fn(() => ({})),
}))

vi.mock('@/lib/db', () => ({
  getRequestDatabaseConnection: routeState.getRequestDatabaseConnection,
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
    expect(routeState.getRequestDatabaseConnection).not.toHaveBeenCalled()
    expect(routeState.createRiskLevel).not.toHaveBeenCalled()
  })

  it('returns the created risk level on success', async () => {
    const mockDb = { session: 'db' }
    const payload = {
      color: '#dc2626',
      descriptionEn: 'High risk',
      descriptionSv: 'Hog risk',
      nameEn: 'High',
      nameSv: 'Hog',
      severity: 4,
    }
    const createdRiskLevel = { id: 7, ...payload }

    routeState.getRequestDatabaseConnection.mockResolvedValueOnce(mockDb)
    routeState.createRiskLevel.mockResolvedValueOnce(createdRiskLevel)

    const response = await POST(
      new NextRequest('https://example.test/api/risk-levels', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(createdRiskLevel)
    expect(routeState.getRequestDatabaseConnection).toHaveBeenCalledTimes(1)
    expect(routeState.createRiskLevel).toHaveBeenCalledWith(mockDb, payload)
  })
})
