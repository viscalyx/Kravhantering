import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ActionAuditLogView, {
  type ActionAuditLogLabels,
} from '@/components/admin/ActionAuditLogView'

vi.mock('@/components/admin/ActionAuditLogExportButton', () => ({
  default: ({ fallbackFilename, href, label }: Record<string, string>) => (
    <a data-filename={fallbackFilename} href={href}>
      {label}
    </a>
  ),
}))

const labels: ActionAuditLogLabels = {
  action: 'Action',
  actor: 'Actor',
  actorHsaId: 'Actor HSA-id',
  allDecisions: 'All decisions',
  allowed: 'Allowed',
  clear: 'Clear',
  clientIp: 'Client IP',
  decision: 'Decision',
  denied: 'Denied',
  description: 'Accountability events',
  empty: 'No events',
  exportCsv: 'Export CSV',
  eyebrow: 'Accountability',
  filter: 'Filter',
  from: 'From',
  next: 'Next',
  occurredAt: 'Occurred',
  pagination: ({ page, total, totalPages }) =>
    `${page}/${totalPages} (${total})`,
  previous: 'Previous',
  requestId: 'Request ID',
  target: 'Target',
  targetId: 'Target ID',
  targetKind: 'Target kind',
  title: 'Action log',
  to: 'To',
}

function result(
  events: Array<Record<string, unknown>>,
  page: number,
  total: number,
) {
  return {
    events,
    pagination: { page, pageSize: 1, total },
  } as never
}

describe('ActionAuditLogView', () => {
  it('renders loading status with a plain h1 heading', () => {
    render(
      <ActionAuditLogView
        basePath="/en/admin/audit-log"
        labels={labels}
        loadingLabel="Loading events"
        locale="en"
        query={{}}
        showEyebrow={false}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Action log' }),
    ).toBeVisible()
    expect(screen.queryByText('Accountability')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Loading events')
  })

  it('renders empty first-page filters and disabled pagination', () => {
    render(
      <ActionAuditLogView
        basePath="/sv/admin/audit-log"
        labels={labels}
        locale="sv"
        query={{}}
        result={result([], 1, 0)}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Action log' }),
    ).toBeVisible()
    expect(screen.getByText('Accountability')).toBeVisible()
    expect(screen.getByText('No events')).toBeVisible()
    expect(screen.getByText('1/1 (0)')).toBeVisible()
    expect(screen.getByText('Previous')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByText('Next')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
      'data-filename',
      'atgardslogg.csv',
    )
  })

  it('renders populated middle-page fallbacks and enabled pagination links', () => {
    render(
      <ActionAuditLogView
        basePath="/en/admin/audit-log"
        labels={labels}
        locale="en"
        preservedParams={{ tab: 'actionAuditLog' }}
        query={{
          action: 'requirement.create',
          actor_hsa_id: 'SE5560000001-admin1',
          client_ip: '203.0.113.30',
          decision: 'allowed',
          from: '2026-05-01T10:00',
          page: '2',
          pageSize: '1',
          target_id: '42',
          target_kind: 'Requirement',
          to: '2026-05-02T10:00',
        }}
        result={result(
          [
            {
              action: 'requirement.create',
              actorClientId: null,
              actorDisplayName: 'Ada Admin',
              actorHsaId: 'SE5560000001-admin1',
              actorKind: 'user',
              clientIp: '203.0.113.30',
              decision: 'allowed',
              denialReason: null,
              id: '1',
              occurredAt: '2026-05-01T10:00:00.000Z',
              requestId: 'request-1',
              targetId: '42',
              targetKind: 'Requirement',
              targetUniqueId: 'REQ-42',
            },
            {
              action: 'requirement.delete',
              actorClientId: 'service-client',
              actorDisplayName: '',
              actorHsaId: null,
              actorKind: 'service',
              clientIp: null,
              decision: 'denied',
              denialReason: 'Forbidden',
              id: '2',
              occurredAt: '2026-05-01T11:00:00.000Z',
              requestId: null,
              targetId: '43',
              targetKind: 'Requirement',
              targetUniqueId: null,
            },
          ],
          2,
          3,
        )}
        showEyebrow={false}
        titleElement="h2"
      />,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'Action log' }),
    ).toBeVisible()
    expect(screen.queryByText('Accountability')).toBeNull()
    expect(screen.getByText('Ada Admin')).toBeVisible()
    expect(screen.getByText('service')).toBeVisible()
    expect(screen.getByText('service-client')).toBeVisible()
    expect(screen.getByText('REQ-42')).toBeVisible()
    expect(screen.getByText('43')).toBeVisible()
    expect(screen.getByText('Forbidden')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
      'href',
      expect.stringContaining('page=1'),
    )
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      expect.stringContaining('page=3'),
    )
    expect(document.querySelector('input[name="tab"]')).toHaveValue(
      'actionAuditLog',
    )
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute(
      'data-filename',
      'action-log.csv',
    )
  })
})
