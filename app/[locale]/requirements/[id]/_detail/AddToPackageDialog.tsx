'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { HelpCircle, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import type { UseAddToPackageDialogResult } from './use-add-to-package-dialog'

interface AddToPackageDialogProps {
  dialog: UseAddToPackageDialogResult
  onDocumentKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}

export default function AddToPackageDialog({
  dialog,
  onDocumentKeyDown,
}: AddToPackageDialogProps) {
  const tc = useTranslations('common')
  const tp = useTranslations('package')
  const { state } = dialog
  const titleId = 'add-to-package-dialog-title'

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={state.openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
      onClick={() => dialog.toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel id={`help-${field}`} isOpen={state.openHelp.has(field)}>
      {tp(helpKey)}
    </AnimatedHelpPanel>
  )

  if (typeof window === 'undefined') {
    return null
  }

  return createPortal(
    <AnimatePresence>
      {state.isOpen ? (
        <motion.div
          animate={{ opacity: 1 }}
          aria-labelledby={titleId}
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={dialog.closeDialog}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              dialog.closeDialog()
            }
          }}
          role="dialog"
          transition={{ duration: 0.16 }}
        >
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[calc(100vh-2rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-secondary-900"
            exit={{ opacity: 0, scale: 0.96 }}
            initial={{ opacity: 0, scale: 0.96 }}
            onClick={event => event.stopPropagation()}
            onKeyDown={onDocumentKeyDown}
            role="document"
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <div className="flex items-center justify-between">
              <h2
                className="text-lg font-semibold text-secondary-900 dark:text-secondary-100"
                id={titleId}
              >
                {tp('addToPackage')}
              </h2>
              <button
                aria-label={tc('close')}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-secondary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:bg-secondary-800"
                onClick={dialog.closeDialog}
                type="button"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            {state.addToPackageStatus === 'success' ? (
              <p className="py-2 text-sm text-green-600 dark:text-green-400">
                {tp('addToPackageSuccess')}
              </p>
            ) : state.packagesLoading ? (
              <p className="py-2 text-sm text-secondary-500 dark:text-secondary-400">
                {tp('loadingPackages')}
              </p>
            ) : state.packagesError ? (
              <p
                className="py-2 text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {state.packagesError}
              </p>
            ) : state.packages.length === 0 ? (
              <p className="py-2 text-sm text-secondary-500 dark:text-secondary-400">
                {tp('noPackagesAvailable')}
              </p>
            ) : (
              <form className="space-y-4" onSubmit={dialog.handleSubmit}>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <label
                      className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                      htmlFor="atp-package"
                    >
                      {tp('selectPackage')} <span aria-hidden="true">*</span>
                    </label>
                    {helpButton('atp-package', tp('selectPackage'))}
                  </div>
                  {helpPanel('selectPackageHelp', 'atp-package')}
                  <select
                    className="min-h-[44px] w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm text-secondary-900 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100"
                    id="atp-package"
                    onChange={event =>
                      void dialog.handlePackageSelect(event.target.value)
                    }
                    value={state.packageId}
                  >
                    <option value="">—</option>
                    {state.packages.map(pkg => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-1.5">
                    <label
                      className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                      htmlFor="atp-needs-ref"
                    >
                      {tp('needsReferenceLabel')}
                    </label>
                    {helpButton('atp-needs-ref', tp('needsReferenceLabel'))}
                  </div>
                  {helpPanel('needsReferenceHelp', 'atp-needs-ref')}
                  <select
                    className="min-h-[44px] w-full rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm text-secondary-900 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100"
                    id="atp-needs-ref"
                    onChange={event => {
                      const value = event.target.value
                      if (value === 'none') {
                        dialog.setNeedsReferenceMode('none')
                      } else if (value === 'new') {
                        dialog.setNeedsReferenceMode('new')
                      } else {
                        dialog.setNeedsReferenceMode('existing', Number(value))
                      }
                    }}
                    value={
                      state.needsReferenceMode === 'existing'
                        ? String(state.needsReferenceId)
                        : state.needsReferenceMode
                    }
                  >
                    <option value="none">{tp('noNeedsRef')}</option>
                    <option value="new">{tp('newNeedsRef')}</option>
                    {state.availableNeedsRefs.map(reference => (
                      <option key={reference.id} value={String(reference.id)}>
                        {reference.text}
                      </option>
                    ))}
                  </select>
                  {state.needsReferencesLoading ? (
                    <p className="mt-2 text-sm text-secondary-500 dark:text-secondary-400">
                      {tp('loadingNeedsReferences')}
                    </p>
                  ) : state.needsReferencesError ? (
                    <p
                      className="mt-2 text-sm text-red-600 dark:text-red-400"
                      role="alert"
                    >
                      {state.needsReferencesError}
                    </p>
                  ) : null}
                  {state.needsReferenceMode === 'new' && (
                    <>
                      <div className="mt-2 mb-1 flex items-center gap-1.5">
                        <label
                          className="block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                          htmlFor="atp-needs-ref-text"
                        >
                          {tp('addNeedsRefTextLabel')}
                        </label>
                        {helpButton(
                          'atp-needs-ref-text',
                          tp('addNeedsRefTextLabel'),
                        )}
                      </div>
                      {helpPanel('addNeedsRefTextHelp', 'atp-needs-ref-text')}
                      <textarea
                        className="w-full resize-none rounded-xl border border-secondary-200 bg-white px-3.5 py-2.5 text-sm text-secondary-900 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100"
                        id="atp-needs-ref-text"
                        onChange={event =>
                          dialog.setNeedsReferenceText(event.target.value)
                        }
                        rows={2}
                        value={state.needsReferenceText}
                      />
                    </>
                  )}
                </div>
                {state.addToPackageError && (
                  <p
                    className="text-sm text-red-600 dark:text-red-400"
                    role="alert"
                  >
                    {state.addToPackageError}
                  </p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    className="btn-primary"
                    disabled={
                      !state.packageId || state.addToPackageStatus === 'loading'
                    }
                    type="submit"
                  >
                    {state.addToPackageStatus === 'loading'
                      ? tc('loading')
                      : tp('addToPackage')}
                  </button>
                  <button
                    className="min-h-11 rounded-xl border px-4 py-2.5 text-sm transition-all focus-visible:ring-2 focus-visible:ring-primary-400/50 dark:hover:border-secondary-600 dark:hover:bg-secondary-800 dark:hover:text-secondary-100"
                    onClick={dialog.closeDialog}
                    type="button"
                  >
                    {tc('cancel')}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
