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
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}
function errJson(body: unknown, status = 500, statusText = 'Server Error') {
  return { ok: false, json: async () => body, status, statusText }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementAreasClient from '@/app/[locale]/requirement-areas/requirement-areas-client'

const sampleAreas = [
  {
    id: 1,
    prefix: 'INT',
    name: 'Integration',
    description: 'System integration',
    ownerId: 1,
    ownerName: 'Anna S',
  },
  {
    id: 2,
    prefix: 'SÄK',
    name: 'Säkerhet',
    description: null,
    ownerId: null,
    ownerName: null,
  },
]

const sampleOwners = [
  { id: 1, name: 'Anna S' },
  { id: 2, name: 'Erik L' },
]

describe('RequirementAreasClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/owners') return okJson({ owners: sampleOwners })
      return okJson({})
    })
  })

  it('renders heading and create button', async () => {
    render(<RequirementAreasClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.areas',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })
  })

  it('fetches and displays areas in the table', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })
    expect(screen.getByText('INT')).toBeInTheDocument()
    expect(screen.getByText('Säkerhet')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementAreasClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form when clicking create button', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'common.create',
    )
    expect(
      screen.getByRole('textbox', { name: /area\.prefix/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /area\.name/ }),
    ).toBeInTheDocument()
  })

  it('submits create form and refreshes list', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(screen.getByRole('textbox', { name: /area\.prefix/ }), {
      target: { value: 'NEW' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /area\.name/ }), {
      target: { value: 'New Area' },
    })

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/owners') return okJson({ owners: sampleOwners })
      return okJson({ id: 3 })
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-areas',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'common.edit',
    )
    expect(
      (
        screen.getByRole('textbox', {
          name: /area\.prefix/,
        }) as HTMLInputElement
      ).value,
    ).toBe('INT')
    expect(screen.getByRole('textbox', { name: /area\.prefix/ })).toBeDisabled()
    expect(
      (screen.getByRole('textbox', { name: /area\.name/ }) as HTMLInputElement)
        .value,
    ).toBe('Integration')
  })

  it('submits edit form with PUT', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    fireEvent.change(screen.getByRole('textbox', { name: /area\.name/ }), {
      target: { value: 'Updated' },
    })

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/owners') return okJson({ owners: sampleOwners })
      return okJson({ id: 1 })
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-areas/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-areas/1' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect((putCall?.[1] as RequestInit).body).toBe(
      JSON.stringify({
        description: 'System integration',
        name: 'Updated',
        ownerId: 1,
      }),
    )
  })

  it('closes form when cancel is clicked', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(
      screen.getByRole('textbox', { name: /area\.prefix/ }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(screen.queryByRole('textbox', { name: /area\.prefix/ })).toBeNull()
  })

  it('calls delete with confirm and refreshes', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: [sampleAreas[1]] })
      if (url === '/api/owners') return okJson({ owners: sampleOwners })
      return okJson({})
    })

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-areas/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('shows a delete error and skips refresh when delete fails', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas/1') {
        return errJson({ error: 'Cannot delete area' }, 409, 'Conflict')
      }
      if (url === '/api/requirement-areas') {
        return okJson({ areas: sampleAreas })
      }
      if (url === '/api/owners') return okJson({ owners: sampleOwners })
      return okJson({})
    })

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cannot delete area')
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('does not delete when confirm is cancelled', async () => {
    confirmMock.mockResolvedValue(false)
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled()
    })

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/requirement-areas/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('displays owner names for areas and dash for missing owners', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(1)
  })

  it('keeps form open and shows error when save fails', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(screen.getByRole('textbox', { name: /area\.prefix/ }), {
      target: { value: 'FAIL' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /area\.name/ }), {
      target: { value: 'Failing Area' },
    })

    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas' && !url.includes('/'))
        return okJson({ areas: sampleAreas })
      if (url === '/api/owners') return okJson({ owners: sampleOwners })
      return {
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ error: 'Prefix already exists' }),
      }
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Prefix already exists',
      )
    })

    expect(
      screen.getByRole('textbox', { name: /area\.prefix/ }),
    ).toBeInTheDocument()
    expect(
      (
        screen.getByRole('textbox', {
          name: /area\.prefix/,
        }) as HTMLInputElement
      ).value,
    ).toBe('FAIL')
  })
})
