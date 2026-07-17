import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SpecificationDeviationRail from '@/app/[locale]/requirements/[id]/_detail/SpecificationDeviationRail'
import type { UseDeviationWorkflowResult } from '@/app/[locale]/requirements/[id]/_detail/use-deviation-workflow'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock(
  '@/app/[locale]/requirements/[id]/_detail/RequirementReportMenu',
  () => ({ default: () => null }),
)
vi.mock('@/components/DeviationDecisionModal', () => ({
  default: () => null,
}))
vi.mock('@/components/DeviationFormModal', () => ({ default: () => null }))

function workflow(deviationSaving: boolean): UseDeviationWorkflowResult {
  return {
    closeDialog: vi.fn(),
    deviationError: null,
    deviationHistory: [],
    deviationSaving,
    deviationStep: null,
    handleCreateDeviation: vi.fn(),
    handleDeleteDeviation: vi.fn(),
    handleEditDeviation: vi.fn(),
    handleRecordDecision: vi.fn(),
    handleRequestReview: vi.fn(),
    handleRevertToDraft: vi.fn(),
    latestDeviation: null,
    openCreateDialog: vi.fn(),
    openDecisionDialog: vi.fn(),
    openEditDialog: vi.fn(),
    showDecisionForm: false,
    showDeviationForm: false,
    showEditDeviationForm: false,
  }
}

describe('SpecificationDeviationRail', () => {
  it('disables unlink while a deviation mutation is pending', () => {
    const onRemoveFromSpecification = vi.fn()
    const { rerender } = render(
      <SpecificationDeviationRail
        canManageDeviationDrafts={false}
        canReviewDeviationDecisions={false}
        locale="en"
        onRemoveFromSpecification={onRemoveFromSpecification}
        priorityLevel={null}
        requirementId={7}
        specificationId={5}
        specificationItemId={31}
        workflow={workflow(false)}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'specification.unlinkLibraryRequirementAction',
      }),
    ).toBeEnabled()

    rerender(
      <SpecificationDeviationRail
        canManageDeviationDrafts={false}
        canReviewDeviationDecisions={false}
        locale="en"
        onRemoveFromSpecification={onRemoveFromSpecification}
        priorityLevel={null}
        requirementId={7}
        specificationId={5}
        specificationItemId={31}
        workflow={workflow(true)}
      />,
    )

    expect(
      screen.getByRole('button', {
        name: 'specification.unlinkLibraryRequirementAction',
      }),
    ).toBeDisabled()
  })
})
