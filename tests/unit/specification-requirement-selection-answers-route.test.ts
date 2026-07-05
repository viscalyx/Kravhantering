import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}
const mockAuthorization = { assertAuthorized: vi.fn() }
const mockContext = {
  actor: {
    displayName: 'Route Tester',
    hsaId: 'SE5560000001-route',
    id: 'route-test',
    isAuthenticated: true,
    roles: ['RequirementsEditor'],
    source: 'oidc',
  },
  correlationId: 'correlation-selection-answers',
  requestId: 'request-selection-answers',
  source: 'rest',
}

const mocks = vi.hoisted(() => ({
  createRequirementsRestRuntime: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  getSpecificationById: vi.fn(),
  listSpecificationRequirementSelectionQuestions: vi.fn(),
  logSanitizedError: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: (...args: unknown[]) =>
    mocks.getSpecificationById(...args),
}))

vi.mock('@/lib/dal/requirement-selection-questions', () => ({
  listSpecificationRequirementSelectionQuestions: (...args: unknown[]) =>
    mocks.listSpecificationRequirementSelectionQuestions(...args),
}))

vi.mock('@/lib/http/safe-errors', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/http/safe-errors')>()
  return {
    ...actual,
    logSanitizedError: (...args: unknown[]) => mocks.logSanitizedError(...args),
  }
})

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: (...args: unknown[]) =>
    mocks.createRequirementsRestRuntime(...args),
}))

import { GET } from '@/app/api/requirements-specifications/[id]/requirement-selection-answers/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirements-specifications/[id]/requirement-selection-answers route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getRequestSqlServerDataSource.mockResolvedValue(mockDb)
    mocks.getSpecificationById.mockResolvedValue({ id: 7 })
    mocks.listSpecificationRequirementSelectionQuestions.mockResolvedValue([
      { id: 11, questionText: 'Choose controls' },
    ])
    mocks.createRequirementsRestRuntime.mockResolvedValue({
      authorization: mockAuthorization,
      context: mockContext,
    })
    mockAuthorization.assertAuthorized.mockResolvedValue(undefined)
  })

  it('authorizes before listing requirement selection answers', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirements-specifications/7/requirement-selection-answers',
    )

    const response = await GET(request, makeParams('7'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      questions: [{ id: 11, questionText: 'Choose controls' }],
    })
    expect(mocks.createRequirementsRestRuntime).toHaveBeenCalledWith(request, {
      db: mockDb,
    })
    expect(mockAuthorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'get_specification_items', specificationId: 7 },
      mockContext,
    )
    expect(
      mocks.listSpecificationRequirementSelectionQuestions,
    ).toHaveBeenCalledWith(mockDb, 7)
  })

  it('keeps the existing not-found response for missing specifications', async () => {
    mocks.getSpecificationById.mockResolvedValueOnce(null)

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/7/requirement-selection-answers',
      ),
      makeParams('7'),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(
      mocks.listSpecificationRequirementSelectionQuestions,
    ).not.toHaveBeenCalled()
  })

  it('returns the authorization response when access is denied', async () => {
    mockAuthorization.assertAuthorized.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/7/requirement-selection-answers',
      ),
      makeParams('7'),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      code: 'forbidden',
      error: 'Forbidden',
    })
    expect(
      mocks.listSpecificationRequirementSelectionQuestions,
    ).not.toHaveBeenCalled()
  })

  it('logs unexpected failures and returns a safe error payload', async () => {
    const error = new Error(
      "Invalid object name 'specification_requirement_selection_questions'.",
    )
    mocks.listSpecificationRequirementSelectionQuestions.mockRejectedValueOnce(
      error,
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/7/requirement-selection-answers',
      ),
      makeParams('7'),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      code: 'internal',
      error: 'An internal error occurred',
    })
    expect(mocks.logSanitizedError).toHaveBeenCalledWith(
      '[API] Failed to list requirement selection answers for specification',
      error,
      { specificationId: 7 },
    )
  })
})
