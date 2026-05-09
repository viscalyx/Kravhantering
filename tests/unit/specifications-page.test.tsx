import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
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
  '@/app/[locale]/specifications/[slug]/requirements-specification-detail-client',
  () => ({
    default: ({
      initialData,
      specificationSlug,
    }: {
      initialData: { specificationItems: unknown[] }
      specificationSlug: string
    }) => (
      <div>{`RequirementsSpecificationDetailClient mounted: ${specificationSlug} (${initialData.specificationItems.length})`}</div>
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

  it('RequirementsSpecificationDetailPage passes the slug to RequirementsSpecificationDetailClient', async () => {
    const { default: RequirementsSpecificationDetailPage } = await import(
      '@/app/[locale]/specifications/[slug]/page'
    )
    const { loadRequirementsSpecificationDetailInitialData } = await import(
      '@/lib/specifications/preload'
    )

    const element = await RequirementsSpecificationDetailPage({
      params: Promise.resolve({ locale: 'en', slug: 'ETJANST-UPP-2026' }),
    })

    render(element)
    expect(
      screen.getByText(
        'RequirementsSpecificationDetailClient mounted: ETJANST-UPP-2026 (1)',
      ),
    ).toBeInTheDocument()
    expect(loadRequirementsSpecificationDetailInitialData).toHaveBeenCalledWith(
      {
        locale: 'en',
        slug: 'ETJANST-UPP-2026',
      },
    )
  })
})
