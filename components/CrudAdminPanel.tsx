'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import FormModal from '@/components/FormModal'
import type { CrudAdminResourceController } from '@/hooks/useCrudAdminResource'
import { devMarker } from '@/lib/developer-mode-markers'
import { offsetPanelMotion } from '@/lib/reduced-motion'

type CrudId = number | string
type CrudAdminFormMode = 'create' | 'edit'
type CrudAdminFormPresentation = 'inline' | 'modal'

export interface CrudAdminColumn<TItem> {
  className?: string
  header: ReactNode
  key: string
  render: (item: TItem) => ReactNode
}

interface CrudAdminPanelProps<TItem extends { id: CrudId }, TForm> {
  canCreate?: boolean
  canDelete?: (item: TItem) => boolean
  children?: ReactNode
  columns: CrudAdminColumn<TItem>[]
  controller: CrudAdminResourceController<TItem, TForm>
  devContext: string
  emptyStateMessage?: ReactNode
  formCloseDisabled?: boolean
  formDialogDeveloperModeValue?: (mode: CrudAdminFormMode) => string
  formMaxWidthClassName?: string
  formPresentation?: CrudAdminFormPresentation
  formTitle?: (mode: CrudAdminFormMode) => string
  formTitleId?: string
  renderFormFields: (props: {
    disabled: boolean
    editId: CrudId | null
    form: TForm
    inputClassName: string
    isEditing: boolean
    setForm: React.Dispatch<React.SetStateAction<TForm>>
  }) => ReactNode
  title: ReactNode
}

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

const rowActionButtonClassName =
  'inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

export default function CrudAdminPanel<TItem extends { id: CrudId }, TForm>({
  canDelete = () => true,
  canCreate = true,
  children,
  columns,
  controller,
  devContext,
  emptyStateMessage,
  formCloseDisabled = false,
  formDialogDeveloperModeValue,
  formMaxWidthClassName = 'max-w-lg',
  formPresentation = 'inline',
  formTitle,
  formTitleId,
  renderFormFields,
  title,
}: CrudAdminPanelProps<TItem, TForm>) {
  const common = useTranslations('common')
  const shouldReduceMotion = useReducedMotion()
  const visibleError = controller.deleteError ?? controller.loadError
  const formMode: CrudAdminFormMode =
    controller.editId === null ? 'create' : 'edit'
  const defaultFormTitle =
    formMode === 'create' ? common('create') : common('edit')
  const resolvedFormTitle = formTitle?.(formMode) ?? defaultFormTitle
  const resolvedFormTitleId =
    formTitleId ??
    `${devContext.replace(/[^A-Za-z0-9_-]+/g, '-')}-crud-form-title`
  const closeDisabled = controller.submitting || formCloseDisabled

  const renderCrudFormBody = (showHeading: boolean) => (
    <>
      {showHeading ? (
        <h2 className="text-lg font-semibold">{resolvedFormTitle}</h2>
      ) : null}
      {renderFormFields({
        disabled: controller.submitting,
        editId: controller.editId,
        form: controller.form,
        inputClassName,
        isEditing: controller.editId !== null,
        setForm: controller.setForm,
      })}
      {controller.formError && (
        <p
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
          role="alert"
        >
          {controller.formError}
        </p>
      )}
      <div className="flex gap-3">
        <button
          className="btn-primary"
          disabled={controller.submitting}
          type="submit"
        >
          {controller.submitting ? common('saving') : common('save')}
        </button>
        <button
          className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 text-secondary-700 dark:text-secondary-300 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200 disabled:opacity-60"
          disabled={closeDisabled}
          onClick={controller.closeForm}
          type="button"
        >
          {common('cancel')}
        </button>
      </div>
    </>
  )

  const renderCrudForm = (className: string, showHeading: boolean) => (
    <form
      className={className}
      {...devMarker({
        context: devContext,
        name: 'crud form',
        priority: 340,
        value: formMode,
      })}
      onSubmit={controller.submit}
    >
      {renderCrudFormBody(showHeading)}
    </form>
  )

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {title}
          </h1>
          {canCreate && (
            <button
              className="btn-primary inline-flex items-center gap-1.5"
              {...devMarker({
                context: devContext,
                name: 'create button',
                priority: 350,
              })}
              disabled={controller.submitting}
              onClick={controller.openCreate}
              type="button"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              {common('create')}
            </button>
          )}
        </div>

        {visibleError && (
          <div
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200"
            {...devMarker({
              context: devContext,
              name: 'crud-admin-visible-error',
              priority: 340,
            })}
            role="alert"
          >
            {visibleError}
          </div>
        )}

        {formPresentation === 'modal' ? (
          <FormModal
            closeDisabled={closeDisabled}
            developerModeValue={formDialogDeveloperModeValue?.(formMode)}
            maxWidthClassName={formMaxWidthClassName}
            onClose={controller.closeForm}
            open={controller.showForm}
            title={resolvedFormTitle}
            titleId={resolvedFormTitleId}
          >
            {renderCrudForm('space-y-5', false)}
          </FormModal>
        ) : (
          <AnimatePresence>
            {controller.showForm && (
              <motion.div {...offsetPanelMotion(shouldReduceMotion)}>
                {renderCrudForm(
                  `glass rounded-2xl p-6 mb-6 space-y-5 ${formMaxWidthClassName}`,
                  true,
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {controller.loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {common('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden"
            {...devMarker({
              context: devContext,
              name: 'crud table',
              priority: 340,
            })}
          >
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                    {columns.map(column => (
                      <th className="py-3 px-4 font-medium" key={column.key}>
                        {column.header}
                      </th>
                    ))}
                    <th className="py-3 px-4">
                      <span className="sr-only">{common('actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {controller.items.length === 0 ? (
                    <tr
                      {...devMarker({
                        context: devContext,
                        name: 'empty state',
                        priority: 330,
                      })}
                    >
                      <td
                        className="px-4 py-10 text-center"
                        colSpan={columns.length + 1}
                      >
                        <div className="flex flex-col items-center justify-center gap-3 text-secondary-500 dark:text-secondary-400">
                          <p>{emptyStateMessage ?? common('emptyState')}</p>
                          {canCreate && (
                            <button
                              className="btn-primary inline-flex items-center gap-1.5"
                              {...devMarker({
                                context: devContext,
                                name: 'empty state create button',
                                priority: 330,
                              })}
                              disabled={controller.submitting}
                              onClick={controller.openCreate}
                              type="button"
                            >
                              <Plus aria-hidden="true" className="h-4 w-4" />
                              {common('create')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    controller.items.map(item => {
                      const isDeleting = controller.deletingIds.has(item.id)
                      const rowActionDisabled =
                        controller.submitting || isDeleting

                      return (
                        <tr
                          className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                          key={item.id}
                        >
                          {columns.map(column => (
                            <td
                              className={column.className ?? 'py-3 px-4'}
                              key={column.key}
                            >
                              {column.render(item)}
                            </td>
                          ))}
                          <td className="py-3 px-4 text-right">
                            <div className="flex justify-end gap-1">
                              <button
                                aria-label={common('edit')}
                                className={`${rowActionButtonClassName} text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/30`}
                                {...devMarker({
                                  context: devContext,
                                  name: 'table action',
                                  value: 'edit',
                                })}
                                disabled={rowActionDisabled}
                                onClick={() => controller.openEdit(item)}
                                title={common('edit')}
                                type="button"
                              >
                                <Pencil
                                  aria-hidden="true"
                                  className="h-4 w-4"
                                  focusable={false}
                                />
                              </button>
                              {canDelete(item) && (
                                <button
                                  aria-label={common('delete')}
                                  className={`${rowActionButtonClassName} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30`}
                                  {...devMarker({
                                    context: devContext,
                                    name: 'table action',
                                    value: 'delete',
                                  })}
                                  disabled={rowActionDisabled}
                                  onClick={event => {
                                    void controller.remove(
                                      item.id,
                                      event.currentTarget,
                                    )
                                  }}
                                  title={
                                    isDeleting
                                      ? common('deleting')
                                      : common('delete')
                                  }
                                  type="button"
                                >
                                  <Trash2
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                    focusable={false}
                                  />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
