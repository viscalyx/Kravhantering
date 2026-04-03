import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RequirementPackageDetailClient from '@/app/[locale]/requirement-packages/[slug]/requirement-package-detail-client'

const requirementsTableMock = vi.fn()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (ns?: string) => (key: string) =>
    ns ? `${ns}.${key}` : key,
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
    onSelectionChange?: (ids: Set<number>) => void
    rows: { id: number }[]
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

describe('RequirementPackageDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requirementsTableMock.mockReset()
    addRequirementsResponse = { body: { ok: true }, ok: true }
    fetchMock.mockImplementation(
      (input: string | Request, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url
        const method =
          init?.method ?? (typeof input === 'string' ? 'GET' : input.method)

        if (url === '/api/requirement-packages/BEHORIGHET-IAM') {
          return Promise.resolve(
            okJson({
              businessNeedsReference: 'Shared IAM business case',
              id: 8,
              implementationType: { nameEn: 'Program', nameSv: 'Program' },
              name: 'Authorization and IAM',
              packageImplementationTypeId: 2,
              packageResponsibilityAreaId: 1,
              responsibilityArea: { nameEn: 'Platform', nameSv: 'Plattform' },
              uniqueId: 'BEHORIGHET-IAM',
            }),
          )
        }

        if (
          url === '/api/requirement-packages/BEHORIGHET-IAM/items' &&
          method === 'POST'
        ) {
          return Promise.resolve({
            json: async () => addRequirementsResponse.body,
            ok: addRequirementsResponse.ok,
          })
        }

        if (url === '/api/requirement-packages/BEHORIGHET-IAM/items') {
          return Promise.resolve(
            okJson({
              items: [
                {
                  area: { name: 'Security' },
                  id: 101,
                  isArchived: false,
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

        if (url === '/api/usage-scenarios') {
          return Promise.resolve(okJson({ scenarios: [] }))
        }

        if (
          url === '/api/requirement-packages/BEHORIGHET-IAM/needs-references'
        ) {
          return Promise.resolve(okJson({ needsReferences: [] }))
        }

        if (url === '/api/package-responsibility-areas') {
          return Promise.resolve(
            okJson({
              areas: [{ id: 1, nameEn: 'Platform', nameSv: 'Plattform' }],
            }),
          )
        }

        if (url === '/api/package-implementation-types') {
          return Promise.resolve(
            okJson({
              types: [{ id: 2, nameEn: 'Program', nameSv: 'Program' }],
            }),
          )
        }

        return Promise.resolve(okJson({}))
      },
    )
  })

  it('opens and closes the package edit view from the title action', async () => {
    const { container } = render(
      <RequirementPackageDetailClient packageSlug="BEHORIGHET-IAM" />,
    )

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
      screen.queryByRole('link', { name: 'nav.packages' }),
    ).not.toBeInTheDocument()
    expect(headerSummary).toHaveTextContent('Platform')
    expect(headerSummary).toHaveTextContent('Program')
    expect(headerSummary).toHaveTextContent('Shared IAM business case')
    expect(headerSummary).not.toHaveTextContent(
      'package.businessNeedsReference',
    )
    expect(headerMetadata).not.toHaveTextContent('Shared IAM business case')

    const editButton = screen.getByRole('button', {
      name: /package\.editPackage/i,
    })
    expect(editButton).toHaveAttribute('aria-expanded', 'false')
    expect(editButton).toHaveAttribute(
      'data-developer-mode-name',
      'detail action',
    )
    expect(editButton).toHaveAttribute(
      'data-developer-mode-context',
      'requirement package detail',
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
    expect(screen.getByRole('textbox', { name: /package\.name/ })).toHaveValue(
      'Authorization and IAM',
    )

    const form = container.querySelector(
      '[data-developer-mode-name="crud form"][data-developer-mode-context="requirement package detail"]',
    )
    expect(form).toHaveAttribute('data-developer-mode-value', 'edit')

    fireEvent.click(screen.getByRole('button', { name: /common\.cancel/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('textbox', { name: /package\.name/ }),
      ).not.toBeInTheDocument()
    })
    expect(editButton).toHaveAttribute('aria-expanded', 'false')
  })

  it('uses inline top rails and sticky table titles for the split tables', async () => {
    const { container } = render(
      <RequirementPackageDetailClient packageSlug="BEHORIGHET-IAM" />,
    )

    await waitFor(() => {
      expect(requirementsTableMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    expect(
      screen.getByText('package.itemsInPackage', { selector: 'h2' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('package.availableRequirements', { selector: 'h2' }),
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

    render(<RequirementPackageDetailClient packageSlug="BEHORIGHET-IAM" />)

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
      screen.getByRole('button', { name: 'package.addSelectedToPackage' }),
    )

    const dialog = await screen.findByRole('dialog')

    fireEvent.click(screen.getByRole('button', { name: 'package.confirmAdd' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add requirements',
    )
    expect(dialog).toBeInTheDocument()
  })
})
