import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SuggestionFormModal from '@/components/SuggestionFormModal'
import SuggestionResolutionModal from '@/components/SuggestionResolutionModal'

const confirmDiscardChangesMock = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/useDiscardChangesConfirmation', () => ({
  useDiscardChangesConfirmation: () => confirmDiscardChangesMock,
}))

describe('SuggestionFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmDiscardChangesMock.mockResolvedValue(true)
  })

  it('opens with initial values, exposes field help, and submits trimmed changes', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <SuggestionFormModal
        onClose={vi.fn()}
        onSubmit={onSubmit}
        open={false}
      />,
    )

    rerender(
      <SuggestionFormModal
        initialContent="Original suggestion"
        initialCreatedBy="Alice"
        onClose={vi.fn()}
        onSubmit={onSubmit}
        open
        title="Edit suggestion"
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Edit suggestion' })
    const content = within(dialog).getByLabelText(/content/, {
      selector: 'textarea',
    })
    const createdBy = within(dialog).getByLabelText(/createdBy/, {
      selector: 'input',
    })
    const save = within(dialog).getByRole('button', { name: 'save' })

    expect(content).toHaveValue('Original suggestion')
    expect(createdBy).toHaveValue('Alice')
    expect(save).toBeDisabled()

    const contentHelp = within(dialog).getByRole('button', {
      name: 'help: content',
    })
    await user.click(contentHelp)
    expect(contentHelp).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByText('contentHelp')).toBeInTheDocument()
    await user.click(contentHelp)
    expect(contentHelp).toHaveAttribute('aria-expanded', 'false')

    const createdByHelp = within(dialog).getByRole('button', {
      name: 'help: createdBy',
    })
    await user.click(createdByHelp)
    expect(within(dialog).getByText('createdByHelp')).toBeInTheDocument()

    await user.clear(content)
    await user.type(content, '  Improved wording  ')
    await user.clear(createdBy)
    await user.type(createdBy, '  Bob  ')
    expect(save).toBeEnabled()

    await user.click(save)
    expect(onSubmit).toHaveBeenCalledWith('Improved wording', 'Bob')
  })

  it('closes a clean form directly and confirms before discarding edits', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SuggestionFormModal onClose={onClose} onSubmit={vi.fn()} open />)

    const dialog = screen.getByRole('dialog', { name: 'newSuggestion' })
    const cancel = within(dialog).getByRole('button', { name: 'cancel' })
    await user.click(cancel)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(confirmDiscardChangesMock).not.toHaveBeenCalled()

    await user.type(
      within(dialog).getByLabelText(/content/, { selector: 'textarea' }),
      'Changed',
    )
    confirmDiscardChangesMock.mockResolvedValueOnce(false)
    await user.click(cancel)
    expect(confirmDiscardChangesMock).toHaveBeenCalledWith(cancel)
    expect(onClose).toHaveBeenCalledTimes(1)

    confirmDiscardChangesMock.mockResolvedValueOnce(true)
    await user.click(cancel)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('disables closing and submission while saving', async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <SuggestionFormModal
        initialContent="Ready"
        loading
        onClose={onClose}
        onSubmit={onSubmit}
        open
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'newSuggestion' })
    expect(
      within(dialog).getByRole('button', { name: 'saving' }),
    ).toBeDisabled()
    const cancel = within(dialog).getByRole('button', { name: 'cancel' })
    expect(cancel).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('SuggestionResolutionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmDiscardChangesMock.mockResolvedValue(true)
  })

  it('requires both text fields and submits a trimmed dismissal', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <SuggestionResolutionModal onClose={vi.fn()} onSubmit={onSubmit} open />,
    )

    const dialog = screen.getByRole('dialog', { name: 'recordResolution' })
    const submit = within(dialog).getByRole('button', {
      name: 'recordResolution',
    })
    expect(within(dialog).getByRole('radio', { name: 'resolve' })).toBeChecked()
    expect(submit).toBeDisabled()

    await user.click(within(dialog).getByRole('radio', { name: 'dismiss' }))
    await user.click(within(dialog).getByRole('radio', { name: 'resolve' }))
    await user.click(within(dialog).getByRole('radio', { name: 'dismiss' }))
    await user.type(
      within(dialog).getByLabelText(/resolutionMotivation/, {
        selector: 'textarea',
      }),
      '  Duplicate request  ',
    )
    expect(submit).toBeDisabled()
    await user.type(
      within(dialog).getByLabelText(/resolvedBy/, { selector: 'input' }),
      '  Reviewer  ',
    )
    expect(submit).toBeEnabled()

    await user.click(submit)
    expect(onSubmit).toHaveBeenCalledWith(2, 'Duplicate request', 'Reviewer')
  })

  it('toggles help and protects dirty work on cancel and Escape', async () => {
    confirmDiscardChangesMock
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <SuggestionResolutionModal onClose={onClose} onSubmit={vi.fn()} open />,
    )

    const dialog = screen.getByRole('dialog', { name: 'recordResolution' })
    const motivationHelp = within(dialog).getByRole('button', {
      name: 'help: resolutionMotivation',
    })
    await user.click(motivationHelp)
    expect(
      within(dialog).getByText('resolutionMotivationHelp'),
    ).toBeInTheDocument()
    await user.click(motivationHelp)
    expect(motivationHelp).toHaveAttribute('aria-expanded', 'false')

    const resolvedByHelp = within(dialog).getByRole('button', {
      name: 'help: resolvedBy',
    })
    await user.click(resolvedByHelp)
    expect(within(dialog).getByText('resolvedByHelp')).toBeInTheDocument()

    await user.type(
      within(dialog).getByLabelText(/resolutionMotivation/, {
        selector: 'textarea',
      }),
      'Changed',
    )
    const cancel = within(dialog).getByRole('button', { name: 'cancel' })
    await user.click(cancel)
    expect(confirmDiscardChangesMock).toHaveBeenCalledWith(cancel)
    expect(onClose).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(confirmDiscardChangesMock).toHaveBeenCalledWith(undefined)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes a clean form directly and blocks controls while saving', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <SuggestionResolutionModal onClose={onClose} onSubmit={vi.fn()} open />,
    )

    const cancel = screen.getByRole('button', { name: 'cancel' })
    await user.click(cancel)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(confirmDiscardChangesMock).not.toHaveBeenCalled()

    rerender(
      <SuggestionResolutionModal
        loading
        onClose={onClose}
        onSubmit={vi.fn()}
        open
      />,
    )
    expect(screen.getByRole('button', { name: 'saving' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'cancel' })).toBeDisabled()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders no portal during server rendering', () => {
    vi.stubGlobal('window', undefined)
    try {
      expect(
        renderToString(
          <SuggestionResolutionModal
            onClose={vi.fn()}
            onSubmit={vi.fn()}
            open
          />,
        ),
      ).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
