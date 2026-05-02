import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SuggestionStepper from '@/components/SuggestionStepper'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function findActiveSlider(
  container: HTMLElement,
  expectedRgb: string,
): HTMLElement | undefined {
  return Array.from(container.querySelectorAll('div')).find(
    d => d.style.backgroundColor === expectedRgb,
  )
}

describe('SuggestionStepper', () => {
  it('renders three step labels', () => {
    render(<SuggestionStepper currentStep="draft" />)

    expect(screen.getAllByText('stepDraft')).toHaveLength(2)
    expect(screen.getByText('stepReviewRequested')).toBeInTheDocument()
    expect(screen.getByText('stepResolved')).toBeInTheDocument()
  })

  it('highlights the draft step with blue', () => {
    const { container } = render(<SuggestionStepper currentStep="draft" />)

    const activeStep = findActiveSlider(container, 'rgb(59, 130, 246)')
    expect(activeStep).toHaveStyle({ backgroundColor: '#3b82f6' })
  })

  it('highlights the review_requested step with yellow', () => {
    const { container } = render(
      <SuggestionStepper currentStep="review_requested" />,
    )

    const activeStep = findActiveSlider(container, 'rgb(234, 179, 8)')
    expect(activeStep).toHaveStyle({ backgroundColor: '#eab308' })
    expect(activeStep?.style.color).toBe('rgb(17, 24, 39)')
    expect(screen.getAllByText('stepReviewRequested')).toHaveLength(2)
  })

  it('highlights the resolved step with green', () => {
    const { container } = render(<SuggestionStepper currentStep="resolved" />)

    const activeStep = findActiveSlider(container, 'rgb(34, 197, 94)')
    expect(activeStep).toHaveStyle({ backgroundColor: '#22c55e' })
    expect(screen.getAllByText('stepResolved')).toHaveLength(2)
  })

  it('exposes role="group" and a translated aria-label on the container (WCAG 4.1.2)', () => {
    render(<SuggestionStepper currentStep="draft" />)
    const group = screen.getByRole('group', { name: 'stepperAriaLabel' })
    expect(group).toBeInTheDocument()
  })

  it('marks the active step with aria-current="step"', () => {
    const { container, rerender } = render(
      <SuggestionStepper currentStep="draft" />,
    )
    let current = container.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)

    rerender(<SuggestionStepper currentStep="review_requested" />)
    current = container.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)

    rerender(<SuggestionStepper currentStep="resolved" />)
    current = container.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)
  })

  it('renders icons alongside step labels (WCAG 1.4.1 non-color cue)', () => {
    const { container } = render(<SuggestionStepper currentStep="draft" />)
    const icons = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(icons.length).toBeGreaterThanOrEqual(3)
  })
})
