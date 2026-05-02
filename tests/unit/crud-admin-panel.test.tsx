import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  deleteError = null,
  loading = false,
  submitting = false,
}: {
  canDelete?: (item: PanelItem) => boolean
  deleteError?: string | null
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
    items: loading ? [] : [{ id: 1, name: 'One' }],
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

  return (
    <CrudAdminPanel
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
    />
  )
}

describe('CrudAdminPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
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

  it('opens the form from the create button', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))
    expect(openEditMock).toHaveBeenCalledWith({ id: 1, name: 'One' })

    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }))
    expect(removeMock).toHaveBeenCalledWith(1, expect.any(HTMLButtonElement))
  })

  it('can hide delete actions per row', () => {
    render(<PanelHarness canDelete={() => false} />)

    expect(
      screen.getByRole('button', { name: 'common.edit' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.delete' })).toBeNull()
  })

  it('disables row actions and shows saving text while submitting', () => {
    render(<PanelHarness submitting />)

    const savingButtons = screen.getAllByRole('button', {
      name: 'common.saving',
    })

    expect(savingButtons).toHaveLength(2)
    for (const button of savingButtons) {
      expect(button).toBeDisabled()
      fireEvent.click(button)
    }

    expect(openEditMock).not.toHaveBeenCalled()
    expect(removeMock).not.toHaveBeenCalled()
  })
})
