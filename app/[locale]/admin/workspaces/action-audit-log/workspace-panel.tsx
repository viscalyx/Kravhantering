import { getTranslations } from 'next-intl/server'
import ActionAuditLogView, {
  type ActionAuditLogInitialState,
  actionAuditLogLabels,
} from '@/components/admin/ActionAuditLogView'
import ActionAuditLogPanel from '../../panels/action-audit-log-panel'

export default async function ActionAuditLogWorkspacePanel({
  initialState,
  params,
}: {
  initialState?: ActionAuditLogInitialState
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'admin.auditLog' })
  const common = await getTranslations({ locale, namespace: 'common' })
  return (
    <ActionAuditLogPanel>
      <ActionAuditLogView
        basePath={`/${locale}/admin`}
        labels={actionAuditLogLabels(t)}
        loadingLabel={common('loading')}
        locale={locale}
        preservedParams={{ tab: 'actionAuditLog' }}
        query={initialState?.query ?? {}}
        result={initialState?.result}
        showEyebrow={false}
        titleElement="h2"
      />
    </ActionAuditLogPanel>
  )
}
