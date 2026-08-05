import { render, screen, within } from '@testing-library/react'
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
  it('renders accessible card content with native container attributes', () => {
    const { rerender } = render(
      <RequirementDetailCard
        aria-label="Detail card"
        className="custom-card"
        role="region"
      >
        <h2>Requirement details</h2>
      </RequirementDetailCard>,
    )

    expect(
      within(screen.getByRole('region', { name: 'Detail card' })).getByRole(
        'heading',
        { name: 'Requirement details' },
      ),
    ).toBeVisible()

    rerender(
      <RequirementDetailCard aria-label="Plain detail card" role="region">
        Requirement text
      </RequirementDetailCard>,
    )
    expect(
      screen.getByRole('region', { name: 'Plain detail card' }),
    ).toHaveTextContent('Requirement text')
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
