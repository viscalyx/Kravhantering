import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

import LifecycleStatusesClient from '@/app/[locale]/requirement-packages/lifecycle-statuses/lifecycle-statuses-client'

const sampleItems = [{ id: 1, nameSv: 'Utveckling', nameEn: 'Development' }]

async function waitForItemsLoaded() {
  await waitFor(() => {
    expect(screen.queryByText('common.loading')).toBeNull()
  })
  expect(screen.getByText('Development')).toBeInTheDocument()
}

describe('LifecycleStatusesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue(okJson({ statuses: sampleItems }))
  })

  it('renders heading and create button', async () => {
    render(<LifecycleStatusesClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.lifecycleStatuses',
    )
    expect(
      screen.getByRole('button', { name: /common\.create/i }),
    ).toBeInTheDocument()
    await waitForItemsLoaded()
  })

  it('fetches and displays items', async () => {
    render(<LifecycleStatusesClient />)
    await waitForItemsLoaded()
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<LifecycleStatusesClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('clears loading and shows an error when the initial fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))

    render(<LifecycleStatusesClient />)

    await waitFor(() => {
      expect(screen.getByText('common.loading')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByText('common.loading')).toBeNull()
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'common.unexpectedError',
    )
  })

  it('opens create form', async () => {
    const user = userEvent.setup()
    render(<LifecycleStatusesClient />)
    await waitForItemsLoaded()
    await user.click(screen.getByRole('button', { name: /common\.create/i }))
    expect(
      screen.getByRole('textbox', { name: /lifecycleStatusMgmt\.name.+SV/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /lifecycleStatusMgmt\.name.+EN/ }),
    ).toBeInTheDocument()
  })

  it('submits create form', async () => {
    const user = userEvent.setup()
    render(<LifecycleStatusesClient />)
    await waitForItemsLoaded()
    await user.click(screen.getByRole('button', { name: /common\.create/i }))

    fireEvent.change(
      screen.getByRole('textbox', { name: /lifecycleStatusMgmt\.name.+SV/ }),
      { target: { value: 'Ny' } },
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: /lifecycleStatusMgmt\.name.+EN/ }),
      { target: { value: 'New' } },
    )

    fetchMock.mockResolvedValueOnce(okJson({ id: 2 }))
    fetchMock.mockResolvedValueOnce(okJson({ statuses: sampleItems }))

    await user.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/package-lifecycle-statuses',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    const user = userEvent.setup()
    render(<LifecycleStatusesClient />)
    await waitForItemsLoaded()
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    await user.click(editButtons[0])
    expect(
      (
        screen.getByRole('textbox', {
          name: /lifecycleStatusMgmt\.name.+EN/,
        }) as HTMLInputElement
      ).value,
    ).toBe('Development')
  })

  it('closes form on cancel', async () => {
    const user = userEvent.setup()
    render(<LifecycleStatusesClient />)
    await waitForItemsLoaded()
    await user.click(screen.getByRole('button', { name: /common\.create/i }))
    await user.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByRole('textbox', { name: /lifecycleStatusMgmt\.name.+SV/ }),
    ).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<LifecycleStatusesClient />)
    await waitForItemsLoaded()

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ statuses: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    expect(deleteButtons[0]).not.toBeDisabled()
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/package-lifecycle-statuses/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
