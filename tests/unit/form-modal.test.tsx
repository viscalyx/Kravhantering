import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ConfirmModalProvider,
  useConfirmModal,
} from '@/components/ConfirmModal'
import FormModal from '@/components/FormModal'
import RequirementPackagePurposeTooltip from '@/components/RequirementPackagePurposeTooltip'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

let restoreViewportScrolling: (() => void) | undefined

function StackedForms() {
  const [open, setOpen] = useState(false)
  const [child, setChild] = useState(false)
  const { confirm } = useConfirmModal()
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open form
      </button>
      <FormModal
        onClose={() => setOpen(false)}
        open={open}
        title="Parent"
        titleId="parent-title"
      >
        <button onClick={() => setChild(true)} type="button">
          Open child
        </button>
        <FormModal
          onClose={() => setChild(false)}
          open={child}
          title="Child"
          titleId="child-title"
        >
          <button
            onClick={() =>
              void confirm({ message: 'Discard?', variant: 'danger' })
            }
            type="button"
          >
            Discard
          </button>
        </FormModal>
      </FormModal>
    </>
  )
}

function NestedModalHarness() {
  const [open, setOpen] = useState(false)
  const { confirm } = useConfirmModal()
  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Open form
      </button>
      <FormModal
        onClose={() => setOpen(false)}
        open={open}
        title="Parent"
        titleId="parent-title"
      >
        <button
          onClick={() =>
            void confirm({ message: 'Discard?', variant: 'danger' })
          }
          type="button"
        >
          Discard
        </button>
      </FormModal>
    </>
  )
}

function ChangingControls({
  disabled = false,
  hidden = false,
  removed = false,
}) {
  const initialFocusRef = useRef<HTMLButtonElement>(null)
  return (
    <FormModal
      closeDisabled={disabled}
      initialFocusRef={initialFocusRef}
      onClose={() => {}}
      open
      showHeader={false}
      title="Saving"
      titleId="saving-title"
    >
      {!removed && (
        <button
          disabled={disabled}
          hidden={hidden}
          ref={initialFocusRef}
          type="button"
        >
          Save
        </button>
      )}
      <input type="hidden" />
      <fieldset disabled>
        <button type="button">Unavailable</button>
      </fieldset>
    </FormModal>
  )
}

function mockViewportScrolling(initialScrollTop: number) {
  const originalWindowScrollY = Object.getOwnPropertyDescriptor(
    window,
    'scrollY',
  )
  const originalHtmlScrollTop = Object.getOwnPropertyDescriptor(
    document.documentElement,
    'scrollTop',
  )
  let scrollTop = initialScrollTop

  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get: () => scrollTop,
  })
  Object.defineProperty(document.documentElement, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: value => {
      if (
        document.body.style.overflow === 'hidden' ||
        document.documentElement.style.overflow === 'hidden'
      ) {
        return
      }

      scrollTop = Number(value)
    },
  })

  return () => {
    if (originalWindowScrollY) {
      Object.defineProperty(window, 'scrollY', originalWindowScrollY)
    } else {
      Reflect.deleteProperty(window, 'scrollY')
    }

    if (originalHtmlScrollTop) {
      Object.defineProperty(
        document.documentElement,
        'scrollTop',
        originalHtmlScrollTop,
      )
    } else {
      Reflect.deleteProperty(document.documentElement, 'scrollTop')
    }
  }
}

describe('FormModal', () => {
  it('keeps a portalled description belonging to the active modal available', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <FormModal
        onClose={() => {}}
        open
        title="Packages"
        titleId="packages-title"
      >
        <RequirementPackagePurposeTooltip purposeAndScope="Package purpose">
          <button type="button">Selected package</button>
        </RequirementPackagePurposeTooltip>
      </FormModal>,
    )
    await user.click(screen.getByRole('button', { name: 'Selected package' }))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Package purpose')
    expect(tooltip.closest('[inert]')).toBeNull()
    expect(container).toHaveAttribute('inert')
  })

  it('gives a nested danger confirmation exclusive focus and restores each invoking control', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ConfirmModalProvider>
        <NestedModalHarness />
      </ConfirmModalProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Open form' })
    await user.click(trigger)
    const parent = screen.getByRole('dialog', { name: 'Parent' })
    const discard = screen.getByRole('button', { name: 'Discard' })
    await user.click(discard)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'cancel' })).toHaveFocus(),
    )
    expect(parent.closest('[inert]')).not.toBeNull()
    await user.tab()
    expect(screen.getByRole('button', { name: 'confirm' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'cancel' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(discard).toHaveFocus())
    expect(parent.closest('[inert]')).toBeNull()
    expect(container).toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(container).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
  })

  it.each(['disabled', 'hidden', 'removed'] as const)(
    'retains focus when the active control becomes %s',
    async change => {
      const user = userEvent.setup()
      const { rerender } = render(<ChangingControls />)
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus(),
      )
      rerender(<ChangingControls {...{ [change]: true }} />)
      const title = screen.getByRole('heading', { name: 'Saving' })
      await waitFor(() => expect(title).toHaveFocus())
      await user.tab()
      expect(title).toHaveFocus()
      await user.tab({ shift: true })
      expect(title).toHaveFocus()
      await user.keyboard('{Escape}')
      expect(title).toHaveFocus()
    },
  )

  it('restores pre-existing background state on unmount and focuses a surviving page destination', async () => {
    const background = document.createElement('aside')
    background.setAttribute('inert', '')
    background.setAttribute('aria-hidden', 'false')
    document.body.append(background)
    const { rerender } = render(
      <>
        <main>
          <h1>Workspace</h1>
        </main>
        <FormModal
          onClose={() => {}}
          open
          title="Dialog"
          titleId="unmount-title"
        >
          Content
        </FormModal>
      </>,
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Dialog' })).toHaveFocus(),
    )
    rerender(
      <main>
        <h1>Workspace</h1>
      </main>,
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Workspace' })).toHaveFocus(),
    )
    expect(background).toHaveAttribute('inert')
    expect(background).toHaveAttribute('aria-hidden', 'false')
    background.remove()
  })

  it('focuses its title and isolates the page without an explicit focus target', async () => {
    const { container } = render(
      <>
        <button type="button">Background action</button>
        <FormModal
          onClose={vi.fn()}
          open
          title="Compare"
          titleId="compare-title"
        >
          <button type="button">Compare versions</button>
        </FormModal>
      </>,
    )

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Compare' })).toHaveFocus(),
    )
    expect(container).toHaveAttribute('inert')
  })

  it('recovers focus when the active control is hidden with CSS', async () => {
    function Form({ hidden }: { hidden: boolean }) {
      const input = useRef<HTMLInputElement>(null)
      return (
        <FormModal
          initialFocusRef={input}
          onClose={vi.fn()}
          open
          title="Edit"
          titleId="edit-title"
        >
          <input
            aria-label="Name"
            ref={input}
            style={{ display: hidden ? 'none' : 'block' }}
          />
        </FormModal>
      )
    }
    const { rerender } = render(<Form hidden={false} />)
    expect(screen.getByRole('textbox')).toHaveFocus()
    rerender(<Form hidden />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Edit' })).toHaveFocus(),
    )
  })

  it('keeps a surviving child active when its parent closes first', () => {
    function Forms({ parent, child }: { parent: boolean; child: boolean }) {
      return (
        <>
          <button type="button">Page trigger</button>
          <FormModal
            onClose={vi.fn()}
            open={parent}
            title="Parent"
            titleId="parent-title"
          >
            <button type="button">Child trigger</button>
          </FormModal>
          <FormModal
            onClose={vi.fn()}
            open={child}
            title="Child"
            titleId="child-title"
          >
            <button type="button">Child action</button>
          </FormModal>
        </>
      )
    }
    const { rerender } = render(<Forms child={false} parent={false} />)
    const trigger = screen.getByRole('button', { name: 'Page trigger' })
    trigger.focus()
    rerender(<Forms child={false} parent />)
    screen.getByRole('button', { name: 'Child trigger' }).focus()
    rerender(<Forms child parent />)
    const childHeading = screen.getByRole('heading', { name: 'Child' })
    rerender(<Forms child parent={false} />)
    expect(childHeading).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<Forms child={false} parent={false} />)
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('isolates nested forms and confirmations and restores each keyboard trigger', async () => {
    const user = userEvent.setup()
    render(
      <StrictMode>
        <ConfirmModalProvider>
          <StackedForms />
        </ConfirmModalProvider>
      </StrictMode>,
    )
    const trigger = screen.getByRole('button', { name: 'Open form' })
    await user.click(trigger)
    expect(trigger.closest('[inert]')).not.toBeNull()
    const parent = screen.getByRole('dialog', { name: 'Parent' })
    const childTrigger = within(parent).getByRole('button', {
      name: 'Open child',
    })
    await user.click(childTrigger)
    expect(parent.closest('[inert]')).not.toBeNull()
    const child = screen.getByRole('dialog', { name: 'Child' })
    const discard = within(child).getByRole('button', { name: 'Discard' })
    await user.click(discard)
    const confirmation = screen.getByRole('alertdialog')
    expect(child.closest('[inert]')).not.toBeNull()
    expect(
      within(confirmation).getByRole('button', { name: 'cancel' }),
    ).toHaveFocus()
    await user.tab({ shift: true })
    expect(
      within(confirmation).getByRole('button', { name: 'confirm' }),
    ).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(discard).toHaveFocus()
    expect(child.closest('[inert]')).toBeNull()
    expect(parent.closest('[inert]')).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(childTrigger).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(trigger.closest('[inert]')).toBeNull()
  })

  it('preserves existing isolation and isolates background portals added while open', async () => {
    const background = document.createElement('div')
    background.setAttribute('inert', 'inert')
    document.body.append(background)
    const { unmount } = render(
      <FormModal onClose={vi.fn()} open title="Edit" titleId="edit-title">
        Content
      </FormModal>,
    )
    const latePortal = document.createElement('button')
    document.body.append(latePortal)
    await waitFor(() => expect(latePortal).toHaveAttribute('inert'))
    unmount()
    expect(background).toHaveAttribute('inert', 'inert')
    expect(latePortal).not.toHaveAttribute('inert')
    background.remove()
    latePortal.remove()
  })

  afterEach(() => {
    restoreViewportScrolling?.()
    restoreViewportScrolling = undefined
    document.body.style.overflow = ''
    document.body.style.overscrollBehavior = ''
    document.documentElement.style.overflow = ''
    document.documentElement.style.overscrollBehavior = ''
    vi.restoreAllMocks()
  })

  it('locks viewport scrolling while open and allows scrolling after close', () => {
    restoreViewportScrolling = mockViewportScrolling(240)
    document.body.style.overflow = 'auto'
    document.body.style.overscrollBehavior = 'auto'
    document.documentElement.style.overflow = 'auto'
    document.documentElement.style.overscrollBehavior = 'auto'

    const { rerender } = render(
      <FormModal
        onClose={vi.fn()}
        open
        title="Edit answer"
        titleId="edit-answer-title"
      >
        <button type="button">Focusable content</button>
      </FormModal>,
    )

    const openScrollY = window.scrollY

    expect(screen.getByRole('dialog', { name: 'Edit answer' })).toBeVisible()

    document.documentElement.scrollTop = openScrollY + 160
    expect(window.scrollY).toBe(openScrollY)

    rerender(
      <FormModal
        onClose={vi.fn()}
        open={false}
        title="Edit answer"
        titleId="edit-answer-title"
      >
        <button type="button">Focusable content</button>
      </FormModal>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    document.documentElement.scrollTop = openScrollY + 160
    expect(window.scrollY).toBe(openScrollY + 160)
  })

  it('can keep the accessible title while hiding the visible header controls', () => {
    render(
      <FormModal
        onClose={vi.fn()}
        open
        showHeader={false}
        title="Edit answer"
        titleId="edit-answer-title"
      >
        <button type="button">Focusable content</button>
      </FormModal>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Edit answer' })
    const title = screen.getByRole('heading', { name: 'Edit answer' })

    expect(dialog).toBeInTheDocument()
    expect(title).toHaveClass('sr-only')
    expect(
      screen.queryByRole('button', { name: 'close' }),
    ).not.toBeInTheDocument()
  })

  it('does not close when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <FormModal
        onClose={onClose}
        open
        title="Edit answer"
        titleId="edit-answer-title"
      >
        <button type="button">Focusable content</button>
      </FormModal>,
    )

    const backdrop = document.body.querySelector(
      '.absolute.inset-0',
    ) as HTMLElement | null
    expect(backdrop).not.toBeNull()

    fireEvent.click(backdrop as HTMLElement)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Edit answer' })).toBeVisible()
  })

  it('closes from the visible header control', () => {
    const onClose = vi.fn()
    render(
      <FormModal
        developerModeValue="answer form"
        onClose={onClose}
        open
        title="Edit answer"
        titleId="edit-answer-title"
      >
        Form content
      </FormModal>,
    )

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-developer-mode-value',
      'answer form',
    )
    fireEvent.click(screen.getByRole('button', { name: 'close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps the close control disabled while a form action is pending', () => {
    const onClose = vi.fn()
    render(
      <FormModal
        closeDisabled
        onClose={onClose}
        open
        title="Edit answer"
        titleId="edit-answer-title"
      >
        Form content
      </FormModal>,
    )

    const close = screen.getByRole('button', { name: 'close' })
    expect(close).toBeDisabled()
    fireEvent.click(close)
    expect(onClose).not.toHaveBeenCalled()
  })
})
