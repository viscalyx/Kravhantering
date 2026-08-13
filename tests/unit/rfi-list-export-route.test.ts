import { parse as parseContentDisposition } from 'content-disposition'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  authorize: vi.fn(),
  buildSpecificationRfiListCsv: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  getApplicationSettings: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationRfiList: vi.fn(),
  renderPdfResponse: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: routeState.getApplicationSettings,
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

vi.mock('@/lib/pdf/server-response', () => ({
  renderPdfResponse: routeState.renderPdfResponse,
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
    routeState.getApplicationSettings.mockResolvedValue({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1000,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.buildSpecificationRfiListCsv.mockReturnValue('Question\r\n')
    routeState.renderPdfResponse.mockResolvedValue(
      new Response('pdf bytes', {
        headers: { 'Content-Type': 'application/pdf' },
      }),
    )
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

  it('rejects invalid path and export query values before runtime work', async () => {
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/rfi-list/export/route'
    )

    const invalidId = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/invalid/rfi-list/export?format=csv&locale=en',
      ),
      { params: Promise.resolve({ id: 'invalid' }) },
    )
    const invalidQuery = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/rfi-list/export?format=docx&locale=en',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(invalidId.status).toBe(400)
    expect(invalidQuery.status).toBe(400)
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
  })

  it('returns a correlated not-found response for a missing specification', async () => {
    routeState.getSpecificationById.mockResolvedValueOnce(null)
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/rfi-list/export/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/404/rfi-list/export?format=csv&locale=en',
      ),
      { params: Promise.resolve({ id: '404' }) },
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('X-Request-Id')).toBe('req')
    await expect(response.json()).resolves.toEqual({
      error: 'Specification not found',
    })
    expect(routeState.authorize).not.toHaveBeenCalled()
  })

  it('renders the Swedish PDF export with a localized attachment name', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.getSpecificationRfiList.mockResolvedValueOnce({ items: [{}] })
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/rfi-list/export/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/rfi-list/export?format=pdf&locale=sv',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Request-Id')).toBe('req')
    expect(routeState.renderPdfResponse).toHaveBeenCalledWith(
      expect.any(Object),
      'RFI-frågelista Spec\\Part "å" SPEC:1.pdf',
      { capacity: expect.objectContaining({ output: 'pdf' }) },
    )
    expect(routeState.getSpecificationRfiList).toHaveBeenCalledWith(
      { db: true },
      42,
      expect.objectContaining({ maxItems: 1 }),
    )
  })

  it('rejects an oversized PDF list before rendering', async () => {
    routeState.getApplicationSettings.mockResolvedValueOnce({
      pdfReportConcurrencyPerNode: 3,
      pdfReportMaxRequirements: 1,
      pdfReportTimeoutSeconds: 180,
    })
    routeState.getSpecificationRfiList.mockImplementationOnce(
      async (_db, _id, options) => {
        throw options.createItemLimitError(options.maxItems)
      },
    )
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/rfi-list/export/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/rfi-list/export?format=pdf&locale=en',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(422)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(routeState.renderPdfResponse).not.toHaveBeenCalled()
  })

  it('returns a correlated sanitized response when export authorization fails', async () => {
    routeState.authorize.mockRejectedValueOnce(
      new Error('authorization secret'),
    )
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/rfi-list/export/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/rfi-list/export?format=csv&locale=en',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(500)
    expect(response.headers.get('X-Request-Id')).toBe('req')
    expect(JSON.stringify(await response.json())).not.toContain(
      'authorization secret',
    )
    expect(routeState.getSpecificationRfiList).not.toHaveBeenCalled()
  })
})
