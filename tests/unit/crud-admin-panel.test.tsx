import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useReducedMotion } from 'framer-motion'
import { NextIntlClientProvider } from 'next-intl'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CrudAdminPanel from '@/components/CrudAdminPanel'
import type { CrudAdminResourceController } from '@/hooks/useCrudAdminResource'

import en from '@/messages/en.json'
import sv from '@/messages/sv.json'

interface PanelItem {
  id: number
  name: string
}

interface PanelForm {
  name: string
}

const openEditMock = vi.fn()
const removeMock = vi.fn(async () => true)
const submitMock = vi.fn(async (event?: FormEvent<HTMLFormElement>) => {
  event?.preventDefault()
  return true
})

function PanelHarness({
  canDelete,
  canCreate = true,
  deleteError = null,
  deletingIds = new Set<number>(),
  empty = false,
  formDirty = true,
  formPresentation,
  formSubmitDisabled = false,
  items = [{ id: 1, name: 'One' }],
  locale = 'en',
  loading = false,
  submitting = false,
}: {
  canDelete?: (item: PanelItem) => boolean
  canCreate?: boolean
  deleteError?: string | null
  deletingIds?: Set<number>
  empty?: boolean
  formDirty?: boolean
  formPresentation?: 'inline' | 'modal'
  formSubmitDisabled?: boolean
  items?: PanelItem[]
  locale?: 'en' | 'sv'
  loading?: boolean
  submitting?: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PanelForm>({ name: '' })
  const controller: CrudAdminResourceController<PanelItem, PanelForm> = {
    closeForm: async () => {
      setShowForm(false)
      return true
    },
    deleteError,
    deletingIds,
    editId: null,
    form,
    formDirty,
    formError: null,
    items: loading || empty ? [] : items,
    loading,
    loadError: null,
    openCreate: () => setShowForm(true),
    openEdit: openEditMock,
    reload: async () => {},
    markFormClean: () => {},
    remove: removeMock,
    setForm,
    showForm,
    submit: submitMock,
    submitting,
  }
  const modalProps =
    formPresentation === 'modal'
      ? {
          formDialogDeveloperModeValue: (mode: 'create' | 'edit') =>
            `panel ${mode}`,
          formTitle: (mode: 'create' | 'edit') => `Panel ${mode}`,
          formTitleId: 'panel-form-title',
        }
      : {}

  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : sv}
      timeZone="UTC"
    >
      <CrudAdminPanel
        canCreate={canCreate}
        canDelete={canDelete}
        columns={[
          {
            className: 'py-3 px-4 font-medium',
            header: 'Name',
            key: 'name',
            render: item => item.name,
          },
        ]}
        controller={controller}
        devContext="test admin"
        formPresentation={formPresentation}
        formSubmitDisabled={formSubmitDisabled}
        getItemName={item => item.name}
        renderFormFields={({ form: currentForm, inputClassName, setForm }) => (
          <label className="block text-sm font-medium mb-1" htmlFor="test-name">
            Name
            <input
              className={inputClassName}
              id="test-name"
              onChange={event =>
                setForm({ ...currentForm, name: event.target.value })
              }
              value={currentForm.name}
            />
          </label>
        )}
        title={<span>Admin title</span>}
        {...modalProps}
      />
    </NextIntlClientProvider>
  )
}

describe('CrudAdminPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useReducedMotion).mockReturnValue(false)
  })

  it('renders the header and table rows', () => {
    render(<PanelHarness />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Admin title' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
    expect(screen.getByText('One')).toBeInTheDocument()
  })

  it('names the scroll region from the rendered resource heading', () => {
    render(<PanelHarness />)

    const region = screen.getByRole('region', { name: 'Admin title' })
    expect(region).toContainElement(screen.getByRole('table'))
    expect(region).toHaveAttribute('tabindex', '-1')
    expect(region).toHaveAttribute(
      'data-developer-mode-name',
      'table scroll region',
    )
  })

  it('mounts the named scroll region after loading and retains it for empty data', () => {
    const { rerender } = render(<PanelHarness loading />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    rerender(<PanelHarness />)
    const region = screen.getByRole('region', { name: 'Admin title' })
    expect(region).toContainElement(screen.getByText('One'))

    rerender(<PanelHarness empty />)
    expect(
      screen.getByRole('region', { name: 'Admin title' }),
    ).toContainElement(screen.getByText('No items yet.'))
  })

  it('does not render create controls when canCreate is false', () => {
    render(<PanelHarness canCreate={false} />)

    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
  })

  it('opens the form from the create button', () => {
    render(<PanelHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    expect(
      screen.getByRole('heading', { level: 2, name: 'New' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('opens and submits the form in a modal when requested', () => {
    render(<PanelHarness formPresentation="modal" />)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    const dialog = screen.getByRole('dialog', { name: 'Panel create' })
    expect(dialog).toHaveAttribute('data-developer-mode-name', 'dialog')
    expect(dialog).toHaveAttribute('data-developer-mode-value', 'panel create')
    expect(
      dialog.querySelector('[data-developer-mode-name="crud form"]'),
    ).toHaveAttribute('data-developer-mode-value', 'create')
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument()
    const requiredFieldsHint = within(dialog).getByText(
      'Fields marked with * are required.',
    )
    const actionRow = requiredFieldsHint.closest(
      '[data-form-action-row="true"]',
    )
    expect(actionRow).toContainElement(requiredFieldsHint)
    expect(actionRow).toContainElement(
      within(dialog).getByRole('button', { name: 'Save' }),
    )
    expect(actionRow).toContainElement(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(submitMock).toHaveBeenCalledTimes(1)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Panel create' })).toBeNull()
  })

  it('renders an empty row with a create CTA when items are empty', () => {
    const { container } = render(<PanelHarness empty />)

    const emptyState = screen.getByText('No items yet.')
    expect(emptyState).toBeInTheDocument()
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '2')
    expect(
      container.querySelector('[data-developer-mode-name="empty state"]'),
    ).toHaveAttribute('data-developer-mode-context', 'test admin')

    const createButtons = screen.getAllByRole('button', {
      name: 'New',
    })
    expect(createButtons).toHaveLength(2)

    fireEvent.click(createButtons[1])

    expect(
      screen.getByRole('heading', { level: 2, name: 'New' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('omits the empty row CTA when creation is disabled', () => {
    render(<PanelHarness canCreate={false} empty />)

    expect(screen.getByText('No items yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
  })

  it('opens the form when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)

    render(<PanelHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    expect(
      screen.getByRole('heading', { level: 2, name: 'New' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('submits the form through the controller', () => {
    render(<PanelHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(submitMock).toHaveBeenCalledTimes(1)
  })

  it('disables save for a clean form', () => {
    render(<PanelHarness formDirty={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()
    expect(saveButton).toHaveAttribute('title', 'No changes to save')

    fireEvent.click(saveButton)
    expect(submitMock).not.toHaveBeenCalled()
  })

  it('disables save when the caller reports a form validation error', () => {
    render(<PanelHarness formSubmitDisabled />)

    fireEvent.click(screen.getByRole('button', { name: 'New' }))

    const saveButton = screen.getByRole('button', { name: 'Save' })
    expect(saveButton).toBeDisabled()
    fireEvent.click(saveButton)
    expect(submitMock).not.toHaveBeenCalled()
  })

  it('renders error and loading states', () => {
    const { container, rerender } = render(
      <PanelHarness deleteError="Delete failed" />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Delete failed')
    expect(screen.getByRole('alert')).toHaveAttribute(
      'data-developer-mode-name',
      'crud-admin-visible-error',
    )
    expect(
      container.querySelector(
        '[data-developer-mode-name="crud-admin-visible-error"][data-developer-mode-context="test admin"]',
      ),
    ).toBeInTheDocument()

    rerender(<PanelHarness loading />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByText('No items yet.')).toBeNull()
  })

  it.each([
    ['en', 'Edit', 'Delete'],
    ['sv', 'Redigera', 'Ta bort'],
  ] as const)('names each row action in %s', (locale, edit, remove) => {
    const items = [
      { id: 1, name: 'Drift' },
      { id: 2, name: 'Projekt' },
    ]
    render(<PanelHarness items={items} locale={locale} />)

    for (const item of items) {
      const row = screen.getByRole('row', { name: new RegExp(item.name) })
      for (const action of [edit, remove]) {
        const name = `${action} ${item.name}`
        expect(within(row).getByRole('button', { name })).toHaveAttribute(
          'title',
          name,
        )
      }
    }
  })

  it('wires row actions and developer-mode markers', () => {
    const { container } = render(<PanelHarness />)

    const createButton = screen.getByRole('button', { name: 'New' })
    const table = container.querySelector(
      '[data-developer-mode-name="crud table"]',
    )

    expect(createButton).toHaveAttribute(
      'data-developer-mode-context',
      'test admin',
    )
    expect(table).toHaveAttribute('data-developer-mode-context', 'test admin')

    const editAction = screen.getByRole('button', { name: 'Edit One' })
    const deleteAction = screen.getByRole('button', { name: 'Delete One' })

    expect(editAction).not.toHaveTextContent('Edit')
    expect(deleteAction).not.toHaveTextContent('Delete')
    for (const [button, action] of [
      [editAction, 'edit'],
      [deleteAction, 'delete'],
    ] as const) {
      expect(button).toHaveAttribute('data-developer-mode-name', 'table action')
      expect(button).toHaveAttribute('data-developer-mode-value', action)
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(button.querySelector('svg')).toHaveAttribute('focusable', 'false')
    }

    fireEvent.click(editAction)
    expect(openEditMock).toHaveBeenCalledWith({ id: 1, name: 'One' })

    fireEvent.click(deleteAction)
    expect(removeMock).toHaveBeenCalledWith(1, deleteAction)
  })

  it('can hide delete actions per row', () => {
    render(<PanelHarness canDelete={() => false} />)

    expect(screen.getByRole('button', { name: 'Edit One' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete One' })).toBeNull()
  })

  it('disables actions on the item being deleted and names it in the pending tooltip', () => {
    render(
      <PanelHarness
        deletingIds={new Set([1])}
        items={[
          { id: 1, name: 'One' },
          { id: 2, name: 'Two' },
        ]}
      />,
    )
    const pending = screen.getByRole('button', { name: 'Delete One' })
    expect(pending).toBeDisabled()
    expect(pending).toHaveAttribute('title', 'Deleting One…')
    expect(screen.getByRole('button', { name: 'Edit One' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete Two' })).toBeEnabled()
  })

  it('disables row actions while submitting without changing their labels', () => {
    render(<PanelHarness submitting />)

    const rowActionButtons = [
      screen.getByRole('button', { name: 'Edit One' }),
      screen.getByRole('button', { name: 'Delete One' }),
    ]

    expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull()
    for (const button of rowActionButtons) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }

    expect(openEditMock).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
  })
})
