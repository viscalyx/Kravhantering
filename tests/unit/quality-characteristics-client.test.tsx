import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const confirmMock = vi.fn().mockResolvedValue(true)

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

import QualityCharacteristicsClient from '@/app/[locale]/quality-characteristics/quality-characteristics-client'

const sampleTypes = [{ id: 1, nameSv: 'Typ sv', nameEn: 'Quality' }]

const sampleCategories = [
  {
    id: 10,
    nameSv: 'Kat sv',
    nameEn: 'Maintainability',
    parentId: null,
    requirementTypeId: 1,
  },
  {
    id: 11,
    nameSv: 'Barn sv',
    nameEn: 'Analyzability',
    parentId: 10,
    requirementTypeId: 1,
  },
]

describe('QualityCharacteristicsClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockResolvedValue(true)
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/quality-characteristics')
        return Promise.resolve(
          okJson({ qualityCharacteristics: sampleCategories }),
        )
      return Promise.resolve(okJson({}))
    })
  })

  it('renders heading, ISO subtitle, and create button', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'nav.qualityCharacteristics',
      )
    })
    expect(
      screen.getByText('qualityCharacteristicMgmt.subtitle'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /common\.create/ }),
    ).toBeInTheDocument()
  })

  it('fetches and displays types with categories in grid', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    expect(screen.getByText('Maintainability')).toBeInTheDocument()
    expect(screen.getByText('Analyzability')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<QualityCharacteristicsClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form when create button is clicked', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/ }))
    expect(screen.getByLabelText(/SV/)).toBeInTheDocument()
    expect(screen.getByLabelText(/EN/)).toBeInTheDocument()
  })

  it('shows edit and delete buttons for parent characteristics', async () => {
    const { container } = render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Maintainability')).toBeInTheDocument()
    })
    const editButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="edit"]',
    )
    const deleteButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="delete"]',
    )
    expect(editButtons.length).toBeGreaterThanOrEqual(2)
    expect(deleteButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('submits create form successfully', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/ }))

    fireEvent.change(screen.getByLabelText(/SV/), {
      target: { value: 'Ny' },
    })
    fireEvent.change(screen.getByLabelText(/EN/), {
      target: { value: 'New' },
    })
    fireEvent.change(screen.getByLabelText(/type/i), {
      target: { value: '1' },
    })

    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/quality-characteristics')
        return Promise.resolve(
          okJson({ qualityCharacteristics: sampleCategories }),
        )
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.submit(screen.getByRole('button', { name: /common\.save/ }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/quality-characteristics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
    })
  })

  it('shows error alert on failed submit', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/ }))

    fireEvent.change(screen.getByLabelText(/SV/), {
      target: { value: 'Ny' },
    })
    fireEvent.change(screen.getByLabelText(/EN/), {
      target: { value: 'New' },
    })
    fireEvent.change(screen.getByLabelText(/type/i), {
      target: { value: '1' },
    })

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST')
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Bad request' }),
        })
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/quality-characteristics')
        return Promise.resolve(
          okJson({ qualityCharacteristics: sampleCategories }),
        )
      return Promise.resolve(okJson({}))
    })

    fireEvent.submit(screen.getByRole('button', { name: /common\.save/ }))
    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Bad request', showCancel: false }),
      )
    })
  })

  it('populates form when editing a characteristic', async () => {
    const { container } = render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Maintainability')).toBeInTheDocument()
    })

    const editButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="edit"]',
    )
    fireEvent.click(editButtons[0])

    expect(screen.getByLabelText(/SV/)).toHaveValue('Kat sv')
    expect(screen.getByLabelText(/EN/)).toHaveValue('Maintainability')
  })

  it('hides form when cancel button is clicked', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/ }))
    expect(screen.getByLabelText(/SV/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/ }))
    expect(screen.queryByLabelText(/SV/)).not.toBeInTheDocument()
  })

  it('deletes characteristic after confirmation', async () => {
    const { container } = render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Maintainability')).toBeInTheDocument()
    })

    const deleteButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="delete"]',
    )
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
    })
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/quality-characteristics/'),
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('shows error when delete fails', async () => {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE')
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'In use' }),
        })
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/quality-characteristics')
        return Promise.resolve(
          okJson({ qualityCharacteristics: sampleCategories }),
        )
      return Promise.resolve(okJson({}))
    })

    const { container } = render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Maintainability')).toBeInTheDocument()
    })

    const deleteButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="delete"]',
    )
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'In use', showCancel: false }),
      )
    })
  })

  it('does not delete when confirmation is cancelled', async () => {
    confirmMock.mockResolvedValue(false)
    const { container } = render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Maintainability')).toBeInTheDocument()
    })

    const deleteButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="delete"]',
    )
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled()
    })
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/quality-characteristics/'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('submits edit form with PUT method', async () => {
    const { container } = render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Maintainability')).toBeInTheDocument()
    })

    const editButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="edit"]',
    )
    fireEvent.click(editButtons[0])

    fireEvent.change(screen.getByLabelText(/EN/), {
      target: { value: 'Updated' },
    })

    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/quality-characteristics')
        return Promise.resolve(
          okJson({ qualityCharacteristics: sampleCategories }),
        )
      return Promise.resolve(okJson({}))
    })

    fireEvent.submit(screen.getByRole('button', { name: /common\.save/ }))
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/quality-characteristics/10',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })
})
