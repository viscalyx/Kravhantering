import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('shows workflow errors and opens the create dialog for eligible authors', async () => {
    const current = workflow(false)
    current.deviationError = 'Deviation failed'

    render(
      <SpecificationDeviationRail
        canManageDeviationDrafts
        canReviewDeviationDecisions={false}
        locale="en"
        priorityLevel={null}
        requirementId={7}
        specificationId={5}
        specificationItemId={31}
        workflow={current}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Deviation failed')
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.requestDeviation' }),
    )
    expect(current.openCreateDialog).toHaveBeenCalled()
  })

  it('offers edit, delete, and review actions for a draft deviation', async () => {
    const current = workflow(false)
    current.deviationStep = 'draft'

    render(
      <SpecificationDeviationRail
        canManageDeviationDrafts
        canReviewDeviationDecisions={false}
        locale="en"
        priorityLevel={null}
        requirementId={7}
        specificationId={5}
        specificationItemId={31}
        workflow={current}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.editDeviation' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.deleteDeviation' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.requestReview' }),
    )

    expect(current.openEditDialog).toHaveBeenCalled()
    expect(current.handleDeleteDeviation).toHaveBeenCalledOnce()
    expect(current.handleRequestReview).toHaveBeenCalled()
  })

  it('offers author and reviewer actions while a deviation awaits review', async () => {
    const current = workflow(false)
    current.deviationStep = 'review_requested'

    render(
      <SpecificationDeviationRail
        canManageDeviationDrafts
        canReviewDeviationDecisions
        locale="en"
        priorityLevel={null}
        requirementId={7}
        specificationId={5}
        specificationItemId={31}
        workflow={current}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.revertToDraft' }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'deviation.markDecided' }),
    )

    expect(current.handleRevertToDraft).toHaveBeenCalledOnce()
    expect(current.openDecisionDialog).toHaveBeenCalled()
  })

  it('passes the unlink button as the confirmation anchor', async () => {
    const onRemoveFromSpecification = vi.fn()
    render(
      <SpecificationDeviationRail
        canManageDeviationDrafts={false}
        canReviewDeviationDecisions={false}
        detailContext="requirement detail: REQ-7"
        locale="en"
        onRemoveFromSpecification={onRemoveFromSpecification}
        priorityLevel={null}
        requirementId={7}
        specificationId={5}
        specificationItemId={31}
        workflow={workflow(false)}
      />,
    )

    const button = screen.getByRole('button', {
      name: 'specification.unlinkLibraryRequirementAction',
    })
    await userEvent.click(button)

    expect(onRemoveFromSpecification).toHaveBeenCalledWith(button)
  })
})
