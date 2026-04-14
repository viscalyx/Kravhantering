'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { HelpCircle, Plus, Search, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'
import AnimatedHelpPanel from '@/components/AnimatedHelpPanel'
import { useConfirmModal } from '@/components/ConfirmModal'
import { type HelpContent, useHelpContent } from '@/components/HelpPanel'
import { Link } from '@/i18n/routing'
import { devMarker } from '@/lib/developer-mode-markers'
import { generatePackageSlug, normalizeSlugInput } from '@/lib/slug'

const REQUIREMENT_PACKAGES_HELP: HelpContent = {
  sections: [
    {
      kind: 'text',
      bodyKey: 'requirementPackages.overview.body',
      headingKey: 'requirementPackages.overview.heading',
    },
    {
      kind: 'text',
      bodyKey: 'requirementPackages.create.body',
      headingKey: 'requirementPackages.create.heading',
    },
  ],
  titleKey: 'requirementPackages.title',
}

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
  lifecycleStatus: TaxonomyItem | null
  name: string
  packageImplementationTypeId: number | null
  packageLifecycleStatusId: number | null
  packageResponsibilityAreaId: number | null
  requirementAreas: RequirementArea[]
  responsibilityArea: TaxonomyItem | null
  uniqueId: string
}

function getResponseMessage(body: unknown): string | null {
  if (typeof body === 'string') {
    const trimmed = body.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (body && typeof body === 'object') {
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string' && error.trim().length > 0) {
      return error.trim()
    }

    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim()
    }
  }

  return null
}

async function readResponseMessage(res: Response): Promise<string | null> {
  const contentType = res.headers?.get?.('content-type')?.toLowerCase() ?? ''

  if (contentType.includes('application/json')) {
    return getResponseMessage(await res.json().catch(() => null))
  }

  const text = (await res.text().catch(() => '')).trim()
  if (text.length > 0) {
    try {
      return getResponseMessage(JSON.parse(text)) ?? text
    } catch {
      return text
    }
  }

  return getResponseMessage(await res.json().catch(() => null))
}

export default function RequirementPackagesClient() {
  useHelpContent(REQUIREMENT_PACKAGES_HELP)
  const t = useTranslations('package')
  const tn = useTranslations('nav')
  const tc = useTranslations('common')
  const locale = useLocale()
  const tRef = useRef(t)
  tRef.current = t

  const getName = (pkg: Package) => pkg.name
  const getTaxonomyName = (item: TaxonomyItem | null) =>
    item ? (locale === 'sv' ? item.nameSv : item.nameEn) : '—'
  const packageTableColumnCount = 7

  const [packages, setPackages] = useState<Package[]>([])
  const [responsibilityAreas, setResponsibilityAreas] = useState<
    TaxonomyItem[]
  >([])
  const [implementationTypes, setImplementationTypes] = useState<
    TaxonomyItem[]
  >([])
  const [lifecycleStatuses, setLifecycleStatuses] = useState<TaxonomyItem[]>([])
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
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [form, setForm] = useState({
    name: '',
    uniqueId: '',
    packageResponsibilityAreaId: '' as string,
    packageImplementationTypeId: '' as string,
    packageLifecycleStatusId: '' as string,
    businessNeedsReference: '',
  })
  const deferredNameFilter = useDeferredValue(nameFilter)
  const normalizedNameFilter = deferredNameFilter
    .trim()
    .toLocaleLowerCase(locale)
  const hasActiveNameFilter = nameFilter.trim().length > 0
  const filteredPackages = packages.filter(pkg =>
    getName(pkg).toLocaleLowerCase(locale).includes(normalizedNameFilter),
  )

  const resetForm = () => ({
    name: '',
    uniqueId: '',
    packageResponsibilityAreaId: '' as string,
    packageImplementationTypeId: '' as string,
    packageLifecycleStatusId: '' as string,
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

  const helpPanel = (helpKey: string, field: string) => (
    <AnimatedHelpPanel id={`help-${field}`} isOpen={openHelp.has(field)}>
      {t(helpKey)}
    </AnimatedHelpPanel>
  )

  const fetchPackages = useCallback(async () => {
    const localFetchId = ++fetchIdRef.current
    setLoading(true)
    setFetchError(null)
    if (spinnerTimerRef.current) clearTimeout(spinnerTimerRef.current)
    spinnerTimerRef.current = setTimeout(() => {
      if (isMountedRef.current && localFetchId === fetchIdRef.current) {
        setShowSpinner(true)
      }
    }, 200)
    try {
      const res = await fetch('/api/requirement-packages')
      if (!res.ok) {
        const details = await readResponseMessage(res)
        throw new Error(
          details
            ? `${tRef.current('loadPackagesFailed')}: ${details}`
            : tRef.current('loadPackagesFailed'),
        )
      }

      if (isMountedRef.current && localFetchId === fetchIdRef.current) {
        setPackages(
          ((await res.json()) as { packages?: Package[] }).packages ?? [],
        )
        setFetchError(null)
      }
    } catch (error) {
      console.error('Failed to load requirement packages', error)
      if (isMountedRef.current && localFetchId === fetchIdRef.current) {
        setPackages([])
        setFetchError(
          error instanceof Error
            ? error.message
            : tRef.current('loadPackagesFailed'),
        )
      }
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
    const [areasRes, typesRes, statusesRes] = await Promise.all([
      fetch('/api/package-responsibility-areas'),
      fetch('/api/package-implementation-types'),
      fetch('/api/package-lifecycle-statuses'),
    ])
    if (areasRes.ok && isMountedRef.current)
      setResponsibilityAreas(
        ((await areasRes.json()) as { areas?: TaxonomyItem[] }).areas ?? [],
      )
    if (typesRes.ok && isMountedRef.current)
      setImplementationTypes(
        ((await typesRes.json()) as { types?: TaxonomyItem[] }).types ?? [],
      )
    if (statusesRes.ok && isMountedRef.current)
      setLifecycleStatuses(
        ((await statusesRes.json()) as { statuses?: TaxonomyItem[] })
          .statuses ?? [],
      )
  }, [])

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      if (spinnerTimerRef.current) {
        clearTimeout(spinnerTimerRef.current)
        spinnerTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    void fetchPackages()
    void fetchTaxonomies()
  }, [fetchPackages, fetchTaxonomies])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    setIsSubmitting(true)
    setSlugError(null)
    setSaveError(null)
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
          packageLifecycleStatusId: form.packageLifecycleStatusId
            ? Number(form.packageLifecycleStatusId)
            : null,
          businessNeedsReference: form.businessNeedsReference || null,
        }),
      })
      if (res.status === 409) {
        setSlugError(t('uniqueIdTaken'))
        return
      }
      if (!res.ok) {
        const details = await readResponseMessage(res)
        setSaveError(
          details ? `${t('saveFailed')}: ${details}` : t('saveFailed'),
        )
        return
      }
      setShowForm(false)
      setEditPkg(null)
      setOpenHelp(new Set())
      setSlugEdited(false)
      setForm(resetForm())
      fetchPackages()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('saveFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (pkg: Package) => {
    setEditPkg(pkg)
    setOpenHelp(new Set())
    setSlugEdited(true)
    setSlugError(null)
    setSaveError(null)
    setForm({
      name: pkg.name,
      uniqueId: pkg.uniqueId,
      packageResponsibilityAreaId:
        pkg.packageResponsibilityAreaId?.toString() ?? '',
      packageImplementationTypeId:
        pkg.packageImplementationTypeId?.toString() ?? '',
      packageLifecycleStatusId: pkg.packageLifecycleStatusId?.toString() ?? '',
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

  const openCreateForm = () => {
    setShowForm(true)
    setEditPkg(null)
    setOpenHelp(new Set())
    setSlugEdited(false)
    setSlugError(null)
    setSaveError(null)
    setForm(resetForm())
  }

  return (
    <div className="section-padding px-4 sm:px-6 lg:px-8">
      <div className="container-custom">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-secondary-100">
            {tn('packages')}
          </h1>
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
                  <label
                    className="block text-sm font-medium"
                    htmlFor="pkg-name"
                  >
                    {t('name')} *
                  </label>
                  {helpButton('pkg-name', t('name'))}
                </div>
                {helpPanel('nameHelp', 'pkg-name')}
                <input
                  className="min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
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
                  aria-describedby={
                    slugError ? 'pkg-unique-id-error' : undefined
                  }
                  aria-invalid={!!slugError}
                  className={`min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-mono transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50${slugError ? ' border-red-500 focus:ring-red-400/50' : ''}`}
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
                  <label
                    className="block text-sm font-medium"
                    htmlFor="pkg-area"
                  >
                    {t('responsibilityArea')}
                  </label>
                  {helpButton('pkg-area', t('responsibilityArea'))}
                </div>
                {helpPanel('responsibilityAreaHelp', 'pkg-area')}
                <select
                  className="min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
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
                  className="min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
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
                    htmlFor="pkg-lifecycle-status"
                  >
                    {t('lifecycleStatus')}
                  </label>
                  {helpButton('pkg-lifecycle-status', t('lifecycleStatus'))}
                </div>
                {helpPanel('lifecycleStatusHelp', 'pkg-lifecycle-status')}
                <select
                  className="min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
                  id="pkg-lifecycle-status"
                  onChange={e =>
                    setForm(f => ({
                      ...f,
                      packageLifecycleStatusId: e.target.value,
                    }))
                  }
                  value={form.packageLifecycleStatusId}
                >
                  <option value="">—</option>
                  {lifecycleStatuses.map(ls => (
                    <option key={ls.id} value={ls.id}>
                      {locale === 'sv' ? ls.nameSv : ls.nameEn}
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
                  className="min-h-[44px] w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:bg-secondary-800/50"
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
              {saveError && (
                <p
                  className="text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {saveError}
                </p>
              )}
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
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          {!loading && packages.length > 0 && (
            <div className="w-full max-w-lg">
              <label
                className="mb-1.5 block text-sm font-medium text-secondary-700 dark:text-secondary-300"
                htmlFor="package-name-filter"
              >
                {t('filterByName')}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-400"
                  />
                  <input
                    autoComplete="off"
                    className="min-h-[44px] w-full rounded-xl border border-secondary-200 bg-white py-2.5 pr-3 pl-10 text-sm text-secondary-900 transition-all duration-200 placeholder:text-secondary-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400/50 dark:border-secondary-700 dark:bg-secondary-800/50 dark:text-secondary-100 dark:placeholder:text-secondary-500"
                    {...devMarker({
                      context: 'packages',
                      name: 'text field',
                      priority: 330,
                      value: 'name filter',
                    })}
                    id="package-name-filter"
                    onChange={e => setNameFilter(e.target.value)}
                    placeholder={t('filterByNamePlaceholder')}
                    type="text"
                    value={nameFilter}
                  />
                </div>
                {hasActiveNameFilter && (
                  <button
                    className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-secondary-200 px-4 py-2.5 text-sm text-secondary-700 transition-all duration-200 hover:bg-secondary-50 focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:ring-offset-2 dark:border-secondary-700 dark:text-secondary-200 dark:hover:bg-secondary-800/60"
                    onClick={() => setNameFilter('')}
                    type="button"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                    {tc('clearSearch')}
                  </button>
                )}
              </div>
            </div>
          )}

          <button
            className="btn-primary inline-flex items-center gap-1.5 justify-self-start lg:col-start-2 lg:justify-self-end"
            {...devMarker({
              context: 'packages',
              name: 'create button',
              priority: 350,
            })}
            onClick={openCreateForm}
            type="button"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {t('newPackage')}
          </button>
        </div>

        {showSpinner && (
          <div
            aria-live="polite"
            className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 py-16"
            data-testid="requirement-packages-loading"
            role="status"
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
                    <th className="py-3 px-4 font-medium">
                      {t('lifecycleStatus')}
                    </th>
                    <th className="py-3 px-4 font-medium">{t('itemCount')}</th>
                    <th className="py-3 px-4 font-medium">
                      {t('requirementAreas')}
                    </th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.map(pkg => (
                    <tr
                      className="border-b hover:bg-primary-50/40 dark:hover:bg-primary-950/20 transition-colors"
                      key={pkg.id}
                    >
                      <td className="py-3 px-4 font-medium">
                        <Link
                          className="text-primary-700 dark:text-primary-300 hover:underline"
                          href={`/requirement-packages/${pkg.uniqueId}`}
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
                      <td className="py-3 px-4 text-secondary-600 dark:text-secondary-400">
                        {getTaxonomyName(pkg.lifecycleStatus)}
                      </td>
                      <td className="py-3 px-4">
                        {pkg.itemCount > 0 ? (
                          <Link
                            className="text-primary-700 dark:text-primary-300 hover:underline font-medium"
                            href={`/requirement-packages/${pkg.uniqueId}`}
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
                              href={`/requirement-packages/${pkg.uniqueId}?areaId=${area.id}`}
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
                  {fetchError ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center"
                        colSpan={packageTableColumnCount}
                      >
                        <p
                          className="text-sm text-red-600 dark:text-red-400"
                          role="alert"
                        >
                          {fetchError}
                        </p>
                      </td>
                    </tr>
                  ) : packages.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                        colSpan={packageTableColumnCount}
                      >
                        {t('emptyState')}
                      </td>
                    </tr>
                  ) : packages.length > 0 && filteredPackages.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-10 text-center text-secondary-500 dark:text-secondary-400"
                        colSpan={packageTableColumnCount}
                      >
                        {tc('noResults')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
