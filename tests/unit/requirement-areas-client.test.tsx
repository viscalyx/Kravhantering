import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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
  return { ok: true, json: async () => body }
}
function errJson(body: unknown, status = 500, statusText = 'Server Error') {
  return { ok: false, json: async () => body, status, statusText }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementAreasClient from '@/app/[locale]/requirement-areas/requirement-areas-client'

const sampleAreas = [
  {
    id: 1,
    prefix: 'INT',
    name: 'Integration',
    description: 'System integration',
    ownerHsaId: 'SE5560000001-annaj',
  },
  {
    id: 2,
    prefix: 'SAK',
    name: 'Säkerhet',
    description: null,
    ownerHsaId: 'SE5560000001-1002',
  },
]

const hsaIdPrefixPayload = {
  prefixes: [
    { id: 1, isDefault: true, label: null, prefix: 'SE5560000001' },
    { id: 2, isDefault: false, label: null, prefix: 'NO5560000001' },
  ],
}

async function openAreaEditDialog() {
  fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
  return screen.findByRole('dialog', { name: 'area.editArea' })
}

async function openAreaCoAuthorDraft(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByRole('button', { name: /area\.addCoAuthor/ }),
  )
  const coAuthorInput = within(dialog).getByRole('textbox', {
    name: /area\.coAuthorHsaId/,
  })
  await waitFor(() => {
    expect(coAuthorInput).toBeEnabled()
  })
  return coAuthorInput
}

describe('RequirementAreasClient', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
      return okJson({})
    })
  })

  it('renders areas with owner HSA-id', async () => {
    render(<RequirementAreasClient />)

    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    expect(screen.getByText('INT')).toBeInTheDocument()
    expect(screen.getByText('SE5560000001-annaj')).toBeInTheDocument()
    const editAction = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })[0]
    const deleteAction = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })[0]
    expect(editAction).not.toHaveTextContent('common.edit')
    expect(deleteAction).not.toHaveTextContent('common.delete')
    expect(editAction.querySelector('svg')).toBeInTheDocument()
    expect(deleteAction.querySelector('svg')).toBeInTheDocument()
    const urls = fetchMock.mock.calls.map(call => call[0])
    expect(urls).not.toContain('/api/owners')
  })

  it('creates a requirement area with an editable owner HSA-id field', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.create/i }))

    const dialog = screen.getByRole('dialog', { name: 'area.newArea' })
    expect(within(dialog).queryByText('area.coAuthors')).toBeNull()
    const descriptionInput = within(dialog).getByRole('textbox', {
      name: /area\.description/,
    })
    expect(descriptionInput).toHaveClass(
      'min-h-15.5',
      'max-h-[clamp(5rem,28dvh,16rem)]',
      'resize-y',
      'overflow-auto',
      'overscroll-contain',
    )

    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /area\.prefix/ }),
      {
        target: { value: 'NEW' },
      },
    )
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /area\.name/ }),
      {
        target: { value: 'New requirement area' },
      },
    )
    const ownerInput = within(dialog).getByRole('textbox', {
      name: /area\.owner/,
    })
    await waitFor(() => {
      expect(ownerInput).toBeEnabled()
    })
    fireEvent.change(ownerInput, {
      target: { value: 'new1' },
    })

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas' && init?.method === 'POST')
        return okJson({ id: 3 })
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
      return okJson({})
    })

    fireEvent.click(
      within(dialog).getByRole('button', { name: /common\.save/i }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-areas',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const postCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-areas' &&
        (init as RequestInit | undefined)?.method === 'POST',
    )
    expect((postCall?.[1] as RequestInit).body).toBe(
      JSON.stringify({
        description: '',
        name: 'New requirement area',
        ownerHsaId: 'SE5560000001-new1',
        prefix: 'NEW',
      }),
    )
  })

  it('shows owner HSA-id as read-only when editing', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const dialog = await openAreaEditDialog()

    await waitFor(() => {
      expect(within(dialog).getByText('area.noCoAuthors')).toBeInTheDocument()
    })
    expect(
      within(dialog).getByRole('button', { name: /area\.addCoAuthor/ }),
    ).toBeEnabled()
    expect(
      within(dialog).queryByRole('textbox', { name: /area\.coAuthorHsaId/ }),
    ).toBeNull()

    const ownerInput = within(dialog).getByRole('textbox', {
      name: /area\.owner/,
    })
    expect(ownerInput).toBeDisabled()
    expect(ownerInput).toHaveValue('SE5560000001-annaj')
    expect(
      within(dialog).getByRole('button', { name: /area\.changeOwner/ }),
    ).toBeInTheDocument()
  })

  it('saves ordinary edits without ownerHsaId in the form payload', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const dialog = await openAreaEditDialog()
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: /area\.name/ }),
      {
        target: { value: 'Updated' },
      },
    )

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas/1' && init?.method === 'PUT')
        return okJson({ id: 1 })
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      return okJson({})
    })

    fireEvent.click(
      within(dialog).getByRole('button', { name: /common\.save/i }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-areas/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-areas/1' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect((putCall?.[1] as RequestInit).body).toBe(
      JSON.stringify({
        description: 'System integration',
        name: 'Updated',
        prefix: 'INT',
      }),
    )
  })

  it('autosaves a verified requirement area co-author assignment', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
      if (url === '/api/requirement-areas/1/co-authors') {
        if (init?.method === 'PUT') return okJson({ ok: true })
        return okJson({ coAuthors: [] })
      }
      if (url === '/api/requirement-responsibility-people/verify') {
        return okJson({
          person: {
            displayName: 'Cora CoAuthor',
            email: 'cora.coauthor@example.test',
            givenName: 'Cora',
            hsaId: 'SE5560000001-coa1',
            middleName: null,
            surname: 'CoAuthor',
          },
        })
      }
      return okJson({})
    })
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const dialog = await openAreaEditDialog()

    await waitFor(() => {
      expect(within(dialog).getByText('area.noCoAuthors')).toBeInTheDocument()
    })
    const coAuthorInput = await openAreaCoAuthorDraft(dialog as HTMLElement)
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
        '/api/requirement-areas/1/co-authors',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const verifyCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/requirement-responsibility-people/verify',
    ) as [string, RequestInit]
    expect(JSON.parse((verifyCall[1].body as string) ?? '{}')).toMatchObject({
      hsaId: 'SE5560000001-coa1',
      purpose: 'requirement_area_co_author',
      scopeId: 1,
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-areas/1/co-authors' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    expect(JSON.parse((putCall[1].body as string) ?? '{}')).toEqual({
      coAuthorHsaIds: ['SE5560000001-coa1'],
    })
    expect(within(dialog).getByText(/Cora CoAuthor/)).toBeInTheDocument()
  })

  it('shows an error and keeps the requirement area co-author draft when assignment autosave fails', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
      if (url === '/api/requirement-areas/1/co-authors') {
        if (init?.method === 'PUT')
          return errJson(
            { error: 'Requirement area co-author autosave failed' },
            409,
            'Conflict',
          )
        return okJson({ coAuthors: [] })
      }
      if (url === '/api/requirement-responsibility-people/verify') {
        return okJson({
          person: {
            displayName: 'Cora CoAuthor',
            email: 'cora.coauthor@example.test',
            givenName: 'Cora',
            hsaId: 'SE5560000001-coa1',
            middleName: null,
            surname: 'CoAuthor',
          },
        })
      }
      return okJson({})
    })
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const dialog = await openAreaEditDialog()

    await waitFor(() => {
      expect(within(dialog).getByText('area.noCoAuthors')).toBeInTheDocument()
    })
    const coAuthorInput = await openAreaCoAuthorDraft(dialog as HTMLElement)
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
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Requirement area co-author autosave failed',
      )
    })
    expect(within(dialog).queryByText('area.noCoAuthors')).toBeNull()
    expect(coAuthorInput).toHaveValue('coa1')
  })

  it('confirms and autosaves requirement area co-author removal', async () => {
    confirmMock.mockResolvedValue(true)
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
      if (url === '/api/requirement-areas/1/co-authors') {
        if (init?.method === 'PUT') return okJson({ ok: true })
        return okJson({
          coAuthors: [
            {
              displayName: 'Cora CoAuthor',
              email: 'cora.coauthor@example.test',
              hsaId: 'SE5560000001-coa1',
            },
          ],
        })
      }
      return okJson({})
    })
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const dialog = await openAreaEditDialog()

    await waitFor(() => {
      expect(within(dialog).getByText(/Cora CoAuthor/)).toBeInTheDocument()
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: /area\.removeCoAuthor/ }),
    )

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'area.removeCoAuthorConfirm',
          variant: 'danger',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-areas/1/co-authors',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-areas/1/co-authors' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    expect(JSON.parse((putCall[1].body as string) ?? '{}')).toEqual({
      coAuthorHsaIds: [],
    })
  })

  it('shows an error and keeps the requirement area co-author when removal autosave fails', async () => {
    confirmMock.mockResolvedValue(true)
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
      if (url === '/api/requirement-areas/1/co-authors') {
        if (init?.method === 'PUT')
          return errJson(
            { error: 'Requirement area co-author removal failed' },
            409,
            'Conflict',
          )
        return okJson({
          coAuthors: [
            {
              displayName: 'Cora CoAuthor',
              email: 'cora.coauthor@example.test',
              hsaId: 'SE5560000001-coa1',
            },
          ],
        })
      }
      return okJson({})
    })
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const dialog = await openAreaEditDialog()

    await waitFor(() => {
      expect(within(dialog).getByText(/Cora CoAuthor/)).toBeInTheDocument()
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: /area\.removeCoAuthor/ }),
    )

    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Requirement area co-author removal failed',
      )
    })
    expect(within(dialog).getByText(/Cora CoAuthor/)).toBeInTheDocument()
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-areas/1/co-authors' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    ) as [string, RequestInit]
    expect(JSON.parse((putCall[1].body as string) ?? '{}')).toEqual({
      coAuthorHsaIds: [],
    })
  })

  it('changes owner through the owner-change modal', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const editDialog = await openAreaEditDialog()
    fireEvent.click(
      within(editDialog).getByRole('button', { name: /area\.changeOwner/ }),
    )

    const dialog = screen.getByRole('dialog', {
      name: /area\.changeOwnerTitle/,
    })
    expect(
      within(dialog).getByRole('textbox', { name: /area\.currentOwner/ }),
    ).toHaveValue('SE5560000001-annaj')
    const newOwnerInput = within(dialog).getByRole('textbox', {
      name: /area\.newOwner/,
    })
    const changeOwnerButton = within(dialog).getByRole('button', {
      name: /area\.changeOwner/,
    })
    expect(changeOwnerButton).toBeDisabled()
    await waitFor(() => {
      expect(newOwnerInput).toBeEnabled()
    })

    fireEvent.change(newOwnerInput, {
      target: { value: 'annaj' },
    })
    expect(changeOwnerButton).toBeDisabled()

    fireEvent.change(
      within(dialog).getByRole('combobox', {
        name: /common\.hsaPrefixLabel/,
      }),
      { target: { value: 'NO5560000001' } },
    )
    fireEvent.change(newOwnerInput, {
      target: { value: 'next1' },
    })
    expect(changeOwnerButton).toBeEnabled()

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas/1' && init?.method === 'PUT')
        return okJson({ id: 1, ownerHsaId: 'NO5560000001-next1' })
      if (url === '/api/requirement-areas')
        return okJson({
          areas: [
            {
              ...sampleAreas[0],
              ownerHsaId: 'NO5560000001-next1',
            },
            sampleAreas[1],
          ],
        })
      if (url === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
      return okJson({})
    })

    fireEvent.click(changeOwnerButton)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-areas/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-areas/1' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect((putCall?.[1] as RequestInit).body).toBe(
      JSON.stringify({ ownerHsaId: 'NO5560000001-next1' }),
    )
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /area\.changeOwnerTitle/ }),
      ).toBeNull()
    })
    expect(
      within(editDialog).getByRole('textbox', { name: /area\.owner/ }),
    ).toHaveValue('NO5560000001-next1')
    expect(
      screen.getByRole('dialog', { name: 'area.editArea' }),
    ).toBeInTheDocument()
  })

  it('keeps the modal open and shows an error when owner change fails', async () => {
    render(<RequirementAreasClient />)
    await waitFor(() => {
      expect(screen.getByText('Integration')).toBeInTheDocument()
    })

    const editDialog = await openAreaEditDialog()
    fireEvent.click(
      within(editDialog).getByRole('button', { name: /area\.changeOwner/ }),
    )

    const dialog = screen.getByRole('dialog', {
      name: /area\.changeOwnerTitle/,
    })
    const newOwnerInput = within(dialog).getByRole('textbox', {
      name: /area\.newOwner/,
    })
    await waitFor(() => {
      expect(newOwnerInput).toBeEnabled()
    })
    fireEvent.change(newOwnerInput, { target: { value: 'next1' } })

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/requirement-areas/1' && init?.method === 'PUT')
        return errJson({ error: 'Owner change failed' }, 400, 'Bad Request')
      if (url === '/api/requirement-areas')
        return okJson({ areas: sampleAreas })
      if (url === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
      return okJson({})
    })

    fireEvent.click(
      within(dialog).getByRole('button', { name: /area\.changeOwner/ }),
    )

    await waitFor(() => {
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Owner change failed',
      )
    })
    expect(dialog).toBeInTheDocument()
    expect(editDialog).toBeInTheDocument()
  })
})
