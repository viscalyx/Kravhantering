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

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import AnsvarsomradenClient from '@/app/[locale]/kravpaket/ansvarsomraden/ansvarsomraden-client'

const sampleItems = [{ id: 1, nameSv: 'Område sv', nameEn: 'Area en' }]

describe('AnsvarsomradenClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson({ areas: sampleItems }))
  })

  it('renders heading and create button', async () => {
    render(<AnsvarsomradenClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.responsibilityAreas',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
  })

  it('fetches and displays items', async () => {
    render(<AnsvarsomradenClient />)
    await waitFor(() => {
      expect(screen.getByText('Area en')).toBeInTheDocument()
    })
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<AnsvarsomradenClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<AnsvarsomradenClient />)
    await waitFor(() => {
      expect(screen.getByText('Area en')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(
      screen.getByLabelText(/responsibilityAreaMgmt\.name.+SV/),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText(/responsibilityAreaMgmt\.name.+EN/),
    ).toBeInTheDocument()
  })

  it('submits create form', async () => {
    render(<AnsvarsomradenClient />)
    await waitFor(() => {
      expect(screen.getByText('Area en')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(
      screen.getByLabelText(/responsibilityAreaMgmt\.name.+SV/),
      { target: { value: 'Ny' } },
    )
    fireEvent.change(
      screen.getByLabelText(/responsibilityAreaMgmt\.name.+EN/),
      { target: { value: 'New' } },
    )

    fetchMock.mockResolvedValueOnce(okJson({ id: 2 }))
    fetchMock.mockResolvedValueOnce(okJson({ areas: sampleItems }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/package-responsibility-areas',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<AnsvarsomradenClient />)
    await waitFor(() => {
      expect(screen.getByText('Area en')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect(
      (
        screen.getByLabelText(
          /responsibilityAreaMgmt\.name.+EN/,
        ) as HTMLInputElement
      ).value,
    ).toBe('Area en')
  })

  it('closes form on cancel', async () => {
    render(<AnsvarsomradenClient />)
    await waitFor(() => {
      expect(screen.getByText('Area en')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByLabelText(/responsibilityAreaMgmt\.name.+SV/),
    ).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<AnsvarsomradenClient />)
    await waitFor(() => {
      expect(screen.getByText('Area en')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ areas: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/package-responsibility-areas/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
