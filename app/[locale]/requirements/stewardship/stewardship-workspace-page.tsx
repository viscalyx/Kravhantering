import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import StewardshipLazyWorkspace, {
  type StewardshipWorkspaceId,
} from './stewardship-lazy-workspace'

interface StewardshipWorkspacePageProps {
  children: ReactNode
  labelKey:
    | 'normLibrary'
    | 'requirementPackages'
    | 'requirementSelectionQuestions'
    | 'rfiQuestions'
  workspaceId: StewardshipWorkspaceId
}

export default async function StewardshipWorkspacePage({
  children,
  labelKey,
  workspaceId,
}: StewardshipWorkspacePageProps) {
  const tNav = await getTranslations('nav')

  return (
    <StewardshipLazyWorkspace
      workspaceId={workspaceId}
      workspaceLabel={tNav(labelKey)}
    >
      {children}
    </StewardshipLazyWorkspace>
  )
}
