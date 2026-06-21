import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FormActionRow from '@/components/FormActionRow'

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

describe('FormActionRow', () => {
  it('renders the required-fields hint beside the action group by default', () => {
    const { container } = render(
      <FormActionRow>
        <button type="button">Save</button>
      </FormActionRow>,
    )

    const row = container.querySelector('[data-form-action-row="true"]')
    expect(row).toHaveClass('flex')
    expect(row).toHaveClass('flex-col')
    expect(row).toHaveClass('sm:flex-row')
    expect(row).toHaveClass('sm:justify-between')

    const hint = screen.getByText('common.requiredFieldsHint')
    expect(hint).toHaveClass('min-w-0')
    expect(hint).toHaveClass('flex-1')
    expect(hint).toHaveClass('wrap-break-word')

    const actions = row?.children[1]
    expect(actions).toHaveClass('flex')
    expect(actions).toHaveClass('flex-wrap')
    expect(actions).toHaveClass('items-center')
    expect(actions).toHaveClass('gap-3')
    expect(actions).toHaveClass('sm:ml-auto')
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('right-aligns only the action group when the hint is disabled', () => {
    const { container } = render(
      <FormActionRow hint={null}>
        <button type="button">Close</button>
      </FormActionRow>,
    )

    const row = container.querySelector('[data-form-action-row="true"]')
    expect(screen.queryByText('common.requiredFieldsHint')).toBeNull()
    expect(row?.children).toHaveLength(1)
    expect(row?.children[0]).toHaveClass('sm:ml-auto')
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('accepts custom row, action, and hint content', () => {
    const { container } = render(
      <FormActionRow
        actionsClassName="gap-2"
        className="pt-2"
        hint={<span>Custom hint</span>}
      >
        <button type="button">Save</button>
      </FormActionRow>,
    )

    const row = container.querySelector('[data-form-action-row="true"]')
    expect(row).toHaveClass('pt-2')
    expect(row?.children[0]).toHaveTextContent('Custom hint')
    expect(row?.children[1]).toHaveClass('gap-2')
  })
})
