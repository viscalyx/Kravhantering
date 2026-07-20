import AdminWorkspacePage from '../../admin-workspace-page'
import SettingsPanel from '../../panels/settings-panel'

type PageParams = Promise<{ locale: string }>

export default function AdminSettingsWorkspacePage({
  params,
}: {
  params: PageParams
}) {
  return (
    <AdminWorkspacePage params={params} tab="settings">
      <SettingsPanel />
    </AdminWorkspacePage>
  )
}
