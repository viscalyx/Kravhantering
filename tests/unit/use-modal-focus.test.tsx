import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  type ReactNode,
  StrictMode,
  Suspense,
  startTransition,
  useRef,
  useState,
} from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

function DisabledTrapModal() {
  const modalRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)

  const { handleKeyDown } = useModalFocus({
    initialFocusRef: linkRef,
    modalRef,
    onClose: () => {},
    open: true,
  })

  return (
    <div
      data-testid="modal"
      onKeyDown={handleKeyDown}
      ref={modalRef}
      role="dialog"
    >
      <a data-testid="first-link" href="#first" ref={linkRef}>
        First
      </a>
      <button data-testid="last-enabled" type="button">
        Last enabled
      </button>
      <button data-testid="disabled-last" disabled type="button">
        Disabled
      </button>
    </div>
  )
}

function ExplicitReturnFocusModal() {
  const [open, setOpen] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const returnFocusRef = useRef<HTMLButtonElement>(null)

  const { handleKeyDown } = useModalFocus({
    initialFocusRef: inputRef,
    modalRef,
    onClose: () => setOpen(false),
    open,
    returnFocusRef,
  })

  return (
    <div>
      {!open ? (
        <button
          onClick={event => {
            returnFocusRef.current = event.currentTarget
            setOpen(true)
          }}
          ref={returnFocusRef}
          type="button"
        >
          Open explicit
        </button>
      ) : null}
      {open ? (
        <div
          data-testid="modal"
          onKeyDown={handleKeyDown}
          ref={modalRef}
          role="dialog"
        >
          <input data-testid="first" ref={inputRef} />
          <button data-testid="last" type="button">
            Last
          </button>
          <button data-testid="skipped" tabIndex={-1} type="button">
            Skipped
          </button>
        </div>
      ) : null}
    </div>
  )
}

function FocusTestDialog({ children }: { children?: ReactNode }) {
  const modalRef = useRef<HTMLDivElement>(null)
  const { handleKeyDown } = useModalFocus({
    modalRef,
    open: true,
    onClose: () => {},
  })
  return (
    <div
      aria-label="Focus test"
      onKeyDown={handleKeyDown}
      ref={modalRef}
      role="dialog"
    >
      {children}
    </div>
  )
}

describe('useModalFocus', () => {
  it('does not reset keyboard focus when the opening animation frame runs late', async () => {
    let frame: FrameRequestCallback = () => {}
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback
      return 1
    })
    const user = userEvent.setup()
    render(<TestModal />)
    await user.click(screen.getByRole('button', { name: 'Open' }))
    await user.tab()
    expect(screen.getByRole('button', { name: 'Middle' })).toHaveFocus()
    frame(0)
    expect(screen.getByRole('button', { name: 'Middle' })).toHaveFocus()
  })

  it('contains focus in an empty dialog, including programmatic attempts to focus the background', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <>
        <button type="button">Background</button>
        <FocusTestDialog />
      </>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Focus test' })
    expect(dialog).toHaveFocus()
    await user.tab()
    expect(dialog).toHaveFocus()
    await user.tab({ shift: true })
    expect(dialog).toHaveFocus()
    container.querySelector('button')?.focus()
    expect(dialog).toHaveFocus()
  })

  it('restores interaction after Strict Mode effect replay and close', async () => {
    const user = userEvent.setup()
    render(<button type="button">Launch dialog</button>)
    const trigger = screen.getByRole('button', { name: 'Launch dialog' })
    trigger.focus()
    render(
      <StrictMode>
        <TestModal open />
      </StrictMode>,
    )
    trigger.focus()
    expect(screen.getByTestId('first')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByTestId('last')).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
    expect(trigger.closest('[inert]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('focuses initialFocusRef on open', async () => {
    const user = userEvent.setup()
    render(<TestModal />)

    await user.click(screen.getByRole('button', { name: 'Open' }))

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

  it('keeps committed Escape options while a transition is suspended', async () => {
    const onClose = vi.fn()
    const suspend = vi.fn(() => {
      throw new Promise(() => {})
    })
    function Dialog({ pending }: { pending: boolean }) {
      const modalRef = useRef<HTMLDivElement>(null)
      useModalFocus({ modalRef, open: true, onClose, closeDisabled: pending })
      if (pending) suspend()
      return <div ref={modalRef} role="dialog" />
    }
    const view = (pending: boolean) => (
      <Suspense>
        <Dialog pending={pending} />
      </Suspense>
    )
    const { rerender } = render(view(false))
    await act(async () => {
      startTransition(() => rerender(view(true)))
    })
    expect(suspend).toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
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

  it('wraps at the checked radio and keeps unchecked groups with a different form owner reachable', () => {
    render(
      <FocusTestDialog>
        <form>
          <input aria-label="Before" name="choice" type="radio" />
          <input
            aria-label="Selected"
            defaultChecked
            name="choice"
            type="radio"
          />
          <input aria-label="After" name="choice" type="radio" />
        </form>
        <form>
          <input aria-label="Unselected group" name="choice" type="radio" />
        </form>
      </FocusTestDialog>,
    )
    const selected = screen.getByRole('radio', { name: 'Selected' })
    const other = screen.getByRole('radio', { name: 'Unselected group' })
    expect(selected).toHaveFocus()
    fireEvent.keyDown(selected, { key: 'Tab', shiftKey: true })
    expect(other).toHaveFocus()
    fireEvent.keyDown(other, { key: 'Tab' })
    expect(selected).toHaveFocus()
    other.setAttribute('disabled', '')
    expect(fireEvent.keyDown(selected, { key: 'Tab' })).toBe(false)
    expect(selected).toHaveFocus()
  })

  it('wraps at the boundaries of the browser tab order with positive tabindex values', async () => {
    const user = userEvent.setup()
    render(<TestModal open />)
    const first = screen.getByRole('button', { name: 'Middle' })
    const last = screen.getByRole('textbox')
    first.tabIndex = 1
    screen.getByRole('button', { name: 'Last' }).tabIndex = 2
    last.focus()
    await user.tab()
    expect(first).toHaveFocus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
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

  it('cancels scheduled initial focus when closing before RAF runs', async () => {
    const user = userEvent.setup()
    const rafCallbacks = new Map<number, FrameRequestCallback>()
    const requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      const id = rafCallbacks.size + 1
      rafCallbacks.set(id, cb)
      return id
    })
    const cancelAnimationFrame = vi.fn((id: number) => {
      rafCallbacks.delete(id)
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    render(<TestModal />)

    await user.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' })

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(rafCallbacks.size).toBe(0)
  })

  it('traps focus across links and ignores disabled controls', () => {
    render(<DisabledTrapModal />)

    const first = screen.getByTestId('first-link')
    const last = screen.getByTestId('last-enabled')
    first.focus()

    fireEvent.keyDown(screen.getByTestId('modal'), {
      key: 'Tab',
      shiftKey: true,
    })

    expect(last).toHaveFocus()

    last.focus()
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab' })

    expect(first).toHaveFocus()
  })

  it('restores focus to an explicit return ref after the trigger remounts', async () => {
    const user = userEvent.setup()
    render(<ExplicitReturnFocusModal />)

    await user.click(screen.getByRole('button', { name: 'Open explicit' }))
    await waitFor(() => expect(screen.getByTestId('first')).toHaveFocus())

    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Escape' })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open explicit' }),
      ).toHaveFocus(),
    )
  })

  it('excludes controls with tabIndex -1 from the focus trap', async () => {
    const user = userEvent.setup()
    render(<ExplicitReturnFocusModal />)

    await user.click(screen.getByRole('button', { name: 'Open explicit' }))
    await waitFor(() => expect(screen.getByTestId('first')).toHaveFocus())

    screen.getByTestId('last').focus()
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab' })

    expect(screen.getByTestId('first')).toHaveFocus()
  })
})
