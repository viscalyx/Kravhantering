import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmModalMock,
  failedJsonResponse,
  iconPickerMock,
  okJsonResponse,
  statusBadgeMock,
} from './helpers/admin-client-test-helpers'

const state = vi.hoisted(() => ({
  confirm: vi.fn(),
  locale: 'en',
}))

vi.mock('next-intl', () => ({
  useLocale: () => state.locale,
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/components/ConfirmModal', () => confirmModalMock(state.confirm))

vi.mock('@/components/IconPicker', () => iconPickerMock())
vi.mock('@/components/StatusBadge', () => statusBadgeMock())

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementStatusesClient from '@/app/[locale]/requirement-statuses/requirement-statuses-client'

const statuses = [
  {
    color: '#123456',
    iconName: null,
    id: 1,
    isSystem: true,
    nameEn: 'Draft',
    nameSv: 'Utkast',
    sortOrder: 1,
  },
  {
    color: null,
    iconName: null,
    id: 2,
    isSystem: true,
    nameEn: 'Review',
    nameSv: 'Granskning',
    sortOrder: 2,
  },
  {
    color: '#abcdef',
    iconName: null,
    id: 9,
    isSystem: false,
    nameEn: 'Custom',
    nameSv: 'Anpassad',
    sortOrder: 9,
  },
]

describe('RequirementStatusesClient observable branch behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.locale = 'en'
    fetchMock.mockResolvedValue(okJsonResponse({ statuses }))
  })

  it('shows only localized system statuses and flags invalid stored colors', async () => {
    state.locale = 'sv'
    render(<RequirementStatusesClient />)

    expect(await screen.findByText('Utkast')).toBeInTheDocument()
    expect(screen.getByText('Granskning')).toBeInTheDocument()
    expect(screen.queryByText('Anpassad')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'statusMgmt.invalidStoredColors',
    )
  })

  it('edits every field and submits the visible values', async () => {
    render(<RequirementStatusesClient />)
    await screen.findByText('Draft')
    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[0])

    fireEvent.change(document.getElementById('status-name-sv') as HTMLElement, {
      target: { value: 'Nytt' },
    })
    fireEvent.change(document.getElementById('status-name-en') as HTMLElement, {
      target: { value: 'New' },
    })
    fireEvent.change(
      document.getElementById('status-sort-order') as HTMLElement,
      { target: { value: '3' } },
    )
    fireEvent.change(screen.getByLabelText('statusMgmt.colorPicker'), {
      target: { value: '#654321' },
    })
    fireEvent.change(screen.getByLabelText('statusMgmt.colorHex'), {
      target: { value: '#abcdef' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'choose icon' }))

    fetchMock.mockResolvedValueOnce(okJsonResponse({ id: 1 }))
    fetchMock.mockResolvedValueOnce(okJsonResponse({ statuses }))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(
        ([url, options]) =>
          url === '/api/requirement-statuses/1' && options?.method === 'PUT',
      )
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({
        color: '#abcdef',
        iconName: 'Circle',
        nameEn: 'New',
        nameSv: 'Nytt',
        sortOrder: 3,
      })
    })
  })

  it('presents response and thrown submit failures without exposing internals', async () => {
    render(<RequirementStatusesClient />)
    await screen.findByText('Draft')
    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[0])
    fireEvent.change(document.getElementById('status-name-en') as HTMLElement, {
      target: { value: 'Changed' },
    })

    fetchMock.mockResolvedValueOnce(failedJsonResponse({ error: '' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() =>
      expect(state.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'common.error', showCancel: false }),
      ),
    )

    fetchMock.mockRejectedValueOnce('network failure')
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() => expect(state.confirm).toHaveBeenCalledTimes(2))
  })

  it('edits a nullable status in Swedish and presents Error submit messages', async () => {
    state.locale = 'sv'
    render(<RequirementStatusesClient />)
    await screen.findByText('Granskning')
    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[1])

    expect(screen.getByLabelText('statusMgmt.colorHex')).toHaveValue('')
    expect(document.getElementById('status-name-sv')).toHaveValue('Granskning')
    fireEvent.change(screen.getByLabelText('statusMgmt.colorHex'), {
      target: { value: '#abcdef' },
    })

    fetchMock.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() =>
      expect(state.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'offline', showCancel: false }),
      ),
    )

    fetchMock.mockRejectedValueOnce(new Error(''))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await waitFor(() =>
      expect(state.confirm).toHaveBeenLastCalledWith(
        expect.objectContaining({ message: 'common.error', showCancel: false }),
      ),
    )
  })
})
