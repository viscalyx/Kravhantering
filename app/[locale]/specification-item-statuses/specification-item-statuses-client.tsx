'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import DirtyStateButton from '@/components/DirtyStateButton'
import FieldLabelWithHelp from '@/components/FieldLabelWithHelp'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import IconPicker from '@/components/IconPicker'
import StatusBadge from '@/components/StatusBadge'
import { useCrudAdminResource } from '@/hooks/useCrudAdminResource'
import { devMarker } from '@/lib/developer-mode-markers'
import { apiFetch } from '@/lib/http/api-fetch'
import { offsetPanelMotion } from '@/lib/reduced-motion'
import {
  DEFAULT_SPECIFICATION_ITEM_STATUS_ID,
  DEVIATED_SPECIFICATION_ITEM_STATUS_ID,
} from '@/lib/specification-item-status-constants'

const SPECIFICATION_ITEM_STATUSES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'specificationItemStatuses.overview.body',
      headingKey: 'specificationItemStatuses.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'specificationItemStatuses.manage.body',
      headingKey: 'specificationItemStatuses.manage.heading',
    },
  ],
  titleKey: 'specificationItemStatuses.title',
}

interface SpecificationItemStatus {
  color: string
  descriptionEn: string | null
  descriptionSv: string | null
  iconName: string | null
  id: number
  linkedItemCount: number
  nameEn: string
  nameSv: string
  sortOrder: number
}

interface SpecificationItemStatusForm {
  color: string
  descriptionEn: string
  descriptionSv: string
  iconName: string | null
  nameEn: string
  nameSv: string
  sortOrder: string
}

interface LinkedItem {
  requirementCount: number
  specificationId: number
  specificationName: string
}

const getInitialForm = (): SpecificationItemStatusForm => ({
  color: '#3b82f6',
  descriptionEn: '',
  descriptionSv: '',
  iconName: null,
  nameEn: '',
  nameSv: '',
  sortOrder: '0',
})

const toForm = (
  status: SpecificationItemStatus,
): SpecificationItemStatusForm => ({
  color: status.color,
  descriptionEn: status.descriptionEn ?? '',
  descriptionSv: status.descriptionSv ?? '',
  iconName: status.iconName ?? null,
  nameEn: status.nameEn,
  nameSv: status.nameSv,
  sortOrder: String(status.sortOrder),
})

const toPayload = (form: SpecificationItemStatusForm) => ({
  nameSv: form.nameSv,
  nameEn: form.nameEn,
  descriptionSv: form.descriptionSv || null,
  descriptionEn: form.descriptionEn || null,
  color: form.color,
  iconName: form.iconName,
  sortOrder: Number(form.sortOrder) || 0,
})

const inputClassName =
  'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

export default function SpecificationItemStatusesClient() {
  useHelpContent(SPECIFICATION_ITEM_STATUSES_HELP)
  const t = useTranslations('specificationItemStatusAdmin')
  const tc = useTranslations('common')
  const locale = useLocale()
  const shouldReduceMotion = useReducedMotion()
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([])
  const [linkedItemsError, setLinkedItemsError] = useState<string | null>(null)
  const [linkedItemsLoading, setLinkedItemsLoading] = useState(false)
  const linkedItemRequestId = useRef(0)

  const getName = (status: SpecificationItemStatus) =>
    locale === 'sv' ? status.nameSv : status.nameEn

  const getDescription = (status: SpecificationItemStatus) =>
    locale === 'sv' ? status.descriptionSv : status.descriptionEn

  const controller = useCrudAdminResource<
    SpecificationItemStatus,
    SpecificationItemStatusForm
  >({
    confirmDeleteMessage: tc('confirm'),
    endpoint: '/api/catalog/specification-item-statuses',
    errorMessage: tc('error'),
    getInitialForm,
    listKey: 'statuses',
    toForm,
    toPayload,
  })

  const fetchLinkedItems = useCallback(
    async (statusId: number) => {
      const requestId = ++linkedItemRequestId.current
      setLinkedItemsLoading(true)
      setLinkedItemsError(null)
      try {
        const response = await apiFetch(
          `/api/catalog/specification-item-statuses/${statusId}`,
        )
        if (requestId !== linkedItemRequestId.current) return
        if (!response.ok) {
          setLinkedItemsError(tc('error'))
          return
        }
        const data = (await response.json()) as {
          linkedItems?: LinkedItem[]
        }
        if (requestId !== linkedItemRequestId.current) return
        setLinkedItems(data.linkedItems ?? [])
      } catch {
        if (requestId === linkedItemRequestId.current) {
          setLinkedItemsError(tc('error'))
        }
      } finally {
        if (requestId === linkedItemRequestId.current) {
          setLinkedItemsLoading(false)
        }
      }
    },
    [tc],
  )

  const openEdit = (status: SpecificationItemStatus) => {
    controller.openEdit(status)
    void fetchLinkedItems(status.id)
  }

  const closeForm = async (anchorEl?: HTMLElement | null) => {
    if (!(await controller.closeForm(anchorEl))) return
    setLinkedItems([])
    setLinkedItemsError(null)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    const didSubmit = await controller.submit(event)
    if (didSubmit) {
      setLinkedItems([])
      setLinkedItemsError(null)
    }
  }

  const isSortOrderLocked =
    controller.editId === DEFAULT_SPECIFICATION_ITEM_STATUS_ID ||
    controller.editId === DEVIATED_SPECIFICATION_ITEM_STATUS_ID

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {t('title')}
          </h1>
        </div>

        {(controller.deleteError || controller.loadError) && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
            {...devMarker({
              context: 'specification-item-statuses',
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
              className="glass rounded-2xl p-6 mb-6"
              {...offsetPanelMotion(shouldReduceMotion)}
            >
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
                <form
                  className="space-y-5"
                  {...devMarker({
                    context: 'specification-item-statuses',
                    name: 'crud form',
                    priority: 340,
                    value: 'edit',
                  })}
                  onSubmit={submit}
                >
                  <h2 className="text-lg font-semibold">{t('editItem')}</h2>
                  <div>
                    <FieldLabelWithHelp
                      help={t('nameSvHelp')}
                      htmlFor="pis-name-sv"
                      label={`${t('name')} (SV)`}
                      required
                    />
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
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('nameEnHelp')}
                      htmlFor="pis-name-en"
                      label={`${t('name')} (EN)`}
                      required
                    />
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
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('definitionSvHelp')}
                      htmlFor="pis-definition-sv"
                      label={`${t('definition')} (SV)`}
                    />
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
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('definitionEnHelp')}
                      htmlFor="pis-definition-en"
                      label={`${t('definition')} (EN)`}
                    />
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
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('colorHelp')}
                      htmlFor="pis-color"
                      label={t('color')}
                      required
                    />
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
                    <FieldLabelWithHelp
                      help={t('iconHelp')}
                      htmlFor="pis-icon"
                      label={t('icon')}
                    />
                    <div className="flex items-center gap-3">
                      <IconPicker
                        disabled={controller.submitting}
                        id="pis-icon"
                        label={t('icon')}
                        onChange={iconName =>
                          controller.setForm(previousForm => ({
                            ...previousForm,
                            iconName,
                          }))
                        }
                        value={controller.form.iconName}
                      />
                      <StatusBadge
                        color={controller.form.color}
                        iconName={controller.form.iconName}
                        label={
                          controller.form.nameSv ||
                          controller.form.nameEn ||
                          t('name')
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <FieldLabelWithHelp
                      help={t('sortOrderHelp')}
                      htmlFor="pis-sort-order"
                      label={t('sortOrder')}
                    />
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
                    <DirtyStateButton
                      className="btn-primary"
                      dirty={controller.formDirty}
                      disabled={controller.submitting}
                      type="submit"
                    >
                      {controller.submitting ? tc('saving') : tc('save')}
                    </DirtyStateButton>
                    <button
                      className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                      disabled={controller.submitting}
                      onClick={event => void closeForm(event.currentTarget)}
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
                      {t('linkedSpecifications')}
                    </h3>
                    {linkedItemsLoading ? (
                      <p className="text-sm text-secondary-500 dark:text-secondary-400">
                        {tc('loading')}
                      </p>
                    ) : linkedItemsError ? (
                      <p
                        className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                        role="alert"
                      >
                        {linkedItemsError}
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
                                {t('specification')}
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
                                key={item.specificationId}
                              >
                                <td className="py-2 px-3 text-secondary-600 dark:text-secondary-400">
                                  {item.specificationName}
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
              context: 'specification-item-statuses',
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
                {controller.items.length === 0 ? (
                  <tr
                    {...devMarker({
                      context: 'specification-item-statuses',
                      name: 'empty state',
                      priority: 330,
                    })}
                  >
                    <td
                      className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                      colSpan={6}
                    >
                      {t('emptyState')}
                    </td>
                  </tr>
                ) : (
                  controller.items.map(status => (
                    <tr
                      className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                      key={status.id}
                    >
                      <td className="py-3 px-4">
                        <StatusBadge
                          color={status.color}
                          iconName={status.iconName}
                          label={getName(status)}
                        />
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {getName(status)}
                      </td>
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
                          className="text-sm text-primary-700 dark:text-primary-300 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded disabled:opacity-50 disabled:pointer-events-none"
                          {...devMarker({
                            context: 'specification-item-statuses',
                            name: 'table action',
                            value: 'edit',
                          })}
                          disabled={controller.submitting}
                          onClick={() => openEdit(status)}
                          type="button"
                        >
                          {tc('edit')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
