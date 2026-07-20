import RfiQuestionsClient from '../../rfi-questions-client'
import StewardshipWorkspacePage from '../../stewardship-workspace-page'

export default function RfiQuestionsWorkspacePage() {
  return (
    <StewardshipWorkspacePage labelKey="rfiQuestions" workspaceId="rfi">
      <RfiQuestionsClient />
    </StewardshipWorkspacePage>
  )
}
