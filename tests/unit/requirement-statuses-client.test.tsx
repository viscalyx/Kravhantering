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
  default: ({ label }: { label: string }) => (
    <span data-testid="status-badge">{label}</span>
  ),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}
function errJson(body: unknown) {
  return { ok: false, json: async () => body }
}
function errText(body: string, statusText = '') {
  return new Response(body, {
    status: 500,
    statusText,
    headers: { 'content-type': 'text/plain' },
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
    fetchMock.mockResolvedValue(okJson({ statuses: sampleStatuses }))
  })

  it('renders heading and create button', async () => {
    render(<RequirementStatusesClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.statuses',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
  })

  it('fetches and displays statuses', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementStatusesClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('opens create form with fields', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(screen.getByLabelText(/statusMgmt\.name.+SV/)).toBeInTheDocument()
    expect(screen.getByLabelText(/statusMgmt\.name.+EN/)).toBeInTheDocument()
    expect(screen.getByLabelText(/statusMgmt\.sortOrder/)).toBeInTheDocument()
  })

  it('submits create form', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(screen.getByLabelText(/statusMgmt\.name.+SV/), {
      target: { value: 'Ny' },
    })
    fireEvent.change(screen.getByLabelText(/statusMgmt\.name.+EN/), {
      target: { value: 'New' },
    })

    fetchMock.mockResolvedValueOnce(okJson({ id: 3 }))
    fetchMock.mockResolvedValueOnce(okJson({ statuses: sampleStatuses }))

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-statuses',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('keeps the form open when save fails and anchors the dialog to the submitter', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(screen.getByLabelText(/statusMgmt\.name.+SV/), {
      target: { value: 'Ny' },
    })
    fireEvent.change(screen.getByLabelText(/statusMgmt\.name.+EN/), {
      target: { value: 'New' },
    })

    fetchMock.mockResolvedValueOnce(errJson({ error: 'Cannot save' }))

    const saveButton = screen.getByRole('button', { name: /common\.save/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Cannot save',
          showCancel: false,
          icon: 'warning',
          anchorEl: saveButton,
        }),
      )
    })
    expect(screen.getByLabelText(/statusMgmt\.name.+SV/)).toBeInTheDocument()
  })

  it('falls back to common.error when save fails without a response message', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(screen.getByLabelText(/statusMgmt\.name.+SV/), {
      target: { value: 'Ny' },
    })
    fireEvent.change(screen.getByLabelText(/statusMgmt\.name.+EN/), {
      target: { value: 'New' },
    })

    fetchMock.mockResolvedValueOnce(errText(''))

    const saveButton = screen.getByRole('button', { name: /common\.save/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'common.error',
          showCancel: false,
          icon: 'warning',
          anchorEl: saveButton,
        }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect(
      (screen.getByLabelText(/statusMgmt\.name.+EN/) as HTMLInputElement).value,
    ).toBe('Draft')
  })

  it('closes form on cancel', async () => {
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Draft')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(screen.queryByLabelText(/statusMgmt\.name.+SV/)).toBeNull()
  })

  it('deletes non-system status with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ statuses: [sampleStatuses[0]] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-statuses/10',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('shows error when delete fails', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementStatusesClient />)
    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(errText('Cannot delete'))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(confirmMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          message: 'Cannot delete',
          showCancel: false,
          icon: 'warning',
          anchorEl: deleteButtons[0],
        }),
      )
    })
  })
})
