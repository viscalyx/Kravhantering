import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const confirmMock = vi.fn()

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
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RiskLevelsClient from '@/app/[locale]/risk-levels/risk-levels-client'

const sampleRiskLevels = [
  {
    id: 1,
    nameSv: 'Låg',
    nameEn: 'Low',
    color: '#22c55e',
    sortOrder: 1,
    linkedRequirementCount: 5,
  },
  {
    id: 2,
    nameSv: 'Medel',
    nameEn: 'Medium',
    color: '#eab308',
    sortOrder: 2,
    linkedRequirementCount: 3,
  },
]

describe('RiskLevelsClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson({ riskLevels: sampleRiskLevels }))
  })

  it('renders heading and create button', async () => {
    render(<RiskLevelsClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.riskLevels',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
  })

  it('fetches and displays risk levels', async () => {
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
    expect(screen.getByText('Medium')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RiskLevelsClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(
      screen.getByLabelText(/riskLevelAdmin\.name.+SV/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/riskLevelAdmin\.name.+EN/),
    ).toBeInTheDocument()
  })

  it('submits create form', async () => {
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.change(screen.getByLabelText(/riskLevelAdmin\.name.+SV/), {
      target: { value: 'Kritisk' },
    })
    fireEvent.change(screen.getByLabelText(/riskLevelAdmin\.name.+EN/), {
      target: { value: 'Critical' },
    })

    fetchMock.mockResolvedValueOnce(okJson({ id: 3 }))
    fetchMock.mockResolvedValueOnce(okJson({ riskLevels: sampleRiskLevels }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/risk-levels',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect(
      (screen.getByLabelText(/riskLevelAdmin\.name.+EN/) as HTMLInputElement)
        .value,
    ).toBe('Low')
  })

  it('closes form on cancel', async () => {
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(screen.queryByLabelText(/riskLevelAdmin\.name.+SV/)).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RiskLevelsClient />)
    await waitFor(() => {
      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ riskLevels: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/risk-levels/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
