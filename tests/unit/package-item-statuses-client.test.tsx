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

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}
function notOk() {
  return { ok: false }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import PackageItemStatusesClient from '@/app/[locale]/package-item-statuses/package-item-statuses-client'

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
    descriptionSv: 'Kravet finns i paketet',
    descriptionEn: 'Requirement is in the package',
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

describe('PackageItemStatusesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson({ statuses: sampleStatuses }))
  })

  it('renders heading and create button', async () => {
    render(<PackageItemStatusesClient />)
    expect(
      screen.getByRole('heading', {
        name: /packageItemStatusAdmin\.title/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('fetches and displays package item statuses', async () => {
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getAllByText('In Progress').length).toBeGreaterThanOrEqual(1)
  })

  it('shows definition column with description text', async () => {
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    expect(
      screen.getByText('packageItemStatusAdmin.definition'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Requirement is in the package'),
    ).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<PackageItemStatusesClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(
      screen.getByLabelText(/packageItemStatusAdmin\.name.+SV/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/packageItemStatusAdmin\.name.+EN/),
    ).toBeInTheDocument()
  })

  it('submits create form', async () => {
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.change(
      screen.getByLabelText(/packageItemStatusAdmin\.name.+SV/),
      { target: { value: 'Ny status' } },
    )
    fireEvent.change(
      screen.getByLabelText(/packageItemStatusAdmin\.name.+EN/),
      { target: { value: 'New status' } },
    )

    fetchMock.mockResolvedValueOnce(okJson({ id: 3 }))
    fetchMock.mockResolvedValueOnce(okJson({ statuses: sampleStatuses }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/package-item-statuses',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<PackageItemStatusesClient />)
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
          /packageItemStatusAdmin\.name.+EN/,
        ) as HTMLInputElement
      ).value,
    ).toBe('Included')
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('shows an error instead of an empty state when linked packages fail to load', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ statuses: sampleStatuses }))
      .mockResolvedValueOnce(notOk())

    render(<PackageItemStatusesClient />)
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
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByLabelText(/packageItemStatusAdmin\.name.+SV/),
    ).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ statuses: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[1])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/package-item-statuses/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('disables sort order field when editing the default status (ID 1)', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okJson({ status: sampleStatuses[1], linkedItems: [] }),
    )
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[1])
    const sortInput = screen.getByLabelText(
      /packageItemStatusAdmin\.sortOrder/,
    ) as HTMLInputElement
    expect(sortInput.disabled).toBe(true)
    expect(
      screen.getByText('packageItemStatusAdmin.sortOrderLocked'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('disables sort order field when editing the deviated status (ID 5)', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okJson({ status: sampleStatuses[0], linkedItems: [] }),
    )
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Deviated').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    const sortInput = screen.getByLabelText(
      /packageItemStatusAdmin\.sortOrder/,
    ) as HTMLInputElement
    expect(sortInput.disabled).toBe(true)
    expect(
      screen.getByText('packageItemStatusAdmin.sortOrderLocked'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('enables sort order field when editing a non-default status', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ statuses: sampleStatuses }))
    fetchMock.mockResolvedValueOnce(
      okJson({ status: sampleStatuses[2], linkedItems: [] }),
    )
    render(<PackageItemStatusesClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Included').length).toBeGreaterThanOrEqual(1)
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[2])
    const sortInput = screen.getByLabelText(
      /packageItemStatusAdmin\.sortOrder/,
    ) as HTMLInputElement
    expect(sortInput.disabled).toBe(false)
    expect(
      screen.queryByText('packageItemStatusAdmin.sortOrderLocked'),
    ).toBeNull()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })
})
