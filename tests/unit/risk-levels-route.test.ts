import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createRiskLevel: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(() => ({})),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/risk-levels', () => ({
  countLinkedRequirements: vi.fn(async () => ({})),
  createRiskLevel: routeState.createRiskLevel,
  listRiskLevels: vi.fn(async () => []),
}))

import { POST } from '@/app/api/risk-levels/route'

async function expectInvalidRequest(
  response: Response,
  path?: string,
): Promise<void> {
  const body = (await response.json()) as {
    error: string
    issues: Array<{ path: string }>
  }
  expect(body.error).toBe('Invalid request')
  expect(body.issues.length).toBeGreaterThan(0)
  if (path) {
    expect(body.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path })]),
    )
  }
}

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
    await expectInvalidRequest(response, '$')
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.createRiskLevel).not.toHaveBeenCalled()
  })

  it('returns the created risk level on success', async () => {
    const mockDb = { session: 'db' }
    const payload = {
      color: '#dc2626',
      nameEn: 'High',
      nameSv: 'Hog',
      sortOrder: 4,
    }
    const createdRiskLevel = { id: 7, ...payload }

    routeState.getRequestSqlServerDataSource.mockResolvedValueOnce(mockDb)
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
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.createRiskLevel).toHaveBeenCalledWith(mockDb, payload)
  })
})
