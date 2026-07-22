import { describe, expect, it, vi } from 'vitest'
import TaxonomyPanel from '@/app/[locale]/admin/panels/taxonomy-panel'
import {
  expectAdminPanelContract,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}))

describe('TaxonomyPanel', () => {
  it('owns the taxonomy tab panel contract and links', () => {
    const { container } = renderAdminPanel(<TaxonomyPanel />)
    expectAdminPanelContract({ markerValue: 'taxonomy', tabId: 'taxonomy' })
    expect(
      container.querySelectorAll('[data-testid^="taxonomy-card-"]'),
    ).toHaveLength(7)
  })
})
