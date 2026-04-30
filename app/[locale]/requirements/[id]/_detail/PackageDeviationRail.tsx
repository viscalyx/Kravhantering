'use client'

import { AlertTriangle, Edit, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import DeviationDecisionModal from '@/components/DeviationDecisionModal'
import DeviationFormModal from '@/components/DeviationFormModal'
import RequirementReportMenu from './RequirementReportMenu'
import type { UseDeviationWorkflowResult } from './use-deviation-workflow'

interface PackageDeviationRailProps {
  detailContext?: string
  locale: string
  packageItemId: number
  packageSlug: string
  requirementId: number | string
  riskLevel: { color: string; name: string | null } | null
  workflow: UseDeviationWorkflowResult
}

export default function PackageDeviationRail({
  detailContext,
  locale,
  packageItemId,
  packageSlug,
  requirementId,
  riskLevel,
  workflow,
}: PackageDeviationRailProps) {
  const td = useTranslations('deviation')

  return (
    <div className="flex flex-col gap-2 shrink-0">
      <RequirementReportMenu
        currentStatusId={0}
        detailContext={detailContext}
        deviationStep={workflow.deviationStep}
        locale={locale}
        packageItemId={packageItemId}
        packageSlug={packageSlug}
        requirementId={requirementId}
        variant="package"
      />
      {workflow.deviationError && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {workflow.deviationError}
        </p>
      )}
      {workflow.deviationStep === null ||
      workflow.deviationStep === 'decided' ? (
        <button
          className="inline-flex items-center gap-1.5 w-full justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 min-h-[44px] min-w-[44px]"
          disabled={workflow.deviationSaving}
          onClick={workflow.openCreateDialog}
          type="button"
        >
          <AlertTriangle aria-hidden="true" className="h-4 w-4" />
          {td('requestDeviation')}
        </button>
      ) : workflow.deviationStep === 'draft' ? (
        <>
          <button
            className="inline-flex items-center gap-1.5 w-full justify-center rounded-xl border border-amber-500 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-50 min-h-[44px] min-w-[44px]"
            disabled={workflow.deviationSaving}
            onClick={workflow.openEditDialog}
            type="button"
          >
            <Edit aria-hidden="true" className="h-4 w-4" />
            {td('editDeviation')}
          </button>
          <button
            className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-950/20 min-h-[44px] min-w-[44px]"
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
          <button
            className="btn-secondary inline-flex items-center gap-1.5 w-full justify-center"
            disabled={workflow.deviationSaving}
            onClick={event => void workflow.handleRevertToDraft(event)}
            type="button"
          >
            {td('revertToDraft')}
          </button>
          <button
            className="btn-primary inline-flex items-center gap-1.5 w-full justify-center"
            disabled={workflow.deviationSaving}
            onClick={workflow.openDecisionDialog}
            type="button"
          >
            {td('markDecided')}
          </button>
        </>
      ) : null}
      <DeviationFormModal
        loading={workflow.deviationSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleCreateDeviation}
        open={workflow.showDeviationForm}
        riskLevel={riskLevel}
      />
      <DeviationFormModal
        initialCreatedBy={workflow.latestDeviation?.createdBy ?? ''}
        initialMotivation={workflow.latestDeviation?.motivation ?? ''}
        loading={workflow.deviationSaving}
        onClose={workflow.closeDialog}
        onSubmit={workflow.handleEditDeviation}
        open={workflow.showEditDeviationForm}
        riskLevel={riskLevel}
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
