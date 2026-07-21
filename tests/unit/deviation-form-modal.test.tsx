import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DeviationFormModal from '@/components/DeviationFormModal'

const confirmDiscardChangesMock = vi.hoisted(() => vi.fn())

const translations: Record<string, Record<string, string>> = {
  common: {
    cancel: 'Avbryt',
    help: 'Hjälp',
    save: 'Spara',
    saving: 'Sparar',
  },
  deviation: {
    affectedRequirementIds: 'Berörda krav-ID:n',
    motivation: 'Motivering',
    motivationHelp: 'Beskriv varför avsteget behövs.',
    motivationPlaceholder: 'Beskriv avsteget',
    newDeviation: 'Registrera avsteg',
    requestDeviation: 'Begär ett avsteg',
    priorityLevel: 'Prioritet',
    priorityLevels: 'Prioriteter',
  },
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    translations[namespace]?.[key] ?? key,
}))

vi.mock('@/hooks/useDiscardChangesConfirmation', () => ({
  useDiscardChangesConfirmation: () => confirmDiscardChangesMock,
}))

describe('DeviationFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmDiscardChangesMock.mockResolvedValue(true)
  })

  it('submits motivation only after opening', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <DeviationFormModal onClose={vi.fn()} onSubmit={onSubmit} open={false} />,
    )

    rerender(
      <DeviationFormModal
        affectedRequirementIds={['BEH0001', 'KRAV0001']}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        open={true}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Begär ett avsteg' })
    const submitButton = within(dialog).getByRole('button', {
      name: 'Registrera avsteg',
    })

    expect(submitButton).toBeDisabled()
    expect(within(dialog).getByText('Berörda krav-ID:n')).toBeInTheDocument()
    expect(within(dialog).getByText('BEH0001')).toBeInTheDocument()
    expect(within(dialog).getByText('KRAV0001')).toBeInTheDocument()
    expect(
      within(dialog).queryByLabelText(/Kravunderlagsansvarig/),
    ).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/Begärt av/)).not.toBeInTheDocument()

    await user.type(
      within(dialog).getByLabelText(/Motivering/, { selector: 'textarea' }),
      '  Needs exception  ',
    )

    expect(submitButton).toBeEnabled()

    await user.click(submitButton)

    expect(onSubmit).toHaveBeenCalledWith('Needs exception')
  })

  it('renders resolved single and bulk priority identities without fallback dots', () => {
    const { rerender } = render(
      <DeviationFormModal
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        open
        priorityLevel={{
          code: 'P3',
          color: '#eab308',
          iconName: 'CircleAlert',
          id: 3,
          name: 'Medelhög',
          sortOrder: 3,
        }}
      />,
    )

    let dialog = screen.getByRole('dialog', { name: 'Begär ett avsteg' })
    expect(within(dialog).getByText('Prioritet')).toBeInTheDocument()
    const badge = within(dialog)
      .getByText('P3 – Medelhög')
      .closest('.status-badge')
    expect(badge).toHaveAttribute('data-accent-color', '#eab308')
    expect(badge?.querySelector('svg')).toBeTruthy()
    expect(
      dialog.querySelector('[data-developer-mode-name="priority identity"]'),
    ).toHaveAttribute('data-developer-mode-value', 'single')

    rerender(
      <DeviationFormModal
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        open
        priorityLevels={[
          {
            code: 'P2',
            color: '#22c55e',
            iconName: null,
            id: 2,
            name: '',
            sortOrder: 2,
          },
          {
            code: 'P4',
            color: '#f97316',
            iconName: 'ArrowUpRight',
            id: 4,
            name: 'Hög',
            sortOrder: 4,
          },
        ]}
      />,
    )

    dialog = screen.getByRole('dialog', { name: 'Begär ett avsteg' })
    expect(within(dialog).getByText('Prioriteter')).toBeInTheDocument()
    const badges = dialog.querySelectorAll('.status-badge')
    expect([...badges].map(item => item.textContent)).toEqual([
      'P2',
      'P4 – Hög',
    ])
    expect(badges[0]?.querySelector('svg')).toBeNull()
    expect(badges[1]?.querySelector('svg')).toBeTruthy()
  })

  it('confirms dirty cancel and ignores backdrop clicks', async () => {
    confirmDiscardChangesMock.mockResolvedValueOnce(false)
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <DeviationFormModal onClose={onClose} onSubmit={vi.fn()} open={true} />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Begär ett avsteg' })
    await user.type(
      within(dialog).getByLabelText(/Motivering/, { selector: 'textarea' }),
      'Needs exception',
    )

    const backdrop = document.body.querySelector(
      '.absolute.inset-0',
    ) as HTMLElement | null
    expect(backdrop).not.toBeNull()
    await user.click(backdrop as HTMLElement)
    expect(confirmDiscardChangesMock).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Avbryt' }))

    expect(confirmDiscardChangesMock).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
