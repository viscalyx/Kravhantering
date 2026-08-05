import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const localeState = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('next-intl', () => ({
  useLocale: () => localeState.locale,
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: vi.fn(async () => true) }),
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

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

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

function response(body: unknown, ok = true) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: ok ? 200 : 500,
  })
}

describe('PriorityLevelsClient observable branch behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localeState.locale = 'en'
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/priority-levels') {
        return Promise.resolve(response({ priorityLevels: priorities }))
      }
      return Promise.resolve(response({ linkedRequirements: [] }))
    })
  })

  it('renders localized linked requirements with empty, short, and truncated descriptions', async () => {
    localeState.locale = 'sv'
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/priority-levels') {
        return Promise.resolve(response({ priorityLevels: priorities }))
      }
      return Promise.resolve(
        response({
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

    fetchMock.mockResolvedValueOnce(response({ id: 1 }))
    fetchMock.mockResolvedValueOnce(response({ priorityLevels: priorities }))
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
    fetchMock.mockResolvedValueOnce(response({ error: 'Load failed' }, false))
    const first = render(<PriorityLevelsClient />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Load failed')
    first.unmount()

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    render(<PriorityLevelsClient />)
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
  })
})
