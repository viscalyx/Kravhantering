'use client'

import { useTranslations } from 'next-intl'
import { lazy } from 'react'
import OnDemandFeatureDialog from '@/components/OnDemandFeatureDialog'
import type {
  InitialRequirementsImport,
  RequirementsImportDialogProps,
} from '@/components/RequirementsImportDialog'
import { restoreFocus } from '@/lib/restore-focus'

const RequirementsImportDialog = lazy(
  () => import('@/components/RequirementsImportDialog'),
)

export type { InitialRequirementsImport }

interface LazyRequirementsImportDialogProps
  extends Omit<RequirementsImportDialogProps, 'embedded' | 'onClose'> {
  onClose: (importSucceeded: boolean) => void
  returnFocusTarget?: HTMLElement | null
}

export default function LazyRequirementsImportDialog({
  destinationName,
  initialImport,
  mode,
  onClose,
  open,
  returnFocusTarget,
  ...props
}: LazyRequirementsImportDialogProps) {
  const tc = useTranslations('common')
  const tl = useTranslations('onDemandFeature')

  if (!open) return null

  const closeAndRestoreFocus = (importSucceeded: boolean) => {
    onClose(importSucceeded)
    restoreFocus(returnFocusTarget)
  }
  const titleBase = tl(
    mode === 'library'
      ? 'importReview.titleLibrary'
      : 'importReview.titleSpecification',
  )
  const title = destinationName?.trim()
    ? tl('importReview.titleWithDestination', {
        destination: destinationName.trim(),
        title: titleBase,
      })
    : titleBase

  return (
    <OnDemandFeatureDialog
      closeLabel={tc('close')}
      errorDescription={tl('importReview.loadErrorDescription')}
      errorTitle={tl('importReview.loadErrorTitle')}
      featureId="import-review"
      loadingLabel={tl('importReview.loading')}
      onErrorClose={() => closeAndRestoreFocus(false)}
      reloadLabel={tl('reloadPage')}
      title={title}
      variant="import"
      wide={Boolean(initialImport)}
    >
      <RequirementsImportDialog
        {...props}
        destinationName={destinationName}
        embedded
        initialImport={initialImport}
        mode={mode}
        onClose={closeAndRestoreFocus}
        open
      />
    </OnDemandFeatureDialog>
  )
}
