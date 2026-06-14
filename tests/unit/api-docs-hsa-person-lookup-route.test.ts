import { beforeEach, describe, expect, it, vi } from 'vitest'

const readFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: readFileMock,
  },
  readFile: readFileMock,
}))

import { GET } from '@/app/api-docs/hsa-person-lookup/route'

describe('GET /api-docs/hsa-person-lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serves the generated Swagger UI with no-store caching', async () => {
    readFileMock.mockResolvedValue('<!doctype html><title>HSA</title>')

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe(
      'text/html; charset=utf-8',
    )
    await expect(response.text()).resolves.toBe(
      '<!doctype html><title>HSA</title>',
    )
  })

  it('returns not found when the generated Swagger UI file is missing', async () => {
    readFileMock.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 'ENOENT' }),
    )

    const response = await GET()

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    )
    await expect(response.text()).resolves.toBe(
      'HSA person lookup Swagger UI has not been generated.',
    )
  })

  it('returns a server error when the generated Swagger UI cannot be read', async () => {
    readFileMock.mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    )

    const response = await GET()

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8',
    )
    await expect(response.text()).resolves.toBe(
      'Unable to read HSA person lookup Swagger UI.',
    )
  })
})
