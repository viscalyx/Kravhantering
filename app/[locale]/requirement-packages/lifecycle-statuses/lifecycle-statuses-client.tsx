'use client'

import { HelpCircle, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'

const LIFECYCLE_STATUSES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'lifecycleStatuses.overview.body',
      headingKey: 'lifecycleStatuses.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'lifecycleStatuses.manage.body',
      headingKey: 'lifecycleStatuses.manage.heading',
    },
  ],
  titleKey: 'lifecycleStatuses.title',
}

interface LifecycleStatus {
  id: number
  nameEn: string
  nameSv: string
}

export default function LifecycleStatusesClient() {
  useHelpContent(LIFECYCLE_STATUSES_HELP)
  const t = useTranslations('lifecycleStatusMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (item: LifecycleStatus) =>
    locale === 'sv' ? item.nameSv : item.nameEn

  const [items, setItems] = useState<LifecycleStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ nameSv: '', nameEn: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openHelp, setOpenHelp] = useState<Set<string>>(new Set())

  const toggleHelp = (field: string) =>
    setOpenHelp(prev => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-secondary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) =>
    openHelp.has(field) && (
      <p
        className="mt-1 mb-2 text-xs text-secondary-500 dark:text-secondary-400 whitespace-pre-line bg-secondary-50 dark:bg-secondary-800/50 rounded-lg px-3 py-2 border border-secondary-200 dark:border-secondary-700"
        id={`help-${field}`}
      >
        {t(helpKey)}
      </p>
    )

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/package-lifecycle-statuses')
    if (res.ok)
      setItems(
        ((await res.json()) as { statuses?: LifecycleStatus[] }).statuses ?? [],
      )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)
    const method = editId ? 'PUT' : 'POST'
    const url = editId
      ? `/api/package-lifecycle-statuses/${editId}`
      : '/api/package-lifecycle-statuses'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError((body as { error?: string }).error ?? tc('unexpectedError'))
        return
      }
      setShowForm(false)
      setEditId(null)
      setForm({ nameSv: '', nameEn: '' })
      fetchItems()
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (item: LifecycleStatus) => {
    setEditId(item.id)
    setForm({ nameSv: item.nameSv, nameEn: item.nameEn })
    setError(null)
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
    setIsDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/package-lifecycle-statuses/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError((body as { error?: string }).error ?? tc('unexpectedError'))
        return
      }
      fetchItems()
    } finally {
      setIsDeleting(null)
    }
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('lifecycleStatuses')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'lifecycle statuses',
              name: 'create button',
              priority: 350,
            })}
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setForm({ nameSv: '', nameEn: '' })
              setError(null)
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>

        {error && (
          <div
            className="mb-4 rounded-xl border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/30 px-4 py-3 text-sm text-red-800 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        )}

        {showForm && (
          <form
            className="glass rounded-2xl p-6 mb-6 space-y-5 max-w-lg animate-fade-in-up"
            {...devMarker({
              context: 'lifecycle statuses',
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
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium" htmlFor="ls-name-sv">
                  {t('name')} (SV) *
                </label>
                {helpButton('nameSv', `${t('name')} (SV)`)}
              </div>
              {helpPanel('nameSvHelp', 'nameSv')}
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="ls-name-sv"
                onChange={e => setForm(f => ({ ...f, nameSv: e.target.value }))}
                required
                value={form.nameSv}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-medium" htmlFor="ls-name-en">
                  {t('name')} (EN) *
                </label>
                {helpButton('nameEn', `${t('name')} (EN)`)}
              </div>
              {helpPanel('nameEnHelp', 'nameEn')}
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="ls-name-en"
                onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                required
                value={form.nameEn}
              />
            </div>
            <div className="flex gap-3">
              <button className="btn-primary" disabled={isSaving} type="submit">
                {isSaving ? tc('saving') : tc('save')}
              </button>
              <button
                className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                disabled={isSaving}
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
              context: 'lifecycle statuses',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={item.id}
                  >
                    <td className="py-3 px-4 font-medium">{getName(item)}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        {...devMarker({
                          context: 'lifecycle statuses',
                          name: 'table action',
                          value: 'edit',
                        })}
                        onClick={() => handleEdit(item)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        {...devMarker({
                          context: 'lifecycle statuses',
                          name: 'table action',
                          value: 'delete',
                        })}
                        disabled={isDeleting === item.id}
                        onClick={e =>
                          handleDelete(item.id, e.currentTarget as HTMLElement)
                        }
                        type="button"
                      >
                        {isDeleting === item.id ? tc('deleting') : tc('delete')}
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
