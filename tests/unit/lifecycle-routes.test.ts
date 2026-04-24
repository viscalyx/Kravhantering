import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetDb = vi.fn().mockReturnValue({})

vi.mock('@/lib/db', () => ({
  getRequestSqlServerDataSource: (...a: unknown[]) => mockGetDb(...a),
}))

const mockManageRequirement = vi.fn()
const mockGetRequirement = vi.fn()
const mockCreateRequestContext = vi.fn(() => ({
  actor: {
    id: null,
    displayName: '',
    hsaId: null,
    roles: [],
    source: 'anonymous',
    isAuthenticated: false,
  },
  requestId: 'test',
  source: 'rest',
}))
const mockToHttpErrorPayload = vi
  .fn()
  .mockReturnValue({ body: { error: 'fail' }, status: 500 })

vi.mock('@/lib/requirements/service', () => ({
  createRequirementsService: () => ({
    manageRequirement: mockManageRequirement,
    getRequirement: mockGetRequirement,
  }),
  toHttpErrorPayload: (...a: unknown[]) => mockToHttpErrorPayload(...a),
}))

vi.mock('@/lib/requirements/auth', () => ({
  createRequestContext: mockCreateRequestContext,
}))

describe('lifecycle routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('delete-draft', () => {
    it('POST returns result on success', async () => {
      mockManageRequirement.mockResolvedValue({
        result: { deleted: true },
      })

      const { POST } = await import(
        '@/app/api/requirements/[id]/delete-draft/route'
      )
      const req = new Request(
        'http://localhost/api/requirements/1/delete-draft',
        {
          method: 'POST',
        },
      )
      const res = await POST(req as never, {
        params: Promise.resolve({ id: '1' }),
      })
      const json = await res.json()
      expect(json).toEqual({ deleted: true })
      expect(mockManageRequirement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 1, operation: 'delete_draft' }),
      )
    })

    it('POST returns error on failure', async () => {
      mockManageRequirement.mockRejectedValue(new Error('boom'))

      const { POST } = await import(
        '@/app/api/requirements/[id]/delete-draft/route'
      )
      const req = new Request(
        'http://localhost/api/requirements/1/delete-draft',
        {
          method: 'POST',
        },
      )
      const res = await POST(req as never, {
        params: Promise.resolve({ id: '1' }),
      })
      expect(res.status).toBe(500)
    })
  })

  describe('reactivate', () => {
    it('POST returns ok on success', async () => {
      mockManageRequirement.mockResolvedValue({ result: {} })

      const { POST } = await import(
        '@/app/api/requirements/[id]/reactivate/route'
      )
      const req = new Request(
        'http://localhost/api/requirements/1/reactivate',
        {
          method: 'POST',
        },
      )
      const res = await POST(req as never, {
        params: Promise.resolve({ id: '1' }),
      })
      const json = await res.json()
      expect(json).toEqual({ ok: true })
    })

    it('POST returns error on failure', async () => {
      mockManageRequirement.mockRejectedValue(new Error('boom'))

      const { POST } = await import(
        '@/app/api/requirements/[id]/reactivate/route'
      )
      const req = new Request(
        'http://localhost/api/requirements/1/reactivate',
        {
          method: 'POST',
        },
      )
      const res = await POST(req as never, {
        params: Promise.resolve({ id: '1' }),
      })
      expect(res.status).toBe(500)
    })
  })

  describe('restore', () => {
    it('POST returns ok with version on success', async () => {
      mockManageRequirement.mockResolvedValue({
        result: { versionNumber: 3 },
      })

      const { POST } = await import('@/app/api/requirements/[id]/restore/route')
      const req = new Request('http://localhost/api/requirements/1/restore', {
        method: 'POST',
        body: JSON.stringify({ versionNumber: 2 }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as never, {
        params: Promise.resolve({ id: '1' }),
      })
      const json = await res.json()
      expect(json).toEqual({ ok: true, version: { versionNumber: 3 } })
      expect(mockManageRequirement).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: 1,
          operation: 'restore_version',
          versionNumber: 2,
        }),
      )
    })

    it('POST returns error on failure', async () => {
      mockManageRequirement.mockRejectedValue(new Error('boom'))

      const { POST } = await import('@/app/api/requirements/[id]/restore/route')
      const req = new Request('http://localhost/api/requirements/1/restore', {
        method: 'POST',
        body: JSON.stringify({ versionNumber: 2 }),
        headers: { 'Content-Type': 'application/json' },
      })
      const res = await POST(req as never, {
        params: Promise.resolve({ id: '1' }),
      })
      expect(res.status).toBe(500)
    })
  })

  describe('versions/[version]', () => {
    it('GET returns version data on success', async () => {
      mockGetRequirement.mockResolvedValue({
        requirement: { uniqueId: 'TST-001' },
        version: { versionNumber: 2, description: 'v2' },
      })

      const { GET } = await import(
        '@/app/api/requirements/[id]/versions/[version]/route'
      )
      const req = new Request('http://localhost/api/requirements/1/versions/2')
      const res = await GET(req as never, {
        params: Promise.resolve({ id: '1', version: '2' }),
      })
      const json = (await res.json()) as { uniqueId: string }
      expect(json.uniqueId).toBe('TST-001')
    })

    it('GET returns error on failure', async () => {
      mockGetRequirement.mockRejectedValue(new Error('not found'))

      const { GET } = await import(
        '@/app/api/requirements/[id]/versions/[version]/route'
      )
      const req = new Request('http://localhost/api/requirements/1/versions/99')
      const res = await GET(req as never, {
        params: Promise.resolve({ id: '1', version: '99' }),
      })
      expect(res.status).toBe(500)
    })

    it('GET wraps a missing version detail in an internal requirements error', async () => {
      mockGetRequirement.mockResolvedValue({
        requirement: { uniqueId: 'TST-001' },
        version: null,
      })

      const { GET } = await import(
        '@/app/api/requirements/[id]/versions/[version]/route'
      )
      const req = new Request('http://localhost/api/requirements/1/versions/99')
      const res = await GET(req as never, {
        params: Promise.resolve({ id: '1', version: '99' }),
      })

      expect(res.status).toBe(500)
      expect(mockToHttpErrorPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'internal',
          message: 'Version 99 was not returned for requirement 1',
          name: 'RequirementsServiceError',
          status: 500,
        }),
      )
    })

    it('GET returns handled errors when request context creation fails', async () => {
      mockCreateRequestContext.mockRejectedValueOnce(new Error('auth failed'))

      const { GET } = await import(
        '@/app/api/requirements/[id]/versions/[version]/route'
      )
      const req = new Request('http://localhost/api/requirements/1/versions/2')
      const res = await GET(req as never, {
        params: Promise.resolve({ id: '1', version: '2' }),
      })

      expect(res.status).toBe(500)
      expect(mockGetRequirement).not.toHaveBeenCalled()
    })
  })
})
