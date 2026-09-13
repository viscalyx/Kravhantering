'use client'

import { useTranslations } from 'next-intl'
import { useId } from 'react'
import SuggestionFormModal from '@/components/SuggestionFormModal'
import SuggestionPill from '@/components/SuggestionPill'
import SuggestionResolutionModal from '@/components/SuggestionResolutionModal'
import SuggestionStepper from '@/components/SuggestionStepper'
import { devMarker } from '@/lib/developer-mode-markers'
import type { UseSuggestionWorkflowResult } from './use-suggestion-workflow'

interface ImprovementSuggestionsSectionProps {
  currentActorName?: string | null
  detailContext?: string
  workflow: UseSuggestionWorkflowResult
}

export default function ImprovementSuggestionsSection({
  currentActorName,
  detailContext,
  workflow,
}: ImprovementSuggestionsSectionProps) {
  const tf = useTranslations('improvementSuggestion')
  const headingId = useId()
  const isEmpty =
    !workflow.suggestionError && workflow.versionSuggestionItems.length === 0

  return (
    <>
      <section
        aria-labelledby={headingId}
        className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-xl border shadow-sm px-4 py-3 space-y-3"
        {...devMarker({
          context: detailContext,
          name: 'detail section',
          priority: 350,
          value: 'improvement-suggestions',
        })}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3
              className="text-sm font-semibold text-secondary-900 dark:text-secondary-100"
              id={headingId}
            >
              {tf('title')}
              {workflow.versionSuggestionItems.length > 0 && (
                <span className="ml-2 text-xs font-normal text-secondary-500 dark:text-secondary-400">
                  ({workflow.versionSuggestionItems.length})
                </span>
              )}
            </h3>
            {isEmpty ? (
              <p className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
                {tf('noSuggestions')}
              </p>
            ) : null}
          </div>
          <button
            className="btn-primary text-xs px-3 py-1.5 min-h-8 inline-flex items-center"
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

        {!isEmpty ? (
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
                  {suggestion.resolution === 1 &&
                    !suggestion.implementation &&
                    workflow.canAttachImplementation && (
                      <button
                        className="btn-secondary min-h-11 px-3 py-1 text-xs"
                        type="button"
                        {...devMarker({
                          context: detailContext,
                          name: 'action',
                          value: 'attach-suggestion-implementation',
                          priority: 350,
                        })}
                        disabled={workflow.suggestionSaving}
                        onClick={() =>
                          workflow.openImplementationDialog(suggestion)
                        }
                      >
                        {tf('attachImplementation')}
                      </button>
                    )}
                  {!isResolved && (
                    <div className="flex flex-wrap gap-2">
                      {step === 'draft' && (
                        <>
                          <button
                            className="text-xs btn-secondary px-3 py-1 min-h-11 inline-flex items-center"
                            disabled={workflow.suggestionSaving}
                            onClick={() => workflow.openEditDialog(suggestion)}
                            type="button"
                          >
                            {tf('editSuggestion')}
                          </button>
                          <button
                            className="btn-destructive inline-flex items-center px-3 py-1 text-xs"
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
                            className="text-xs btn-primary px-3 py-1 min-h-11 inline-flex items-center"
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
                            className="text-xs btn-secondary px-3 py-1 min-h-11 inline-flex items-center"
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
                            className="text-xs btn-primary px-3 py-1 min-h-11 inline-flex items-center"
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
        ) : null}
      </section>

      <SuggestionFormModal
        currentActorName={currentActorName}
        loading={workflow.suggestionSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleCreateSuggestion}
        open={workflow.showSuggestionForm}
      />
      <SuggestionFormModal
        currentActorName={currentActorName}
        initialContent={workflow.editSuggestionTarget?.content ?? ''}
        initialCreatedBy={workflow.editSuggestionTarget?.createdBy ?? null}
        loading={workflow.suggestionSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleEditSuggestion}
        open={workflow.showEditSuggestionForm}
        title={tf('editSuggestion')}
      />
      <SuggestionResolutionModal
        currentActorName={currentActorName}
        implementationOnly={workflow.implementationOnly}
        loading={workflow.suggestionSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleRecordResolution}
        open={workflow.showResolutionForm}
        versions={workflow.implementingVersions}
      />
    </>
  )
}
