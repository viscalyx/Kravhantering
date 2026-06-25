import { describe, expect, it, vi } from 'vitest'
import { validateRequirementTaxonomyReferences } from '@/lib/dal/requirement-reference-validation'

function createExecutor(missing: string[] = []) {
  const missingKeys = new Set(missing)
  const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
    const table = /FROM\s+([a-z_]+)/i.exec(sql)?.[1]
    if (!table) {
      throw new Error(`Could not resolve lookup table from SQL: ${sql}`)
    }

    return (parameters ?? [])
      .filter(id => !missingKeys.has(`${table}:${String(id)}`))
      .map(id => ({ id }))
  })

  return { executor: { query }, query }
}

describe('validateRequirementTaxonomyReferences', () => {
  it('normalizes and validates every requirement taxonomy reference', async () => {
    const { executor, query } = createExecutor()

    const result = await validateRequirementTaxonomyReferences(executor, {
      normReferenceIds: [11, 12, 11],
      qualityCharacteristicId: 4,
      requirementAreaId: 1,
      requirementCategoryId: 2,
      requirementPackageIds: [21, 22, 21],
      requirementTypeId: 3,
      priorityLevelId: 5,
    })

    expect(result).toEqual({
      normReferenceIds: [11, 12],
      qualityCharacteristicId: 4,
      requirementAreaId: 1,
      requirementCategoryId: 2,
      requirementPackageIds: [21, 22],
      requirementTypeId: 3,
      priorityLevelId: 5,
    })
    expect(query).toHaveBeenCalledTimes(7)
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      expect.stringContaining('FROM requirement_areas'),
      expect.stringContaining('FROM requirement_categories'),
      expect.stringContaining('FROM requirement_types'),
      expect.stringContaining('FROM quality_characteristics'),
      expect.stringContaining('FROM priority_levels'),
      expect.stringContaining('FROM norm_references'),
      expect.stringContaining('FROM requirement_packages'),
    ])
    expect(query.mock.calls[5]?.[1]).toEqual([11, 12])
    expect(query.mock.calls[6]?.[1]).toEqual([21, 22])
  })

  it('skips lookups for empty optional references', async () => {
    const { executor, query } = createExecutor()

    await expect(
      validateRequirementTaxonomyReferences(executor, {
        normReferenceIds: [],
        qualityCharacteristicId: null,
        requirementPackageIds: null,
      }),
    ).resolves.toEqual({
      normReferenceIds: [],
      qualityCharacteristicId: null,
      requirementAreaId: null,
      requirementCategoryId: null,
      requirementPackageIds: [],
      requirementTypeId: null,
      priorityLevelId: null,
    })
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    [
      'requirementAreaId',
      { requirementAreaId: 99 },
      ['requirement_areas:99'],
      'requirementAreaId references unknown requirement area id 99',
    ],
    [
      'requirementCategoryId',
      { requirementCategoryId: 99 },
      ['requirement_categories:99'],
      'requirementCategoryId references unknown requirement category id 99',
    ],
    [
      'requirementTypeId',
      { requirementTypeId: 99 },
      ['requirement_types:99'],
      'requirementTypeId references unknown requirement type id 99',
    ],
    [
      'qualityCharacteristicId',
      { qualityCharacteristicId: 99 },
      ['quality_characteristics:99'],
      'qualityCharacteristicId references unknown quality characteristic id 99',
    ],
    [
      'priorityLevelId',
      { priorityLevelId: 99 },
      ['priority_levels:99'],
      'priorityLevelId references unknown priority level id 99',
    ],
    [
      'normReferenceIds',
      { normReferenceIds: [99] },
      ['norm_references:99'],
      'normReferenceIds references unknown norm reference id 99',
    ],
    [
      'requirementPackageIds',
      { requirementPackageIds: [99] },
      ['requirement_packages:99'],
      'requirementPackageIds references unknown requirement package id 99',
    ],
  ])('rejects unknown %s values', async (_field, input, missing, message) => {
    const { executor } = createExecutor(missing)

    await expect(
      validateRequirementTaxonomyReferences(executor, input),
    ).rejects.toMatchObject({
      code: 'validation',
      message,
      status: 400,
    })
  })

  it('reports missing references in deterministic field order', async () => {
    const { executor } = createExecutor([
      'requirement_areas:1',
      'requirement_packages:7',
    ])

    await expect(
      validateRequirementTaxonomyReferences(executor, {
        requirementAreaId: 1,
        requirementPackageIds: [7],
      }),
    ).rejects.toMatchObject({
      message: 'requirementAreaId references unknown requirement area id 1',
    })
  })

  it('rejects non-positive direct DAL scalar inputs', async () => {
    const { executor, query } = createExecutor()

    await expect(
      validateRequirementTaxonomyReferences(executor, {
        requirementAreaId: 0,
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'requirementAreaId must be a positive integer',
    })
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects non-positive direct DAL array inputs', async () => {
    const { executor, query } = createExecutor()

    await expect(
      validateRequirementTaxonomyReferences(executor, {
        normReferenceIds: [1, -2],
      }),
    ).rejects.toMatchObject({
      code: 'validation',
      message: 'normReferenceIds must contain positive integer IDs',
    })
    expect(query).not.toHaveBeenCalled()
  })
})
