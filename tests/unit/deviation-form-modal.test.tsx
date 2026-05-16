import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import DeviationFormModal from '@/components/DeviationFormModal'

const translations: Record<string, Record<string, string>> = {
  common: {
    cancel: 'Avbryt',
    help: 'Hjälp',
    save: 'Spara',
    saving: 'Sparar',
  },
  deviation: {
    motivation: 'Motivering',
    motivationHelp: 'Beskriv varför avsteget behövs.',
    motivationPlaceholder: 'Beskriv avsteget',
    newDeviation: 'Registrera avsteg',
    requestDeviation: 'Begär ett avsteg',
    riskLevel: 'Risknivå',
  },
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    translations[namespace]?.[key] ?? key,
}))

describe('DeviationFormModal', () => {
  it('submits motivation only after opening', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <DeviationFormModal onClose={vi.fn()} onSubmit={onSubmit} open={false} />,
    )

    rerender(
      <DeviationFormModal onClose={vi.fn()} onSubmit={onSubmit} open={true} />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Begär ett avsteg' })
    const submitButton = within(dialog).getByRole('button', {
      name: 'Registrera avsteg',
    })

    expect(submitButton).toBeDisabled()
    expect(
      within(dialog).queryByLabelText(/Ansvarig för kravställning/),
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
})
