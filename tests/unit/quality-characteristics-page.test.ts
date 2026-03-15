import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock(
  '@/app/[locale]/quality-characteristics/quality-characteristics-client',
  () => ({
    default: () => 'QualityCharacteristicsClient',
  }),
)

describe('quality-characteristics page', () => {
  it('generateMetadata returns title', async () => {
    const { generateMetadata } = await import(
      '@/app/[locale]/quality-characteristics/page'
    )
    const metadata = await generateMetadata()
    expect(metadata.title).toBe('qualityCharacteristics')
  })

  it('default export renders client component', async () => {
    const { default: Page } = await import(
      '@/app/[locale]/quality-characteristics/page'
    )
    const result = Page()
    expect(result).toBeDefined()
  })
})
