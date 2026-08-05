import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'

const baseProps = {
  acceptanceCriteria: 'Acceptance',
  acceptanceCriteriaLabel: 'Acceptance label',
  description: 'Requirement text',
  descriptionLabel: 'Description label',
  emptyLabel: 'Nothing linked',
  metadata: [{ id: 'area', label: 'Area', value: 'Security' }],
  references: [],
  referencesLabel: 'References',
  requirementPackages: [],
  requirementPackagesLabel: 'Packages',
}

describe('requirement detail presentation', () => {
  it('merges custom card classes while preserving card attributes', () => {
    const { rerender } = render(
      <RequirementDetailCard
        aria-label="Detail card"
        className="custom-card"
      />,
    )
    expect(screen.getByLabelText('Detail card')).toHaveClass(
      'relative',
      'custom-card',
    )

    rerender(<RequirementDetailCard aria-label="Plain detail card" />)
    expect(screen.getByLabelText('Plain detail card')).toHaveClass('relative')
  })

  it('renders linked and plain references with package metadata markers', () => {
    render(
      <RequirementDetailSections
        {...baseProps}
        developerModeContext="requirement detail"
        metadata={[
          ...baseProps.metadata,
          {
            id: 'status',
            label: 'Status',
            markerValue: 'lifecycle status',
            value: 'Published',
          },
        ]}
        references={[
          {
            href: 'https://example.test/norm',
            id: 1,
            label: 'Linked norm',
            markerContext: 'requirement reference',
            markerName: 'reference chip',
            markerValue: 'linked',
            title: 'Norm title',
          },
          { id: 2, label: 'Plain norm' },
        ]}
        requirementPackages={[
          {
            id: 3,
            label: 'Package one',
            markerContext: 'requirement package',
            markerName: 'package chip',
            markerValue: 'selected',
            purposeAndScope: 'Purpose and scope',
          },
          { id: 4, label: 'Package two' },
        ]}
      />,
    )

    expect(screen.getByRole('link', { name: 'Linked norm' })).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(screen.getByText('Plain norm').closest('li')).toHaveAttribute(
      'data-developer-mode-value',
      '2',
    )
    expect(screen.getByText('Package one')).toBeVisible()
    expect(screen.getByText('Package two')).toBeVisible()
  })

  it('renders empty states and can omit packages without marker context', () => {
    const { rerender } = render(<RequirementDetailSections {...baseProps} />)

    expect(screen.getAllByText('Nothing linked')).toHaveLength(2)
    expect(
      screen.getByText('Requirement text').parentElement,
    ).not.toHaveAttribute('data-developer-mode-context')

    rerender(
      <RequirementDetailSections
        {...baseProps}
        showRequirementPackages={false}
      />,
    )
    expect(screen.getAllByText('Nothing linked')).toHaveLength(1)
    expect(screen.queryByText('Packages')).not.toBeInTheDocument()
  })
})
