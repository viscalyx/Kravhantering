import { describe, expect, it } from 'vitest'
import {
  actionAuditLogCsvHref,
  actionAuditLogFiltersFromSearchParams,
  actionAuditLogHref,
  actionAuditLogPageSize,
  firstSearchParamValue,
  pickActionAuditLogQuery,
} from '@/lib/audit/action-audit-query'

describe('action audit log query links', () => {
  it('normalizes query arrays, bounds, links, and export filters', () => {
    expect(firstSearchParamValue(undefined)).toBeUndefined()
    expect(firstSearchParamValue(['first', 'second'])).toBe('first')
    expect(firstSearchParamValue([])).toBeUndefined()
    expect(actionAuditLogPageSize({ pageSize: '-1' })).toBe(50)
    expect(actionAuditLogPageSize({ pageSize: '9999' })).toBe(9999)
    expect(actionAuditLogPageSize({ pageSize: '25' })).toBe(25)

    const query = pickActionAuditLogQuery({
      action: ['requirement.create', 'ignored'],
      decision: 'invalid',
      from: 'invalid',
      page: '0',
      pageSize: '25',
      to: '2026-08-04T12:00:00.000Z',
      unknown: 'ignored',
    })
    expect(query).not.toHaveProperty('unknown')
    expect(actionAuditLogFiltersFromSearchParams(query)).toMatchObject({
      action: 'requirement.create',
      page: undefined,
      pageSize: 25,
    })
    expect(actionAuditLogHref({ basePath: '/audit', query: {} })).toBe('/audit')
    expect(
      actionAuditLogFiltersFromSearchParams({
        clientIp: 'not-an-ip',
        from: '2026-08-04T12:00',
      }).from,
    ).toEqual(new Date('2026-08-04T12:00:00.000Z'))
    expect(
      actionAuditLogHref({
        basePath: '/audit',
        overrides: { action: null, page: 2 },
        query: { action: 'requirement.create' },
      }),
    ).toBe('/audit?page=2')
    expect(actionAuditLogCsvHref({}, 'en')).toBe(
      '/api/admin/audit-events?locale=en&format=csv',
    )
  })

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
