import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const i18nState = vi.hoisted(() => ({ commonSuffix: '' }))
const confirmMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}${ns === 'common' ? i18nState.commonSuffix : ''}` : key,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}))

vi.mock('@/components/ConfirmModal', () => ({
  useConfirmModal: () => ({ confirm: confirmMock }),
}))

vi.mock('@/components/StatusBadge', () => ({
  default: ({ label }: { label: string }) => <span>{label}</span>,
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

function requestUrl(input: unknown): string {
  if (typeof input === 'string') return input
  if (input instanceof Request) return input.url
  return String(input)
}

function notOk(body: unknown = { error: 'Bad request' }) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 400,
    statusText: 'Bad Request',
  })
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import RequirementPackagesClient from '@/app/[locale]/requirement-packages/requirement-packages-client'

const currentAuthMe = {
  authenticated: true,
  email: 'ada.admin@example.test',
  hsaId: 'SE5560000001-admin1',
  name: 'Ada Admin',
  roles: ['Admin'],
}
const hsaIdPrefixPayload = {
  prefixes: [{ id: 1, isDefault: true, label: null, prefix: 'SE5560000001' }],
}

const sampleRequirementPackages = [
  {
    description: 'Requirements for mobile access and responsive flows.',
    id: 1,
    isArchived: false,
    leadDisplayName: 'Anna Owner',
    leadEmail: 'anna.owner@example.test',
    leadHsaId: 'SE5560000001-anna1',
    linkedRequirementCount: 0,
    name: 'Mobile use',
  },
]

const additionalRequirementPackage = {
  description: 'Requirements for shared API integrations.',
  id: 2,
  isArchived: false,
  leadDisplayName: 'Sara Owner',
  leadEmail: 'sara.owner@example.test',
  leadHsaId: 'SE5560000001-sara1',
  linkedRequirementCount: 3,
  name: 'API use',
}

const requirementPackageNameInput = () =>
  screen.getByRole('textbox', { name: /requirementPackage\.name/ })
const requirementPackageLeadHsaIdInput = () =>
  screen.getByRole('textbox', { name: /requirementPackage\.leadHsaId/ })

function setupRequirementPackageMocks(
  requirementPackageDetailResponse: () => Promise<unknown> | unknown,
) {
  fetchMock.mockImplementation(async (url: string) => {
    const urlString = requestUrl(url)
    if (urlString === '/api/auth/me') return okJson(currentAuthMe)
    if (urlString === '/api/hsa-id-prefixes') return okJson(hsaIdPrefixPayload)
    if (urlString.startsWith('/api/requirement-packages?')) {
      return okJson({ requirementPackages: sampleRequirementPackages })
    }
    if (urlString === '/api/requirement-packages/1')
      return requirementPackageDetailResponse()
    return okJson({})
  })
}

const linkedRequirement = {
  archiveInitiatedAt: null,
  description: 'Linked package requirement',
  id: 10,
  statusColor: '#f59e0b',
  statusId: 2,
  statusNameEn: 'Review',
  statusNameSv: 'Granskning',
  uniqueId: 'REQ-10',
  versionNumber: 4,
}

describe('RequirementPackagesClient', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    i18nState.commonSuffix = ''
    fetchMock.mockImplementation(async (url: string) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return okJson(currentAuthMe)
      if (urlString === '/api/hsa-id-prefixes')
        return okJson(hsaIdPrefixPayload)
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      return okJson({})
    })
  })

  it('renders heading and create button', async () => {
    render(<RequirementPackagesClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.requirementPackages',
    )
    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    expect(createButton).toBeInTheDocument()
    expect(createButton).toHaveAttribute('data-floating-action-id', 'create')
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
      expect(createButton).toBeEnabled()
    })
  })

  it('keeps create disabled until the signed-in HSA-id is loaded', async () => {
    let resolveAuth!: (response: unknown) => void
    const authPromise = new Promise(resolve => {
      resolveAuth = resolve
    })
    fetchMock.mockImplementation(async (url: string) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return authPromise
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      return okJson({})
    })

    render(<RequirementPackagesClient />)

    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    expect(createButton).toBeDisabled()

    resolveAuth(okJson(currentAuthMe))

    await waitFor(() => {
      expect(createButton).toBeEnabled()
    })
  })

  it('shows an error and keeps create disabled when the signed-in HSA-id is missing', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return okJson({ authenticated: false })
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      return okJson({})
    })

    render(<RequirementPackagesClient />)

    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
      expect(createButton).toBeDisabled()
      expect(
        screen.getByText('requirementPackage.currentUserUnavailable'),
      ).toBeInTheDocument()
    })
  })

  it('fetches and displays requirementPackages', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    const descriptionCell = screen
      .getByText('Requirements for mobile access and responsive flows.')
      .closest('td')

    expect(descriptionCell).toBeInTheDocument()
    expect(descriptionCell).toHaveClass('whitespace-normal')
    expect(descriptionCell).toHaveClass('wrap-break-word')
    expect(descriptionCell).not.toHaveClass('truncate')
  })

  it('renders package row actions as compact icon buttons with tooltip text', async () => {
    render(<RequirementPackagesClient />)

    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    const [editButton] = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    const archiveButton = screen.getByRole('button', {
      name: /requirementPackage\.archive/i,
    })
    const [deleteButton] = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })

    expect(editButton).toHaveAttribute('title', 'common.edit')
    expect(editButton.textContent?.trim()).toBe('')
    expect(editButton).toHaveAccessibleName('common.edit')
    expect(editButton.className).toContain('h-11')
    expect(editButton.className).toContain('w-11')
    expect(editButton.querySelector('svg')).not.toBeNull()

    expect(archiveButton).toHaveAttribute('title', 'requirementPackage.archive')
    expect(archiveButton.textContent?.trim()).toBe('')
    expect(archiveButton).toHaveAccessibleName('requirementPackage.archive')
    expect(archiveButton.className).toContain('h-11')
    expect(archiveButton.className).toContain('w-11')
    expect(archiveButton.querySelector('svg')).not.toBeNull()
    expect(archiveButton).toHaveAttribute(
      'data-developer-mode-value',
      'archive',
    )

    expect(deleteButton).toHaveAttribute('title', 'common.delete')
    expect(deleteButton.textContent?.trim()).toBe('')
    expect(deleteButton).toHaveAccessibleName('common.delete')
    expect(deleteButton.className).toContain('h-11')
    expect(deleteButton.className).toContain('w-11')
    expect(deleteButton.querySelector('svg')).not.toBeNull()
  })

  it('filters requirement packages by name or description and clears the search', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return okJson(currentAuthMe)
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({
          requirementPackages: [
            ...sampleRequirementPackages,
            additionalRequirementPackage,
          ],
        })
      }
      return okJson({})
    })

    render(<RequirementPackagesClient />)

    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
      expect(screen.getByText('API use')).toBeInTheDocument()
    })

    const nameFilter = screen.getByRole('textbox', {
      name: /requirementPackage\.filterByName/i,
    })
    expect(nameFilter).toHaveAttribute(
      'placeholder',
      'requirementPackage.filterByNamePlaceholder',
    )

    fireEvent.change(nameFilter, { target: { value: 'mobile' } })

    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
      expect(screen.queryByText('API use')).toBeNull()
    })

    fireEvent.change(nameFilter, { target: { value: 'shared' } })

    await waitFor(() => {
      expect(screen.queryByText('Mobile use')).toBeNull()
      expect(screen.getByText('API use')).toBeInTheDocument()
    })

    fireEvent.change(nameFilter, { target: { value: 'saknas' } })

    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument()
      expect(screen.queryByText('Mobile use')).toBeNull()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /common\.clearSearch/i }),
    )

    await waitFor(() => {
      expect(nameFilter).toHaveValue('')
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
      expect(screen.getByText('API use')).toBeInTheDocument()
    })
  })

  it('shows loading text initially', () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementPackagesClient />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('renders an empty-state row with a create CTA', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return okJson(currentAuthMe)
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: [] })
      }
      return okJson({})
    })

    render(<RequirementPackagesClient />)

    const emptyState = await screen.findByText('requirementPackage.emptyState')
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '6')

    const createButtons = screen.getAllByRole('button', {
      name: /common\.create/i,
    })
    expect(createButtons).toHaveLength(1)
    await waitFor(() => {
      expect(createButtons[0]).toBeEnabled()
    })

    fireEvent.click(createButtons[0])

    const dialog = screen.getByRole('dialog', {
      name: /requirementPackage\.newRequirementPackage/i,
    })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('max-w-5xl')
    expect(requirementPackageNameInput()).toBeInTheDocument()
    expect(
      within(dialog).getByText('requirementPackage.createResponsibilityNotice'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('textbox', {
        name: /requirementPackage\.leadHsaId/,
      }),
    ).toBeNull()
    expect(within(dialog).getByText('Ada Admin')).toBeInTheDocument()
    expect(
      within(dialog).getByText('ada.admin@example.test'),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('SE5560000001-admin1')).toBeInTheDocument()
    expect(
      within(dialog).queryByText('requirementPackage.linkedRequirements'),
    ).toBeNull()
    expect(
      screen.getByText('requirementPackage.noCoAuthors'),
    ).toBeInTheDocument()
  })

  it('opens create form', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    await waitFor(() => {
      expect(createButton).toBeEnabled()
    })
    fireEvent.click(createButton)
    const dialog = screen.getByRole('dialog', {
      name: /requirementPackage\.newRequirementPackage/i,
    })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveClass('max-w-5xl')
    const form = dialog.querySelector('[data-developer-mode-name="crud form"]')
    expect(form).toHaveClass('space-y-6')
    const layoutGrid = form?.firstElementChild
    expect(layoutGrid).toHaveClass('grid')
    expect(layoutGrid).toHaveClass('grid-cols-1')
    expect(layoutGrid).toHaveClass(
      'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]',
    )
    expect(requirementPackageNameInput()).toBeInTheDocument()
    expect(
      within(dialog).getByText('requirementPackage.createResponsibilityNotice'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('textbox', {
        name: /requirementPackage\.leadHsaId/,
      }),
    ).toBeNull()
    expect(
      dialog.querySelector(
        '[data-developer-mode-name="responsibility notice"][data-developer-mode-context="requirementPackages"]',
      ),
    ).toHaveAttribute('data-developer-mode-value', 'create package lead')
    expect(
      within(dialog).queryByText('requirementPackage.linkedRequirements'),
    ).toBeNull()
    const nameHelpButton = screen.getByRole('button', {
      name: 'common.help: requirementPackage.name',
    })
    fireEvent.click(nameHelpButton)
    expect(nameHelpButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('requirementPackage.nameHelp')).toBeInTheDocument()
    expect(
      screen.getByText('requirementPackage.coAuthorsHelp'),
    ).toBeInTheDocument()
  })

  it('does not fetch owner options for package leads', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    await waitFor(() => {
      expect(createButton).toBeEnabled()
    })
    fireEvent.click(createButton)

    expect(
      fetchMock.mock.calls.some(([url]) => String(url) === '/api/owners/all'),
    ).toBe(false)
  })

  it('submits create form', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    await waitFor(() => {
      expect(createButton).toBeEnabled()
    })
    fireEvent.click(createButton)
    fireEvent.change(requirementPackageNameInput(), {
      target: { value: 'Ny' },
    })

    fetchMock.mockResolvedValueOnce(okJson({ id: 2 }))
    fetchMock.mockResolvedValueOnce(
      okJson({ requirementPackages: sampleRequirementPackages }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages',
        expect.objectContaining({
          body: JSON.stringify({
            coAuthorHsaIds: [],
            description: undefined,
            name: 'Ny',
          }),
          method: 'POST',
        }),
      )
    })
  })

  it('submits package co-authors as HSA-id assignments', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    await waitFor(() => {
      expect(createButton).toBeEnabled()
    })
    fireEvent.click(createButton)
    fireEvent.change(requirementPackageNameInput(), {
      target: { value: 'Ny' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: /requirementPackage\.addCoAuthor/i,
      }),
    )
    const coAuthorInput = screen.getByRole('textbox', {
      name: /requirementPackage\.coAuthorHsaId/,
    })
    await waitFor(() => {
      expect(coAuthorInput).toBeEnabled()
    })
    fireEvent.change(coAuthorInput, { target: { value: 'coa1' } })

    fetchMock.mockResolvedValueOnce(okJson({ id: 2 }))
    fetchMock.mockResolvedValueOnce(
      okJson({ requirementPackages: sampleRequirementPackages }),
    )

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages',
        expect.objectContaining({
          body: JSON.stringify({
            coAuthorHsaIds: ['SE5560000001-coa1'],
            name: 'Ny',
          }),
          method: 'POST',
        }),
      )
    })
  })

  it('opens edit form with existing data', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect(
      screen.getByRole('dialog', {
        name: /requirementPackage\.editRequirementPackage/i,
      }),
    ).toBeInTheDocument()
    expect((requirementPackageNameInput() as HTMLInputElement).value).toBe(
      'Mobile use',
    )
    expect(requirementPackageLeadHsaIdInput()).toBeInTheDocument()
    expect(requirementPackageLeadHsaIdInput()).toHaveAttribute('readonly')
    expect(
      screen.getByRole('button', { name: /requirementPackage\.changeLead/ }),
    ).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('dialog', {
          name: /requirementPackage\.editRequirementPackage/i,
        }),
      ).queryByRole('button', { name: /common\.fetchHsaPerson/ }),
    ).toBeNull()
    expect(
      screen.getByText('Anna Owner (anna.owner@example.test)'),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('common.noneAvailable')).toBeInTheDocument()
    })
  })

  it('saves ordinary package edits without leadHsaId in the payload', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    fireEvent.change(requirementPackageNameInput(), {
      target: { value: 'Updated mobile use' },
    })

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return okJson(currentAuthMe)
      if (urlString === '/api/requirement-packages/1' && init?.method === 'PUT')
        return okJson({ id: 1 })
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      return okJson({})
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/requirement-packages/1' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect((putCall?.[1] as RequestInit).body).toBe(
      JSON.stringify({
        coAuthorHsaIds: [],
        description: 'Requirements for mobile access and responsive flows.',
        name: 'Updated mobile use',
      }),
    )
  })

  it('changes the package lead in a separate modal and keeps admin editing open', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /requirementPackage\.changeLead/ }),
    )

    const changeDialog = screen.getByRole('dialog', {
      name: /requirementPackage\.changeLeadTitle/,
    })
    expect(
      within(changeDialog).getByRole('textbox', {
        name: /requirementPackage\.currentLeadHsaId/,
      }),
    ).toHaveValue('SE5560000001-anna1')
    const newLeadInput = within(changeDialog).getByRole('textbox', {
      name: /requirementPackage\.newLeadHsaId/,
    })
    await waitFor(() => {
      expect(newLeadInput).toBeEnabled()
    })
    fireEvent.change(newLeadInput, { target: { value: 'new1' } })

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return okJson(currentAuthMe)
      if (urlString === '/api/hsa-id-prefixes')
        return okJson(hsaIdPrefixPayload)
      if (urlString === '/api/requirement-packages/1' && init?.method === 'PUT')
        return okJson({
          id: 1,
          leadDisplayName: 'New Lead',
          leadEmail: 'new.lead@example.test',
          leadHsaId: 'SE5560000001-new1',
        })
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      return okJson({})
    })

    fireEvent.click(
      within(changeDialog).getByRole('button', {
        name: /requirementPackage\.changeLead/,
      }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages/1',
        expect.objectContaining({
          body: JSON.stringify({ leadHsaId: 'SE5560000001-new1' }),
          method: 'PUT',
        }),
      )
      expect(
        screen.queryByRole('dialog', {
          name: /requirementPackage\.changeLeadTitle/,
        }),
      ).toBeNull()
    })
    expect(
      screen.getByRole('dialog', {
        name: /requirementPackage\.editRequirementPackage/i,
      }),
    ).toBeInTheDocument()
    expect(requirementPackageLeadHsaIdInput()).toHaveValue('SE5560000001-new1')
    expect(
      screen.getByText('New Lead (new.lead@example.test)'),
    ).toBeInTheDocument()
  })

  it('keeps the package lead modal open and shows an error when lead handover fails', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    fireEvent.click(
      screen.getByRole('button', { name: /requirementPackage\.changeLead/ }),
    )

    const changeDialog = screen.getByRole('dialog', {
      name: /requirementPackage\.changeLeadTitle/,
    })
    const newLeadInput = within(changeDialog).getByRole('textbox', {
      name: /requirementPackage\.newLeadHsaId/,
    })
    await waitFor(() => {
      expect(newLeadInput).toBeEnabled()
    })
    fireEvent.change(newLeadInput, { target: { value: 'new1' } })

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return okJson(currentAuthMe)
      if (urlString === '/api/hsa-id-prefixes')
        return okJson(hsaIdPrefixPayload)
      if (urlString === '/api/requirement-packages/1' && init?.method === 'PUT')
        return notOk({ error: 'Package lead handover failed' })
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      return okJson({})
    })

    fireEvent.click(
      within(changeDialog).getByRole('button', {
        name: /requirementPackage\.changeLead/,
      }),
    )

    await waitFor(() => {
      expect(within(changeDialog).getByRole('alert')).toHaveTextContent(
        'Package lead handover failed',
      )
    })
    expect(
      screen.getByRole('dialog', {
        name: /requirementPackage\.changeLeadTitle/,
      }),
    ).toBeInTheDocument()
    expect(requirementPackageLeadHsaIdInput()).toHaveValue('SE5560000001-anna1')
  })

  it('confirms unsaved edits before a non-admin changes away from their package lead assignment', async () => {
    const nonAdminAuthMe = {
      ...currentAuthMe,
      hsaId: 'SE5560000001-anna1',
      roles: [],
    }
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const urlString = requestUrl(url)
      if (urlString === '/api/auth/me') return okJson(nonAdminAuthMe)
      if (urlString === '/api/hsa-id-prefixes')
        return okJson(hsaIdPrefixPayload)
      if (urlString === '/api/requirement-packages/1' && init?.method === 'PUT')
        return okJson({ id: 1, leadHsaId: 'SE5560000001-next1' })
      if (urlString.startsWith('/api/requirement-packages?')) {
        return okJson({ requirementPackages: sampleRequirementPackages })
      }
      return okJson({})
    })
    confirmMock.mockResolvedValue(true)

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    fireEvent.change(requirementPackageNameInput(), {
      target: { value: 'Unsaved package name' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /requirementPackage\.changeLead/ }),
    )
    const changeDialog = screen.getByRole('dialog', {
      name: /requirementPackage\.changeLeadTitle/,
    })
    const newLeadInput = within(changeDialog).getByRole('textbox', {
      name: /requirementPackage\.newLeadHsaId/,
    })
    await waitFor(() => {
      expect(newLeadInput).toBeEnabled()
    })
    fireEvent.change(newLeadInput, { target: { value: 'next1' } })
    fireEvent.click(
      within(changeDialog).getByRole('button', {
        name: /requirementPackage\.changeLead/,
      }),
    )

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'requirementPackage.leadChangeUnsavedConfirm',
        }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages/1',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', {
          name: /requirementPackage\.editRequirementPackage/i,
        }),
      ).toBeNull()
    })
  })

  it('marks linked requirement loading as a status', async () => {
    setupRequirementPackageMocks(() => new Promise(() => {}))

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('common.loading')
    })
  })

  it('shows an error instead of an empty state when linked requirements fail to load', async () => {
    setupRequirementPackageMocks(notOk)

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('common.error')
    })
    expect(screen.queryByText('common.noneAvailable')).toBeNull()
  })

  it('renders archiving review status for linked package requirements', async () => {
    setupRequirementPackageMocks(() =>
      okJson({
        linkedRequirements: [
          {
            ...linkedRequirement,
            archiveInitiatedAt: '2026-05-15T09:30:00.000Z',
          },
        ],
      }),
    )

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))

    await waitFor(() => {
      expect(
        screen.getByText('requirement.statusLabel.Arkiveringsgranskning'),
      ).toBeInTheDocument()
    })
    expect(screen.queryByText('Review')).not.toBeInTheDocument()
  })

  it('keeps ordinary review status for linked package requirements without archive review', async () => {
    setupRequirementPackageMocks(() =>
      okJson({ linkedRequirements: [linkedRequirement] }),
    )

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))

    await waitFor(() => {
      expect(screen.getByText('Review')).toBeInTheDocument()
    })
    expect(
      screen.queryByText('requirement.statusLabel.Arkiveringsgranskning'),
    ).not.toBeInTheDocument()
  })

  it('closes form on cancel', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })
    const createButton = await screen.findByRole('button', {
      name: /requirementPackage.newRequirementPackage/i,
    })
    await waitFor(() => {
      expect(createButton).toBeEnabled()
    })
    fireEvent.click(createButton)
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(
      screen.queryByRole('textbox', {
        name: /requirementPackage\.name/,
      }),
    ).toBeNull()
  })

  it('closes the edit modal on cancel', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.edit/i }))
    expect(
      screen.getByRole('dialog', {
        name: /requirementPackage\.editRequirementPackage/i,
      }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    expect(
      screen.queryByRole('dialog', {
        name: /requirementPackage\.editRequirementPackage/i,
      }),
    ).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Mobile use')).toBeInTheDocument()
    })

    fetchMock.mockResolvedValueOnce(okJson({}))
    fetchMock.mockResolvedValueOnce(okJson({ requirementPackages: [] }))

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages/1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })
})
