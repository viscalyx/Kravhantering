import { beforeEach, describe, it, vi } from 'vitest'
import ColumnsPanel from '@/app/[locale]/admin/panels/columns-panel'
import {
  expectAdminPanelContract,
  pendingFetch,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

describe('ColumnsPanel', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(pendingFetch)))

  it('owns the columns tab panel contract', () => {
    renderAdminPanel(<ColumnsPanel />)
    expectAdminPanelContract({ markerValue: 'columns', tabId: 'columns' })
  })
})
