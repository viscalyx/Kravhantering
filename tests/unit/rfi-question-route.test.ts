import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  authorize: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  getRfiQuestion: vi.fn(),
  setRfiQuestionArchived: vi.fn(),
  updateRfiQuestion: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))

vi.mock('@/lib/requirements/service-shared', () => ({
  authorize: routeState.authorize,
}))

vi.mock('@/lib/dal/rfi-questions', () => ({
  getRfiQuestion: routeState.getRfiQuestion,
  setRfiQuestionArchived: routeState.setRfiQuestionArchived,
  updateRfiQuestion: routeState.updateRfiQuestion,
}))

import { GET } from '@/app/api/rfi-questions/[id]/route'

const context = {
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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('rfi-questions/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequirementsRestRuntime.mockResolvedValue({
      authorization: { assertAuthorized: vi.fn() },
      context,
      db: { db: true },
    })
    routeState.authorize.mockResolvedValue(undefined)
    routeState.getRfiQuestion.mockResolvedValue({
      areaId: 7,
      id: 12,
      questionCode: 'INF-RFI001',
    })
  })

  it('authorizes access to the resolved RFI question area before returning the question', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/rfi-questions/12'),
      makeParams('12'),
    )

    await expect(response.json()).resolves.toEqual({
      question: {
        areaId: 7,
        id: 12,
        questionCode: 'INF-RFI001',
      },
    })
    expect(routeState.getRfiQuestion).toHaveBeenCalledWith({ db: true }, 12)
    expect(routeState.authorize).toHaveBeenCalledWith(
      expect.anything(),
      {
        areaId: 7,
        kind: 'manage_rfi_question',
        operation: 'read',
      },
      context,
    )
  })

  it('does not return the question when authorization is denied', async () => {
    routeState.authorize.mockRejectedValueOnce(forbiddenError('denied'))

    const response = await GET(
      new NextRequest('http://localhost/api/rfi-questions/12'),
      makeParams('12'),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      code: 'forbidden',
      error: 'Forbidden',
    })
  })
})
