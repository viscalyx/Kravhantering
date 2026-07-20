import AdminWorkspacePage from '../../admin-workspace-page'
import ColumnsPanel from '../../panels/columns-panel'

type PageParams = Promise<{ locale: string }>

export default function AdminColumnsWorkspacePage({
  params,
}: {
  params: PageParams
}) {
  return (
    <AdminWorkspacePage params={params} tab="columns">
      <ColumnsPanel />
    </AdminWorkspacePage>
  )
}
