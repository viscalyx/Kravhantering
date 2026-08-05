import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  confirm: vi.fn(),
  locale: 'en',
  options: undefined as Record<string, unknown> | undefined,
  setForm: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: state.confirm }),
}))

vi.mock('@/components/IconPicker', () => ({
  default: ({ onChange }: { onChange: (name: string | null) => void }) => (
    <button onClick={() => onChange('Circle')} type="button">
      choose icon
    </button>
  ),
}))

vi.mock('@/components/StatusBadgeThemePreview', () => ({
  default: ({
    copy,
    label,
  }: {
    copy: { contrastResultLabel: (ratio: string) => string }
    label: string
  }) => (
    <div>
      {label} {copy.contrastResultLabel('4.50')}
    </div>
  ),
}))

vi.mock('@/hooks/useCrudAdminResource', () => ({
  useCrudAdminResource: (options: Record<string, unknown>) => {
    state.options = options
    const form = {
      color: '#123456',
      iconName: null,
      nameEn: 'Draft',
      nameSv: 'Utkast',
      sortOrder: 1,
    }
    return {
      closeForm: vi.fn(),
      deleteError: null,
      deletingIds: new Set(),
      editId: 1,
      form,
      formDirty: true,
      formError: null,
      items: [
        { ...form, id: 1, isSystem: true },
        { ...form, color: null, id: 2, isSystem: true },
        { ...form, id: 3, isSystem: false },
      ],
      loadError: null,
      loading: false,
      openCreate: vi.fn(),
      openEdit: vi.fn(),
      remove: vi.fn(),
      setForm: state.setForm,
      showForm: true,
      submit: vi.fn(),
      submitting: false,
    }
  },
}))

vi.mock('@/components/CrudAdminPanel', () => ({
  default: ({
    canDelete,
    columns,
    controller,
    notice,
    renderFormFields,
  }: {
    canDelete: (item: { id: number }) => boolean
    columns: Array<{
      key: string
      render: (item: Record<string, unknown>) => React.ReactNode
    }>
    controller: {
      form: Record<string, unknown>
      items: Array<Record<string, unknown>>
      setForm: React.Dispatch<React.SetStateAction<Record<string, unknown>>>
    }
    notice: React.ReactNode
    renderFormFields: (args: Record<string, unknown>) => React.ReactNode
  }) => {
    const hiddenCustomStatus = {
      color: '#abcdef',
      iconName: null,
      id: 9,
      isSystem: false,
      nameEn: 'Custom',
      nameSv: 'Anpassad',
      sortOrder: 9,
    }
    return (
      <div>
        {notice}
        {columns.map(column => (
          <div key={column.key}>{column.render(hiddenCustomStatus)}</div>
        ))}
        <span>{String(canDelete(hiddenCustomStatus))}</span>
        {renderFormFields({
          disabled: false,
          form: controller.form,
          inputClassName: 'input',
          setForm: controller.setForm,
        })}
      </div>
    )
  },
}))

import RequirementStatusesClient from '@/app/[locale]/requirement-statuses/requirement-statuses-client'

function requiredElement(selector: string) {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

describe('RequirementStatusesClient branch behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.locale = 'en'
    state.setForm.mockImplementation(updater =>
      updater({
        color: '#123456',
        iconName: null,
        nameEn: 'Draft',
        nameSv: 'Utkast',
        sortOrder: 1,
      }),
    )
  })

  it('renders both language and non-system column branches', () => {
    state.locale = 'sv'
    render(<RequirementStatusesClient />)

    expect(screen.getByText('Anpassad')).toBeInTheDocument()
    expect(screen.getByText('common.no')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'statusMgmt.invalidStoredColors',
    )
  })

  it('runs every status form updater', () => {
    render(<RequirementStatusesClient />)

    fireEvent.change(requiredElement('#status-name-sv'), {
      target: { value: 'Nytt' },
    })
    fireEvent.change(requiredElement('#status-name-en'), {
      target: { value: 'New' },
    })
    fireEvent.change(requiredElement('#status-sort-order'), {
      target: { value: '3' },
    })
    fireEvent.change(screen.getByLabelText('statusMgmt.colorPicker'), {
      target: { value: '#654321' },
    })
    fireEvent.change(screen.getByLabelText('statusMgmt.colorHex'), {
      target: { value: '#abcdef' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'choose icon' }))

    expect(state.setForm).toHaveBeenCalledTimes(6)
  })

  it('maps nullable values and presents fallback mutation errors', async () => {
    render(<RequirementStatusesClient />)
    const options = state.options as {
      getCaughtErrorMessage: (error: unknown) => string
      getInitialForm: () => Record<string, unknown>
      onSubmitError: (error: { message: string }) => Promise<void>
      toForm: (item: Record<string, unknown>) => Record<string, unknown>
      toPayload: (form: Record<string, unknown>) => Record<string, unknown>
    }

    expect(options.getInitialForm()).toMatchObject({ iconName: null })
    expect(
      options.toForm({
        color: null,
        iconName: undefined,
        nameEn: 'Draft',
        nameSv: 'Utkast',
        sortOrder: 1,
      }),
    ).toMatchObject({ color: '', iconName: null })
    expect(options.toPayload({ value: 1 })).toEqual({ value: 1 })
    expect(options.getCaughtErrorMessage(new Error('specific'))).toBe(
      'specific',
    )
    expect(options.getCaughtErrorMessage(new Error(''))).toBe('common.error')
    expect(options.getCaughtErrorMessage('failure')).toBe('common.error')

    await options.onSubmitError({ message: '' })
    expect(state.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'common.error', showCancel: false }),
    )
  })
})
