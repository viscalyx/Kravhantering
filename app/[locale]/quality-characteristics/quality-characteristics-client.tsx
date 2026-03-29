'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { devMarker } from '@/lib/developer-mode-markers'

interface TypeCategory {
  id: number
  nameEn: string
  nameSv: string
  parentId: number | null
  requirementTypeId: number
}

interface Type {
  id: number
  nameEn: string
  nameSv: string
}

export default function QualityCharacteristicsClient() {
  const t = useTranslations('qualityCharacteristicMgmt')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const [types, setTypes] = useState<Type[]>([])
  const [categories, setCategories] = useState<TypeCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    nameSv: '',
    nameEn: '',
    requirementTypeId: '' as string,
    parentId: '' as string,
  })

  const resetForm = () => ({
    nameSv: '',
    nameEn: '',
    requirementTypeId: '' as string,
    parentId: '' as string,
  })

  const getName = (cat: TypeCategory) =>
    locale === 'sv' ? cat.nameSv : cat.nameEn
  const getTypeName = (type: Type) =>
    locale === 'sv' ? type.nameSv : type.nameEn

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [typesRes, catRes] = await Promise.all([
        fetch('/api/requirement-types'),
        fetch('/api/quality-characteristics'),
      ])
      if (typesRes.ok)
        setTypes(((await typesRes.json()) as { types?: Type[] }).types ?? [])
      if (catRes.ok)
        setCategories(
          ((await catRes.json()) as { qualityCharacteristics?: TypeCategory[] })
            .qualityCharacteristics ?? [],
        )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const { confirm } = useConfirmModal()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    const method = editId ? 'PUT' : 'POST'
    const url = editId
      ? `/api/quality-characteristics/${editId}`
      : '/api/quality-characteristics'
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameSv: form.nameSv,
          nameEn: form.nameEn,
          requirementTypeId: Number(form.requirementTypeId),
          parentId: form.parentId ? Number(form.parentId) : null,
        }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        await confirm({
          message: data.error ?? tc('error'),
          showCancel: false,
          icon: 'warning',
        })
        return
      }
      setShowForm(false)
      setEditId(null)
      setForm(resetForm())
      fetchData()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (cat: TypeCategory) => {
    setEditId(cat.id)
    setForm({
      nameSv: cat.nameSv,
      nameEn: cat.nameEn,
      requirementTypeId: cat.requirementTypeId.toString(),
      parentId: cat.parentId?.toString() ?? '',
    })
    setShowForm(true)
  }

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
    const res = await fetch(`/api/quality-characteristics/${id}`, {
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
    fetchData()
  }

  const parentOptions = categories.filter(
    c =>
      c.parentId === null &&
      c.id !== editId &&
      (form.requirementTypeId
        ? c.requirementTypeId === Number(form.requirementTypeId)
        : true),
  )

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('qualityCharacteristics')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'quality characteristics',
              name: 'create button',
              priority: 350,
            })}
            onClick={() => {
              setShowForm(true)
              setEditId(null)
              setForm(resetForm())
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {tc('create')}
          </button>
        </div>
        <p className="text-secondary-600 dark:text-secondary-400 text-sm mb-6">
          {t('subtitle')}
        </p>

        {showForm && (
          <form
            className="glass rounded-2xl p-6 mb-6 space-y-5 max-w-lg animate-fade-in-up"
            {...devMarker({
              context: 'quality characteristics',
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
                htmlFor="qc-name-sv"
              >
                {t('name')} (SV) *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="qc-name-sv"
                onChange={e => setForm(f => ({ ...f, nameSv: e.target.value }))}
                required
                value={form.nameSv}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="qc-name-en"
              >
                {t('name')} (EN) *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="qc-name-en"
                onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                required
                value={form.nameEn}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="qc-type"
              >
                {t('type')} *
              </label>
              <select
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="qc-type"
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    requirementTypeId: e.target.value,
                    parentId: '',
                  }))
                }
                required
                value={form.requirementTypeId}
              >
                <option value="">—</option>
                {types.map(tp => (
                  <option key={tp.id} value={tp.id}>
                    {getTypeName(tp)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="qc-parent"
              >
                {t('parent')}
              </label>
              <select
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="qc-parent"
                onChange={e =>
                  setForm(f => ({ ...f, parentId: e.target.value }))
                }
                value={form.parentId}
              >
                <option value="">{t('topLevel')}</option>
                {parentOptions.map(p => (
                  <option key={p.id} value={p.id}>
                    {getName(p)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                className="btn-primary"
                disabled={isSubmitting}
                type="submit"
              >
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
            className="space-y-8"
            {...devMarker({
              context: 'quality characteristics',
              name: 'crud table',
              priority: 340,
            })}
          >
            {types.map(type => {
              const topLevel = categories.filter(
                c => c.requirementTypeId === type.id && !c.parentId,
              )
              return (
                <div key={type.id}>
                  <h2 className="text-lg font-semibold text-secondary-900 dark:text-secondary-100 mb-4">
                    {getTypeName(type)}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {topLevel.map(parent => {
                      const children = categories.filter(
                        c => c.parentId === parent.id,
                      )
                      return (
                        <div
                          className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm p-5 transition-all duration-200 hover:shadow-md"
                          key={parent.id}
                        >
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <h3 className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                              {getName(parent)}
                            </h3>
                            <span className="flex shrink-0 gap-1">
                              <button
                                className="text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                                {...devMarker({
                                  context: 'quality characteristics',
                                  name: 'table action',
                                  value: 'edit',
                                })}
                                onClick={() => handleEdit(parent)}
                                type="button"
                              >
                                <Pencil
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                <span className="sr-only">{tc('edit')}</span>
                              </button>
                              <button
                                className="text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                                {...devMarker({
                                  context: 'quality characteristics',
                                  name: 'table action',
                                  value: 'delete',
                                })}
                                onClick={e =>
                                  handleDelete(
                                    parent.id,
                                    e.currentTarget as HTMLElement,
                                  )
                                }
                                type="button"
                              >
                                <Trash2
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                <span className="sr-only">{tc('delete')}</span>
                              </button>
                            </span>
                          </div>
                          {children.length > 0 && (
                            <ul className="space-y-1">
                              {children.map(child => (
                                <li
                                  className="group text-sm text-secondary-700 dark:text-secondary-300 pl-3 border-l-2 border-primary-200 dark:border-primary-800 flex items-center justify-between gap-1"
                                  key={child.id}
                                >
                                  <span>{getName(child)}</span>
                                  <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                    <button
                                      className="text-primary-700 dark:text-primary-300 hover:text-primary-900 dark:hover:text-primary-100 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                                      {...devMarker({
                                        context: 'quality characteristics',
                                        name: 'table action',
                                        value: 'edit',
                                      })}
                                      onClick={() => handleEdit(child)}
                                      type="button"
                                    >
                                      <Pencil
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                      />
                                      <span className="sr-only">
                                        {tc('edit')}
                                      </span>
                                    </button>
                                    <button
                                      className="text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 min-h-11 min-w-11 inline-flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                                      {...devMarker({
                                        context: 'quality characteristics',
                                        name: 'table action',
                                        value: 'delete',
                                      })}
                                      onClick={e =>
                                        handleDelete(
                                          child.id,
                                          e.currentTarget as HTMLElement,
                                        )
                                      }
                                      type="button"
                                    >
                                      <Trash2
                                        aria-hidden="true"
                                        className="h-3 w-3"
                                      />
                                      <span className="sr-only">
                                        {tc('delete')}
                                      </span>
                                    </button>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
