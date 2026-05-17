import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockContext = {
  actor: {
    displayName: 'Route Tester',
    hsaId: 'SE5560000001-route',
    id: 'route-test',
    isAuthenticated: true,
    roles: ['RequirementsEditor'],
    source: 'oidc',
  },
  correlationId: 'correlation-1',
  requestId: 'request-1',
  source: 'rest',
}

const mocks = vi.hoisted(() => ({
  createRequestContext: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  graduateSpecificationLocalRequirement: vi.fn(),
  listGraduationTargetAreas: vi.fn(),
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createRequestContext: mocks.createRequestContext,
  }
})

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: mocks.createRequirementsRestRuntime,
}))

import { POST } from '@/app/api/specifications/[id]/local-requirements/[localRequirementId]/graduate/route'
import { GET } from '@/app/api/specifications/[id]/local-requirements/[localRequirementId]/graduation-target-areas/route'
import { forbiddenError } from '@/lib/requirements/errors'

function makeParams(id: string, localRequirementId: string) {
  return { params: Promise.resolve({ id, localRequirementId }) }
}

function makePostRequest(body: unknown) {
  return new NextRequest(
    'http://localhost/api/specifications/spec/local-requirements/41/graduate',
    {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
      },
      method: 'POST',
    },
  )
}

describe('specification-local requirement graduation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createRequestContext.mockResolvedValue(mockContext)
    mocks.createRequirementsRestRuntime.mockResolvedValue({
      context: mockContext,
      service: {
        graduateSpecificationLocalRequirement:
          mocks.graduateSpecificationLocalRequirement,
        listGraduationTargetAreas: mocks.listGraduationTargetAreas,
      },
    })
    mocks.listGraduationTargetAreas.mockResolvedValue({
      areas: [{ id: 2, name: 'Security', prefix: 'SEC' }],
      message: 'Target areas',
    })
    mocks.graduateSpecificationLocalRequirement.mockResolvedValue({
      detail: { id: 71, uniqueId: 'SEC0001' },
      message: 'Graduated',
      requirementResourceUri: 'requirements://requirement/SEC0001?version=1',
      requirementViewUri:
        'ui://requirements/requirement-detail/SEC0001?version=1',
      result: {
        version: {
          versionNumber: 1,
        },
      },
    })
  })

  it('lists graduation target areas through the shared service', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/41/graduation-target-areas',
      ),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      areas: [{ id: 2, name: 'Security', prefix: 'SEC' }],
      ok: true,
    })
    expect(mocks.listGraduationTargetAreas).toHaveBeenCalledWith(mockContext, {
      localRequirementId: 41,
      responseFormat: 'json',
      specificationSlug: 'spec',
    })
  })

  it('creates a draft library requirement through the shared service', async () => {
    const response = await POST(
      makePostRequest({ requirementAreaId: 2 }),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      detail: { id: 71, uniqueId: 'SEC0001' },
      newRequirementId: 71,
      newRequirementUniqueId: 'SEC0001',
      newRequirementVersionNumber: 1,
      ok: true,
      requirementResourceUri: 'requirements://requirement/SEC0001?version=1',
      requirementViewUri:
        'ui://requirements/requirement-detail/SEC0001?version=1',
    })
    expect(mocks.graduateSpecificationLocalRequirement).toHaveBeenCalledWith(
      mockContext,
      {
        localRequirementId: 41,
        requirementAreaId: 2,
        responseFormat: 'json',
        specificationSlug: 'spec',
      },
    )
  })

  it('rejects graduation before runtime when the actor lacks a verified HSA-ID', async () => {
    mocks.createRequestContext.mockResolvedValueOnce({
      ...mockContext,
      actor: {
        ...mockContext.actor,
        hsaId: null,
      },
    })

    const response = await POST(
      makePostRequest({ requirementAreaId: 2 }),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      code: 'validation',
    })
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(mocks.graduateSpecificationLocalRequirement).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid graduation bodies', async () => {
    const response = await POST(
      makePostRequest({ requirementAreaId: 0 }),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: 'Invalid request',
    })
    expect(mocks.graduateSpecificationLocalRequirement).not.toHaveBeenCalled()
  })

  it('maps shared service authorization errors for graduation', async () => {
    mocks.graduateSpecificationLocalRequirement.mockRejectedValueOnce(
      forbiddenError('Missing target area owner or co-author permission'),
    )

    const response = await POST(
      makePostRequest({ requirementAreaId: 2 }),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      code: 'forbidden',
      error: 'Missing target area owner or co-author permission',
    })
  })
})
