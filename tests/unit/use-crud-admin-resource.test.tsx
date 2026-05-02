import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'

const confirmMock = vi.fn()

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

interface TestItem {
  id: number
  name: string
}

interface TestForm {
  name: string
}

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {},
) {
  return {
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => body,
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    text: async () => JSON.stringify(body),
  } as Response
}

function renderResource(
  options: Partial<
    Parameters<typeof useCrudAdminResource<TestItem, TestForm>>[0]
  > = {},
) {
  return renderHook(() =>
    useCrudAdminResource<TestItem, TestForm>({
      confirmDeleteMessage: 'Delete?',
      endpoint: '/api/test-items',
      errorMessage: 'Something failed',
      getInitialForm: () => ({ name: '' }),
      listKey: 'items',
      toForm: item => ({ name: item.name }),
      toPayload: form => form,
      ...options,
    }),
  )
}

describe('useCrudAdminResource', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockResolvedValue(true)
  })

  it('fetches the initial item list', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 1, name: 'Existing' }] }),
    )

    const { result } = renderResource()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([{ id: 1, name: 'Existing' }])
    expect(fetchMock).toHaveBeenCalledWith('/api/test-items')
  })

  it('uses a custom list endpoint when one is provided', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 4, name: 'Listed elsewhere' }] }),
    )

    const { result } = renderResource({ listEndpoint: '/api/test-items/all' })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([{ id: 4, name: 'Listed elsewhere' }])
    expect(fetchMock).toHaveBeenCalledWith('/api/test-items/all')
  })

  it('does not refetch when only the caught-error normalizer identity changes', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [] }))

    const { rerender, result } = renderHook(
      ({ label }: { label: string }) =>
        useCrudAdminResource<TestItem, TestForm>({
          confirmDeleteMessage: 'Delete?',
          endpoint: '/api/test-items',
          errorMessage: 'Something failed',
          getCaughtErrorMessage: () => label,
          getInitialForm: () => ({ name: '' }),
          listKey: 'items',
          toForm: item => ({ name: item.name }),
          toPayload: form => form,
        }),
      { initialProps: { label: 'first fallback' } },
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender({ label: 'second fallback' })

    await act(async () => {})

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('submits a create request and reloads the list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 2, name: 'Created' }))
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: 2, name: 'Created' }] }),
      )

    const { result } = renderResource()

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.openCreate()
      result.current.setForm({ name: 'Created' })
    })

    await act(async () => {
      await result.current.submit()
    })

    const submitInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(fetchMock.mock.calls[1][0]).toBe('/api/test-items')
    expect(submitInit.method).toBe('POST')
    expect(submitInit.body).toBe(JSON.stringify({ name: 'Created' }))
    expect(result.current.showForm).toBe(false)
    expect(result.current.items).toEqual([{ id: 2, name: 'Created' }])
  })

  it('prefills the form for editing', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ items: [{ id: 7, name: 'Editable' }] }),
    )

    const { result } = renderResource()

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.openEdit({ id: 7, name: 'Editable' })
    })

    expect(result.current.editId).toBe(7)
    expect(result.current.form).toEqual({ name: 'Editable' })
    expect(result.current.showForm).toBe(true)
  })

  it('confirms deletion, deletes the item, and reloads', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 1, name: 'One' }] }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const { result } = renderResource()
    const anchorEl = document.createElement('button')

    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.remove(1, anchorEl)
    })

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorEl,
        icon: 'caution',
        message: 'Delete?',
        variant: 'danger',
      }),
    )
    expect(fetchMock.mock.calls[1][0]).toBe('/api/test-items/1')
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('DELETE')
    expect(result.current.items).toEqual([])
  })

  it('surfaces server errors without closing the form', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'Name already exists' },
          { ok: false, status: 409, statusText: 'Conflict' },
        ),
      )

    const { result } = renderResource()

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.openCreate()
      result.current.setForm({ name: 'Duplicate' })
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.formError).toBe('Name already exists')
    expect(result.current.showForm).toBe(true)
  })

  it('can delegate submit errors to a page-level presenter', async () => {
    const onSubmitError = vi.fn()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'Show this elsewhere' },
          { ok: false, status: 400, statusText: 'Bad Request' },
        ),
      )

    const { result } = renderResource({ onSubmitError })

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.openCreate()
      result.current.setForm({ name: 'Bad' })
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(onSubmitError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Show this elsewhere' }),
    )
    expect(result.current.formError).toBeNull()
    expect(result.current.showForm).toBe(true)
  })

  it('resets form errors when switching between create and edit', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ id: 8, name: 'Editable' }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'Cannot save' },
          { ok: false, status: 400, statusText: 'Bad Request' },
        ),
      )

    const { result } = renderResource()

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.openCreate()
      result.current.setForm({ name: 'Bad' })
    })

    await act(async () => {
      await result.current.submit()
    })

    expect(result.current.formError).toBe('Cannot save')

    act(() => {
      result.current.openEdit({ id: 8, name: 'Editable' })
    })

    expect(result.current.formError).toBeNull()
    expect(result.current.form).toEqual({ name: 'Editable' })
  })

  it('allows pages to normalize caught errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network details'))

    const { result } = renderResource({
      getCaughtErrorMessage: () => 'Friendly fallback',
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadError).toBe('Friendly fallback')
  })

  it('can reload after a delegated delete error', async () => {
    const onDeleteError = vi.fn()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 1, name: 'One' }] }))
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'Cannot delete' },
          { ok: false, status: 400, statusText: 'Bad Request' },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 1, name: 'One' }] }))

    const { result } = renderResource({
      onDeleteError,
      reloadOnDeleteError: true,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.remove(1)
    })

    expect(onDeleteError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Cannot delete' }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.current.deleteError).toBeNull()
  })

  it('ignores duplicate submits while a request is pending', async () => {
    let resolveSubmit: (response: Response) => void = () => {}
    const pendingSubmit = new Promise<Response>(resolve => {
      resolveSubmit = resolve
    })
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockReturnValueOnce(pendingSubmit)
      .mockResolvedValueOnce(jsonResponse({ items: [] }))

    const { result } = renderResource()

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => {
      result.current.openCreate()
      result.current.setForm({ name: 'Pending' })
    })

    let firstSubmit: Promise<boolean> = Promise.resolve(false)
    let secondSubmit: Promise<boolean> = Promise.resolve(false)
    act(() => {
      firstSubmit = result.current.submit()
      secondSubmit = result.current.submit()
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveSubmit(jsonResponse({ id: 3, name: 'Pending' }))
      await firstSubmit
      await secondSubmit
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
