'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import ActionAuditLogView, {
  type ActionAuditLogInitialState,
  actionAuditLogLabels,
} from '@/components/admin/ActionAuditLogView'
import type { ActionAuditLogSearchParams } from '@/lib/audit/action-audit-query'
import { devMarker } from '@/lib/developer-mode-markers'

export default function ActionAuditLogPanel({
  initialState,
}: {
  initialState?: ActionAuditLogInitialState
}) {
  const locale = useLocale()
  const ta = useTranslations('admin.auditLog')
  const tc = useTranslations('common')
  const searchParams = useSearchParams()
  const query = useMemo<ActionAuditLogSearchParams>(
    () => Object.fromEntries(new URLSearchParams(searchParams).entries()),
    [searchParams],
  )
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
        labels={actionAuditLogLabels(ta)}
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
