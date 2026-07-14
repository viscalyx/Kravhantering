import { describe, expect, it, vi } from 'vitest'
import StatusesAndWorkflowsPanel from '@/app/[locale]/admin/panels/statuses-and-workflows-panel'
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

describe('StatusesAndWorkflowsPanel', () => {
  it('owns the statuses and workflows tab panel contract and links', () => {
    const { container } = renderAdminPanel(<StatusesAndWorkflowsPanel />)
    expectAdminPanelContract({
      markerValue: 'statuses and workflows',
      tabId: 'statusesAndWorkflows',
    })
    expect(
      container.querySelectorAll('[data-testid^="statuses-workflows-card-"]'),
    ).toHaveLength(3)
  })
})
