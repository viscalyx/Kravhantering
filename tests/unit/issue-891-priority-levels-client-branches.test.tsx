import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmModalMock,
  failedJsonResponse,
  iconPickerMock,
  okJsonResponse,
  routingLinkMock,
  statusBadgeMock,
} from './helpers/issue-891-client-test-helpers'

const localeState = vi.hoisted(() => ({
  confirm: vi.fn(async () => true),
  locale: 'en',
}))

vi.mock('next-intl', () => ({
  useLocale: () => localeState.locale,
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/components/ConfirmModal', () =>
  confirmModalMock(localeState.confirm),
)

vi.mock('@/components/IconPicker', () => iconPickerMock())
vi.mock('@/components/StatusBadge', () => statusBadgeMock())
vi.mock('@/i18n/routing', () => routingLinkMock())

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import PriorityLevelsClient from '@/app/[locale]/priority-levels/priority-levels-client'

const priorities = [
  {
    assessmentCriteriaEn: 'English assessment',
    assessmentCriteriaSv: 'Svensk bedomning',
    code: 'P1',
    color: '#123456',
    descriptionEn: 'English description',
    descriptionSv: 'Svensk beskrivning',
    iconName: null,
    id: 1,
    linkedRequirementCount: 2,
    nameEn: 'Critical',
    nameSv: 'Kritisk',
    sortOrder: 1,
  },
]

describe('PriorityLevelsClient observable branch behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localeState.locale = 'en'
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/priority-levels') {
        return Promise.resolve(okJsonResponse({ priorityLevels: priorities }))
      }
      return Promise.resolve(okJsonResponse({ linkedRequirements: [] }))
    })
  })

  it('renders localized linked requirements with empty, short, and truncated descriptions', async () => {
    localeState.locale = 'sv'
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/priority-levels') {
        return Promise.resolve(okJsonResponse({ priorityLevels: priorities }))
      }
      return Promise.resolve(
        okJsonResponse({
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
      )
    })

    render(<PriorityLevelsClient />)
    await screen.findByText('P1 – Kritisk')
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))

    expect(await screen.findByText('REQ-10')).toBeInTheDocument()
    expect(screen.getByText('short')).toBeInTheDocument()
    expect(screen.getByText(`${'z'.repeat(80)}…`)).toHaveAttribute(
      'title',
      'z'.repeat(90),
    )
    expect(screen.getByText('Utkast')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('edits every field, toggles help, and sends the visible form values', async () => {
    render(<PriorityLevelsClient />)
    await screen.findByText('P1 – Critical')
    fireEvent.click(screen.getByRole('button', { name: 'common.edit' }))
    await screen.findByText('common.noneAvailable')

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
      fireEvent.change(document.getElementById(id) as HTMLElement, {
        target: { value },
      })
    }
    fireEvent.click(screen.getByRole('button', { name: 'choose icon' }))
    const help = screen.getByRole('button', {
      name: 'common.help: priorityLevelAdmin.sortOrder',
    })
    fireEvent.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(help)
    expect(help).toHaveAttribute('aria-expanded', 'false')

    fetchMock.mockResolvedValueOnce(okJsonResponse({ id: 1 }))
    fetchMock.mockResolvedValueOnce(
      okJsonResponse({ priorityLevels: priorities }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === '/api/priority-levels/1' && options?.method === 'PUT',
      )
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({
        assessmentCriteriaEn: 'Assessment',
        assessmentCriteriaSv: 'Bedomning',
        color: '#abcdef',
        descriptionEn: 'Description',
        descriptionSv: 'Beskrivning',
        iconName: 'Circle',
        nameEn: 'New',
        nameSv: 'Ny',
        sortOrder: 4,
      })
    })
  })

  it('shows server and network load failures', async () => {
    fetchMock.mockResolvedValueOnce(
      failedJsonResponse({ error: 'Load failed' }),
    )
    const first = render(<PriorityLevelsClient />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Load failed')
    first.unmount()

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    render(<PriorityLevelsClient />)
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
  })
})
