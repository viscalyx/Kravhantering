import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FormModal from '@/components/FormModal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

let restoreViewportScrolling: (() => void) | undefined

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
})
