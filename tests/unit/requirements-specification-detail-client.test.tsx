import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementsSpecificationDetailClient from '@/app/[locale]/specifications/[slug]/requirements-specification-detail-client'
import { ConfirmModalProvider } from '@/components/ConfirmModal'

const requirementsTableMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => {
    const t = (key: string) => (ns ? `${ns}.${key}` : key)
    t.rich = (key: string) => (ns ? `${ns}.${key}` : key)
    return t
  },
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
}))

vi.mock('@/app/[locale]/requirements/[id]/requirement-detail-client', () => ({
  default: ({ requirementId }: { requirementId: number }) => (
    <div>{`Requirement detail ${requirementId}`}</div>
  ),
}))

vi.mock('@/components/RequirementsTable', () => ({
  default: (props: {
    floatingActionRailPlacement?: string
    floatingActions?: {
      ariaLabel: string
      developerModeContext?: string
      developerModeValue?: string
      icon: ReactNode
      id: string
      onClick?: () => void
    }[]
    onSelectionChange?: (ids: Set<number>) => void
    rows: { id: number; itemRef?: string }[]
    stickyTopOffsetClassName?: string
    stickyTitle?: ReactNode
    stickyTitleActions?: ReactNode
  }) => {
    requirementsTableMock(props)
    return (
      <div
        data-floating-action-rail-placement={
          props.floatingActionRailPlacement ?? 'fixed-right'
        }
      >
        <div data-testid="requirements-table-sticky-title">
          {props.stickyTitle}
        </div>
        <div data-testid="requirements-table-sticky-title-actions">
          {props.stickyTitleActions}
        </div>
        {props.floatingActions?.map(action => (
          <button
            aria-label={action.ariaLabel}
            data-developer-mode-context={action.developerModeContext}
            data-developer-mode-name="table action"
            data-developer-mode-value={action.developerModeValue}
            key={action.id}
            onClick={action.onClick}
            type="button"
          >
            {action.icon}
          </button>
        ))}
        {props.rows[0] ? (
          <button
            aria-label={`select-row-${props.rows[0].id}`}
            onClick={() =>
              props.onSelectionChange?.(new Set([props.rows[0].id]))
            }
            type="button"
          >
            select
          </button>
        ) : null}
        {`rows:${props.rows.length}`}
      </div>
    )
  },
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode
    href: string
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace: vi.fn() }),
}))

function okJson(body: unknown) {
  return { ok: true, json: async () => body }
}

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
let addRequirementsResponse: { body: unknown; ok: boolean }
let failNextAvailableRequirementsFetch = false
let failNextPackageItemsFetch = false

function renderRequirementsSpecificationDetailClient() {
  return render(
    <ConfirmModalProvider>
      <RequirementsSpecificationDetailClient specificationSlug="ETJANST-UPP-2026" />
    </ConfirmModalProvider>,
  )
}

describe('RequirementsSpecificationDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirementsTableMock.mockReset()
    addRequirementsResponse = { body: { ok: true }, ok: true }
    failNextAvailableRequirementsFetch = false
    failNextPackageItemsFetch = false
    fetchMock.mockImplementation(
      (input: string | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url
        const method =
          init?.method ?? (typeof input === 'string' ? 'GET' : input.method)

        if (url === '/api/specifications/ETJANST-UPP-2026') {
          return Promise.resolve(
            okJson({
              businessNeedsReference: 'Shared IAM business case',
              id: 8,
              implementationType: { nameEn: 'Program', nameSv: 'Program' },
              lifecycleStatus: { nameEn: 'Development', nameSv: 'Utveckling' },
              name: 'Authorization and IAM',
              specificationImplementationTypeId: 2,
              specificationLifecycleStatusId: 3,
              specificationResponsibilityAreaId: 1,
              responsibilityArea: { nameEn: 'Platform', nameSv: 'Plattform' },
              uniqueId: 'ETJANST-UPP-2026',
            }),
          )
        }

        if (
          url === '/api/specifications/ETJANST-UPP-2026/items' &&
          method === 'POST'
        ) {
          return Promise.resolve({
            json: async () => addRequirementsResponse.body,
            ok: addRequirementsResponse.ok,
          })
        }

        if (
          url === '/api/specifications/ETJANST-UPP-2026/items' &&
          method === 'GET'
        ) {
          if (failNextPackageItemsFetch) {
            failNextPackageItemsFetch = false
            return Promise.resolve({
              json: async () => ({}),
              ok: false,
            })
          }

          return Promise.resolve(
            okJson({
              items: [
                {
                  area: { name: 'Security' },
                  id: 101,
                  isArchived: false,
                  itemRef: 'lib:31',
                  kind: 'library',
                  specificationItemId: 31,
                  uniqueId: 'BEH0001',
                  version: {
                    categoryNameEn: 'Business requirement',
                    categoryNameSv: 'Verksamhetskrav',
                    description: 'RBAC should be enforced.',
                    qualityCharacteristicNameEn: null,
                    qualityCharacteristicNameSv: null,
                    requiresTesting: true,
                    status: 3,
                    statusColor: '#22c55e',
                    statusNameEn: 'Published',
                    statusNameSv: 'Publicerad',
                    typeNameEn: 'Non-functional',
                    typeNameSv: 'Icke-funktionellt',
                    versionNumber: 1,
                  },
                },
              ],
            }),
          )
        }

        if (url.startsWith('/api/requirements?')) {
          if (failNextAvailableRequirementsFetch) {
            failNextAvailableRequirementsFetch = false
            return Promise.resolve({
              json: async () => ({}),
              ok: false,
            })
          }

          return Promise.resolve(
            okJson({
              pagination: { hasMore: false },
              requirements: [
                {
                  area: { name: 'Platform' },
                  id: 202,
                  isArchived: false,
                  uniqueId: 'IAM0202',
                  version: {
                    categoryNameEn: 'Business requirement',
                    categoryNameSv: 'Verksamhetskrav',
                    description: 'Allow package-level linking.',
                    qualityCharacteristicNameEn: null,
                    qualityCharacteristicNameSv: null,
                    requiresTesting: true,
                    status: 3,
                    statusColor: '#22c55e',
                    statusNameEn: 'Published',
                    statusNameSv: 'Publicerad',
                    typeNameEn: 'Non-functional',
                    typeNameSv: 'Icke-funktionellt',
                    versionNumber: 1,
                  },
                },
              ],
            }),
          )
        }

        if (url === '/api/requirement-areas') {
          return Promise.resolve(okJson({ areas: [] }))
        }

        if (url === '/api/requirement-categories') {
          return Promise.resolve(okJson({ categories: [] }))
        }

        if (url === '/api/requirement-types') {
          return Promise.resolve(okJson({ types: [] }))
        }

        if (url === '/api/risk-levels') {
          return Promise.resolve(okJson({ riskLevels: [] }))
        }

        if (url === '/api/usage-scenarios') {
          return Promise.resolve(okJson({ scenarios: [] }))
        }

        if (url === '/api/specifications/ETJANST-UPP-2026/needs-references') {
          return Promise.resolve(okJson({ needsReferences: [] }))
        }

        if (url === '/api/specification-responsibility-areas') {
          return Promise.resolve(
            okJson({
              areas: [{ id: 1, nameEn: 'Platform', nameSv: 'Plattform' }],
            }),
          )
        }

        if (url === '/api/specification-implementation-types') {
          return Promise.resolve(
            okJson({
              types: [{ id: 2, nameEn: 'Program', nameSv: 'Program' }],
            }),
          )
        }

        if (url === '/api/specification-lifecycle-statuses') {
          return Promise.resolve(
            okJson({
              statuses: [
                { id: 3, nameEn: 'Development', nameSv: 'Utveckling' },
              ],
            }),
          )
        }

        if (url.startsWith('/api/norm-references')) {
          return Promise.resolve(okJson({ normReferences: [] }))
        }

        if (url.startsWith('/api/quality-characteristics')) {
          return Promise.resolve(okJson({ qualityCharacteristics: [] }))
        }

        if (url === '/api/specification-item-statuses') {
          return Promise.resolve(okJson({ statuses: [] }))
        }

        throw new Error(`Unmocked fetch: ${method} ${url}`)
      },
    )
  })

  it('opens and closes the package edit view from the title action', async () => {
    const { container } = renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    const headerSummary = container.querySelector(
      '[data-package-detail-header-summary="true"]',
    )
    const headerMetadata = container.querySelector(
      '[data-package-detail-header-metadata="true"]',
    )
    const pageShell = container.querySelector(
      '[data-package-detail-page-shell="true"]',
    ) as HTMLDivElement | null
    const splitPanel = container.querySelector(
      '[data-package-detail-split-panel="true"]',
    ) as HTMLDivElement | null
    const titleRow = container.querySelector(
      '[data-package-detail-title-row="true"]',
    )
    expect(headerSummary).toBeTruthy()
    expect(headerMetadata).toBeTruthy()
    expect(pageShell).toBeTruthy()
    expect(splitPanel).toBeTruthy()
    expect(titleRow).toBeTruthy()
    expect(pageShell?.className).toContain('xl:h-[calc(100dvh-4rem)]')
    expect(splitPanel?.className).toContain('xl:-mx-8')
    expect(splitPanel?.className).toContain('xl:flex-1')
    expect(
      screen.queryByRole('link', { name: 'nav.specifications' }),
    ).not.toBeInTheDocument()
    expect(headerSummary).toHaveTextContent('Platform')
    expect(headerSummary).toHaveTextContent('Program')
    expect(headerSummary).toHaveTextContent('Shared IAM business case')
    expect(headerSummary).not.toHaveTextContent(
      'specification.businessNeedsReference',
    )
    expect(headerMetadata).not.toHaveTextContent('Shared IAM business case')

    const editButton = screen.getByRole('button', {
      name: /specification\.editSpecification/i,
    })
    expect(editButton).toHaveAttribute('aria-expanded', 'false')
    expect(editButton).toHaveAttribute(
      'data-developer-mode-name',
      'detail action',
    )
    expect(editButton).toHaveAttribute(
      'data-developer-mode-context',
      'requirements specification detail',
    )
    expect(editButton).toHaveAttribute(
      'data-developer-mode-value',
      'edit package',
    )
    expect(titleRow).toContainElement(
      screen.getByRole('heading', {
        level: 1,
        name: 'Authorization and IAM',
      }),
    )
    expect(titleRow).toContainElement(editButton)

    fireEvent.click(editButton)

    expect(editButton).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('textbox', { name: /specification\.name/ }),
    ).toHaveValue('Authorization and IAM')

    const form = container.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="requirements specification detail"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'edit')

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: /specification\.name/ }),
      ).not.toBeInTheDocument()
    })
    expect(editButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('uses inline top rails and sticky table titles for the split tables', async () => {
    const { container } = renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(requirementsTableMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    expect(
      screen.getByText('specification.itemsInSpecification', {
        selector: 'h2',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('specification.availableRequirements', {
        selector: 'h2',
      }),
    ).toBeInTheDocument()

    const tableProps = requirementsTableMock.mock.calls.map(call => call[0])

    expect(
      tableProps.every(
        props => props.floatingActionRailPlacement === 'inline-top',
      ),
    ).toBe(true)
    expect(
      tableProps.every(
        props => props.stickyTopOffsetClassName === 'top-16 xl:top-0',
      ),
    ).toBe(true)
    expect(
      container.querySelector('[data-package-detail-list-panel="items"]'),
    ).toBeTruthy()
    expect(
      container.querySelector('[data-package-detail-list-panel="available"]'),
    ).toBeTruthy()
  })

  it('keeps the add dialog open and shows inline errors when adding requirements fails', async () => {
    addRequirementsResponse = {
      body: { error: 'Could not add requirements' },
      ok: false,
    }

    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )

    const dialog = await screen.findByRole('dialog')

    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add requirements',
    )
    expect(dialog).toBeInTheDocument()
  })

  it('closes the add dialog when Escape is pressed inside the panel', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )

    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
      target: { value: 'new' },
    })

    fireEvent.keyDown(
      screen.getByLabelText('specification.addNeedsRefTextLabel'),
      {
        key: 'Escape',
      },
    )

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('disables needs-reference inputs and help toggles while add is submitting', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )

    await screen.findByRole('dialog')
    fireEvent.change(screen.getByLabelText('specification.addNeedsRef'), {
      target: { value: 'new' },
    })

    const select = screen.getByLabelText('specification.addNeedsRef')
    const textarea = screen.getByLabelText('specification.addNeedsRefTextLabel')
    const needsRefHelpButton = screen.getByRole('button', {
      name: 'common.help: specification.addNeedsRef',
    })
    const needsRefTextHelpButton = screen.getByRole('button', {
      name: 'common.help: specification.addNeedsRefTextLabel',
    })

    let resolvePost:
      | ((value: { json: () => Promise<unknown>; ok: boolean }) => void)
      | undefined
    fetchMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolvePost = resolve
        }),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    await waitFor(() => {
      expect(select).toBeDisabled()
      expect(textarea).toBeDisabled()
      expect(needsRefHelpButton).toBeDisabled()
      expect(needsRefTextHelpButton).toBeDisabled()
    })

    await act(async () => {
      resolvePost?.({
        json: async () => ({ ok: true }),
        ok: true,
      })
    })
  })

  it('keeps the add dialog open when a post-add refresh fails', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'select-row-202' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: 'specification.addSelectedToSpecification',
      }),
    )

    const dialog = await screen.findByRole('dialog')
    failNextPackageItemsFetch = true

    fireEvent.click(
      screen.getByRole('button', { name: 'specification.confirmAdd' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('common.error')
    expect(dialog).toBeInTheDocument()
  })

  it('opens the specification-local requirement dialog from the left-panel action', async () => {
    renderRequirementsSpecificationDetailClient()

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

    const createButton = screen.getByRole('button', {
      name: 'specification.newLocalRequirement',
    })
    expect(createButton).toHaveAttribute(
      'data-developer-mode-name',
      'table action',
    )
    expect(createButton).toHaveAttribute(
      'data-developer-mode-context',
      'requirements specification detail',
    )
    expect(createButton).toHaveAttribute(
      'data-developer-mode-value',
      'create local requirement',
    )

    fireEvent.click(createButton)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'specification.newLocalRequirement',
        }),
      ).toBeInTheDocument()
    })
  })
})
