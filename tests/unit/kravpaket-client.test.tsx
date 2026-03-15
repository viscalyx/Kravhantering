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

import KravpaketClient from '@/app/[locale]/kravpaket/kravpaket-client'

const sampleAreas = [{ id: 1, nameSv: 'Område', nameEn: 'Area' }]
const sampleTypes = [{ id: 1, nameSv: 'Typ', nameEn: 'Type' }]
const samplePackages = [
  {
    id: 1,
    nameSv: 'Paket sv',
    nameEn: 'Package en',
    packageResponsibilityAreaId: 1,
    packageImplementationTypeId: 1,
    responsibilityArea: sampleAreas[0],
    implementationType: sampleTypes[0],
  },
]

describe('KravpaketClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })
  })

  it('renders heading', async () => {
    render(<KravpaketClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.packages',
    )
  })

  it('fetches and displays packages', async () => {
    render(<KravpaketClient />)
    await waitFor(() => {
      expect(screen.getByText('Package en')).toBeInTheDocument()
    })
    expect(screen.getByText('Area')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<KravpaketClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form with fields', async () => {
    render(<KravpaketClient />)
    await waitFor(() => {
      expect(screen.getByText('Package en')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )
    expect(screen.getByLabelText(/package\.name.+SV/)).toBeInTheDocument()
    expect(screen.getByLabelText(/package\.name.+EN/)).toBeInTheDocument()
  })

  it('submits create form', async () => {
    render(<KravpaketClient />)
    await waitFor(() => {
      expect(screen.getByText('Package en')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )

    fireEvent.change(screen.getByLabelText(/package\.name.+SV/), {
      target: { value: 'Ny' },
    })
    fireEvent.change(screen.getByLabelText(/package\.name.+EN/), {
      target: { value: 'New' },
    })

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return Promise.resolve(okJson({ id: 2 }))
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<KravpaketClient />)
    await waitFor(() => {
      expect(screen.getByText('Package en')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect(
      (screen.getByLabelText(/package\.name.+EN/) as HTMLInputElement).value,
    ).toBe('Package en')
  })

  it('closes form on cancel', async () => {
    render(<KravpaketClient />)
    await waitFor(() => {
      expect(screen.getByText('Package en')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(screen.queryByLabelText(/package\.name.+SV/)).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<KravpaketClient />)
    await waitFor(() => {
      expect(screen.getByText('Package en')).toBeInTheDocument()
    })

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return Promise.resolve(okJson({}))
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: [] }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      return Promise.resolve(okJson({}))
    })

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
