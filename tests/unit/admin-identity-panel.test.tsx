import { beforeEach, describe, it, vi } from 'vitest'
import IdentityPanel from '@/app/[locale]/admin/panels/identity-panel'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('IdentityPanel', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(pendingFetch)))

  it('owns the identity tab panel contract', () => {
    renderAdminPanel(<IdentityPanel />)
    expectAdminPanelContract({ markerValue: 'identity', tabId: 'identity' })
  })
})
