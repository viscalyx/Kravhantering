import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/app/[locale]/specifications/specifications-client', () => ({
  default: () => <div>RequirementsSpecificationsClient mounted</div>,
}))

vi.mock(
  '@/app/[locale]/specifications/[slug]/requirements-specification-detail-client',
  () => ({
    default: ({ specificationSlug }: { specificationSlug: string }) => (
      <div>{`RequirementsSpecificationDetailClient mounted: ${specificationSlug}`}</div>
    ),
  }),
)

describe('specifications pages', () => {
  it('RequirementsSpecificationsPage returns specifications metadata and mounts the client', async () => {
    const { default: RequirementsSpecificationsPage, generateMetadata } =
      await import('@/app/[locale]/specifications/page')

    const metadata = await generateMetadata()
    expect(metadata.title).toBe('specifications')

    render(<RequirementsSpecificationsPage />)
    expect(
      screen.getByText('RequirementsSpecificationsClient mounted'),
    ).toBeInTheDocument()
  })

  it('KravunderlagDetailPage passes the slug to RequirementsSpecificationDetailClient', async () => {
    const { default: KravunderlagDetailPage } = await import(
      '@/app/[locale]/specifications/[slug]/page'
    )

    const element = await KravunderlagDetailPage({
      params: Promise.resolve({ slug: 'ETJANST-UPP-2026' }),
    })

    render(element)
    expect(
      screen.getByText(
        'RequirementsSpecificationDetailClient mounted: ETJANST-UPP-2026',
      ),
    ).toBeInTheDocument()
  })
})
