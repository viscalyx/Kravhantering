import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useModalFocus } from '@/hooks/useModalFocus'

/**
 * Thin wrapper that wires `useModalFocus` to a minimal dialog.
 */
function TestModal({
  closeDisabled,
  onClose,
  open: initialOpen,
}: {
  closeDisabled?: boolean
  onClose?: () => void
  open?: boolean
}) {
  const [open, setOpen] = useState(initialOpen ?? false)
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = () => {
    onClose?.()
    setOpen(false)
  }

  const { handleKeyDown } = useModalFocus({
    closeDisabled,
    initialFocusRef: inputRef,
    modalRef,
    onClose: close,
    open,
  })

  return (
    <div>
      <button onClick={() => setOpen(true)} type="button">
        Open
      </button>
      {open && (
        <div
          data-testid="modal"
          onKeyDown={handleKeyDown}
          ref={modalRef}
          role="dialog"
        >
          <input data-testid="first" ref={inputRef} />
          <button data-testid="middle" type="button">
            Middle
          </button>
          <button data-testid="last" type="button">
            Last
          </button>
        </div>
      )}
    </div>
  )
}

describe('useModalFocus', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  it('focuses initialFocusRef on open', async () => {
    render(<TestModal />)

    await screen.getByRole('button', { name: 'Open' }).click()

    await waitFor(() => expect(screen.getByTestId('first')).toHaveFocus())
  })

  it('restores focus to trigger on close', async () => {
    const user = userEvent.setup()
    render(<TestModal />)
    const trigger = screen.getByRole('button', { name: 'Open' })

    await user.click(trigger)
    await waitFor(() => expect(screen.getByTestId('first')).toHaveFocus())

    // Press Escape to close
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' })

    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('calls onClose on Escape', async () => {
    const onClose = vi.fn()
    render(<TestModal onClose={onClose} open />)

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('suppresses Escape when closeDisabled is true', () => {
    const onClose = vi.fn()
    render(<TestModal closeDisabled onClose={onClose} open />)

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('traps Tab at the last element back to the first', () => {
    render(<TestModal open />)

    const last = screen.getByTestId('last')
    last.focus()

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab' })

    expect(screen.getByTestId('first')).toHaveFocus()
  })

  it('traps Shift+Tab at the first element back to the last', () => {
    render(<TestModal open />)

    const first = screen.getByTestId('first')
    first.focus()

    fireEvent.keyDown(screen.getByTestId('modal'), {
      key: 'Tab',
      shiftKey: true,
    })

    expect(screen.getByTestId('last')).toHaveFocus()
  })

  it('does not trap Tab for middle elements', () => {
    render(<TestModal open />)

    const middle = screen.getByTestId('middle')
    middle.focus()

    // Tab should not be prevented — the default browser behaviour proceeds
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    const prevented = !screen.getByTestId('modal').dispatchEvent(event)

    expect(prevented).toBe(false)
  })
})
