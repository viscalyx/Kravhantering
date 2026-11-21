import { describe, it } from 'vitest'
import ActionAuditLogPanel from '@/app/[locale]/admin/panels/action-audit-log-panel'
import {
  expectAdminPanelContract,
  renderAdminPanel,
} from './helpers/admin-panel-contract'

describe('ActionAuditLogPanel', () => {
  it('owns the action log tab panel contract', () => {
    renderAdminPanel(<ActionAuditLogPanel />)
    expectAdminPanelContract({
      markerValue: 'action log',
      tabId: 'actionAuditLog',
    })
  })
})
