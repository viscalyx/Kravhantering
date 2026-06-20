import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CoAuthorsManagementModal from '@/components/CoAuthorsManagementModal'

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
  const text = JSON.stringify(body)
  return { ok: true, json: async () => body, text: async () => text }
}

function errJson(body: unknown, status = 500, statusText = 'Server Error') {
  const text = JSON.stringify(body)
  return {
    json: async () => body,
    ok: false,
    status,
    statusText,
    text: async () => text,
  }
}

const hsaIdPrefixPayload = {
  prefixes: [{ id: 1, isDefault: true, label: null, prefix: 'SE5560000001' }],
}

let fetchMock: ReturnType<typeof vi.fn>

function renderModal(onChanged = vi.fn()) {
  render(
    <CoAuthorsManagementModal
      description="Manage the co-authors."
      developerModeValue="manage specification co-authors"
      endpoint="/api/requirements-specifications/ETJANST-UPP-2026/co-authors"
      hsaIdHelp="specification.help.coAuthorHsaId"
      hsaIdLabel="specification.coAuthorHsaId"
      loadErrorMessage="specification.loadCoAuthorsFailed"
      noCoAuthorsMessage="specification.noCoAuthors"
      onChanged={onChanged}
      onClose={() => {}}
      open
      purpose="requirements_specification_co_author"
      removeConfirmMessage={() => 'specification.removeCoAuthorConfirm'}
      removeLabel="specification.removeCoAuthor"
      saveErrorMessage="specification.saveCoAuthorsFailed"
      scopeId={7}
      title="specification.manageCoAuthors"
      titleId="specification-co-authors-title"
    />,
  )
}

describe('CoAuthorsManagementModal', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockReset()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('autosaves a verified co-author assignment', async () => {
    const onChanged = vi.fn()
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (
        url === '/api/requirements-specifications/ETJANST-UPP-2026/co-authors'
      ) {
        if (opts?.method === 'PUT') return Promise.resolve(okJson({ ok: true }))
        return Promise.resolve(okJson({ coAuthors: [] }))
      }
      if (url === '/api/requirement-responsibility-people/verify') {
        return Promise.resolve(
          okJson({
            person: {
              displayName: 'Cora CoAuthor',
              email: 'cora.coauthor@example.test',
              givenName: 'Cora',
              hsaId: 'SE5560000001-coa1',
              middleName: null,
              surname: 'CoAuthor',
            },
          }),
        )
      }
      return Promise.resolve(okJson({}))
    })

    renderModal(onChanged)

    await waitFor(() => {
      expect(screen.getByText('specification.noCoAuthors')).toBeInTheDocument()
    })
    const coAuthorInput = screen.getByRole('textbox', {
      name: /specification\.coAuthorHsaId/,
    })
    await waitFor(() => expect(coAuthorInput).toBeEnabled())
    fireEvent.change(coAuthorInput, { target: { value: 'coa1' } })
    let verifyButton: HTMLButtonElement | undefined
    await waitFor(() => {
      verifyButton = screen
        .getAllByRole('button', { name: /common\.fetchHsaPerson/ })
        .find(button => !(button as HTMLButtonElement).disabled) as
        | HTMLButtonElement
        | undefined
      expect(verifyButton).toBeTruthy()
    })
    fireEvent.click(verifyButton as HTMLButtonElement)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/ETJANST-UPP-2026/co-authors',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const verifyCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/requirement-responsibility-people/verify',
    ) as [string, RequestInit]
    expect(JSON.parse((verifyCall[1].body as string) ?? '{}')).toMatchObject({
      hsaId: 'SE5560000001-coa1',
      purpose: 'requirements_specification_co_author',
      scopeId: 7,
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url ===
          '/api/requirements-specifications/ETJANST-UPP-2026/co-authors' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    expect(JSON.parse((putCall[1].body as string) ?? '{}')).toEqual({
      coAuthorHsaIds: ['SE5560000001-coa1'],
    })
    expect(await screen.findByText('Cora CoAuthor')).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('shows an error and keeps the co-author draft when assignment autosave fails', async () => {
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (
        url === '/api/requirements-specifications/ETJANST-UPP-2026/co-authors'
      ) {
        if (opts?.method === 'PUT') {
          return Promise.resolve(
            errJson(
              { error: 'Specification co-author autosave failed' },
              409,
              'Conflict',
            ),
          )
        }
        return Promise.resolve(okJson({ coAuthors: [] }))
      }
      if (url === '/api/requirement-responsibility-people/verify') {
        return Promise.resolve(
          okJson({
            person: {
              displayName: 'Cora CoAuthor',
              email: 'cora.coauthor@example.test',
              givenName: 'Cora',
              hsaId: 'SE5560000001-coa1',
              middleName: null,
              surname: 'CoAuthor',
            },
          }),
        )
      }
      return Promise.resolve(okJson({}))
    })

    renderModal()

    await waitFor(() => {
      expect(screen.getByText('specification.noCoAuthors')).toBeInTheDocument()
    })
    const coAuthorInput = screen.getByRole('textbox', {
      name: /specification\.coAuthorHsaId/,
    })
    await waitFor(() => expect(coAuthorInput).toBeEnabled())
    fireEvent.change(coAuthorInput, { target: { value: 'coa1' } })
    let verifyButton: HTMLButtonElement | undefined
    await waitFor(() => {
      verifyButton = screen
        .getAllByRole('button', { name: /common\.fetchHsaPerson/ })
        .find(button => !(button as HTMLButtonElement).disabled) as
        | HTMLButtonElement
        | undefined
      expect(verifyButton).toBeTruthy()
    })
    fireEvent.click(verifyButton as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Specification co-author autosave failed',
      )
    })
    expect(screen.getByText('specification.noCoAuthors')).toBeInTheDocument()
    expect(coAuthorInput).toHaveValue('coa1')
  })

  it('confirms and autosaves co-author removal', async () => {
    confirmMock.mockResolvedValue(true)
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (
        url === '/api/requirements-specifications/ETJANST-UPP-2026/co-authors'
      ) {
        if (opts?.method === 'PUT') return Promise.resolve(okJson({ ok: true }))
        return Promise.resolve(
          okJson({
            coAuthors: [
              {
                displayName: 'no-user',
                email: 'cora.coauthor@example.test',
                hsaId: 'SE5560000001-coa1',
              },
            ],
          }),
        )
      }
      return Promise.resolve(okJson({}))
    })

    renderModal()

    await waitFor(() => {
      expect(screen.getByText('Anonymous')).toBeInTheDocument()
    })
    expect(screen.queryByText('no-user')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: /specification\.removeCoAuthor/ }),
    )

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'specification.removeCoAuthorConfirm',
          variant: 'danger',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirements-specifications/ETJANST-UPP-2026/co-authors',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url ===
          '/api/requirements-specifications/ETJANST-UPP-2026/co-authors' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    expect(JSON.parse((putCall[1].body as string) ?? '{}')).toEqual({
      coAuthorHsaIds: [],
    })
  })

  it('shows an error and keeps the co-author when removal autosave fails', async () => {
    confirmMock.mockResolvedValue(true)
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (
        url === '/api/requirements-specifications/ETJANST-UPP-2026/co-authors'
      ) {
        if (opts?.method === 'PUT') {
          return Promise.resolve(
            errJson(
              { error: 'Specification co-author removal failed' },
              409,
              'Conflict',
            ),
          )
        }
        return Promise.resolve(
          okJson({
            coAuthors: [
              {
                displayName: 'Cora CoAuthor',
                email: 'cora.coauthor@example.test',
                hsaId: 'SE5560000001-coa1',
              },
            ],
          }),
        )
      }
      return Promise.resolve(okJson({}))
    })

    renderModal()

    await waitFor(() => {
      expect(screen.getByText('Cora CoAuthor')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /specification\.removeCoAuthor/ }),
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Specification co-author removal failed',
      )
    })
    expect(screen.getByText('Cora CoAuthor')).toBeInTheDocument()
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url ===
          '/api/requirements-specifications/ETJANST-UPP-2026/co-authors' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    expect(JSON.parse((putCall[1].body as string) ?? '{}')).toEqual({
      coAuthorHsaIds: [],
    })
  })
})
