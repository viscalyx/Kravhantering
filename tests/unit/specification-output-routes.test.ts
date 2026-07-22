import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  authorize: vi.fn(),
  buildSpecificationProfileReport: vi.fn(),
  collectCompleteSpecificationOutputData: vi.fn(),
  collectSpecificationTraceabilityData: vi.fn(),
  createSpecificationCsvFormatter: vi.fn(),
  createRequirementsRestRuntime: vi.fn(),
  getApplicationSettings: vi.fn(),
  getSpecificationById: vi.fn(),
  visitSpecificationOutputPages: vi.fn(),
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

vi.mock('@/lib/dal/application-settings', () => ({
  getApplicationSettings: routeState.getApplicationSettings,
}))

vi.mock('@/lib/reports/data/specification-output', () => ({
  collectCompleteSpecificationOutputData:
    routeState.collectCompleteSpecificationOutputData,
  visitSpecificationOutputPages: routeState.visitSpecificationOutputPages,
}))

vi.mock('@/lib/reports/data/specification-traceability', () => ({
  collectSpecificationTraceabilityData:
    routeState.collectSpecificationTraceabilityData,
}))

vi.mock('@/lib/reports/specification-csv', () => ({
  createSpecificationCsvFormatter: routeState.createSpecificationCsvFormatter,
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
    routeState.collectCompleteSpecificationOutputData.mockResolvedValue(
      outputData(),
    )
    routeState.collectSpecificationTraceabilityData.mockResolvedValue({
      items: [{ itemRef: 'lib:31', uniqueId: 'BEH0001' }],
      specification: outputData().specification,
    })
    routeState.buildSpecificationProfileReport.mockReturnValue({
      sections: [{ type: 'notice', message: 'ok', severity: 'info' }],
    })
    routeState.getApplicationSettings.mockResolvedValue({
      csvExportConcurrencyPerNode: 5,
      csvExportMaxFileBytes: 100 * 1024 * 1024,
      csvExportMaxRequirements: 1000,
      csvExportTimeoutSeconds: 120,
    })
    routeState.createSpecificationCsvFormatter.mockReturnValue({
      headers: ['Krav-ID'],
      serializeRow: (item: { uniqueId: string }) => item.uniqueId,
    })
    routeState.visitSpecificationOutputPages.mockImplementation(
      async (_db, _id, visitPage) => {
        await visitPage([{ uniqueId: 'BEH0001' }], 1)
        return {
          itemCount: 1,
          pageCount: 1,
          specification: outputData().specification,
        }
      },
    )
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
    expect(
      routeState.collectCompleteSpecificationOutputData,
    ).toHaveBeenCalledWith({ db: true }, 42)
    expect(routeState.buildSpecificationProfileReport).toHaveBeenCalledWith(
      outputData(),
      'procurement',
      'sv',
    )
  })

  it('returns full CSV export for every lifecycle status', async () => {
    routeState.getSpecificationById.mockResolvedValueOnce(specification(3))
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
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Full CSV-export IAM SPEC-1.csv"',
    )
    expect(response.headers.get('Content-Length')).toBe('19')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Accel-Buffering')).toBe('no')
    expect(response.headers.get('X-Request-Id')).toBe('req')
    expect(response.headers.get('X-Correlation-Id')).toBe('corr')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Krav-ID\r\nBEH0001')
    expect(routeState.createSpecificationCsvFormatter).toHaveBeenCalledWith(
      'full',
      'sv',
    )
    expect(routeState.visitSpecificationOutputPages).toHaveBeenCalledWith(
      { db: true },
      42,
      expect.any(Function),
      expect.objectContaining({ maxItems: 1000 }),
    )
  })

  it('streams procurement CSV pages in stable visitor order', async () => {
    routeState.visitSpecificationOutputPages.mockImplementationOnce(
      async (_db, _id, visitPage) => {
        await visitPage([{ uniqueId: 'BEH0001' }], 1)
        await visitPage([{ uniqueId: 'BEH0101' }], 2)
        return {
          itemCount: 2,
          pageCount: 2,
          specification: outputData().specification,
        }
      },
    )
    const { GET } = await import(
      '@/app/api/requirements-specifications/[id]/exports/route'
    )

    const response = await GET(
      new NextRequest(
        'http://localhost/api/requirements-specifications/42/exports?profile=procurement&locale=en',
      ),
      { params: Promise.resolve({ id: '42' }) },
    )

    expect(response.status).toBe(200)
    const csvBytes = new Uint8Array(await response.arrayBuffer())
    const csv = new TextDecoder('utf-8').decode(csvBytes.slice(3))
    expect(csv).toBe('Krav-ID\r\nBEH0001\r\nBEH0101')
    expect(routeState.createSpecificationCsvFormatter).toHaveBeenCalledWith(
      'procurement',
      'en',
    )
  })

  it.each([
    { lifecycleStatusId: 1, profile: 'procurement' },
    { lifecycleStatusId: 3, profile: 'full' },
  ])(
    'allows $profile at the exact configured item limit',
    async ({ lifecycleStatusId, profile }) => {
      routeState.getSpecificationById.mockResolvedValueOnce(
        specification(lifecycleStatusId),
      )
      routeState.getApplicationSettings.mockResolvedValueOnce({
        csvExportConcurrencyPerNode: 5,
        csvExportMaxFileBytes: 100 * 1024 * 1024,
        csvExportMaxRequirements: 2,
        csvExportTimeoutSeconds: 120,
      })
      routeState.visitSpecificationOutputPages.mockImplementationOnce(
        async (_db, _id, visitPage) => {
          await visitPage([{ uniqueId: 'BEH0001' }, { uniqueId: 'BEH0002' }], 1)
          return {
            itemCount: 2,
            pageCount: 1,
            specification: outputData().specification,
          }
        },
      )
      const { GET } = await import(
        '@/app/api/requirements-specifications/[id]/exports/route'
      )

      const response = await GET(
        new NextRequest(
          `http://localhost/api/requirements-specifications/42/exports?profile=${profile}&locale=en`,
        ),
        { params: Promise.resolve({ id: '42' }) },
      )

      expect(response.status).toBe(200)
      const csvBytes = new Uint8Array(await response.arrayBuffer())
      expect(new TextDecoder('utf-8').decode(csvBytes.slice(3))).toBe(
        'Krav-ID\r\nBEH0001\r\nBEH0002',
      )
    },
  )

  it.each([
    { lifecycleStatusId: 1, profile: 'procurement' },
    { lifecycleStatusId: 3, profile: 'full' },
  ])(
    'rejects $profile at limit plus one before delivery',
    async ({ lifecycleStatusId, profile }) => {
      routeState.getSpecificationById.mockResolvedValueOnce(
        specification(lifecycleStatusId),
      )
      routeState.getApplicationSettings.mockResolvedValueOnce({
        csvExportConcurrencyPerNode: 5,
        csvExportMaxFileBytes: 100 * 1024 * 1024,
        csvExportMaxRequirements: 2,
        csvExportTimeoutSeconds: 120,
      })
      routeState.visitSpecificationOutputPages.mockImplementationOnce(
        async (_db, _id, _visitPage, options) => {
          throw options.createItemLimitError(options.maxItems)
        },
      )
      const { GET } = await import(
        '@/app/api/requirements-specifications/[id]/exports/route'
      )

      const response = await GET(
        new NextRequest(
          `http://localhost/api/requirements-specifications/42/exports?profile=${profile}&locale=en`,
        ),
        { params: Promise.resolve({ id: '42' }) },
      )

      expect(response.status).toBe(422)
      expect(response.headers.get('Content-Disposition')).toBeNull()
      await expect(response.json()).resolves.toMatchObject({
        code: 'output_limit_exceeded',
        details: { limit: 2, limitKind: 'items', output: 'csv' },
      })
    },
  )

  it.each([
    { lifecycleStatusId: 1, profile: 'procurement' },
    { lifecycleStatusId: 3, profile: 'full' },
  ])(
    'rejects $profile when the bounded file exceeds its byte limit',
    async ({ lifecycleStatusId, profile }) => {
      routeState.getSpecificationById.mockResolvedValueOnce(
        specification(lifecycleStatusId),
      )
      routeState.getApplicationSettings.mockResolvedValueOnce({
        csvExportConcurrencyPerNode: 5,
        csvExportMaxFileBytes: 8,
        csvExportMaxRequirements: 1000,
        csvExportTimeoutSeconds: 120,
      })
      const { GET } = await import(
        '@/app/api/requirements-specifications/[id]/exports/route'
      )

      const response = await GET(
        new NextRequest(
          `http://localhost/api/requirements-specifications/42/exports?profile=${profile}&locale=en`,
        ),
        { params: Promise.resolve({ id: '42' }) },
      )

      expect(response.status).toBe(422)
      expect(response.headers.get('Content-Disposition')).toBeNull()
      await expect(response.json()).resolves.toMatchObject({
        code: 'output_limit_exceeded',
        details: { limit: 8, limitKind: 'bytes', output: 'csv' },
      })
    },
  )

  it('removes the private spool after a successful specification download', async () => {
    const spoolBase = await mkdtemp(join(tmpdir(), 'specification-csv-test-'))
    const previousTempDirectory = process.env.KRAVHANTERING_EXPORT_TEMP_DIR
    process.env.KRAVHANTERING_EXPORT_TEMP_DIR = spoolBase
    try {
      const { GET } = await import(
        '@/app/api/requirements-specifications/[id]/exports/route'
      )
      const response = await GET(
        new NextRequest(
          'http://localhost/api/requirements-specifications/42/exports?profile=procurement&locale=en',
        ),
        { params: Promise.resolve({ id: '42' }) },
      )

      expect((await readdir(spoolBase)).length).toBe(1)
      await response.arrayBuffer()
      expect(await readdir(spoolBase)).toEqual([])
    } finally {
      if (previousTempDirectory == null) {
        delete process.env.KRAVHANTERING_EXPORT_TEMP_DIR
      } else {
        process.env.KRAVHANTERING_EXPORT_TEMP_DIR = previousTempDirectory
      }
      await rm(spoolBase, { force: true, recursive: true })
    }
  })

  it('returns a stable storage failure without falling back to memory', async () => {
    const previousTempDirectory = process.env.KRAVHANTERING_EXPORT_TEMP_DIR
    process.env.KRAVHANTERING_EXPORT_TEMP_DIR = join(
      tmpdir(),
      'missing-specification-csv-spool',
    )
    try {
      const { GET } = await import(
        '@/app/api/requirements-specifications/[id]/exports/route'
      )
      const response = await GET(
        new NextRequest(
          'http://localhost/api/requirements-specifications/42/exports?profile=procurement&locale=en',
        ),
        { params: Promise.resolve({ id: '42' }) },
      )

      expect(response.status).toBe(503)
      expect(response.headers.get('Content-Disposition')).toBeNull()
      await expect(response.json()).resolves.toMatchObject({
        code: 'temporary_storage_unavailable',
        details: { output: 'csv' },
      })
      expect(routeState.visitSpecificationOutputPages).not.toHaveBeenCalled()
    } finally {
      if (previousTempDirectory == null) {
        delete process.env.KRAVHANTERING_EXPORT_TEMP_DIR
      } else {
        process.env.KRAVHANTERING_EXPORT_TEMP_DIR = previousTempDirectory
      }
    }
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
    expect(routeState.getApplicationSettings).not.toHaveBeenCalled()
    expect(routeState.visitSpecificationOutputPages).not.toHaveBeenCalled()
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
