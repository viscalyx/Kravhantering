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

let fetchMock: ReturnType<typeof vi.fn>

import RequirementPackagesClient from '@/app/[locale]/requirement-packages/requirement-packages-client'

const sampleAreas = [{ id: 1, nameSv: 'Område', nameEn: 'Area' }]
const sampleTypes = [{ id: 1, nameSv: 'Typ', nameEn: 'Type' }]
const sampleStatuses = [{ id: 1, nameSv: 'Utveckling', nameEn: 'Development' }]
const samplePackages = [
  {
    id: 1,
    name: 'Paket sv',
    uniqueId: 'PAKET-SV',
    packageResponsibilityAreaId: 1,
    packageImplementationTypeId: 1,
    packageLifecycleStatusId: 1,
    responsibilityArea: sampleAreas[0],
    implementationType: sampleTypes[0],
    lifecycleStatus: sampleStatuses[0],
    itemCount: 0,
    requirementAreas: [],
    businessNeedsReference: null,
  },
]

describe('RequirementPackagesClient', () => {
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
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })
  })

  it('renders heading', async () => {
    render(<RequirementPackagesClient />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'nav.packages',
    )
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
  })

  it('fetches and displays packages', async () => {
    render(<RequirementPackagesClient />)
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
        <RequirementPackagesClient />
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
      if (url === '/api/requirement-packages')
        return Promise.resolve(
          okJson({
            packages: [
              {
                ...samplePackages[0],
                id: 1,
                name: 'Införande av e-tjänstplattform',
                uniqueId: 'ETJANSTPLATT',
              },
              {
                ...samplePackages[0],
                id: 2,
                name: 'Säkerhetslyft Q2',
                uniqueId: 'SAKLYFT-Q2',
              },
            ],
          }),
        )
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementPackagesClient />)

    const filterInput = await screen.findByRole('textbox', {
      name: 'package.filterByName',
    })

    expect(
      screen.getByText('Införande av e-tjänstplattform'),
    ).toBeInTheDocument()
    expect(screen.getByText('Säkerhetslyft Q2')).toBeInTheDocument()

    fireEvent.change(filterInput, { target: { value: 'e-tjänst' } })

    await waitFor(() => {
      expect(
        screen.getByText('Införande av e-tjänstplattform'),
      ).toBeInTheDocument()
      expect(screen.queryByText('Säkerhetslyft Q2')).not.toBeInTheDocument()
    })

    fireEvent.click(
      await screen.findByRole('button', { name: 'common.clearSearch' }),
    )

    await waitFor(() => {
      expect(
        screen.getByText('Införande av e-tjänstplattform'),
      ).toBeInTheDocument()
      expect(screen.getByText('Säkerhetslyft Q2')).toBeInTheDocument()
    })
  })

  it('shows a no-results row when the name filter matches no packages', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-packages')
        return Promise.resolve(
          okJson({
            packages: [
              {
                ...samplePackages[0],
                id: 1,
                name: 'Införande av e-tjänstplattform',
                uniqueId: 'ETJANSTPLATT',
              },
            ],
          }),
        )
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementPackagesClient />)

    fireEvent.change(
      await screen.findByRole('textbox', { name: 'package.filterByName' }),
      {
        target: { value: 'saknas' },
      },
    )

    await waitFor(() => {
      expect(screen.getByText('common.noResults')).toBeInTheDocument()
    })
    expect(screen.queryByText('package.emptyState')).toBeNull()
  })

  it('renders an empty-state row when there are no packages', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: [] }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementPackagesClient />)

    const emptyState = await screen.findByText('package.emptyState')
    expect(emptyState).toBeInTheDocument()
    expect(emptyState.closest('td')).toHaveAttribute('colspan', '7')
  })

  it('renders requirement-area badges with a 44px minimum touch target', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/requirement-packages')
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
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementPackagesClient />)

    const areaBadge = await screen.findByRole('link', { name: 'Identity' })
    expect(areaBadge.className).toContain('min-h-[44px]')
    expect(areaBadge.className).toContain('focus-visible:ring-2')
    expect(areaBadge.className).toContain('focus-visible:ring-offset-2')
  })

  it('does not show spinner immediately while loading', () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementPackagesClient />)
    expect(
      screen.queryByTestId('requirement-packages-loading'),
    ).not.toBeInTheDocument()
  })

  it('shows spinner after 200ms when still loading', async () => {
    vi.useFakeTimers()
    fetchMock.mockReturnValue(new Promise(() => {}))
    render(<RequirementPackagesClient />)
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

    const { unmount } = render(<RequirementPackagesClient />)

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('opens create form with fields', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )
    expect(
      screen.getByRole('textbox', { name: /package\.name/ }),
    ).toBeInTheDocument()
  })

  it('shows inline help for package form fields', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'common.help: package.name' }),
    )

    expect(screen.getByText('package.nameHelp')).toBeInTheDocument()
  })

  it('renders package form controls with a 44px minimum height', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    const filterInput = screen.getByRole('textbox', {
      name: 'package.filterByName',
    })
    expect(filterInput.className).toContain('min-h-[44px]')

    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )

    for (const field of [
      screen.getByRole('textbox', { name: /package\.name/ }),
      screen.getByRole('textbox', { name: /package\.uniqueId/ }),
      screen.getByRole('combobox', { name: /package\.responsibilityArea/ }),
      screen.getByRole('combobox', { name: /package\.implementationType/ }),
      screen.getByRole('textbox', {
        name: /package\.businessNeedsReference/,
      }),
    ]) {
      expect(field.className).toContain('min-h-[44px]')
    }
  })

  it('submits create form', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )

    fireEvent.change(screen.getByRole('textbox', { name: /package\.name/ }), {
      target: { value: 'Ny' },
    })
    fireEvent.blur(screen.getByRole('textbox', { name: /package\.name/ }))

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return Promise.resolve(okJson({ id: 2 }))
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/requirement-packages',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  it('shows an inline save error for non-conflict failures', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )

    const nameInput = screen.getByRole('textbox', { name: /package\.name/ })
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
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'package.saveFailed: Backend unavailable',
    )
    expect(
      screen.getByRole('textbox', { name: /package\.name/ }),
    ).toBeInTheDocument()
  })

  it('opens edit form with existing data', async () => {
    render(<RequirementPackagesClient />)
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
          name: /package\.name/,
        }) as HTMLInputElement
      ).value,
    ).toBe('Paket sv')
  })

  it('closes form on cancel', async () => {
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })
    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )
    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))
    expect(screen.queryByLabelText(/package\.name/)).toBeNull()
  })

  it('deletes with confirm', async () => {
    confirmMock.mockResolvedValue(true)
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return Promise.resolve(okJson({}))
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: [] }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
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
        '/api/requirement-packages/PAKET-SV',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('marks slug conflicts as alerts and clears stale errors when auto-generating a new slug', async () => {
    render(<RequirementPackagesClient />)
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
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )

    const nameInput = screen.getByRole('textbox', { name: /package\.name/ })
    const uniqueIdInput = screen.getByRole('textbox', {
      name: /package\.uniqueId/,
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
    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )

    const nameInput = screen.getByRole('textbox', { name: /package\.name/ })
    const uniqueIdInput = screen.getByRole('textbox', {
      name: /package\.uniqueId/,
    })

    fireEvent.change(nameInput, { target: { value: 'Nytt paket' } })
    fireEvent.blur(nameInput)
    expect(uniqueIdInput).toHaveValue('NYTT-PAKET')

    fireEvent.change(nameInput, { target: { value: 'och i' } })
    fireEvent.blur(nameInput)

    const slugError = await screen.findByRole('alert')
    expect(slugError).toHaveTextContent('package.uniqueIdGenerationFailed')
    expect(uniqueIdInput).toHaveValue('NYTT-PAKET')
  })

  it('shows saving state and keeps cancel disabled while submitting', async () => {
    const postRequest = createDeferred<ReturnType<typeof okJson>>()

    fetchMock.mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') {
        return postRequest.promise
      }
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementPackagesClient />)
    await waitFor(() => {
      expect(screen.getByText('Paket sv')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: /package\.newPackage/i }),
    )

    const nameInput = screen.getByRole('textbox', { name: /package\.name/ })
    fireEvent.change(nameInput, { target: { value: 'Nytt paket' } })
    fireEvent.blur(nameInput)
    fireEvent.click(screen.getByRole('button', { name: /common\.save/i }))

    const saveButton = screen.getByRole('button', { name: /common\.saving/i })
    const cancelButton = screen.getByRole('button', { name: /common\.cancel/i })

    expect(saveButton).toBeDisabled()
    expect(cancelButton).toBeDisabled()

    fireEvent.click(cancelButton)
    expect(
      screen.getByRole('textbox', { name: /package\.name/ }),
    ).toBeInTheDocument()

    postRequest.resolve(okJson({ id: 2 }))

    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: /package\.name/ }),
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
      if (url === '/api/requirement-packages')
        return Promise.resolve(okJson({ packages: samplePackages }))
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementPackagesClient />)
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
      if (url === '/api/requirement-packages') {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: async () => 'Service unavailable',
        })
      }
      if (url === '/api/package-responsibility-areas')
        return Promise.resolve(okJson({ areas: sampleAreas }))
      if (url === '/api/package-implementation-types')
        return Promise.resolve(okJson({ types: sampleTypes }))
      if (url === '/api/package-lifecycle-statuses')
        return Promise.resolve(okJson({ statuses: sampleStatuses }))
      return Promise.resolve(okJson({}))
    })

    render(<RequirementPackagesClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'package.loadPackagesFailed: Service unavailable',
    )
    expect(screen.queryByText('package.emptyState')).toBeNull()
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
