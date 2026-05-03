import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { okResponse } from './test-helpers'

const confirmMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

function notOk() {
  return new Response(JSON.stringify({ error: 'Bad request' }), {
    headers: { 'content-type': 'application/json' },
    status: 400,
    statusText: 'Bad Request',
  })
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import SpecificationItemStatusesClient from '@/app/[locale]/specification-item-statuses/specification-item-statuses-client'

const sampleStatuses = [
  {
    id: 5,
    nameSv: 'Avviken',
    nameEn: 'Deviated',
    descriptionSv: 'Avsteg har registrerats för kravet',
    descriptionEn: 'A deviation has been registered for the requirement',
    color: '#ef4444',
    sortOrder: 0,
    linkedItemCount: 1,
  },
  {
    id: 1,
    nameSv: 'Inkluderad',
    nameEn: 'Included',
    descriptionSv: 'Kravet finns i underlaget',
    descriptionEn: 'Requirement is in the specification',
    color: '#94a3b8',
    sortOrder: 1,
    linkedItemCount: 5,
  },
  {
    id: 2,
    nameSv: 'Pågående',
    nameEn: 'In Progress',
    descriptionSv: null,
    descriptionEn: null,
    color: '#f59e0b',
    sortOrder: 2,
    linkedItemCount: 3,
  },
]

describe('SpecificationItemStatusesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(() =>
      Promise.resolve(okResponse({ statuses: sampleStatuses })),
    )
  })

  it('renders heading and create button', async () => {
    render(<SpecificationItemStatusesClient />)
    expect(
      screen.getByRole('heading', {
        name: /specificationItemStatusAdmin\.title/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('fetches and displays specification item statuses', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1)
  })

  it('shows definition column with description text', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    expect(
      screen.getByText('specificationItemStatusAdmin.definition'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Requirement is in the specification'),
    ).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<SpecificationItemStatusesClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(
      screen.getByLabelText(/specificationItemStatusAdmin\.name.+SV/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/specificationItemStatusAdmin\.name.+EN/),
    ).toBeInTheDocument()
  })

  it('submits create form', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.change(
      screen.getByLabelText(/specificationItemStatusAdmin\.name.+SV/),
      { target: { value: 'Ny status' } },
    )
    fireEvent.change(
      screen.getByLabelText(/specificationItemStatusAdmin\.name.+EN/),
      { target: { value: 'New status' } },
    )

    fetchMock.mockResolvedValueOnce(okResponse({ id: 3 }))
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/catalog/specification-item-statuses',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])
    expect(
      (
        screen.getByLabelText(
          /specificationItemStatusAdmin\.name.+EN/,
        ) as HTMLInputElement
      ).value,
    ).toBe('Included')
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('shows an error instead of an empty state when linked specifications fail to load', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
      .mockResolvedValueOnce(notOk())

    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('common.error')
    })
    expect(screen.queryByText('common.noneAvailable')).toBeNull()
  })

  it('closes form on cancel', async () => {
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByLabelText(/specificationItemStatusAdmin\.name.+SV/),
    ).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })

    fetchMock.mockResolvedValueOnce(okResponse({}))
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[1])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/catalog/specification-item-statuses/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('disables sort order field when editing the default status (ID 1)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: sampleStatuses[1], linkedItems: [] }),
    )
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])
    const sortInput = screen.getByLabelText(
      /specificationItemStatusAdmin\.sortOrder/,
    ) as HTMLInputElement
    expect(sortInput.disabled).toBe(true)
    expect(
      screen.getByText('specificationItemStatusAdmin.sortOrderLocked'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('disables sort order field when editing the deviated status (ID 5)', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: sampleStatuses[0], linkedItems: [] }),
    )
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Deviated').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    const sortInput = screen.getByLabelText(
      /specificationItemStatusAdmin\.sortOrder/,
    ) as HTMLInputElement
    expect(sortInput.disabled).toBe(true)
    expect(
      screen.getByText('specificationItemStatusAdmin.sortOrderLocked'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('enables sort order field when editing a non-default status', async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okResponse({ status: sampleStatuses[2], linkedItems: [] }),
    )
    render(<SpecificationItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[2])
    const sortInput = screen.getByLabelText(
      /specificationItemStatusAdmin\.sortOrder/,
    ) as HTMLInputElement
    expect(sortInput.disabled).toBe(false)
    expect(
      screen.queryByText('specificationItemStatusAdmin.sortOrderLocked'),
    ).toBeNull()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })
})
