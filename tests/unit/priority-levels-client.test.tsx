import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { okResponse } from './test-helpers'

const localeState = vi.hoisted(() => ({ locale: 'en' }))

vi.mock('next-intl', () => ({
  useLocale: () => localeState.locale,
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: vi.fn() }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import PriorityLevelsClient from '@/app/[locale]/priority-levels/priority-levels-client'

const samplePriorityLevels = [
  {
    assessmentCriteriaEn: 'Low assessment',
    assessmentCriteriaSv: 'Låg bedömning',
    code: 'P2',
    id: 1,
    nameSv: 'Låg',
    nameEn: 'Low',
    descriptionEn: 'Low priority',
    descriptionSv: 'Låg prioritet',
    color: '#22c55e',
    iconName: 'ArrowDownLeft',
    sortOrder: 1,
    linkedRequirementCount: 5,
  },
  {
    assessmentCriteriaEn: 'Medium assessment',
    assessmentCriteriaSv: 'Medel bedömning',
    code: 'P3',
    id: 2,
    nameSv: 'Medel',
    nameEn: 'Medium',
    descriptionEn: 'Medium priority',
    descriptionSv: 'Medel prioritet',
    color: '#eab308',
    iconName: 'AlertCircle',
    sortOrder: 2,
    linkedRequirementCount: 3,
  },
]

describe('PriorityLevelsClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    localeState.locale = 'en'
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(
      okResponse({ priorityLevels: samplePriorityLevels }),
    )
  })

  it('renders priority levels without create or delete actions', async () => {
    render(<PriorityLevelsClient />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.priorityLevels',
    )
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
    expect(screen.getByText('P2')).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.delete/i })).toBeNull()
    expect(
      screen.getAllByRole('button', { name: /common\.edit/i }),
    ).toHaveLength(2)
  })

  it('renders the priority designation in the active language', async () => {
    localeState.locale = 'sv'

    render(<PriorityLevelsClient />)

    await waitFor(() => {
      expect(screen.getByText('Låg')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('columnheader', {
        name: 'priorityLevelAdmin.designation',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', {
        name: 'priorityLevelAdmin.description',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', {
        name: 'priorityLevelAdmin.assessmentCriteria',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Låg prioritet')).toBeInTheDocument()
    expect(screen.getByText('Låg bedömning')).toBeInTheDocument()
    expect(screen.queryByText('Low')).toBeNull()
    expect(screen.queryByText('Low priority')).toBeNull()
    expect(screen.queryByText('Low assessment')).toBeNull()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<PriorityLevelsClient />)

    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('renders a message-only empty state without create CTA', async () => {
    fetchMock.mockResolvedValue(okResponse({ priorityLevels: [] }))

    render(<PriorityLevelsClient />)

    const emptyState = await screen.findByText('priorityLevelAdmin.emptyState')
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '8')
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
  })

  it('opens edit form with existing data', async () => {
    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])

    expect(
      (
        screen.getByLabelText(
          /priorityLevelAdmin\.name.+EN/,
        ) as HTMLInputElement
      ).value,
    ).toBe('Low')
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('submits edits through PUT', async () => {
    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    fireEvent.change(screen.getByLabelText(/priorityLevelAdmin\.name.+EN/), {
      target: { value: 'Very low' },
    })

    fetchMock.mockResolvedValueOnce(okResponse({ id: 1 }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ priorityLevels: samplePriorityLevels }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/priority-levels/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  it('keeps previously loaded linked requirements when a later linked fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/priority-levels') {
        return okResponse({ priorityLevels: samplePriorityLevels })
      }
      if (url === '/api/priority-levels/1') {
        return okResponse({
          linkedRequirements: [
            {
              description: 'Requirement one',
              id: 10,
              statusColor: '#3b82f6',
              statusNameEn: 'Draft',
              statusNameSv: 'Utkast',
              uniqueId: 'REQ-1',
              versionNumber: 1,
            },
          ],
        })
      }
      if (url === '/api/priority-levels/2') {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          headers: { 'content-type': 'application/json' },
          status: 400,
          statusText: 'Bad Request',
        })
      }
      return okResponse({})
    })

    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByText('REQ-1')).toBeInTheDocument()
    })

    fireEvent.click(editButtons[1])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/priority-levels/2')
    })
    await waitFor(() => {
      expect(screen.queryByText('common.loading')).toBeNull()
    })
    expect(screen.getByText('REQ-1')).toBeInTheDocument()
    expect(screen.queryByText('common.noneAvailable')).toBeNull()
  })

  it('closes edit form on cancel', async () => {
    render(<PriorityLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    expect(screen.queryByLabelText(/priorityLevelAdmin\.name.+SV/)).toBeNull()
  })
})
