import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDeviationForReport } from '@/lib/reports/data/fetch-deviation'

function okJson(body: unknown) {
  return Promise.resolve({
    json: () => Promise.resolve(body),
    ok: true,
  } as Response)
}

describe('fetchDeviationForReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('trims and drops blank requirement package names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        const url = String(input)
        if (url.includes('/api/requirements/42')) {
          return okJson({
            uniqueId: 'REQ-42',
            versions: [
              {
                acceptanceCriteria: null,
                category: null,
                createdBy: null,
                description: 'Deviation target',
                id: 9,
                qualityCharacteristic: null,
                requiresTesting: false,
                priorityLevel: null,
                status: 3,
                statusColor: null,
                statusIconName: null,
                statusNameEn: 'Published',
                statusNameSv: 'Publicerad',
                type: null,
                verificationMethod: null,
                versionNormReferences: [],
                versionNumber: 1,
                versionRequirementPackages: [
                  { requirementPackage: { name: '  Mobile use  ' } },
                  { requirementPackage: { name: '' } },
                  { requirementPackage: { name: '   ' } },
                  { requirementPackage: null },
                ],
              },
            ],
          })
        }

        return okJson({
          deviations: [
            {
              createdAt: '2026-05-02T00:00:00.000Z',
              createdBy: 'reviewer',
              decision: null,
              id: 7,
              isReviewRequested: 1,
              motivation: 'Needs review',
              requirementVersionId: 9,
              specificationName: 'Spec',
              specificationUniqueId: 'SPEC',
            },
          ],
        })
      }),
    )

    const result = await fetchDeviationForReport(42, 77, 'sv')

    expect(result.version.requirementPackages).toEqual([{ name: 'Mobile use' }])
  })
})
