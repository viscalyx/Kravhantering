import { describe, it, vi } from 'vitest'
import ActionAuditLogPanel from '@/app/[locale]/admin/panels/action-audit-log-panel'
import {
  expectAdminPanelContract,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tab=actionAuditLog'),
}))

describe('ActionAuditLogPanel', () => {
  it('owns the action log tab panel contract', () => {
    renderAdminPanel(<ActionAuditLogPanel />)
    expectAdminPanelContract({
      markerValue: 'action log',
      tabId: 'actionAuditLog',
    })
  })
})
