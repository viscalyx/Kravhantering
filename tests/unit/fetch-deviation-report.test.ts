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
                verifiable: false,
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
              specificationCode: 'SPEC',
              specificationName: 'Spec',
            },
          ],
        })
      }),
    )

    const result = await fetchDeviationForReport(42, 77, 'sv')

    expect(result.version.requirementPackages).toEqual([{ name: 'Mobile use' }])
  })

  it('keeps the complete priority identity from the requirement API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        if (String(input).includes('/api/requirements/42')) {
          return okJson({
            uniqueId: 'REQ-42',
            versions: [
              {
                acceptanceCriteria: null,
                category: null,
                createdBy: null,
                description: 'Deviation target',
                id: 9,
                priorityLevel: {
                  code: 'P2',
                  color: '#fde047',
                  iconName: 'CircleAlert',
                  id: 2,
                  nameEn: 'High',
                  nameSv: 'Hög',
                },
                qualityCharacteristic: null,
                status: 3,
                statusColor: null,
                statusIconName: null,
                statusNameEn: 'Published',
                statusNameSv: 'Publicerad',
                type: null,
                verifiable: false,
                verificationMethod: null,
                versionNormReferences: [],
                versionNumber: 1,
                versionRequirementPackages: [],
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
              specificationCode: 'SPEC',
              specificationName: 'Spec',
            },
          ],
        })
      }),
    )

    const result = await fetchDeviationForReport(42, 77, 'en')

    expect(result.version.priorityLevel).toEqual({
      code: 'P2',
      color: '#fde047',
      iconName: 'CircleAlert',
      nameEn: 'High',
      nameSv: 'Hög',
    })
  })
})
