'use client'

import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import ActionAuditLogView, {
  type ActionAuditLogInitialState,
  actionAuditLogLabels,
} from '@/components/admin/ActionAuditLogView'
import type { ActionAuditLogSearchParams } from '@/lib/audit/action-audit-query'
import ActionAuditLogPanel from './panels/action-audit-log-panel'

export default function ActionAuditLogClient({
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
    <ActionAuditLogPanel>
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
    </ActionAuditLogPanel>
  )
}
