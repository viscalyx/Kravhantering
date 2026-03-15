'use client'

import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'

interface ImplementationType {
  id: number
  nameEn: string
  nameSv: string
}

export default function GenomforandeformerClient() {
  const t = useTranslations('implementationTypeMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (item: ImplementationType) =>
    locale === 'sv' ? item.nameSv : item.nameEn

  const [items, setItems] = useState<ImplementationType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ nameSv: '', nameEn: '' })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/package-implementation-types')
    if (res.ok)
      setItems(
        ((await res.json()) as { types?: ImplementationType[] }).types ?? [],
      )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const method = editId ? 'PUT' : 'POST'
    const url = editId
      ? `/api/package-implementation-types/${editId}`
      : '/api/package-implementation-types'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setShowForm(false)
    setEditId(null)
    setForm({ nameSv: '', nameEn: '' })
    fetchItems()
  }

  const handleEdit = (item: ImplementationType) => {
    setEditId(item.id)
    setForm({ nameSv: item.nameSv, nameEn: item.nameEn })
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
    await fetch(`/api/package-implementation-types/${id}`, {
      method: 'DELETE',
    })
    fetchItems()
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('implementationTypes')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            data-developer-mode-context="implementation types"
            data-developer-mode-name="create button"
            data-developer-mode-priority="350"
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setForm({ nameSv: '', nameEn: '' })
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
            data-developer-mode-context="implementation types"
            data-developer-mode-name="crud form"
            data-developer-mode-priority="340"
            data-developer-mode-value={editId ? 'edit' : 'create'}
            onSubmit={handleSubmit}
          >
            <h2 className="text-lg font-semibold">
              {editId ? tc('edit') : tc('create')}
            </h2>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="it-name-sv"
              >
                {t('name')} (SV) *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="it-name-sv"
                onChange={e => setForm(f => ({ ...f, nameSv: e.target.value }))}
                required
                value={form.nameSv}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="it-name-en"
              >
                {t('name')} (EN) *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="it-name-en"
                onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                required
                value={form.nameEn}
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
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden"
            data-developer-mode-context="implementation types"
            data-developer-mode-name="crud table"
            data-developer-mode-priority="340"
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
                        data-developer-mode-context="implementation types"
                        data-developer-mode-name="table action"
                        data-developer-mode-value="edit"
                        onClick={() => handleEdit(item)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        data-developer-mode-context="implementation types"
                        data-developer-mode-name="table action"
                        data-developer-mode-value="delete"
                        onClick={e =>
                          handleDelete(item.id, e.currentTarget as HTMLElement)
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
