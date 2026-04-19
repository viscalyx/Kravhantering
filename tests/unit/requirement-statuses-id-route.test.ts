import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUpdateStatus = vi.fn()
const mockDeleteStatus = vi.fn()

vi.mock('@/lib/db', () => ({
  getRequestDatabase: () => ({}),
}))

vi.mock('@/lib/dal/requirement-statuses', () => ({
  updateStatus: (...args: unknown[]) => mockUpdateStatus(...args),
  deleteStatus: (...args: unknown[]) => mockDeleteStatus(...args),
}))

import { DELETE, PUT } from '@/app/api/requirement-statuses/[id]/route'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

describe('requirement-statuses/[id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('PUT updates status', async () => {
    mockUpdateStatus.mockResolvedValue({ id: 1, nameSv: 'X', nameEn: 'X' })
    const req = new NextRequest('http://localhost', {
      method: 'PUT',
      body: JSON.stringify({ nameSv: 'X', nameEn: 'X' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await PUT(req, makeParams('1'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      id: number
      nameSv: string
      nameEn: string
    }
    expect(json).toEqual({ id: 1, nameSv: 'X', nameEn: 'X' })
    expect(mockUpdateStatus).toHaveBeenCalledTimes(1)
    expect(mockUpdateStatus).toHaveBeenCalledWith(expect.anything(), 1, {
      nameSv: 'X',
      nameEn: 'X',
    })
  })

  it('DELETE deletes status', async () => {
    mockDeleteStatus.mockResolvedValue(undefined)
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean }
    expect(json.ok).toBe(true)
    expect(mockDeleteStatus).toHaveBeenCalledTimes(1)
    expect(mockDeleteStatus).toHaveBeenCalledWith(expect.anything(), 1)
  })

  it('DELETE returns error on failure', async () => {
    mockDeleteStatus.mockRejectedValue(new Error('Cannot delete'))
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Cannot delete')
    expect(mockDeleteStatus).toHaveBeenCalledTimes(1)
    expect(mockDeleteStatus).toHaveBeenCalledWith(expect.anything(), 1)
  })

  it('DELETE returns fallback message for non-Error rejection', async () => {
    mockDeleteStatus.mockRejectedValue('unexpected')
    const req = new NextRequest('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req, makeParams('1'))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('Failed to delete status')
    expect(mockDeleteStatus).toHaveBeenCalledTimes(1)
    expect(mockDeleteStatus).toHaveBeenCalledWith(expect.anything(), 1)
  })
})
