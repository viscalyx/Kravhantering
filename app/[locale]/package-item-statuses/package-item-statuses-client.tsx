'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
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

interface LinkedItem {
  packageId: number
  packageName: string
  requirementCount: number
}

export default function PackageItemStatusesClient() {
  useHelpContent(PACKAGE_ITEM_STATUSES_HELP)
  const t = useTranslations('packageItemStatusAdmin')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (s: PackageItemStatus) =>
    locale === 'sv' ? s.nameSv : s.nameEn

  const getDescription = (s: PackageItemStatus) =>
    locale === 'sv' ? s.descriptionSv : s.descriptionEn

  const [statuses, setStatuses] = useState<PackageItemStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([])
  const [linkedItemsLoading, setLinkedItemsLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    nameSv: '',
    nameEn: '',
    descriptionSv: '',
    descriptionEn: '',
    color: '#3b82f6',
    sortOrder: '0',
  })

  const fetchStatuses = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/package-item-statuses')
      if (res.ok)
        setStatuses(
          ((await res.json()) as { statuses?: PackageItemStatus[] }).statuses ??
            [],
        )
    } catch {
      setStatuses([])
    } finally {
      setLoading(false)
    }
  }, [])

  const linkedItemRequestId = useRef(0)

  const fetchLinkedItems = useCallback(async (statusId: number) => {
    const requestId = ++linkedItemRequestId.current
    setLinkedItemsLoading(true)
    try {
      const res = await apiFetch(`/api/package-item-statuses/${statusId}`)
      if (res.ok && requestId === linkedItemRequestId.current) {
        const data = (await res.json()) as {
          linkedItems?: LinkedItem[]
        }
        setLinkedItems(data.linkedItems ?? [])
      }
    } catch {
      // Keep existing linkedItems on error
    } finally {
      if (requestId === linkedItemRequestId.current) {
        setLinkedItemsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    fetchStatuses()
  }, [fetchStatuses])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const method = editId ? 'PUT' : 'POST'
      const url = editId
        ? `/api/package-item-statuses/${editId}`
        : '/api/package-item-statuses'
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameSv: form.nameSv,
          nameEn: form.nameEn,
          descriptionSv: form.descriptionSv || null,
          descriptionEn: form.descriptionEn || null,
          color: form.color,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setSubmitError(
          (body as { error?: string } | null)?.error ?? tc('error'),
        )
        return
      }
      setSubmitError(null)
      setShowForm(false)
      setEditId(null)
      setLinkedItems([])
      setForm({
        nameSv: '',
        nameEn: '',
        descriptionSv: '',
        descriptionEn: '',
        color: '#3b82f6',
        sortOrder: '0',
      })
      fetchStatuses()
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (s: PackageItemStatus) => {
    setSubmitError(null)
    setEditId(s.id)
    setLinkedItems([])
    setForm({
      nameSv: s.nameSv,
      nameEn: s.nameEn,
      descriptionSv: s.descriptionSv ?? '',
      descriptionEn: s.descriptionEn ?? '',
      color: s.color,
      sortOrder: String(s.sortOrder),
    })
    setShowForm(true)
    fetchLinkedItems(s.id)
  }

  const { confirm } = useConfirmModal()

  const handleDelete = async (id: number, anchorEl?: HTMLElement) => {
    if (
      !(await confirm({
        message: tc('confirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return
    setDeleteError(null)
    setDeletingId(id)
    try {
      const res = await apiFetch(`/api/package-item-statuses/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setDeleteError(
          (body as { error?: string } | null)?.error ?? tc('error'),
        )
        return
      }
      if (editId === id) {
        setEditId(null)
        setShowForm(false)
        setLinkedItems([])
      }
      fetchStatuses()
    } catch {
      setDeleteError(tc('error'))
    } finally {
      setDeletingId(null)
    }
  }

  const inputClass =
    'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

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
            disabled={submitting}
            onClick={() => {
              setSubmitError(null)
              setShowForm(true)
              setEditId(null)
              setLinkedItems([])
              setForm({
                nameSv: '',
                nameEn: '',
                descriptionSv: '',
                descriptionEn: '',
                color: '#3b82f6',
                sortOrder: '0',
              })
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>

        <AnimatePresence>
          {showForm && (
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
                    value: editId ? 'edit' : 'create',
                  })}
                  onSubmit={handleSubmit}
                >
                  <h2 className="text-lg font-semibold">
                    {editId ? t('editItem') : t('newItem')}
                  </h2>
                  <div>
                    <label
                      className="block text-sm font-medium mb-1"
                      htmlFor="pis-name-sv"
                    >
                      {t('name')} (SV) *
                    </label>
                    <input
                      className={inputClass}
                      id="pis-name-sv"
                      onChange={e =>
                        setForm(f => ({ ...f, nameSv: e.target.value }))
                      }
                      required
                      value={form.nameSv}
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
                      {t('name')} (EN) *
                    </label>
                    <input
                      className={inputClass}
                      id="pis-name-en"
                      onChange={e =>
                        setForm(f => ({ ...f, nameEn: e.target.value }))
                      }
                      required
                      value={form.nameEn}
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
                      className={inputClass}
                      id="pis-definition-sv"
                      onChange={e =>
                        setForm(f => ({ ...f, descriptionSv: e.target.value }))
                      }
                      rows={2}
                      value={form.descriptionSv}
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
                      className={inputClass}
                      id="pis-definition-en"
                      onChange={e =>
                        setForm(f => ({ ...f, descriptionEn: e.target.value }))
                      }
                      rows={2}
                      value={form.descriptionEn}
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
                      {t('color')} *
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        className="h-10 w-14 rounded-lg border cursor-pointer"
                        id="pis-color"
                        onChange={e =>
                          setForm(f => ({ ...f, color: e.target.value }))
                        }
                        required
                        type="color"
                        value={form.color}
                      />
                      <input
                        aria-label={t('colorHex')}
                        className={inputClass}
                        onChange={e =>
                          setForm(f => ({ ...f, color: e.target.value }))
                        }
                        pattern="^#[0-9a-fA-F]{6}$"
                        placeholder="#3b82f6"
                        value={form.color}
                      />
                      <span
                        aria-hidden="true"
                        className="inline-block w-6 h-6 rounded-full shrink-0 border"
                        style={{ backgroundColor: form.color }}
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
                      className={`${inputClass}${editId === DEFAULT_PACKAGE_ITEM_STATUS_ID || editId === DEVIATED_PACKAGE_ITEM_STATUS_ID ? ' opacity-50 cursor-not-allowed' : ''}`}
                      disabled={
                        editId === DEFAULT_PACKAGE_ITEM_STATUS_ID ||
                        editId === DEVIATED_PACKAGE_ITEM_STATUS_ID
                      }
                      id="pis-sort-order"
                      min="0"
                      onChange={e =>
                        setForm(f => ({ ...f, sortOrder: e.target.value }))
                      }
                      type="number"
                      value={form.sortOrder}
                    />
                    {(editId === DEFAULT_PACKAGE_ITEM_STATUS_ID ||
                      editId === DEVIATED_PACKAGE_ITEM_STATUS_ID) && (
                      <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                        {t('sortOrderLocked')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      className="btn-primary"
                      disabled={submitting}
                      type="submit"
                    >
                      {submitting ? tc('saving') : tc('save')}
                    </button>
                    <button
                      className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                      disabled={submitting}
                      onClick={() => {
                        setShowForm(false)
                        setLinkedItems([])
                      }}
                      type="button"
                    >
                      {tc('cancel')}
                    </button>
                  </div>
                  {submitError && (
                    <p
                      className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
                      role="alert"
                    >
                      {submitError}
                    </p>
                  )}
                </form>

                {editId && (
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

        {deleteError && (
          <p
            className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
            role="alert"
            {...devMarker({
              context: 'package-item-statuses',
              name: 'error banner',
              priority: 340,
              value: 'delete-error',
            })}
          >
            {deleteError}
          </p>
        )}

        {loading ? (
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
                {statuses.map(s => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={s.id}
                  >
                    <td className="py-3 px-4">
                      <StatusBadge color={s.color} label={getName(s)} />
                    </td>
                    <td className="py-3 px-4 font-medium">{getName(s)}</td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400 max-w-xs truncate">
                      {getDescription(s) || '—'}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {s.sortOrder}
                    </td>
                    <td className="py-3 px-4 text-center text-secondary-600 dark:text-secondary-400">
                      {t('itemCount', {
                        count: s.linkedItemCount,
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
                        disabled={submitting}
                        onClick={() => handleEdit(s)}
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
                        disabled={submitting || deletingId === s.id}
                        onClick={e =>
                          handleDelete(s.id, e.currentTarget as HTMLElement)
                        }
                        type="button"
                      >
                        {deletingId === s.id ? tc('loading') : tc('delete')}
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
