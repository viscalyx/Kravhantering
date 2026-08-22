import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/ai/authoring-profiles/route'
import { attachVerifiedActor } from '@/lib/requirements/auth'

const routeState = vi.hoisted(() => ({
  describe: vi.fn(),
  getAiGenerationAvailability: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))
vi.mock('@/lib/dal/ai-settings', () => ({
  getAiGenerationAvailability: routeState.getAiGenerationAvailability,
}))
vi.mock('@/lib/ai/authoring-runtime', () => ({
  createProductionAiAuthoringRuntime: vi.fn(() => ({
    describe: routeState.describe,
  })),
}))

function request(authenticated = true): NextRequest {
  const value = new NextRequest(
    'https://example.test/api/ai/authoring-profiles',
  )
  if (authenticated) {
    attachVerifiedActor(value, {
      displayName: 'Author',
      hsaId: null,
      id: 'author-1',
      isAuthenticated: true,
      roles: ['User'],
      source: 'oidc',
    })
  }
  return value
}

describe('GET /api/ai/authoring-profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getRequestSqlServerDataSource.mockResolvedValue({})
    routeState.getAiGenerationAvailability.mockResolvedValue({
      effectiveRequirementGenerationEnabled: true,
    })
    routeState.describe.mockImplementation(async type =>
      type === 'generate_with_images'
        ? { available: false, reason: 'missing' }
        : {
            available: true,
            connectionName: 'Approved AI service',
            dataPolicySummary: 'EU only; no training',
          },
    )
  })

  it('returns independent neutral status for each fixed authoring action', async () => {
    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      enabled: true,
      profiles: {
        generate_with_images: { available: false, reason: 'missing' },
        generate_without_images: {
          available: true,
          connectionName: 'Approved AI service',
          dataPolicySummary: 'EU only; no training',
        },
        repair_invalid_import_json: {
          available: true,
          connectionName: 'Approved AI service',
          dataPolicySummary: 'EU only; no training',
        },
      },
    })
    expect(routeState.describe).toHaveBeenCalledTimes(3)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('does not resolve profiles while the global feature gate is disabled', async () => {
    routeState.getAiGenerationAvailability.mockResolvedValue({
      effectiveRequirementGenerationEnabled: false,
    })

    const response = await GET(request())
    const body = await response.json()

    expect(body.enabled).toBe(false)
    expect(routeState.describe).not.toHaveBeenCalled()
  })

  it('requires authentication', async () => {
    const response = await GET(request(false))

    expect(response.status).toBe(401)
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('fails all profile descriptions closed when availability lookup fails', async () => {
    routeState.getAiGenerationAvailability.mockRejectedValue(
      new Error('database unavailable'),
    )

    const response = await GET(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      enabled: true,
      profiles: {
        generate_with_images: { available: false, reason: 'blocked' },
        generate_without_images: { available: false, reason: 'blocked' },
        repair_invalid_import_json: { available: false, reason: 'blocked' },
      },
    })
    expect(routeState.describe).not.toHaveBeenCalled()
  })
})
