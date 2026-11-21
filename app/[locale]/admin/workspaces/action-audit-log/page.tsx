import type { ActionAuditLogSearchParams } from '@/lib/audit/action-audit-query'
import AdminWorkspacePage from '../../admin-workspace-page'
import ActionAuditLogWorkspacePanel from './workspace-panel'

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
      <ActionAuditLogWorkspacePanel params={params} />
    </AdminWorkspacePage>
  )
}
