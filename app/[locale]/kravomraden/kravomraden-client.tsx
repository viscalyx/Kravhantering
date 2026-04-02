'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { devMarker } from '@/lib/developer-mode-markers'

const KRAVOMRADEN_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'kravomraden.overview.body',
      headingKey: 'kravomraden.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'kravomraden.manage.body',
      headingKey: 'kravomraden.manage.heading',
    },
  ],
  titleKey: 'kravomraden.title',
}

interface Area {
  description: string | null
  id: number
  name: string
  ownerId: number | null
  ownerName: string | null
  prefix: string
}

interface OwnerOption {
  id: number
  name: string
}

export default function KravomradenClient() {
  useHelpContent(KRAVOMRADEN_HELP)
  const t = useTranslations('area')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')

  const [areas, setAreas] = useState<Area[]>([])
  const [owners, setOwners] = useState<OwnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    prefix: '',
    name: '',
    description: '',
    ownerId: '',
  })

  const fetchAreas = useCallback(async () => {
    setLoading(true)
    try {
      const [areasRes, ownersRes] = await Promise.all([
        fetch('/api/requirement-areas'),
        fetch('/api/owners'),
      ])
      if (areasRes.ok)
        setAreas(((await areasRes.json()) as { areas?: Area[] }).areas ?? [])
      if (ownersRes.ok)
        setOwners(
          ((await ownersRes.json()) as { owners?: OwnerOption[] }).owners ?? [],
        )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAreas()
  }, [fetchAreas])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const method = editId ? 'PUT' : 'POST'
    const url = editId
      ? `/api/requirement-areas/${editId}`
      : '/api/requirement-areas'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        ownerId: form.ownerId ? Number(form.ownerId) : undefined,
      }),
    })
    setShowForm(false)
    setEditId(null)
    setForm({ prefix: '', name: '', description: '', ownerId: '' })
    fetchAreas()
  }

  const handleEdit = (area: Area) => {
    setEditId(area.id)
    setForm({
      prefix: area.prefix,
      name: area.name,
      description: area.description ?? '',
      ownerId: area.ownerId != null ? String(area.ownerId) : '',
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
    await fetch(`/api/requirement-areas/${id}`, { method: 'DELETE' })
    fetchAreas()
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('areas')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'areas',
              name: 'create button',
              priority: 350,
            })}
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setForm({ prefix: '', name: '', description: '', ownerId: '' })
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
              context: 'areas',
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
                htmlFor="area-prefix"
              >
                {t('prefix')} *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="area-prefix"
                maxLength={10}
                onChange={e =>
                  setForm(f => ({ ...f, prefix: e.target.value.toUpperCase() }))
                }
                required
                value={form.prefix}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="area-name"
              >
                {t('name')} *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="area-name"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                value={form.name}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="area-desc"
              >
                {t('description')}
              </label>
              <textarea
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="area-desc"
                onChange={e =>
                  setForm(f => ({ ...f, description: e.target.value }))
                }
                value={form.description}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="area-owner"
              >
                {t('owner')}
              </label>
              <select
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="area-owner"
                onChange={e =>
                  setForm(f => ({ ...f, ownerId: e.target.value }))
                }
                value={form.ownerId}
              >
                <option value="">{t('owner')}...</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
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
              context: 'areas',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('prefix')}</th>
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">{t('description')}</th>
                  <th className="py-3 px-4 font-medium">{t('owner')}</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {areas.map(area => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={area.id}
                  >
                    <td className="py-3 px-4 font-mono font-medium">
                      {area.prefix}
                    </td>
                    <td className="py-3 px-4">{area.name}</td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400 truncate max-w-xs">
                      {area.description ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {area.ownerName ?? '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        {...devMarker({
                          context: 'areas',
                          name: 'table action',
                          value: 'edit',
                        })}
                        onClick={() => handleEdit(area)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        {...devMarker({
                          context: 'areas',
                          name: 'table action',
                          value: 'delete',
                        })}
                        onClick={e =>
                          handleDelete(area.id, e.currentTarget as HTMLElement)
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
