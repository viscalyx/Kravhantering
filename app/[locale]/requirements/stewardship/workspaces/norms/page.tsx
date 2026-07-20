import NormReferencesClient from '@/app/[locale]/norm-references/norm-references-client'
import StewardshipWorkspacePage from '../../stewardship-workspace-page'

export default function NormReferencesWorkspacePage() {
  return (
    <StewardshipWorkspacePage labelKey="normLibrary" workspaceId="norms">
      <NormReferencesClient />
    </StewardshipWorkspacePage>
  )
}
