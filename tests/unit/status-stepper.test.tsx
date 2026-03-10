import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StatusStepper from '@/components/StatusStepper'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('StatusStepper', () => {
  it('renders fallback steps and highlights the first status', () => {
    const { container } = render(<StatusStepper currentStatusId={1} />)

    expect(screen.getAllByText('Utkast')).toHaveLength(2)
    expect(screen.getByText('Granskning')).toBeInTheDocument()
    expect(screen.getByText('Publicerad')).toBeInTheDocument()
    expect(screen.getByText('Arkiverad')).toBeInTheDocument()

    const activeStep = container.querySelector('.text-white')
    expect(activeStep).toHaveStyle({ backgroundColor: '#3b82f6' })
  })

  it('sorts custom statuses by sort order and highlights non-first statuses', () => {
    const statuses = [
      { id: 30, color: '#22c55e', nameEn: 'Published', nameSv: 'Publicerad' },
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

  it('renders no active highlight when the current status is unknown', () => {
    const { container } = render(<StatusStepper currentStatusId={999} />)

    expect(container.querySelector('.text-white')).toBeNull()
    expect(screen.getByText('Utkast')).toBeInTheDocument()
  })
})
