import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AddToSpecificationDialog from '@/app/[locale]/requirements/[id]/_detail/AddToSpecificationDialog'
import {
  type UseAddToSpecificationDialogResult,
  useAddToSpecificationDialog,
} from '@/app/[locale]/requirements/[id]/_detail/use-add-to-specification-dialog'

const apiFetchMock = vi.fn()
const readResponseMessageMock = vi.fn()

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/lib/http/api-fetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}))

vi.mock('@/lib/http/response-message', () => ({
  readResponseMessage: (...args: unknown[]) => readResponseMessageMock(...args),
}))

function response(body: unknown, ok = true): Response {
  return { json: vi.fn(async () => body), ok } as unknown as Response
}

function dialogResult(
  state: Partial<UseAddToSpecificationDialogResult['state']> = {},
): UseAddToSpecificationDialogResult {
  return {
    closeDialog: vi.fn(),
    handleSpecificationSelect: vi.fn(async () => {}),
    handleSubmit: vi.fn(async event => event.preventDefault()),
    openDialog: vi.fn(async () => {}),
    setNeedsReferenceDescription: vi.fn(),
    setNeedsReferenceMode: vi.fn(),
    setNeedsReferenceText: vi.fn(),
    state: {
      addToSpecificationError: null,
      addToSpecificationStatus: 'idle',
      availableNeedsRefs: [],
      isOpen: true,
      needsReferenceDescription: '',
      needsReferenceId: '',
      needsReferenceMode: 'none',
      needsReferencesError: null,
      needsReferencesLoading: false,
      needsReferenceText: '',
      openHelp: new Set(),
      specificationId: '',
      specifications: [],
      specificationsError: null,
      specificationsLoading: false,
      ...state,
    },
    toggleHelp: vi.fn(),
  }
}

describe('AddToSpecificationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiFetchMock.mockReset()
    readResponseMessageMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the empty specification state and closes from the backdrop', async () => {
    const dialog = dialogResult()

    render(
      <AddToSpecificationDialog dialog={dialog} onDocumentKeyDown={vi.fn()} />,
    )

    const modal = screen.getByRole('dialog')
    expect(
      screen.getByText('specification.noSpecificationsAvailable'),
    ).toBeVisible()
    await userEvent.click(modal)
    expect(dialog.closeDialog).toHaveBeenCalledOnce()
  })

  it('exposes existing needs references and forwards none and existing selections', async () => {
    const dialog = dialogResult({
      availableNeedsRefs: [{ id: 12, text: 'IAM-12' }],
      needsReferenceId: 12,
      needsReferenceMode: 'existing',
      specificationId: '7',
      specifications: [{ id: 7, name: 'IAM specification' }],
    })

    render(
      <AddToSpecificationDialog dialog={dialog} onDocumentKeyDown={vi.fn()} />,
    )

    const modal = screen.getByRole('dialog')
    const needsReference = within(modal).getByRole('combobox', {
      name: /specification\.needsReferenceLabel/,
    })
    expect(needsReference).toHaveValue('12')

    await userEvent.selectOptions(needsReference, 'none')
    await userEvent.selectOptions(needsReference, '12')

    expect(dialog.setNeedsReferenceMode).toHaveBeenNthCalledWith(1, 'none')
    expect(dialog.setNeedsReferenceMode).toHaveBeenNthCalledWith(
      2,
      'existing',
      12,
    )
  })

  it('ignores non-Escape backdrop keys and closes on Escape', () => {
    const dialog = dialogResult()

    render(
      <AddToSpecificationDialog dialog={dialog} onDocumentKeyDown={vi.fn()} />,
    )

    const modal = screen.getByRole('dialog')
    modal.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'A' }),
    )
    expect(dialog.closeDialog).not.toHaveBeenCalled()
    modal.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }),
    )
    expect(dialog.closeDialog).toHaveBeenCalledOnce()
  })

  it('forwards specification, new-reference, text, description, and help changes', async () => {
    const dialog = dialogResult({
      needsReferenceMode: 'new',
      specificationId: '7',
      specifications: [
        { id: 7, name: 'IAM specification' },
        { id: 8, name: 'Security specification' },
      ],
    })

    render(
      <AddToSpecificationDialog dialog={dialog} onDocumentKeyDown={vi.fn()} />,
    )

    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: /specification\.selectSpecification/,
      }),
      '8',
    )
    await userEvent.selectOptions(
      screen.getByRole('combobox', {
        name: /specification\.needsReferenceLabel/,
      }),
      'new',
    )
    fireEvent.change(
      screen.getByRole('textbox', {
        name: /specification\.addNeedsRefTextLabel/,
      }),
      { target: { value: 'IAM-42' } },
    )
    fireEvent.change(
      screen.getByRole('textbox', {
        name: /specification\.needsReferenceDescription/,
      }),
      { target: { value: 'Access management' } },
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'common.help: specification.addNeedsRefTextLabel',
      }),
    )

    expect(dialog.handleSpecificationSelect).toHaveBeenCalledWith('8')
    expect(dialog.setNeedsReferenceMode).toHaveBeenCalledWith('new')
    expect(dialog.setNeedsReferenceText).toHaveBeenCalledWith('IAM-42')
    expect(dialog.setNeedsReferenceDescription).toHaveBeenCalledWith(
      'Access management',
    )
    expect(dialog.toggleHelp).toHaveBeenCalledWith('atp-needs-ref-text')
  })

  it.each([
    [
      { addToSpecificationStatus: 'success' as const },
      'specification.addToSpecificationSuccess',
    ],
    [{ specificationsLoading: true }, 'specification.loadingSpecifications'],
    [
      { specificationsError: 'Specifications unavailable' },
      'Specifications unavailable',
    ],
  ])('renders the observable dialog state %#', (state, text) => {
    render(
      <AddToSpecificationDialog
        dialog={dialogResult(state)}
        onDocumentKeyDown={vi.fn()}
      />,
    )

    expect(screen.getByText(text)).toBeVisible()
  })

  it('renders no dialog content while closed', () => {
    render(
      <AddToSpecificationDialog
        dialog={dialogResult({ isOpen: false })}
        onDocumentKeyDown={vi.fn()}
      />,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('useAddToSpecificationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiFetchMock.mockReset()
    readResponseMessageMock.mockReset()
    readResponseMessageMock.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('loads specifications once and reuses them when reopening', async () => {
    apiFetchMock.mockResolvedValue(
      response({ specifications: [{ id: 7, name: 'IAM specification' }] }),
    )
    const { result } = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )

    await act(async () => result.current.openDialog())
    expect(result.current.state.specifications).toEqual([
      { id: 7, name: 'IAM specification' },
    ])
    act(() => result.current.closeDialog())
    await act(async () => result.current.openDialog())

    expect(result.current.state.isOpen).toBe(true)
    expect(apiFetchMock).toHaveBeenCalledOnce()
  })

  it('uses an empty list for a specification response without rows', async () => {
    apiFetchMock.mockResolvedValue(response({}))
    const { result } = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )

    await act(async () => result.current.openDialog())

    expect(result.current.state.specifications).toEqual([])
    expect(result.current.state.specificationsLoading).toBe(false)
  })

  it('shows response details and fallback errors when specification loading fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiFetchMock.mockResolvedValueOnce(response({}, false))
    readResponseMessageMock.mockResolvedValueOnce('Service unavailable')
    const first = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )

    await act(async () => first.result.current.openDialog())
    expect(first.result.current.state.specificationsError).toBe(
      'specification.loadSpecificationsFailed: Service unavailable',
    )
    first.unmount()

    apiFetchMock.mockRejectedValueOnce('network unavailable')
    const second = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )
    await act(async () => second.result.current.openDialog())
    expect(second.result.current.state.specificationsError).toBe(
      'specification.loadSpecificationsFailed',
    )
  })

  it('clears a specification selection without loading needs references', async () => {
    const { result } = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )

    await act(async () => result.current.handleSpecificationSelect(''))

    expect(result.current.state.specificationId).toBe('')
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('loads needs references and exposes each needs-reference field action', async () => {
    apiFetchMock.mockResolvedValue(
      response({ needsReferences: [{ id: 12, text: 'IAM-12' }] }),
    )
    const { result } = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )

    await act(async () => result.current.handleSpecificationSelect('7'))
    act(() => {
      result.current.setNeedsReferenceMode('existing', 12)
      result.current.setNeedsReferenceText('IAM-42')
      result.current.setNeedsReferenceDescription('Access management')
      result.current.toggleHelp('needs-reference')
    })

    expect(result.current.state.availableNeedsRefs).toEqual([
      { id: 12, text: 'IAM-12' },
    ])
    expect(result.current.state.needsReferenceId).toBe(12)
    expect(result.current.state.needsReferenceText).toBe('IAM-42')
    expect(result.current.state.needsReferenceDescription).toBe(
      'Access management',
    )
    expect(result.current.state.openHelp.has('needs-reference')).toBe(true)
    act(() => result.current.toggleHelp('needs-reference'))
    expect(result.current.state.openHelp.has('needs-reference')).toBe(false)
  })

  it('uses the localized fallback for non-Error needs-reference failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    apiFetchMock.mockRejectedValue('network unavailable')
    const { result } = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )

    await act(async () => result.current.handleSpecificationSelect('7'))

    expect(result.current.state.needsReferencesError).toBe(
      'specification.failedToLoadNeedsReferences',
    )
    expect(result.current.state.needsReferencesLoading).toBe(false)
  })

  it('does not submit without both a specification and requirement identity', async () => {
    const event = { preventDefault: vi.fn() }
    const noSpecification = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )
    await act(async () =>
      noSpecification.result.current.handleSubmit(event as never),
    )

    const noRequirement = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: null }),
    )
    apiFetchMock.mockResolvedValue(response({ needsReferences: [] }))
    await act(async () =>
      noRequirement.result.current.handleSpecificationSelect('7'),
    )
    apiFetchMock.mockClear()
    await act(async () =>
      noRequirement.result.current.handleSubmit(event as never),
    )

    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('submits an existing needs reference and closes after success', async () => {
    vi.useFakeTimers()
    apiFetchMock
      .mockResolvedValueOnce(response({ needsReferences: [] }))
      .mockResolvedValueOnce(response({}))
    const { result } = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )
    await act(async () => result.current.handleSpecificationSelect('7'))
    act(() => result.current.setNeedsReferenceMode('existing', 12))

    await act(async () =>
      result.current.handleSubmit({ preventDefault: vi.fn() } as never),
    )

    expect(JSON.parse(String(apiFetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      needsReferenceId: 12,
      requirementIds: [41],
    })
    expect(result.current.state.addToSpecificationStatus).toBe('success')
    await act(async () => vi.advanceTimersByTimeAsync(1200))
    expect(result.current.state.isOpen).toBe(false)
  })

  it('submits a new needs reference with a null blank description', async () => {
    apiFetchMock
      .mockResolvedValueOnce(response({ needsReferences: [] }))
      .mockResolvedValueOnce(response({}))
    const { result } = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )
    await act(async () => result.current.handleSpecificationSelect('7'))
    act(() => {
      result.current.setNeedsReferenceMode('new')
      result.current.setNeedsReferenceText('  IAM-42  ')
      result.current.setNeedsReferenceDescription('   ')
    })

    await act(async () =>
      result.current.handleSubmit({ preventDefault: vi.fn() } as never),
    )

    expect(JSON.parse(String(apiFetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      needsReferenceDescription: null,
      needsReferenceText: 'IAM-42',
      requirementIds: [41],
    })
  })

  it('uses the common fallback for failed and rejected submissions', async () => {
    apiFetchMock
      .mockResolvedValueOnce(response({ needsReferences: [] }))
      .mockResolvedValueOnce(response({}, false))
    const first = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 41 }),
    )
    await act(async () => first.result.current.handleSpecificationSelect('7'))
    await act(async () =>
      first.result.current.handleSubmit({ preventDefault: vi.fn() } as never),
    )
    expect(first.result.current.state.addToSpecificationError).toBe(
      'common.error',
    )
    first.unmount()

    apiFetchMock
      .mockResolvedValueOnce(response({ needsReferences: [] }))
      .mockRejectedValueOnce(new Error('network unavailable'))
    const second = renderHook(() =>
      useAddToSpecificationDialog({ requirementInternalId: 42 }),
    )
    await act(async () => second.result.current.handleSpecificationSelect('8'))
    await act(async () =>
      second.result.current.handleSubmit({ preventDefault: vi.fn() } as never),
    )
    expect(second.result.current.state.addToSpecificationError).toBe(
      'common.error',
    )
  })
})
