import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DeviationPill from '@/components/DeviationPill'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params && 'count' in params) return `${key}(${params.count})`
    return key
  },
}))

const baseDeviation = {
  id: 1,
  motivation: 'Test motivation text',
  createdBy: 'Alice',
  createdAt: '2024-01-15T10:00:00Z',
  isReviewRequested: 0,
  decision: null,
  decisionMotivation: null,
  decidedBy: null,
  decidedAt: null,
}

describe('DeviationPill', () => {
  it('renders pending deviation with amber styling', () => {
    const { container } = render(
      <DeviationPill history={[]} latest={baseDeviation} />,
    )

    expect(screen.getByText('deviationRequested')).toBeInTheDocument()
    expect(screen.getByText('Test motivation text')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()

    const pill = container.querySelector('.border-amber-200')
    expect(pill).toBeTruthy()
  })

  it('renders approved deviation with green styling', () => {
    const approved = {
      ...baseDeviation,
      decision: 1,
      decisionMotivation: 'Approved reason',
      decidedBy: 'Bob',
      decidedAt: '2024-01-16T10:00:00Z',
    }

    const { container } = render(
      <DeviationPill history={[]} latest={approved} />,
    )

    expect(screen.getByText('statusApproved')).toBeInTheDocument()
    expect(screen.getByText('Approved reason')).toBeInTheDocument()

    const pill = container.querySelector('.border-green-200')
    expect(pill).toBeTruthy()
  })

  it('renders rejected deviation with red styling', () => {
    const rejected = {
      ...baseDeviation,
      decision: 2,
      decisionMotivation: 'Rejected reason',
      decidedBy: 'Charlie',
      decidedAt: '2024-01-16T10:00:00Z',
    }

    const { container } = render(
      <DeviationPill history={[]} latest={rejected} />,
    )

    expect(screen.getByText('statusRejected')).toBeInTheDocument()
    expect(screen.getByText('Rejected reason')).toBeInTheDocument()

    const pill = container.querySelector('.border-red-200')
    expect(pill).toBeTruthy()
  })

  it('does not show history section when history is empty', () => {
    render(<DeviationPill history={[]} latest={baseDeviation} />)

    expect(screen.queryByText(/historyLabel/)).not.toBeInTheDocument()
  })

  it('shows history disclosure when history exists', async () => {
    const historyItem = {
      ...baseDeviation,
      id: 2,
      motivation: 'Old deviation',
      decision: 1,
      decisionMotivation: 'Previously approved',
      decidedBy: 'Dave',
      decidedAt: '2024-01-10T10:00:00Z',
    }

    render(<DeviationPill history={[historyItem]} latest={baseDeviation} />)

    const summary = screen.getByText('historyLabel(1)')
    expect(summary).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(summary)

    expect(screen.getByText('Old deviation')).toBeInTheDocument()
  })
})
