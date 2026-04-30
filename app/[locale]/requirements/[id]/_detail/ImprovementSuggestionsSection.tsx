'use client'

import { useTranslations } from 'next-intl'
import SuggestionFormModal from '@/components/SuggestionFormModal'
import SuggestionPill from '@/components/SuggestionPill'
import SuggestionResolutionModal from '@/components/SuggestionResolutionModal'
import SuggestionStepper from '@/components/SuggestionStepper'
import { devMarker } from '@/lib/developer-mode-markers'
import type { UseSuggestionWorkflowResult } from './use-suggestion-workflow'

interface ImprovementSuggestionsSectionProps {
  detailContext?: string
  workflow: UseSuggestionWorkflowResult
}

export default function ImprovementSuggestionsSection({
  detailContext,
  workflow,
}: ImprovementSuggestionsSectionProps) {
  const tf = useTranslations('improvementSuggestion')

  return (
    <>
      <section
        aria-labelledby="improvementSuggestionsHeading"
        className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-6 space-y-4"
        {...devMarker({
          context: detailContext,
          name: 'detail section',
          priority: 350,
          value: 'improvement-suggestions',
        })}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
            id="improvementSuggestionsHeading"
          >
            {tf('title')}
            {workflow.versionSuggestionItems.length > 0 && (
              <span className="ml-2 text-xs font-normal text-secondary-500 dark:text-secondary-400">
                ({workflow.versionSuggestionItems.length})
              </span>
            )}
          </h3>
          <button
            className="btn-primary text-xs px-3 py-1.5 min-h-[44px] inline-flex items-center"
            disabled={workflow.suggestionSaving}
            onClick={workflow.openCreateDialog}
            type="button"
          >
            + {tf('newSuggestion')}
          </button>
        </div>

        {workflow.suggestionError && (
          <p
            className="mt-2 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {workflow.suggestionError}
          </p>
        )}

        {!workflow.suggestionError &&
        workflow.versionSuggestionItems.length === 0 ? (
          <p className="text-sm text-secondary-500 dark:text-secondary-400">
            {tf('noSuggestions')}
          </p>
        ) : (
          <div className="space-y-4">
            {workflow.versionSuggestionItems.map(suggestion => {
              const step = workflow.getSuggestionStep(suggestion)
              const isResolved = suggestion.resolution !== null
              return (
                <div className="space-y-2" key={suggestion.id}>
                  <SuggestionStepper
                    currentStep={step}
                    developerModeContext={detailContext}
                  />
                  <SuggestionPill
                    developerModeContext={detailContext}
                    step={step}
                    suggestion={suggestion}
                  />
                  {!isResolved && (
                    <div className="flex flex-wrap gap-2">
                      {step === 'draft' && (
                        <>
                          <button
                            className="text-xs btn-secondary px-3 py-1 min-h-[44px] inline-flex items-center"
                            disabled={workflow.suggestionSaving}
                            onClick={() => workflow.openEditDialog(suggestion)}
                            type="button"
                          >
                            {tf('editSuggestion')}
                          </button>
                          <button
                            className="text-xs btn-secondary px-3 py-1 min-h-[44px] inline-flex items-center text-red-600 dark:text-red-400"
                            disabled={workflow.suggestionSaving}
                            onClick={event =>
                              void workflow.handleDeleteSuggestion(
                                suggestion.id,
                                event,
                              )
                            }
                            type="button"
                          >
                            {tf('deleteSuggestion')}
                          </button>
                          <button
                            className="text-xs btn-primary px-3 py-1 min-h-[44px] inline-flex items-center"
                            disabled={workflow.suggestionSaving}
                            onClick={() =>
                              void workflow.handleSuggestionRequestReview(
                                suggestion.id,
                              )
                            }
                            type="button"
                          >
                            {tf('requestReview')}
                          </button>
                        </>
                      )}
                      {step === 'review_requested' && (
                        <>
                          <button
                            className="text-xs btn-secondary px-3 py-1 min-h-[44px] inline-flex items-center"
                            disabled={workflow.suggestionSaving}
                            onClick={event =>
                              void workflow.handleSuggestionRevertToDraft(
                                suggestion.id,
                                event,
                              )
                            }
                            type="button"
                          >
                            {tf('revertToDraft')}
                          </button>
                          <button
                            className="text-xs btn-primary px-3 py-1 min-h-[44px] inline-flex items-center"
                            disabled={workflow.suggestionSaving}
                            onClick={() =>
                              workflow.openResolutionDialog(suggestion)
                            }
                            type="button"
                          >
                            {tf('markResolved')}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <SuggestionFormModal
        loading={workflow.suggestionSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleCreateSuggestion}
        open={workflow.showSuggestionForm}
      />
      <SuggestionFormModal
        initialContent={workflow.editSuggestionTarget?.content ?? ''}
        initialCreatedBy={workflow.editSuggestionTarget?.createdBy ?? ''}
        loading={workflow.suggestionSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleEditSuggestion}
        open={workflow.showEditSuggestionForm}
        title={tf('editSuggestion')}
      />
      <SuggestionResolutionModal
        loading={workflow.suggestionSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleRecordResolution}
        open={workflow.showResolutionForm}
      />
    </>
  )
}
