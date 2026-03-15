'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'

interface Owner {
  email: string
  firstName: string
  id: number
  lastName: string
}

export default function OmradesagareClient() {
  const t = useTranslations('ownerMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')

  const [items, setItems] = useState<Owner[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
  })

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/owners/all')
      if (res.ok)
        setItems(((await res.json()) as { owners?: Owner[] }).owners ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const method = editId ? 'PUT' : 'POST'
      const url = editId ? `/api/owners/${editId}` : '/api/owners'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setShowForm(false)
        setEditId(null)
        setForm({ firstName: '', lastName: '', email: '' })
        fetchItems()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (item: Owner) => {
    setEditId(item.id)
    setForm({
      firstName: item.firstName,
      lastName: item.lastName,
      email: item.email,
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
    await fetch(`/api/owners/${id}`, { method: 'DELETE' })
    fetchItems()
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('areaOwners')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setForm({ firstName: '', lastName: '', email: '' })
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
                htmlFor="owner-first-name"
              >
                {t('firstName')} *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="owner-first-name"
                onChange={e =>
                  setForm(f => ({ ...f, firstName: e.target.value }))
                }
                required
                value={form.firstName}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="owner-last-name"
              >
                {t('lastName')} *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="owner-last-name"
                onChange={e =>
                  setForm(f => ({ ...f, lastName: e.target.value }))
                }
                required
                value={form.lastName}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="owner-email"
              >
                {t('email')} *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="owner-email"
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                required
                type="email"
                value={form.email}
              />
            </div>
            <div className="flex gap-3">
              <button
                className="btn-primary"
                disabled={submitting}
                type="submit"
              >
                {submitting ? tc('loading') : tc('save')}
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
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                    <th className="py-3 px-4 font-medium">{t('name')}</th>
                    <th className="py-3 px-4 font-medium">{t('email')}</th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr
                      className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                      key={item.id}
                    >
                      <td className="py-3 px-4 font-medium">
                        {item.firstName} {item.lastName}
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {item.email}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                          onClick={() => handleEdit(item)}
                          type="button"
                        >
                          {tc('edit')}
                        </button>
                        <button
                          className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                          onClick={e =>
                            handleDelete(
                              item.id,
                              e.currentTarget as HTMLElement,
                            )
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
          </div>
        )}
      </div>
    </div>
  )
}
