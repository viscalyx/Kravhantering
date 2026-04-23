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
  return {
    ok: true,
    json: async () => body,
  }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import OwnersClient from '@/app/[locale]/owners/owners-client'

describe('OwnersClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(
      okJson({
        owners: [
          { id: 1, firstName: 'Anna', lastName: 'S', email: 'a@b.com' },
          { id: 2, firstName: 'Erik', lastName: 'L', email: 'e@t.com' },
        ],
      }),
    )
  })

  it('renders heading and create button', async () => {
    render(<OwnersClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.areaOwners',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })
  })

  it('fetches and displays owners in the table', async () => {
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })
    expect(screen.getByText('Erik L')).toBeInTheDocument()
    expect(screen.getByText('a@b.com')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<OwnersClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form when clicking create button', async () => {
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'common.create',
    )
    expect(screen.getByLabelText(/ownerMgmt\.firstName/)).toBeInTheDocument()
    expect(screen.getByLabelText(/ownerMgmt\.lastName/)).toBeInTheDocument()
    expect(screen.getByLabelText(/ownerMgmt\.email/)).toBeInTheDocument()
  })

  it('submits create form and refreshes list', async () => {
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(screen.getByLabelText(/ownerMgmt\.firstName/), {
      target: { value: 'New' },
    })
    fireEvent.change(screen.getByLabelText(/ownerMgmt\.lastName/), {
      target: { value: 'Owner' },
    })
    fireEvent.change(screen.getByLabelText(/ownerMgmt\.email/), {
      target: { value: 'new@test.com' },
    })

    fetchMock.mockResolvedValueOnce(okJson({ id: 3 }))
    fetchMock.mockResolvedValueOnce(okJson({ owners: [] }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/owners',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'common.edit',
    )
    expect(
      (screen.getByLabelText(/ownerMgmt\.firstName/) as HTMLInputElement).value,
    ).toBe('Anna')
  })

  it('submits edit form with PUT and refreshes', async () => {
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    fireEvent.change(screen.getByLabelText(/ownerMgmt\.firstName/), {
      target: { value: 'Updated' },
    })

    fetchMock.mockResolvedValueOnce(okJson({ id: 1 }))
    fetchMock.mockResolvedValueOnce(
      okJson({
        owners: [
          { id: 1, firstName: 'Updated', lastName: 'S', email: 'a@b.com' },
        ],
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/owners/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
  })

  it('closes form when cancel is clicked', async () => {
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(screen.getByLabelText(/ownerMgmt\.firstName/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(screen.queryByLabelText(/ownerMgmt\.firstName/)).toBeNull()
  })

  it('calls delete with confirm and refreshes', async () => {
    confirmMock.mockResolvedValue(true)
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(
      okJson({
        owners: [{ id: 2, firstName: 'Erik', lastName: 'L', email: 'e@t.com' }],
      }),
    )

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger' }),
      )
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/owners/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('does not delete when confirm returns false', async () => {
    confirmMock.mockResolvedValue(false)
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled()
    })

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/owners/1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('disables form fields while submitting', async () => {
    let resolveFetch: (() => void) | undefined
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    const firstNameInput = screen.getByLabelText(/ownerMgmt\.firstName/)
    const lastNameInput = screen.getByLabelText(/ownerMgmt\.lastName/)
    const emailInput = screen.getByLabelText(/ownerMgmt\.email/)
    fireEvent.change(firstNameInput, { target: { value: 'Test' } })
    fireEvent.change(lastNameInput, { target: { value: 'User' } })
    fireEvent.change(emailInput, { target: { value: 'test@test.com' } })

    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFetch = () => resolve(okJson({ id: 99 }))
        }),
    )
    fetchMock.mockResolvedValueOnce(okJson({ owners: [] }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      const fieldset = firstNameInput.closest('fieldset')
      expect(fieldset).toBeDisabled()
    })

    resolveFetch?.()

    await waitFor(() => {
      expect(screen.queryByLabelText(/ownerMgmt\.firstName/)).toBeNull()
    })
  })

  it('shows sr-only actions header in table', async () => {
    render(<OwnersClient />)
    await waitFor(() => {
      expect(screen.getByText('Anna S')).toBeInTheDocument()
    })
    const srLabel = document.querySelector('th .sr-only')
    expect(srLabel).toBeInTheDocument()
    expect(srLabel).toHaveTextContent('common.actions')
  })
})
