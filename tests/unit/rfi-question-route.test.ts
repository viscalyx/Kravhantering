import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forbiddenError } from '@/lib/requirements/errors'

const routeState = vi.hoisted(() => ({
  assertAuthorized: vi.fn(),
  authorize: vi.fn(),
  createDefaultAuthorizationService: vi.fn(),
  createRequestContext: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  createRfiQuestion: vi.fn(),
  db: { query: vi.fn() },
  getRfiQuestion: vi.fn(),
  getRequestSqlServerDataSource: vi.fn(),
  listRfiQuestions: vi.fn(),
  recordAllowedActionAuditEvent: vi.fn(),
  recordDeniedActionAuditEvent: vi.fn(),
  setRfiQuestionArchived: vi.fn(),
  updateRfiQuestion: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))

vi.mock('@/lib/requirements/service-shared', () => ({
  authorize: routeState.authorize,
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/audit/action-audit', () => ({
  recordAllowedActionAuditEvent: routeState.recordAllowedActionAuditEvent,
  recordDeniedActionAuditEvent: routeState.recordDeniedActionAuditEvent,
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService:
      routeState.createDefaultAuthorizationService,
    createRequestContext: routeState.createRequestContext,
  }
})

vi.mock('@/lib/dal/rfi-questions', () => ({
  createRfiQuestion: routeState.createRfiQuestion,
  getRfiQuestion: routeState.getRfiQuestion,
  listRfiQuestions: routeState.listRfiQuestions,
  setRfiQuestionArchived: routeState.setRfiQuestionArchived,
  updateRfiQuestion: routeState.updateRfiQuestion,
}))

import { POST as reactivateRfiQuestionPost } from '@/app/api/rfi-questions/[id]/reactivate/route'
import { DELETE, GET, PUT } from '@/app/api/rfi-questions/[id]/route'
import {
  POST as createRfiQuestionPost,
  GET as listRfiQuestionsGet,
} from '@/app/api/rfi-questions/route'

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

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    method,
  })
}

describe('RFI question routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.assertAuthorized.mockResolvedValue(undefined)
    routeState.createDefaultAuthorizationService.mockReturnValue({
      assertAuthorized: routeState.assertAuthorized,
    })
    routeState.createRequestContext.mockResolvedValue(context)
    routeState.getRequestSqlServerDataSource.mockResolvedValue(routeState.db)
    routeState.recordAllowedActionAuditEvent.mockResolvedValue(undefined)
    routeState.recordDeniedActionAuditEvent.mockResolvedValue(undefined)
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
    routeState.createRfiQuestion.mockResolvedValue({
      areaId: 7,
      id: 12,
      questionCode: 'INF-RFI001',
      questionText: 'How do you handle logs?',
    })
    routeState.listRfiQuestions.mockResolvedValue([])
    routeState.setRfiQuestionArchived.mockResolvedValue({
      areaId: 7,
      id: 12,
      questionCode: 'INF-RFI001',
    })
    routeState.updateRfiQuestion.mockResolvedValue({
      areaId: 7,
      id: 12,
      questionCode: 'INF-RFI001',
      questionText: 'How are logs retained?',
    })
  })

  it.each([
    {
      expectedAction: {
        areaId: 7,
        kind: 'manage_rfi_question',
        operation: 'create',
      },
      handler: () =>
        createRfiQuestionPost(
          jsonRequest('http://localhost/api/rfi-questions', 'POST', {
            areaId: 7,
            questionText: 'How do you handle logs?',
          }),
        ),
      mutation: routeState.createRfiQuestion,
      name: 'create',
    },
    {
      expectedAction: {
        kind: 'manage_rfi_question',
        operation: 'edit',
        questionId: 12,
      },
      handler: () =>
        PUT(
          jsonRequest('http://localhost/api/rfi-questions/12', 'PUT', {
            questionText: 'How are logs retained?',
          }),
          makeParams('12'),
        ),
      mutation: routeState.updateRfiQuestion,
      name: 'edit',
    },
    {
      expectedAction: {
        kind: 'manage_rfi_question',
        operation: 'archive',
        questionId: 12,
      },
      handler: () =>
        DELETE(
          jsonRequest('http://localhost/api/rfi-questions/12', 'DELETE'),
          makeParams('12'),
        ),
      mutation: routeState.setRfiQuestionArchived,
      name: 'archive',
    },
    {
      expectedAction: {
        kind: 'manage_rfi_question',
        operation: 'reactivate',
        questionId: 12,
      },
      handler: () =>
        reactivateRfiQuestionPost(
          jsonRequest(
            'http://localhost/api/rfi-questions/12/reactivate',
            'POST',
          ),
          makeParams('12'),
        ),
      mutation: routeState.setRfiQuestionArchived,
      name: 'reactivate',
    },
  ])(
    'returns 403 for direct $name mutations without requirement-area authorship',
    async ({ expectedAction, handler, mutation }) => {
      routeState.assertAuthorized.mockRejectedValueOnce(
        forbiddenError('denied', {
          reason: 'requirement_area_author_required',
          requirementAreaId: 7,
        }),
      )

      const response = await handler()

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({
        code: 'forbidden',
        error: 'Forbidden',
      })
      expect(routeState.assertAuthorized).toHaveBeenCalledWith(
        expectedAction,
        context,
      )
      expect(mutation).not.toHaveBeenCalled()
    },
  )

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

  it('lists RFI questions using the validated filters', async () => {
    const questions = [{ areaId: 7, id: 12, questionCode: 'INF-RFI001' }]
    routeState.listRfiQuestions.mockResolvedValueOnce(questions)

    const response = await listRfiQuestionsGet(
      new Request(
        'http://localhost/api/rfi-questions?areaId=7&includeArchived=true',
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ questions })
    expect(routeState.listRfiQuestions).toHaveBeenCalledWith(routeState.db, {
      areaId: 7,
      includeArchived: true,
    })
  })

  it('rejects invalid RFI question filters before querying persistence', async () => {
    const response = await listRfiQuestionsGet(
      new Request('http://localhost/api/rfi-questions?areaId=0'),
    )

    expect(response.status).toBe(400)
    expect(routeState.listRfiQuestions).not.toHaveBeenCalled()
  })

  it('returns 404 when the requested RFI question does not exist', async () => {
    routeState.getRfiQuestion.mockResolvedValueOnce(undefined)

    const response = await GET(
      new NextRequest('http://localhost/api/rfi-questions/999'),
      makeParams('999'),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
    expect(routeState.authorize).not.toHaveBeenCalled()
  })

  it('rejects an invalid RFI question identifier before creating a runtime', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/rfi-questions/0'),
      makeParams('0'),
    )

    expect(response.status).toBe(400)
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('creates and audits an RFI question after area authorization', async () => {
    const response = await createRfiQuestionPost(
      jsonRequest('http://localhost/api/rfi-questions', 'POST', {
        areaId: 7,
        questionText: 'How do you handle logs?',
      }),
    )

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      id: 12,
      questionCode: 'INF-RFI001',
    })
    expect(routeState.createRfiQuestion).toHaveBeenCalledWith(
      routeState.db,
      { areaId: 7, questionText: 'How do you handle logs?' },
      {
        displayName: 'Route Tester',
        hsaId: 'SE5560000001-route',
      },
    )
    expect(routeState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      routeState.db,
      context,
      expect.objectContaining({
        action: 'rfi_question.create',
        targetId: 12,
        targetUniqueId: 'INF-RFI001',
      }),
    )
  })

  it('updates and audits an existing RFI question', async () => {
    const response = await PUT(
      jsonRequest('http://localhost/api/rfi-questions/12', 'PUT', {
        questionText: 'How are logs retained?',
        sortOrder: 4,
      }),
      makeParams('12'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: 12 })
    expect(routeState.updateRfiQuestion).toHaveBeenCalledWith(
      routeState.db,
      12,
      { questionText: 'How are logs retained?', sortOrder: 4 },
      {
        displayName: 'Route Tester',
        hsaId: 'SE5560000001-route',
      },
    )
    expect(routeState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      routeState.db,
      context,
      expect.objectContaining({
        action: 'rfi_question.update',
        details: { changedFields: ['questionText', 'sortOrder'] },
      }),
    )
  })

  it('returns 404 when an RFI question update loses its target', async () => {
    routeState.updateRfiQuestion.mockResolvedValueOnce(undefined)

    const response = await PUT(
      jsonRequest('http://localhost/api/rfi-questions/999', 'PUT', {
        questionText: 'Missing question',
      }),
      makeParams('999'),
    )

    expect(response.status).toBe(404)
    expect(routeState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })

  it('archives and audits an existing RFI question', async () => {
    const response = await DELETE(
      jsonRequest('http://localhost/api/rfi-questions/12', 'DELETE'),
      makeParams('12'),
    )

    expect(response.status).toBe(200)
    expect(routeState.setRfiQuestionArchived).toHaveBeenCalledWith(
      routeState.db,
      12,
      true,
    )
    expect(routeState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      routeState.db,
      context,
      expect.objectContaining({ action: 'rfi_question.archive' }),
    )
  })

  it('returns 404 when an RFI question archive loses its target', async () => {
    routeState.setRfiQuestionArchived.mockResolvedValueOnce(undefined)

    const response = await DELETE(
      jsonRequest('http://localhost/api/rfi-questions/999', 'DELETE'),
      makeParams('999'),
    )

    expect(response.status).toBe(404)
    expect(routeState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })

  it('reactivates and audits an archived RFI question', async () => {
    const response = await reactivateRfiQuestionPost(
      jsonRequest('http://localhost/api/rfi-questions/12/reactivate', 'POST'),
      makeParams('12'),
    )

    expect(response.status).toBe(200)
    expect(routeState.setRfiQuestionArchived).toHaveBeenCalledWith(
      routeState.db,
      12,
      false,
    )
    expect(routeState.recordAllowedActionAuditEvent).toHaveBeenCalledWith(
      routeState.db,
      context,
      expect.objectContaining({ action: 'rfi_question.reactivate' }),
    )
  })

  it('returns 404 when an RFI question reactivation loses its target', async () => {
    routeState.setRfiQuestionArchived.mockResolvedValueOnce(undefined)

    const response = await reactivateRfiQuestionPost(
      jsonRequest('http://localhost/api/rfi-questions/999/reactivate', 'POST'),
      makeParams('999'),
    )

    expect(response.status).toBe(404)
    expect(routeState.recordAllowedActionAuditEvent).not.toHaveBeenCalled()
  })
})
