import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RequirementAreaInfo from '@/components/RequirementAreaInfo'
import RequirementDetailCard from '@/components/RequirementDetailCard'
import RequirementDetailSections from '@/components/RequirementDetailSections'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const baseProps = {
  acceptanceCriteria: 'Acceptance',
  acceptanceCriteriaLabel: 'Acceptance label',
  description: 'Requirement text',
  descriptionLabel: 'Description label',
  emptyLabel: 'Nothing linked',
  verificationMethod: 'Inspect the result',
  verificationMethodLabel: 'Verification method',
  metadata: [{ id: 'area', label: 'Area', value: 'Security' }],
  references: [],
  referencesLabel: 'References',
  requirementPackages: [],
  requirementPackagesLabel: 'Packages',
}

describe('requirement detail presentation', () => {
  it('opens area description and owner information and dismisses it with Escape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          area: { description: 'Security requirements' },
        }),
      }),
    )
    render(
      <RequirementDetailSections
        {...baseProps}
        metadata={[
          {
            id: 'area',
            label: 'Area',
            value: (
              <RequirementAreaInfo
                areaId={7}
                name="Security"
                ownerName="Area owner"
              />
            ),
          },
        ]}
      />,
    )
    const button = screen.getByRole('button', { name: 'areaInfo' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(await screen.findByText('Security requirements')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: 'areaInfo' })).getByText(
        'Area owner',
      ),
    ).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('shows a read failure separately from an empty description and allows retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ area: { description: null } }),
      })
    vi.stubGlobal('fetch', fetchMock)
    render(<RequirementAreaInfo areaId={7} name="Security" ownerName={null} />)
    const button = screen.getByRole('button', { name: 'areaInfo' })
    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('areaInfoError')
    fireEvent.click(button)
    fireEvent.click(button)
    expect(await screen.findByText('areaDescriptionEmpty')).toBeVisible()
    expect(screen.getByText('noneAvailable')).toBeVisible()
    fireEvent.pointerDown(document.body)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the area loading state until its read settles and ignores a dismissed read', async () => {
    let finishRead!: (value: unknown) => void
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise(resolve => {
            finishRead = resolve
          }),
      ),
    )
    render(<RequirementAreaInfo areaId={7} name="Security" ownerName="Owner" />)
    const button = screen.getByRole('button', { name: 'areaInfo' })
    fireEvent.click(button)
    expect(screen.getByRole('status')).toHaveTextContent('areaInfoLoading')
    fireEvent.click(button)
    finishRead({
      ok: true,
      json: async () => ({ area: { description: 'Description' } }),
    })
    await Promise.resolve()
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('anchors information above a low trigger and keeps the opposite viewport edge automatic', () => {
    vi.stubGlobal('innerHeight', 900)
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 700,
      left: 200,
      right: 224,
      top: 700,
      bottom: 724,
      width: 24,
      height: 24,
      toJSON: () => ({}),
    })
    render(<RequirementAreaInfo areaId={7} name="Security" ownerName="Owner" />)
    fireEvent.click(screen.getByRole('button', { name: 'areaInfo' }))
    const panel = screen.getByRole('region', { name: 'areaInfo' })
    expect(panel).toHaveStyle({ top: 'auto', bottom: '208px', right: 'auto' })
    fireEvent.pointerDown(panel)
    expect(screen.getByRole('button', { name: 'areaInfo' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('presents the three primary texts before metadata, with verification shown once', () => {
    render(<RequirementDetailSections {...baseProps} />)
    expect(
      screen.getAllByRole('heading').map(heading => heading.textContent),
    ).toEqual([
      'Description label',
      'Acceptance label',
      'Verification method',
      'Area',
      'References',
      'Packages',
    ])
    expect(screen.getAllByText('Inspect the result')).toHaveLength(1)
  })

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
