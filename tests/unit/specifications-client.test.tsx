import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
      if (this.dataset.packageRequirementAreaPillList === 'true') {
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

const sampleAreas = [{ id: 1, nameSv: 'Område', nameEn: 'Area' }]
const sampleTypes = [{ id: 1, nameSv: 'Typ', nameEn: 'Type' }]
const sampleStatuses = [{ id: 1, nameSv: 'Utveckling', nameEn: 'Development' }]
const samplePackages = [
  {
    id: 1,
    name: 'Paket sv',
    uniqueId: 'PAKET-SV',
    specificationResponsibilityAreaId: 1,
    specificationImplementationTypeId: 1,
    specificationLifecycleStatusId: 1,
    responsibilityArea: sampleAreas[0],
    implementationType: sampleTypes[0],
    lifecycleStatus: sampleStatuses[0],
    itemCount: 0,
    requirementAreas: [],
    businessNeedsReference: null,
  },
]

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
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
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
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
  })

  it('fetches and displays packages', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
    expect(screen.getByText('Area')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Development')).toBeInTheDocument()
  })

  it('fetches and displays packages after strict-mode effect replays', async () => {
    render(
      <StrictMode>
        <RequirementsSpecificationsClient />
      </StrictMode>,
    )

    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    expect(screen.getByText('Area')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
  })

  it('filters packages by the name column and clears the search', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(
          okJson({
            packages: [
              {
                ...samplePackages[0],
                id: 1,
                name: 'Upphandling av e-tjänstplattform',
                uniqueId: 'ETJANST-UPP-2026',
              },
              {
                ...samplePackages[0],
                id: 2,
                name: 'Införande av säkerhetslyft Q2',
                uniqueId: 'SAKLYFT-INFOR-Q2',
              },
            ],
          }),
        )
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
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

  it('shows a no-results row when the name filter matches no packages', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(
          okJson({
            packages: [
              {
                ...samplePackages[0],
                id: 1,
                name: 'Upphandling av e-tjänstplattform',
                uniqueId: 'ETJANST-UPP-2026',
              },
            ],
          }),
        )
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
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

  it('renders an empty-state row when there are no packages', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ packages: [] }))
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)

    const emptyState = await screen.findByText('specification.emptyState')
    expect(emptyState).toBeInTheDocument()
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '7')
  })

  it('renders requirement-area badges as compact static pills', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/specifications')
        return Promise.resolve(
          okJson({
            packages: [
              {
                ...samplePackages[0],
                requirementAreas: [{ id: 9, name: 'Identity' }],
              },
            ],
          }),
        )
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
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
      fetchMock.mockImplementation((url: string) => {
        if (url === '/api/specifications')
          return Promise.resolve(
            okJson({
              packages: [
                {
                  ...samplePackages[0],
                  requirementAreas: [
                    { id: 9, name: 'Identity' },
                    { id: 10, name: 'Integration' },
                    { id: 11, name: 'Security' },
                  ],
                },
              ],
            }),
          )
        if (url === '/api/specification-responsibility-areas')
          return Promise.resolve(okJson({ areas: sampleAreas }))
        if (url === '/api/specification-implementation-types')
          return Promise.resolve(okJson({ types: sampleTypes }))
        if (url === '/api/specification-lifecycle-statuses')
          return Promise.resolve(okJson({ statuses: sampleStatuses }))
        return Promise.resolve(okJson({}))
      })

      render(<RequirementsSpecificationsClient />)

      const list = await waitFor(() => {
        const node = document.querySelector(
          '[data-package-requirement-area-pill-list="true"]',
        )
        expect(node).not.toBeNull()
        return node as HTMLElement
      })
      const group = list.closest('[data-package-requirement-area-pills="true"]')
      const expandButton = await screen.findByRole('button', {
        name: 'common.showMore',
      })

      expect(group?.className).toContain('items-center')
      expect(expandButton).toHaveAttribute('aria-expanded', 'false')
      expect(expandButton.className).toContain('min-h-[44px]')
      expect(expandButton.className).toContain('min-w-[44px]')
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

  it('renders package row actions as compact icon buttons', async () => {
    render(<RequirementsSpecificationsClient />)

    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
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
      screen.queryByTestId('requirement-packages-loading'),
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
      screen.getByTestId('requirement-packages-loading'),
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
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toBeInTheDocument()
  })

  it('shows inline help for package form fields', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'common.help: specification.name' }),
    )

    expect(screen.getByText('specification.help.name')).toBeInTheDocument()
  })

  it('renders package form controls with a 44px minimum height', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    const filterInput = screen.getByRole('textbox', {
      name: 'specification.filterByName',
    })
    expect(filterInput.className).toContain('min-h-[44px]')

    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )

    for (const field of [
      screen.getByRole('textbox', { name: /specification\.name/ }),
      screen.getByRole('textbox', { name: /specification\.uniqueId/ }),
      screen.getByRole('combobox', {
        name: /specification\.responsibilityArea/,
      }),
      screen.getByRole('combobox', {
        name: /specification\.implementationType/,
      }),
      screen.getByRole('textbox', {
        name: /specification\.businessNeedsReference/,
      }),
    ]) {
      expect(field.className).toContain('min-h-[44px]')
    }
  })

  it('submits create form', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )

    fireEvent.change(
      screen.getByRole('textbox', { name: /specification\.name/ }),
      {
        target: { value: 'Ny' },
      },
    )
    fireEvent.blur(screen.getByRole('textbox', { name: /specification\.name/ }))

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return Promise.resolve(okJson({ id: 2 }))
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
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
  })

  it('shows an inline save error for non-conflict failures', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    fireEvent.change(nameInput, { target: { value: 'Nytt paket' } })
    fireEvent.blur(nameInput)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Backend unavailable',
        })
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
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

  it('opens edit form with existing data', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
    const editButtons = screen.getAllByRole('button', {
      name: /common\.edit/i,
    })
    fireEvent.click(editButtons[0])
    expect(
      (
        screen.getByRole('textbox', {
          name: /specification\.name/,
        }) as HTMLInputElement
      ).value,
    ).toBe('Paket sv')
  })

  it('closes form on cancel', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(screen.queryByLabelText(/specification\.name/)).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return Promise.resolve(okJson({}))
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ packages: [] }))
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
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
        '/api/specifications/PAKET-SV',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('marks slug conflicts as alerts and clears stale errors when auto-generating a new slug', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 409,
        })
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    const uniqueIdInput = screen.getByRole('textbox', {
      name: /specification\.uniqueId/,
    })

    fireEvent.change(nameInput, { target: { value: 'Paket sv' } })
    fireEvent.blur(nameInput)
    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    const slugError = await screen.findByRole('alert')
    expect(uniqueIdInput).toHaveAttribute(
      'aria-describedby',
      'pkg-unique-id-error',
    )
    expect(uniqueIdInput).toHaveAttribute('aria-invalid', 'true')
    expect(slugError).toHaveAttribute('id', 'pkg-unique-id-error')

    fireEvent.change(nameInput, { target: { value: 'Nytt paket' } })
    fireEvent.blur(nameInput)

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(uniqueIdInput).toHaveValue('NYTT-PAKET')
    expect(uniqueIdInput).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps the previous slug and shows an inline error when slug generation returns empty', async () => {
    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    const uniqueIdInput = screen.getByRole('textbox', {
      name: /specification\.uniqueId/,
    })

    fireEvent.change(nameInput, { target: { value: 'Nytt paket' } })
    fireEvent.blur(nameInput)
    expect(uniqueIdInput).toHaveValue('NYTT-PAKET')

    fireEvent.change(nameInput, { target: { value: 'och i' } })
    fireEvent.blur(nameInput)

    const slugError = await screen.findByRole('alert')
    expect(slugError).toHaveTextContent(
      'specification.uniqueIdGenerationFailed',
    )
    expect(uniqueIdInput).toHaveValue('NYTT-PAKET')
  })

  it('shows saving state and keeps cancel disabled while submitting', async () => {
    const postRequest = createDeferred<ReturnType<typeof okJson>>()

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return postRequest.promise
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /specification\.newSpecification/i }),
    )

    const nameInput = screen.getByRole('textbox', {
      name: /specification\.name/,
    })
    fireEvent.change(nameInput, { target: { value: 'Nytt paket' } })
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

  it('shows an alert dialog when deleting a package fails', async () => {
    confirmMock.mockResolvedValueOnce(true).mockResolvedValueOnce(true)

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') {
        return Promise.resolve({
          ok: false,
          text: async () => 'Delete failed',
        })
      }
      if (url === '/api/specifications')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/specification-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/specification-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementsSpecificationsClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
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

  it('shows a visible error when loading packages fails', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/specifications') {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: async () => 'Service unavailable',
        })
      }
      if (url === '/api/specification-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
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
