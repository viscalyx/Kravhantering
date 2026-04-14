'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'

const RESPONSIBILITY_AREAS_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'responsibilityAreas.overview.body',
      headingKey: 'responsibilityAreas.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'responsibilityAreas.manage.body',
      headingKey: 'responsibilityAreas.manage.heading',
    },
  ],
  titleKey: 'responsibilityAreas.title',
}

interface ResponsibilityArea {
  id: number
  nameEn: string
  nameSv: string
}

export default function ResponsibilityAreasClient() {
  useHelpContent(RESPONSIBILITY_AREAS_HELP)
  const t = useTranslations('responsibilityAreaMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (item: ResponsibilityArea) =>
    locale === 'sv' ? item.nameSv : item.nameEn

  const [items, setItems] = useState<ResponsibilityArea[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ nameSv: '', nameEn: '' })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/package-responsibility-areas')
    if (res.ok)
      setItems(
        ((await res.json()) as { areas?: ResponsibilityArea[] }).areas ?? [],
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
      ? `/api/package-responsibility-areas/${editId}`
      : '/api/package-responsibility-areas'
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

  const handleEdit = (item: ResponsibilityArea) => {
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
    await fetch(`/api/package-responsibility-areas/${id}`, {
      method: 'DELETE',
    })
    fetchItems()
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('responsibilityAreas')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'responsibility areas',
              name: 'create button',
              priority: 350,
            })}
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

        <AnimatePresence>
          {showForm && (
            <motion.form
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6 mb-6 space-y-5 max-w-lg"
              exit={{ opacity: 0, y: 8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              {...devMarker({
                context: 'responsibility areas',
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
                  htmlFor="ra-name-sv"
                >
                  {t('name')} (SV) *
                </label>
                <input
                  className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                  id="ra-name-sv"
                  onChange={e =>
                    setForm(f => ({ ...f, nameSv: e.target.value }))
                  }
                  required
                  value={form.nameSv}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium mb-1"
                  htmlFor="ra-name-en"
                >
                  {t('name')} (EN) *
                </label>
                <input
                  className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                  id="ra-name-en"
                  onChange={e =>
                    setForm(f => ({ ...f, nameEn: e.target.value }))
                  }
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
            </motion.form>
          )}
        </AnimatePresence>

        {loading ? (
          <p className="text-secondary-600 dark:text-secondary-400">
            {tc('loading')}
          </p>
        ) : (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden"
            {...devMarker({
              context: 'responsibility areas',
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
                          context: 'responsibility areas',
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
                          context: 'responsibility areas',
                          name: 'table action',
                          value: 'delete',
                        })}
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
