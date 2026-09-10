import { describe, expect, it } from 'vitest'
import { BUSINESS_TEXT_MAX_LENGTH } from '@/lib/http/validation-constants'
import { DEFAULT_REQUIREMENT_IMPORT_BUDGET } from '@/lib/requirements/import-budget'
import {
  RequirementImportCandidateError,
  serializeRequirementImportCandidates,
} from '@/lib/requirements/import-candidates'
import { RequirementImportClientBudgetError } from '@/lib/requirements/import-client'

function review() {
  return {
    needsReferenceProposals: [],
    normReferences: [],
    proposals: [],
    rows: [
      {
        proposedNeedsReferenceKey: null as string | null,
        proposedNormReferenceKeys: [],
        selected: true,
        sourceIndex: 0,
        values: {
          description: 'Edited requirement',
          normReferenceIds: [],
          requirementPackageIds: [],
          verifiable: false,
        },
      },
    ],
  }
}

const budget = DEFAULT_REQUIREMENT_IMPORT_BUDGET

describe('requirement candidate file serialization', () => {
  it('rejects raw edited text above the canonical length limit instead of trimming away edits', () => {
    const candidateReview = review()
    candidateReview.rows[0].values.description = ` ${'x'.repeat(BUSINESS_TEXT_MAX_LENGTH)} `
    expect(() =>
      serializeRequirementImportCandidates(candidateReview, budget),
    ).toThrow('requirements[1].description')
    expect(candidateReview.rows[0].values.description).toHaveLength(
      BUSINESS_TEXT_MAX_LENGTH + 2,
    )
  })

  it('rejects UTF-8 files above the content limit even when every field and row fits the schema', () => {
    const candidateReview = review()
    candidateReview.rows = Array.from({ length: 500 }, (_, sourceIndex) => ({
      ...candidateReview.rows[0],
      sourceIndex,
      values: {
        ...candidateReview.rows[0].values,
        description: 'å'.repeat(4000),
        acceptanceCriteria: 'å'.repeat(4000),
        verificationMethod: 'å'.repeat(4000),
      },
    }))
    expect(() =>
      serializeRequirementImportCandidates(candidateReview, budget),
    ).toThrow(RequirementImportClientBudgetError)
  })

  it('identifies a missing needs proposal without discarding the association', () => {
    const candidateReview = review()
    candidateReview.rows[0].proposedNeedsReferenceKey = 'missing-need'
    expect(() =>
      serializeRequirementImportCandidates(candidateReview, budget),
    ).toThrow('requirements[1].needsReferenceKey (missing-need)')
  })

  it('does not export a resolved needs proposal after its association is removed', () => {
    const candidateReview = review()
    candidateReview.rows[0].proposedNeedsReferenceKey = 'resolved'
    const json = serializeRequirementImportCandidates(
      {
        ...candidateReview,
        needsReferenceProposals: [
          {
            key: 'resolved',
            text: 'Resolved need',
            resolvedNeedsReferenceId: 9,
          },
        ],
      },
      budget,
    )
    expect(JSON.parse(json)).toEqual({
      schemaVersion: 'requirement-import.v4',
      requirements: [
        {
          description: 'Edited requirement',
          normReferenceIds: [],
          requirementPackageIds: [],
          verifiable: false,
        },
      ],
    })
  })

  it('enforces proposal count and nested content depth budgets', () => {
    const candidateReview = review()
    candidateReview.rows[0].proposedNeedsReferenceKey = 'pending'
    const withProposal = {
      ...candidateReview,
      needsReferenceProposals: [
        {
          key: 'pending',
          text: 'Pending need',
          resolvedNeedsReferenceId: null,
        },
      ],
    }
    expect(() =>
      serializeRequirementImportCandidates(withProposal, {
        ...budget,
        maxProposedNeedsReferences: 0,
      }),
    ).toThrow('proposedNeedsReferences')
    expect(() =>
      serializeRequirementImportCandidates(withProposal, {
        ...budget,
        maxJsonDepth: 1,
      }),
    ).toThrow(RequirementImportCandidateError)
  })

  it('rejects an empty selection instead of producing an invalid file', () => {
    const candidateReview = review()
    candidateReview.rows[0].selected = false
    expect(() =>
      serializeRequirementImportCandidates(candidateReview, budget),
    ).toThrow('requirements')
  })
})
