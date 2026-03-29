'use client'

import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { devMarker } from '@/lib/developer-mode-markers'

interface TaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

interface Package {
  id: number
  implementationType: TaxonomyItem | null
  nameEn: string
  nameSv: string
  packageImplementationTypeId: number | null
  packageResponsibilityAreaId: number | null
  responsibilityArea: TaxonomyItem | null
}

export default function KravpaketClient() {
  const t = useTranslations('package')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (pkg: Package) => (locale === 'sv' ? pkg.nameSv : pkg.nameEn)
  const getTaxonomyName = (item: TaxonomyItem | null) =>
    item ? (locale === 'sv' ? item.nameSv : item.nameEn) : '—'

  const [packages, setPackages] = useState<Package[]>([])
  const [responsibilityAreas, setResponsibilityAreas] = useState<
    TaxonomyItem[]
  >([])
  const [implementationTypes, setImplementationTypes] = useState<
    TaxonomyItem[]
  >([])
  const [loading, setLoading] = useState(true)
  const [showSpinner, setShowSpinner] = useState(false)
  const spinnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({
    nameSv: '',
    nameEn: '',
    packageResponsibilityAreaId: '' as string,
    packageImplementationTypeId: '' as string,
  })

  const resetForm = () => ({
    nameSv: '',
    nameEn: '',
    packageResponsibilityAreaId: '' as string,
    packageImplementationTypeId: '' as string,
  })

  const fetchPackages = useCallback(async () => {
    setLoading(true)
    if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current)
    spinnerTimerRef.current = setTimeout(() => setShowSpinner(true), 200)
    const res = await fetch('/api/requirement-packages')
    if (res.ok)
      setPackages(
        ((await res.json()) as { packages?: Package[] }).packages ?? [],
      )
    if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current)
    setShowSpinner(false)
    setLoading(false)
  }, [])

  const fetchTaxonomies = useCallback(async () => {
    const [areasRes, typesRes] = await Promise.all([
      fetch('/api/package-responsibility-areas'),
      fetch('/api/package-implementation-types'),
    ])
    if (areasRes.ok)
      setResponsibilityAreas(
        ((await areasRes.json()) as { areas?: TaxonomyItem[] }).areas ?? [],
      )
    if (typesRes.ok)
      setImplementationTypes(
        ((await typesRes.json()) as { types?: TaxonomyItem[] }).types ?? [],
      )
  }, [])

  useEffect(() => {
    fetchPackages()
    fetchTaxonomies()
  }, [fetchPackages, fetchTaxonomies])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const method = editId ? 'PUT' : 'POST'
    const url = editId
      ? `/api/requirement-packages/${editId}`
      : '/api/requirement-packages'
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nameSv: form.nameSv,
        nameEn: form.nameEn,
        packageResponsibilityAreaId: form.packageResponsibilityAreaId
          ? Number(form.packageResponsibilityAreaId)
          : null,
        packageImplementationTypeId: form.packageImplementationTypeId
          ? Number(form.packageImplementationTypeId)
          : null,
      }),
    })
    setShowForm(false)
    setEditId(null)
    setForm(resetForm())
    fetchPackages()
  }

  const handleEdit = (pkg: Package) => {
    setEditId(pkg.id)
    setForm({
      nameSv: pkg.nameSv,
      nameEn: pkg.nameEn,
      packageResponsibilityAreaId:
        pkg.packageResponsibilityAreaId?.toString() ?? '',
      packageImplementationTypeId:
        pkg.packageImplementationTypeId?.toString() ?? '',
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
    await fetch(`/api/requirement-packages/${id}`, { method: 'DELETE' })
    fetchPackages()
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('packages')}
          </h1>
          <button
            className="btn-primary inline-flex items-center gap-1.5"
            {...devMarker({
              context: 'packages',
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
            {t('newPackage')}
          </button>
        </div>

        {showForm && (
          <form
            className="glass rounded-2xl p-6 mb-6 space-y-5 max-w-lg animate-fade-in-up"
            {...devMarker({
              context: 'packages',
              name: 'crud form',
              priority: 340,
              value: editId ? 'edit' : 'create',
            })}
            onSubmit={handleSubmit}
          >
            <h2 className="text-lg font-semibold">
              {editId ? t('editPackage') : t('newPackage')}
            </h2>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="pkg-name-sv"
              >
                {t('name')} (SV) *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="pkg-name-sv"
                onChange={e => setForm(f => ({ ...f, nameSv: e.target.value }))}
                required
                value={form.nameSv}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="pkg-name-en"
              >
                {t('name')} (EN) *
              </label>
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="pkg-name-en"
                onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                required
                value={form.nameEn}
              />
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="pkg-area"
              >
                {t('responsibilityArea')}
              </label>
              <select
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="pkg-area"
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    packageResponsibilityAreaId: e.target.value,
                  }))
                }
                value={form.packageResponsibilityAreaId}
              >
                <option value="">—</option>
                {responsibilityAreas.map(a => (
                  <option key={a.id} value={a.id}>
                    {locale === 'sv' ? a.nameSv : a.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="block text-sm font-medium mb-1"
                htmlFor="pkg-impl-type"
              >
                {t('implementationType')}
              </label>
              <select
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="pkg-impl-type"
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    packageImplementationTypeId: e.target.value,
                  }))
                }
                value={form.packageImplementationTypeId}
              >
                <option value="">—</option>
                {implementationTypes.map(t => (
                  <option key={t.id} value={t.id}>
                    {locale === 'sv' ? t.nameSv : t.nameEn}
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

        {showSpinner && (
          <div
            aria-live="polite"
            className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-16"
            data-testid="kravpaket-loading"
          >
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
            <p className="text-secondary-600 dark:text-secondary-400">
              {tc('loading')}
            </p>
          </div>
        )}
        {!loading && (
          <div
            className="bg-white/80 dark:bg-secondary-900/60 backdrop-blur-sm rounded-2xl border shadow-sm overflow-hidden"
            {...devMarker({
              context: 'packages',
              name: 'crud table',
              priority: 340,
            })}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary-50/80 dark:bg-secondary-800/30 text-left text-secondary-700 dark:text-secondary-300">
                  <th className="py-3 px-4 font-medium">{t('name')}</th>
                  <th className="py-3 px-4 font-medium">
                    {t('responsibilityArea')}
                  </th>
                  <th className="py-3 px-4 font-medium">
                    {t('implementationType')}
                  </th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {packages.map(pkg => (
                  <tr
                    className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                    key={pkg.id}
                  >
                    <td className="py-3 px-4 font-medium">{getName(pkg)}</td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {getTaxonomyName(pkg.responsibilityArea)}
                    </td>
                    <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                      {getTaxonomyName(pkg.implementationType)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        className="text-sm text-primary-700 dark:text-primary-300 hover:underline mr-3 min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        {...devMarker({
                          context: 'packages',
                          name: 'table action',
                          value: 'edit',
                        })}
                        onClick={() => handleEdit(pkg)}
                        type="button"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        className="text-sm text-red-700 dark:text-red-400 hover:underline min-h-11 min-w-11 inline-flex items-center focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 rounded"
                        {...devMarker({
                          context: 'packages',
                          name: 'table action',
                          value: 'delete',
                        })}
                        onClick={e =>
                          handleDelete(pkg.id, e.currentTarget as HTMLElement)
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
