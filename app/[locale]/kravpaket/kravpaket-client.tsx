'use client'

import { HelpCircle, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmModal } from '@/components/ConfirmModal'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { generatePackageSlug, normalizeSlugInput } from '@/lib/slug'

interface TaxonomyItem {
  id: number
  nameEn: string
  nameSv: string
}

interface RequirementArea {
  id: number
  name: string
}

interface Package {
  businessNeedsReference: string | null
  id: number
  implementationType: TaxonomyItem | null
  itemCount: number
  name: string
  packageImplementationTypeId: number | null
  packageResponsibilityAreaId: number | null
  requirementAreas: RequirementArea[]
  responsibilityArea: TaxonomyItem | null
  uniqueId: string
}

export default function KravpaketClient() {
  const t = useTranslations('package')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()

  const getName = (pkg: Package) => pkg.name
  const getTaxonomyName = (item: TaxonomyItem | null) =>
    item ? (locale === 'sv' ? item.nameSv : item.nameEn) : '—'
  const packageTableColumnCount = 6

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
  const fetchIdRef = useRef(0)
  const isMountedRef = useRef(true)
  const [showForm, setShowForm] = useState(false)
  const [editPkg, setEditPkg] = useState<Package | null>(null)
  const [slugEdited, setSlugEdited] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [openHelp, setOpenHelp] = useState<Set<string>>(() => new Set())
  const [slugError, setSlugError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    uniqueId: '',
    packageResponsibilityAreaId: '' as string,
    packageImplementationTypeId: '' as string,
    businessNeedsReference: '',
  })

  const resetForm = () => ({
    name: '',
    uniqueId: '',
    packageResponsibilityAreaId: '' as string,
    packageImplementationTypeId: '' as string,
    businessNeedsReference: '',
  })

  const toggleHelp = (field: string) => {
    setOpenHelp(prev => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const helpButton = (field: string, label: string) => (
    <button
      aria-controls={`help-${field}`}
      aria-expanded={openHelp.has(field)}
      aria-label={`${tc('help')}: ${label}`}
      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-secondary-400 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:hover:text-primary-400"
      onClick={() => toggleHelp(field)}
      type="button"
    >
      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  )

  const helpPanel = (helpKey: string, field: string) =>
    openHelp.has(field) && (
      <p
        className="mt-1 mb-2 whitespace-pre-line rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2 text-xs text-secondary-500 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-400"
        id={`help-${field}`}
      >
        {t(helpKey)}
      </p>
    )

  const fetchPackages = useCallback(async () => {
    const localFetchId = ++fetchIdRef.current
    setLoading(true)
    if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current)
    spinnerTimerRef.current = setTimeout(() => {
      if (isMountedRef.current && localFetchId === fetchIdRef.current) {
        setShowSpinner(true)
      }
    }, 200)
    try {
      const res = await fetch('/api/requirement-packages')
      if (res.ok && isMountedRef.current && localFetchId === fetchIdRef.current)
        setPackages(
          ((await res.json()) as { packages?: Package[] }).packages ?? [],
        )
    } finally {
      if (localFetchId === fetchIdRef.current) {
        if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current)
        spinnerTimerRef.current = null
        if (isMountedRef.current) {
          setShowSpinner(false)
          setLoading(false)
        }
      }
    }
  }, [])

  const fetchTaxonomies = useCallback(async () => {
    const [areasRes, typesRes] = await Promise.all([
      fetch('/api/package-responsibility-areas'),
      fetch('/api/package-implementation-types'),
    ])
    if (areasRes.ok && isMountedRef.current)
      setResponsibilityAreas(
        ((await areasRes.json()) as { areas?: TaxonomyItem[] }).areas ?? [],
      )
    if (typesRes.ok && isMountedRef.current)
      setImplementationTypes(
        ((await typesRes.json()) as { types?: TaxonomyItem[] }).types ?? [],
      )
  }, [])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current)
        spinnerTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    fetchPackages()
    fetchTaxonomies()
  }, [fetchPackages, fetchTaxonomies])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setSlugError(null)
    try {
      const method = editPkg ? 'PUT' : 'POST'
      const url = editPkg
        ? `/api/requirement-packages/${editPkg.uniqueId}`
        : '/api/requirement-packages'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniqueId: form.uniqueId,
          name: form.name,
          packageResponsibilityAreaId: form.packageResponsibilityAreaId
            ? Number(form.packageResponsibilityAreaId)
            : null,
          packageImplementationTypeId: form.packageImplementationTypeId
            ? Number(form.packageImplementationTypeId)
            : null,
          businessNeedsReference: form.businessNeedsReference || null,
        }),
      })
      if (res.status === 409) {
        setSlugError(t('uniqueIdTaken'))
        return
      }
      if (!res.ok) return
      setShowForm(false)
      setEditPkg(null)
      setOpenHelp(new Set())
      setSlugEdited(false)
      setForm(resetForm())
      fetchPackages()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (pkg: Package) => {
    setEditPkg(pkg)
    setOpenHelp(new Set())
    setSlugEdited(true)
    setSlugError(null)
    setForm({
      name: pkg.name,
      uniqueId: pkg.uniqueId,
      packageResponsibilityAreaId:
        pkg.packageResponsibilityAreaId?.toString() ?? '',
      packageImplementationTypeId:
        pkg.packageImplementationTypeId?.toString() ?? '',
      businessNeedsReference: pkg.businessNeedsReference ?? '',
    })
    setShowForm(true)
  }

  const { confirm } = useConfirmModal()

  const handleDelete = async (pkg: Package, anchorEl?: HTMLElement) => {
    if (
      !(await confirm({
        message: tc('confirm'),
        variant: 'danger',
        icon: 'caution',
        anchorEl,
      }))
    )
      return

    try {
      const res = await fetch(`/api/requirement-packages/${pkg.uniqueId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const details = (await res.text()).trim()
        await confirm({
          anchorEl,
          confirmText: tc('confirm'),
          icon: 'caution',
          message: details || tc('error'),
          showCancel: false,
          title: tc('error'),
          variant: 'danger',
        })
        return
      }

      await fetchPackages()
    } catch (error) {
      await confirm({
        anchorEl,
        confirmText: tc('confirm'),
        icon: 'caution',
        message: error instanceof Error ? error.message : tc('error'),
        showCancel: false,
        title: tc('error'),
        variant: 'danger',
      })
    }
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
              setEditPkg(null)
              setOpenHelp(new Set())
              setSlugEdited(false)
              setSlugError(null)
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
              value: editPkg ? 'edit' : 'create',
            })}
            onSubmit={handleSubmit}
          >
            <h2 className="text-lg font-semibold">
              {editPkg ? t('editPackage') : t('newPackage')}
            </h2>
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="block text-sm font-medium" htmlFor="pkg-name">
                  {t('name')} *
                </label>
                {helpButton('pkg-name', t('name'))}
              </div>
              {helpPanel('nameHelp', 'pkg-name')}
              <input
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200"
                id="pkg-name"
                onBlur={() => {
                  if (!slugEdited && form.name) {
                    const nextUniqueId = generatePackageSlug(form.name)
                    if (!nextUniqueId) {
                      setSlugError(t('uniqueIdGenerationFailed'))
                      return
                    }
                    if (form.uniqueId !== nextUniqueId) {
                      setSlugError(null)
                      setForm(f => ({
                        ...f,
                        uniqueId: nextUniqueId,
                      }))
                    }
                  }
                }}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                value={form.name}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label
                  className="block text-sm font-medium"
                  htmlFor="pkg-unique-id"
                >
                  {t('uniqueId')} *
                </label>
                {helpButton('pkg-unique-id', t('uniqueId'))}
              </div>
              {helpPanel('uniqueIdHelp', 'pkg-unique-id')}
              <input
                aria-describedby={slugError ? 'pkg-unique-id-error' : undefined}
                aria-invalid={!!slugError}
                className={`w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200${slugError ? ' border-red-500 focus:ring-red-400/50' : ''}`}
                id="pkg-unique-id"
                onChange={e => {
                  setSlugEdited(true)
                  setSlugError(null)
                  setForm(f => ({
                    ...f,
                    uniqueId: normalizeSlugInput(e.target.value),
                  }))
                }}
                onInvalid={() => setSlugError(t('uniqueIdRequired'))}
                placeholder={t('uniqueIdPlaceholder')}
                required
                value={form.uniqueId}
              />
              {slugError ? (
                <p
                  className="mt-1 text-xs text-red-600 dark:text-red-400"
                  id="pkg-unique-id-error"
                  role="alert"
                >
                  {slugError}
                </p>
              ) : (
                <p className="mt-1 text-xs text-secondary-500 dark:text-secondary-400">
                  {t('uniqueIdHelp')}
                </p>
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label className="block text-sm font-medium" htmlFor="pkg-area">
                  {t('responsibilityArea')}
                </label>
                {helpButton('pkg-area', t('responsibilityArea'))}
              </div>
              {helpPanel('responsibilityAreaHelp', 'pkg-area')}
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
              <div className="mb-1 flex items-center gap-1.5">
                <label
                  className="block text-sm font-medium"
                  htmlFor="pkg-impl-type"
                >
                  {t('implementationType')}
                </label>
                {helpButton('pkg-impl-type', t('implementationType'))}
              </div>
              {helpPanel('implementationTypeHelp', 'pkg-impl-type')}
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
                {implementationTypes.map(it => (
                  <option key={it.id} value={it.id}>
                    {locale === 'sv' ? it.nameSv : it.nameEn}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1.5">
                <label
                  className="block text-sm font-medium"
                  htmlFor="pkg-business-ref"
                >
                  {t('businessNeedsReference')}
                </label>
                {helpButton('pkg-business-ref', t('businessNeedsReference'))}
              </div>
              {helpPanel('businessNeedsReferenceHelp', 'pkg-business-ref')}
              <textarea
                className="w-full rounded-xl border bg-white dark:bg-secondary-800/50 py-2.5 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400/50 focus:border-primary-500 transition-all duration-200 resize-none"
                id="pkg-business-ref"
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    businessNeedsReference: e.target.value,
                  }))
                }
                placeholder={t('businessNeedsReferencePlaceholder')}
                rows={2}
                value={form.businessNeedsReference}
              />
            </div>
            <div className="flex gap-3">
              <button
                className="btn-primary"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? tc('saving') : tc('save')}
              </button>
              <button
                className="px-4 py-2.5 rounded-xl border text-sm min-h-11 min-w-11 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 transition-all duration-200"
                disabled={isSubmitting}
                onClick={() => {
                  if (isSubmitting) return
                  setOpenHelp(new Set())
                  setShowForm(false)
                }}
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
            <div className="overflow-x-auto">
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
                    <th className="py-3 px-4 font-medium">{t('itemCount')}</th>
                    <th className="py-3 px-4 font-medium">
                      {t('requirementAreas')}
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
                      <td className="py-3 px-4 font-medium">
                        <Link
                          className="text-primary-700 dark:text-primary-300 hover:underline"
                          href={`/kravpaket/${pkg.uniqueId}`}
                        >
                          {getName(pkg)}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(pkg.responsibilityArea)}
                      </td>
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(pkg.implementationType)}
                      </td>
                      <td className="py-3 px-4">
                        {pkg.itemCount > 0 ? (
                          <Link
                            className="text-primary-700 dark:text-primary-300 hover:underline font-medium"
                            href={`/kravpaket/${pkg.uniqueId}`}
                          >
                            {pkg.itemCount}
                          </Link>
                        ) : (
                          <span className="text-secondary-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {pkg.requirementAreas.map(area => (
                            <Link
                              className="inline-flex min-h-[44px] items-center rounded-full border border-primary-200 bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-primary-800/60 dark:bg-primary-950/30 dark:text-primary-300 dark:hover:bg-primary-900/40 dark:focus-visible:ring-offset-secondary-900"
                              href={`/kravpaket/${pkg.uniqueId}?areaId=${area.id}`}
                              key={area.id}
                            >
                              {area.name}
                            </Link>
                          ))}
                        </div>
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
                            handleDelete(pkg, e.currentTarget as HTMLElement)
                          }
                          type="button"
                        >
                          {tc('delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {packages.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                        colSpan={packageTableColumnCount}
                      >
                        {t('emptyState')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
