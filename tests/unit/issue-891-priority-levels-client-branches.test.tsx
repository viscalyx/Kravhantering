import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  closeResult: false,
  deleteError: null as string | null,
  loadError: null as string | null,
  locale: 'en',
  options: undefined as Record<string, unknown> | undefined,
  setForm: vi.fn(),
  submitResult: false,
}))

vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/lib/http/api-fetch', () => ({ apiFetch: state.apiFetch }))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/components/IconPicker', () => ({
  default: ({ onChange }: { onChange: (name: string | null) => void }) => (
    <button onClick={() => onChange('Circle')} type="button">
      choose icon
    </button>
  ),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

vi.mock('@/hooks/useCrudAdminResource', () => ({
  useCrudAdminResource: (options: Record<string, unknown>) => {
    state.options = options
    const form = {
      assessmentCriteriaEn: 'English assessment',
      assessmentCriteriaSv: 'Svensk bedomning',
      code: 'P1',
      color: '#123456',
      descriptionEn: 'English description',
      descriptionSv: 'Svensk beskrivning',
      iconName: null,
      nameEn: 'Critical',
      nameSv: 'Kritisk',
      sortOrder: '1',
    }
    return {
      closeForm: vi.fn(async () => state.closeResult),
      deleteError: state.deleteError,
      deletingIds: new Set(),
      editId: 1,
      form,
      formDirty: true,
      formError: 'form failed',
      items: [
        {
          ...form,
          descriptionEn: 'x'.repeat(90),
          descriptionSv: 'y'.repeat(90),
          iconName: undefined,
          id: 1,
          linkedRequirementCount: 2,
          sortOrder: 1,
        },
        {
          ...form,
          assessmentCriteriaEn: null,
          assessmentCriteriaSv: null,
          code: 'P2',
          descriptionEn: null,
          descriptionSv: null,
          id: 2,
          linkedRequirementCount: 0,
          nameEn: 'Low',
          nameSv: 'Lag',
          sortOrder: 2,
        },
      ],
      loadError: state.loadError,
      loading: false,
      openCreate: vi.fn(),
      openEdit: vi.fn(),
      remove: vi.fn(),
      setForm: state.setForm,
      showForm: true,
      submit: vi.fn(async () => state.submitResult),
      submitting: false,
    }
  },
}))

import PriorityLevelsClient from '@/app/[locale]/priority-levels/priority-levels-client'

function requiredElement(selector: string) {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`Missing test element: ${selector}`)
  return element
}

describe('PriorityLevelsClient branch behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.closeResult = false
    state.deleteError = null
    state.loadError = null
    state.locale = 'en'
    state.submitResult = false
    state.apiFetch.mockResolvedValue({
      json: async () => ({
        linkedRequirements: [
          {
            description: null,
            id: 10,
            source: 'library',
            statusColor: null,
            statusIconName: null,
            statusNameEn: null,
            statusNameSv: null,
            uniqueId: 'REQ-10',
            versionNumber: 1,
          },
          {
            description: 'short',
            id: 11,
            source: 'library',
            statusColor: '#123456',
            statusIconName: 'Circle',
            statusNameEn: 'Draft',
            statusNameSv: 'Utkast',
            uniqueId: 'REQ-11',
            versionNumber: 2,
          },
          {
            description: 'z'.repeat(90),
            id: 12,
            source: 'specificationLocal',
            statusColor: '#654321',
            statusIconName: null,
            statusNameEn: 'Published',
            statusNameSv: 'Publicerad',
            uniqueId: 'REQ-12',
            versionNumber: 3,
          },
        ],
      }),
      ok: true,
    })
    state.setForm.mockImplementation(updater =>
      updater({
        assessmentCriteriaEn: 'English assessment',
        assessmentCriteriaSv: 'Svensk bedomning',
        code: 'P1',
        color: '#123456',
        descriptionEn: 'English description',
        descriptionSv: 'Svensk beskrivning',
        iconName: null,
        nameEn: 'Critical',
        nameSv: 'Kritisk',
        sortOrder: '1',
      }),
    )
  })

  it('renders localized edge values and linked requirement variants', async () => {
    state.locale = 'sv'
    render(<PriorityLevelsClient />)

    expect(screen.getAllByText('P1 – Kritisk').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[0])

    expect(await screen.findByText('REQ-10')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.getByText('short')).toBeInTheDocument()
    expect(screen.getByText(`${'z'.repeat(80)}…`)).toHaveAttribute(
      'title',
      'z'.repeat(90),
    )
    expect(screen.getByText('Utkast')).toBeInTheDocument()
  })

  it('runs all form field, help, cancel, and failed-submit handlers', async () => {
    render(<PriorityLevelsClient />)
    for (const [id, value] of [
      ['priority-sort-order', '4'],
      ['priority-name-sv', 'Ny'],
      ['priority-name-en', 'New'],
      ['priority-description-sv', 'Beskrivning'],
      ['priority-description-en', 'Description'],
      ['priority-assessment-criteria-sv', 'Bedomning'],
      ['priority-assessment-criteria-en', 'Assessment'],
      ['priority-color-picker', '#654321'],
      ['priority-color-hex', '#abcdef'],
    ]) {
      fireEvent.change(requiredElement(`#${id}`), {
        target: { value },
      })
    }
    fireEvent.click(screen.getByRole('button', { name: 'choose icon' }))

    const help = screen.getByRole('button', {
      name: 'common.help: priorityLevelAdmin.sortOrder',
    })
    fireEvent.click(help)
    fireEvent.click(help)
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    fireEvent.submit(requiredElement('form'))

    await waitFor(() => expect(state.setForm).toHaveBeenCalledTimes(10))
  })

  it('maps defaults and both sort-order payload variants', () => {
    render(<PriorityLevelsClient />)
    const options = state.options as {
      getInitialForm: () => Record<string, unknown>
      toForm: (item: Record<string, unknown>) => Record<string, unknown>
      toPayload: (form: Record<string, unknown>) => Record<string, unknown>
    }
    expect(options.getInitialForm()).toMatchObject({
      color: '#3b82f6',
      iconName: null,
      sortOrder: '0',
    })
    expect(
      options.toForm({
        assessmentCriteriaEn: '',
        assessmentCriteriaSv: '',
        code: 'P1',
        color: '#123456',
        descriptionEn: '',
        descriptionSv: '',
        iconName: undefined,
        nameEn: '',
        nameSv: '',
        sortOrder: 7,
      }),
    ).toMatchObject({ iconName: null, sortOrder: '7' })
    expect(
      options.toPayload({
        assessmentCriteriaEn: '',
        assessmentCriteriaSv: '',
        color: '#123456',
        descriptionEn: '',
        descriptionSv: '',
        iconName: null,
        nameEn: '',
        nameSv: '',
        sortOrder: ' 8 ',
      }),
    ).toMatchObject({ sortOrder: 8 })
    expect(
      options.toPayload({
        assessmentCriteriaEn: '',
        assessmentCriteriaSv: '',
        color: '#123456',
        descriptionEn: '',
        descriptionSv: '',
        iconName: null,
        nameEn: '',
        nameSv: '',
        sortOrder: ' ',
      }),
    ).toMatchObject({ sortOrder: null })
  })

  it('prefers delete errors and falls back to load errors', () => {
    state.deleteError = 'delete failed'
    const first = render(<PriorityLevelsClient />)
    expect(screen.getByText('delete failed')).toHaveAttribute('role', 'alert')
    first.unmount()

    state.deleteError = null
    state.loadError = 'load failed'
    render(<PriorityLevelsClient />)
    expect(screen.getByText('load failed')).toHaveAttribute('role', 'alert')
  })
})
