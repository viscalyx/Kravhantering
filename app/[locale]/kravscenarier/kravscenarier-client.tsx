'use client'

import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'

interface Scenario {
  descriptionEn: string | null
  descriptionSv: string | null
  id: number
  nameEn: string
  nameSv: string
  ownerId: string | null
}

export default function KravscenarierClient() {
  const t = useTranslations('scenario')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (s: Scenario) => (locale === 'sv' ? s.nameSv : s.nameEn)
  const getDescription = (s: Scenario) =>
    locale === 'sv' ? s.descriptionSv : s.descriptionEn

  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    nameSv: '',
    nameEn: '',
    descriptionSv: '',
    descriptionEn: '',
    ownerId: '',
  })

  const fetchScenarios = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/requirement-scenarios')
    if (res.ok)
      setScenarios(
        ((await res.json()) as { scenarios?: Scenario[] }).scenarios ?? [],
      )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchScenarios()
  }, [fetchScenarios])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const method = editId ? 'PUT' : 'POST'
    const url = editId
      ? `/api/requirement-scenarios/${editId}`
      : '/api/requirement-scenarios'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setShowForm(false)
    setEditId(null)
    setForm({
      nameSv: '',
      nameEn: '',
      descriptionSv: '',
      descriptionEn: '',
      ownerId: '',
    })
    fetchScenarios()
  }

  const handleEdit = (s: Scenario) => {
    setEditId(s.id)
    setForm({
      nameSv: s.nameSv,
      nameEn: s.nameEn,
      descriptionSv: s.descriptionSv ?? '',
      descriptionEn: s.descriptionEn ?? '',
      ownerId: s.ownerId ?? '',
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
    await fetch(`/api/requirement-scenarios/${id}`, { method: 'DELETE' })
    fetchScenarios()
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('scenarios')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setForm({
                nameSv: '',
                nameEn: '',
                descriptionSv: '',
                descriptionEn: '',
                ownerId: '',
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
            onSubmit={handleSubmit}
          >
            <h2 className="text-lg font-semibold">
              {editId ? tc('edit') : tc('create')}
            </h2>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="scen-name-sv"
              >
                {t('name')} (SV) *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="scen-name-sv"
                onChange={e => setForm(f => ({ ...f, nameSv: e.target.value }))}
                required
                value={form.nameSv}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="scen-name-en"
              >
                {t('name')} (EN) *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="scen-name-en"
                onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                required
                value={form.nameEn}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="scen-desc-sv"
              >
                {t('description')} (SV)
              </label>
              <textarea
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="scen-desc-sv"
                onChange={e =>
                  setForm(f => ({ ...f, descriptionSv: e.target.value }))
                }
                value={form.descriptionSv}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="scen-desc-en"
              >
                {t('description')} (EN)
              </label>
              <textarea
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="scen-desc-en"
                onChange={e =>
                  setForm(f => ({ ...f, descriptionEn: e.target.value }))
                }
                value={form.descriptionEn}
              />
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
          <div className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('description')}</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={s.id}
                  >
                    <td className="py-3 px-4 font-medium">{getName(s)}</td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400 truncate max-w-xs">
                      {getDescription(s) ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        onClick={() => handleEdit(s)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        onClick={e =>
                          handleDelete(s.id, e.currentTarget as HTMLElement)
                        }
                        type="button"
                      >
                        {tc('delete')}
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
