import RequirementPackagesClient from '@/app/[locale]/requirement-packages/requirement-packages-client'
import StewardshipWorkspacePage from '../../stewardship-workspace-page'

export default function RequirementPackagesWorkspacePage() {
  return (
    <StewardshipWorkspacePage
      labelKey="requirementPackages"
      workspaceId="packages"
    >
      <RequirementPackagesClient />
    </StewardshipWorkspacePage>
  )
}
