import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { okResponse } from './test-helpers'

const confirmMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import ResponsibilityAreasClient from '@/app/[locale]/requirement-packages/responsibility-areas/responsibility-areas-client'

describe('ResponsibilityAreasClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    confirmMock.mockResolvedValue(true)
    fetchMock.mockResolvedValue(
      okResponse({
        areas: [
          { id: 1, nameEn: 'Architecture', nameSv: 'Arkitektur' },
          { id: 2, nameEn: 'Operations', nameSv: 'Drift' },
        ],
      }),
    )
  })

  it('renders the heading, create button, and table rows', async () => {
    render(<ResponsibilityAreasClient />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.responsibilityAreas',
    )
    expect(
      screen.getByRole('button', { name: 'common.create' }),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Architecture')).toBeInTheDocument()
    })
    expect(screen.getByText('Operations')).toBeInTheDocument()
  })

  it('opens and submits the create form', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ areas: [] }))
      .mockResolvedValueOnce(
        okResponse({ id: 3, nameEn: 'Security', nameSv: 'Säkerhet' }),
      )
      .mockResolvedValueOnce(
        okResponse({
          areas: [{ id: 3, nameEn: 'Security', nameSv: 'Säkerhet' }],
        }),
      )

    render(<ResponsibilityAreasClient />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'common.create' }))
    fireEvent.change(
      screen.getByRole('textbox', {
        name: /responsibilityAreaMgmt\.nameSvLabel/,
      }),
      {
        target: { value: 'Säkerhet' },
      },
    )
    fireEvent.change(
      screen.getByRole('textbox', {
        name: /responsibilityAreaMgmt\.nameEnLabel/,
      }),
      {
        target: { value: 'Security' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      expect(screen.getByText('Security')).toBeInTheDocument()
    })
    const submitInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(fetchMock.mock.calls[1][0]).toBe('/api/package-responsibility-areas')
    expect(submitInit.method).toBe('POST')
    expect(JSON.parse(submitInit.body as string)).toEqual({
      nameEn: 'Security',
      nameSv: 'Säkerhet',
    })
  })

  it('prefills the edit form', async () => {
    render(<ResponsibilityAreasClient />)

    await waitFor(() => {
      expect(screen.getByText('Architecture')).toBeInTheDocument()
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'common.edit' })[0])

    expect(
      screen.getByRole('textbox', {
        name: /responsibilityAreaMgmt\.nameSvLabel/,
      }),
    ).toHaveValue('Arkitektur')
    expect(
      screen.getByRole('textbox', {
        name: /responsibilityAreaMgmt\.nameEnLabel/,
      }),
    ).toHaveValue('Architecture')
  })

  it('confirms and deletes a row', async () => {
    fetchMock
      .mockResolvedValueOnce(
        okResponse({
          areas: [{ id: 1, nameEn: 'Architecture', nameSv: 'Arkitektur' }],
        }),
      )
      .mockResolvedValueOnce(okResponse({ ok: true }))
      .mockResolvedValueOnce(okResponse({ areas: [] }))

    render(<ResponsibilityAreasClient />)

    await waitFor(() => {
      expect(screen.getByText('Architecture')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'common.delete' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        icon: 'caution',
        message: 'common.confirm',
        variant: 'danger',
      }),
    )
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/package-responsibility-areas/1',
    )
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('DELETE')
  })
})
