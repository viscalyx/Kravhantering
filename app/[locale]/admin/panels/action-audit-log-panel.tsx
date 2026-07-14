'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import ActionAuditLogView, {
  type ActionAuditLogInitialState,
  type ActionAuditLogLabels,
} from '@/components/admin/ActionAuditLogView'
import type { ActionAuditLogSearchParams } from '@/lib/audit/action-audit-query'
import { devMarker } from '@/lib/developer-mode-markers'

export default function ActionAuditLogPanel({
  initialState,
}: {
  initialState?: ActionAuditLogInitialState
}) {
  const locale = useLocale()
  const ta = useTranslations('admin')
  const tc = useTranslations('common')
  const searchParams = useSearchParams()
  const query = useMemo<ActionAuditLogSearchParams>(
    () => Object.fromEntries(new URLSearchParams(searchParams).entries()),
    [searchParams],
  )
  const labels: ActionAuditLogLabels = {
    action: ta('auditLog.action'),
    actor: ta('auditLog.actor'),
    actorHsaId: ta('auditLog.actorHsaId'),
    allDecisions: ta('auditLog.allDecisions'),
    allowed: ta('auditLog.allowed'),
    clear: ta('auditLog.clear'),
    clientIp: ta('auditLog.clientIp'),
    decision: ta('auditLog.decision'),
    denied: ta('auditLog.denied'),
    description: ta('auditLog.description'),
    empty: ta('auditLog.empty'),
    exportCsv: ta('auditLog.exportCsv'),
    eyebrow: ta('auditLog.eyebrow'),
    filter: ta('auditLog.filter'),
    from: ta('auditLog.from'),
    next: ta('auditLog.next'),
    occurredAt: ta('auditLog.occurredAt'),
    pagination: values => ta('auditLog.pagination', values),
    previous: ta('auditLog.previous'),
    requestId: ta('auditLog.requestId'),
    target: ta('auditLog.target'),
    targetId: ta('auditLog.targetId'),
    targetKind: ta('auditLog.targetKind'),
    title: ta('auditLog.title'),
    to: ta('auditLog.to'),
  }

  return (
    <section
      aria-labelledby="actionAuditLog-tab"
      className="space-y-6"
      id="actionAuditLog-panel"
      role="tabpanel"
      {...devMarker({
        context: 'admin center',
        name: 'tab panel',
        priority: 340,
        value: 'action log',
      })}
    >
      <ActionAuditLogView
        basePath={`/${locale}/admin`}
        labels={labels}
        loadingLabel={tc('loading')}
        locale={locale}
        preservedParams={{ tab: 'actionAuditLog' }}
        query={initialState?.query ?? query}
        result={initialState?.result}
        showEyebrow={false}
        titleElement="h2"
      />
    </section>
  )
}
