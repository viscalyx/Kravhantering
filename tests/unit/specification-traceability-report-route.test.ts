import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authorizeSpecificationReportRead: vi.fn(),
  collectSpecificationTraceabilityData: vi.fn(),
  renderReportModelPdfResponse: vi.fn(() => new Response('pdf')),
}))

vi.mock('@/app/[locale]/requirements/reports/pdf/route-helpers', () => ({
  authorizeSpecificationReportRead: mocks.authorizeSpecificationReportRead,
  createReportRuntime: vi.fn(async () => ({
    authorization: {},
    context: {},
    db: {},
  })),
  reportErrorResponse: vi.fn(() => new Response('error', { status: 500 })),
  resolveReportSpecification: vi.fn(async () => ({
    id: 7,
    name: 'Specification',
    specificationCode: 'SPEC-7',
  })),
}))
vi.mock('@/components/reports/pdf/report-response', () => ({
  renderReportModelPdfResponse: mocks.renderReportModelPdfResponse,
}))
vi.mock('@/lib/reports/data/specification-traceability', () => ({
  collectSpecificationTraceabilityData:
    mocks.collectSpecificationTraceabilityData,
}))
vi.mock('@/lib/reports/report-labels', () => ({
  getReportLabels: () => ({ filenames: { traceability: 'Traceability' } }),
}))
vi.mock('@/lib/reports/templates/specification-traceability-template', () => ({
  buildSpecificationTraceabilityReport: () => ({}),
}))

import { GET } from '@/app/[locale]/specifications/[specificationId]/reports/pdf/traceability/route'

describe('specification traceability PDF route', () => {
  it('uses the route locale when the query supplies a conflicting locale', async () => {
    mocks.collectSpecificationTraceabilityData.mockResolvedValueOnce({
      specification: {
        name: 'Specification',
        specificationCode: 'SPEC-7',
      },
    })
    const request = new NextRequest(
      'http://localhost/sv/specifications/7/reports/pdf/traceability?locale=en',
    )

    const response = await GET(request, {
      params: Promise.resolve({ locale: 'sv', specificationId: '7' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.collectSpecificationTraceabilityData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 7 }),
      expect.objectContaining({ locale: 'sv' }),
    )
  })
})
