import AdminWorkspacePage from '../../admin-workspace-page'
import AccessReviewPanel from '../../panels/access-review-panel'

type PageParams = Promise<{ locale: string }>

export default function AdminAccessReviewWorkspacePage({
  params,
}: {
  params: PageParams
}) {
  return (
    <AdminWorkspacePage params={params} tab="accessReview">
      <AccessReviewPanel canManage />
    </AdminWorkspacePage>
  )
}
