import { describe, it, vi } from 'vitest'
import PrivacyPanel from '@/app/[locale]/admin/panels/privacy-panel'
import {
  expectAdminPanelContract,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('PrivacyPanel', () => {
  it('owns the privacy tab panel contract', () => {
    renderAdminPanel(<PrivacyPanel />, { confirmModal: true })
    expectAdminPanelContract({ markerValue: 'privacy', tabId: 'privacy' })
  })
})
