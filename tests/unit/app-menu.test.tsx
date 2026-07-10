import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from '@/components/primitives/AppMenu'

const firstAction = vi.fn()
const disabledAction = vi.fn()

function TestMenu() {
  const [open, setOpen] = useState(false)

  return (
    <AppMenu onOpenChange={setOpen} open={open}>
      <AppMenuTrigger>
        <button type="button">Commands</button>
      </AppMenuTrigger>
      <AppMenuContent aria-label="Commands">
        <AppMenuItem onAction={firstAction}>First action</AppMenuItem>
        <AppMenuSeparator />
        <AppMenuItem disabled onAction={disabledAction}>
          Disabled action
        </AppMenuItem>
        <AppMenuItem>Last action</AppMenuItem>
      </AppMenuContent>
    </AppMenu>
  )
}

describe('AppMenu', () => {
  beforeEach(() => vi.clearAllMocks())

  it('owns menu relationships, keyboard movement, looping, and focus return', async () => {
    render(<TestMenu />)

    const trigger = screen.getByRole('button', { name: 'Commands' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls')

    trigger.focus()
    await userEvent.keyboard('{Enter}')

    const first = screen.getByRole('menuitem', { name: 'First action' })
    const last = screen.getByRole('menuitem', { name: 'Last action' })
    await waitFor(() => expect(first).toHaveFocus())

    await userEvent.keyboard('{ArrowUp}')
    expect(last).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(first).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(last).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('runs enabled actions and keeps disabled actions unavailable', async () => {
    render(<TestMenu />)

    const trigger = screen.getByRole('button', { name: 'Commands' })
    await userEvent.click(trigger)

    const disabled = screen.getByRole('menuitem', {
      name: 'Disabled action',
    })
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(disabled)
    expect(disabledAction).not.toHaveBeenCalled()

    await userEvent.click(
      screen.getByRole('menuitem', { name: 'First action' }),
    )
    expect(firstAction).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
