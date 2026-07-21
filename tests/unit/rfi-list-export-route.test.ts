import { parse as parseContentDisposition } from 'content-disposition'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  authorize: vi.fn(),
  buildSpecificationRfiListCsv: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationRfiList: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))

vi.mock('@/lib/requirements/service-shared', () => ({
  authorize: routeState.authorize,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: routeState.getSpecificationById,
}))

vi.mock('@/lib/dal/rfi-questions', () => ({
  getSpecificationRfiList: routeState.getSpecificationRfiList,
}))

vi.mock('@/lib/rfi/rfi-list-export', () => ({
  buildSpecificationRfiListCsv: routeState.buildSpecificationRfiListCsv,
  default: () => null,
}))

describe('RFI list export route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeState.createRequirementsRestRuntime.mockResolvedValue({
      authorization: { assertAuthorized: vi.fn() },
      context: {
        actor: { isAuthenticated: true },
        correlationId: 'corr',
        requestId: 'req',
        source: 'rest',
      },
      db: { db: true },
    })
    routeState.getSpecificationById.mockResolvedValue({
      id: 42,
      name: 'Spec\\Part "å"',
      specificationCode: 'SPEC:1',
    })
    routeState.getSpecificationRfiList.mockResolvedValue({ items: [] })
    routeState.buildSpecificationRfiListCsv.mockReturnValue('Question\r\n')
  })

  it('returns a safely encoded CSV attachment filename', async () => {
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/rfi-list/export/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/rfi-list/export?format=csv&locale=en',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    const header = response.headers.get('Content-Disposition')
    expect(header).not.toBeNull()
    expect(parseContentDisposition(header ?? '').parameters.filename).toBe(
      'RFI question list Spec-Part -å- SPEC-1.csv',
    )
    expect(response.headers.get('X-Request-Id')).toBe('req')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Question\r\n')
  })
})
