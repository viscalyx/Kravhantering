import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SuggestionFormModal from '@/components/SuggestionFormModal'
import SuggestionResolutionModal from '@/components/SuggestionResolutionModal'

const confirmDiscardChangesMock = vi.hoisted(() => vi.fn())
const localeMock = vi.hoisted(() => ({ value: 'en' }))

vi.mock('next-intl', () => ({
  useLocale: () => localeMock.value,
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/useDiscardChangesConfirmation', () => ({
  useDiscardChangesConfirmation: () => confirmDiscardChangesMock,
}))

describe('SuggestionFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localeMock.value = 'en'
    confirmDiscardChangesMock.mockResolvedValue(true)
  })

  it('opens with initial values, exposes field help, and submits trimmed changes', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <SuggestionFormModal
        currentActorName="Reviewer"
        onClose={vi.fn()}
        onSubmit={onSubmit}
        open={false}
      />,
    )

    rerender(
      <SuggestionFormModal
        currentActorName="Reviewer"
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
    const createdBy = within(dialog).getByRole('status', { name: 'createdBy' })
    const save = within(dialog).getByRole('button', { name: 'save' })

    expect(content).toHaveValue('Original suggestion')
    expect(createdBy).toHaveTextContent('Alice')
    expect(save).toBeDisabled()

    const contentHelp = within(dialog).getByRole('button', {
      name: 'help: content',
    })
    await user.click(contentHelp)
    expect(contentHelp).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByText('contentHelp')).toBeInTheDocument()
    await user.click(contentHelp)
    expect(contentHelp).toHaveAttribute('aria-expanded', 'false')

    expect(
      within(dialog).getByText('originalCreatedByHelp'),
    ).toBeInTheDocument()

    await user.clear(content)
    await user.type(content, '  Improved wording  ')
    expect(save).toBeEnabled()

    await user.click(save)
    expect(onSubmit).toHaveBeenCalledWith('Improved wording')
  })

  it('creates a suggestion using content while showing the authenticated submitter', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <SuggestionFormModal
        currentActorName="Reviewer"
        onClose={vi.fn()}
        onSubmit={onSubmit}
        open
      />,
    )
    const actor = screen.getByRole('status', { name: 'createdBy' })
    expect(actor).toHaveTextContent('Reviewer')
    expect(actor.parentElement).toHaveAttribute(
      'data-developer-mode-value',
      'suggestion-recorded-actor',
    )
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
    await user.type(
      screen.getByRole('textbox', { name: /content/ }),
      '  Clearer criteria  ',
    )
    await user.click(screen.getByRole('button', { name: 'save' }))
    expect(onSubmit).toHaveBeenCalledWith('Clearer criteria')
  })

  it.each([
    ['en', 'Anonymous'],
    ['sv', 'Anonym'],
  ])('localizes an anonymized original submitter in %s', (locale, expected) => {
    localeMock.value = locale
    render(
      <SuggestionFormModal
        currentActorName="Reviewer"
        initialContent="Original"
        initialCreatedBy="no-user"
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    )
    expect(screen.getByRole('status', { name: 'createdBy' })).toHaveTextContent(
      expected,
    )
  })

  it('keeps an unknown original submitter distinct from the current actor', () => {
    render(
      <SuggestionFormModal
        currentActorName="Reviewer"
        initialContent="Original"
        initialCreatedBy={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        open
      />,
    )
    expect(screen.getByRole('status', { name: 'createdBy' })).toHaveTextContent(
      '—',
    )
  })

  it('keeps submission based on content when the actor context is unavailable', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <SuggestionFormModal
        currentActorName={null}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        open
      />,
    )
    expect(screen.getByRole('status', { name: 'createdBy' })).toHaveTextContent(
      'actorUnavailable',
    )
    await user.type(
      screen.getByRole('textbox', { name: /content/ }),
      'Clearer criteria',
    )
    await user.click(screen.getByRole('button', { name: 'save' }))
    expect(onSubmit).toHaveBeenCalledWith('Clearer criteria')
  })

  it('closes a clean form directly and confirms before discarding edits', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <SuggestionFormModal
        currentActorName="Reviewer"
        onClose={onClose}
        onSubmit={vi.fn()}
        open
      />,
    )

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
        currentActorName="Reviewer"
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
    expect(await screen.findByText('Reviewer')).toBeInTheDocument()
  })
})

describe('SuggestionResolutionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localeMock.value = 'en'
    confirmDiscardChangesMock.mockResolvedValue(true)
  })

  it.each([
    [false, 'textbox'],
    [true, 'combobox'],
  ] as const)(
    'focuses the editable field when implementationOnly is %s',
    async (implementationOnly, role) => {
      render(
        <SuggestionResolutionModal
          implementationOnly={implementationOnly}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          open
        />,
      )
      await waitFor(() => expect(screen.getByRole(role)).toHaveFocus())
    },
  )

  it.each([
    ['resolve', 1],
    ['dismiss', 2],
  ] as const)(
    'requires motivation and submits the %s outcome without name entry',
    async (outcome, resolution) => {
      const onSubmit = vi.fn()
      const user = userEvent.setup()
      const { rerender } = render(
        <SuggestionResolutionModal
          currentActorName="Reviewer"
          onClose={vi.fn()}
          onSubmit={onSubmit}
          open={false}
        />,
      )
      rerender(
        <SuggestionResolutionModal
          currentActorName="Reviewer"
          onClose={vi.fn()}
          onSubmit={onSubmit}
          open
        />,
      )

      const dialog = screen.getByRole('dialog', { name: 'recordResolution' })
      const submit = within(dialog).getByRole('button', {
        name: 'recordResolution',
      })
      expect(
        within(dialog).getByRole('radio', { name: 'resolve' }),
      ).toBeChecked()
      expect(submit).toBeDisabled()

      expect(await within(dialog).findByText('Reviewer')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('radio', { name: 'dismiss' }))
      await user.click(within(dialog).getByRole('radio', { name: outcome }))
      expect(submit).toBeDisabled()
      await user.type(
        within(dialog).getByLabelText(/resolutionMotivation/, {
          selector: 'textarea',
        }),
        '  Duplicate request  ',
      )
      expect(submit).toBeEnabled()

      await user.click(submit)
      expect(onSubmit).toHaveBeenCalledWith(
        resolution,
        'Duplicate request',
        undefined,
      )
    },
  )

  it('toggles help and protects dirty work on cancel and Escape', async () => {
    confirmDiscardChangesMock
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <SuggestionResolutionModal
        currentActorName="Reviewer"
        onClose={onClose}
        onSubmit={vi.fn()}
        open
      />,
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
      <SuggestionResolutionModal
        currentActorName="Reviewer"
        onClose={onClose}
        onSubmit={vi.fn()}
        open
      />,
    )

    const cancel = screen.getByRole('button', { name: 'cancel' })
    await user.click(cancel)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(confirmDiscardChangesMock).not.toHaveBeenCalled()

    rerender(
      <SuggestionResolutionModal
        currentActorName="Reviewer"
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
            currentActorName="Reviewer"
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
