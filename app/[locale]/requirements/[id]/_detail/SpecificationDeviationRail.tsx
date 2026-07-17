'use client'

import { AlertTriangle, Edit, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import { devMarker } from '@/lib/developer-mode-markers'
import RequirementReportMenu from './RequirementReportMenu'
import type { UseDeviationWorkflowResult } from './use-deviation-workflow'

interface SpecificationDeviationRailProps {
  canManageDeviationDrafts: boolean
  canReviewDeviationDecisions: boolean
  detailContext?: string
  locale: string
  onRemoveFromSpecification?: (anchorEl: HTMLElement) => void | Promise<void>
  priorityLevel: { color: string; name: string | null } | null
  removeFromSpecificationDisabled?: boolean
  requirementId: number | string
  specificationId: number
  specificationItemId: number
  workflow: UseDeviationWorkflowResult
}

export default function SpecificationDeviationRail({
  canManageDeviationDrafts,
  canReviewDeviationDecisions,
  detailContext,
  locale,
  onRemoveFromSpecification,
  removeFromSpecificationDisabled,
  specificationItemId,
  specificationId,
  requirementId,
  priorityLevel,
  workflow,
}: SpecificationDeviationRailProps) {
  const td = useTranslations('deviation')
  const ts = useTranslations('specification')

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <RequirementReportMenu
        currentStatusId={0}
        detailContext={detailContext}
        deviationStep={workflow.deviationStep}
        locale={locale}
        requirementId={requirementId}
        specificationId={specificationId}
        specificationItemId={specificationItemId}
        variant="specification"
      />
      {workflow.deviationError && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {workflow.deviationError}
        </p>
      )}
      {(workflow.deviationStep === null ||
        workflow.deviationStep === 'decided') &&
      canManageDeviationDrafts ? (
        <button
          className="inline-flex items-center gap-1.5 w-full justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 min-h-11 min-w-11"
          disabled={workflow.deviationSaving}
          onClick={workflow.openCreateDialog}
          type="button"
        >
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          {td('requestDeviation')}
        </button>
      ) : workflow.deviationStep === 'draft' && canManageDeviationDrafts ? (
        <>
          <button
            className="inline-flex items-center gap-1.5 w-full justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 min-h-11 min-w-11"
            disabled={workflow.deviationSaving}
            onClick={workflow.openEditDialog}
            type="button"
          >
            <Edit aria-hidden="true" className="h-4 w-4" />
            {td('editDeviation')}
          </button>
          <button
            className="btn-destructive inline-flex items-center gap-1.5 w-full justify-center"
            disabled={workflow.deviationSaving}
            onClick={event => void workflow.handleDeleteDeviation(event)}
            type="button"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {td('deleteDeviation')}
          </button>
          <button
            className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
            disabled={workflow.deviationSaving}
            onClick={() => void workflow.handleRequestReview()}
            type="button"
          >
            {td('requestReview')}
          </button>
        </>
      ) : workflow.deviationStep === 'review_requested' ? (
        <>
          {canManageDeviationDrafts ? (
            <button
              className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
              disabled={workflow.deviationSaving}
              onClick={event => void workflow.handleRevertToDraft(event)}
              type="button"
            >
              {td('revertToDraft')}
            </button>
          ) : null}
          {canReviewDeviationDecisions ? (
            <button
              className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
              disabled={workflow.deviationSaving}
              onClick={workflow.openDecisionDialog}
              type="button"
            >
              {td('markDecided')}
            </button>
          ) : null}
        </>
      ) : null}
      {onRemoveFromSpecification ? (
        <button
          className="btn-destructive inline-flex items-center gap-1.5 w-full justify-center"
          disabled={removeFromSpecificationDisabled || workflow.deviationSaving}
          {...devMarker({
            context: `${detailContext ?? 'requirement detail'} > specification actions`,
            name: 'detail action',
            priority: 291,
            value: 'unlink library requirement',
          })}
          onClick={event => void onRemoveFromSpecification(event.currentTarget)}
          type="button"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {ts('unlinkLibraryRequirementAction')}
        </button>
      ) : null}
      <DeviationFormModal
        loading={workflow.deviationSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleCreateDeviation}
        open={workflow.showDeviationForm}
        priorityLevel={priorityLevel}
      />
      <DeviationFormModal
        initialMotivation={workflow.latestDeviation?.motivation ?? ''}
        loading={workflow.deviationSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleEditDeviation}
        open={workflow.showEditDeviationForm}
        priorityLevel={priorityLevel}
        title={td('editDeviation')}
      />
      <DeviationDecisionModal
        loading={workflow.deviationSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleRecordDecision}
        open={workflow.showDecisionForm}
      />
    </div>
  )
}
