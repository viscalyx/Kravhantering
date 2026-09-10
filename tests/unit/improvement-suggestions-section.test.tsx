import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ImprovementSuggestionsSection from '@/app/[locale]/requirements/[id]/_detail/ImprovementSuggestionsSection'
import type { SuggestionData } from '@/app/[locale]/requirements/[id]/_detail/types'
import type { UseSuggestionWorkflowResult } from '@/app/[locale]/requirements/[id]/_detail/use-suggestion-workflow'

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/hooks/useDiscardChangesConfirmation', () => ({
  useDiscardChangesConfirmation: () => vi.fn(async () => true),
}))

const draftSuggestion: SuggestionData = {
  content: 'Clarify the acceptance criteria',
  createdAt: '2026-08-01T10:00:00Z',
  createdBy: 'Alice',
  id: 11,
  isReviewRequested: 0,
  requirementVersionId: 101,
  resolution: null,
  resolutionMotivation: null,
  resolvedAt: null,
  resolvedBy: null,
}

function makeWorkflow(
  overrides: Partial<UseSuggestionWorkflowResult> = {},
): UseSuggestionWorkflowResult {
  return {
    implementationOnly: false,
    implementingVersions: [],
    canAttachImplementation: false,
    openImplementationDialog: vi.fn(),
    closeDialog: vi.fn(),
    editSuggestionTarget: null,
    getSuggestionStep: suggestion => {
      if (suggestion.resolution !== null) return 'resolved'
      return suggestion.isReviewRequested === 1 ? 'review_requested' : 'draft'
    },
    handleCreateSuggestion: vi.fn(async () => {}),
    handleDeleteSuggestion: vi.fn(async () => {}),
    handleEditSuggestion: vi.fn(async () => {}),
    handleRecordResolution: vi.fn(async () => {}),
    handleSuggestionRequestReview: vi.fn(async () => {}),
    handleSuggestionRevertToDraft: vi.fn(async () => {}),
    openCreateDialog: vi.fn(),
    openEditDialog: vi.fn(),
    openResolutionDialog: vi.fn(),
    resolutionTarget: null,
    showEditSuggestionForm: false,
    showResolutionForm: false,
    showSuggestionForm: false,
    suggestionError: null,
    suggestionSaving: false,
    versionSuggestionItems: [],
    ...overrides,
  }
}

describe('ImprovementSuggestionsSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows an authorized implementing-version link with its immutable row identity', () => {
    render(
      <ImprovementSuggestionsSection
        workflow={makeWorkflow({
          versionSuggestionItems: [
            {
              ...draftSuggestion,
              resolution: 1,
              implementation: {
                recordedAt: '2026-09-10T10:00:00Z',
                version: {
                  id: 103,
                  requirementId: 10,
                  versionNumber: 3,
                  statusId: 3,
                  statusNameEn: 'Published',
                  statusNameSv: 'Publicerad',
                },
              },
            },
          ],
        })}
      />,
    )
    expect(
      screen.getByRole('link', { name: 'implementationVersionLabel' }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining('/requirements/10/3?versionId=103'),
    )
    expect(screen.getByText(/Published/)).toBeInTheDocument()
  })

  it('offers explicit evidence attachment while keeping unavailable evidence without a link', async () => {
    const workflow = makeWorkflow({
      canAttachImplementation: true,
      versionSuggestionItems: [
        { ...draftSuggestion, resolution: 1 },
        {
          ...draftSuggestion,
          id: 12,
          resolution: 1,
          implementation: { recordedAt: '2026-09-10T10:00:00Z', version: null },
        },
      ],
    })
    render(<ImprovementSuggestionsSection workflow={workflow} />)
    expect(screen.getByText(/implementationUnavailable/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'attachImplementation' }),
    )
    expect(workflow.openImplementationDialog).toHaveBeenCalledWith(
      expect.objectContaining({ id: draftSuggestion.id }),
    )
  })

  it('shows its empty state and opens the create dialog', async () => {
    const workflow = makeWorkflow()
    const user = userEvent.setup()
    render(
      <ImprovementSuggestionsSection
        detailContext="requirement-detail"
        workflow={workflow}
      />,
    )

    const section = screen.getByRole('region', { name: 'title' })
    expect(within(section).getByText('noSuggestions')).toBeInTheDocument()
    expect(section).toHaveAttribute(
      'data-developer-mode-context',
      'requirement-detail',
    )

    await user.click(
      within(section).getByRole('button', { name: '+ newSuggestion' }),
    )
    expect(workflow.openCreateDialog).toHaveBeenCalledOnce()
  })

  it('announces an error instead of the empty state', () => {
    render(
      <ImprovementSuggestionsSection
        workflow={makeWorkflow({ suggestionError: 'Unable to load' })}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load')
    expect(screen.queryByText('noSuggestions')).not.toBeInTheDocument()
  })

  it('offers the draft actions and sends the selected suggestion identifiers', async () => {
    const workflow = makeWorkflow({
      versionSuggestionItems: [draftSuggestion],
    })
    const user = userEvent.setup()
    render(<ImprovementSuggestionsSection workflow={workflow} />)

    const section = screen.getByRole('region', { name: /title/ })
    expect(within(section).getByText('(1)')).toBeInTheDocument()
    expect(
      within(section).getByText('Clarify the acceptance criteria'),
    ).toBeInTheDocument()

    await user.click(
      within(section).getByRole('button', { name: 'editSuggestion' }),
    )
    expect(workflow.openEditDialog).toHaveBeenCalledWith(draftSuggestion)

    await user.click(
      within(section).getByRole('button', { name: 'deleteSuggestion' }),
    )
    await waitFor(() =>
      expect(workflow.handleDeleteSuggestion).toHaveBeenCalledWith(
        draftSuggestion.id,
        expect.any(Object),
      ),
    )

    await user.click(
      within(section).getByRole('button', { name: 'requestReview' }),
    )
    expect(workflow.handleSuggestionRequestReview).toHaveBeenCalledWith(
      draftSuggestion.id,
    )
  })

  it('offers review actions and hides actions after resolution', async () => {
    const reviewSuggestion: SuggestionData = {
      ...draftSuggestion,
      id: 12,
      isReviewRequested: 1,
    }
    const resolvedSuggestion: SuggestionData = {
      ...draftSuggestion,
      id: 13,
      resolution: 1,
      resolutionMotivation: 'Updated',
      resolvedAt: '2026-08-02T10:00:00Z',
      resolvedBy: 'Reviewer',
    }
    const workflow = makeWorkflow({
      versionSuggestionItems: [reviewSuggestion, resolvedSuggestion],
    })
    const user = userEvent.setup()
    render(<ImprovementSuggestionsSection workflow={workflow} />)

    const section = screen.getByRole('region', { name: /title/ })
    expect(within(section).getByText('(2)')).toBeInTheDocument()
    expect(within(section).getAllByRole('button')).toHaveLength(3)

    await user.click(
      within(section).getByRole('button', { name: 'revertToDraft' }),
    )
    await waitFor(() =>
      expect(workflow.handleSuggestionRevertToDraft).toHaveBeenCalledWith(
        reviewSuggestion.id,
        expect.any(Object),
      ),
    )

    await user.click(
      within(section).getByRole('button', { name: 'markResolved' }),
    )
    expect(workflow.openResolutionDialog).toHaveBeenCalledWith(reviewSuggestion)
  })

  it('disables actions while saving and wires the edit and resolution dialogs', () => {
    const workflow = makeWorkflow({
      editSuggestionTarget: draftSuggestion,
      resolutionTarget: draftSuggestion,
      showEditSuggestionForm: true,
      showResolutionForm: true,
      suggestionSaving: true,
      versionSuggestionItems: [draftSuggestion],
    })
    render(<ImprovementSuggestionsSection workflow={workflow} />)

    const section = screen.getByRole('region', { name: /title/ })
    for (const button of within(section).getAllByRole('button')) {
      expect(button).toBeDisabled()
    }

    const editDialog = screen.getByRole('dialog', { name: 'editSuggestion' })
    expect(
      within(editDialog).getByLabelText(/content/, { selector: 'textarea' }),
    ).toHaveValue(draftSuggestion.content)
    expect(
      within(editDialog).getByRole('status', { name: 'createdBy' }),
    ).toHaveTextContent('Alice')
    expect(
      screen.getByRole('dialog', { name: 'recordResolution' }),
    ).toBeInTheDocument()
  })
})
