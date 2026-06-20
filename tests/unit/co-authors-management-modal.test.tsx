import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

function deferredResponse() {
  let resolve!: (response: ReturnType<typeof okJson>) => void
  const promise = new Promise<ReturnType<typeof okJson>>(resolver => {
    resolve = resolver
  })
  return { promise, resolve }
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
      loadingMessage="specification.loadingCoAuthors"
      noCoAuthorsMessage="specification.noCoAuthors"
      onChanged={onChanged}
      onClose={() => {}}
      open
      purpose="requirements_specification_co_author"
      removeConfirmMessage={() => 'specification.removeCoAuthorConfirm'}
      removeLabel="specification.removeCoAuthor"
      savedCoAuthorsHeading="specification.savedCoAuthors"
      saveErrorMessage="specification.saveCoAuthorsFailed"
      scopeId={7}
      title="specification.manageCoAuthors"
      titleId="specification-co-authors-title"
      verifiedDraftMessage={name =>
        `specification.verifiedCoAuthorDraft:${name}`
      }
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

  it('shows a loading status and keeps the add field disabled while co-authors load', async () => {
    const coAuthorsRequest = deferredResponse()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (
        url === '/api/requirements-specifications/ETJANST-UPP-2026/co-authors'
      ) {
        return coAuthorsRequest.promise
      }
      return Promise.resolve(okJson({}))
    })

    renderModal()

    expect(
      screen.getByText('specification.loadingCoAuthors'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /specification\.coAuthorHsaId/ }),
    ).toBeDisabled()

    await act(async () => {
      coAuthorsRequest.resolve(okJson({ coAuthors: [] }))
      await coAuthorsRequest.promise
    })

    await waitFor(() => {
      expect(screen.getByText('specification.noCoAuthors')).toBeInTheDocument()
    })
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
    expect(screen.getByText('specification.savedCoAuthors')).toBeInTheDocument()
    expect(screen.queryByText('common.hsaVerifyUnavailable')).toBeNull()
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
    expect(
      screen.getByRole('columnheader', { name: 'common.hsaId' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'common.hsaVerifyName' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('cora.coauthor@example.test')).toBeNull()
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
    expect(
      screen.getByText('specification.verifiedCoAuthorDraft:Cora CoAuthor'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/cora\.coauthor@example\.test/)).toBeNull()
  })

  it('renders saved co-authors as a table sorted by HSA-id', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/hsa-id-prefixes') {
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      }
      if (
        url === '/api/requirements-specifications/ETJANST-UPP-2026/co-authors'
      ) {
        return Promise.resolve(
          okJson({
            coAuthors: [
              {
                displayName: 'Zelda CoAuthor',
                email: 'zelda.coauthor@example.test',
                hsaId: 'SE5560000001-zzz',
              },
              {
                displayName: 'Ada CoAuthor',
                email: 'ada.coauthor@example.test',
                hsaId: 'SE5560000001-aaa',
              },
              {
                displayName: 'Mira CoAuthor',
                email: 'mira.coauthor@example.test',
                hsaId: 'SE5560000001-mmm',
              },
            ],
          }),
        )
      }
      return Promise.resolve(okJson({}))
    })

    renderModal()

    await waitFor(() => {
      expect(screen.getByText('Ada CoAuthor')).toBeInTheDocument()
    })
    const table = screen.getByRole('table', {
      name: 'specification.savedCoAuthors',
    })
    const hsaIds = within(table)
      .getAllByText(/SE5560000001-/)
      .map(element => element.textContent)
    expect(hsaIds).toEqual([
      'SE5560000001-aaa',
      'SE5560000001-mmm',
      'SE5560000001-zzz',
    ])
    expect(screen.queryByText(/coauthor@example\.test/)).toBeNull()
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
