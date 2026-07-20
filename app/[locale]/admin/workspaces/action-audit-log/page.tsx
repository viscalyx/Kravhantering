import type { ActionAuditLogSearchParams } from '@/lib/audit/action-audit-query'
import AdminWorkspacePage from '../../admin-workspace-page'
import ActionAuditLogPanel from '../../panels/action-audit-log-panel'

type PageParams = Promise<{ locale: string }>
type SearchParams = Promise<ActionAuditLogSearchParams>

export default function AdminActionAuditLogWorkspacePage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: SearchParams
}) {
  return (
    <AdminWorkspacePage
      params={params}
      searchParams={searchParams}
      tab="actionAuditLog"
    >
      <ActionAuditLogPanel />
    </AdminWorkspacePage>
  )
}
