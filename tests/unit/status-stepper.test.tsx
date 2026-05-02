import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import StatusStepper from '@/components/StatusStepper'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/**
 * The active slider is the div whose inline `backgroundColor` matches the
 * configured active status color. JSDOM normalizes hex to rgb(r, g, b).
 */
function findActiveSlider(
  container: HTMLElement,
  expectedRgb: string,
): HTMLElement | undefined {
  return Array.from(container.querySelectorAll('div')).find(
    d => d.style.backgroundColor === expectedRgb,
  )
}

describe('StatusStepper', () => {
  it('renders fallback steps and highlights the first status', () => {
    const { container } = render(<StatusStepper currentStatusId={1} />)

    // Fallback shows publishing process: Draft, Review, Published
    expect(screen.getAllByText('Utkast')).toHaveLength(2)
    expect(screen.getByText('Granskning')).toBeInTheDocument()
    expect(screen.getByText('Publicerad')).toBeInTheDocument()
    expect(screen.queryByText('Arkiverad')).not.toBeInTheDocument()

    expect(findActiveSlider(container, 'rgb(59, 130, 246)')).toBeTruthy()
  })

  it('renders custom statuses in the order provided and highlights non-first statuses', () => {
    const statuses = [
      {
        id: 10,
        color: '#3b82f6',
        nameEn: 'Draft',
        nameSv: 'Utkast',
        sortOrder: 1,
      },
      {
        id: 20,
        color: '#eab308',
        nameEn: 'Review',
        nameSv: 'Granskning',
        sortOrder: 2,
      },
      { id: 30, color: '#22c55e', nameEn: 'Published', nameSv: 'Publicerad' },
    ]

    const { container } = render(
      <StatusStepper currentStatusId={20} statuses={statuses} />,
    )

    expect(container.textContent?.indexOf('Utkast')).toBeLessThan(
      container.textContent?.indexOf('Granskning') ?? Number.POSITIVE_INFINITY,
    )
    expect(container.textContent?.indexOf('Granskning')).toBeLessThan(
      container.textContent?.indexOf('Publicerad') ?? Number.POSITIVE_INFINITY,
    )

    expect(findActiveSlider(container, 'rgb(234, 179, 8)')).toBeTruthy()
    expect(screen.getAllByText('Granskning')).toHaveLength(2)
  })

  it('handles resize observer callbacks with native arguments', () => {
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

    const { container } = render(<StatusStepper currentStatusId={1} />)

    expect(resizeObserverCallback).not.toBeNull()

    act(() => {
      resizeObserverCallback?.([], {} as ResizeObserver)
    })

    expect(findActiveSlider(container, 'rgb(59, 130, 246)')).toBeTruthy()
  })

  it('renders no active highlight when the current status is unknown', () => {
    const { container } = render(<StatusStepper currentStatusId={999} />)

    expect(findActiveSlider(container, 'rgb(59, 130, 246)')).toBeUndefined()
    expect(screen.getByText('Utkast')).toBeInTheDocument()
  })

  it('exposes developer-mode metadata for the stepper and each status step', () => {
    const { container } = render(
      <StatusStepper
        currentStatusId={3}
        developerModeContext="requirements table > inline detail pane: REQ-123"
      />,
    )

    expect(
      container.querySelector('[data-developer-mode-name="status stepper"]'),
    ).toHaveAttribute(
      'data-developer-mode-context',
      'requirements table > inline detail pane: REQ-123',
    )
    expect(
      container.querySelector(
        '[data-developer-mode-name="status step"][data-developer-mode-value="draft"]',
      ),
    ).toBeInTheDocument()
    expect(
      container.querySelector(
        '[data-developer-mode-name="status step"][data-developer-mode-value="published"]',
      ),
    ).toBeInTheDocument()
  })

  it('overrides the Review label with Arkiveringsgranskning when isArchiving is true', () => {
    const archivingStatuses = [
      { id: 3, color: '#22c55e', nameEn: 'Published', nameSv: 'Publicerad' },
      { id: 2, color: '#eab308', nameEn: 'Review', nameSv: 'Granskning' },
      { id: 4, color: '#6b7280', nameEn: 'Archived', nameSv: 'Arkiverad' },
    ]

    render(
      <StatusStepper
        currentStatusId={2}
        isArchiving
        statuses={archivingStatuses}
      />,
    )

    expect(screen.getAllByText('Arkiveringsgranskning')).toHaveLength(2)
    expect(screen.queryByText('Granskning')).not.toBeInTheDocument()
  })

  it('keeps the Granskning label when isArchiving is false', () => {
    render(<StatusStepper currentStatusId={2} />)

    expect(screen.getAllByText('Granskning')).toHaveLength(2)
    expect(screen.queryByText('Arkiveringsgranskning')).not.toBeInTheDocument()
  })

  it('exposes role="group" and a translated aria-label (WCAG 4.1.2)', () => {
    render(<StatusStepper currentStatusId={1} />)
    expect(
      screen.getByRole('group', { name: 'statusStepperAriaLabel' }),
    ).toBeInTheDocument()
  })

  it('marks the active step with aria-current="step"', () => {
    const { container, rerender } = render(
      <StatusStepper currentStatusId={1} />,
    )
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1)

    rerender(<StatusStepper currentStatusId={3} />)
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1)
  })

  it('uses dark text on the bright-yellow active color (WCAG 1.4.3)', () => {
    const { container } = render(<StatusStepper currentStatusId={2} />)
    const slider = findActiveSlider(container, 'rgb(234, 179, 8)')
    // pickReadableTextOn('#eab308') -> '#111827' -> rgb(17, 24, 39)
    expect(slider?.style.color).toBe('rgb(17, 24, 39)')
  })

  it('uses white text on a dark active color (WCAG 1.4.3)', () => {
    const dark = [{ id: 1, color: '#1e3a8a', nameEn: 'Dark', nameSv: 'Mörk' }]
    const { container } = render(
      <StatusStepper currentStatusId={1} statuses={dark} />,
    )
    const slider = findActiveSlider(container, 'rgb(30, 58, 138)')
    expect(slider?.style.color).toBe('rgb(255, 255, 255)')
  })
})
