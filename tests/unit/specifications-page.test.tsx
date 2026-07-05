import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
  redirect: navigationMocks.redirect,
}))

vi.mock('@/i18n/routing', () => ({
  routing: {
    defaultLocale: 'sv',
    locales: ['en', 'sv'],
  },
}))

vi.mock('@/app/[locale]/specifications/specifications-client', () => ({
  default: ({
    initialData,
  }: {
    initialData: { specifications: unknown[] }
  }) => (
    <div>{`RequirementsSpecificationsClient mounted: ${initialData.specifications.length}`}</div>
  ),
}))

vi.mock(
  '@/app/[locale]/specifications/[specificationId]/requirements-specification-detail-client',
  () => ({
    default: ({
      initialData,
      specificationId,
    }: {
      initialData: { specificationItems: unknown[] }
      specificationId: number
    }) => (
      <div>{`RequirementsSpecificationDetailClient mounted: ${specificationId} (${initialData.specificationItems.length})`}</div>
    ),
  }),
)

vi.mock('@/lib/specifications/preload', () => ({
  loadRequirementsSpecificationDetailInitialData: vi.fn(async () => ({
    specificationItems: [{ id: 1 }],
  })),
  loadRequirementsSpecificationsInitialData: vi.fn(async () => ({
    specifications: [{ id: 1 }],
  })),
  resolveRequirementsSpecificationRouteParam: vi.fn(async (value: string) =>
    value === 'MISSING' ? null : { fromCode: false, id: Number(value) },
  ),
}))

describe('specifications pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('RequirementsSpecificationsPage returns specifications metadata and mounts the client', async () => {
    const { default: RequirementsSpecificationsPage, generateMetadata } =
      await import('@/app/[locale]/specifications/page')
    const { loadRequirementsSpecificationsInitialData } = await import(
      '@/lib/specifications/preload'
    )

    const metadata = await generateMetadata()
    expect(metadata.title).toBe('specifications')

    render(await RequirementsSpecificationsPage())
    expect(
      screen.getByText('RequirementsSpecificationsClient mounted: 1'),
    ).toBeInTheDocument()
    expect(loadRequirementsSpecificationsInitialData).toHaveBeenCalledWith()
  })

  it('RequirementsSpecificationDetailPage passes the numeric id to RequirementsSpecificationDetailClient', async () => {
    const { default: RequirementsSpecificationDetailPage } = await import(
      '@/app/[locale]/specifications/[specificationId]/page'
    )
    const { loadRequirementsSpecificationDetailInitialData } = await import(
      '@/lib/specifications/preload'
    )

    const element = await RequirementsSpecificationDetailPage({
      params: Promise.resolve({ locale: 'en', specificationId: '8' }),
    })

    render(element)
    expect(
      screen.getByText('RequirementsSpecificationDetailClient mounted: 8 (1)'),
    ).toBeInTheDocument()
    expect(loadRequirementsSpecificationDetailInitialData).toHaveBeenCalledWith(
      {
        locale: 'en',
        specificationId: 8,
      },
    )
  })

  it('RequirementsSpecificationDetailPage redirects specification-code aliases to the numeric URL', async () => {
    const { default: RequirementsSpecificationDetailPage } = await import(
      '@/app/[locale]/specifications/[specificationId]/page'
    )
    const { resolveRequirementsSpecificationRouteParam } = await import(
      '@/lib/specifications/preload'
    )
    vi.mocked(resolveRequirementsSpecificationRouteParam).mockResolvedValueOnce(
      {
        fromCode: true,
        id: 8,
      },
    )

    await expect(
      RequirementsSpecificationDetailPage({
        params: Promise.resolve({
          locale: 'sv',
          specificationId: 'ETJANST-UPP-2026',
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/sv/specifications/8')
    expect(navigationMocks.redirect).toHaveBeenCalledWith(
      '/sv/specifications/8',
    )
  })

  it('RequirementsSpecificationDetailPage renders a localized forbidden surface with responsible contact', async () => {
    const { default: RequirementsSpecificationDetailPage } = await import(
      '@/app/[locale]/specifications/[specificationId]/page'
    )
    const { loadRequirementsSpecificationDetailInitialData } = await import(
      '@/lib/specifications/preload'
    )
    vi.mocked(
      loadRequirementsSpecificationDetailInitialData,
    ).mockResolvedValueOnce({
      forbidden: {
        responsible: {
          displayName: 'Petra Specresp',
          email: 'petra.specresp@example.test',
          hsaId: 'SE5560000001-specresp1',
        },
        specification: {
          name: 'E-tjänstupphandling',
          specificationCode: 'ETJANST-UPP-2026',
        },
      },
      specificationItems: [],
    } as never)

    const element = await RequirementsSpecificationDetailPage({
      params: Promise.resolve({ locale: 'sv', specificationId: '8' }),
    })

    render(element)
    expect(screen.getByText('forbiddenTitle')).toBeInTheDocument()
    expect(screen.getByText('Petra Specresp')).toBeInTheDocument()
    expect(screen.getByText('petra.specresp@example.test')).toBeInTheDocument()
    expect(
      screen.queryByText(/RequirementsSpecificationDetailClient mounted/),
    ).toBeNull()
  })

  it('RequirementsSpecificationDetailPage delegates missing specifications to notFound', async () => {
    const { default: RequirementsSpecificationDetailPage } = await import(
      '@/app/[locale]/specifications/[specificationId]/page'
    )
    await expect(
      RequirementsSpecificationDetailPage({
        params: Promise.resolve({ locale: 'sv', specificationId: 'MISSING' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(navigationMocks.notFound).toHaveBeenCalled()
  })
})
