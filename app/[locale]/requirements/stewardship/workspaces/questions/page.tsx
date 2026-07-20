import RequirementSelectionQuestionsClient from '../../requirement-selection-questions-client'
import StewardshipWorkspacePage from '../../stewardship-workspace-page'

export default function RequirementSelectionQuestionsWorkspacePage() {
  return (
    <StewardshipWorkspacePage
      labelKey="requirementSelectionQuestions"
      workspaceId="questions"
    >
      <RequirementSelectionQuestionsClient />
    </StewardshipWorkspacePage>
  )
}
