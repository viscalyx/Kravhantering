import AdminWorkspacePage from '../../admin-workspace-page'
import TaxonomyPanel from '../../panels/taxonomy-panel'

type PageParams = Promise<{ locale: string }>

export default function AdminTaxonomyWorkspacePage({
  params,
}: {
  params: PageParams
}) {
  return (
    <AdminWorkspacePage params={params} tab="taxonomy">
      <TaxonomyPanel />
    </AdminWorkspacePage>
  )
}
