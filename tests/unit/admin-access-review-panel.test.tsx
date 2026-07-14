import { beforeEach, describe, it, vi } from 'vitest'
import AccessReviewPanel from '@/app/[locale]/admin/panels/access-review-panel'
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

describe('AccessReviewPanel', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(pendingFetch)))

  it('owns the access review tab panel contract', () => {
    renderAdminPanel(<AccessReviewPanel canManage />, { confirmModal: true })
    expectAdminPanelContract({
      markerValue: 'access review',
      tabId: 'accessReview',
    })
  })
})
