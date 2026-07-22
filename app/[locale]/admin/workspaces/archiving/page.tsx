import AdminWorkspacePage from '../../admin-workspace-page'
import ArchivingPanel from '../../panels/archiving-panel'

type PageParams = Promise<{ locale: string }>

export default function AdminArchivingWorkspacePage({
  params,
}: {
  params: PageParams
}) {
  return (
    <AdminWorkspacePage params={params} tab="archiving">
      <ArchivingPanel />
    </AdminWorkspacePage>
  )
}
