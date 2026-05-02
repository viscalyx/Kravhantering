import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SuggestionPill from '@/components/SuggestionPill'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params && 'count' in params) return `${key}(${params.count})`
    return key
  },
}))

const baseSuggestion = {
  id: 1,
  content: 'Improve documentation',
  createdBy: 'Alice',
  createdAt: '2024-01-15T10:00:00Z',
  isReviewRequested: 0,
  resolution: null,
  resolutionMotivation: null,
  resolvedBy: null,
  resolvedAt: null,
}

describe('SuggestionPill', () => {
  it('renders draft state with PenLine icon, status chip, and role="status"', () => {
    const { container } = render(<SuggestionPill suggestion={baseSuggestion} />)

    expect(screen.getByText('suggestionSubmitted')).toBeInTheDocument()
    expect(screen.getByText('Improve documentation')).toBeInTheDocument()
    // Non-color cue (WCAG 1.4.1): draft shows the stepDraft label
    expect(screen.getByText('stepDraft')).toBeInTheDocument()
    // WCAG 4.1.3 status messages
    expect(container.querySelector('[role="status"]')).toBeTruthy()
    // Decorative icon present (WCAG 1.4.1)
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    // Color cue still applied
    expect(container.querySelector('.border-blue-200')).toBeTruthy()
  })

  it('renders review_requested state with statusPending chip', () => {
    const reviewRequested = { ...baseSuggestion, isReviewRequested: 1 }
    const { container } = render(
      <SuggestionPill suggestion={reviewRequested} />,
    )

    expect(screen.getByText('statusPending')).toBeInTheDocument()
    expect(container.querySelector('.border-yellow-200')).toBeTruthy()
  })

  it('renders resolved state with statusResolved chip', () => {
    const resolved = {
      ...baseSuggestion,
      resolution: 1,
      resolutionMotivation: 'Action taken',
      resolvedBy: 'Bob',
      resolvedAt: '2024-01-16T10:00:00Z',
    }
    const { container } = render(<SuggestionPill suggestion={resolved} />)

    expect(screen.getAllByText('statusResolved').length).toBeGreaterThanOrEqual(
      1,
    )
    expect(screen.getByText('Action taken')).toBeInTheDocument()
    expect(container.querySelector('.border-green-200')).toBeTruthy()
  })

  it('renders dismissed state with statusDismissed chip', () => {
    const dismissed = {
      ...baseSuggestion,
      resolution: 2,
      resolutionMotivation: 'Not applicable',
      resolvedBy: 'Bob',
      resolvedAt: '2024-01-16T10:00:00Z',
    }
    const { container } = render(<SuggestionPill suggestion={dismissed} />)

    expect(
      screen.getAllByText('statusDismissed').length,
    ).toBeGreaterThanOrEqual(1)
    expect(container.querySelector('.border-red-200')).toBeTruthy()
  })

  it('honors an explicit step prop override', () => {
    const { container } = render(
      <SuggestionPill step="review_requested" suggestion={baseSuggestion} />,
    )
    expect(container.querySelector('.border-yellow-200')).toBeTruthy()
    expect(screen.getByText('statusPending')).toBeInTheDocument()
  })
})
