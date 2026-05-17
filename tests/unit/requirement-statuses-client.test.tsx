import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: vi.fn() }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => (
    <span data-testid="status-badge">{label}</span>
  ),
}))

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: '',
    headers: { 'content-type': 'application/json' },
  })
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementStatusesClient from '@/app/[locale]/requirement-statuses/requirement-statuses-client'

const sampleStatuses = [
  {
    id: 1,
    nameSv: 'Utkast',
    nameEn: 'Draft',
    color: '#3b82f6',
    sortOrder: 1,
    isSystem: true,
  },
  {
    id: 10,
    nameSv: 'Anpassad',
    nameEn: 'Custom',
    color: '#22c55e',
    sortOrder: 5,
    isSystem: false,
  },
]

describe('RequirementStatusesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(() => okJson({ statuses: sampleStatuses }))
  })

  it('renders system statuses without create or delete actions', async () => {
    render(<RequirementStatusesClient />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.statuses',
    )
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    expect(screen.queryByText('Custom')).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.create/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /common\.delete/i })).toBeNull()
    expect(
      screen.getByRole('button', { name: /common\.edit/i }),
    ).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))

    render(<RequirementStatusesClient />)

    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens edit form with existing system status data', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))

    expect(
      (
        screen.getByRole('textbox', {
          name: /statusMgmt\.nameEnLabel/,
        }) as HTMLInputElement
      ).value,
    ).toBe('Draft')
  })

  it('closes edit form on cancel', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    expect(
      screen.queryByRole('textbox', { name: /statusMgmt\.nameEnLabel/ }),
    ).toBeNull()
  })
})
