'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import {
  DEFAULT_PACKAGE_ITEM_STATUS_ID,
  DEVIATED_PACKAGE_ITEM_STATUS_ID,
} from '@/lib/package-item-status-constants'

const PACKAGE_ITEM_STATUSES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'packageItemStatuses.overview.body',
      headingKey: 'packageItemStatuses.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'packageItemStatuses.manage.body',
      headingKey: 'packageItemStatuses.manage.heading',
    },
  ],
  titleKey: 'packageItemStatuses.title',
}

interface PackageItemStatus {
  color: string
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  linkedItemCount: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface PackageItemStatusForm {
  color: string
  descriptionEn: string
  descriptionSv: string
  nameEn: string
  nameSv: string
  sortOrder: string
}

interface LinkedItem {
  packageId: number
  packageName: string
  requirementCount: number
}

const getInitialForm = (): PackageItemStatusForm => ({
  color: '#3b82f6',
  descriptionEn: '',
  descriptionSv: '',
  nameEn: '',
  nameSv: '',
  sortOrder: '0',
})

const toForm = (status: PackageItemStatus): PackageItemStatusForm => ({
  color: status.color,
  descriptionEn: status.descriptionEn ?? '',
  descriptionSv: status.descriptionSv ?? '',
  nameEn: status.nameEn,
  nameSv: status.nameSv,
  sortOrder: String(status.sortOrder),
})

const toPayload = (form: PackageItemStatusForm) => ({
  nameSv: form.nameSv,
  nameEn: form.nameEn,
  descriptionSv: form.descriptionSv || null,
  descriptionEn: form.descriptionEn || null,
  color: form.color,
  sortOrder: Number(form.sortOrder) || 0,
})

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

export default function PackageItemStatusesClient() {
  useHelpContent(PACKAGE_ITEM_STATUSES_HELP)
  const t = useTranslations('packageItemStatusAdmin')
  const tc = useTranslations('common')
  const locale = useLocale()
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([])
  const [linkedItemsLoading, setLinkedItemsLoading] = useState(false)
  const linkedItemRequestId = useRef(0)

  const getName = (status: PackageItemStatus) =>
    locale === 'sv' ? status.nameSv : status.nameEn

  const getDescription = (status: PackageItemStatus) =>
    locale === 'sv' ? status.descriptionSv : status.descriptionEn

  const controller = useCrudAdminResource<
    PackageItemStatus,
    PackageItemStatusForm
  >({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/package-item-statuses',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'statuses',
    toForm,
    toPayload,
  })

  const fetchLinkedItems = useCallback(async (statusId: number) => {
    const requestId = ++linkedItemRequestId.current
    setLinkedItemsLoading(true)
    try {
      const response = await apiFetch(`/api/package-item-statuses/${statusId}`)
      if (response.ok && requestId === linkedItemRequestId.current) {
        const data = (await response.json()) as {
          linkedItems?: LinkedItem[]
        }
        setLinkedItems(data.linkedItems ?? [])
      }
    } catch {
      // Keep existing linked items on error.
    } finally {
      if (requestId === linkedItemRequestId.current) {
        setLinkedItemsLoading(false)
      }
    }
  }, [])

  const openCreate = () => {
    setLinkedItems([])
    controller.openCreate()
  }

  const openEdit = (status: PackageItemStatus) => {
    setLinkedItems([])
    controller.openEdit(status)
    void fetchLinkedItems(status.id)
  }

  const closeForm = () => {
    setLinkedItems([])
    controller.closeForm()
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) setLinkedItems([])
  }

  const remove = async (id: number, anchorEl?: HTMLElement) => {
    const didRemove = await controller.remove(id, anchorEl)
    if (didRemove && controller.editId === id) setLinkedItems([])
  }

  const isSortOrderLocked =
    controller.editId === DEFAULT_PACKAGE_ITEM_STATUS_ID ||
    controller.editId === DEVIATED_PACKAGE_ITEM_STATUS_ID

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {t('title')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'package-item-statuses',
              name: 'create button',
              priority: 350,
            })}
            disabled={controller.submitting}
            onClick={openCreate}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>

        {(controller.deleteError || controller.loadError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
            {...devMarker({
              context: 'package-item-statuses',
              name: 'error banner',
              priority: 340,
              value: controller.deleteError ? 'delete-error' : 'load-error',
            })}
          >
            {controller.deleteError ?? controller.loadError}
          </p>
        )}

        <AnimatePresence>
          {controller.showForm && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6 mb-6"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
                <form
                  className="space-y-5"
                  {...devMarker({
                    context: 'package-item-statuses',
                    name: 'crud form',
                    priority: 340,
                    value: controller.editId ? 'edit' : 'create',
                  })}
                  onSubmit={submit}
                >
                  <h2 className="text-lg font-semibold">
                    {controller.editId ? t('editItem') : t('newItem')}
                  </h2>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="pis-name-sv"
                    >
                      {t('name')} (SV) <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="pis-name-sv"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          nameSv: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.nameSv}
                    />
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {t('nameSvHelp')}
                    </p>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="pis-name-en"
                    >
                      {t('name')} (EN) <span aria-hidden="true">*</span>
                    </label>
                    <input
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="pis-name-en"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          nameEn: event.target.value,
                        }))
                      }
                      required
                      value={controller.form.nameEn}
                    />
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {t('nameEnHelp')}
                    </p>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="pis-definition-sv"
                    >
                      {t('definition')} (SV)
                    </label>
                    <textarea
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="pis-definition-sv"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          descriptionSv: event.target.value,
                        }))
                      }
                      rows={2}
                      value={controller.form.descriptionSv}
                    />
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {t('definitionSvHelp')}
                    </p>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="pis-definition-en"
                    >
                      {t('definition')} (EN)
                    </label>
                    <textarea
                      className={inputClassName}
                      disabled={controller.submitting}
                      id="pis-definition-en"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          descriptionEn: event.target.value,
                        }))
                      }
                      rows={2}
                      value={controller.form.descriptionEn}
                    />
                    <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                      {t('definitionEnHelp')}
                    </p>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="pis-color"
                    >
                      {t('color')} <span aria-hidden="true">*</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        className="h-10 w-14 rounded-lg border cursor-pointer"
                        disabled={controller.submitting}
                        id="pis-color"
                        onChange={event =>
                          controller.setForm(previousForm => ({
                            ...previousForm,
                            color: event.target.value,
                          }))
                        }
                        required
                        type="color"
                        value={controller.form.color}
                      />
                      <input
                        aria-label={t('colorHex')}
                        className={inputClassName}
                        disabled={controller.submitting}
                        onChange={event =>
                          controller.setForm(previousForm => ({
                            ...previousForm,
                            color: event.target.value,
                          }))
                        }
                        pattern="^#[0-9a-fA-F]{6}$"
                        placeholder="#3b82f6"
                        value={controller.form.color}
                      />
                      <span
                        aria-hidden="true"
                        className="inline-block w-6 h-6 rounded-full shrink-0 border"
                        style={{ backgroundColor: controller.form.color }}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="pis-sort-order"
                    >
                      {t('sortOrder')}
                    </label>
                    <input
                      className={`${inputClassName}${isSortOrderLocked ? ' opacity-50 cursor-not-allowed' : ''}`}
                      disabled={controller.submitting || isSortOrderLocked}
                      id="pis-sort-order"
                      min="0"
                      onChange={event =>
                        controller.setForm(previousForm => ({
                          ...previousForm,
                          sortOrder: event.target.value,
                        }))
                      }
                      type="number"
                      value={controller.form.sortOrder}
                    />
                    {isSortOrderLocked && (
                      <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                        {t('sortOrderLocked')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="btn-primary"
                      disabled={controller.submitting}
                      type="submit"
                    >
                      {controller.submitting ? tc('saving') : tc('save')}
                    </button>
                    <button
                      className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                      disabled={controller.submitting}
                      onClick={closeForm}
                      type="button"
                    >
                      {tc('cancel')}
                    </button>
                  </div>
                  {controller.formError && (
                    <p
                      className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                      role="alert"
                    >
                      {controller.formError}
                    </p>
                  )}
                </form>

                {controller.editId && (
                  <div>
                    <h3 className="text-sm font-medium text-secondary-600 dark:text-secondary-400 mb-3">
                      {t('linkedPackages')}
                    </h3>
                    {linkedItemsLoading ? (
                      <p className="text-sm text-secondary-500 dark:text-secondary-400">
                        {tc('loading')}
                      </p>
                    ) : linkedItems.length === 0 ? (
                      <p className="text-sm text-secondary-500 dark:text-secondary-400">
                        {tc('noneAvailable')}
                      </p>
                    ) : (
                      <div className="rounded-xl border overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                              <th className="py-2 px-3 font-medium">
                                {t('package')}
                              </th>
                              <th className="py-2 px-3 font-medium text-right">
                                {t('requirement')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {linkedItems.map(item => (
                              <tr
                                className="border-b last:border-b-0 hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                                key={item.packageId}
                              >
                                <td className="py-2 px-3 text-secondary-600 dark:text-secondary-400">
                                  {item.packageName}
                                </td>
                                <td className="py-2 px-3 text-right text-secondary-600 dark:text-secondary-400">
                                  {t('requirementCount', {
                                    count: item.requirementCount,
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {controller.loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-x-auto"
            {...devMarker({
              context: 'package-item-statuses',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('color')}</th>
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('definition')}</th>
                  <th className="py-3 px-4 font-medium">{t('sortOrder')}</th>
                  <th className="py-3 px-4 font-medium text-center">
                    {t('linkedItemCount')}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {controller.items.map(status => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={status.id}
                  >
                    <td className="py-3 px-4">
                      <StatusBadge
                        color={status.color}
                        label={getName(status)}
                      />
                    </td>
                    <td className="py-3 px-4 font-medium">{getName(status)}</td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400 max-w-xs truncate">
                      {getDescription(status) || '—'}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {status.sortOrder}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('itemCount', {
                        count: status.linkedItemCount,
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'package-item-statuses',
                          name: 'table action',
                          value: 'edit',
                        })}
                        disabled={controller.submitting}
                        onClick={() => openEdit(status)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                        {...devMarker({
                          context: 'package-item-statuses',
                          name: 'table action',
                          value: 'delete',
                        })}
                        disabled={
                          controller.submitting ||
                          controller.deletingIds.has(status.id)
                        }
                        onClick={event => {
                          void remove(status.id, event.currentTarget)
                        }}
                        type="button"
                      >
                        {controller.deletingIds.has(status.id)
                          ? tc('loading')
                          : tc('delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
