import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { okResponse } from './test-helpers'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
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

import RiskLevelsClient from '@/app/[locale]/risk-levels/risk-levels-client'

const sampleRiskLevels = [
  {
    id: 1,
    nameSv: 'Låg',
    nameEn: 'Low',
    color: '#22c55e',
    iconName: 'ArrowDownLeft',
    sortOrder: 1,
    linkedRequirementCount: 5,
  },
  {
    id: 2,
    nameSv: 'Medel',
    nameEn: 'Medium',
    color: '#eab308',
    iconName: 'AlertCircle',
    sortOrder: 2,
    linkedRequirementCount: 3,
  },
]

describe('RiskLevelsClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okResponse({ riskLevels: sampleRiskLevels }))
  })

  it('renders risk levels without create or delete actions', async () => {
    render(<RiskLevelsClient />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.riskLevels',
    )
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.delete/i })).toBeNull()
    expect(
      screen.getAllByRole('button', { name: /common\.edit/i }),
    ).toHaveLength(2)
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<RiskLevelsClient />)

    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('renders a message-only empty state without create CTA', async () => {
    fetchMock.mockResolvedValue(okResponse({ riskLevels: [] }))

    render(<RiskLevelsClient />)

    const emptyState = await screen.findByText('riskLevelAdmin.emptyState')
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '5')
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
  })

  it('opens edit form with existing data', async () => {
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])

    expect(
      (screen.getByLabelText(/riskLevelAdmin\.name.+EN/) as HTMLInputElement)
        .value,
    ).toBe('Low')
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('submits edits through PUT', async () => {
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    fireEvent.change(screen.getByLabelText(/riskLevelAdmin\.name.+EN/), {
      target: { value: 'Very low' },
    })

    fetchMock.mockResolvedValueOnce(okResponse({ id: 1 }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ riskLevels: sampleRiskLevels }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/risk-levels/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  it('keeps previously loaded linked requirements when a later linked fetch fails', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/risk-levels') {
        return okResponse({ riskLevels: sampleRiskLevels })
      }
      if (url === '/api/risk-levels/1') {
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
      if (url === '/api/risk-levels/2') {
        return new Response(JSON.stringify({ error: 'Bad request' }), {
          headers: { 'content-type': 'application/json' },
          status: 400,
          statusText: 'Bad Request',
        })
      }
      return okResponse({})
    })

    render(<RiskLevelsClient />)
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
      expect(fetchMock).toHaveBeenCalledWith('/api/risk-levels/2')
    })
    await waitFor(() => {
      expect(screen.queryByText('common.loading')).toBeNull()
    })
    expect(screen.getByText('REQ-1')).toBeInTheDocument()
    expect(screen.queryByText('common.noneAvailable')).toBeNull()
  })

  it('closes edit form on cancel', async () => {
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    expect(screen.queryByLabelText(/riskLevelAdmin\.name.+SV/)).toBeNull()
  })
})
