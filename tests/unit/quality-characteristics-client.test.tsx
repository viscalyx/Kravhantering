import {
  act,
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

const qcNameSvInput = () =>
  screen.getByRole('textbox', {
    name: /qualityCharacteristicMgmt\.name \(SV\)/,
  })
const qcNameEnInput = () =>
  screen.getByRole('textbox', {
    name: /qualityCharacteristicMgmt\.name \(EN\)/,
  })
const qcTypeSelect = () =>
  screen.getByRole('combobox', { name: /qualityCharacteristicMgmt\.type/ })

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
    expect(
      screen.getByRole('button', { name: /common\.create/ }),
    ).toHaveAttribute('title', 'common.create')
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
    expect(qcNameSvInput()).toBeInTheDocument()
    expect(qcNameEnInput()).toBeInTheDocument()
    const nameHelpButton = screen.getByRole('button', {
      name: 'common.help: qualityCharacteristicMgmt.name (SV)',
    })
    fireEvent.click(nameHelpButton)
    expect(nameHelpButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText('qualityCharacteristicMgmt.nameSvHelp'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'common.help: qualityCharacteristicMgmt.type',
      }),
    ).toBeInTheDocument()
  })

  it('shows a persistent error when requirement types fail to load', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-types') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: 'Cannot load requirement types' }),
            {
              headers: { 'content-type': 'application/json' },
              status: 500,
              statusText: 'Server Error',
            },
          ),
        )
      }
      if (url === '/api/quality-characteristics') {
        return Promise.resolve(
          okJson({ qualityCharacteristics: sampleCategories }),
        )
      }
      return Promise.resolve(okJson({}))
    })

    render(<QualityCharacteristicsClient />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Cannot load requirement types',
      )
    })
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Cannot load requirement types',
        showCancel: false,
      }),
    )
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

    fireEvent.change(qcNameSvInput(), {
      target: { value: 'Ny' },
    })
    fireEvent.change(qcNameEnInput(), {
      target: { value: 'New' },
    })
    fireEvent.change(qcTypeSelect(), {
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
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/quality-characteristics',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Headers),
          body: JSON.stringify({
            nameSv: 'Ny',
            nameEn: 'New',
            requirementTypeId: 1,
            parentId: null,
          }),
        }),
      )
    })

    const postCall = fetchMock.mock.calls.find(call => {
      const [url, options] = call as [string, RequestInit | undefined]
      return (
        url === '/api/quality-characteristics' && options?.method === 'POST'
      )
    })
    expect(postCall).toBeDefined()
    const [, options] = postCall as [string, RequestInit]
    const headers = options.headers as Headers
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-requested-with')).toBe('XMLHttpRequest')
  })

  it('disables row actions and shows saving labels while submitting', async () => {
    const { container } = render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/ }))

    fireEvent.change(qcNameSvInput(), {
      target: { value: 'Ny' },
    })
    fireEvent.change(qcNameEnInput(), {
      target: { value: 'New' },
    })
    fireEvent.change(qcTypeSelect(), {
      target: { value: '1' },
    })

    let resolveSubmit: (response: ReturnType<typeof okJson>) => void = () => {}
    const pendingSubmit = new Promise<ReturnType<typeof okJson>>(resolve => {
      resolveSubmit = resolve
    })
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return pendingSubmit
      if (url === '/api/requirement-types') {
        return Promise.resolve(okJson({ types: sampleTypes }))
      }
      if (url === '/api/quality-characteristics') {
        return Promise.resolve(
          okJson({ qualityCharacteristics: sampleCategories }),
        )
      }
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/ }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/quality-characteristics',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const editButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="edit"]',
    )
    const deleteButtons = container.querySelectorAll(
      '[data-developer-mode-name="table action"][data-developer-mode-value="delete"]',
    )
    expect(editButtons[0]).toBeDisabled()
    expect(editButtons[0]).toHaveTextContent('common.saving')
    expect(editButtons[0]).toHaveAttribute('title', 'common.savingInProgress')
    expect(deleteButtons[0]).toBeDisabled()
    expect(deleteButtons[0]).toHaveTextContent('common.saving')
    expect(deleteButtons[0]).toHaveAttribute('title', 'common.savingInProgress')

    await act(async () => {
      resolveSubmit(okJson({ id: 99 }))
      await pendingSubmit
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /common\.save/ })).toBeNull()
    })
  })

  it('shows error alert on failed submit', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/ }))

    fireEvent.change(qcNameSvInput(), {
      target: { value: 'Ny' },
    })
    fireEvent.change(qcNameEnInput(), {
      target: { value: 'New' },
    })
    fireEvent.change(qcTypeSelect(), {
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

    expect(qcNameSvInput()).toHaveValue('Kat sv')
    expect(qcNameEnInput()).toHaveValue('Maintainability')
  })

  it('hides form when cancel button is clicked', async () => {
    render(<QualityCharacteristicsClient />)
    await waitFor(() => {
      expect(screen.getByText('Quality')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/ }))
    expect(qcNameSvInput()).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/ }))
    expect(
      screen.queryByRole('textbox', {
        name: /qualityCharacteristicMgmt\.name \(SV\)/,
      }),
    ).not.toBeInTheDocument()
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

    fireEvent.change(qcNameEnInput(), {
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
