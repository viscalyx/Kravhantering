import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { StrictMode } from 'react'
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

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(resolver => {
    resolve = resolver
  })

  return { promise, resolve }
}

function mockPillListScrollHeight(height: number) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight',
  )

  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: function (this: HTMLElement) {
      if (this.dataset.specificationRequirementAreaPillList === 'true') {
        return height
      }

      return descriptor?.get?.call(this) ?? 0
    },
  })

  return () => {
    if (descriptor) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', descriptor)
      return
    }

    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight')
  }
}

let fetchMock: ReturnType<typeof vi.fn>

import RequirementsSpecificationsClient from '@/app/[locale]/specifications/specifications-client'

const sampleGovernanceObjectTypes = [
  { id: 1, nameSv: 'Leveransområde', nameEn: 'Delivery area' },
]
const sampleTypes = [{ id: 1, nameSv: 'Typ', nameEn: 'Type' }]
const sampleStatuses = [{ id: 1, nameSv: 'Utveckling', nameEn: 'Development' }]
const sampleSpecifications = [
  {
    id: 1,
    name: 'Kravunderlag sv',
    uniqueId: 'KRAVUNDERLAG-SV',
    specificationGovernanceObjectTypeId: 1,
    specificationImplementationTypeId: 1,
    specificationLifecycleStatusId: 1,
    governanceObjectType: sampleGovernanceObjectTypes[0],
    implementationType: sampleTypes[0],
    lifecycleStatus: sampleStatuses[0],
    itemCount: 0,
    requirementAreas: [],
    businessNeedsReference: null,
    responsibleHsaId: 'SE5560000001-ada1',
    responsibleDisplayName: 'Ada Admin',
  },
]
const sampleCurrentUser = {
  authenticated: true,
  email: 'ada.admin@example.test',
  hsaId: 'SE5560000001-ada1',
  name: 'Ada Admin',
  roles: ['Admin'],
}
const hsaIdPrefixPayload = {
  prefixes: [{ id: 1, isDefault: true, label: null, prefix: 'SE5560000001' }],
}

function mockApi(
  handler: (url: string, opts?: RequestInit) => Promise<unknown>,
) {
  fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
    if (url === '/api/auth/me')
      return Promise.resolve(okJson(sampleCurrentUser))
    if (url === '/api/hsa-id-prefixes')
      return Promise.resolve(okJson(hsaIdPrefixPayload))
    return handler(url, opts)
  })
}

async function openCreateSpecificationForm() {
  const createButton = await screen.findByRole('button', {
    name: /specification.newSpecification/i,
  })
  await waitFor(() => expect(createButton).not.toBeDisabled())
  fireEvent.click(createButton)
}

describe('RequirementsSpecificationsClient', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    confirmMock.mockReset()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mockApi((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })
  })

  it('renders heading', async () => {
    render(<RequirementsSpecificationsClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.specifications',
    )
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })
  })

  it('fetches and displays kravunderlag', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })
    expect(screen.getByText('Delivery area')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Development')).toBeInTheDocument()
    expect(screen.getByText('Ada Admin')).toBeInTheDocument()
    expect(screen.getByText('SE5560000001-ada1')).toBeInTheDocument()
  })

  it('formats anonymized responsible display names in the table', async () => {
    mockApi((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(
          okJson({
            specifications: [
              {
                ...sampleSpecifications[0],
                responsibleDisplayName: 'no-user',
              },
            ],
          }),
        )
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    expect(await screen.findByText('Anonymous')).toBeInTheDocument()
    expect(screen.queryByText('no-user')).toBeNull()
  })

  it('shows the responsible HSA-id when a specification has no responsible display name', async () => {
    mockApi((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(
          okJson({
            specifications: [
              {
                ...sampleSpecifications[0],
                responsibleDisplayName: null,
              },
            ],
          }),
        )
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    expect(await screen.findByText('SE5560000001-ada1')).toBeInTheDocument()
  })

  it('fetches and displays kravunderlag after strict-mode effect replays', async () => {
    render(
      <StrictMode>
        <RequirementsSpecificationsClient />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    expect(screen.getByText('Delivery area')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
  })

  it('keeps available taxonomy data when one taxonomy endpoint fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    mockApi((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.reject(new Error('implementation types unavailable'))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    try {
      render(<RequirementsSpecificationsClient />)

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Failed to load specification implementation types',
          expect.any(Error),
        )
      })

      expect(screen.getByText('Delivery area')).toBeInTheDocument()
      expect(screen.getByText('Development')).toBeInTheDocument()
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('reloads empty preload fallbacks when the matching preload captured errors', async () => {
    render(
      <RequirementsSpecificationsClient
        initialData={{
          errors: [
            { key: 'requirements specifications', message: 'preload failed' },
            {
              key: 'specification governance object types',
              message: 'preload failed',
            },
            {
              key: 'specification implementation types',
              message: 'preload failed',
            },
            {
              key: 'specification lifecycle statuses',
              message: 'preload failed',
            },
          ],
          implementationTypes: [],
          lifecycleStatuses: [],
          governanceObjectTypes: [],
          specifications: [],
        }}
      />,
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specifications',
        expect.any(Object),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specification-governance-object-types',
        expect.any(Object),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specification-implementation-types',
        expect.any(Object),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specification-lifecycle-statuses',
        expect.any(Object),
      )
    })
    expect(await screen.findByText('Kravunderlag sv')).toBeInTheDocument()
    expect(screen.getByText('Delivery area')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Development')).toBeInTheDocument()
  })

  it('filters specifications by the name column and clears the search', async () => {
    mockApi((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(
          okJson({
            specifications: [
              {
                ...sampleSpecifications[0],
                id: 1,
                name: 'Upphandling av e-tjänstplattform',
                uniqueId: 'ETJANST-UPP-2026',
              },
              {
                ...sampleSpecifications[0],
                id: 2,
                name: 'Införande av säkerhetslyft Q2',
                uniqueId: 'SAKLYFT-INFOR-Q2',
              },
            ],
          }),
        )
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    const filterInput = await screen.findByRole('textbox', {
      name: 'specification.filterByName',
    })

    expect(
      screen.getByText('Upphandling av e-tjänstplattform'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Införande av säkerhetslyft Q2'),
    ).toBeInTheDocument()

    fireEvent.change(filterInput, { target: { value: 'e-tjänst' } })

    await waitFor(() => {
      expect(
        screen.getByText('Upphandling av e-tjänstplattform'),
      ).toBeInTheDocument()
      expect(
        screen.queryByText('Införande av säkerhetslyft Q2'),
      ).not.toBeInTheDocument()
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'common.clearSearch' }),
    )

    await waitFor(() => {
      expect(
        screen.getByText('Upphandling av e-tjänstplattform'),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Införande av säkerhetslyft Q2'),
      ).toBeInTheDocument()
    })
  })

  it('shows a no-results row when the name filter matches no specifications', async () => {
    mockApi((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(
          okJson({
            specifications: [
              {
                ...sampleSpecifications[0],
                id: 1,
                name: 'Upphandling av e-tjänstplattform',
                uniqueId: 'ETJANST-UPP-2026',
              },
            ],
          }),
        )
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    fireEvent.change(
      await screen.findByRole('textbox', {
        name: 'specification.filterByName',
      }),
      {
        target: { value: 'saknas' },
      },
    )

    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument()
    })
    expect(screen.queryByText('specification.emptyState')).toBeNull()
  })

  it('renders an empty-state row when there are no specifications', async () => {
    mockApi((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: [] }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    const emptyState = await screen.findByText('specification.emptyState')
    expect(emptyState).toBeInTheDocument()
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '8')
  })

  it('renders requirement-area badges as compact static pills', async () => {
    mockApi((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(
          okJson({
            specifications: [
              {
                ...sampleSpecifications[0],
                requirementAreas: [{ id: 9, name: 'Identity' }],
              },
            ],
          }),
        )
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    const areaBadge = await screen.findByText('Identity')
    expect(areaBadge.tagName).toBe('SPAN')
    expect(areaBadge.closest('a')).toBeNull()
    expect(areaBadge.className).toContain('text-[11px]')
    expect(areaBadge.className).toContain('h-6')
    expect(areaBadge.className).not.toContain('min-h')
    expect(areaBadge.className).not.toContain('focus-visible:ring')
  })

  it('collapses overflowing requirement-area pills and expands them on demand', async () => {
    const restoreScrollHeight = mockPillListScrollHeight(56)

    try {
      mockApi((url: string) => {
        if (url === '/api/specifications')
          return Promise.resolve(
            okJson({
              specifications: [
                {
                  ...sampleSpecifications[0],
                  requirementAreas: [
                    { id: 9, name: 'Identity' },
                    { id: 10, name: 'Integration' },
                    { id: 11, name: 'Security' },
                  ],
                },
              ],
            }),
          )
        if (url === '/api/specification-governance-object-types')
          return Promise.resolve(
            okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
          )
        if (url === '/api/specification-implementation-types')
          return Promise.resolve(okJson({ types: sampleTypes }))
        if (url === '/api/specification-lifecycle-statuses')
          return Promise.resolve(okJson({ statuses: sampleStatuses }))
        return Promise.resolve(okJson({}))
      })

      render(<RequirementsSpecificationsClient />)

      const list = await waitFor(() => {
        const node = document.querySelector(
          '[data-specification-requirement-area-pill-list="true"]',
        )
        expect(node).not.toBeNull()
        return node as HTMLElement
      })
      const group = list.closest(
        '[data-specification-requirement-area-pills="true"]',
      )
      const expandButton = await screen.findByRole('button', {
        name: 'common.showMore',
      })

      expect(group?.className).toContain('items-center')
      expect(expandButton).toHaveAttribute('aria-expanded', 'false')
      expect(expandButton.className).toContain('min-h-11')
      expect(expandButton.className).toContain('min-w-11')
      expect(list.className).toContain('max-h-6')
      expect(list.className).toContain('overflow-hidden')

      fireEvent.click(expandButton)

      const collapseButton = screen.getByRole('button', {
        name: 'common.showLess',
      })
      expect(collapseButton).toHaveAttribute('aria-expanded', 'true')
      expect(group?.className).toContain('items-start')
      expect(list.className).not.toContain('max-h-6')
      expect(list.className).not.toContain('overflow-hidden')

      fireEvent.click(collapseButton)
      expect(
        screen.getByRole('button', { name: 'common.showMore' }),
      ).toHaveAttribute('aria-expanded', 'false')
      expect(list.className).toContain('max-h-6')
    } finally {
      restoreScrollHeight()
    }
  })

  it('renders specification row actions as compact icon buttons', async () => {
    render(<RequirementsSpecificationsClient />)

    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    const [editButton] = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    const [deleteButton] = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })

    expect(editButton).toHaveAttribute('title', 'common.edit')
    expect(editButton.closest('td')?.className).toContain('align-top')
    expect(editButton.textContent?.trim()).toBe('')
    expect(editButton).toHaveAccessibleName('common.edit')
    expect(editButton.className).toContain('h-11')
    expect(editButton.className).toContain('w-11')
    expect(editButton.querySelector('svg')).not.toBeNull()

    expect(deleteButton).toHaveAttribute('title', 'common.delete')
    expect(deleteButton.textContent?.trim()).toBe('')
    expect(deleteButton).toHaveAccessibleName('common.delete')
    expect(deleteButton.className).toContain('h-11')
    expect(deleteButton.className).toContain('w-11')
    expect(deleteButton.querySelector('svg')).not.toBeNull()
  })

  it('does not show spinner immediately while loading', () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementsSpecificationsClient />)
    expect(
      screen.queryByTestId('requirement-specifications-loading'),
    ).not.toBeInTheDocument()
  })

  it('shows spinner after 200ms when still loading', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementsSpecificationsClient />)
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(
      screen.getByTestId('requirement-specifications-loading'),
    ).toBeInTheDocument()
  })

  it('clears the spinner timer when the component unmounts', () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise(() => {}))

    const { unmount } = render(<RequirementsSpecificationsClient />)

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens create form with fields', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })
    await openCreateSpecificationForm()
    const dialog = screen.getByRole('dialog', {
      name: /specification\.newSpecification/,
    })
    expect(dialog).toHaveAttribute(
      'data-developer-mode-value',
      'new specification',
    )
    const form = document.body.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="specifications"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'create')
    expect(form?.firstElementChild).toHaveClass('lg:grid-cols-2')
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue(sampleCurrentUser.hsaId)
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveAttribute('readonly')
  })

  it('disables create until the current user HSA-id is loaded', async () => {
    const authRequest = createDeferred<ReturnType<typeof okJson>>()
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/me') return authRequest.promise
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    const createButton = await screen.findByRole('button', {
      name: /specification.newSpecification/i,
    })
    expect(createButton).toBeDisabled()

    authRequest.resolve(okJson(sampleCurrentUser))

    await waitFor(() => expect(createButton).not.toBeDisabled())
  })

  it('shows an error and keeps create disabled when the signed-in user has no HSA-id', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/me')
        return Promise.resolve(okJson({ authenticated: true, hsaId: '' }))
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'specification.currentUserUnavailable',
    )
    expect(
      screen.getByRole('button', {
        name: /specification.newSpecification/i,
      }),
    ).toBeDisabled()
  })

  it('keeps responsible changes disabled when current user loading fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/me') {
        return Promise.reject(new Error('auth unavailable'))
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'specification.currentUserUnavailable',
    )
    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])

    await waitFor(() => {
      expect(screen.getByText('specification.noCoAuthors')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /specification\.coAuthorHsaId/ }),
      ).toBeDisabled()
    })
    expect(
      screen.getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    ).toBeDisabled()
    consoleError.mockRestore()
  })

  it('shows inline help for specification form fields', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    await openCreateSpecificationForm()
    fireEvent.click(
      screen.getByRole('button', { name: 'common.help: specification.name' }),
    )

    expect(screen.getByText('specification.help.name')).toBeInTheDocument()
  })

  it('renders specification form controls with a 44px minimum height', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    const filterInput = screen.getByRole('textbox', {
      name: 'specification.filterByName',
    })
    expect(filterInput.className).toContain('min-h-11')

    await openCreateSpecificationForm()

    for (const field of [
      screen.getByRole('textbox', { name: /specification\.name/ }),
      screen.getByRole('textbox', { name: /specification\.uniqueId/ }),
      screen.getByRole('combobox', {
        name: /specification\.governanceObjectType/,
      }),
      screen.getByRole('textbox', {
        name: /specification\.responsibleHsaId/,
      }),
      screen.getByRole('combobox', {
        name: /specification\.implementationType/,
      }),
      screen.getByRole('textbox', {
        name: /specification\.businessNeedsReference/,
      }),
    ]) {
      expect(field.className).toContain('min-h-11')
    }
  })

  it('submits create form', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })
    await openCreateSpecificationForm()

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      {
        target: { value: 'Ny' },
      },
    )
    fireEvent.blur(screen.getByRole('textbox', { name: /specification\.name/ }))
    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
      { target: { value: 'SE5560000001-rita1' } },
    )
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue(sampleCurrentUser.hsaId)

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return Promise.resolve(okJson({ id: 2 }))
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specifications',
        expect.objectContaining({ method: 'POST' }),
      )
    })

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(
      JSON.parse(((postCall?.[1] as RequestInit)?.body as string) ?? '{}'),
    ).toHaveProperty('responsibleHsaId', sampleCurrentUser.hsaId)
  })

  it('shows an inline save error for non-conflict failures', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    await openCreateSpecificationForm()

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    fireEvent.change(nameInput, { target: { value: 'Nytt kravunderlag' } })
    fireEvent.blur(nameInput)

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Backend unavailable',
        })
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'specification.saveFailed: Backend unavailable',
    )
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toBeInTheDocument()
  })

  it('keeps create responsible locked to the current user', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    await openCreateSpecificationForm()

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    fireEvent.change(nameInput, { target: { value: 'Nytt kravunderlag' } })
    fireEvent.blur(nameInput)
    const responsibleInput = screen.getByRole('textbox', {
      name: /specification\.responsibleHsaId/,
    })
    expect(responsibleInput).toHaveValue(sampleCurrentUser.hsaId)
    expect(responsibleInput).toHaveAttribute('readonly')
    const dialog = screen.getByRole('dialog', {
      name: /specification\.newSpecification/,
    })
    expect(
      within(dialog).getByText(new RegExp(sampleCurrentUser.name)),
    ).toBeInTheDocument()

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return Promise.resolve(okJson({ id: 2 }))
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specifications',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit | undefined)?.method === 'POST',
    )
    expect(
      JSON.parse(((postCall?.[1] as RequestInit)?.body as string) ?? '{}'),
    ).toHaveProperty('responsibleHsaId', sampleCurrentUser.hsaId)
  })

  it('opens edit form with existing data', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    await waitFor(() => {
      expect(screen.getByText('specification.noCoAuthors')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(
        screen.getByRole('textbox', { name: /specification\.coAuthorHsaId/ }),
      ).toBeEnabled()
    })
    const dialog = screen.getByRole('dialog', {
      name: /specification\.editSpecification/,
    })
    expect(dialog).toHaveAttribute(
      'data-developer-mode-value',
      'edit specification',
    )
    const form = document.body.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="specifications"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'edit')
    expect(
      (
        screen.getByRole('textbox', {
          name: /specification\.name/,
        }) as HTMLInputElement
      ).value,
    ).toBe('Kravunderlag sv')
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue('SE5560000001-ada1')
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveAttribute('readonly')
    expect(within(dialog).getByText('Ada Admin')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /common\.fetchHsaPerson/ }),
    ).toBeDisabled()
  })

  it('omits the responsible HSA-id from ordinary edit saves', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Uppdaterat kravunderlag' } },
    )

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PUT') return Promise.resolve(okJson({ id: 1 }))
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specifications/KRAVUNDERLAG-SV',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/specifications/KRAVUNDERLAG-SV' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect(
      JSON.parse(((putCall?.[1] as RequestInit)?.body as string) ?? '{}'),
    ).not.toHaveProperty('responsibleHsaId')
  })

  it('changes responsible through the modal and keeps admins in the edit form', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'specification.changeResponsibleTitle',
    })
    const newResponsibleInput = within(dialog).getByRole('textbox', {
      name: /specification\.newResponsibleHsaId/,
    })
    await waitFor(() => {
      expect(newResponsibleInput).toBeEnabled()
    })
    fireEvent.change(newResponsibleInput, { target: { value: 'rita1' } })

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PUT') {
        return Promise.resolve(
          okJson({
            ...sampleSpecifications[0],
            responsibleDisplayName: 'Rita Reviewer',
            responsibleHsaId: 'SE5560000001-rita1',
          }),
        )
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specifications/KRAVUNDERLAG-SV/responsible',
        expect.objectContaining({ method: 'PUT' }),
      )
    })
    const putCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/specifications/KRAVUNDERLAG-SV/responsible' &&
        (init as RequestInit | undefined)?.method === 'PUT',
    )
    expect(
      JSON.parse(((putCall?.[1] as RequestInit)?.body as string) ?? '{}'),
    ).toEqual({ responsibleHsaId: 'SE5560000001-rita1' })
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: /specification\.responsibleHsaId/ }),
    ).toHaveValue('SE5560000001-rita1')
  })

  it('confirms unsaved edits and closes the form after non-admin responsible changes', async () => {
    confirmMock.mockResolvedValue(true)
    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me')
        return Promise.resolve(
          okJson({ ...sampleCurrentUser, roles: ['RequirementsEditor'] }),
        )
      if (url === '/api/hsa-id-prefixes')
        return Promise.resolve(okJson(hsaIdPrefixPayload))
      if (opts?.method === 'PUT') {
        return Promise.resolve(
          okJson({
            ...sampleSpecifications[0],
            responsibleDisplayName: 'Rita Reviewer',
            responsibleHsaId: 'SE5560000001-rita1',
          }),
        )
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /common\.edit/i })[0])
    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      { target: { value: 'Osparat namn' } },
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    )

    const dialog = screen.getByRole('dialog', {
      name: 'specification.changeResponsibleTitle',
    })
    const newResponsibleInput = within(dialog).getByRole('textbox', {
      name: /specification\.newResponsibleHsaId/,
    })
    await waitFor(() => {
      expect(newResponsibleInput).toBeEnabled()
    })
    fireEvent.change(newResponsibleInput, { target: { value: 'rita1' } })
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: /specification\.changeResponsible/,
      }),
    )

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultCancel: true,
          message: 'specification.responsibleChangeUnsavedConfirm',
        }),
      )
    })
    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: /specification\.name/ }),
      ).toBeNull()
    })
  })

  it('closes form on cancel', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })
    await openCreateSpecificationForm()
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(screen.queryByLabelText(/specification\.name/)).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return Promise.resolve(okJson({}))
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: [] }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    const deleteButtons = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger', icon: 'caution' }),
      )
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/specifications/KRAVUNDERLAG-SV',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('marks slug conflicts as alerts and clears stale errors when auto-generating a new slug', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 409,
        })
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    await openCreateSpecificationForm()

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    const uniqueIdInput = screen.getByRole('textbox', {
      name: /specification\.uniqueId/,
    })

    fireEvent.change(nameInput, { target: { value: 'Kravunderlag sv' } })
    fireEvent.blur(nameInput)
    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    const slugError = await screen.findByRole('alert')
    expect(uniqueIdInput).toHaveAttribute(
      'aria-describedby',
      'spec-unique-id-error',
    )
    expect(uniqueIdInput).toHaveAttribute('aria-invalid', 'true')
    expect(slugError).toHaveAttribute('id', 'spec-unique-id-error')

    fireEvent.change(nameInput, { target: { value: 'Nytt kravunderlag' } })
    fireEvent.blur(nameInput)

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(uniqueIdInput).toHaveValue('NYTT-KRAVUNDERLAG')
    expect(uniqueIdInput).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps the previous slug and shows an inline error when slug generation returns empty', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    await openCreateSpecificationForm()

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    const uniqueIdInput = screen.getByRole('textbox', {
      name: /specification\.uniqueId/,
    })

    fireEvent.change(nameInput, { target: { value: 'Nytt kravunderlag' } })
    fireEvent.blur(nameInput)
    expect(uniqueIdInput).toHaveValue('NYTT-KRAVUNDERLAG')

    fireEvent.change(nameInput, { target: { value: 'och i' } })
    fireEvent.blur(nameInput)

    const slugError = await screen.findByRole('alert')
    expect(slugError).toHaveTextContent(
      'specification.uniqueIdGenerationFailed',
    )
    expect(uniqueIdInput).toHaveValue('NYTT-KRAVUNDERLAG')
  })

  it('shows saving state and keeps cancel disabled while submitting', async () => {
    const postRequest = createDeferred<ReturnType<typeof okJson>>()

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return postRequest.promise
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    await openCreateSpecificationForm()

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    fireEvent.change(nameInput, { target: { value: 'Nytt kravunderlag' } })
    fireEvent.blur(nameInput)
    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    const saveButton = screen.getByRole('button', { name: /common\.saving/i })
    const cancelButton = screen.getByRole('button', { name: /common\.cancel/i })

    expect(saveButton).toBeDisabled()
    expect(cancelButton).toBeDisabled()

    fireEvent.click(cancelButton)
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toBeInTheDocument()

    postRequest.resolve(okJson({ id: 2 }))

    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: /specification\.name/ }),
      ).toBeNull()
    })
  })

  it('shows an alert dialog when deleting a specification fails', async () => {
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    mockApi((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        return Promise.resolve({
          ok: false,
          text: async () => 'Delete failed',
        })
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ specifications: sampleSpecifications }))
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Kravunderlag sv')).toBeInTheDocument()
    })

    const [deleteButton] = screen.getAllByRole('button', {
      name: /common\.delete/i,
    })
    expect(deleteButton).toBeDefined()
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(confirmMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          icon: 'caution',
          message: 'Delete failed',
          showCancel: false,
          title: 'common.error',
          variant: 'danger',
        }),
      )
    })
  })

  it('shows a visible error when loading specifications fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    mockApi((url: string) => {
      if (url === '/api/specifications') {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: async () => 'Service unavailable',
        })
      }
      if (url === '/api/specification-governance-object-types')
        return Promise.resolve(
          okJson({ governanceObjectTypes: sampleGovernanceObjectTypes }),
        )
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'specification.loadSpecificationsFailed: Service unavailable',
    )
    expect(screen.queryByText('specification.emptyState')).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
