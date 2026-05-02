'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import type { CrudAdminResourceController } from '@/hooks/useCrudAdminResource'
import { devMarker } from '@/lib/developer-mode-markers'

type CrudId = number | string

export interface CrudAdminColumn<TItem> {
  className?: string
  header: ReactNode
  key: string
  render: (item: TItem) => ReactNode
}

interface CrudAdminPanelProps<TItem extends { id: CrudId }, TForm> {
  canDelete?: (item: TItem) => boolean
  columns: CrudAdminColumn<TItem>[]
  controller: CrudAdminResourceController<TItem, TForm>
  devContext: string
  formMaxWidthClassName?: string
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

export default function CrudAdminPanel<TItem extends { id: CrudId }, TForm>({
  canDelete = () => true,
  columns,
  controller,
  devContext,
  formMaxWidthClassName = 'max-w-lg',
  renderFormFields,
  title,
}: CrudAdminPanelProps<TItem, TForm>) {
  const common = useTranslations('common')
  const visibleError = controller.deleteError ?? controller.loadError

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {title}
          </h1>
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

        <AnimatePresence>
          {controller.showForm && (
            <motion.form
              animate={{ opacity: 1, y: 0 }}
              className={`glass rounded-2xl p-6 mb-6 space-y-5 ${formMaxWidthClassName}`}
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              {...devMarker({
                context: devContext,
                name: 'crud form',
                priority: 340,
                value: controller.editId === null ? 'create' : 'edit',
              })}
              onSubmit={controller.submit}
            >
              <h2 className="text-lg font-semibold">
                {controller.editId === null ? common('create') : common('edit')}
              </h2>
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
                  className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 text-secondary-700 dark:text-secondary-300 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                  disabled={controller.submitting}
                  onClick={controller.closeForm}
                  type="button"
                >
                  {common('cancel')}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

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
                  {controller.items.map(item => {
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
                          <button
                            className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                            {...devMarker({
                              context: devContext,
                              name: 'table action',
                              value: 'edit',
                            })}
                            disabled={rowActionDisabled}
                            onClick={() => controller.openEdit(item)}
                            type="button"
                          >
                            {controller.submitting
                              ? common('saving')
                              : common('edit')}
                          </button>
                          {canDelete(item) && (
                            <button
                              className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
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
                              type="button"
                            >
                              {controller.submitting
                                ? common('saving')
                                : isDeleting
                                  ? common('deleting')
                                  : common('delete')}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
