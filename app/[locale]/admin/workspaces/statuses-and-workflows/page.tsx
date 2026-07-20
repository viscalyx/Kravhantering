import AdminWorkspacePage from '../../admin-workspace-page'
import StatusesAndWorkflowsPanel from '../../panels/statuses-and-workflows-panel'

type PageParams = Promise<{ locale: string }>

export default function AdminStatusesAndWorkflowsWorkspacePage({
  params,
}: {
  params: PageParams
}) {
  return (
    <AdminWorkspacePage params={params} tab="statusesAndWorkflows">
      <StatusesAndWorkflowsPanel />
    </AdminWorkspacePage>
  )
}
