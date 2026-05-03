import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  getRequestSqlServerDataSource: vi.fn(),
  recordSpecificationLocalDecision: vi.fn(),
  requestSpecificationLocalReview: vi.fn(),
  revertSpecificationLocalToDraft: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: routeState.getRequestSqlServerDataSource,
}))

vi.mock('@/lib/dal/deviations', () => ({
  recordSpecificationLocalDecision: routeState.recordSpecificationLocalDecision,
  requestSpecificationLocalReview: routeState.requestSpecificationLocalReview,
  revertSpecificationLocalToDraft: routeState.revertSpecificationLocalToDraft,
}))

import { POST as postDecision } from '@/app/api/specification-local-deviations/[id]/decision/route'
import { POST as postRequestReview } from '@/app/api/specification-local-deviations/[id]/request-review/route'
import { POST as postRevertToDraft } from '@/app/api/specification-local-deviations/[id]/revert-to-draft/route'
import { RequirementsServiceError } from '@/lib/requirements/errors'

const mockDb = {}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('specification-local deviation lifecycle routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.getRequestSqlServerDataSource.mockResolvedValue(mockDb)
  })

  it('request-review returns JSON 500 when DB acquisition fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequestSqlServerDataSource.mockRejectedValueOnce(
      new Error('db offline'),
    )

    try {
      const response = await postRequestReview(
        new Request(
          'https://example.test/api/specification-local-deviations/1/request-review',
          {
            method: 'POST',
          },
        ),
        makeParams('1'),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to request review',
      })
      expect(consoleErrorSpy).toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('request-review returns 200 and delegates to the DAL on success', async () => {
    const response = await postRequestReview(
      new Request(
        'https://example.test/api/specification-local-deviations/1/request-review',
        {
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.requestSpecificationLocalReview).toHaveBeenCalledWith(
      mockDb,
      1,
    )
  })

  it('request-review propagates requirements service errors', async () => {
    routeState.requestSpecificationLocalReview.mockRejectedValueOnce(
      new RequirementsServiceError('conflict', 'Already requested'),
    )

    const response = await postRequestReview(
      new Request(
        'https://example.test/api/specification-local-deviations/1/request-review',
        {
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Already requested',
    })
  })

  it('decision returns JSON 500 when DB acquisition fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequestSqlServerDataSource.mockRejectedValueOnce(
      new Error('db offline'),
    )

    try {
      const response = await postDecision(
        new NextRequest(
          'https://example.test/api/specification-local-deviations/1/decision',
          {
            body: JSON.stringify({
              decision: 1,
              decisionMotivation: 'Looks good',
              decidedBy: 'Reviewer',
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        ),
        makeParams('1'),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to record decision',
      })
      expect(consoleErrorSpy).toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('decision returns 200 and delegates to the DAL on success', async () => {
    const response = await postDecision(
      new NextRequest(
        'https://example.test/api/specification-local-deviations/1/decision',
        {
          body: JSON.stringify({
            decision: 1,
            decisionMotivation: 'Looks good',
            decidedBy: 'Reviewer',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.recordSpecificationLocalDecision).toHaveBeenCalledWith(
      mockDb,
      1,
      {
        decision: 1,
        decisionMotivation: 'Looks good',
        decidedBy: 'Reviewer',
      },
    )
  })

  it('decision propagates requirements service errors', async () => {
    routeState.recordSpecificationLocalDecision.mockRejectedValueOnce(
      new RequirementsServiceError('conflict', 'Already decided'),
    )

    const response = await postDecision(
      new NextRequest(
        'https://example.test/api/specification-local-deviations/1/decision',
        {
          body: JSON.stringify({
            decision: 2,
            decisionMotivation: 'Rejected',
            decidedBy: 'Approver',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Already decided',
    })
  })

  it('decision returns 400 for invalid ids before opening the DB', async () => {
    const response = await postDecision(
      new NextRequest(
        'https://example.test/api/specification-local-deviations/abc/decision',
        {
          body: JSON.stringify({
            decision: 1,
            decisionMotivation: 'Looks good',
            decidedBy: 'Reviewer',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('abc'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Invalid id' })
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.recordSpecificationLocalDecision).not.toHaveBeenCalled()
  })

  it('decision returns 400 for invalid JSON bodies', async () => {
    const response = await postDecision(
      new NextRequest(
        'https://example.test/api/specification-local-deviations/1/decision',
        {
          body: '{',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid JSON body',
    })
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.recordSpecificationLocalDecision).not.toHaveBeenCalled()
  })

  it('decision returns 400 when required fields are missing', async () => {
    const response = await postDecision(
      new NextRequest(
        'https://example.test/api/specification-local-deviations/1/decision',
        {
          body: JSON.stringify({ decision: 1 }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error:
        'decision (number), decisionMotivation (string), and decidedBy (string) are required',
    })
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.recordSpecificationLocalDecision).not.toHaveBeenCalled()
  })

  it('decision returns 400 when required fields have invalid types', async () => {
    const response = await postDecision(
      new NextRequest(
        'https://example.test/api/specification-local-deviations/1/decision',
        {
          body: JSON.stringify({
            decision: 'approve',
            decisionMotivation: ['Looks good'],
            decidedBy: 123,
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error:
        'decision (number), decisionMotivation (string), and decidedBy (string) are required',
    })
    expect(routeState.getRequestSqlServerDataSource).not.toHaveBeenCalled()
    expect(routeState.recordSpecificationLocalDecision).not.toHaveBeenCalled()
  })

  it('revert-to-draft returns JSON 500 when DB acquisition fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequestSqlServerDataSource.mockRejectedValueOnce(
      new Error('db offline'),
    )

    try {
      const response = await postRevertToDraft(
        new Request(
          'https://example.test/api/specification-local-deviations/1/revert-to-draft',
          {
            method: 'POST',
          },
        ),
        makeParams('1'),
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: 'Failed to revert to draft',
      })
      expect(consoleErrorSpy).toHaveBeenCalled()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('revert-to-draft returns 200 and delegates to the DAL on success', async () => {
    const response = await postRevertToDraft(
      new Request(
        'https://example.test/api/specification-local-deviations/1/revert-to-draft',
        {
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(routeState.getRequestSqlServerDataSource).toHaveBeenCalledTimes(1)
    expect(routeState.revertSpecificationLocalToDraft).toHaveBeenCalledWith(
      mockDb,
      1,
    )
  })

  it('revert-to-draft propagates requirements service errors', async () => {
    routeState.revertSpecificationLocalToDraft.mockRejectedValueOnce(
      new RequirementsServiceError('conflict', 'Not in review'),
    )

    const response = await postRevertToDraft(
      new Request(
        'https://example.test/api/specification-local-deviations/1/revert-to-draft',
        {
          method: 'POST',
        },
      ),
      makeParams('1'),
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'Not in review',
    })
  })
})
