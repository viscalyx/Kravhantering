import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import FieldHelpButton from '@/components/FieldHelpButton'

describe('FieldHelpButton', () => {
  it('uses the shared target, ARIA, focus, and icon treatment', async () => {
    const onClick = vi.fn()
    const ref = createRef<HTMLButtonElement>()
    const user = userEvent.setup()
    const { rerender } = render(
      <FieldHelpButton
        controls="display-name-help"
        expanded={false}
        label="Help: Display name"
        onClick={onClick}
        ref={ref}
      />,
    )

    const button = screen.getByRole('button', {
      name: 'Help: Display name',
    })
    expect(ref.current).toBe(button)
    expect(button).toHaveAttribute('aria-controls', 'display-name-help')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).not.toHaveAttribute('aria-describedby')
    expect(button).toHaveClass(
      'min-h-6',
      'min-w-6',
      'focus-visible:ring-2',
      'focus-visible:ring-primary-500',
    )
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    await user.click(button)
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <FieldHelpButton
        controls="display-name-help"
        expanded
        label="Help: Display name"
        onClick={onClick}
        ref={ref}
      />,
    )
    expect(button).toHaveAttribute('aria-describedby', 'display-name-help')
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('keeps native disabled behavior', () => {
    render(
      <FieldHelpButton
        controls="display-name-help"
        disabled
        expanded={false}
        label="Help: Display name"
        onClick={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Help: Display name' }),
    ).toBeDisabled()
  })
})
