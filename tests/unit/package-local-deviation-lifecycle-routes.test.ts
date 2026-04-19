import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  getRequestDatabase: vi.fn(),
  recordPackageLocalDecision: vi.fn(),
  requestPackageLocalReview: vi.fn(),
  revertPackageLocalToDraft: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestDatabase: routeState.getRequestDatabase,
}))

vi.mock('@/lib/dal/deviations', () => ({
  recordPackageLocalDecision: routeState.recordPackageLocalDecision,
  requestPackageLocalReview: routeState.requestPackageLocalReview,
  revertPackageLocalToDraft: routeState.revertPackageLocalToDraft,
}))

import { POST as postDecision } from '@/app/api/package-local-deviations/[id]/decision/route'
import { POST as postRequestReview } from '@/app/api/package-local-deviations/[id]/request-review/route'
import { POST as postRevertToDraft } from '@/app/api/package-local-deviations/[id]/revert-to-draft/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('package-local deviation lifecycle routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('request-review returns JSON 500 when DB acquisition fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequestDatabase.mockRejectedValueOnce(new Error('db offline'))

    try {
      const response = await postRequestReview(
        new Request(
          'https://example.test/api/package-local-deviations/1/request-review',
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

  it('decision returns JSON 500 when DB acquisition fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequestDatabase.mockRejectedValueOnce(new Error('db offline'))

    try {
      const response = await postDecision(
        new Request(
          'https://example.test/api/package-local-deviations/1/decision',
          {
            body: JSON.stringify({
              decision: 1,
              decisionMotivation: 'Looks good',
              decidedBy: 'Reviewer',
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        ) as never,
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

  it('revert-to-draft returns JSON 500 when DB acquisition fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    routeState.getRequestDatabase.mockRejectedValueOnce(new Error('db offline'))

    try {
      const response = await postRevertToDraft(
        new Request(
          'https://example.test/api/package-local-deviations/1/revert-to-draft',
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
})
