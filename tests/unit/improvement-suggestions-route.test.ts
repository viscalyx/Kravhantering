import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSuggestion: vi.fn(),
  getRequestDatabaseConnection: vi.fn(() => 'mock-db'),
  listSuggestionsForRequirement: vi.fn(),
  recordResolution: vi.fn(),
  requestReview: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestDatabaseConnection: mocks.getRequestDatabaseConnection,
}))

vi.mock('@/lib/dal/improvement-suggestions', () => ({
  createSuggestion: mocks.createSuggestion,
  listSuggestionsForRequirement: mocks.listSuggestionsForRequirement,
  recordResolution: mocks.recordResolution,
  requestReview: mocks.requestReview,
}))

import { POST as POSTSuggestion } from '@/app/api/requirement-suggestions/[id]/route'
import { POST as POSTResolution } from '@/app/api/improvement-suggestions/[id]/resolution/route'
import { POST as POSTRequestReview } from '@/app/api/improvement-suggestions/[id]/request-review/route'

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id })
}

describe('improvement suggestions routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a suggestion through the shared request DB connection', async () => {
    mocks.createSuggestion.mockResolvedValue({ id: 12 })
    const request = new NextRequest('http://localhost/api/requirement-suggestions/4', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Needs update', createdBy: 'anna' }),
    })

    const response = await POSTSuggestion(request, { params: makeParams('4') })

    expect(mocks.getRequestDatabaseConnection).toHaveBeenCalled()
    expect(mocks.createSuggestion).toHaveBeenCalledWith('mock-db', {
      requirementId: 4,
      requirementVersionId: null,
      content: 'Needs update',
      createdBy: 'anna',
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ id: 12 })
  })

  it('records a resolution through the shared request DB connection', async () => {
    const request = new NextRequest('http://localhost/api/improvement-suggestions/9/resolution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resolution: 1,
        resolutionMotivation: 'Applied',
        resolvedBy: 'alice',
      }),
    })

    const response = await POSTResolution(request, { params: makeParams('9') })

    expect(mocks.getRequestDatabaseConnection).toHaveBeenCalled()
    expect(mocks.recordResolution).toHaveBeenCalledWith('mock-db', 9, {
      resolution: 1,
      resolutionMotivation: 'Applied',
      resolvedBy: 'alice',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('requests review through the shared request DB connection', async () => {
    const request = new NextRequest('http://localhost/api/improvement-suggestions/9/request-review', {
      method: 'POST',
    })

    const response = await POSTRequestReview(request, { params: makeParams('9') })

    expect(mocks.getRequestDatabaseConnection).toHaveBeenCalled()
    expect(mocks.requestReview).toHaveBeenCalledWith('mock-db', 9)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })
})
