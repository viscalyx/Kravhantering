import { beforeEach, describe, it, vi } from 'vitest'
import ArchivingPanel from '@/app/[locale]/admin/panels/archiving-panel'
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

describe('ArchivingPanel', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(pendingFetch)))

  it('owns the archiving tab panel contract', () => {
    renderAdminPanel(<ArchivingPanel />, { confirmModal: true })
    expectAdminPanelContract({
      markerName: 'admin archiving panel',
      markerValue: 'retention and archive exports',
      tabId: 'archiving',
    })
  })
})
