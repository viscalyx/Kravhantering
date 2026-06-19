import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  authorize: vi.fn(),
  buildSpecificationCsv: vi.fn(),
  buildSpecificationProfileReport: vi.fn(),
  collectSpecificationOutputData: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  getSpecificationById: vi.fn(),
  getSpecificationBySlug: vi.fn(),
}))

vi.mock('@/lib/requirements/server', () => ({
  createRequirementsRestRuntime: routeState.createRequirementsRestRuntime,
}))

vi.mock('@/lib/requirements/service-shared', () => ({
  authorize: routeState.authorize,
}))

vi.mock('@/lib/dal/requirements-specifications', () => ({
  getSpecificationById: routeState.getSpecificationById,
  getSpecificationBySlug: routeState.getSpecificationBySlug,
}))

vi.mock('@/lib/reports/data/specification-output', () => ({
  collectSpecificationOutputData: routeState.collectSpecificationOutputData,
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
    specificationLifecycleStatusId: lifecycleStatusId,
    uniqueId: 'SPEC-1',
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
    routeState.getSpecificationBySlug.mockResolvedValue(specification())
    routeState.collectSpecificationOutputData.mockResolvedValue(outputData())
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
        'http://localhost/api/requirements-specifications/SPEC-1/report-output?profile=procurement&locale=sv',
      ),
      { params: Promise.resolve({ id: 'SPEC-1' }) },
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
      'SPEC-1',
    )
    expect(routeState.buildSpecificationProfileReport).toHaveBeenCalledWith(
      outputData(),
      'procurement',
      'sv',
    )
  })

  it('returns full CSV export for every lifecycle status', async () => {
    routeState.getSpecificationBySlug.mockResolvedValueOnce(specification(3))
    routeState.collectSpecificationOutputData.mockResolvedValueOnce(
      outputData(3),
    )
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/exports/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/SPEC-1/exports?profile=full&locale=sv',
      ),
      { params: Promise.resolve({ id: 'SPEC-1' }) },
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
    routeState.getSpecificationBySlug.mockResolvedValueOnce(specification(3))
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/exports/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/SPEC-1/exports?profile=procurement&locale=en',
      ),
      { params: Promise.resolve({ id: 'SPEC-1' }) },
    )

    expect(response.status).toBe(409)
    expect(routeState.collectSpecificationOutputData).not.toHaveBeenCalled()
  })
})
