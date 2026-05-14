import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validationError } from '@/lib/requirements/errors'

const mocks = vi.hoisted(() => {
  const context = {
    actor: {
      displayName: 'Route Tester',
      hsaId: 'SE2321000032-route',
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
    context,
    createRequirementsRestRuntime: vi.fn(async () => ({
      context,
      service,
    })),
    getRequestSqlServerDataSource: vi.fn(async () => ({})),
    getSuggestion: vi.fn(),
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

import { POST as requestSuggestionReview } from '@/app/api/improvement-suggestions/[id]/request-review/route'
import { POST as recordSuggestionResolution } from '@/app/api/improvement-suggestions/[id]/resolution/route'
import { POST as revertSuggestionToDraft } from '@/app/api/improvement-suggestions/[id]/revert-to-draft/route'
import {
  DELETE as deleteSuggestion,
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
  })

  it('lists requirement suggestions through the requirements service', async () => {
    const response = await getRequirementSuggestions(
      new NextRequest('http://localhost/api/requirement-suggestions/7'),
      makeParams('7'),
    )

    expect(response.status).toBe(200)
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
})
