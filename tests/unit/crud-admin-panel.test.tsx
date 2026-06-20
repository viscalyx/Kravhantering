import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { useReducedMotion } from 'framer-motion'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CrudAdminPanel from '@/components/CrudAdminPanel'
import type { CrudAdminResourceController } from '@/hooks/useCrudAdminResource'

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

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
  empty = false,
  formPresentation,
  loading = false,
  submitting = false,
}: {
  canDelete?: (item: PanelItem) => boolean
  canCreate?: boolean
  deleteError?: string | null
  empty?: boolean
  formPresentation?: 'inline' | 'modal'
  loading?: boolean
  submitting?: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PanelForm>({ name: '' })
  const controller: CrudAdminResourceController<PanelItem, PanelForm> = {
    closeForm: () => setShowForm(false),
    deleteError,
    deletingIds: new Set(),
    editId: null,
    form,
    formError: null,
    items: loading || empty ? [] : [{ id: 1, name: 'One' }],
    loading,
    loadError: null,
    openCreate: () => setShowForm(true),
    openEdit: openEditMock,
    reload: async () => {},
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
      title="Admin title"
      {...modalProps}
    />
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
    expect(
      screen.getByRole('button', { name: 'common.create' }),
    ).toBeInTheDocument()
    expect(screen.getByText('One')).toBeInTheDocument()
  })

  it('does not render create controls when canCreate is false', () => {
    render(<PanelHarness canCreate={false} />)

    expect(screen.queryByRole('button', { name: 'common.create' })).toBeNull()
  })

  it('opens the form from the create button', () => {
    render(<PanelHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(
      screen.getByRole('heading', { level: 2, name: 'common.create' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('opens and submits the form in a modal when requested', () => {
    render(<PanelHarness formPresentation="modal" />)

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    const dialog = screen.getByRole('dialog', { name: 'Panel create' })
    expect(dialog).toHaveAttribute('data-developer-mode-name', 'dialog')
    expect(dialog).toHaveAttribute('data-developer-mode-value', 'panel create')
    expect(
      dialog.querySelector('[data-developer-mode-name="crud form"]'),
    ).toHaveAttribute('data-developer-mode-value', 'create')
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument()
    const requiredFieldsHint = within(dialog).getByText(
      'common.requiredFieldsHint',
    )
    const actionRow = requiredFieldsHint.closest(
      '[data-form-action-row="true"]',
    )
    expect(actionRow).toContainElement(requiredFieldsHint)
    expect(actionRow).toContainElement(
      within(dialog).getByRole('button', { name: 'common.save' }),
    )
    expect(actionRow).toContainElement(
      within(dialog).getByRole('button', { name: 'common.cancel' }),
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'common.save' }))
    expect(submitMock).toHaveBeenCalledTimes(1)

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'common.cancel' }),
    )
    expect(screen.queryByRole('dialog', { name: 'Panel create' })).toBeNull()
  })

  it('renders an empty row with a create CTA when items are empty', () => {
    const { container } = render(<PanelHarness empty />)

    const emptyState = screen.getByText('common.emptyState')
    expect(emptyState).toBeInTheDocument()
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '2')
    expect(
      container.querySelector('[data-developer-mode-name="empty state"]'),
    ).toHaveAttribute('data-developer-mode-context', 'test admin')

    const createButtons = screen.getAllByRole('button', {
      name: 'common.create',
    })
    expect(createButtons).toHaveLength(2)

    fireEvent.click(createButtons[1])

    expect(
      screen.getByRole('heading', { level: 2, name: 'common.create' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('omits the empty row CTA when creation is disabled', () => {
    render(<PanelHarness canCreate={false} empty />)

    expect(screen.getByText('common.emptyState')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.create' })).toBeNull()
  })

  it('opens the form when reduced motion is requested', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true)

    render(<PanelHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(
      screen.getByRole('heading', { level: 2, name: 'common.create' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('submits the form through the controller', () => {
    render(<PanelHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(submitMock).toHaveBeenCalledTimes(1)
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

    expect(screen.getByText('common.loading')).toBeInTheDocument()
    expect(screen.queryByText('common.emptyState')).toBeNull()
  })

  it('wires row actions and developer-mode markers', () => {
    const { container } = render(<PanelHarness />)

    const createButton = screen.getByRole('button', { name: 'common.create' })
    const table = container.querySelector(
      '[data-developer-mode-name="crud table"]',
    )

    expect(createButton).toHaveAttribute(
      'data-developer-mode-context',
      'test admin',
    )
    expect(table).toHaveAttribute('data-developer-mode-context', 'test admin')

    const editAction = screen.getByRole('button', { name: 'common.edit' })
    const deleteAction = screen.getByRole('button', { name: 'common.delete' })

    expect(editAction).not.toHaveTextContent('common.edit')
    expect(deleteAction).not.toHaveTextContent('common.delete')
    expect(editAction.querySelector('svg')).toBeInTheDocument()
    expect(deleteAction.querySelector('svg')).toBeInTheDocument()

    fireEvent.click(editAction)
    expect(openEditMock).toHaveBeenCalledWith({ id: 1, name: 'One' })

    fireEvent.click(deleteAction)
    expect(removeMock).toHaveBeenCalledWith(1, expect.any(HTMLButtonElement))
  })

  it('can hide delete actions per row', () => {
    render(<PanelHarness canDelete={() => false} />)

    expect(
      screen.getByRole('button', { name: 'common.edit' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.delete' })).toBeNull()
  })

  it('disables row actions while submitting without changing their labels', () => {
    render(<PanelHarness submitting />)

    const rowActionButtons = [
      screen.getByRole('button', { name: 'common.edit' }),
      screen.getByRole('button', { name: 'common.delete' }),
    ]

    expect(screen.queryByRole('button', { name: 'common.saving' })).toBeNull()
    for (const button of rowActionButtons) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }

    expect(openEditMock).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
  })
})
