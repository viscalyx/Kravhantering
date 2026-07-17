import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  authorize: vi.fn(),
  buildSpecificationCsv: vi.fn(),
  buildSpecificationProfileReport: vi.fn(),
  collectSpecificationTraceabilityData: vi.fn(),
  collectSpecificationOutputData: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  getSpecificationById: vi.fn(),
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

vi.mock('@/lib/reports/data/specification-output', () => ({
  collectSpecificationOutputData: routeState.collectSpecificationOutputData,
}))

vi.mock('@/lib/reports/data/specification-traceability', () => ({
  collectSpecificationTraceabilityData:
    routeState.collectSpecificationTraceabilityData,
}))

vi.mock('@/lib/reports/specification-csv', () => ({
  buildSpecificationCsv: routeState.buildSpecificationCsv,
}))

vi.mock('@/lib/reports/templates/specification-profile-template', () => ({
  buildSpecificationProfileReport: routeState.buildSpecificationProfileReport,
}))

function specification(lifecycleStatusId = 1) {
  return {
    id: 42,
    name: 'IAM',
    specificationCode: 'SPEC-1',
    specificationLifecycleStatusId: lifecycleStatusId,
  }
}

function outputData(lifecycleStatusId = 1) {
  return {
    items: [],
    specification: {
      ...specification(lifecycleStatusId),
      businessNeedsReference: null,
      governanceObjectType: null,
      implementationType: null,
      lifecycleStatus: null,
    },
  }
}

describe('specification output routes', () => {
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
    routeState.authorize.mockResolvedValue(undefined)
    routeState.getSpecificationById.mockResolvedValue(specification())
    routeState.collectSpecificationOutputData.mockResolvedValue(outputData())
    routeState.collectSpecificationTraceabilityData.mockResolvedValue({
      items: [{ itemRef: 'lib:31', uniqueId: 'BEH0001' }],
      specification: outputData().specification,
    })
    routeState.buildSpecificationProfileReport.mockReturnValue({
      sections: [{ type: 'notice', message: 'ok', severity: 'info' }],
    })
    routeState.buildSpecificationCsv.mockReturnValue('Krav-ID\r\nBEH0001')
  })

  it('returns a profile report model after specification authorization', async () => {
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/report-output/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/report-output?profile=procurement&locale=sv',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      sections: [{ type: 'notice', message: 'ok', severity: 'info' }],
    })
    expect(routeState.authorize).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'get_specification_items', specificationId: 42 },
      expect.anything(),
    )
    expect(routeState.collectSpecificationOutputData).toHaveBeenCalledWith(
      { db: true },
      42,
    )
    expect(routeState.buildSpecificationProfileReport).toHaveBeenCalledWith(
      outputData(),
      'procurement',
      'sv',
    )
  })

  it('returns full CSV export for every lifecycle status', async () => {
    routeState.getSpecificationById.mockResolvedValueOnce(specification(3))
    routeState.collectSpecificationOutputData.mockResolvedValueOnce(
      outputData(3),
    )
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/exports/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/exports?profile=full&locale=sv',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/csv')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Krav-ID\r\nBEH0001')
    expect(routeState.buildSpecificationCsv).toHaveBeenCalledWith(
      outputData(3),
      'full',
      'sv',
    )
  })

  it('blocks tender CSV outside procurement before collecting export data', async () => {
    routeState.getSpecificationById.mockResolvedValueOnce(specification(3))
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/exports/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/exports?profile=procurement&locale=en',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(409)
    expect(routeState.collectSpecificationOutputData).not.toHaveBeenCalled()
  })

  it('returns traceability items after specification authorization', async () => {
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/traceability-items/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/traceability-items?descriptionSearch=access&sortBy=priorityLevel&sortDirection=desc&locale=sv',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      items: [{ itemRef: 'lib:31', uniqueId: 'BEH0001' }],
      specification: outputData().specification,
    })
    expect(routeState.authorize).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'get_specification_items', specificationId: 42 },
      expect.anything(),
    )
    expect(
      routeState.collectSpecificationTraceabilityData,
    ).toHaveBeenCalledWith(
      { db: true },
      specification(),
      expect.objectContaining({
        descriptionSearch: 'access',
        locale: 'sv',
        sortBy: 'priorityLevel',
        sortDirection: 'desc',
      }),
    )
  })

  it('rejects unsupported traceability query keys before creating the route runtime', async () => {
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/traceability-items/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/traceability-items?refs=lib:31',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(400)
    expect(routeState.createRequirementsRestRuntime).not.toHaveBeenCalled()
    expect(
      routeState.collectSpecificationTraceabilityData,
    ).not.toHaveBeenCalled()
  })
})
