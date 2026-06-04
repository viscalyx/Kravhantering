import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FormModal from '@/components/FormModal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('FormModal', () => {
  afterEach(() => {
    document.body.style.overflow = ''
    document.body.style.overscrollBehavior = ''
    document.documentElement.style.overflow = ''
    document.documentElement.style.overscrollBehavior = ''
  })

  it('locks viewport scrolling while open and restores previous styles when closed', () => {
    document.body.style.overflow = 'clip'
    document.body.style.overscrollBehavior = 'auto'
    document.documentElement.style.overflow = 'scroll'
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

    expect(screen.getByRole('dialog', { name: 'Edit answer' })).toHaveClass(
      'overscroll-contain',
    )
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.body.style.overscrollBehavior).toBe('contain')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overscrollBehavior).toBe('contain')

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
    expect(document.body.style.overflow).toBe('clip')
    expect(document.body.style.overscrollBehavior).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('scroll')
    expect(document.documentElement.style.overscrollBehavior).toBe('auto')
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
})
