import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DeviationStepper from '@/components/DeviationStepper'
import { contrastRatio } from '@/lib/color-contrast'

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
    element => element.style.backgroundColor === expectedRgb,
  )
}

const STEP_CASES = [
  {
    background: '#3b82f6',
    backgroundRgb: 'rgb(59, 130, 246)',
    foreground: '#111827',
    label: 'stepDraft',
    step: 'draft',
  },
  {
    background: '#eab308',
    backgroundRgb: 'rgb(234, 179, 8)',
    foreground: '#111827',
    label: 'stepReviewRequested',
    step: 'review_requested',
  },
  {
    background: '#22c55e',
    backgroundRgb: 'rgb(34, 197, 94)',
    foreground: '#111827',
    label: 'stepDecided',
    step: 'decided',
  },
] as const

describe('DeviationStepper', () => {
  it('renders three step labels', () => {
    render(<DeviationStepper currentStep="draft" />)

    expect(screen.getAllByText('stepDraft')).toHaveLength(2)
    expect(screen.getByText('stepReviewRequested')).toBeInTheDocument()
    expect(screen.getByText('stepDecided')).toBeInTheDocument()
  })

  it.each(STEP_CASES)(
    'keeps the shipped $step background and renders readable text',
    ({ background, backgroundRgb, foreground, label, step }) => {
      const { container } = render(<DeviationStepper currentStep={step} />)

      const activeStep = findActiveSlider(container, backgroundRgb)
      expect(activeStep).toHaveStyle({
        backgroundColor: background,
        color: foreground,
      })
      expect(activeStep?.style.transition).toContain('color 300ms ease-out')
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
      expect(screen.getAllByText(label)).toHaveLength(2)
    },
  )

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
    expect(findActiveSlider(container, 'rgb(59, 130, 246)')).toBeTruthy()
  })

  it('exposes role="group" and a translated aria-label on the container (WCAG 4.1.2)', () => {
    render(<DeviationStepper currentStep="draft" />)
    const group = screen.getByRole('group', { name: 'stepperAriaLabel' })
    expect(group).toBeInTheDocument()
  })

  it('marks the active step with aria-current="step"', () => {
    const { container, rerender } = render(
      <DeviationStepper currentStep="draft" />,
    )
    let current = container.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)

    rerender(<DeviationStepper currentStep="review_requested" />)
    current = container.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)

    rerender(<DeviationStepper currentStep="decided" />)
    current = container.querySelectorAll('[aria-current="step"]')
    expect(current).toHaveLength(1)
  })

  it('renders icons alongside step labels (WCAG 1.4.1 non-color cue)', () => {
    const { container } = render(<DeviationStepper currentStep="draft" />)
    // Each of the 3 steps renders an icon in the inactive layer; the active
    // slider also renders one. Icons are aria-hidden SVGs.
    const icons = container.querySelectorAll('svg[aria-hidden="true"]')
    expect(icons.length).toBeGreaterThanOrEqual(3)
  })

  it('preserves developer-mode metadata for the stepper and every step', () => {
    const developerModeContext =
      'specification detail > deviation dialog: DEV-123'
    const { container } = render(
      <DeviationStepper
        currentStep="review_requested"
        developerModeContext={developerModeContext}
      />,
    )

    expect(
      container.querySelector('[data-developer-mode-name="deviation stepper"]'),
    ).toHaveAttribute('data-developer-mode-context', developerModeContext)

    const stepMarkers = Array.from(
      container.querySelectorAll('[data-developer-mode-name="deviation step"]'),
    )
    expect(stepMarkers).toHaveLength(3)
    expect(
      stepMarkers.map(marker =>
        marker.getAttribute('data-developer-mode-value'),
      ),
    ).toEqual(['draft', 'review_requested', 'decided'])
    for (const marker of stepMarkers) {
      expect(marker).toHaveAttribute(
        'data-developer-mode-name',
        'deviation step',
      )
      expect(marker).toHaveAttribute(
        'data-developer-mode-context',
        developerModeContext,
      )
    }
  })
})
