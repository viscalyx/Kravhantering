import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const routeState = vi.hoisted(() => ({
  createUiSettingsLoader: vi.fn(() => ({
    getColumnDefaults: vi.fn(),
    getTerminology: vi.fn(async () => ({})),
  })),
  createRequestContext: vi.fn(() => ({ actor: 'tester' })),
  createRequirementsService: vi.fn(),
  exportToCsv: vi.fn((headers: string[], data: unknown[]) => {
    void headers
    void data
    return 'csv-data'
  }),
  getRequestDatabase: vi.fn(() => ({ db: true })),
  queryCatalog: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getRequestDatabase: routeState.getRequestDatabase,
}))

vi.mock('@/lib/dal/ui-settings', () => ({
  createUiSettingsLoader: routeState.createUiSettingsLoader,
}))

vi.mock('@/lib/export-csv', () => ({
  exportToCsv: routeState.exportToCsv,
}))

vi.mock('@/lib/requirements/auth', () => ({
  createRequestContext: routeState.createRequestContext,
}))

vi.mock('@/lib/requirements/service', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/requirements/service')
  >('@/lib/requirements/service')

  return {
    ...actual,
    createRequirementsService: routeState.createRequirementsService,
  }
})

import { GET } from '@/app/api/requirements/route'

const CSV_EXPORT_CASES = [
  {
    description: 'locale is missing',
    url: 'https://example.test/api/requirements?format=csv',
  },
  {
    description: 'locale is invalid',
    url: 'https://example.test/api/requirements?format=csv&locale=de',
  },
] as const

describe('requirements route CSV locale fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    routeState.queryCatalog.mockResolvedValue({
      items: [
        {
          area: { name: 'Integration' },
          normReferenceIds: ['ISO/IEC 27001:2022'],
          normReferenceUris: ['https://www.iso.org/standard/27001'],
          uniqueId: 'REQ-1',
          version: {
            categoryNameEn: 'Business requirement',
            categoryNameSv: 'Business requirement sv',
            description: 'Support secure integration',
            requiresTesting: true,
            status: 1,
            statusColor: null,
            statusNameEn: 'Draft',
            statusNameSv: 'Draft sv',
            qualityCharacteristicNameEn: 'Security',
            qualityCharacteristicNameSv: 'Security sv',
            typeNameEn: 'Functional',
            typeNameSv: 'Functional sv',
            versionNumber: 2,
          },
        },
      ],
      pagination: {
        count: 1,
        hasMore: false,
        limit: 20,
        nextOffset: null,
        offset: 0,
        total: 1,
      },
    })

    routeState.createRequirementsService.mockReturnValue({
      manageRequirement: vi.fn(),
      queryCatalog: routeState.queryCatalog,
    })
  })

  it.each(
    CSV_EXPORT_CASES,
  )('defaults CSV exports to English when $description', async ({ url }) => {
    const response = await GET(new NextRequest(url))

    expect(routeState.queryCatalog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locale: 'en' }),
    )

    expect(routeState.exportToCsv).toHaveBeenCalledTimes(1)
    const firstExportCall = routeState.exportToCsv.mock.calls.at(0)

    expect(firstExportCall?.[0]).toEqual([
      'Requirement ID',
      'Requirement text',
      'Area',
      'Category',
      'Type',
      'Quality characteristic',
      'Risk level',
      'Status',
      'Verifiable',
      'Version',
      'Norm references',
      'Norm reference URI',
    ])
    expect(firstExportCall?.[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          'Norm reference URI': 'https://www.iso.org/standard/27001',
          'Norm references': 'ISO/IEC 27001:2022',
        }),
      ]),
    )
    expect(response.headers.get('Content-Disposition')).toContain(
      'requirements.csv',
    )
    expect(await response.text()).toBe('csv-data')
  })
})
