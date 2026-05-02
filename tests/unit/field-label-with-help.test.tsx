import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

describe('FieldLabelWithHelp', () => {
  it('links the label and toggles translatable help text accessibly', () => {
    render(
      <div>
        <FieldLabelWithHelp
          help="Use the short public name."
          htmlFor="display-name"
          label="Display name"
          required
        />
        <input id="display-name" />
      </div>,
    )

    expect(
      screen.getByRole('textbox', { name: 'Display name' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Use the short public name.')).toBeNull()

    const helpButton = screen.getByRole('button', {
      name: 'common.help: Display name',
    })
    expect(helpButton).toHaveAttribute('aria-controls', 'display-name-help')
    expect(helpButton).toHaveAttribute('aria-describedby', 'display-name-help')
    expect(helpButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(helpButton)

    expect(helpButton).toHaveAttribute('aria-expanded', 'true')
    const helpPanel = document.getElementById('display-name-help')
    expect(helpPanel).toHaveTextContent('Use the short public name.')
  })
})
