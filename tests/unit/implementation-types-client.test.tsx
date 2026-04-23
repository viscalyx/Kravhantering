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

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}
function errJson(body: unknown, statusText = 'Server Error') {
  return { ok: false, json: async () => body, statusText }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import ImplementationTypesClient from '@/app/[locale]/requirement-packages/implementation-types/implementation-types-client'

const sampleItems = [{ id: 1, nameSv: 'Typ sv', nameEn: 'Type en' }]

describe('ImplementationTypesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson({ types: sampleItems }))
  })

  it('renders heading and create button', async () => {
    render(<ImplementationTypesClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.implementationTypes',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })
  })

  it('fetches and displays items', async () => {
    render(<ImplementationTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<ImplementationTypesClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<ImplementationTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(
      screen.getByLabelText(/implementationTypeMgmt\.name.+SV/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/implementationTypeMgmt\.name.+EN/),
    ).toBeInTheDocument()
  })

  it('submits create form', async () => {
    render(<ImplementationTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(
      screen.getByLabelText(/implementationTypeMgmt\.name.+SV/),
      { target: { value: 'Ny' } },
    )
    fireEvent.change(
      screen.getByLabelText(/implementationTypeMgmt\.name.+EN/),
      { target: { value: 'New' } },
    )

    fetchMock.mockResolvedValueOnce(okJson({ id: 2 }))
    fetchMock.mockResolvedValueOnce(okJson({ types: sampleItems }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/package-implementation-types',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<ImplementationTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect(
      (
        screen.getByLabelText(
          /implementationTypeMgmt\.name.+EN/,
        ) as HTMLInputElement
      ).value,
    ).toBe('Type en')
  })

  it('closes form on cancel', async () => {
    render(<ImplementationTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByLabelText(/implementationTypeMgmt\.name.+SV/),
    ).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<ImplementationTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ types: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/package-implementation-types/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('keeps the form open and shows an error when save fails', async () => {
    render(<ImplementationTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(
      screen.getByLabelText(/implementationTypeMgmt\.name.+SV/),
      { target: { value: 'Ny' } },
    )
    fireEvent.change(
      screen.getByLabelText(/implementationTypeMgmt\.name.+EN/),
      { target: { value: 'New' } },
    )

    fetchMock.mockResolvedValueOnce(errJson({ error: 'Cannot save' }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot save')
    })
    expect(
      screen.getByLabelText(/implementationTypeMgmt\.name.+SV/),
    ).toBeInTheDocument()
  })

  it('shows an error and skips refresh when delete fails', async () => {
    confirmMock.mockResolvedValue(true)
    render(<ImplementationTypesClient />)
    await waitFor(() => {
      expect(screen.getByText('Type en')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(errJson({ error: 'Cannot delete' }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot delete')
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
