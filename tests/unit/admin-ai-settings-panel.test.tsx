import { beforeEach, describe, it, vi } from 'vitest'
import AiSettingsPanel from '@/app/[locale]/admin/panels/ai-settings-panel'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('AiSettingsPanel', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(pendingFetch)))

  it('owns the AI tab panel contract', () => {
    renderAdminPanel(<AiSettingsPanel />, { confirmModal: true })
    expectAdminPanelContract({ markerValue: 'ai', tabId: 'ai' })
  })
})
