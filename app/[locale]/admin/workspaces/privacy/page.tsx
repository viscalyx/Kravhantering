import AdminWorkspacePage from '../../admin-workspace-page'
import PrivacyErasurePanel from '../../panels/privacy-panel'

type PageParams = Promise<{ locale: string }>

export default function AdminPrivacyWorkspacePage({
  params,
}: {
  params: PageParams
}) {
  return (
    <AdminWorkspacePage params={params} tab="privacy">
      <PrivacyErasurePanel />
    </AdminWorkspacePage>
  )
}
