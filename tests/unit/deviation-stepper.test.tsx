import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeviationStepper from '@/components/DeviationStepper'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DeviationStepper', () => {
  it('renders three step labels', () => {
    render(<DeviationStepper currentStep="draft" />)

    expect(screen.getAllByText('stepDraft')).toHaveLength(2)
    expect(screen.getByText('stepReviewRequested')).toBeInTheDocument()
    expect(screen.getByText('stepDecided')).toBeInTheDocument()
  })

  it('highlights the draft step with blue', () => {
    const { container } = render(<DeviationStepper currentStep="draft" />)

    const activeStep = container.querySelector('.text-white')
    expect(activeStep).toHaveStyle({ backgroundColor: '#3b82f6' })
  })

  it('highlights the review_requested step with yellow', () => {
    const { container } = render(
      <DeviationStepper currentStep="review_requested" />,
    )

    const activeStep = container.querySelector('.text-white')
    expect(activeStep).toHaveStyle({ backgroundColor: '#eab308' })
    expect(screen.getAllByText('stepReviewRequested')).toHaveLength(2)
  })

  it('highlights the decided step with green', () => {
    const { container } = render(<DeviationStepper currentStep="decided" />)

    const activeStep = container.querySelector('.text-white')
    expect(activeStep).toHaveStyle({ backgroundColor: '#22c55e' })
    expect(screen.getAllByText('stepDecided')).toHaveLength(2)
  })

  it('handles resize observer callbacks', () => {
    let resizeObserverCallback: ResizeObserverCallback | null = null

    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallback = callback
        }
        disconnect() {}
        observe() {}
        unobserve() {}
      },
    )

    const { container } = render(<DeviationStepper currentStep="draft" />)

    expect(resizeObserverCallback).toBeTruthy()
    expect(container.querySelector('.text-white')).toBeTruthy()
  })
})
