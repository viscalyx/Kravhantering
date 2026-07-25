import { describe, expect, it } from 'vitest'
import {
  actionAuditLogCsvHref,
  actionAuditLogHref,
} from '@/lib/audit/action-audit-query'

describe('action audit log query links', () => {
  it('keeps pagination in interactive links', () => {
    expect(
      actionAuditLogHref({
        basePath: '/sv/admin/audit-log',
        query: {
          action: 'requirement.create',
          page: '2',
          pageSize: '25',
        },
      }),
    ).toBe('/sv/admin/audit-log?action=requirement.create&page=2&pageSize=25')
  })

  it('includes only filters, locale, and format in CSV links', () => {
    expect(
      actionAuditLogCsvHref(
        {
          action: 'requirement.create',
          client_ip: '203.0.113.10',
          page: '2',
          pageSize: '25',
        },
        'sv',
      ),
    ).toBe(
      '/api/admin/audit-events?action=requirement.create&client_ip=203.0.113.10&locale=sv&format=csv',
    )
  })
})
