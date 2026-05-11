import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpdateQualityCharacteristic = vi.fn()
const mockDeleteQualityCharacteristic = vi.fn()
const mockListQualityCharacteristics = vi.fn()

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: () => ({}),
}))

vi.mock('@/lib/dal/requirement-types', () => ({
  updateQualityCharacteristic: (...a: unknown[]) =>
    mockUpdateQualityCharacteristic(...a),
  deleteQualityCharacteristic: (...a: unknown[]) =>
    mockDeleteQualityCharacteristic(...a),
  listQualityCharacteristics: (...a: unknown[]) =>
    mockListQualityCharacteristics(...a),
}))

import { DELETE, PUT } from '@/app/api/quality-characteristics/[id]/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function jsonReq(method: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
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

describe('quality-characteristics/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListQualityCharacteristics.mockResolvedValue([])
  })

  describe('PUT', () => {
    it('updates and returns the characteristic', async () => {
      mockUpdateQualityCharacteristic.mockResolvedValue({
        chapterId: '3.1',
        id: 1,
        nameEn: 'Updated',
      })
      const res = await PUT(
        jsonReq('PUT', {
          chapterId: '3.1',
          nameEn: 'Updated',
          nameSv: 'Uppdaterad',
          requirementTypeId: 1,
        }),
        makeParams('1'),
      )
      expect(res.status).toBe(200)
      const json = (await res.json()) as { id: number; nameEn: string }
      expect(json.nameEn).toBe('Updated')
    })

    it('returns 400 for invalid id', async () => {
      const res = await PUT(
        jsonReq('PUT', {
          chapterId: '3.1',
          nameEn: 'X',
          nameSv: 'X',
          requirementTypeId: 1,
        }),
        makeParams('abc'),
      )
      expect(res.status).toBe(400)
      await expectInvalidRequest(res, 'id')
    })

    it('returns 400 for invalid payload', async () => {
      const res = await PUT(
        jsonReq('PUT', {
          chapterId: '3.1',
          nameEn: 'X',
          nameSv: 123 as unknown as string,
          requirementTypeId: 1,
        }),
        makeParams('1'),
      )
      expect(res.status).toBe(400)
      await expectInvalidRequest(res, 'nameSv')
    })

    it('returns 400 when chapterId is missing', async () => {
      const res = await PUT(
        jsonReq('PUT', {
          nameEn: 'X',
          nameSv: 'X',
          requirementTypeId: 1,
        }),
        makeParams('1'),
      )
      expect(res.status).toBe(400)
      await expectInvalidRequest(res, 'chapterId')
    })

    it('returns 400 when chapterId is invalid', async () => {
      const res = await PUT(
        jsonReq('PUT', {
          chapterId: 'chapter-3',
          nameEn: 'X',
          nameSv: 'X',
          requirementTypeId: 1,
        }),
        makeParams('1'),
      )
      expect(res.status).toBe(400)
      await expectInvalidRequest(res, 'chapterId')
    })

    it('returns 404 when not found', async () => {
      mockUpdateQualityCharacteristic.mockResolvedValue(null)
      const res = await PUT(
        jsonReq('PUT', {
          chapterId: '3.1',
          nameEn: 'Missing',
          nameSv: 'Saknas',
          requirementTypeId: 1,
        }),
        makeParams('1'),
      )
      expect(res.status).toBe(404)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Not found')
    })
  })

  describe('DELETE', () => {
    it('deletes and returns ok', async () => {
      mockDeleteQualityCharacteristic.mockResolvedValue(true)
      const req = new NextRequest('http://localhost', { method: 'DELETE' })
      const res = await DELETE(req, makeParams('1'))
      expect(res.status).toBe(200)
      const json = (await res.json()) as { ok: boolean }
      expect(json.ok).toBe(true)
    })

    it('returns 400 for invalid id', async () => {
      const req = new NextRequest('http://localhost', { method: 'DELETE' })
      const res = await DELETE(req, makeParams('0'))
      expect(res.status).toBe(400)
      await expectInvalidRequest(res, 'id')
    })

    it('returns 409 when has sub-characteristics', async () => {
      mockListQualityCharacteristics.mockResolvedValue([{ id: 2, parentId: 5 }])
      const req = new NextRequest('http://localhost', { method: 'DELETE' })
      const res = await DELETE(req, makeParams('5'))
      expect(res.status).toBe(409)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Has sub-characteristics')
    })

    it('returns 404 when not found', async () => {
      mockDeleteQualityCharacteristic.mockResolvedValue(false)
      const req = new NextRequest('http://localhost', { method: 'DELETE' })
      const res = await DELETE(req, makeParams('1'))
      expect(res.status).toBe(404)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Not found')
    })

    it('returns 409 on foreign key constraint error', async () => {
      mockDeleteQualityCharacteristic.mockRejectedValue(
        new Error('FOREIGN KEY constraint failed'),
      )
      const req = new NextRequest('http://localhost', { method: 'DELETE' })
      const res = await DELETE(req, makeParams('1'))
      expect(res.status).toBe(409)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('In use by requirements')
    })

    it('returns 500 on unknown error', async () => {
      mockDeleteQualityCharacteristic.mockRejectedValue(new Error('unexpected'))
      const req = new NextRequest('http://localhost', { method: 'DELETE' })
      const res = await DELETE(req, makeParams('1'))
      expect(res.status).toBe(500)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Internal server error')
    })

    it('returns 500 on non-Error rejection', async () => {
      mockDeleteQualityCharacteristic.mockRejectedValue('string rejection')
      const req = new NextRequest('http://localhost', { method: 'DELETE' })
      const res = await DELETE(req, makeParams('1'))
      expect(res.status).toBe(500)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Internal server error')
    })
  })
})
