import AdminWorkspacePage from '../../admin-workspace-page'
import IdentitySettingsPanel from '../../panels/identity-panel'

type PageParams = Promise<{ locale: string }>

export default function AdminIdentityWorkspacePage({
  params,
}: {
  params: PageParams
}) {
  return (
    <AdminWorkspacePage params={params} tab="identity">
      <IdentitySettingsPanel />
    </AdminWorkspacePage>
  )
}
