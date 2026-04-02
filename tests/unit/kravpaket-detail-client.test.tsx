import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import KravpaketDetailClient from '@/app/[locale]/kravpaket/[slug]/kravpaket-detail-client'

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

vi.mock('@/app/[locale]/kravkatalog/[id]/requirement-detail-client', () => ({
  default: ({ requirementId }: { requirementId: number }) => (
    <div>{`Requirement detail ${requirementId}`}</div>
  ),
}))

vi.mock('@/components/RequirementsTable', () => ({
  default: ({ rows }: { rows: { id: number }[] }) => (
    <div>{`rows:${rows.length}`}</div>
  ),
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

describe('KravpaketDetailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation((input: string | Request) => {
      const url = typeof input === 'string' ? input : input.url

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

      if (url === '/api/requirement-packages/BEHORIGHET-IAM/items') {
        return Promise.resolve(okJson({ items: [] }))
      }

      if (url.startsWith('/api/requirements?')) {
        return Promise.resolve(
          okJson({ pagination: { hasMore: false }, requirements: [] }),
        )
      }

      if (url === '/api/requirement-areas') {
        return Promise.resolve(okJson({ areas: [] }))
      }

      if (url === '/api/usage-scenarios') {
        return Promise.resolve(okJson({ scenarios: [] }))
      }

      if (url === '/api/requirement-packages/BEHORIGHET-IAM/needs-references') {
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
          okJson({ types: [{ id: 2, nameEn: 'Program', nameSv: 'Program' }] }),
        )
      }

      return Promise.resolve(okJson({}))
    })
  })

  it('opens and closes the package edit view from the title action', async () => {
    const { container } = render(
      <KravpaketDetailClient packageSlug="BEHORIGHET-IAM" />,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Authorization and IAM',
        }),
      ).toBeInTheDocument()
    })

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
})
