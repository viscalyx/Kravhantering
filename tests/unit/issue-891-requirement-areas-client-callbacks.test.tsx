import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  closeForm: vi.fn(),
  reload: vi.fn(),
  setForm: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))
vi.mock('@/hooks/useHelpContent', () => ({ useHelpContent: vi.fn() }))
vi.mock('@/lib/http/api-fetch', () => ({ apiFetch: state.apiFetch }))
vi.mock('@/lib/http/response-message', () => ({
  readResponseMessage: vi.fn(async () => null),
}))
vi.mock('@/hooks/useCrudAdminResource', () => ({
  useCrudAdminResource: (options: {
    toForm: (area: Record<string, unknown>) => unknown
  }) => {
    options.toForm({
      description: null,
      name: 'Nullable area',
      ownerHsaId: 'SE5560000001-owner',
      prefix: 'NULL',
    })
    return {
      closeForm: state.closeForm,
      deleteError: null,
      deletingIds: new Set(),
      editId: null,
      form: {
        description: '',
        name: '',
        ownerHsaId: '',
        ownerPersonVerification: null,
        prefix: '',
      },
      formDirty: false,
      formError: null,
      items: [],
      loading: false,
      reload: state.reload,
      setForm: state.setForm,
      showForm: true,
      submitting: false,
    }
  },
}))
vi.mock('@/components/FieldLabelWithHelp', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))
vi.mock('@/components/HsaPersonVerifyField', () => ({
  default: ({
    onHsaIdChange,
    onVerified,
  }: Record<string, (value: unknown) => void>) => (
    <div>
      <button onClick={() => onHsaIdChange('SE5560000001-owner')} type="button">
        Change owner input
      </button>
      <button
        onClick={() => onVerified({ hsaId: 'SE5560000001-owner' })}
        type="button"
      >
        Verify owner
      </button>
    </div>
  ),
}))
vi.mock('@/components/HsaPersonChangeModal', () => ({
  default: ({
    onClose,
    onSubmit,
  }: {
    onClose: () => void
    onSubmit: (id: string) => Promise<unknown>
  }) => (
    <div>
      <button onClick={onClose} type="button">
        Close owner change
      </button>
      <button onClick={() => void onSubmit('SE5560000001-next')} type="button">
        Submit owner change
      </button>
    </div>
  ),
}))
vi.mock('@/components/CoAuthorsManagementModal', () => ({
  default: ({
    onChanged,
    onClose,
  }: {
    onChanged: () => Promise<void>
    onClose: () => void
  }) => (
    <div>
      <button onClick={() => void onChanged()} type="button">
        Reload co-authors
      </button>
      <button onClick={onClose} type="button">
        Close co-authors
      </button>
    </div>
  ),
}))
vi.mock('@/components/CrudAdminPanel', () => ({
  default: (props: Record<string, unknown>) => {
    const renderFields = props.renderFormFields as (
      args: Record<string, unknown>,
    ) => ReactNode
    const renderActions = props.renderRowActions as (
      args: Record<string, unknown>,
    ) => ReactNode
    const setForm = vi.fn()
    return (
      <div>
        <span>
          {(props.formDialogDeveloperModeValue as (mode: string) => string)(
            'create',
          )}
        </span>
        <span>
          {(props.formDialogDeveloperModeValue as (mode: string) => string)(
            'edit',
          )}
        </span>
        <span>{(props.formTitle as (mode: string) => string)('create')}</span>
        <span>{(props.formTitle as (mode: string) => string)('edit')}</span>
        {renderFields({
          disabled: false,
          editId: null,
          form: {
            description: '',
            name: '',
            ownerHsaId: '',
            ownerPersonVerification: null,
            prefix: '',
          },
          inputClassName: 'input',
          isEditing: false,
          setForm,
          textareaClassName: 'textarea',
        })}
        {renderFields({
          disabled: false,
          editId: 7,
          form: {
            description: 'Description',
            name: 'Area',
            ownerHsaId: 'SE5560000001-owner',
            ownerPersonVerification: null,
            prefix: 'AREA',
          },
          inputClassName: 'input',
          isEditing: true,
          setForm,
          textareaClassName: 'textarea',
        })}
        {renderActions({
          disabled: false,
          item: {
            id: 7,
            ownerHsaId: 'SE5560000001-owner',
            permissions: { canManageAssignments: true },
          },
          rowActionButtonClassName: 'row-action',
        })}
        {renderActions({
          disabled: false,
          item: { id: 8, permissions: { canManageAssignments: false } },
          rowActionButtonClassName: 'row-action',
        })}
        {props.children as ReactNode}
      </div>
    )
  },
}))

import RequirementAreasClient from '@/app/[locale]/requirement-areas/requirement-areas-client'

describe('Issue 891 requirement-area client callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.apiFetch.mockResolvedValue({ ok: true })
    state.setForm.mockImplementation(
      (updater: (form: Record<string, unknown>) => unknown) =>
        updater({
          description: '',
          name: '',
          ownerHsaId: 'SE5560000001-owner',
          ownerPersonVerification: { hsaId: 'SE5560000001-owner' },
          prefix: '',
        }),
    )
  })

  it('executes field, owner-change, assignment, and modal callback branches', async () => {
    render(<RequirementAreasClient />)
    expect(screen.getByText('new requirement area')).toBeInTheDocument()
    expect(screen.getByText('edit requirement area')).toBeInTheDocument()

    for (const input of document.querySelectorAll(
      'input:not([disabled]), textarea',
    )) {
      fireEvent.change(input, { target: { value: 'changed' } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Change owner input' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify owner' }))
    fireEvent.click(screen.getByRole('button', { name: 'area.changeOwner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close owner change' }))
    fireEvent.click(screen.getByRole('button', { name: 'area.changeOwner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit owner change' }))
    await waitFor(() => expect(state.apiFetch).toHaveBeenCalled())

    fireEvent.click(
      screen.getByRole('button', { name: 'area.manageCoAuthors' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload co-authors' }))
    await waitFor(() => expect(state.reload).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Close co-authors' }))
  })
})
