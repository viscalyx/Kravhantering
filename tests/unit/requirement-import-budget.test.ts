import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REQUIREMENT_IMPORT_BUDGET,
  getJsonDepth,
  REQUIREMENT_IMPORT_CONTENT_MAX_BYTES,
  REQUIREMENT_IMPORT_DATABASE_BATCH_SIZE,
  REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES,
  requirementImportBudgetFingerprint,
  validateImportContentBudget,
} from '@/lib/requirements/import-budget'

describe('requirement import budget', () => {
  it('defines the fixed application ceilings', () => {
    expect(REQUIREMENT_IMPORT_TRANSPORT_MAX_BYTES).toBe(10 * 1024 * 1024)
    expect(REQUIREMENT_IMPORT_CONTENT_MAX_BYTES).toBe(8 * 1024 * 1024)
    expect(REQUIREMENT_IMPORT_DATABASE_BATCH_SIZE).toBe(50)
    expect(DEFAULT_REQUIREMENT_IMPORT_BUDGET).toEqual({
      maxJsonDepth: 8,
      maxNestedItems: 200,
      maxProposedNeedsReferences: 500,
      maxProposedNormReferences: 500,
      maxRows: 500,
    })
  })

  it('counts objects and arrays as depth levels but not scalar values', () => {
    expect(getJsonDepth(null)).toBe(0)
    expect(getJsonDepth('value')).toBe(0)
    expect(getJsonDepth({})).toBe(1)
    expect(getJsonDepth({ requirements: [] })).toBe(2)
    expect(
      getJsonDepth({ requirements: [{ normReferenceIds: ['STD-1'] }] }),
    ).toBe(4)
  })

  it('rejects attacker-controlled nesting without recursive stack overflow', () => {
    let nested: unknown = 'leaf'
    for (let depth = 0; depth < 20_000; depth += 1) {
      nested = { nested }
    }

    expect(getJsonDepth(nested)).toBe(20_000)
    expect(
      validateImportContentBudget(
        { requirements: [{ nested }] },
        DEFAULT_REQUIREMENT_IMPORT_BUDGET,
      ),
    ).toContainEqual(
      expect.objectContaining({ code: 'import_json_depth_cap_exceeded' }),
    )
  })

  it('preserves the first largest nested collection path', () => {
    expect(
      validateImportContentBudget(
        {
          requirements: [{ first: [1, 2], second: [3, 4] }, { third: [5, 6] }],
        },
        { ...DEFAULT_REQUIREMENT_IMPORT_BUDGET, maxNestedItems: 1 },
      ),
    ).toContainEqual({
      actual: 2,
      code: 'import_nested_collection_cap_exceeded',
      limit: 1,
      path: '/requirements/0/first',
    })
  })

  it('accepts exact structural boundaries', () => {
    const budget = {
      maxJsonDepth: 4,
      maxNestedItems: 2,
      maxProposedNeedsReferences: 1,
      maxProposedNormReferences: 1,
      maxRows: 1,
    }

    expect(
      validateImportContentBudget(
        {
          proposedNeedsReferences: [{ key: 'NEED-1', text: 'Need' }],
          proposedNormReferences: [{ key: 'STD-1' }],
          requirements: [
            {
              normReferenceIds: ['STD-1', 'STD-2'],
              requirementPackageIds: [1, 2],
            },
          ],
        },
        budget,
      ),
    ).toEqual([])
  })

  it('reports every one-over structural dimension before normalization', () => {
    const budget = {
      maxJsonDepth: 3,
      maxNestedItems: 1,
      maxProposedNeedsReferences: 1,
      maxProposedNormReferences: 1,
      maxRows: 1,
    }

    expect(
      validateImportContentBudget(
        {
          proposedNeedsReferences: [{}, {}],
          proposedNormReferences: [{}, {}],
          requirements: [
            {
              normReferenceIds: ['duplicate', 'duplicate'],
            },
            {},
          ],
        },
        budget,
      ).map(issue => issue.code),
    ).toEqual([
      'import_row_count_cap_exceeded',
      'import_proposed_norm_reference_count_cap_exceeded',
      'import_proposed_needs_reference_count_cap_exceeded',
      'import_nested_collection_cap_exceeded',
      'import_json_depth_cap_exceeded',
    ])
  })

  it('fingerprints every effective budget dimension', () => {
    const base = requirementImportBudgetFingerprint(
      DEFAULT_REQUIREMENT_IMPORT_BUDGET,
    )
    for (const field of Object.keys(DEFAULT_REQUIREMENT_IMPORT_BUDGET) as Array<
      keyof typeof DEFAULT_REQUIREMENT_IMPORT_BUDGET
    >) {
      expect(
        requirementImportBudgetFingerprint({
          ...DEFAULT_REQUIREMENT_IMPORT_BUDGET,
          [field]: DEFAULT_REQUIREMENT_IMPORT_BUDGET[field] - 1,
        }),
      ).not.toBe(base)
    }
  })
})
