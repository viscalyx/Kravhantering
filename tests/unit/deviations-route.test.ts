import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDb = {}

const mocks = {
  countDeviationsByPackage: vi.fn(),
  countDeviationsPerItem: vi.fn(),
  createDeviation: vi.fn(),
  deleteDeviation: vi.fn(),
  getDeviation: vi.fn(),
  getPackageById: vi.fn(),
  getPackageBySlug: vi.fn(),
  getPackageItemById: vi.fn(),
  listDeviationsForPackage: vi.fn(),
  listDeviationsForPackageItem: vi.fn(),
  recordDecision: vi.fn(),
  requestReview: vi.fn(),
  revertToDraft: vi.fn(),
  updateDeviation: vi.fn(),
}

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: async () => ({ env: { DB: {} } }),
}))

vi.mock('@/lib/db', () => ({
  getDb: () => mockDb,
}))

vi.mock('@/lib/dal/deviations', () => ({
  countDeviationsByPackage: (...args: unknown[]) =>
    mocks.countDeviationsByPackage(...args),
  countDeviationsPerItem: (...args: unknown[]) =>
    mocks.countDeviationsPerItem(...args),
  createDeviation: (...args: unknown[]) => mocks.createDeviation(...args),
  deleteDeviation: (...args: unknown[]) => mocks.deleteDeviation(...args),
  getDeviation: (...args: unknown[]) => mocks.getDeviation(...args),
  listDeviationsForPackage: (...args: unknown[]) =>
    mocks.listDeviationsForPackage(...args),
  listDeviationsForPackageItem: (...args: unknown[]) =>
    mocks.listDeviationsForPackageItem(...args),
  recordDecision: (...args: unknown[]) => mocks.recordDecision(...args),
  requestReview: (...args: unknown[]) => mocks.requestReview(...args),
  revertToDraft: (...args: unknown[]) => mocks.revertToDraft(...args),
  updateDeviation: (...args: unknown[]) => mocks.updateDeviation(...args),
}))

vi.mock('@/lib/dal/requirement-packages', () => ({
  getPackageById: (...args: unknown[]) => mocks.getPackageById(...args),
  getPackageBySlug: (...args: unknown[]) => mocks.getPackageBySlug(...args),
  getPackageItemById: (...args: unknown[]) => mocks.getPackageItemById(...args),
}))

import { POST as postDecision } from '@/app/api/deviations/[id]/decision/route'
import { POST as postRequestReview } from '@/app/api/deviations/[id]/request-review/route'
import { POST as postRevertToDraft } from '@/app/api/deviations/[id]/revert-to-draft/route'
import {
  DELETE as deleteDeviationRoute,
  GET as getDeviationRoute,
  PUT as updateDeviationRoute,
} from '@/app/api/deviations/[id]/route'
import { GET as getPackageDeviations } from '@/app/api/requirement-packages/[id]/deviations/route'
import {
  POST as createItemDeviation,
  GET as getItemDeviations,
} from '@/app/api/requirement-packages/[id]/items/[itemId]/deviations/route'
import { RequirementsServiceError } from '@/lib/requirements/errors'

function makePackageParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeItemParams(id: string, itemId: string) {
  return { params: Promise.resolve({ id, itemId }) }
}

function makeDeviationParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('deviation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPackageBySlug.mockResolvedValue({ id: 5 })
    mocks.getPackageById.mockResolvedValue({ id: 5 })
    mocks.getPackageItemById.mockResolvedValue({ id: 1, packageId: 5 })
  })

  describe('GET /requirement-packages/[id]/deviations', () => {
    it('returns deviations and counts for a package', async () => {
      const deviations = [{ id: 1, motivation: 'Test', decision: null }]
      const counts = {
        total: 1,
        pending: 1,
        approved: 0,
        rejected: 0,
      }
      mocks.listDeviationsForPackage.mockResolvedValue(deviations)
      mocks.countDeviationsByPackage.mockResolvedValue(counts)

      const request = new NextRequest(
        'http://localhost/api/requirement-packages/pkg/deviations',
      )
      const response = await getPackageDeviations(
        request,
        makePackageParams('pkg'),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        counts,
        deviations,
      })
    })

    it('returns 404 for unknown package', async () => {
      mocks.getPackageBySlug.mockResolvedValue(null)
      mocks.getPackageById.mockResolvedValue(null)

      const request = new NextRequest(
        'http://localhost/api/requirement-packages/999/deviations',
      )
      const response = await getPackageDeviations(
        request,
        makePackageParams('999'),
      )
      expect(response.status).toBe(404)
    })
  })

  describe('GET /requirement-packages/[id]/items/[itemId]/deviations', () => {
    it('returns deviations for a package item', async () => {
      const deviations = [{ id: 1, motivation: 'Test' }]
      mocks.listDeviationsForPackageItem.mockResolvedValue(deviations)

      const request = new NextRequest(
        'http://localhost/api/requirement-packages/5/items/1/deviations',
      )
      const response = await getItemDeviations(
        request,
        makeItemParams('5', '1'),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ deviations })
    })

    it('returns 400 for invalid itemId', async () => {
      const request = new NextRequest(
        'http://localhost/api/requirement-packages/5/items/abc/deviations',
      )
      const response = await getItemDeviations(
        request,
        makeItemParams('5', 'abc'),
      )
      expect(response.status).toBe(400)
    })
  })

  describe('POST /requirement-packages/[id]/items/[itemId]/deviations', () => {
    it('creates a deviation and returns 201', async () => {
      mocks.createDeviation.mockResolvedValue({ id: 42 })

      const request = new NextRequest(
        'http://localhost/api/requirement-packages/5/items/1/deviations',
        {
          body: JSON.stringify({
            motivation: 'Cannot meet standard',
            createdBy: 'tester',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      const response = await createItemDeviation(
        request,
        makeItemParams('5', '1'),
      )
      expect(response.status).toBe(201)
      await expect(response.json()).resolves.toEqual({ id: 42, ok: true })
      expect(mocks.createDeviation).toHaveBeenCalledWith(mockDb, {
        packageItemId: 1,
        motivation: 'Cannot meet standard',
        createdBy: 'tester',
      })
    })

    it('returns 400 when motivation is missing', async () => {
      const request = new NextRequest(
        'http://localhost/api/requirement-packages/5/items/1/deviations',
        {
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      const response = await createItemDeviation(
        request,
        makeItemParams('5', '1'),
      )
      expect(response.status).toBe(400)
    })
  })

  describe('GET /deviations/[id]', () => {
    it('returns a deviation', async () => {
      const deviation = {
        id: 1,
        motivation: 'Test',
        decision: null,
      }
      mocks.getDeviation.mockResolvedValue(deviation)

      const request = new NextRequest('http://localhost/api/deviations/1')
      const response = await getDeviationRoute(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual(deviation)
    })

    it('returns 404 for missing deviation', async () => {
      mocks.getDeviation.mockRejectedValue(
        new RequirementsServiceError('not_found', 'Not found'),
      )

      const request = new NextRequest('http://localhost/api/deviations/999')
      const response = await getDeviationRoute(
        request,
        makeDeviationParams('999'),
      )
      expect(response.status).toBe(404)
    })
  })

  describe('PUT /deviations/[id]', () => {
    it('updates a deviation', async () => {
      mocks.updateDeviation.mockResolvedValue(undefined)

      const request = new NextRequest('http://localhost/api/deviations/1', {
        body: JSON.stringify({ motivation: 'Updated' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })
      const response = await updateDeviationRoute(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })
    })

    it('returns 409 when deviation has decision', async () => {
      mocks.updateDeviation.mockRejectedValue(
        new RequirementsServiceError('conflict', 'Cannot edit after decision'),
      )

      const request = new NextRequest('http://localhost/api/deviations/1', {
        body: JSON.stringify({ motivation: 'Updated' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT',
      })
      const response = await updateDeviationRoute(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(409)
    })
  })

  describe('DELETE /deviations/[id]', () => {
    it('deletes a deviation', async () => {
      mocks.deleteDeviation.mockResolvedValue(undefined)

      const request = new NextRequest('http://localhost/api/deviations/1', {
        method: 'DELETE',
      })
      const response = await deleteDeviationRoute(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })
    })

    it('returns 409 when deviation has decision', async () => {
      mocks.deleteDeviation.mockRejectedValue(
        new RequirementsServiceError(
          'conflict',
          'Cannot delete after decision',
        ),
      )

      const request = new NextRequest('http://localhost/api/deviations/1', {
        method: 'DELETE',
      })
      const response = await deleteDeviationRoute(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(409)
    })
  })

  describe('POST /deviations/[id]/decision', () => {
    it('records a decision', async () => {
      mocks.recordDecision.mockResolvedValue(undefined)

      const request = new NextRequest(
        'http://localhost/api/deviations/1/decision',
        {
          body: JSON.stringify({
            decision: 1,
            decisionMotivation: 'Risk accepted',
            decidedBy: 'manager',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      const response = await postDecision(request, makeDeviationParams('1'))
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })
    })

    it('returns 400 when fields are missing', async () => {
      const request = new NextRequest(
        'http://localhost/api/deviations/1/decision',
        {
          body: JSON.stringify({ decision: 1 }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      const response = await postDecision(request, makeDeviationParams('1'))
      expect(response.status).toBe(400)
    })

    it('returns 409 when decision already recorded', async () => {
      mocks.recordDecision.mockRejectedValue(
        new RequirementsServiceError('conflict', 'Already decided'),
      )

      const request = new NextRequest(
        'http://localhost/api/deviations/1/decision',
        {
          body: JSON.stringify({
            decision: 2,
            decisionMotivation: 'Change mind',
            decidedBy: 'other',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      )
      const response = await postDecision(request, makeDeviationParams('1'))
      expect(response.status).toBe(409)
    })
  })

  describe('POST /deviations/[id]/request-review', () => {
    it('requests review successfully', async () => {
      mocks.requestReview.mockResolvedValue(undefined)

      const request = new NextRequest(
        'http://localhost/api/deviations/1/request-review',
        { method: 'POST' },
      )
      const response = await postRequestReview(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })
      expect(mocks.requestReview).toHaveBeenCalledWith(mockDb, 1)
    })

    it('returns 400 for non-numeric id', async () => {
      const request = new NextRequest(
        'http://localhost/api/deviations/abc/request-review',
        { method: 'POST' },
      )
      const response = await postRequestReview(
        request,
        makeDeviationParams('abc'),
      )
      expect(response.status).toBe(400)
    })

    it('returns service error status on failure', async () => {
      mocks.requestReview.mockRejectedValue(
        new RequirementsServiceError('conflict', 'Already requested'),
      )

      const request = new NextRequest(
        'http://localhost/api/deviations/1/request-review',
        { method: 'POST' },
      )
      const response = await postRequestReview(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(409)
    })
  })

  describe('POST /deviations/[id]/revert-to-draft', () => {
    it('reverts to draft successfully', async () => {
      mocks.revertToDraft.mockResolvedValue(undefined)

      const request = new NextRequest(
        'http://localhost/api/deviations/1/revert-to-draft',
        { method: 'POST' },
      )
      const response = await postRevertToDraft(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ ok: true })
      expect(mocks.revertToDraft).toHaveBeenCalledWith(mockDb, 1)
    })

    it('returns 400 for non-numeric id', async () => {
      const request = new NextRequest(
        'http://localhost/api/deviations/abc/revert-to-draft',
        { method: 'POST' },
      )
      const response = await postRevertToDraft(
        request,
        makeDeviationParams('abc'),
      )
      expect(response.status).toBe(400)
    })

    it('returns service error status on failure', async () => {
      mocks.revertToDraft.mockRejectedValue(
        new RequirementsServiceError('conflict', 'Not in review'),
      )

      const request = new NextRequest(
        'http://localhost/api/deviations/1/revert-to-draft',
        { method: 'POST' },
      )
      const response = await postRevertToDraft(
        request,
        makeDeviationParams('1'),
      )
      expect(response.status).toBe(409)
    })
  })
})
