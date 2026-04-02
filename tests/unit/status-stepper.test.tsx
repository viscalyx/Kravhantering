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

describe('StatusStepper', () => {
  it('renders fallback steps and highlights the first status', () => {
    const { container } = render(<StatusStepper currentStatusId={1} />)

    // Fallback shows publishing process: Draft, Review, Published
    expect(screen.getAllByText('Utkast')).toHaveLength(2)
    expect(screen.getByText('Granskning')).toBeInTheDocument()
    expect(screen.getByText('Publicerad')).toBeInTheDocument()
    expect(screen.queryByText('Arkiverad')).not.toBeInTheDocument()

    const activeStep = container.querySelector('.text-white')
    expect(activeStep).toHaveStyle({ backgroundColor: '#3b82f6' })
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

    const activeStep = container.querySelector('.text-white')
    expect(activeStep).toHaveStyle({ backgroundColor: '#eab308' })
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

    const activeStep = container.querySelector('.text-white')
    expect(activeStep).toHaveStyle({ backgroundColor: '#3b82f6' })
  })

  it('renders no active highlight when the current status is unknown', () => {
    const { container } = render(<StatusStepper currentStatusId={999} />)

    expect(container.querySelector('.text-white')).toBeNull()
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
})
