'use client'

import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import StatusBadge from '@/components/StatusBadge'
import { devMarker } from '@/lib/developer-mode-markers'

const REQUIREMENT_STATUSES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementStatuses.overview.body',
      headingKey: 'requirementStatuses.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementStatuses.manage.body',
      headingKey: 'requirementStatuses.manage.heading',
    },
  ],
  titleKey: 'requirementStatuses.title',
}

interface Status {
  color: string | null
  id: number
  isSystem: boolean
  nameEn: string
  nameSv: string
  sortOrder: number
}

export default function RequirementStatusesClient() {
  useHelpContent(REQUIREMENT_STATUSES_HELP)
  const t = useTranslations('statusMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (s: Status) => (locale === 'sv' ? s.nameSv : s.nameEn)

  const [statuses, setStatuses] = useState<Status[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    nameSv: '',
    nameEn: '',
    sortOrder: 0,
    color: '#3b82f6',
  })

  const fetchStatuses = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/requirement-statuses')
    if (res.ok) {
      const data = (await res.json()) as { statuses?: Status[] }
      setStatuses(data.statuses ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchStatuses()
  }, [fetchStatuses])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const method = editId ? 'PUT' : 'POST'
    const url = editId
      ? `/api/requirement-statuses/${editId}`
      : '/api/requirement-statuses'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setShowForm(false)
    setEditId(null)
    setForm({ nameSv: '', nameEn: '', sortOrder: 0, color: '#3b82f6' })
    fetchStatuses()
  }

  const handleEdit = (s: Status) => {
    setEditId(s.id)
    setForm({
      nameSv: s.nameSv,
      nameEn: s.nameEn,
      sortOrder: s.sortOrder,
      color: s.color ?? '#3b82f6',
    })
    setShowForm(true)
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
    const res = await fetch(`/api/requirement-statuses/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const data = (await res.json()) as { error?: string }
      await confirm({
        message: data.error ?? tc('error'),
        showCancel: false,
        icon: 'warning',
        anchorEl,
      })
    }
    fetchStatuses()
  }

  const inputClass =
    'w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200'

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('statuses')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'statuses',
              name: 'create button',
              priority: 350,
            })}
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setForm({
                nameSv: '',
                nameEn: '',
                sortOrder: 0,
                color: '#3b82f6',
              })
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>

        {showForm && (
          <form
            className="glass rounded-2xl p-6 mb-6 space-y-5 max-w-lg animate-fade-in-up"
            {...devMarker({
              context: 'statuses',
              name: 'crud form',
              priority: 340,
              value: editId ? 'edit' : 'create',
            })}
            onSubmit={handleSubmit}
          >
            <h2 className="text-lg font-semibold">
              {editId ? tc('edit') : tc('create')}
            </h2>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="status-name-sv"
              >
                {t('name')} (SV) *
              </label>
              <input
                className={inputClass}
                id="status-name-sv"
                onChange={e => setForm(f => ({ ...f, nameSv: e.target.value }))}
                required
                value={form.nameSv}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="status-name-en"
              >
                {t('name')} (EN) *
              </label>
              <input
                className={inputClass}
                id="status-name-en"
                onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                required
                value={form.nameEn}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="status-sort-order"
              >
                {t('sortOrder')}
              </label>
              <input
                className={inputClass}
                id="status-sort-order"
                min={0}
                onChange={e =>
                  setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))
                }
                type="number"
                value={form.sortOrder}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="status-color"
              >
                {t('color')}
              </label>
              <div className="flex items-center gap-3">
                <input
                  className="h-10 w-10 rounded-lg border-0 cursor-pointer"
                  id="status-color"
                  onChange={e =>
                    setForm(f => ({ ...f, color: e.target.value }))
                  }
                  type="color"
                  value={form.color}
                />
                <span className="text-sm font-mono text-secondary-500">
                  {form.color}
                </span>
                <StatusBadge
                  color={form.color}
                  label={form.nameSv || 'Preview'}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button className="btn-primary" type="submit">
                {tc('save')}
              </button>
              <button
                className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                onClick={() => setShowForm(false)}
                type="button"
              >
                {tc('cancel')}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden"
            {...devMarker({
              context: 'statuses',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('color')}</th>
                  <th className="py-3 px-4 font-medium">{t('sortOrder')}</th>
                  <th className="py-3 px-4 font-medium">{t('isSystem')}</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {statuses.map(s => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={s.id}
                  >
                    <td className="py-3 px-4 font-medium">
                      <StatusBadge color={s.color} label={getName(s)} />
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-4 rounded-full border"
                          style={{ backgroundColor: s.color ?? '#ccc' }}
                        />
                        <span className="font-mono text-xs text-secondary-500">
                          {s.color}
                        </span>
                      </span>
                    </td>
                    <td className="py-3 px-4">{s.sortOrder}</td>
                    <td className="py-3 px-4">
                      {s.isSystem ? tc('yes') : tc('no')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        {...devMarker({
                          context: 'statuses',
                          name: 'table action',
                          value: 'edit',
                        })}
                        onClick={() => handleEdit(s)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      {!s.isSystem && (
                        <button
                          className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                          {...devMarker({
                            context: 'statuses',
                            name: 'table action',
                            value: 'delete',
                          })}
                          onClick={e =>
                            handleDelete(s.id, e.currentTarget as HTMLElement)
                          }
                          type="button"
                        >
                          {tc('delete')}
                        </button>
                      )}
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
