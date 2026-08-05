import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'

const confirm = vi.fn()
vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

const response = (body: unknown, ok = true) =>
  ({
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Error',
    text: async () => JSON.stringify(body),
  }) as Response

function resource(
  options: Partial<
    Parameters<
      typeof useCrudAdminResource<
        { id: number; name: string },
        { name: string }
      >
    >[0]
  > = {},
) {
  return renderHook(() =>
    useCrudAdminResource({
      confirmDeleteMessage: 'Delete?',
      endpoint: '/api/items',
      errorMessage: 'Fallback',
      getInitialForm: () => ({ name: '' }),
      listKey: 'items',
      toForm: item => ({ name: item.name }),
      toPayload: form => form,
      ...options,
    }),
  )
}

describe('Issue 891 CRUD resource branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirm.mockResolvedValue(true)
  })

  it('reports non-ok and thrown initial loads with server and fallback messages', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ error: 'Server load error' }, false),
    )
    const first = resource()
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.loadError).toBe('Server load error')
    first.unmount()

    fetchMock.mockRejectedValueOnce('network down')
    const second = resource()
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.loadError).toBe('Fallback')
  })

  it('uses custom item endpoints and keeps state when deletion is cancelled', async () => {
    fetchMock.mockResolvedValue(response({ items: [{ id: 1, name: 'One' }] }))
    const itemEndpoint = vi.fn((id: number) => `/api/custom/${id}`)
    const { result } = resource({ itemEndpoint })
    await waitFor(() => expect(result.current.loading).toBe(false))
    confirm.mockResolvedValueOnce(false)
    await act(async () => {
      await expect(result.current.remove(1)).resolves.toBe(false)
    })
    expect(itemEndpoint).not.toHaveBeenCalled()

    fetchMock.mockResolvedValueOnce(response({ ok: true }))
    fetchMock.mockResolvedValueOnce(response({ items: [] }))
    await act(async () => {
      await expect(result.current.remove(1)).resolves.toBe(true)
    })
    expect(itemEndpoint).toHaveBeenCalledWith(1)
  })

  it('stores delete response and exception errors without a delegated handler', async () => {
    fetchMock.mockResolvedValueOnce(response({ items: [] }))
    const { result } = resource()
    await waitFor(() => expect(result.current.loading).toBe(false))
    fetchMock.mockResolvedValueOnce(response({ error: 'Cannot delete' }, false))
    await act(async () => {
      await result.current.remove(1)
    })
    expect(result.current.deleteError).toBe('Cannot delete')

    fetchMock.mockRejectedValueOnce(new Error('Delete exploded'))
    await act(async () => {
      await result.current.remove(2)
    })
    expect(result.current.deleteError).toBe('Delete exploded')
  })

  it('delegates thrown delete errors and reloads when requested', async () => {
    fetchMock.mockResolvedValueOnce(response({ items: [] }))
    const onDeleteError = vi.fn()
    const { result } = resource({ onDeleteError, reloadOnDeleteError: true })
    await waitFor(() => expect(result.current.loading).toBe(false))
    fetchMock.mockRejectedValueOnce('delete failed')
    fetchMock.mockResolvedValueOnce(response({ items: [] }))
    await act(async () => {
      await result.current.remove(3, document.body)
    })
    expect(onDeleteError).toHaveBeenCalledWith(
      expect.objectContaining({ anchorEl: document.body, message: 'Fallback' }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('submits through a custom update endpoint and reports thrown errors locally', async () => {
    fetchMock.mockResolvedValueOnce(
      response({ items: [{ id: 1, name: 'One' }] }),
    )
    const { result } = resource({ itemEndpoint: id => `/api/custom/${id}` })
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.openEdit({ id: 1, name: 'One' })
      result.current.setForm({ name: 'Changed' })
    })
    fetchMock.mockRejectedValueOnce(new Error('Update exploded'))
    await act(async () => {
      await result.current.submit()
    })
    expect(result.current.formError).toBe('Update exploded')
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/custom/1',
      expect.objectContaining({ method: 'PUT' }),
    )
  })
})
