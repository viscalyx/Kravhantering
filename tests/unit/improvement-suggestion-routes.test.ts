import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  conflictError,
  forbiddenError,
  notFoundError,
  validationError,
} from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => {
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
  const service = {
    listSuggestions: vi.fn(),
    manageSuggestion: vi.fn(),
  }

  return {
    authorization: { assertAuthorized: vi.fn() },
    context,
    createRequirementsRestRuntime: vi.fn(async () => ({
      authorization: { assertAuthorized: vi.fn() },
      context,
      db: {},
      service,
    })),
    getRequestSqlServerDataSource: vi.fn(async () => ({})),
    getSuggestion: vi.fn(),
    recordDeniedActionAuditEvent: vi.fn(),
    service,
  }
})

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: mocks.createRequirementsRestRuntime,
}))

vi.mock('@/lib/requirements/auth', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/requirements/auth')>()
  return {
    ...actual,
    createDefaultAuthorizationService: () => ({ assertAuthorized: vi.fn() }),
    createRequestContext: vi.fn(async () => mocks.context),
  }
})

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: mocks.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/improvement-suggestions', () => ({
  getSuggestion: mocks.getSuggestion,
  SUGGESTION_DISMISSED: 2,
  SUGGESTION_RESOLVED: 1,
}))

vi.mock('@/lib/audit/action-audit', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/audit/action-audit')>()
  return {
    ...actual,
    recordDeniedActionAuditEvent: mocks.recordDeniedActionAuditEvent,
  }
})

import { POST as requestSuggestionReview } from '@/app/api/improvement-suggestions/[id]/request-review/route'
import { POST as recordSuggestionResolution } from '@/app/api/improvement-suggestions/[id]/resolution/route'
import { POST as revertSuggestionToDraft } from '@/app/api/improvement-suggestions/[id]/revert-to-draft/route'
import {
  DELETE as deleteSuggestion,
  GET as getSuggestion,
  PUT as putSuggestion,
} from '@/app/api/improvement-suggestions/[id]/route'
import {
  GET as getRequirementSuggestions,
  POST as postRequirementSuggestion,
} from '@/app/api/requirement-suggestions/[id]/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jsonRequest(method: string, body: unknown) {
  return new NextRequest('http://localhost/api/improvement-suggestions/9', {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method,
  })
}

const suggestionMutationFailureCases = [
  {
    expectedError: 'Failed to update improvement suggestion',
    invoke: () =>
      putSuggestion(
        jsonRequest('PUT', { content: 'Updated suggestion' }),
        makeParams('9'),
      ),
    label: 'editing',
  },
  {
    expectedError: 'Failed to delete improvement suggestion',
    invoke: () =>
      deleteSuggestion(
        new NextRequest('http://localhost/api/improvement-suggestions/9', {
          method: 'DELETE',
        }),
        makeParams('9'),
      ),
    label: 'deleting',
  },
  {
    expectedError: 'Failed to request review',
    invoke: () =>
      requestSuggestionReview(
        new NextRequest(
          'http://localhost/api/improvement-suggestions/9/request-review',
          { method: 'POST' },
        ),
        makeParams('9'),
      ),
    label: 'requesting review for',
  },
  {
    expectedError: 'Failed to revert to draft',
    invoke: () =>
      revertSuggestionToDraft(
        new NextRequest(
          'http://localhost/api/improvement-suggestions/9/revert-to-draft',
          { method: 'POST' },
        ),
        makeParams('9'),
      ),
    label: 'returning to draft',
  },
  {
    expectedError: 'Failed to record resolution',
    invoke: () =>
      recordSuggestionResolution(
        jsonRequest('POST', {
          resolution: 1,
          resolutionMotivation: 'Applied',
        }),
        makeParams('9'),
      ),
    label: 'resolving',
  },
]

describe('improvement suggestion REST service boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.service.listSuggestions.mockResolvedValue({
      counts: { dismissed: 0, pending: 1, resolved: 0, total: 1 },
      message: 'ok',
      suggestions: [{ content: 'Clarify this', id: 5 }],
    })
    mocks.service.manageSuggestion.mockResolvedValue({
      message: 'ok',
      result: { id: 9 },
    })
    mocks.createRequirementsRestRuntime.mockResolvedValue({
      authorization: mocks.authorization,
      context: mocks.context,
      db: {},
      service: mocks.service,
    })
    mocks.authorization.assertAuthorized.mockResolvedValue(undefined)
  })

  it('lists requirement suggestions through the requirements service', async () => {
    const response = await getRequirementSuggestions(
      new NextRequest('http://localhost/api/requirement-suggestions/7'),
      makeParams('7'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      suggestions: [{ content: 'Clarify this', id: 5 }],
    })
    expect(mocks.service.listSuggestions).toHaveBeenCalledWith(mocks.context, {
      requirementId: 7,
      responseFormat: 'json',
    })
  })

  it('maps requirement suggestion listing errors to the requirements error contract', async () => {
    mocks.service.listSuggestions.mockRejectedValueOnce(
      validationError('Either requirementId or uniqueId is required'),
    )

    const response = await getRequirementSuggestions(
      new NextRequest('http://localhost/api/requirement-suggestions/7'),
      makeParams('7'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'validation',
      error: 'Either requirementId or uniqueId is required',
    })
  })

  it('rejects invalid requirement suggestion list identifiers before service work', async () => {
    const response = await getRequirementSuggestions(
      new NextRequest('http://localhost/api/requirement-suggestions/nope'),
      makeParams('nope'),
    )

    expect(response.status).toBe(400)
    expect(mocks.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('returns a sanitized server error when listing suggestions fails unexpectedly', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mocks.service.listSuggestions.mockRejectedValueOnce(new Error('db offline'))

    try {
      const response = await getRequirementSuggestions(
        new NextRequest('http://localhost/api/requirement-suggestions/7'),
        makeParams('7'),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        code: 'internal',
        error: 'An internal error occurred',
      })
      expect(consoleErrorSpy).toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('creates requirement suggestions through manageSuggestion', async () => {
    const request = new NextRequest(
      'http://localhost/api/requirement-suggestions/7',
      {
        body: JSON.stringify({
          content: 'Clarify this',
          requirementVersionId: 12,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    )

    const response = await postRequirementSuggestion(request, makeParams('7'))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ id: 9 })
    expect(mocks.service.manageSuggestion).toHaveBeenCalledWith(mocks.context, {
      content: 'Clarify this',
      createdBy: null,
      operation: 'create',
      requirementId: 7,
      requirementVersionId: 12,
      responseFormat: 'json',
    })
  })

  it('creates suggestions with explicit authors and an unpinned version', async () => {
    const response = await postRequirementSuggestion(
      jsonRequest('POST', {
        content: 'Clarify this',
        createdBy: 'Ada',
        requirementVersionId: null,
      }),
      makeParams('7'),
    )

    expect(response.status).toBe(201)
    expect(mocks.service.manageSuggestion).toHaveBeenCalledWith(mocks.context, {
      content: 'Clarify this',
      createdBy: 'Ada',
      operation: 'create',
      requirementId: 7,
      requirementVersionId: null,
      responseFormat: 'json',
    })
  })

  it.each([
    {
      error: conflictError('Suggestion already exists'),
      expectedBody: {
        code: 'conflict',
        error: 'Suggestion already exists',
      },
      expectedStatus: 409,
      label: 'domain',
    },
    {
      error: new Error('db offline'),
      expectedBody: { error: 'Failed to create improvement suggestion' },
      expectedStatus: 500,
      label: 'unexpected',
    },
  ])(
    'maps $label suggestion creation failures without leaking internals',
    async ({ error, expectedBody, expectedStatus }) => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      mocks.service.manageSuggestion.mockRejectedValueOnce(error)

      try {
        const response = await postRequirementSuggestion(
          jsonRequest('POST', { content: 'Clarify this' }),
          makeParams('7'),
        )

        expect(response.status).toBe(expectedStatus)
        await expect(response.json()).resolves.toEqual(expectedBody)
      } finally {
        consoleErrorSpy.mockRestore()
      }
    },
  )

  it('gets a suggestion and maps not-found while rethrowing infrastructure failures', async () => {
    mocks.getSuggestion.mockResolvedValueOnce({
      content: 'Clarify this',
      id: 9,
    })

    const foundResponse = await getSuggestion(
      new NextRequest('http://localhost/api/improvement-suggestions/9'),
      makeParams('9'),
    )

    expect(foundResponse.status).toBe(200)
    await expect(foundResponse.json()).resolves.toEqual({
      content: 'Clarify this',
      id: 9,
    })
    expect(mocks.authorization.assertAuthorized).toHaveBeenCalledWith(
      { kind: 'get_improvement_suggestion', suggestionId: 9 },
      mocks.context,
    )
    expect(foundResponse.headers.get('Cache-Control')).toBe('no-store')

    mocks.getSuggestion.mockRejectedValueOnce(notFoundError('Not found'))
    const missingResponse = await getSuggestion(
      new NextRequest('http://localhost/api/improvement-suggestions/404'),
      makeParams('404'),
    )
    expect(missingResponse.status).toBe(404)
    await expect(missingResponse.json()).resolves.toEqual({
      code: 'not_found',
      error: 'Not found',
    })

    mocks.getSuggestion.mockRejectedValueOnce(new Error('db offline'))
    await expect(
      getSuggestion(
        new NextRequest('http://localhost/api/improvement-suggestions/9'),
        makeParams('9'),
      ),
    ).rejects.toThrow('db offline')
  })

  it('denies direct suggestion enumeration before reading personal data', async () => {
    mocks.authorization.assertAuthorized.mockRejectedValueOnce(
      forbiddenError('Requirement read denied'),
    )

    const response = await getSuggestion(
      new NextRequest('http://localhost/api/improvement-suggestions/9'),
      makeParams('9'),
    )

    expect(response.status).toBe(403)
    expect(mocks.getSuggestion).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('rejects invalid suggestion identifiers before database work', async () => {
    const response = await getSuggestion(
      new NextRequest('http://localhost/api/improvement-suggestions/nope'),
      makeParams('nope'),
    )

    expect(response.status).toBe(400)
    expect(mocks.getRequestSqlServerDataSource).not.toHaveBeenCalled()
  })

  it('routes suggestion edit and delete operations through manageSuggestion', async () => {
    const putResponse = await putSuggestion(
      jsonRequest('PUT', { content: 'Updated suggestion' }),
      makeParams('9'),
    )
    const deleteResponse = await deleteSuggestion(
      new NextRequest('http://localhost/api/improvement-suggestions/9', {
        method: 'DELETE',
      }),
      makeParams('9'),
    )

    expect(putResponse.status).toBe(200)
    expect(deleteResponse.status).toBe(200)
    expect(mocks.service.manageSuggestion).toHaveBeenNthCalledWith(
      1,
      mocks.context,
      {
        content: 'Updated suggestion',
        operation: 'edit',
        responseFormat: 'json',
        suggestionId: 9,
      },
    )
    expect(mocks.service.manageSuggestion).toHaveBeenNthCalledWith(
      2,
      mocks.context,
      {
        operation: 'delete',
        responseFormat: 'json',
        suggestionId: 9,
      },
    )
  })

  it('routes suggestion review state changes through manageSuggestion', async () => {
    await requestSuggestionReview(
      new NextRequest(
        'http://localhost/api/improvement-suggestions/9/request-review',
        { method: 'POST' },
      ),
      makeParams('9'),
    )
    await revertSuggestionToDraft(
      new NextRequest(
        'http://localhost/api/improvement-suggestions/9/revert-to-draft',
        { method: 'POST' },
      ),
      makeParams('9'),
    )

    expect(mocks.service.manageSuggestion).toHaveBeenNthCalledWith(
      1,
      mocks.context,
      {
        operation: 'request_review',
        responseFormat: 'json',
        suggestionId: 9,
      },
    )
    expect(mocks.service.manageSuggestion).toHaveBeenNthCalledWith(
      2,
      mocks.context,
      {
        operation: 'revert_to_draft',
        responseFormat: 'json',
        suggestionId: 9,
      },
    )
  })

  it('returns a reason-coded 409 for a repeated review request', async () => {
    mocks.service.manageSuggestion.mockRejectedValueOnce(
      conflictError('Review has already been requested', {
        reason: 'improvement_suggestion_review_already_requested',
        suggestionId: 9,
      }),
    )

    const response = await requestSuggestionReview(
      new NextRequest(
        'http://localhost/api/improvement-suggestions/9/request-review',
        { method: 'POST' },
      ),
      makeParams('9'),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      code: 'conflict',
      details: {
        reason: 'improvement_suggestion_review_already_requested',
      },
      error: 'Review has already been requested',
    })
  })

  it('maps REST resolution values to service suggestion operations', async () => {
    const resolveResponse = await recordSuggestionResolution(
      jsonRequest('POST', {
        resolution: 1,
        resolutionMotivation: 'Good fix',
        resolvedBy: 'Reviewer',
      }),
      makeParams('9'),
    )
    const dismissResponse = await recordSuggestionResolution(
      jsonRequest('POST', {
        resolution: 2,
        resolutionMotivation: 'Not relevant',
        resolvedBy: 'Reviewer',
      }),
      makeParams('9'),
    )

    expect(resolveResponse.status).toBe(200)
    expect(dismissResponse.status).toBe(200)
    expect(mocks.service.manageSuggestion).toHaveBeenNthCalledWith(
      1,
      mocks.context,
      {
        operation: 'resolve',
        resolutionMotivation: 'Good fix',
        resolvedBy: 'Reviewer',
        responseFormat: 'json',
        suggestionId: 9,
      },
    )
    expect(mocks.service.manageSuggestion).toHaveBeenNthCalledWith(
      2,
      mocks.context,
      {
        operation: 'dismiss',
        resolutionMotivation: 'Not relevant',
        resolvedBy: 'Reviewer',
        responseFormat: 'json',
        suggestionId: 9,
      },
    )
  })

  it.each(suggestionMutationFailureCases)(
    'maps domain errors while $label a suggestion',
    async ({ invoke }) => {
      mocks.service.manageSuggestion.mockRejectedValueOnce(
        conflictError('State changed'),
      )

      const response = await invoke()

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        code: 'conflict',
        error: 'State changed',
      })
    },
  )

  it.each(suggestionMutationFailureCases)(
    'sanitizes unexpected errors while $label a suggestion',
    async ({ expectedError, invoke }) => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined)
      mocks.service.manageSuggestion.mockRejectedValueOnce(
        new Error('secret db details'),
      )

      try {
        const response = await invoke()

        expect(response.status).toBe(500)
        await expect(response.json()).resolves.toEqual({ error: expectedError })
        expect(consoleErrorSpy).toHaveBeenCalled()
      } finally {
        consoleErrorSpy.mockRestore()
      }
    },
  )
})
