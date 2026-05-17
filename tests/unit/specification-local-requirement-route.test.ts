import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}
const authState = vi.hoisted(() => ({
  assertAuthorized: vi.fn(),
  createRequestContext: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
}))
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

const mocks = {
  deleteSpecificationLocalRequirement: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
  updateSpecificationLocalRequirement: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: authState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/audit/action-audit', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/audit/action-audit')>()
  return {
    ...actual,
    recordDeniedActionAuditEvent: authState.recordDeniedActionAuditEvent,
  }
})

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService: () => ({
      assertAuthorized: authState.assertAuthorized,
    }),
    createRequestContext: authState.createRequestContext,
  }
})

vi.mock('@/lib/dal/requirements-specifications', () => ({
  deleteSpecificationLocalRequirement: (...args: unknown[]) =>
    mocks.deleteSpecificationLocalRequirement(...args),
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
  getSpecificationBySlug: (...args: unknown[]) =>
    mocks.getSpecificationBySlug(...args),
  getSpecificationLocalRequirementDetail: vi.fn(),
  updateSpecificationLocalRequirement: (...args: unknown[]) =>
    mocks.updateSpecificationLocalRequirement(...args),
}))

import {
  DELETE,
  PUT,
} from '@/app/api/specifications/[id]/local-requirements/[localRequirementId]/route'
import {
  forbiddenError,
  RequirementsServiceError,
} from '@/lib/requirements/errors'

function makeParams(id: string, localRequirementId: string) {
  return { params: Promise.resolve({ id, localRequirementId }) }
}

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

describe('specifications/[id]/local-requirements/[localRequirementId] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.assertAuthorized.mockResolvedValue(undefined)
    authState.createRequestContext.mockResolvedValue(mockContext)
    authState.getRequestSqlServerDataSource.mockResolvedValue(mockDb)
    mocks.getSpecificationBySlug.mockResolvedValue({ id: 5 })
  })

  it('returns a JSON 500 when deleting a specification-local requirement fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.deleteSpecificationLocalRequirement.mockRejectedValue(
      new Error('delete failed'),
    )

    try {
      const response = await DELETE(
        new NextRequest(
          'http://localhost/api/specifications/spec/local-requirements/41',
        ),
        makeParams('spec', '41'),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to delete specification-local requirement',
      })
      expect(mocks.deleteSpecificationLocalRequirement).toHaveBeenCalledWith(
        mockDb,
        5,
        41,
      )
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to delete specification-local requirement',
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'delete failed',
          }),
        }),
      )
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('maps requirements service errors when deleting a specification-local requirement fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.deleteSpecificationLocalRequirement.mockRejectedValue(
      new RequirementsServiceError('conflict', 'Requirement is still linked'),
    )

    try {
      const response = await DELETE(
        new NextRequest(
          'http://localhost/api/specifications/spec/local-requirements/41',
        ),
        makeParams('spec', '41'),
      )

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        code: 'conflict',
        error: 'Requirement is still linked',
      })
      expect(mocks.deleteSpecificationLocalRequirement).toHaveBeenCalledWith(
        mockDb,
        5,
        41,
      )
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('maps validation errors when updating a specification-local requirement fails', async () => {
    mocks.updateSpecificationLocalRequirement.mockRejectedValue(
      new RequirementsServiceError(
        'validation',
        'requirementPackageIds references unknown requirement package id 13',
      ),
    )

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/41',
        {
          body: JSON.stringify({
            description: 'Updated local requirement',
            requirementPackageIds: [13],
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT',
        },
      ),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'validation',
      error:
        'requirementPackageIds references unknown requirement package id 13',
    })
    expect(mocks.updateSpecificationLocalRequirement).toHaveBeenCalledWith(
      mockDb,
      5,
      41,
      expect.objectContaining({
        description: 'Updated local requirement',
        requirementPackageIds: [13],
      }),
    )
  })

  it('returns 400 when localRequirementId is not a positive integer', async () => {
    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/abc',
      ),
      makeParams('spec', 'abc'),
    )

    expect(response.status).toBe(400)
    await expectInvalidRequest(response, 'localRequirementId')
    expect(mocks.deleteSpecificationLocalRequirement).not.toHaveBeenCalled()
  })

  it('returns 404 when the specification slug does not resolve', async () => {
    mocks.getSpecificationBySlug.mockResolvedValueOnce(null)

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/missing/local-requirements/41',
      ),
      makeParams('missing', '41'),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(mocks.deleteSpecificationLocalRequirement).not.toHaveBeenCalled()
  })

  it('returns 404 when the requirement was not deleted', async () => {
    mocks.deleteSpecificationLocalRequirement.mockResolvedValueOnce(false)

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/41',
      ),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(mocks.deleteSpecificationLocalRequirement).toHaveBeenCalledWith(
      mockDb,
      5,
      41,
    )
  })

  it('returns 403 and records an audit denial when specification-local requirement deletion is not authorized', async () => {
    authState.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Missing specification-local requirement permission'),
    )

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/41',
      ),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      code: 'forbidden',
      error: 'Missing specification-local requirement permission',
    })
    expect(authState.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_specification_local_requirement',
        localRequirementId: 41,
        operation: 'delete',
        specificationId: undefined,
        specificationSlug: 'spec',
      },
      expect.objectContaining({ requestId: 'request-1' }),
    )
    expect(authState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(authState.recordDeniedActionAuditEvent).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ requestId: 'request-1' }),
      expect.objectContaining({
        action: 'requirements.authorization.denied',
        targetKind: 'requirements',
      }),
    )
    expect(mocks.deleteSpecificationLocalRequirement).not.toHaveBeenCalled()
  })

  it('returns 200 when the requirement was deleted', async () => {
    mocks.deleteSpecificationLocalRequirement.mockResolvedValueOnce(true)

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/specifications/spec/local-requirements/41',
      ),
      makeParams('spec', '41'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(authState.assertAuthorized).toHaveBeenCalledWith(
      {
        kind: 'manage_specification_local_requirement',
        localRequirementId: 41,
        operation: 'delete',
        specificationId: undefined,
        specificationSlug: 'spec',
      },
      expect.objectContaining({ requestId: 'request-1' }),
    )
    expect(mocks.deleteSpecificationLocalRequirement).toHaveBeenCalledWith(
      mockDb,
      5,
      41,
    )
  })
})
